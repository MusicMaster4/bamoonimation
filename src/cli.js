// CLI: render (vídeo paralelo), still (quadro único), sheet (folha de contato), info, bench.

import { Worker } from 'node:worker_threads';
import { spawnSync, fork } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import canvas from '@napi-rs/canvas';
import { Renderer } from './render.js';
import { loadFonts } from './fonts.js';
import { checkFilm } from './check.js';

const { createCanvas } = canvas;

const HELP = `bamoo — animação 2D ilustrada para agentes de IA

Uso:
  bamoo render <cena.js> [-o out.mp4] [--fps 30] [--scale 1] [--from s] [--to s]
                         [--workers N] [--crf 18] [--preset medium] [--audio arquivo]
                         [--format mp4|webm|mov|gif|png]
  bamoo still  <cena.js> [-t 2.5 | -t 0,1.5,3] [--scale 0.5] [--grid] [--rig] [--layers] [--arcos] [--silhueta] [-o arquivo.png]
  bamoo sheet  <cena.js> [-n 12] [--cols 4] [--scale 0.25] [--from s] [--to s] [--grid] [--rig] [--layers] [--arcos] [--silhueta] [-o folha.jpg]
  bamoo check  <cena.js> [--fps 12] [--allow-text]   verifica camadas, texto, anatomia e princípios de animação
  bamoo new    <cena.js>                      cria uma cena a partir do modelo
  bamoo info   <cena.js>
  bamoo bench  <cena.js> [-n 12] [--scale 1]

Dicas:
  • Itere com "sheet" (1 imagem com 12 momentos) e "still --grid" (grade de coordenadas).
  • "check" antes do render; "--rig" mostra esqueletos, "--layers" tinge cada camada.
  • "--arcos" desenha as trilhas (±0.6 s) de mãos, pés e cabeça: confira arcos e espaçamento (slow in/out).
  • "--silhueta" é o teste de staging: a ação (plano focal) em preto chapado tem que se ler sozinha.
  • Os 12 princípios da animação já vêm aplicados pelo motor — veja docs/PRINCIPIOS.md.
  • Render final: "render --fps 60" (qualquer FPS; a cena é função contínua do tempo).
  • Arquivos de saída vão para ./out por padrão.`;

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (s.startsWith('--')) {
      const k = s.slice(2);
      const nx = argv[i + 1];
      if (nx === undefined || nx.startsWith('-') && isNaN(Number(nx))) a[k] = true;
      else a[k] = argv[++i];
    } else if (s.startsWith('-') && s.length === 2 && isNaN(Number(s))) {
      a[s.slice(1)] = argv[++i];
    } else a._.push(s);
  }
  return a;
}

async function loadScene(file) {
  const abs = path.resolve(file);
  if (!existsSync(abs)) throw new Error(`arquivo de cena não encontrado: ${abs}`);
  const mod = await import(pathToFileURL(abs).href);
  const root = mod.default;
  if (!root) throw new Error(`${file}: exporte a cena com "export default scene({...})" ou film([...])`);
  return root;
}

const outDir = () => {
  const d = path.resolve('out');
  mkdirSync(d, { recursive: true });
  return d;
};
const baseName = f => path.basename(f).replace(/\.(m?js)$/, '');
const num = (v, d) => (v === undefined || v === true ? d : Number(v));

function ffmpegOk() {
  const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  return r.status === 0;
}

let lastPct = -1;
function bar(done, total, t0) {
  const w = 30, f = done / total;
  if (!process.stdout.isTTY) {
    // sem terminal (ex.: agente de IA): poucas linhas curtas em vez de uma barra animada
    const pct = Math.floor(f * 4) * 25;
    if (pct !== lastPct && pct > 0) {
      lastPct = pct;
      console.log(`${pct}% (${done}/${total})`);
    }
    return;
  }
  const el = (Date.now() - t0) / 1000;
  const eta = f > 0 ? el / f - el : 0;
  const fps = done / Math.max(el, 0.001);
  process.stdout.write(`\r[${'█'.repeat(Math.round(f * w))}${'░'.repeat(w - Math.round(f * w))}] ${done}/${total}  ${fps.toFixed(1)} fps  eta ${eta.toFixed(0)}s   `);
}

