// Worker de render: fica vivo recebendo intervalos de quadros do processo principal e codifica cada intervalo
// num segmento próprio com ffmpeg. O principal pode ENCURTAR o intervalo em andamento ({ cut }) para passar o
// fim dele a um worker que ficou ocioso — assim nenhum worker fica parado esperando o mais lento terminar.
//
// Mensagens recebidas: { run: { a0, a1, seg } } · { cut: m } (responde { cutAck: novoFim }) · { stop: true }
// Mensagens enviadas:  { ready } · { frame: f } · { segDone: seg, a0, end } · { done, falhas }

import { workerData, parentPort } from 'node:worker_threads';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Renderer } from './render.js';

// roda como processo filho (fork, padrão: escala melhor que threads) ou como worker thread
const cfg = workerData ?? JSON.parse(process.argv[2]);
const post = parentPort ? m => parentPort.postMessage(m) : m => process.send(m);
const { file, fps, scale, codec, crf, preset } = cfg;

const jobs = [];
let st = null; // intervalo em andamento: { end, next } (end pode encolher com { cut })
let stopping = false;
let wake = null;
const onMsg = m => {
  if (m.run) jobs.push(m.run);
  else if (m.cut !== undefined) {
    // nunca corta o que já foi desenhado (st.next = próximo quadro a desenhar)
    if (st && st.end > m.cut) st.end = Math.max(m.cut, st.next);
    post({ cutAck: st ? st.end : null });
  } else if (m.stop) stopping = true;
  wake?.();
};
if (parentPort) parentPort.on('message', onMsg);
else process.on('message', onMsg);

const root = (await import(pathToFileURL(file).href)).default;
const r = new Renderer(root, { scale, fps });
const tick = () => new Promise(res => setImmediate(res)); // deixa as mensagens do principal entrarem

async function runJob(job) {
  st = { end: job.a1, next: job.a0 };
  if (codec === 'png') {
    for (const [f, buf] of r.quadros(job.a0, st)) {
      writeFileSync(path.join(job.seg, `frame_${String(f).padStart(6, '0')}.png`), r.canvasDe(buf).toBuffer('image/png'));
      post({ frame: f });
      await tick();
    }
    return;
  }
  const venc =
    codec === 'webm'
      ? ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(crf + 12), '-row-mt', '1', '-pix_fmt', 'yuv420p']
      : codec === 'mov'
        ? ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le']
        : ['-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv420p', '-tune', 'animation'];
  const ff = spawn(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${r.W}x${r.H}`, '-r', String(fps), '-i', '-',
      ...venc, '-threads', '2', '-r', String(fps), job.seg],
    { stdio: ['pipe', 'ignore', 'pipe'] },
  );
  let err = '';
  ff.stderr.on('data', d => (err += d));
  const closed = once(ff, 'close');
  for (const [f, buf] of r.quadros(job.a0, st)) {
    if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
    else await tick();
    post({ frame: f });
  }
  ff.stdin.end();
  const [code] = await closed;
  if (code !== 0) throw new Error('ffmpeg falhou: ' + err);
}

post({ ready: true });
for (;;) {
  if (!jobs.length) {
    if (stopping) break;
    await new Promise(res => (wake = res));
    wake = null;
    continue;
  }
  const job = jobs.shift();
  await runJob(job);
  const end = st.end;
  st = null;
  post({ segDone: job.seg, a0: job.a0, end });
}
post({ done: true, falhas: r.falhas ?? 0 });
if (parentPort) parentPort.close();
else process.disconnect?.();
