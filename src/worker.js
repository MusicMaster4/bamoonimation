// Worker de render: desenha um intervalo de quadros e codifica seu próprio segmento com ffmpeg.

import { workerData, parentPort } from 'node:worker_threads';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Renderer } from './render.js';

// roda como processo filho (fork, padrão: escala melhor que threads) ou como worker thread
const job = workerData ?? JSON.parse(process.argv[2]);
const post = parentPort ? m => parentPort.postMessage(m) : m => process.send(m);
const { file, a0, a1, fps, scale, seg, codec, crf, preset } = job;
const root = (await import(pathToFileURL(file).href)).default;
const r = new Renderer(root, { scale, fps });

if (codec === 'png') {
  for (let f = a0; f < a1; f++) {
    const cv = r.image(f / fps, f);
    writeFileSync(path.join(seg, `frame_${String(f).padStart(6, '0')}.png`), cv.toBuffer('image/png'));
    post({ frame: f });
  }
} else {
  const venc =
    codec === 'webm'
      ? ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(crf + 12), '-row-mt', '1', '-pix_fmt', 'yuv420p']
      : codec === 'mov'
        ? ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le']
        : ['-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv420p', '-tune', 'animation'];
  const ff = spawn(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${r.W}x${r.H}`, '-r', String(fps), '-i', '-',
      ...venc, '-threads', '2', '-r', String(fps), seg],
    { stdio: ['pipe', 'ignore', 'pipe'] },
  );
  let err = '';
  ff.stderr.on('data', d => (err += d));
  const closed = once(ff, 'close');
  for (let f = a0; f < a1; f++) {
    const buf = r.pixels(f / fps, f);
    if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
    post({ frame: f });
  }
  ff.stdin.end();
  const [code] = await closed;
  if (code !== 0) throw new Error('ffmpeg falhou: ' + err);
}
post({ done: true });
if (!parentPort) process.disconnect?.();