async function cmdRender(file, a) {
  if (!ffmpegOk()) throw new Error('ffmpeg não encontrado no PATH (necessário para vídeo).');
  const root = await loadScene(file);
  const fps = num(a.fps, 30), scale = num(a.scale, 1);
  const r = new Renderer(root, { scale, fps });
  const from = num(a.from, 0), to = Math.min(num(a.to, r.dur), r.dur);
  const f0 = Math.round(from * fps), f1 = Math.round(to * fps);
  const total = f1 - f0;
  if (total <= 0) throw new Error('intervalo vazio');
  const format = a.format ?? (a.o ? path.extname(a.o).slice(1) || 'mp4' : 'mp4');
  const out = path.resolve(a.o ?? path.join(outDir(), `${baseName(file)}.${format === 'png' ? 'frames' : format}`));
  mkdirSync(path.dirname(out), { recursive: true });
  const cpu = os.cpus().length;
  const nW = Math.max(1, Math.min(num(a.workers, Math.max(1, Math.min(cpu - 2, 20))), Math.ceil(total / 8)));
  const tmp = path.join(os.tmpdir(), `bamoo_${process.pid}_${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  const codec = format === 'gif' ? 'mp4' : format;
  const segExt = codec === 'png' ? '' : codec === 'webm' ? 'webm' : codec === 'mov' ? 'mov' : 'mp4';
  if (codec === 'png') mkdirSync(out, { recursive: true });
  console.log(`bamoo: ${baseName(file)}  ${r.W}x${r.H} @ ${fps}fps  ${total} frames  ${nW} workers  -> ${out}`);
  const t0 = Date.now();
  let done = 0, falhas = 0;
  const chunk = Math.ceil(total / nW);
  const segs = [];
  const jobs = [];
  for (let w = 0; w < nW; w++) {
    const a0 = f0 + w * chunk, a1 = Math.min(f1, a0 + chunk);
    if (a1 <= a0) break;
    const seg = codec === 'png' ? out : path.join(tmp, `seg_${String(w).padStart(3, '0')}.${segExt}`);
    segs.push(seg);
    jobs.push(
      new Promise((res, rej) => {
        const job = { file: path.resolve(file), a0, a1, fps, scale, seg, codec, crf: num(a.crf, 20), preset: a.preset ?? 'medium' };
        const script = fileURLToPath(new URL('./worker.js', import.meta.url));
        // processos separados escalam bem melhor que worker threads com o Skia
        const wk = a.threads ? new Worker(script, { workerData: job }) : fork(script, [JSON.stringify(job)], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
        wk.on('message', m => {
          if (m.done) falhas += m.falhas ?? 0;
          if (m.frame !== undefined) {
            done++;
            if (done % 2 === 0 || done === total) bar(done, total, t0);
          }
        });
        wk.on('error', rej);
        wk.on('exit', c => (c ? rej(new Error(`worker saiu com código ${c}`)) : res()));
      }),
    );
  }
  await Promise.all(jobs);
  if (process.stdout.isTTY) process.stdout.write('\n');
  if (codec !== 'png') {
    const list = path.join(tmp, 'list.txt');
    writeFileSync(list, segs.map(s => `file '${s.replace(/\\/g, '/')}'`).join('\n'));
    const target = format === 'gif' ? path.join(tmp, 'full.mp4') : out;
    const args = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
    if (a.audio && format !== 'gif') args.push('-i', path.resolve(a.audio), '-c:v', 'copy', '-c:a', 'aac', '-shortest');
    else args.push('-c', 'copy');
    if (codec === 'mp4' || codec === 'mov') args.push('-movflags', '+faststart');
    args.push(target);
    const c = spawnSync('ffmpeg', args, { encoding: 'utf8' });
    if (c.status !== 0) throw new Error('ffmpeg concat falhou: ' + c.stderr);
    if (format === 'gif') {
      const gw = num(a.gifw, 720), gf = num(a.giffps, 15);
      const g = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', target, '-vf', `fps=${gf},scale=${gw}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, out], { encoding: 'utf8' });
      if (g.status !== 0) throw new Error('ffmpeg gif falhou: ' + g.stderr);
    }
  }
  rmSync(tmp, { recursive: true, force: true });
  const secs = (Date.now() - t0) / 1000;
  if (falhas > Math.max(3, total * 0.03))
    console.log(`bamoo: ATENÇÃO — ${falhas} quadros saíram diferentes ao serem desenhados de novo: a CENA não é determinística (sorteio dentro de funções de t, Math.random, Date...). O vídeo vai piscar. Rode "bamoo check" para achar onde.`);
  else if (falhas) console.log(`bamoo: ${falhas} quadro(s) com falha aleatória do desfoque do Skia foram detectados e redesenhados (sem flicker no vídeo).`);
  const size = codec === 'png' ? '' : `  ${(statSync(out).size / 1e6).toFixed(1)} MB`;
  console.log(`ok: ${out}  (${secs.toFixed(1)}s, ${(total / secs).toFixed(1)} fps de render)${size}`);
}

const timesArg = (v, dur) => {
  if (v === undefined || v === true) return [dur / 2];
  return String(v).split(',').map(Number);
};

async function cmdStill(file, a) {
  const root = await loadScene(file);
  const r = new Renderer(root, { scale: num(a.scale, 0.5), fps: num(a.fps, 30), debug: !!a.grid, rig: !!a.rig, layers: !!a.layers, arcos: !!a.arcos, silhueta: !!a.silhueta });
  const ts = timesArg(a.t, r.dur);
  for (const t of ts) {
    const cv = r.image(Math.min(t, r.dur - 1e-3));
    const out = ts.length === 1 && a.o ? path.resolve(a.o) : path.join(outDir(), `${baseName(file)}_t${t.toFixed(2)}.png`);
    writeFileSync(out, cv.toBuffer('image/png'));
    console.log(out);
  }
}

async function cmdSheet(file, a) {
  loadFonts();
  const root = await loadScene(file);
  const scale = num(a.scale, 0.25);
  const r = new Renderer(root, { scale, fps: num(a.fps, 30), debug: !!a.grid, rig: !!a.rig, layers: !!a.layers, arcos: !!a.arcos, silhueta: !!a.silhueta });
  const n = num(a.n, 12), cols = num(a.cols, Math.min(4, n));
  const from = num(a.from, 0), to = Math.min(num(a.to, r.dur), r.dur);
  const rows = Math.ceil(n / cols), gap = 4;
  const sheet = createCanvas(cols * r.W + (cols - 1) * gap, rows * r.H + (rows - 1) * gap);
  const sx = sheet.getContext('2d');
  sx.fillStyle = '#111';
  sx.fillRect(0, 0, sheet.width, sheet.height);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? from : from + ((to - from - 1e-3) * i) / (n - 1);
    const cv = r.image(t);
    const x = (i % cols) * (r.W + gap), y = Math.floor(i / cols) * (r.H + gap);
    sx.drawImage(cv, x, y);
    sx.font = `${Math.max(12, r.H * 0.06)}px "PT Sans"`;
    sx.fillStyle = '#000a';
    sx.fillRect(x, y, Math.max(48, r.H * 0.25), Math.max(16, r.H * 0.085));
    sx.fillStyle = '#ffde59';
    sx.textBaseline = 'top';
    sx.fillText(`${t.toFixed(2)}s`, x + 4, y + 2);
  }
  const out = a.o ? path.resolve(a.o) : path.join(outDir(), `${baseName(file)}_sheet.jpg`);
  writeFileSync(out, await sheet.encode('jpeg', 88));
  console.log(out);
}

async function cmdInfo(file) {
  const root = await loadScene(file);
  const r = new Renderer(root, { scale: 1 });
  let nodes = 0;
  const walk = n => {
    if (!n || typeof n !== 'object') return;
    nodes++;
    if (Array.isArray(n.children)) n.children.forEach(walk);
  };
  console.log(`cena: ${file}`);
  console.log(`tamanho: ${r.DW}x${r.DH}  duração: ${r.dur.toFixed(2)}s  planos: ${r.timeline.length}`);
  r.timeline.forEach((e, i) => {
    const L = Array.isArray(e.sc.layers) ? e.sc.layers : [];
    nodes = 0;
    L.forEach(walk);
    console.log(`  [${i}] início ${e.start.toFixed(2)}s  dur ${e.sc.dur}s  transição ${e.tr}  camadas ${L.length}  nós ${nodes}`);
  });
  for (const f of [24, 30, 60]) console.log(`  ${f} fps => ${Math.round(r.dur * f)} frames`);
}

async function cmdBench(file, a) {
  const root = await loadScene(file);
  const r = new Renderer(root, { scale: num(a.scale, 1), fps: 30 });
  const n = num(a.n, 12);
  r.pixels(0);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) r.pixels((r.dur * (i + 0.5)) / n);
  const ms = (performance.now() - t0) / n;
  const cpu = Math.max(1, os.cpus().length - 4);
  console.log(`${r.W}x${r.H}: ${ms.toFixed(1)} ms/frame (1 thread) ≈ ${(1000 / ms).toFixed(1)} fps; com ${cpu} workers ≈ ${((1000 / ms) * cpu * 0.8).toFixed(0)} fps`);
}

const TEMPLATE = `// Cena nova — veja AGENTS.md (referência rápida), docs/ANATOMIA.md (personagens) e docs/PRINCIPIOS.md
// (os 12 princípios: o motor já aplica slow in/out, atuação nos rigs, vida, molas e sombras). Sem texto na tela.
import { scene, film, layer, G, blob, circle, ellipse, rect, taper, line, particles, rays, sombra, lin, rad, kf, acao, quica, osc, wig, pessoa } from 'bamoonimation';

// O estilo padrão já é o das referências (ilustrado: textura, papel, grão, luz quente, névoa, profundidade).
// Escolha só a luz: 'dia' | 'entardecer' | 'amanhecer' | 'interior' | 'noite' | 'subaquatico'.
const look = { luz: 'entardecer' };
const bola = quica({ x0: 760, vx: 160, chao: 900, altura: 360, t0: 0.5, queda: 0.5 });

const plano1 = scene({
  dur: 5,
  bg: lin(90, '#8fb8de', '#f3d3b0'),
  look,
  camera: { x: kf([0, 900], [5, 1020]), zoom: kf([0, 1], [5, 1.06]), dof: 6 },
  layers: [
    layer({ z: 8 }, [circle(1450, 380, 110, { fill: '#fff4d6', glow: { r: 60 }, shade: 0, hl: 0 })]),
    layer({ z: 3 }, [blob([[-300, 1300], [-300, 760], [500, 680], [1200, 780], [2200, 700], [2200, 1300]], { fill: '#8aa6a0' })]),
    layer({ z: 1 }, [
      blob([[-300, 1300], [-300, 900], [700, 860], [1500, 920], [2200, 880], [2200, 1300]], { fill: '#6f8f5a' }),
      // quica() = arcos + slow in/out da gravidade + squash & stretch automático (desenhe com a base em 0,0)
      sombra(t => bola.x(t), 900, 160),
      G({ ...bola }, [circle(0, -70, 70, { fill: '#e2735a' })]),
      // um broto com mola: balança atrasado quando o vento (rot) muda — follow-through
      G({ x: 1300, y: 880, rot: acao(kf([0, 0], [2, 0], [2.4, 8], [4, -4])), px: 0, py: 0 }, [
        G({ mola: { freq: 1.8, amort: 0.25 }, px: 0, py: 0 }, [taper([[0, 0], [6, -80], [-4, -160]], [16, 10, 4], { fill: '#4f7d4a' }), circle(-4, -170, 24, { fill: '#f2b24a' })]),
      ]),
    ]),
    layer({ z: 0.5 }, [blob([[-200, 1200], [-200, 980], [300, 1040], [500, 1200]], { fill: '#3d4a3a' })]),
  ],
  fadeIn: 0.6,
});

export default film([plano1], { trans: 'cross', d: 0.6 });
`;

function cmdNew(file) {
  const abs = path.resolve(file.endsWith('.js') ? file : file + '.js');
  if (existsSync(abs)) throw new Error(`já existe: ${abs}`);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, TEMPLATE);
  console.log(abs);
}

async function cmdCheck(file, a) {
  const root = await loadScene(file);
  const res = checkFilm(root, { fps: num(a.fps, 12), allowText: !!a['allow-text'] });
  console.log(res.lines.join('\n'));
  if (res.errors) process.exitCode = 1;
}

export async function main(argv) {
  const a = parseArgs(argv);
  const [cmd, file] = a._;
  if (!cmd || cmd === 'help' || a.help || a.h) {
    console.log(HELP);
    return;
  }
  if (!file) throw new Error(`informe o arquivo da cena: bamoo ${cmd} cenas/minha.js`);
  if (cmd === 'new') return cmdNew(file);
  if (cmd === 'check') return cmdCheck(file, a);
  if (cmd === 'render') return cmdRender(file, a);
  if (cmd === 'still') return cmdStill(file, a);
  if (cmd === 'sheet') return cmdSheet(file, a);
  if (cmd === 'info') return cmdInfo(file, a);
  if (cmd === 'bench') return cmdBench(file, a);
  throw new Error(`comando desconhecido "${cmd}"\n\n${HELP}`);
}
