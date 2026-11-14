// Renderer: avalia a árvore de nós em um tempo t e desenha um frame com Skia.
// Pipeline: fundo -> camadas (parallax, névoa, profundidade de campo) -> grade de cor -> bloom -> vinheta
//           -> legendas -> transições -> grão de filme -> tarjas.

import canvas from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { V, deepV, isAnim, KF, noise, hash, clamp, smooth, lerp, RNG_MONITOR } from './anim.js';
import { mix, rgba, css } from './color.js';
import { blobPath, polyPath, curvePath, taperPath, ik2, widthFn } from './geom.js';
import { flat } from './nodes.js';
import { texCanvas, TEX_MODE } from './textures.js';
import { loadFonts, fontFamily } from './fonts.js';
import { solveRig, restPose, chainPoints, limbPath, spinePoints, bindMatrix } from './rig.js';

const { createCanvas, Path2D, DOMMatrix, PathOp, Image, ImageData } = canvas;
const { PI, cos, sin, tan, abs, hypot, min, max, floor, round, exp, sqrt } = Math;
const TAU = PI * 2;

/**
 * ESTILOS de acabamento. O padrão é 'ilustrado' — o visual das referências (explainer ilustrado mid-century):
 * textura de pincel automática nas formas grandes, papel e grão, sombra própria em meia-lua, realce quente,
 * névoa atmosférica, profundidade de campo, bloom, vinheta e grade de cor quente com pretos levantados.
 * Escolha outro com look: { estilo: 'limpo' | 'papel' }. Qualquer chave pode ser sobrescrita em look.
 */
export const ESTILOS = {
  ilustrado: {
    sun: [-0.55, -0.85], // direção PARA a fonte de luz (y para baixo). Ex.: [-1,-1] = luz vindo de cima-esquerda
    light: '#fff2d8', // cor do realce (lado iluminado)
    shadow: '#43306a', // cor da sombra própria (aplicada em multiply)
    shade: 0.45, // força padrão da sombra própria automática (0 = desliga)
    hl: 0.26, // força padrão do realce do lado da luz
    shadeD: 0.22, // deslocamento da sombra (fração do menor lado da forma)
    hlD: 0.07,
    soft: 0.3, // suavidade do terminador (fração do deslocamento)
    ceu: [[0, '#7fa8d6'], [0.6, '#cfe0ea'], [1, '#f2dcb6']], // fundo padrão quando a cena não define bg
    tex: null, // textura fixa para TODAS as formas: 'grain'|'speckle'|'brush'|'paper'|'hatch'|'blot'|{k,a,s,rot}
    autoTex: { k: 'brush', a: 0.32, s: 0.85, min: 60 }, // pincel seco automático em formas ≥ min px (tex: false desliga na forma)
    autoLuz: 0.38, // "banho de luz" automático: degradê suave luz→sombra na direção do sol em formas grandes (0 desliga; luz: false na forma)
    grain: 0.08, // grão de filme global
    grainFps: 8, // quantas vezes por segundo o grão muda (0 = estático, arquivo bem menor)
    paper: 0.16, // textura de papel global (multiply)
    vignette: 0.42,
    vignetteC: '#1f0f2a',
    vignetteFoco: 0.4, // STAGING: o centro da vinheta puxa para os personagens do plano focal (0 = centro fixo)
    bloom: 0.26,
    haze: { c: 'auto', a: 0.45 }, // névoa atmosférica para camadas com z > 1 ('auto' = cor do horizonte do fundo)
    grade: { sat: 1.12, con: 1.08, bri: 1, lift: '#140a16', tint: '#ffb070', tintA: 0.1 },
    dof: 5, // profundidade de campo padrão (desfoque de camadas fora de z=1); camera.dof sobrescreve
    bars: 0, // tarjas de cinema (fração da altura, ex.: 0.1)
    steps: 0, // animar "em dois": 12 => poses a 12 fps (câmera continua suave)
    mblur: 0, // motion blur: nº de subquadros (ex.: 4). Pode ser animado.
    shutter: 0.5,
    caption: { font: 'hand', size: 46, c: '#ffffff', y: 0.885 },
    unido: true, // PEÇA ÚNICA: personagens (rigs) pintados como um corpo só — ver UNIDO (false = peças soltas, como antes)
  },
};
// limpo: vetor chapado (diagramas, testes) — sem texturas, grão, vinheta, bloom, grade nem desfoque
ESTILOS.limpo = { ...ESTILOS.ilustrado, shade: 0.3, hl: 0.15, autoTex: null, autoLuz: 0, grain: 0, paper: 0, vignette: 0, bloom: 0, grade: null, dof: 0, haze: { c: 'auto', a: 0.3 } };
// papel: ilustração impressa — mais papel e grão fixo, menos brilho (como os diagramas texturizados da referência)
ESTILOS.papel = { ...ESTILOS.ilustrado, paper: 0.35, grain: 0.1, grainFps: 0, bloom: 0.12, autoTex: { k: 'blot', a: 0.35, s: 0.8, min: 60 } };

/**
 * LUZES prontas (extraídas dos benchmarks): look: { luz: 'dia' | 'entardecer' | 'amanhecer' | 'interior' |
 * 'noite' | 'subaquatico' }. Definem céu padrão (se a cena não tiver bg), sol, cores de luz/sombra, névoa
 * (da cor do céu), vinheta e a grade de cor (a noite escurece e esfria tudo).
 */
export const LUZES = {
  dia: { ceu: [[0, '#7fa8d6'], [0.6, '#cfe0ea'], [1, '#f2dcb6']], sun: [-0.55, -0.85], light: '#fff2d8', shadow: '#43306a', grade: { tint: '#ffd9a0', tintA: 0.07 } },
  entardecer: { ceu: [[0, '#7d9cc8'], [0.55, '#f1c28e'], [1, '#ffdca2']], sun: [-0.9, -0.45], light: '#fff0c8', shadow: '#5b3c62', haze: { a: 0.4 }, vignetteC: '#2a1428', bloom: 0.3, grade: { sat: 1.12, con: 1.08, lift: '#120a10', tint: '#ffb060', tintA: 0.16 } },
  amanhecer: { ceu: [[0, '#1b2654'], [0.45, '#5d4a8a'], [0.78, '#e9836b'], [1, '#ffd08a']], sun: [0.85, -0.45], light: '#ffe2b8', shadow: '#3c2c5c', haze: { a: 0.55 }, vignetteC: '#120a22', bloom: 0.35, grade: { lift: '#0c0718', tint: '#ff9a60', tintA: 0.14 } },
  interior: { ceu: [[0, '#5a3a34'], [1, '#2a1a1e']], sun: [-0.45, -1], light: '#ffeccc', shadow: '#47234d', haze: { c: '#e7b98f', a: 0.5 }, vignette: 0.48, vignetteC: '#220b1a', bloom: 0.3, grade: { lift: '#14080f', tint: '#ffa860', tintA: 0.14 } },
  noite: { ceu: [[0, '#070b22'], [0.6, '#1c2a5a'], [1, '#3d3f7a']], sun: [0.3, -1], light: '#cfe0ff', shadow: '#141a3c', haze: { a: 0.5 }, vignette: 0.55, vignetteC: '#05060f', bloom: 0.38, grade: { sat: 0.8, con: 1.08, bri: 0.72, lift: '#060818', tint: '#3a5cff', tintA: 0.3 } },
  subaquatico: { ceu: [[0, '#86cbd8'], [0.35, '#2a7c9c'], [0.75, '#0b3352'], [1, '#071f33']], sun: [0.12, -1], light: '#e2fbff', shadow: '#173a5c', haze: { c: '#2c7f9f', a: 0.78 }, vignette: 0.5, vignetteC: '#021423', bloom: 0.22, grade: { sat: 1.06, con: 1.05, lift: '#04121e', tint: '#4aa6c4', tintA: 0.3 } },
};

export const DEFAULT_LOOK = ESTILOS.ilustrado;

/**
 * PEÇA ÚNICA (look.unido / rig.unido): como o personagem vira um corpo só em vez de uma colagem de peças.
 * Forças (0..1) e tamanhos (fração do maior lado do esqueleto). Qualquer chave pode ser sobrescrita em
 * look: { unido: { forma: 0.6 } } ou no rig: unido: { oclusao: 0.3 } | false.
 */
export const UNIDO = {
  parte: 0.2, // quanto de sombra/realce próprios cada peça mantém (1 = peças soltas, como antes)
  oclusao: 0.7, // sombra que cada peça projeta nas de trás (braço no tronco, cabeça no pescoço)
  ocD: 0.009, // deslocamento dessa sombra (para longe do sol)
  ocB: 0.018, // desfoque dessa sombra
  banho: 0.42, // degradê luz→sombra único para o corpo inteiro
  forma: 0.65, // sombra de forma pela silhueta inteira (lado oposto ao sol)
  formaD: 0.045,
  formaB: 0.045,
  borda: 0.45, // realce de borda do lado do sol
  bordaD: 0.008,
  bordaB: 0.006,
};

const BLEND = {
  multiply: 'multiply', screen: 'screen', overlay: 'overlay', add: 'lighter', lighter: 'lighter',
  'soft-light': 'soft-light', soft: 'soft-light', 'hard-light': 'hard-light', color: 'color',
  darken: 'darken', lighten: 'lighten', 'color-dodge': 'color-dodge', 'color-burn': 'color-burn',
  hue: 'hue', saturation: 'saturation', luminosity: 'luminosity', difference: 'difference',
  'source-atop': 'source-atop', 'destination-out': 'destination-out', erase: 'destination-out',
};
const blendOp = b => {
  const op = BLEND[b];
  if (!op) throw new Error(`bamoo: blend desconhecido "${b}". Use: ${Object.keys(BLEND).join(', ')}`);
  return op;
};

const INHERIT = ['fill', 'stroke', 'lw', 'shade', 'hl', 'tex', 'sun', 'light', 'shadow'];

function resetCtx(ctx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** Matriz local [a,b,c,d,e,f] de um nó (ou null se identidade). */
function localMat(n, t, env) {
  const x = n.x === undefined ? 0 : V(n.x, t, env);
  const y = n.y === undefined ? 0 : V(n.y, t, env);
  const rot = n.rot === undefined ? 0 : V(n.rot, t, env);
  const s = n.s === undefined ? 1 : V(n.s, t, env);
  let sx = (n.sx === undefined ? 1 : V(n.sx, t, env)) * s;
  const sy = (n.sy === undefined ? 1 : V(n.sy, t, env)) * s;
  if (n.flip && V(n.flip, t, env)) sx = -sx;
  const skx = n.skx === undefined ? 0 : V(n.skx, t, env);
  if (!x && !y && !rot && sx === 1 && sy === 1 && !skx) return null;
  const px = n.px === undefined ? 0 : V(n.px, t, env);
  const py = n.py === undefined ? 0 : V(n.py, t, env);
  const r = (rot * PI) / 180, cr = cos(r), sr = sin(r), k = skx ? tan((skx * PI) / 180) : 0;
  const a = cr * sx, b = sr * sx, c = (cr * k - sr) * sy, d = (sr * k + cr) * sy;
  return [a, b, c, d, x + px - a * px - c * py, y + py - b * px - d * py];
}

const mulMat = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

const range2 = (v, d) => (v === undefined ? [d, d] : Array.isArray(v) ? v : [v, v]);

export class Renderer {
  /**
   * @param root cena (scene) ou filme (film)
   * @param opts { scale, fps, debug }
   */
  constructor(root, { scale = 1, fps = 30, debug = false, rig = false, layers = false, silhueta = false, arcos = false } = {}) {
    loadFonts();
    if (!root || (root.kind !== 'scene' && root.kind !== 'film'))
      throw new Error('bamoo: o módulo da cena deve exportar default scene({...}) ou film([...])');
    this.root = root.kind === 'film' ? root : { kind: 'film', scenes: [root], trans: 'cut', d: 0, exagero: root.exagero };
    this.sil = silhueta; // teste da silhueta (staging): formas chapadas, plano focal em preto
    this.debugArcs = arcos; // trilhas de movimento das extremidades dos rigs (arcos e espaçamento)
    this.anc = []; // pilha de ancestrais do nó sendo desenhado (para avaliar o movimento dele em outros instantes)
    this.rigCache = new Map();
    this.molaCache = new Map();
    this.subjects = [];
    this.noDrift = false;
    const first = this.root.scenes[0];
    [this.DW, this.DH] = first.size ?? [1920, 1080];
    this.W = max(2, round((this.DW * scale) / 2) * 2);
    this.H = max(2, round((this.DH * scale) / 2) * 2);
    this.s = this.W / this.DW;
    this.fps = fps;
    this.debug = debug;
    this.debugRig = rig; // desenha esqueletos por cima (ossos, juntas, violações em vermelho, alvos IK)
    this.debugLayers = layers; // tinge cada camada com uma cor e mostra a legenda de z
    this.probe = null; // usado pelo verificador (bamoo check): coleta estado dos rigs e textos
    this.main = createCanvas(this.W, this.H);
    this.pool = [];
    this.smallPool = [];
    this.patterns = new WeakMap();
    this.images = new Map();
    this.pathCache = new Map();
    // linha do tempo do filme
    let T = 0;
    this.timeline = this.root.scenes.map((sc, i) => {
      const tr = i === 0 ? 'cut' : sc.trans ?? this.root.trans ?? 'cut';
      const d = tr === 'cut' ? 0 : sc.transD ?? this.root.d ?? 0.6;
      const overlap = tr === 'cross' || tr === 'wipe' ? d : 0;
      const start = i === 0 ? 0 : T - overlap;
      T = start + sc.dur;
      return { sc, start, tr, d, i };
    });
    this.dur = T;
  }

  // ---------- canvases temporários ----------
  /** Canvas temporário (w x h, padrão = tamanho do frame). Devolva com release(). */
  acquire(w = this.W, h = this.H) {
    const k = w + 'x' + h;
    let list = this.pool[k];
    if (!list) list = this.pool[k] = [];
    const c = list.pop() ?? createCanvas(w, h);
    const x = c.getContext('2d');
    resetCtx(x);
    x.clearRect(0, 0, w, h);
    // clip() só sai com restore(); sem este save, um clip feito por quem pegou o canvas
    // (ex.: grupo com clip + alpha/blur) fica grudado e apaga desenhos nos próximos quadros.
    x.save();
    return c;
  }
  release(c) {
    c.getContext('2d').restore();
    this.pool[c.width + 'x' + c.height].push(c);
  }
  small(w, h, slot = '') {
    const k = w + 'x' + h + slot;
    let c = this.smallPool.find(e => e.k === k);
    if (!c) {
      c = { k, c: createCanvas(w, h) };
      this.smallPool.push(c);
    }
    const x = c.c.getContext('2d');
    resetCtx(x);
    x.clearRect(0, 0, w, h);
    return c.c;
  }

  pattern(ctx, name) {
    let m = this.patterns.get(ctx);
    if (!m) this.patterns.set(ctx, (m = new Map()));
    let p = m.get(name);
    if (!p) m.set(name, (p = ctx.createPattern(texCanvas(name), 'repeat')));
    return p;
  }

  image(src) {
    let im = this.images.get(src);
    if (!im) {
      im = new Image();
      im.src = readFileSync(src);
      this.images.set(src, im);
    }
    return im;
  }

  // ---------- frame ----------
  /** Renderiza o frame no tempo T (segundos do filme). Retorna o canvas principal. */
  frame(T, frameIndex = round(T * this.fps)) {
    RNG_MONITOR.rendering++;
    try {
      return this.frameInner(T, frameIndex);
    } finally {
      RNG_MONITOR.rendering--;
    }
  }

  frameInner(T, frameIndex) {
    const tl = this.timeline;
    const active = tl.filter(e => T >= e.start && T < e.start + e.sc.dur);
    if (!active.length) active.push(T < 0 ? tl[0] : tl[tl.length - 1]);
    const main = this.main;
    const ctx = main.getContext('2d');
    const A = active[0];
    this.renderScene(A, T - A.start, main);
    let cur = A;
    if (active.length > 1) {
      const B = active[active.length - 1];
      cur = B;
      const u = clamp((T - B.start) / B.d);
      const off = this.acquire();
      this.renderScene(B, T - B.start, off);
      resetCtx(ctx);
      if (B.tr === 'wipe') {
        const x = u * (this.W + this.W * 0.2) - this.W * 0.1;
        const g = ctx.createLinearGradient(x - this.W * 0.1, 0, x + this.W * 0.1, 0);
        const m = this.acquire();
        const mx = m.getContext('2d');
        g.addColorStop(0, '#000');
        g.addColorStop(1, '#0000');
        mx.fillStyle = g;
        mx.fillRect(0, 0, this.W, this.H);
        mx.globalCompositeOperation = 'source-in';
        mx.drawImage(off, 0, 0);
        ctx.drawImage(m, 0, 0);
        this.release(m);
      } else {
        ctx.globalAlpha = u;
        ctx.drawImage(off, 0, 0);
        ctx.globalAlpha = 1;
      }
      this.release(off);
    }
    // mergulho para preto/branco entre cenas
    const idx = cur.i;
    const t = T - cur.start;
    let dip = 0, dipC = '#000';
    if ((cur.tr === 'black' || cur.tr === 'white') && t < cur.d / 2) {
      dip = 1 - smooth(0, cur.d / 2, t);
      dipC = cur.tr === 'white' ? '#fff' : '#000';
    }
    const next = tl[idx + 1];
    if (next && (next.tr === 'black' || next.tr === 'white') && t > cur.sc.dur - next.d / 2) {
      dip = smooth(cur.sc.dur - next.d / 2, cur.sc.dur, t);
      dipC = next.tr === 'white' ? '#fff' : '#000';
    }
    if (dip > 0) {
      resetCtx(ctx);
      ctx.globalAlpha = dip;
      ctx.fillStyle = dipC;
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
    }
    this.curLook = this.lookOf(cur.sc, t);
    this.curFocus = this.focusOf(this.curLook);
    this.filmPost(ctx, this.curLook);
    return main;
  }

  lookOf(sc, t) {
    const env = { t, dur: sc.dur, W: this.DW, H: this.DH, fps: this.fps };
    const user = { ...(this.root.look ?? {}), ...(sc.look ?? {}) };
    const est = ESTILOS[V(user.estilo, t, env) ?? 'ilustrado'];
    if (!est) throw new Error(`bamoo: estilo desconhecido "${user.estilo}". Use: ${Object.keys(ESTILOS).join(', ')}`);
    const lz = user.luz === undefined ? {} : LUZES[V(user.luz, t, env)];
    if (!lz) throw new Error(`bamoo: luz desconhecida "${user.luz}". Use: ${Object.keys(LUZES).join(', ')}`);
    const L = { ...est, ...lz, ...user };
    const out = {};
    for (const k in L) out[k] = V(L[k], t, env);
    // grade e névoa: mescla em camadas (estilo -> luz -> cena), assim mudar só a tinta não apaga o resto
    const gr = [est.grade, lz.grade, V(user.grade, t, env)];
    out.grade = gr[2] === null || (gr[0] === null && !gr[1] && !gr[2]) ? null : { ...(gr[0] ?? {}), ...(gr[1] ?? {}), ...(gr[2] ?? {}) };
    const hz = V(user.haze, t, env);
    out.haze = hz === null || hz === false || hz === 0 ? null : { ...(est.haze ?? {}), ...(lz.haze ?? {}), ...(hz ?? {}) };
    if (out.haze && (out.haze.c === 'auto' || !out.haze.c)) out.haze = { ...out.haze, c: horizonte(V(sc.bg, t, env) ?? out.ceu) };
    if (out.caption) out.caption = { ...ESTILOS.ilustrado.caption, ...out.caption };
    return out;
  }

  renderScene(entry, t, cv) {
    const sc = entry.sc;
    this.curScene = entry.i;
    this.layerLegend = [];
    const look = this.lookOf(sc, t);
    // exagero (princípio 10): multiplica a atuação automática (antecipação, overshoot, squash, molas)
    const ex = V(sc.exagero ?? this.root.exagero ?? 1, t);
    const env = { t, dur: sc.dur, W: this.DW, H: this.DH, fps: this.fps, scale: this.s, exagero: ex };
    this.subjects = [];
    const n = round(look.mblur || 0);
    if (n > 1) {
      const acc = this.acquire();
      const ax = acc.getContext('2d');
      const span = (look.shutter ?? 0.5) / this.fps;
      for (let k = 0; k < n; k++) {
        const tk = t - span * (1 - k / (n - 1));
        this.renderLayers(sc, tk, cv, look, { ...env, t: tk });
        ax.globalAlpha = 1 / (k + 1);
        ax.drawImage(cv, 0, 0);
      }
      const ctx = cv.getContext('2d');
      resetCtx(ctx);
      ctx.drawImage(acc, 0, 0);
      this.release(acc);
    } else this.renderLayers(sc, t, cv, look, env);
    this.scenePost(cv, sc, look, t, env);
  }

  camera(sc, t, env, look) {
    const c = typeof sc.camera === 'function' ? sc.camera(t, env) : sc.camera ?? {};
    const g = (k, d) => (c[k] === undefined ? d : V(c[k], t, env));
    const cam = {
      x: g('x', this.DW / 2), y: g('y', this.DH / 2), zoom: g('zoom', 1), rot: g('rot', 0),
      dolly: g('dolly', 0), focus: g('focus', 1), dof: g('dof', look?.dof ?? 0), shake: g('shake', 0),
    };
    if (cam.shake) {
      const f = g('shakeF', 9);
      cam.x += cam.shake * noise(t * f, 7);
      cam.y += cam.shake * noise(t * f, 13);
      cam.rot += cam.shake * 0.04 * noise(t * f * 0.7, 19);
    }
    // câmera viva (ação secundária): deriva lentíssima, como uma câmera na mão de alguém calmo. vida: 0 desliga
    const vida = this.noDrift ? 0 : g('vida', 1);
    if (vida) {
      cam.x += 3.5 * vida * noise(t * 0.13, 101);
      cam.y += 2.5 * vida * noise(t * 0.11, 103);
      cam.rot += 0.07 * vida * noise(t * 0.09, 107);
    }
    return cam;
  }

  renderLayers(sc, t, cv, look, env) {
    const ctx = cv.getContext('2d');
    resetCtx(ctx);
    const s = this.s;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const bg = this.sil ? '#f2efe8' : V(sc.bg, t, env) ?? look.ceu ?? ESTILOS.ilustrado.ceu;
    ctx.fillStyle = this.paint(ctx, bg, [0, 0, this.DW, this.DH]);
    ctx.fillRect(0, 0, this.DW, this.DH);
    this.rigCache.clear();
    const cam = this.camera(sc, t, env, look);
    this.curCam = cam;
    const tA = look.steps > 0 ? floor(t * look.steps + 1e-6) / look.steps : t;
    const envA = tA === t ? env : { ...env, t: tA };
    const base = {
      fill: undefined, stroke: undefined, lw: 2, shade: look.shade, hl: look.hl, tex: look.tex,
      sun: look.sun, light: look.light, shadow: look.shadow, look,
    };
    const layers = typeof sc.layers === 'function' ? flat(sc.layers(t, env)) : sc.layers;
    for (const L of layers) this.drawLayer(ctx, L, tA, envA, look, cam, base);
  }

  layerMatrix(L, z, cam) {
    const s = this.s;
    if (L.fixed) return [s, 0, 0, s, 0, 0];
    const k = s * cam.zoom * (z / max(z - cam.dolly, 0.05));
    const ox = (cam.x - this.DW / 2) / z, oy = (cam.y - this.DH / 2) / z;
    const r = (cam.rot * PI) / 180, c = cos(r) * k, sn = sin(r) * k;
    const Px = this.DW / 2 + ox, Py = this.DH / 2 + oy;
    return [c, sn, -sn, c, this.W / 2 - c * Px + sn * Py, this.H / 2 - sn * Px - c * Py];
  }

  drawLayer(ctx, L, t, env, look, cam, base) {
    if (L.type !== 'layer') throw new Error(`bamoo: itens de layers devem ser layer(...), recebi "${L?.type}"`);
    if (L.show && (t < L.show[0] || t >= L.show[1])) return;
    const z = V(L.z, t, env) ?? 1;
    if (!L.fixed && z - cam.dolly < 0.06) return;
    const M = this.layerMatrix(L, z, cam);
    const blurD = L.blur !== undefined ? V(L.blur, t, env) : L.fixed ? 0 : cam.dof * abs(cam.focus / z - 1);
    let blurPx = this.sil ? 0 : blurD * this.s * cam.zoom;
    if (blurPx < 1.5) blurPx = 0; // desfoque imperceptível: evita um canvas extra (economiza 2 passadas de tela cheia)
    let hazeA = 0, hazeC = look.haze?.c ?? '#fff';
    if (L.haze !== undefined) {
      const h = V(L.haze, t, env);
      if (typeof h === 'number') hazeA = h;
      else if (h) {
        hazeA = h.a ?? 0.5;
        hazeC = h.c ?? hazeC;
      }
    } else if (look.haze && z > 1 && !L.fixed) hazeA = (look.haze.a ?? 0.5) * (1 - 1 / z);
    if (this.sil) hazeA = 0;
    const alpha = L.alpha === undefined ? 1 : V(L.alpha, t, env);
    if (alpha <= 0.002) return;
    // plano focal (onde a ação acontece): usado pelo foco da vinheta, pelas sombras e pelo teste da silhueta
    this.curLayerZ = L.fixed ? null : z;
    this.curFocal = !L.fixed && abs(z - cam.focus) <= 0.35;
    this.silCol = this.curFocal ? '#141414' : z > 1 ? `hsl(30, 6%, ${min(86, 52 + 9 * z)}%)` : '#5c5c5c';
    const off = blurPx > 0.4 || hazeA > 0.004 || alpha < 0.999 || L.blend || L.glow || this.debugLayers;
    // camadas desfocadas são desenhadas direto em meia/quarta resolução (o desfoque esconde a perda)
    const F = blurPx >= 2 && !L.glow ? (blurPx < 6 ? 2 : 4) : 1;
    const tw = max(2, round(this.W / F)), th = max(2, round(this.H / F));
    const target = off ? this.acquire(tw, th) : null;
    const tctx = off ? target.getContext('2d') : ctx;
    tctx.save();
    tctx.setTransform(M[0] / F, M[1] / F, M[2] / F, M[3] / F, M[4] / F, M[5] / F);
    const lm = localMat(L, t, env);
    if (lm) tctx.transform(...lm);
    const inh = this.inherit(base, L, t, env);
    this.curLayerM = tctx.getTransform();
    this.curLayerF = F;
    const kids = typeof L.children === 'function' ? flat(L.children(t, env)) : L.children;
    this.anc = [L];
    for (const c of kids) this.drawNode(tctx, c, inh, t, env);
    this.anc = [];
    tctx.restore();
    if (!off) return;
    resetCtx(tctx);
    if (this.debugLayers) {
      const hue = (this.layerLegend.length * 67) % 360;
      const col = `hsl(${hue}, 85%, 55%)`;
      this.layerLegend.push({ z: L.fixed ? 'fixa' : z, col, n: kids.length });
      tctx.globalCompositeOperation = 'source-atop';
      tctx.globalAlpha = 0.45;
      tctx.fillStyle = col;
      tctx.fillRect(0, 0, tw, th);
      resetCtx(tctx);
    }
    if (hazeA > 0.004) {
      tctx.globalCompositeOperation = 'source-atop';
      tctx.globalAlpha = min(1, hazeA);
      tctx.fillStyle = hazeC;
      tctx.fillRect(0, 0, tw, th);
      resetCtx(tctx);
    }
    ctx.save();
    resetCtx(ctx);
    ctx.globalAlpha = alpha;
    if (L.blend) ctx.globalCompositeOperation = blendOp(V(L.blend, t, env));
    if (F > 1) {
      ctx.imageSmoothingQuality = 'low';
      // a ampliação bilinear já suaviza ~F px; só desfoca o resto
      const rest = blurPx / F - 0.5;
      if (rest > 0.6) {
        const b = this.acquire(tw, th);
        const bx = b.getContext('2d');
        bx.filter = `blur(${rest}px)`;
        bx.drawImage(target, 0, 0);
        bx.filter = 'none';
        ctx.drawImage(b, 0, 0, tw, th, 0, 0, this.W, this.H);
        this.release(b);
      } else ctx.drawImage(target, 0, 0, tw, th, 0, 0, this.W, this.H);
    } else if (blurPx > 0.4) this.drawBlurred(ctx, target, blurPx);
    else ctx.drawImage(target, 0, 0);
    if (L.glow) this.glowImage(ctx, target, V(L.glow, t, env));
    ctx.restore();
    this.release(target);
  }

  /** Desenha um canvas (do tamanho do alvo) com desfoque em meia/quarta resolução (blur cheio no Skia é caro). */
  drawBlurred(ctx, src, px) {
    const W = src.width, H = src.height;
    if (px < 1.2) {
      ctx.drawImage(src, 0, 0);
      return;
    }
    if (px < 3) {
      ctx.filter = `blur(${px}px)`;
      ctx.drawImage(src, 0, 0);
      ctx.filter = 'none';
      return;
    }
    const f = px < 6 ? 2 : 4;
    const w = max(2, round(W / f)), h = max(2, round(H / f));
    const sm = this.small(w, h, 'blur');
    const sx = sm.getContext('2d');
    sx.imageSmoothingQuality = 'low';
    sx.filter = `blur(${px / f}px)`;
    sx.drawImage(src, 0, 0, w, h);
    sx.filter = 'none';
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(sm, 0, 0, w, h, 0, 0, W, H);
  }

  glowImage(ctx, src, g) {
    const spec = typeof g === 'number' ? { r: g } : g;
    const r = (spec.r ?? 20) * this.s;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha *= spec.a ?? 0.8;
    if (spec.c) {
      // brilho colorido: sombra deslocada para longe => só a sombra (borrada, na cor) aparece
      ctx.shadowColor = spec.c;
      ctx.shadowBlur = r;
      ctx.shadowOffsetX = 100000;
      ctx.drawImage(src, -100000, 0);
    } else this.drawBlurred(ctx, src, r);
    ctx.restore();
  }

  inherit(inh, n, t, env) {
    let out = null;
    for (const k of INHERIT) {
      if (n[k] !== undefined) {
        if (!out) out = { ...inh };
        out[k] = V(n[k], t, env);
      }
    }
    return out ?? inh;
  }

  st(n, k, inh, t, env) {
    return n[k] !== undefined ? V(n[k], t, env) : inh[k];
  }

  // ---------- nós ----------
  drawNode(ctx, n, inh, t, env) {
    if (!n) return;
    if (n.show && (t < n.show[0] || t >= n.show[1])) return;
    if (n.hidden && V(n.hidden, t, env)) return;
    const alpha = n.alpha === undefined ? 1 : V(n.alpha, t, env);
    if (alpha <= 0.002) return;
    ctx.save();
    this.anc.push(n);
    const m = localMat(n, t, env);
    if (m) ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    // follow-through / overlapping action: rotação secundária pela inércia do movimento dos ancestrais
    if (n.mola) {
      // a peça única desenha cada pele duas vezes (máscara + cor) com a mesma matriz: reaproveita a mola
      const Mk = ctx.getTransform(), key = `${n.id}|${t}|${Mk.a.toFixed(4)},${Mk.b.toFixed(4)},${Mk.e.toFixed(1)},${Mk.f.toFixed(1)}`;
      let a = this.molaCache.get(key);
      if (a === undefined) {
        a = this.molaAng(n, t, env);
        if (this.molaCache.size > 2000) this.molaCache.clear();
        this.molaCache.set(key, a);
      }
      if (a) {
        const px = n.px === undefined ? 0 : V(n.px, t, env), py = n.py === undefined ? 0 : V(n.py, t, env);
        ctx.translate(px, py);
        ctx.rotate((a * PI) / 180);
        ctx.translate(-px, -py);
      }
    }
    // squash & stretch: estica na direção da velocidade, achata no impacto (volume constante)
    if (n.squash) {
      const q = this.squashMat(n, t, env);
      if (q) {
        ctx.translate(q.b[0], q.b[1]);
        ctx.transform(q.T[0], q.T[1], q.T[2], q.T[3], 0, 0);
        ctx.translate(-q.b[0], -q.b[1]);
      }
    }
    if (alpha < 1 && n.type !== 'group') ctx.globalAlpha *= alpha;
    switch (n.type) {
      case 'group':
        this.drawGroup(ctx, n, inh, t, env, alpha);
        break;
      case 'blob':
      case 'poly':
      case 'ellipse':
      case 'rect':
      case 'path':
        this.drawShape(ctx, n, this.geom(n, t, env), inh, t, env);
        break;
      case 'taper': {
        const g = this.geom(n, t, env);
        this.drawShape(ctx, n, g, inh, t, env, g.wmax);
        break;
      }
      case 'line':
        this.drawLine(ctx, n, inh, t, env);
        break;
      case 'limb':
        this.drawLimb(ctx, n, inh, t, env);
        break;
      case 'text':
        this.drawText(ctx, n, inh, t, env);
        break;
      case 'sombra':
        if (!this.sil) this.drawSombra(ctx, n, inh, t, env);
        break;
      case 'img': {
        if (this.sil && !this.silTudo) break;
        const im = this.image(V(n.src, t, env));
        const w = n.w !== undefined ? V(n.w, t, env) : im.width;
        const h = n.h !== undefined ? V(n.h, t, env) : (im.height * w) / im.width;
        if (this.bbAcc) accBox(this.bbAcc, ctx.getTransform(), [0, 0, w, h], 0);
        if (this.sil) {
          ctx.fillStyle = this.silCol;
          ctx.fillRect(0, 0, w, h);
          break;
        }
        if (n.blend) ctx.globalCompositeOperation = blendOp(V(n.blend, t, env));
        ctx.drawImage(im, 0, 0, w, h);
        break;
      }
      case 'particles':
        this.drawParticles(ctx, n, inh, t, env);
        break;
      case 'rays':
        if (!this.sil) this.drawRays(ctx, n, inh, t, env);
        break;
      case 'rig':
        this.drawRig(ctx, n, inh, t, env);
        break;
      case 'custom':
        n.fn(ctx, t, env, this);
        break;
      case 'dyn': {
        const r = flat(n.fn(t, env));
        const inh2 = this.inherit(inh, n, t, env);
        for (const c of r) this.drawNode(ctx, c, inh2, t, env);
        break;
      }
      case 'layer':
        throw new Error('bamoo: layer(...) só pode aparecer em scene.layers, não dentro de grupos');
      default:
        throw new Error(`bamoo: tipo de nó desconhecido "${n.type}"`);
    }
    this.anc.pop();
    ctx.restore();
  }

  // ---------- movimento no tempo (base de molas, squash, trilhas) ----------
  /**
   * Matriz (espaço da camada, SEM a câmera) do contexto de desenho atual no instante tau, reavaliando a
   * transformação de cada ancestral (nós e ossos de rigs) nesse instante. É o que permite medir velocidade,
   * aceleração e giro de qualquer nó sem estado — cada quadro continua independente (render paralelo).
   */
  worldAt(tau, env, upto = this.anc.length) {
    let M = null;
    for (let i = 0; i < upto; i++) {
      const e = this.anc[i];
      let m;
      if (e.bone) {
        const cur = this.rigAt(e.rig, tau, env).S.get(e.bone);
        if (e.local) {
          const r = (cur.abs * PI) / 180;
          m = [cos(r), sin(r), -sin(r), cos(r), cur.x0, cur.y0];
        } else m = bindMatrix(restPose(e.rig).get(e.bone), cur);
      } else m = localMat(e, tau, env);
      if (m) M = M ? mulMat(M, m) : m;
    }
    return M ?? [1, 0, 0, 1, 0, 0];
  }

  /** solveRig com cache por quadro (vários efeitos pedem o mesmo rig nos mesmos instantes). */
  rigAt(n, tau, env) {
    const key = n.id + '|' + tau;
    let s = this.rigCache.get(key);
    if (!s) {
      s = solveRig(n, tau, env, { check: false });
      if (this.rigCache.size > 4000) this.rigCache.clear();
      this.rigCache.set(key, s);
    }
    return s;
  }

  /** Centro da geometria de um nó (coords locais), para molas e tamanho do squash. Cacheado. */
  nodeBox(n, t, env) {
    if (n._box !== undefined) return n._box;
    let bb = null;
    try {
      if (n.type === 'rig') {
        const S = restPose(n);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const s of S.values()) {
          x0 = min(x0, s.x0, s.x1); y0 = min(y0, s.y0, s.y1); x1 = max(x1, s.x0, s.x1); y1 = max(y1, s.y0, s.y1);
        }
        bb = [x0, y0, x1, y1];
      } else {
        const p = new Path2D();
        if (n.type === 'group') this.collect(p, this.kids(n, t, env), [1, 0, 0, 1, 0, 0], t, env);
        else if (['blob', 'poly', 'ellipse', 'rect', 'path', 'taper'].includes(n.type)) p.addPath(this.geom(n, t, env).path);
        const b = p.getBounds();
        if (b[2] > b[0]) bb = b;
      }
    } catch {
      bb = null;
    }
    return (n._box = bb);
  }

  /**
   * MOLA (follow-through / overlapping action): ângulo extra (graus) de um nó preso pelo pivô (px, py) que
   * reage, como massa-mola amortecida, à aceleração do pivô e ao giro dos ancestrais. Orelhas, cabelo, rabo,
   * antena, brinco, alça, planta no vaso que é carregado... n.mola: true | { freq, amort, ganho, max, ponta, pendulo }.
   * pendulo (0..1): quanto a parte se alinha à gravidade quando o pai inclina (1 = pende sempre na vertical).
   */
  molaAng(n, t, env) {
    const o = n.mola === true ? {} : V(n.mola, t, env);
    if (!o) return 0;
    const f = o.freq ?? 2, z = clamp(o.amort ?? 0.35, 0.05, 2), gain = (o.ganho ?? 1) * (env.exagero ?? 1), mx = o.max ?? 25;
    if (!gain) return 0;
    const w = 2 * PI * f, dt = 1 / 40;
    const N = Math.ceil(min(1.6, 5 / (z * w)) / dt);
    const piv = [n.px === undefined ? 0 : V(n.px, t, env), n.py === undefined ? 0 : V(n.py, t, env)];
    let tip = o.ponta;
    if (!tip) {
      const bb = this.nodeBox(n, t, env);
      tip = bb ? [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2] : [piv[0], piv[1] + 40];
      if (hypot(tip[0] - piv[0], tip[1] - piv[1]) < 2) tip = [piv[0], piv[1] + 40];
    }
    const P = [], Q = [], TH = [];
    let det = 1;
    for (let k = 0; k <= N + 1; k++) {
      const M = this.worldAt(t - k * dt, env);
      const dk = M[0] * M[3] - M[1] * M[2];
      if (k === 0) det = dk;
      P.push([M[0] * piv[0] + M[2] * piv[1] + M[4], M[1] * piv[0] + M[3] * piv[1] + M[5]]);
      Q.push([M[0] * tip[0] + M[2] * tip[1] + M[4], M[1] * tip[0] + M[3] * tip[1] + M[5]]);
      // giro do referencial no mundo (também para referenciais espelhados por flip)
      let th = dk < 0 ? Math.atan2(-M[1], -M[0]) : Math.atan2(M[1], M[0]);
      if (k) while (th - TH[k - 1] > PI) th -= 2 * PI;
      if (k) while (th - TH[k - 1] < -PI) th += 2 * PI;
      TH.push(th);
    }
    // pendulo (0..1): a parte procura ficar pendurada pela gravidade quando o pai inclina (cabelo, brinco, lustre)
    const pend = o.pendulo ?? 0;
    const wd = z < 1 ? w * sqrt(1 - z * z) : 0;
    let d = 0, dp = 0;
    for (let k = 1; k <= N; k++) {
      const ax = (P[k - 1][0] - 2 * P[k][0] + P[k + 1][0]) / (dt * dt), ay = (P[k - 1][1] - 2 * P[k][1] + P[k + 1][1]) / (dt * dt);
      const th2 = (TH[k - 1] - 2 * TH[k] + TH[k + 1]) / (dt * dt);
      const rx = Q[k][0] - P[k][0], ry = Q[k][1] - P[k][1], r2 = rx * rx + ry * ry || 1;
      // aceleração angular de inércia: torque da força fictícia (−m·a) no braço r, e o giro do referencial
      const u = (rx * -ay - ry * -ax) / r2 - th2;
      const s = k * dt;
      const h = z < 1 ? (Math.exp(-z * w * s) * sin(wd * s)) / wd : s * Math.exp(-w * s);
      d += h * u * dt;
      if (pend) dp -= h * pend * w * w * TH[k] * dt;
    }
    let deg = ((gain * d + dp) * 180) / PI;
    deg = mx * Math.tanh(deg / mx);
    return det < 0 ? -deg : deg;
  }

  /**
   * SQUASH & STRETCH automático: mede velocidade e aceleração do ponto-base do nó (espaço da camada) e
   * devolve uma deformação de área constante — estica ao longo da velocidade, achata na direção de
   * impactos/freadas bruscas. n.squash: k | true | { k, base: [x, y], tam, janela }.
   */
  squashMat(n, t, env) {
    const o = typeof n.squash === 'number' ? { k: n.squash } : n.squash === true ? {} : V(n.squash, t, env);
    if (!o) return null;
    const k = (o.k ?? 1) * (env.exagero ?? 1);
    if (!k) return null;
    const h = o.janela ?? 0.05;
    const b = o.base ?? [n.px === undefined ? 0 : V(n.px, t, env), n.py === undefined ? 0 : V(n.py, t, env)];
    const ap = M => [M[0] * b[0] + M[2] * b[1] + M[4], M[1] * b[0] + M[3] * b[1] + M[5]];
    const M0 = this.worldAt(t, env), p0 = ap(M0), pm = ap(this.worldAt(t - h, env)), pp = ap(this.worldAt(t + h, env));
    const vx = (pp[0] - pm[0]) / (2 * h), vy = (pp[1] - pm[1]) / (2 * h);
    const ax = (pp[0] - 2 * p0[0] + pm[0]) / (h * h), ay = (pp[1] - 2 * p0[1] + pm[1]) / (h * h);
    const sc = sqrt(abs(M0[0] * M0[3] - M0[1] * M0[2])) || 1;
    let size = o.tam;
    if (!size) {
      const bb = this.nodeBox(n, t, env);
      size = bb ? max(bb[2] - bb[0], bb[3] - bb[1]) : 100;
    }
    size = max(4, size * sc);
    const v = hypot(vx, vy), a = hypot(ax, ay);
    const ev = k * min(0.36, (0.0105 * v) / size);
    const ea = k * min(0.36, 0.0011 * max(0, a / size - 60));
    if (ev < 0.004 && ea < 0.004) return null;
    // T = Sa · Sv no espaço da camada
    const S = (ang, s) => {
      const c = cos(ang), sn = sin(ang), i = 1 / s;
      // R(ang)·diag(s, 1/s)·R(−ang)
      return [c * c * s + sn * sn * i, c * sn * (s - i), c * sn * (s - i), sn * sn * s + c * c * i];
    };
    const mul2 = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3]];
    let T = [1, 0, 0, 1];
    if (ev >= 0.004) T = S(Math.atan2(vy, vx), 1 + ev);
    if (ea >= 0.004) T = mul2(S(Math.atan2(ay, ax), 1 / (1 + ea)), T);
    // para o espaço local: L⁻¹ · T · L (L = parte linear de M0)
    const L = [M0[0], M0[1], M0[2], M0[3]], det = L[0] * L[3] - L[1] * L[2] || 1;
    const Li = [L[3] / det, -L[1] / det, -L[2] / det, L[0] / det];
    return { T: mul2(Li, mul2(T, L)), b };
  }

  kids(n, t, env) {
    return typeof n.children === 'function' ? flat(n.children(t, env)) : n.children ?? [];
  }

  drawGroup(ctx, n, inh, t, env, alpha) {
    // peça única: grupos de formas repetidas (penas, escamas, pétalas, dedos) mantêm o volume de cada forma;
    // `parte` num grupo fixa a força da sombra própria para tudo dentro dele
    if (this.partK !== undefined && !n.merge) {
      const ov = n.parte !== undefined ? V(n.parte, t, env) : repeticao(n) ? 1 : undefined;
      if (ov !== undefined) {
        const pv = this.partOv;
        this.partOv = ov;
        try {
          return this.drawGroupInner(ctx, n, inh, t, env, alpha);
        } finally {
          this.partOv = pv;
        }
      }
    }
    return this.drawGroupInner(ctx, n, inh, t, env, alpha);
  }

  drawGroupInner(ctx, n, inh, t, env, alpha) {
    const inh2 = this.inherit(inh, n, t, env);
    if (n.merge && V(n.merge, t, env)) {
      const p = new Path2D();
      this.collect(p, this.kids(n, t, env), [1, 0, 0, 1, 0, 0], t, env);
      const b = p.getBounds();
      if (!(b[2] > b[0])) return;
      if (alpha < 1) ctx.globalAlpha *= alpha;
      this.drawShape(ctx, n, { path: p, bb: b, complex: true }, inh2, t, env);
      return;
    }
    const blur = n.blur === undefined ? 0 : V(n.blur, t, env);
    const glow = n.glow === undefined ? null : V(n.glow, t, env);
    const drop = n.drop === undefined ? null : V(n.drop, t, env);
    const blend = n.blend === undefined ? null : V(n.blend, t, env);
    const iso = blur > 0 || glow || drop || blend || (alpha < 0.999 && n.iso !== false) || (n.iso && V(n.iso, t, env));
    const kids = this.kids(n, t, env);
    if (!iso) {
      if (n.clip) ctx.clip(this.clipPath(n.clip, t, env));
      for (const c of kids) this.drawNode(ctx, c, inh2, t, env);
      return;
    }
    const off = this.acquire(ctx.canvas.width, ctx.canvas.height);
    const ox = off.getContext('2d');
    const M = ctx.getTransform();
    ox.setTransform(M.a, M.b, M.c, M.d, M.e, M.f);
    if (n.clip) ox.clip(this.clipPath(n.clip, t, env));
    for (const c of kids) this.drawNode(ox, c, inh2, t, env);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha *= alpha;
    if (blend) ctx.globalCompositeOperation = blendOp(blend);
    const ds = sqrt(abs(M.a * M.d - M.b * M.c));
    if (drop) {
      ctx.shadowColor = drop.c ?? 'rgba(20,10,40,0.45)';
      ctx.shadowBlur = (drop.blur ?? 12) * ds;
      ctx.shadowOffsetX = (drop.x ?? 0) * ds;
      ctx.shadowOffsetY = (drop.y ?? 8) * ds;
    }
    if (blur > 0) this.drawBlurred(ctx, off, blur * ds);
    else ctx.drawImage(off, 0, 0);
    ctx.shadowColor = 'rgba(0,0,0,0)';
    if (glow) this.glowImage(ctx, off, typeof glow === 'number' ? { r: glow * ds / this.s } : { ...glow, r: (glow.r ?? 20) * ds / this.s });
    ctx.restore();
    this.release(off);
  }

  clipPath(c, t, env) {
    const g = this.geom(c, t, env);
    const m = localMat(c, t, env);
    if (!m) return g.path;
    const p = new Path2D();
    p.addPath(g.path, new DOMMatrix(m));
    return p;
  }

  /** Junta caminhos dos filhos (para grupos merge: uma silhueta única sombreada como um todo). */
  collect(p, kids, M, t, env) {
    for (const c of kids) {
      if (!c || (c.show && (t < c.show[0] || t >= c.show[1]))) continue;
      const lm = localMat(c, t, env);
      const M2 = lm ? mulMat(M, lm) : M;
      if (c.type === 'group') this.collect(p, this.kids(c, t, env), M2, t, env);
      else if (c.type === 'particles') {
        const dm = new DOMMatrix(M2);
        for (const q of this.evalParticles(c, t, env)) {
          const s = new Path2D();
          s.ellipse(q.x, q.y, q.size * q.sx, q.size * q.sy, q.ang, 0, TAU);
          p.addPath(s, dm);
        }
      } else if (c.type === 'dyn') this.collect(p, flat(c.fn(t, env)), M2, t, env);
      else if (c.type === 'limb') p.addPath(this.limbGeom(c, t, env).g.path, new DOMMatrix(M2));
      else if (['blob', 'poly', 'ellipse', 'rect', 'path', 'taper'].includes(c.type)) p.addPath(this.geom(c, t, env).path, new DOMMatrix(M2));
    }
  }

  geom(n, t, env) {
    if (n._g) return n._g;
    if (n._dyn === undefined) {
      n._dyn =
        isAnim(n.pts) || isAnim(n.ell) || isAnim(n.rc) || isAnim(n.r) || isAnim(n.round) || isAnim(n.grow) ||
        typeof n.d === 'function' || n.d instanceof KF ||
        n.w instanceof KF || (Array.isArray(n.w) && isAnim(n.w));
    }
    // geometria animada: a peça única pede a mesma forma 3× no quadro (medida, máscara, cor)
    if (n._dyn && n._gT === t && n._gE === env) return n._gV;
    let p, wmax;
    switch (n.type) {
      case 'blob': {
        const pts = deepV(n.pts, t, env);
        p = blobPath(pts, n.round === undefined ? 1 : V(n.round, t, env));
        break;
      }
      case 'poly': {
        p = polyPath(deepV(n.pts, t, env));
        const r = n.r === undefined ? 0 : V(n.r, t, env);
        if (r > 0) p.round(r);
        break;
      }
      case 'ellipse': {
        const [cx, cy, rx, ry] = deepV(n.ell, t, env);
        p = new Path2D();
        p.ellipse(cx, cy, abs(rx) || 0.01, abs(ry) || 0.01, 0, 0, TAU);
        break;
      }
      case 'rect': {
        const [x, y, w, h] = deepV(n.rc, t, env);
        const r = n.r === undefined ? 0 : V(n.r, t, env);
        p = new Path2D();
        if (r > 0) p.roundRect(x, y, w, h, r);
        else p.rect(x, y, w, h);
        break;
      }
      case 'path': {
        const d = V(n.d, t, env);
        p = this.pathCache.get(d);
        if (!p) {
          p = new Path2D(d);
          if (this.pathCache.size > 2000) this.pathCache.clear();
          this.pathCache.set(d, p);
        }
        break;
      }
      case 'taper': {
        let pts = deepV(n.pts, t, env);
        const w = typeof n.w === 'function' ? n.w : deepV(n.w, t, env);
        const grow = n.grow === undefined ? 1 : V(n.grow, t, env);
        if (grow < 1) pts = cutPts(pts, grow);
        p = taperPath(pts, w, { round: n.round === undefined ? 1 : V(n.round, t, env), caps: n.caps ?? 'round' });
        wmax = typeof w === 'number' ? w : Array.isArray(w) ? max(...w) : 0;
        if (!wmax) {
          const W = widthFn(w);
          for (let i = 0; i <= 8; i++) wmax = max(wmax, W(i / 8));
        }
        break;
      }
      default:
        throw new Error(`bamoo: geom não suportada para "${n.type}"`);
    }
    const g = { path: p, bb: p.getBounds(), complex: n.type === 'path', wmax };
    if (!n._dyn) n._g = g;
    else {
      n._gT = t;
      n._gE = env;
      n._gV = g;
    }
    return g;
  }

  paint(ctx, f, bb) {
    if (typeof f === 'string') return f;
    if (Array.isArray(f)) f = { grad: 'lin', a: 90, stops: f };
    if (!f || !f.grad) throw new Error(`bamoo: fill inválido ${JSON.stringify(f)}`);
    const [x0, y0, x1, y1] = bb;
    const bw = x1 - x0 || 1, bh = y1 - y0 || 1;
    let g;
    if (f.grad === 'lin') {
      if (Array.isArray(f.a)) g = ctx.createLinearGradient(f.a[0], f.a[1], f.a[2], f.a[3]);
      else {
        const a = ((f.a ?? 90) * PI) / 180, ca = cos(a), sa = sin(a);
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const ext = abs((bw / 2) * ca) + abs((bh / 2) * sa);
        g = ctx.createLinearGradient(cx - ca * ext, cy - sa * ext, cx + ca * ext, cy + sa * ext);
      }
    } else {
      let cx, cy, r;
      if (Array.isArray(f.c)) [cx, cy, r] = f.c;
      else {
        const o = f.c ?? {};
        cx = x0 + (o.x ?? 0.5) * bw;
        cy = y0 + (o.y ?? 0.5) * bh;
        r = (o.r ?? 0.5) * max(bw, bh);
      }
      g = ctx.createRadialGradient(cx, cy, 0, cx, cy, max(0.01, r));
    }
    const S = f.stops, n = S.length;
    for (let i = 0; i < n; i++) {
      const s = S[i];
      if (Array.isArray(s)) g.addColorStop(clamp(s[0]), s[1]);
      else g.addColorStop(n === 1 ? 0 : i / (n - 1), s);
    }
    return g;
  }

  drawShape(ctx, n, g, inh, t, env, sizeHint) {
    if (this.sil) return this.drawShapeSil(ctx, n, g, inh, t, env);
    const fill = this.st(n, 'fill', inh, t, env);
    const stroke = n.type === 'taper' ? (n.stroke !== undefined ? V(n.stroke, t, env) : null) : this.st(n, 'stroke', inh, t, env);
    const blur = n.blur === undefined || n.type === 'group' ? 0 : V(n.blur, t, env);
    const M = ctx.getTransform();
    const ds = sqrt(abs(M.a * M.d - M.b * M.c));
    const rule = n.rule === 'evenodd' ? 'evenodd' : 'nonzero';
    const blend = n.type !== 'group' && n.blend ? V(n.blend, t, env) : null;
    if (blend) ctx.globalCompositeOperation = blendOp(blend);
    const drop = n.type !== 'group' && n.drop ? V(n.drop, t, env) : null;
    if (blur > 0) {
      // limita a região do filtro (sem isso o Skia desfoca a tela inteira)
      ctx.save();
      clipBox(ctx, g.bb, blur * 3 + 2);
      ctx.filter = `blur(${blur * ds}px)`;
    }
    if (drop) {
      ctx.shadowColor = drop.c ?? 'rgba(20,10,40,0.45)';
      ctx.shadowBlur = (drop.blur ?? 12) * ds;
      ctx.shadowOffsetX = (drop.x ?? 0) * ds;
      ctx.shadowOffsetY = (drop.y ?? 8) * ds;
    }
    if (this.bbAcc) accBox(this.bbAcc, M, g.bb, blur * 3);
    if (fill) {
      ctx.fillStyle = this.paint(ctx, fill, g.bb);
      ctx.fill(g.path, rule);
    }
    if (drop) {
      ctx.shadowColor = 'rgba(0,0,0,0)';
      ctx.shadowBlur = 0;
    }
    if (blur > 0) ctx.restore();
    if (fill && !(blur > 0) && !blend) {
      const size = sizeHint ?? min(g.bb[2] - g.bb[0], g.bb[3] - g.bb[1]);
      let tex = this.st(n, 'tex', inh, t, env);
      if (tex == null) {
        // textura automática do estilo (pincel seco em superfícies grandes); tex: false desliga
        const at = inh.look?.autoTex;
        tex = at && size * ds >= (at.min ?? 70) * this.s ? at : null;
      }
      const lz = inh.look?.autoLuz;
      const pk = this.partK;
      // na peça única o banho de luz é do corpo inteiro (não recomeça em cada peça)
      const wash = pk === undefined && lz > 0 && n.luz !== false && size * ds >= 50 * this.s;
      let shade = this.st(n, 'shade', inh, t, env);
      let hl = this.st(n, 'hl', inh, t, env);
      if (pk !== undefined) {
        const look = inh.look ?? DEFAULT_LOOK;
        let k = n.parte !== undefined ? V(n.parte, t, env) : this.partOv ?? pk;
        if (n.parte === undefined && this.partOv === undefined && this.partArea > 0) {
          // só as formas que SÃO a peça (tronco, braço, rosto) perdem a meia-lua própria;
          // formas pequenas dentro da peça (penas, escamas, dedos, mechas) continuam com volume
          const b = [Infinity, Infinity, -Infinity, -Infinity];
          accBox(b, M, g.bb, 0);
          const r = ((b[2] - b[0]) * (b[3] - b[1])) / this.partArea;
          k = lerp(1, k, smooth(0.18, 0.5, r));
        }
        shade = scaleFx(shade, k, look.shade);
        hl = scaleFx(hl, k, look.hl);
      }
      const sh = (shade || hl) && size * ds > 5;
      if (tex || wash || sh) {
        // um único recorte pela forma para textura, banho de luz, sombra e realce (antes: um clip por efeito;
        // o recorte é o mesmo, então o resultado é idêntico e o Skia monta a máscara de cobertura uma vez só)
        ctx.save();
        ctx.clip(g.path, rule);
        if (tex) this.applyTex(ctx, g, tex, rule, true);
        if (wash) this.applyWash(ctx, g, lz, inh, M, rule, true);
        if (sh) this.applyShade(ctx, g, size, shade, hl, inh, M, ds, rule, true);
        ctx.restore();
      }
    }
    if (stroke) {
      ctx.lineWidth = this.st(n, 'lw', inh, t, env) ?? 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = this.paint(ctx, stroke, g.bb);
      ctx.stroke(g.path);
    }
    const glow = n.type !== 'group' && n.glow ? V(n.glow, t, env) : null;
    if (glow) {
      const sp = typeof glow === 'number' ? { r: glow } : glow;
      ctx.save();
      clipBox(ctx, g.bb, (sp.r ?? 20) * 3 + (sp.spread ?? 0) + 2);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha *= sp.a ?? 0.85;
      ctx.filter = `blur(${(sp.r ?? 20) * ds}px)`;
      ctx.fillStyle = sp.c ?? (typeof fill === 'string' ? fill : inh.light);
      ctx.fill(g.path, rule);
      if (sp.spread) {
        ctx.lineWidth = sp.spread;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.stroke(g.path);
      }
      ctx.restore();
    }
    if (blend) ctx.globalCompositeOperation = 'source-over';
  }

  /** Teste da silhueta (staging): cada forma chapada na cor do seu plano; efeitos de luz não aparecem. */
  drawShapeSil(ctx, n, g, inh, t, env) {
    const blend = n.type !== 'group' && n.blend ? V(n.blend, t, env) : null;
    if (blend && blend !== 'source-over' && !this.silTudo) return; // luzes, brilhos, sombras de multiply
    const fill = this.st(n, 'fill', inh, t, env);
    const stroke = n.type === 'taper' ? null : this.st(n, 'stroke', inh, t, env);
    const clear = c => typeof c === 'string' && /^#([0-9a-f]{3}0|[0-9a-f]{6}00)$/i.test(c);
    const rule = n.rule === 'evenodd' ? 'evenodd' : 'nonzero';
    if (this.bbAcc) accBox(this.bbAcc, ctx.getTransform(), g.bb, 0);
    if (fill && !clear(fill)) {
      // chão/paredes do plano focal (formas maiores que a tela) ficam cinza: o preto é só para os atores
      const M = ctx.getTransform(), ds = sqrt(abs(M.a * M.d - M.b * M.c)) * (this.curLayerF ?? 1);
      const big = this.curFocal && (g.bb[2] - g.bb[0]) * ds > this.W * 1.15;
      ctx.fillStyle = big ? '#a8a49c' : this.silCol ?? '#141414';
      ctx.fill(g.path, rule);
    }
    if (stroke && !clear(stroke)) {
      ctx.lineWidth = this.st(n, 'lw', inh, t, env) ?? 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = this.silCol ?? '#141414';
      ctx.stroke(g.path);
    }
  }

  applyTex(ctx, g, spec, rule, clipped = false) {
    let k = 'grain', a, s = 1, rot = 0, mode;
    if (typeof spec === 'string') k = spec;
    else if (typeof spec === 'number') a = spec;
    else {
      k = spec.k ?? 'grain';
      a = spec.a;
      s = spec.s ?? 1;
      rot = spec.rot ?? 0;
      mode = spec.mode;
    }
    const def = TEX_MODE[k];
    if (!def) throw new Error(`bamoo: textura desconhecida "${k}"`);
    const pat = this.pattern(ctx, k);
    const r = (rot * PI) / 180;
    pat.setTransform(new DOMMatrix([cos(r) * s, sin(r) * s, -sin(r) * s, cos(r) * s, 0, 0]));
    ctx.save();
    if (!clipped) ctx.clip(g.path, rule);
    ctx.globalCompositeOperation = blendOp(mode ?? def[0]);
    ctx.globalAlpha *= a ?? def[1];
    ctx.fillStyle = pat;
    const [x0, y0, x1, y1] = g.bb;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  }

  /** Banho de luz: degradê soft-light da cor da luz (lado do sol) para a cor da sombra (lado oposto). */
  applyWash(ctx, g, a, inh, M, rule, clipped = false) {
    const inv = M.inverse();
    const sun = inh.sun ?? [-0.55, -0.85];
    let lx = inv.a * sun[0] + inv.c * sun[1], ly = inv.b * sun[0] + inv.d * sun[1];
    const ll = hypot(lx, ly) || 1;
    lx /= ll;
    ly /= ll;
    const [x0, y0, x1, y1] = g.bb, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const ext = abs(((x1 - x0) / 2) * lx) + abs(((y1 - y0) / 2) * ly);
    const gr = ctx.createLinearGradient(cx + lx * ext, cy + ly * ext, cx - lx * ext, cy - ly * ext);
    gr.addColorStop(0, inh.light ?? '#fff2d8');
    gr.addColorStop(0.5, '#808080');
    gr.addColorStop(1, inh.shadow ?? '#43306a');
    ctx.save();
    if (!clipped) ctx.clip(g.path, rule);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha *= min(1, a);
    ctx.fillStyle = gr;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  }

  /** Sombra própria + realce em "meia-lua" a partir da direção da luz (o visual ilustrado). */
  applyShade(ctx, g, size, shade, hl, inh, M, ds, rule, clipped = false) {
    const inv = M.inverse();
    const sun = inh.sun ?? [-0.55, -0.85];
    let lx = inv.a * sun[0] + inv.c * sun[1], ly = inv.b * sun[0] + inv.d * sun[1];
    const ll = hypot(lx, ly) || 1;
    lx /= ll;
    ly /= ll;
    const look = inh.look ?? DEFAULT_LOOK;
    const [x0, y0, x1, y1] = g.bb;
    // área aproximada em pixels de tela (desfoque em áreas enormes é caro => usa degraus)
    const area = min((x1 - x0) * ds, this.W * 1.2) * min((y1 - y0) * ds, this.H * 1.2);
    // formas complexas (uniões/sobreposições): simplifica uma vez para contornos sem sobreposição
    let src = g.path, eo = rule === 'evenodd';
    if (g.complex) {
      if (!g.simple) {
        g.simple = new Path2D(g.path);
        g.simple.simplify();
      }
      src = g.simple;
      eo = false;
    }
    const part = (spec, dDef, sign, color, op) => {
      const o = typeof spec === 'number' ? { a: spec } : spec === true ? {} : spec;
      const a = o.a ?? (sign > 0 ? look.shade : look.hl);
      if (!(a > 0)) return;
      const d = o.dp ?? (o.d ?? dDef) * size; // dp = distância absoluta (unidades locais)
      const soft = (o.soft ?? look.soft) * d;
      const bp = min(soft * ds, 14 * this.s);
      const useBlur = bp > 0.6 && area < 420000;
      const steps = !useBlur && bp > 0.6 ? [0.8, 1.2] : [1];
      const pad = d * 1.3 + (useBlur ? bp / ds * 3 : 0) + 2;
      ctx.save();
      if (!clipped) ctx.clip(g.path, rule);
      ctx.globalCompositeOperation = op;
      ctx.globalAlpha *= min(1, a) / steps.length;
      ctx.fillStyle = o.c ?? color;
      if (useBlur) ctx.filter = `blur(${bp}px)`;
      for (const k of steps) {
        const dx = sign * lx * d * k, dy = sign * ly * d * k;
        // região = caixa da forma menos a forma deslocada; recortada pela forma original
        const R = new Path2D();
        R.rect(x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad);
        const sh = new Path2D();
        sh.addPath(src, new DOMMatrix([1, 0, 0, 1, dx, dy]));
        if (eo) {
          R.op(sh, PathOp.Difference);
          ctx.fill(R);
        } else {
          R.addPath(sh);
          ctx.fill(R, 'evenodd');
        }
      }
      ctx.restore();
    };
    if (shade) part(shade, look.shadeD, 1, inh.shadow ?? look.shadow, 'multiply');
    if (hl) part(hl, look.hlD, -1, inh.light ?? look.light, 'screen');
  }

  drawLine(ctx, n, inh, t, env) {
    let pts = deepV(n.pts, t, env);
    const grow = n.grow === undefined ? 1 : V(n.grow, t, env);
    if (grow <= 0) return;
    if (grow < 1) pts = cutPts(pts, grow);
    const p = curvePath(pts, n.round === undefined ? 1 : V(n.round, t, env));
    if (n.closed) p.closePath();
    const M = ctx.getTransform();
    const ds = sqrt(abs(M.a * M.d - M.b * M.c));
    ctx.lineWidth = n.lw !== undefined ? V(n.lw, t, env) : inh.lw ?? 3;
    ctx.lineCap = n.cap ?? 'round';
    ctx.lineJoin = 'round';
    if (this.sil && n.blend && !this.silTudo) return;
    const col = this.sil ? this.silCol : n.stroke !== undefined ? V(n.stroke, t, env) : inh.stroke ?? '#1d1a2b';
    const bb = p.getBounds();
    if (this.bbAcc) accBox(this.bbAcc, M, bb, ctx.lineWidth);
    ctx.strokeStyle = this.paint(ctx, col, bb);
    if (n.dash) {
      ctx.setLineDash(V(n.dash, t, env));
      ctx.lineDashOffset = n.dashOff === undefined ? 0 : V(n.dashOff, t, env);
    }
    if (n.blend) ctx.globalCompositeOperation = blendOp(V(n.blend, t, env));
    const blur = n.blur === undefined ? 0 : V(n.blur, t, env);
    const glowV = n.glow ? V(n.glow, t, env) : null;
    if (blur > 0 || glowV) clipBox(ctx, bb, ctx.lineWidth + 3 * max(blur, glowV?.r ?? glowV ?? 0) + 2);
    if (blur > 0) ctx.filter = `blur(${blur * ds}px)`;
    ctx.stroke(p);
    if (glowV) {
      const sp = typeof glowV === 'number' ? { r: glowV } : glowV;
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha *= sp.a ?? 0.85;
      ctx.filter = `blur(${(sp.r ?? 12) * ds}px)`;
      if (sp.c) ctx.strokeStyle = sp.c;
      ctx.stroke(p);
    }
    ctx.filter = 'none';
    ctx.setLineDash([]);
  }

  limbGeom(n, t, env) {
    const a = deepV(n.a, t, env), b = deepV(n.b, t, env);
    const [l1, l2] = deepV(n.len, t, env);
    const bend = n.bend === undefined ? 1 : V(n.bend, t, env);
    const { j, e } = ik2(a, b, l1, l2, bend);
    let w = deepV(n.w, t, env);
    if (typeof w === 'number') w = [w, w, w];
    if (w.length === 2) w = [w[0], (w[0] + w[1]) / 2, w[1]];
    const uj = l1 / (l1 + l2);
    const W = u => (u < uj ? lerp(w[0], w[1], u / uj) : lerp(w[1], w[2], (u - uj) / (1 - uj)));
    const jr = n.joint === undefined ? 0.7 : V(n.joint, t, env);
    const pts = [a, [lerp(a[0], j[0], 0.5), lerp(a[1], j[1], 0.5)], [j[0], j[1], jr], [lerp(j[0], e[0], 0.5), lerp(j[1], e[1], 0.5)], e];
    const p = taperPath(pts, W, { caps: n.caps ?? 'round' });
    return { g: { path: p, bb: p.getBounds() }, j, e, wmax: max(...w) };
  }

  drawLimb(ctx, n, inh, t, env) {
    const L = this.limbGeom(n, t, env);
    this.drawShape(ctx, n, L.g, inh, t, env, L.wmax);
    if (n.end) {
      ctx.save();
      ctx.translate(L.e[0], L.e[1]);
      const ang = Math.atan2(L.e[1] - L.j[1], L.e[0] - L.j[0]);
      if (n.endAbs !== undefined) ctx.rotate((V(n.endAbs, t, env) * PI) / 180);
      else ctx.rotate(ang + ((n.endRot === undefined ? 0 : V(n.endRot, t, env)) * PI) / 180);
      this.drawNode(ctx, n.end, this.inherit(inh, n, t, env), t, env);
      ctx.restore();
    }
  }

  drawText(ctx, n, inh, t, env) {
    if (this.probe) this.probe.texts.push({ scene: this.curScene, t, str: String(V(n.str, t, env)).split('\n').join(' / ').slice(0, 40) });
    let str = String(V(n.str, t, env));
    const reveal = n.reveal === undefined ? 1 : V(n.reveal, t, env);
    if (reveal < 1) str = str.slice(0, floor(str.length * clamp(reveal)));
    if (!str) return;
    const size = n.size === undefined ? 48 : V(n.size, t, env);
    const fam = fontFamily(n.font === undefined ? 'sans' : V(n.font, t, env));
    ctx.font = `${n.weight ?? ''} ${size}px "${fam}"`.trim();
    ctx.textAlign = n.align ?? 'center';
    ctx.textBaseline = n.base ?? 'middle';
    if (n.ls) ctx.letterSpacing = `${V(n.ls, t, env)}px`;
    const lines = str.split('\n');
    const lh = size * (n.lh ?? 1.2);
    const y0 = -((lines.length - 1) * lh) / 2;
    const M = ctx.getTransform();
    const ds = sqrt(abs(M.a * M.d - M.b * M.c));
    const fill = this.sil ? this.silCol : n.fill !== undefined ? V(n.fill, t, env) : inh.fill ?? '#1d1a2b';
    if (n.drop) {
      const d = V(n.drop, t, env);
      ctx.shadowColor = d.c ?? 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = (d.blur ?? 8) * ds;
      ctx.shadowOffsetX = (d.x ?? 0) * ds;
      ctx.shadowOffsetY = (d.y ?? 3) * ds;
    }
    if (n.blend) ctx.globalCompositeOperation = blendOp(V(n.blend, t, env));
    lines.forEach((ln, i) => {
      if (n.stroke) {
        ctx.lineWidth = n.lw ?? 4;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = V(n.stroke, t, env);
        ctx.strokeText(ln, 0, y0 + i * lh);
      }
      ctx.fillStyle = this.paint(ctx, fill, [-size, -size, size, size]);
      ctx.fillText(ln, 0, y0 + i * lh);
    });
    if (n.ls) ctx.letterSpacing = '0px';
  }

  // ---------- partículas (analíticas: cada frame é independente => render paralelo) ----------
  evalParticles(o, t, env) {
    const seed = o.seed ?? o.id;
    const rate = o.rate === undefined ? 0 : V(o.rate, t, env);
    const burst = o.burst ?? 0;
    const t0 = o.t0 ?? 0, t1 = o.t1 ?? Infinity;
    const [lA, lB] = range2(o.life, 1);
    const [sA, sB] = range2(o.size, 6);
    const [vA, vB] = range2(o.speed, 100);
    const dir = o.dir ?? -90, spread = o.spread ?? 30;
    const [gx, gy] = o.grav ?? [0, 0];
    const k = o.drag ?? 0;
    const grow = o.grow ?? 1;
    const area = o.area ?? 0;
    const fi = o.fadeIn ?? 0.1, fo = o.fadeOut ?? 0.35;
    const aVar = o.alphaVar ?? 0.3;
    const turb = o.turb ?? 0, turbF = o.turbF ?? 1.5;
    const colors = o.color === undefined ? null : Array.isArray(o.color) ? o.color : [o.color];
    const atFn = typeof o.at === 'function' ? o.at : null;
    const at0 = atFn ? null : o.at ?? [0, 0];
    const out = [];
    const spawn = (i, ts) => {
      const age = t - ts;
      if (age < 0) return;
      const h = j => hash(i * 16 + j, seed);
      const life = lA + (lB - lA) * h(0);
      if (age > life) return;
      const u = age / life;
      let [x0, y0] = atFn ? atFn(ts, env) : at0;
      if (area) {
        if (Array.isArray(area)) {
          x0 += (h(1) - 0.5) * area[0];
          y0 += (h(2) - 0.5) * area[1];
        } else {
          const ang = h(1) * TAU, rr = sqrt(h(2)) * area;
          x0 += cos(ang) * rr;
          y0 += sin(ang) * rr;
        }
      }
      const a = ((dir + (h(3) - 0.5) * spread) * PI) / 180;
      const sp = vA + (vB - vA) * h(4);
      let vx = cos(a) * sp, vy = sin(a) * sp;
      if (o.inherit && atFn) {
        const p1 = atFn(ts + 0.01, env), p0 = atFn(ts - 0.01, env);
        vx += ((p1[0] - p0[0]) / 0.02) * o.inherit;
        vy += ((p1[1] - p0[1]) / 0.02) * o.inherit;
      }
      let x, y, cvx, cvy;
      if (k > 0) {
        const e = exp(-k * age), f = (1 - e) / k;
        x = x0 + (vx - gx / k) * f + (gx / k) * age;
        y = y0 + (vy - gy / k) * f + (gy / k) * age;
        cvx = (vx - gx / k) * e + gx / k;
        cvy = (vy - gy / k) * e + gy / k;
      } else {
        x = x0 + vx * age + 0.5 * gx * age * age;
        y = y0 + vy * age + 0.5 * gy * age * age;
        cvx = vx + gx * age;
        cvy = vy + gy * age;
      }
      if (turb) {
        x += turb * noise(age * turbF + h(5) * 50, seed + 1) * min(1, age * 2);
        y += turb * noise(age * turbF + h(6) * 50, seed + 2) * min(1, age * 2);
      }
      let al = 1 - aVar * h(7);
      if (fi > 0 && u < fi) al *= u / fi;
      if (fo > 0 && u > 1 - fo) al *= (1 - u) / fo;
      const g = 1 + (grow - 1) * (1 - (1 - u) * (1 - u));
      const size = (sA + (sB - sA) * h(8)) * g;
      let color = colors ? colors[floor(h(9) * colors.length) % colors.length] : null;
      if (color && o.colorEnd) color = mix(color, o.colorEnd, smooth(0, 1, u));
      let sx = 1, sy = 1, ang = 0;
      if (o.stretch) {
        const v = hypot(cvx, cvy);
        sx = 1 + (o.stretch * v) / 100;
        sy = 1 / sqrt(sx);
        ang = Math.atan2(cvy, cvx);
      }
      const rot = (o.spin ? (h(10) - 0.5) * 2 * o.spin * age : 0) + h(11) * 360;
      out.push({ x, y, u, age, life, i, size, alpha: al, color, sx, sy, ang, rot, vx: cvx, vy: cvy, r: h(12) });
    };
    if (rate > 0) {
      const iMin = max(0, floor((t - lB - t0) * rate));
      const iMax = floor((min(t, t1) - t0) * rate);
      for (let i = iMin; i <= iMax; i++) spawn(i, t0 + (i + (o.jitter ?? 0.8) * (hash(i, seed + 99) - 0.5)) / rate);
    }
    for (let i = 0; i < burst; i++) spawn(1e6 + i, t0 + (o.burstSpread ?? 0) * hash(i, seed + 7));
    if (o.sort === 'size') out.sort((a, b) => b.size - a.size);
    return out;
  }

  drawParticles(ctx, n, inh, t, env) {
    if (this.sil && (n.blend || n.glow) && !this.silTudo) return;
    const list = this.evalParticles(n, t, env);
    if (!list.length) return;
    if (this.sil) {
      // silhueta: partículas viram manchas claras do plano (não competem com os personagens)
      ctx.fillStyle = this.silCol;
      const a0 = ctx.globalAlpha;
      for (const q of list) {
        ctx.globalAlpha = a0 * (this.silTudo ? 1 : 0.35) * q.alpha;
        ctx.beginPath();
        ctx.ellipse(q.x, q.y, max(0.01, q.size * q.sx), max(0.01, q.size * q.sy), q.ang, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = a0;
      return;
    }
    if (n.merge) {
      const p = new Path2D();
      for (const q of list) {
        // moveTo evita a linha que o canvas traça ligando uma elipse à anterior
        const rx = q.size * q.sx;
        p.moveTo(q.x + rx * cos(q.ang), q.y + rx * sin(q.ang));
        p.ellipse(q.x, q.y, rx, q.size * q.sy, q.ang, 0, TAU);
      }
      const node = { ...n, type: 'group', fill: n.fill ?? (Array.isArray(n.color) ? n.color[0] : n.color) };
      this.drawShape(ctx, node, { path: p, bb: p.getBounds(), complex: true }, this.inherit(inh, n, t, env), t, env);
      return;
    }
    const inh2 = this.inherit(inh, n, t, env);
    const base = ctx.globalAlpha;
    if (n.blend) ctx.globalCompositeOperation = blendOp(V(n.blend, t, env));
    if (n.shape) {
      for (const q of list) {
        const node = n.shape(q, t, env);
        if (!node) continue;
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.globalAlpha = base * q.alpha;
        this.drawNode(ctx, node, inh2, t, env);
        ctx.restore();
      }
      return;
    }
    const M = ctx.getTransform();
    const ds = sqrt(abs(M.a * M.d - M.b * M.c));
    const simple = !(inh2.shade && n.shade) && !n.tex && !n.glow;
    const blur = n.blur === undefined ? 0 : V(n.blur, t, env);
    if (blur > 0) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of list) {
        const r = q.size * max(q.sx, q.sy);
        x0 = min(x0, q.x - r); y0 = min(y0, q.y - r); x1 = max(x1, q.x + r); y1 = max(y1, q.y + r);
      }
      ctx.save();
      clipBox(ctx, [x0, y0, x1, y1], blur * 3 + 2);
      ctx.filter = `blur(${blur * ds}px)`;
    }
    for (const q of list) {
      const col = q.color ?? inh2.fill ?? '#fff';
      ctx.globalAlpha = base * q.alpha;
      if (simple) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(q.x, q.y, max(0.01, q.size * q.sx), max(0.01, q.size * q.sy), q.ang, 0, TAU);
        ctx.fill();
      } else {
        const p = new Path2D();
        p.ellipse(q.x, q.y, max(0.01, q.size * q.sx), max(0.01, q.size * q.sy), q.ang, 0, TAU);
        this.drawShape(ctx, { type: 'blob', fill: col, glow: n.glow, tex: n.tex }, { path: p, bb: p.getBounds() }, inh2, t, env);
      }
    }
    if (blur > 0) ctx.restore();
    ctx.globalAlpha = base;
  }

  // ---------- raios de luz ----------
  drawRays(ctx, n, inh, t, env) {
    const g = k => (n[k] === undefined ? undefined : V(n[k], t, env));
    const [ox, oy] = g('at') ?? [this.DW / 2, -50];
    const count = g('n') ?? 7, ang = g('ang') ?? 90, spread = g('spread') ?? 40, len = g('len') ?? 1400;
    const [wA, wB] = range2(g('w'), 120);
    const w0 = g('w0') ?? 10;
    const color = g('c') ?? '#fff6d8';
    const a = g('a') ?? 0.25;
    const sway = g('sway') ?? 4, speed = g('speed') ?? 0.15;
    const seed = n.seed ?? n.id;
    // raios são suaves: desenhados em 1/4 da resolução e ampliados (rápido)
    const TW = ctx.canvas.width, TH = ctx.canvas.height;
    const F = 4, w4 = max(2, round(TW / F)), h4 = max(2, round(TH / F));
    const off = this.small(w4, h4, 'rays');
    const ox2 = off.getContext('2d');
    const M = ctx.getTransform();
    ox2.setTransform(M.a / F, M.b / F, M.c / F, M.d / F, M.e / F, M.f / F);
    ox2.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const r1 = hash(i, seed), r2 = hash(i + 50, seed), r3 = hash(i + 99, seed);
      const ai = ((ang + (count > 1 ? (i / (count - 1) - 0.5) * spread : 0) + (r1 - 0.5) * spread * 0.3 + sway * noise(t * speed + i * 3.1, seed)) * PI) / 180;
      const wi = wA + (wB - wA) * r2;
      const li = len * (0.7 + 0.3 * r3);
      const dx = cos(ai), dy = sin(ai), nx = -dy, ny = dx;
      ox2.globalAlpha = a * (0.45 + 0.55 * r3) * (0.75 + 0.25 * noise(t * speed * 3 + i, seed + 5));
      ox2.beginPath();
      ox2.moveTo(ox + (nx * w0) / 2, oy + (ny * w0) / 2);
      ox2.lineTo(ox + dx * li + (nx * wi) / 2, oy + dy * li + (ny * wi) / 2);
      ox2.lineTo(ox + dx * li - (nx * wi) / 2, oy + dy * li - (ny * wi) / 2);
      ox2.lineTo(ox - (nx * w0) / 2, oy - (ny * w0) / 2);
      ox2.closePath();
      ox2.fill();
    }
    // desvanece com a distância da origem
    ox2.globalAlpha = 1;
    ox2.globalCompositeOperation = 'destination-in';
    const rg = ox2.createRadialGradient(ox, oy, 0, ox, oy, len);
    rg.addColorStop(0, '#000');
    rg.addColorStop(g('fade') ?? 0.35, '#000c');
    rg.addColorStop(1, '#0000');
    ox2.fillStyle = rg;
    ox2.fillRect(ox - len, oy - len, len * 2, len * 2);
    const ds = sqrt(abs(M.a * M.d - M.b * M.c));
    const bl = this.small(w4, h4, 'rays2');
    const bx = bl.getContext('2d');
    bx.filter = `blur(${((g('blur') ?? wA * 0.35) * ds) / F}px)`;
    bx.drawImage(off, 0, 0);
    bx.filter = 'none';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = blendOp(g('blend') ?? 'screen');
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(bl, 0, 0, w4, h4, 0, 0, TW, TH);
    ctx.restore();
  }

  // ---------- pós ----------
  scenePost(cv, sc, look, t, env) {
    const ctx = cv.getContext('2d');
    resetCtx(ctx);
    const W = this.W, H = this.H;
    if (look.bloom > 0 && !this.sil) {
      const w = max(2, round(W / 4)), h = max(2, round(H / 4));
      const sm = this.small(w, h, 'bloom1');
      const sx = sm.getContext('2d');
      sx.filter = `brightness(${look.bloomB ?? 0.85}) contrast(${look.bloomC ?? 2.4})`;
      sx.drawImage(cv, 0, 0, w, h);
      sx.filter = 'none';
      const sm2 = this.small(w, h, 'bloom2');
      const s2 = sm2.getContext('2d');
      s2.filter = `blur(${h / 28}px)`;
      s2.drawImage(sm, 0, 0);
      s2.filter = 'none';
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = min(1, look.bloom);
      ctx.imageSmoothingQuality = 'low';
      ctx.drawImage(sm2, 0, 0, w, h, 0, 0, W, H);
      resetCtx(ctx);
    }
    if (look.paper > 0 && !this.sil) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = look.paper;
      const p = this.pattern(ctx, 'paper');
      p.setTransform(new DOMMatrix([this.s, 0, 0, this.s, 0, 0]));
      ctx.fillStyle = p;
      ctx.fillRect(0, 0, W, H);
      resetCtx(ctx);
    }
    // fade de entrada/saída da cena
    const fin = sc.fadeIn ?? 0, fout = sc.fadeOut ?? 0;
    let fade = 0;
    if (fin > 0 && t < fin) fade = 1 - smooth(0, fin, t);
    if (fout > 0 && t > sc.dur - fout) fade = max(fade, smooth(sc.dur - fout, sc.dur, t));
    if (fade > 0) {
      ctx.globalAlpha = fade;
      ctx.fillStyle = sc.fadeC ?? '#000';
      ctx.fillRect(0, 0, W, H);
      resetCtx(ctx);
    }
    // legendas
    const caps = sc.captions;
    if (caps?.length) {
      const c = look.caption;
      for (const cap of caps) {
        const [a, b, txt] = cap;
        if (t < a || t >= b) continue;
        const al = min(1, (t - a) / 0.18, (b - t) / 0.18);
        ctx.save();
        ctx.globalAlpha = al;
        const size = c.size * this.s;
        ctx.font = `${size}px "${fontFamily(c.font)}"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(10,5,20,0.75)';
        ctx.shadowBlur = 10 * this.s;
        ctx.shadowOffsetY = 2 * this.s;
        ctx.fillStyle = c.c;
        const lines = String(txt).split('\n');
        lines.forEach((ln, i) => ctx.fillText(ln, W / 2, c.y * H - (lines.length - 1 - i) * size * 1.15));
        ctx.restore();
      }
    }
  }

  filmPost(ctx, look) {
    resetCtx(ctx);
    if (look.bars > 0) {
      const b = round(look.bars * this.H);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.W, b);
      ctx.fillRect(0, this.H - b, this.W, b);
    }
  }

  /** Frame final como Buffer RGBA (grade de cor, vinheta e grão aplicados em um único passe). */
  pixels(T, frameIndex = round(T * this.fps)) {
    this.frame(T, frameIndex);
    const src = this.main.data();
    // a cópia para o buffer de saída sai junto com a grade/vinheta/grão (uma passada só pela memória)
    const buf = Buffer.allocUnsafe(src.length);
    this.postPixels(src, buf, this.curLook, frameIndex);
    return buf;
  }

  /** Assinatura do quadro desenhado (32×18 de luminância, antes do grão) — para verificar quadros. */
  signature() {
    const a = this.small(128, 72, 'sigA');
    a.getContext('2d').drawImage(this.main, 0, 0, 128, 72);
    const b = this.small(32, 18, 'sigB');
    b.getContext('2d').drawImage(a, 0, 0, 32, 18);
    const d = b.getContext('2d').getImageData(0, 0, 32, 18).data, s = new Float32Array(32 * 18);
    for (let i = 0; i < s.length; i++) s[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
    return s;
  }

  /**
   * pixels() À PROVA DE FALHAS para vídeo: raramente (≈1 quadro em 200, de forma aleatória) o filtro de desfoque do
   * Skia devolve uma camada vazia e uma camada inteira some por um quadro (flicker). Como o motor é determinístico,
   * todo quadro que muda muito em relação ao anterior é desenhado de novo; se as duas versões divergem, desenha uma
   * terceira e fica a maioria. Custo: só os quadros de mudança brusca (cortes, ação rápida) são repetidos.
   */
  pixelsVerificado(T, frameIndex = round(T * this.fps)) {
    const dif = (a, b) => {
      let m = 0;
      for (let i = 0; i < a.length; i++) m = max(m, abs(a[i] - b[i]));
      return m;
    };
    let buf = this.pixels(T, frameIndex), s = this.signature();
    const prev = this._sigPrev;
    if (!prev || dif(s, prev) > 10) {
      const buf2 = this.pixels(T, frameIndex), s2 = this.signature();
      if (dif(s, s2) > 1.5) {
        this.falhas = (this.falhas ?? 0) + 1;
        const buf3 = this.pixels(T, frameIndex), s3 = this.signature();
        if (dif(s2, s3) <= 1.5) [buf, s] = [buf3, s3];
        else if (dif(s, s3) > 1.5 && prev) {
          // as três divergem: fica a mais coerente com o quadro anterior
          const c = [[buf, s], [buf2, s2], [buf3, s3]].sort((x, y) => dif(x[1], prev) - dif(y[1], prev))[0];
          [buf, s] = c;
        }
      }
    }
    this._sigPrev = s;
    return buf;
  }

  /**
   * Quadros [a0, st.end) em ordem, VERIFICADOS PELOS VIZINHOS — o caminho do render de vídeo. Um quadro só é
   * redesenhado se a assinatura dele foge das de dois vizinhos mais do que os vizinhos diferem entre si (o que
   * acontece quando uma camada some num quadro só); movimento rápido e cortes quase nunca disparam, porque o quadro
   * fica "entre" os vizinhos. (pixelsVerificado redesenha todo quadro com mudança grande: 50–90% dos quadros.)
   * Segura até 2 quadros adiante. st = { end, next }: st.end pode diminuir durante o render (divisão de trabalho
   * entre workers); st.next é o próximo quadro a desenhar (nunca é cortado o que já foi desenhado).
   */
  *quadros(a0, st) {
    const fps = this.fps, win = [];
    st.next = a0;
    let p1 = null, p2 = null; // assinaturas dos 2 últimos quadros entregues
    const draw = f => ({ f, buf: this.pixels(f / fps, f), s: this.signature() });
    for (;;) {
      const head = win[0];
      const need = head ? head.f + (p1 ? 1 : 2) : st.next;
      if (st.next < st.end && st.next <= need) {
        win.push(draw(st.next++));
        continue;
      }
      if (!win.length) return;
      const h = win.shift(), n1 = win[0], n2 = win[1];
      const viz = p1 && n1 ? [p1, n1.s] : !p1 && n1 && n2 ? [n1.s, n2.s] : p1 && p2 ? [p1, p2] : null;
      let { buf, s } = h;
      if (!viz || desvio(s, viz[0], viz[1]) > 120) ({ buf, s } = this.confirmar(h.f / fps, h.f, buf, s, viz));
      p2 = p1;
      p1 = s;
      yield [h.f, buf];
    }
  }

  /** Redesenha um quadro suspeito; se a nova versão diverge, desenha uma terceira e fica a maioria. */
  confirmar(T, frameIndex, buf, s, viz) {
    const buf2 = this.pixels(T, frameIndex), s2 = this.signature();
    if (difSig(s, s2) <= 1.5) return { buf, s };
    this.falhas = (this.falhas ?? 0) + 1;
    const buf3 = this.pixels(T, frameIndex), s3 = this.signature();
    if (difSig(s2, s3) <= 1.5) return { buf: buf3, s: s3 };
    if (difSig(s, s3) <= 1.5 || !viz) return { buf, s };
    // as três divergem: fica a mais coerente com os vizinhos
    const c = [{ buf, s }, { buf: buf2, s: s2 }, { buf: buf3, s: s3 }];
    return c.sort((x, y) => desvio(x.s, viz[0], viz[1]) - desvio(y.s, viz[0], viz[1]))[0];
  }

  /** Frame final como canvas (para PNG / folhas de contato). */
  image(T, frameIndex = round(T * this.fps), verificar = false) {
    return this.canvasDe(verificar ? this.pixelsVerificado(T, frameIndex) : this.pixels(T, frameIndex));
  }

  /** Canvas com os pixels finais `buf` (+ grade/legenda de depuração). */
  canvasDe(buf) {
    if (!this.out) this.out = createCanvas(this.W, this.H);
    const ctx = this.out.getContext('2d');
    resetCtx(ctx);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.length), this.W, this.H), 0, 0);
    if (this.debug) this.drawGrid(ctx);
    if (this.debugLayers && this.layerLegend?.length) this.drawLayerLegend(ctx);
    return this.out;
  }

  /**
   * STAGING: centro de atenção do quadro = centro da tela puxado para os personagens (rigs) do plano focal,
   * ponderados pelo tamanho. A vinheta se centra ali — o olho vai para quem está atuando.
   */
  focusOf(look) {
    const k = look?.vignetteFoco ?? 0;
    const cx = this.W / 2, cy = this.H / 2;
    if (!k || !this.subjects.length) return [cx, cy];
    let sx = 0, sy = 0, sw = 0;
    for (const [x0, y0, x1, y1] of this.subjects) {
      // só a parte dentro do quadro conta (quem está saindo de cena não puxa a atenção)
      const a = max(0, min(x1, this.W) - max(x0, 0)) * max(0, min(y1, this.H) - max(y0, 0));
      if (a <= 0) continue;
      const w = sqrt(a);
      sx += w * (max(x0, 0) + min(x1, this.W)) / 2;
      // o rosto/peito importa mais que os pés: mira no terço de cima da caixa
      sy += w * (max(y0, 0) + (min(y1, this.H) - max(y0, 0)) * 0.35);
      sw += w;
    }
    if (!sw) return [cx, cy];
    const dx = clamp((sx / sw - cx) * k, -0.2 * this.W, 0.2 * this.W), dy = clamp((sy / sw - cy) * k, -0.2 * this.H, 0.2 * this.H);
    return [cx + dx, cy + dy];
  }

  /** Mapa da vinheta em 1/4 da resolução (suave: blocos de 4 px são invisíveis), centrado no foco. */
  vignetteMap(look, focus) {
    const fx = focus ? round(focus[0] / 8) * 8 : this.W / 2, fy = focus ? round(focus[1] / 8) * 8 : this.H / 2;
    const key = `${look.vignette}|${look.vignetteR ?? 0.3}|${fx}|${fy}`;
    if (this._vigKey === key) return this._vig;
    const W = this.W, H = this.H, W4 = (W + 3) >> 2, H4 = (H + 3) >> 2, m = new Float32Array(W4 * H4);
    const r0 = H * (look.vignetteR ?? 0.3), r1 = hypot(W, H) * 0.56;
    for (let y = 0; y < H4; y++) {
      const dy = y * 4 + 2 - fy;
      for (let x = 0; x < W4; x++) {
        const dx = x * 4 + 2 - fx;
        const u = clamp((sqrt(dx * dx + dy * dy) - r0) / (r1 - r0));
        m[y * W4 + x] = u * u * (3 - 2 * u) * look.vignette;
      }
    }
    this._vigKey = key;
    this._vig = m;
    this._vigW4 = W4;
    return m;
  }

  grainTile() {
    if (this._grain) return this._grain;
    const n = 256, g = new Float32Array(n * n);
    let s = 12345;
    for (let i = 0; i < n * n; i++) {
      let u = 0;
      for (let k = 0; k < 4; k++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        u += s / 4294967296;
      }
      g[i] = (u - 2) / 0.577;
    }
    return (this._grain = g);
  }

  /**
   * Grade de cor + vinheta + grão: lê `src` (pixels do Skia) e escreve `dst` (pode ser o mesmo buffer).
   * Mesma aritmética da versão original (resultado idêntico byte a byte), só reorganizada para ser rápida:
   * LUT única por canal quando não há saturação, fatores da vinheta por bloco calculados uma vez,
   * leitura/escrita de 32 bits por pixel e laços especializados para cada combinação de efeitos.
   */
  postPixels(src, dst, look, frameIndex) {
    const W = this.W, H = this.H;
    const copy = () => {
      if (dst !== src) dst.set(src);
    };
    if (!look || this.sil) return copy();
    const gr = look.grade || {};
    const sat = gr.sat ?? 1, con = gr.con ?? 1, bri = gr.bri ?? 1;
    const vig = look.vignette > 0 ? this.vignetteFactors(look, this.curFocus) : null;
    const grain = look.grain > 0 ? look.grain : 0;
    if (sat === 1 && con === 1 && bri === 1 && !gr.lift && !gr.tint && !vig && !grain) return copy();
    const lut = this.gradeLuts(gr, bri, con);
    const tile = grain ? this.grainTileK(grain * 255 * 0.32) : null;
    const gi = look.grainFps > 0 ? floor((frameIndex / this.fps) * look.grainFps) : 0;
    const ox = floor(hash(gi, 3) * 256), oy = floor(hash(gi, 5) * 256);
    const gsh = this.s > 1.4 ? 1 : 0;
    const s32 = u32(src), d32 = u32(dst);
    const W4 = vig ? vig.W4 : 0, VR = vig?.r, VG = vig?.g, VB = vig?.b;
    if (sat !== 1) postSat(s32, d32, W, H, lut, sat, VR, VG, VB, W4, tile, gsh, ox, oy);
    else postLut(s32, d32, W, H, lut, VR, VG, VB, W4, tile, gsh, ox, oy);
  }

  /** Bloco de grão (256×256) já multiplicado pela força k (mesmo produto da conta original). */
  grainTileK(k) {
    if (this._grainKk === k) return this._grainK;
    const g = this.grainTile(), o = new Float64Array(g.length);
    for (let i = 0; i < g.length; i++) o[i] = g[i] * k;
    this._grainKk = k;
    return (this._grainK = o);
  }

  /** LUTs da grade (cacheadas pela combinação de parâmetros). */
  gradeLuts(gr, bri, con) {
    const key = `${bri}|${con}|${gr.tint}|${gr.tintA}|${gr.lift}`;
    if (this._lutKey === key) return this._lut;
    // LUT 1: brilho + contraste (igual para todos os canais)
    const L1 = new Float32Array(256);
    for (let i = 0; i < 256; i++) L1[i] = (i * bri - 127.5) * con + 127.5;
    // LUT 2: tinta (soft-light) + lift (screen), por canal
    const tint = gr.tint ? rgba(gr.tint) : null, ta = gr.tintA ?? 0.2;
    const lift = gr.lift ? rgba(gr.lift) : null;
    const L2 = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < 256; i++) {
        let v = i;
        if (tint) {
          const b = v / 255, s = tint[c] / 255;
          const sl = s < 0.5 ? b - (1 - 2 * s) * b * (1 - b) : b + (2 * s - 1) * (sqrt(b) - b);
          v = (b + (sl - b) * ta) * 255;
        }
        if (lift) v = 255 - ((255 - v) * (255 - lift[c])) / 255;
        L2[c][i] = v;
      }
    }
    // LUT combinada (sem saturação): L2[clamp(L1[i]) | 0]
    const C = L2.map(T => {
      const o = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        const v = L1[i];
        o[i] = T[v < 0 ? 0 : v > 255 ? 255 : v | 0];
      }
      return o;
    });
    // produtos da luminância (mesma conta, feita uma vez por valor)
    const KR = new Float64Array(256), KG = new Float64Array(256), KB = new Float64Array(256), F1 = new Float64Array(256);
    for (let i = 0; i < 256; i++) {
      F1[i] = L1[i];
      KR[i] = 0.2126 * L1[i];
      KG[i] = 0.7152 * L1[i];
      KB[i] = 0.0722 * L1[i];
    }
    this._lutKey = key;
    return (this._lut = { L1: F1, KR, KG, KB, R2: L2[0], G2: L2[1], B2: L2[2], CR: C[0], CG: C[1], CB: C[2] });
  }

  /** Fatores multiplicativos da vinheta por bloco de 4×4 px e por canal (1 − peso × (1 − cor)). */
  vignetteFactors(look, focus) {
    const m = this.vignetteMap(look, focus);
    const key = `${this._vigKey}|${look.vignetteC ?? '#000'}`;
    if (this._vigFKey === key) return this._vigF;
    const vc = rgba(look.vignetteC ?? '#000');
    const vr = 1 - vc[0] / 255, vg = 1 - vc[1] / 255, vb = 1 - vc[2] / 255;
    const n = m.length, r = new Float64Array(n), g = new Float64Array(n), b = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const w = m[i];
      r[i] = 1 - w * vr;
      g[i] = 1 - w * vg;
      b[i] = 1 - w * vb;
    }
    this._vigFKey = key;
    return (this._vigF = { r, g, b, W4: this._vigW4 });
  }

  // ---------- esqueletos ----------
  drawRig(ctx, n, inh, t, env) {
    const check = !!(this.probe || this.debugRig);
    const sol = solveRig(n, t, env, { check });
    this.rigCache.set(n.id + '|' + t, sol);
    const { S } = sol;
    // STAGING: caixa do personagem na tela (o foco da vinheta puxa para os do plano focal)
    let bb = null;
    if (this.curFocal || this.probe) {
      const Mt = ctx.getTransform(), F = this.curLayerF ?? 1;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const s of S.values()) {
        for (const [x, y] of [[s.x0, s.y0], [s.x1, s.y1]]) {
          const X = (Mt.a * x + Mt.c * y + Mt.e) * F, Y = (Mt.b * x + Mt.d * y + Mt.f) * F;
          x0 = min(x0, X); x1 = max(x1, X); y0 = min(y0, Y); y1 = max(y1, Y);
        }
      }
      if (x1 > x0) bb = [x0, y0, x1, y1];
      if (bb && this.curFocal) this.subjects.push(bb);
    }
    if (this.probe) {
      const M = this.curLayerM ? this.curLayerM.inverse().multiply(ctx.getTransform()) : ctx.getTransform();
      this.probe.rigs.push({ scene: this.curScene, rig: n, name: n.name ?? `rig#${n.id}`, t, S, issues: sol.issues, M, ground: n.ground === undefined ? undefined : V(n.ground, t, env), focal: this.curFocal, bb });
    }
    const rest = restPose(n);
    const inh2 = this.inherit(inh, n, t, env);
    // SOLID DRAWING: sombra de contato sob pés/patas que tocam o chão (rig com `ground`; sombra: false desliga)
    if (n.ground !== undefined && n.sombra !== false && !this.sil) this.contactShadows(ctx, n, S, inh2, t, env);
    if (!n._skin) {
      const RANK = { far: 0, mid: 1, near: 2 };
      const sideOf = nm => (n._bones.find(b => b.name === nm)?.side ?? 'mid');
      n._skin = (n.skin ?? []).filter(Boolean).map((it, idx) => {
        const o = it.type ? { node: it } : { ...it };
        o.kind = o.bone ? 'bone' : o.limb ? 'limb' : o.spine ? 'spine' : o.draw ? 'draw' : 'node';
        o.side ??= o.bone ? sideOf(o.bone) : o.limb ? sideOf(o.limb[0]) : o.spine ? sideOf(o.spine[0]) : 'mid';
        o.idx = idx;
        o.rank = RANK[o.side] ?? 1;
        return o;
      });
      if (n.order !== 'manual') n._skin.sort((a, b) => a.rank - b.rank || a.idx - b.idx);
    }
    const U = this.unidoDe(n, inh2, t, env);
    if (U) this.drawRigUnido(ctx, n, U, S, rest, inh2, t, env);
    else for (const it of n._skin) this.drawSkin(ctx, n, it, S, rest, inh2, t, env);
    if (this.debugRig) this.drawSkeleton(ctx, sol);
    if (this.debugArcs) this.drawArcs(ctx, n, t, env);
  }

  /** Desenha uma pele do rig (osso, membro, coluna, draw ou nó solto). */
  drawSkin(ctx, n, it, S, rest, inh2, t, env) {
    if (it.show && (t < it.show[0] || t >= it.show[1])) return;
    if (it.hidden && V(it.hidden, t, env)) return;
    ctx.save();
    if (it.alpha !== undefined) ctx.globalAlpha *= V(it.alpha, t, env);
    if (it.kind === 'bone') {
      const cur = S.get(it.bone);
      if (!cur) throw new Error(`bamoo rig "${n.name ?? n.id}": pele presa a osso inexistente "${it.bone}"`);
      if (it.local) {
        ctx.translate(cur.x0, cur.y0);
        ctx.rotate((cur.abs * PI) / 180);
      } else ctx.transform(...bindMatrix(rest.get(it.bone), cur));
      this.anc.push({ bone: it.bone, rig: n, local: !!it.local });
      this.drawNode(ctx, it.node, inh2, t, env);
      this.anc.pop();
    } else if (it.kind === 'limb') {
      const w = typeof it.w === 'function' ? it.w : deepV(it.w, t, env);
      const p = limbPath(chainPoints(S, it.limb), w, { joint: it.joint ?? 0.7, caps: it.caps ?? 'round' });
      this.drawShape(ctx, it, { path: p, bb: p.getBounds() }, inh2, t, env, Array.isArray(w) ? max(...w) : typeof w === 'number' ? w : undefined);
    } else if (it.kind === 'spine') {
      const p = blobPath(spinePoints(S, it.spine, deepV(it.top, t, env), deepV(it.bot ?? it.top, t, env), it.n ?? 16));
      this.drawShape(ctx, it, { path: p, bb: p.getBounds() }, inh2, t, env);
    } else if (it.kind === 'draw') {
      for (const c of flat(it.draw(S, t, env))) this.drawNode(ctx, c, inh2, t, env);
    } else this.drawNode(ctx, it.node, inh2, t, env);
    ctx.restore();
  }

  /** Opções efetivas da PEÇA ÚNICA (look.unido + rig.unido) ou null (desligada / modos de depuração). */
  unidoDe(n, inh, t, env) {
    if (this.sil || this.debugLayers || this.unidoAtivo) return null;
    const lk = inh.look?.unido;
    const own = n.unido === undefined ? undefined : V(n.unido, t, env);
    if (own === false || own === 0 || ((lk === false || lk == null) && !own)) return null;
    return { ...UNIDO, ...(lk && typeof lk === 'object' ? lk : {}), ...(own && typeof own === 'object' ? own : {}) };
  }

  /**
   * PEÇA ÚNICA: o personagem inteiro é pintado como UM corpo, não como peças coladas.
   * 1) cada pele é pintada com a sua cor e textura e só um resto (`parte`) da sombra própria;
   * 2) antes de cada pele, a sombra que ela projeta nas peças de trás (`oclusao`) — o braço assenta no tronco,
   *    a cabeça no pescoço, a perna de cá na de lá;
   * 3) depois, UMA luz para o corpo todo, calculada pela silhueta inteira: banho de luz (`banho`), sombra de
   *    forma no lado oposto ao sol (`forma`) e realce de borda do lado do sol (`borda`);
   * 4) o personagem entra na camada como uma imagem só (alpha do rig não deixa ver as sobreposições).
   */
  drawRigUnido(ctx, n, U, S, rest, inh, t, env) {
    const W0 = ctx.canvas.width, H0 = ctx.canvas.height;
    const M0 = ctx.getTransform(), ds = sqrt(abs(M0.a * M0.d - M0.b * M0.c)) || 1;
    const look = inh.look ?? DEFAULT_LOOK;
    // escala do personagem (px do canvas): maior lado do esqueleto em repouso
    const rb = this.nodeBox(n, t, env);
    const sz = max(40, (rb ? max(rb[2] - rb[0], rb[3] - rb[1]) : 300) * ds * (U.escala ?? 1));
    let sx = (inh.sun ?? look.sun ?? [-0.55, -0.85])[0], sy = (inh.sun ?? look.sun ?? [-0.55, -0.85])[1];
    const sl = hypot(sx, sy) || 1;
    sx /= sl;
    sy /= sl;
    const shadowC = inh.shadow ?? look.shadow ?? '#43306a', lightC = inh.light ?? look.light ?? '#fff2d8';
    this.medidor ??= createCanvas(2, 2);
    const med = this.medidor.getContext('2d');
    // desenha a pele em modo máscara (chapada, cor `col`) em `x` com a matriz `m`; `ib` acumula a caixa
    const mascara = (x, m, it, col, ib) => {
      const sv = [this.sil, this.silCol, this.curFocal, this.silTudo, this.bbAcc];
      this.sil = true;
      this.silCol = col;
      this.curFocal = false;
      this.silTudo = true;
      this.bbAcc = ib;
      x.save();
      x.setTransform(m);
      try {
        this.drawSkin(x, n, it, S, rest, inh, t, env);
      } finally {
        x.restore();
        [this.sil, this.silCol, this.curFocal, this.silTudo, this.bbAcc] = sv;
      }
    };
    // 1) MEDE cada pele (sem pintar) em px da tela: a tela do personagem cobre TUDO o que ele desenha
    //    (asas abertas, orelhas, cabelo, objetos na mão) — nada é cortado
    const caixas = n._skin.map(it => {
      const ib = [Infinity, Infinity, -Infinity, -Infinity];
      mascara(med, M0, it, '#000', ib);
      return ib[2] > ib[0] ? ib : null;
    });
    const bb0 = [Infinity, Infinity, -Infinity, -Infinity];
    for (const s of S.values()) for (const [x, y] of [[s.x0, s.y0], [s.x1, s.y1]]) accPt(bb0, M0.a * x + M0.c * y + M0.e, M0.b * x + M0.d * y + M0.f);
    for (const ib of caixas) if (ib) for (const k of [0, 1]) accPt(bb0, ib[2 * k], ib[2 * k + 1]);
    const mg = 0.02 * sz + max(0.8, U.ocB * sz) * 3 + (U.margem ?? 0) * sz + 6;
    const rx = max(0, floor(bb0[0] - mg)), ry = max(0, floor(bb0[1] - mg));
    const rx1 = min(W0, Math.ceil(bb0[2] + mg)), ry1 = min(H0, Math.ceil(bb0[3] + mg));
    if (!(rx1 > rx && ry1 > ry)) return;
    // telas do tamanho do personagem, não da tela inteira: cada passe custa pela área dele
    const W = min(W0, Math.ceil((rx1 - rx) / 32) * 32), H = min(H0, Math.ceil((ry1 - ry) / 32) * 32);
    const M = new DOMMatrix([M0.a, M0.b, M0.c, M0.d, M0.e - rx, M0.f - ry]);
    const cc = this.acquire(W, H), cx = cc.getContext('2d');
    cx.setTransform(M);
    const oc = U.oclusao > 0;
    // silhueta exata do corpo (união das máscaras das peles): no fim corta o que a sombra de oclusão pintou fora
    const silC = oc ? this.acquire(W, H) : null, silX = silC?.getContext('2d');
    const all = [Infinity, Infinity, -Infinity, -Infinity];
    // inclui os ossos (peles fora de drawShape, como linhas e imagens, ficam dentro da margem)
    for (const s of S.values()) for (const [x, y] of [[s.x0, s.y0], [s.x1, s.y1]]) accPt(all, M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f);
    const prev = { acc: this.bbAcc, partK: this.partK };
    this.unidoAtivo = true;
    this.partK = U.parte;
    const ocD = U.ocD * sz, ocB = max(0.8, U.ocB * sz);
    const padO = ocB * 3 + ocD + 2;
    let any = false;
    try {
      n._skin.forEach((it, idx) => {
        this.partArea = 0;
        const ib0 = caixas[idx];
        if (ib0) {
          const ib = [ib0[0] - rx, ib0[1] - ry, ib0[2] - rx, ib0[3] - ry];
          // tamanho da pele: formas pequenas dentro dela (penas, escamas, dedos) mantêm o volume próprio
          this.partArea = (ib[2] - ib[0]) * (ib[3] - ib[1]);
          const r0 = max(0, floor(ib[0] - padO)), r1 = max(0, floor(ib[1] - padO));
          const rw = min(W, Math.ceil(ib[2] + padO)) - r0, rh = min(H, Math.ceil(ib[3] + padO)) - r1;
          if (oc && rw > 0 && rh > 0) {
            // 2) máscara da pele numa tela do tamanho dela (ler telas pequenas é barato)
            const kw = Math.ceil(rw / 16) * 16, kh = Math.ceil(rh / 16) * 16;
            const mk = this.acquire(kw, kh), mx = mk.getContext('2d');
            mascara(mx, new DOMMatrix([M.a, M.b, M.c, M.d, M.e - r0, M.f - r1]), it, shadowC, null);
            silX.drawImage(mk, r0, r1);
            const toca = any && it.oclusao !== false && !(ib[0] > all[2] || ib[2] < all[0] || ib[1] > all[3] || ib[3] < all[1]);
            if (toca) {
              // 3) sombra desfocada da pele, multiplicada sobre as peças já pintadas (o halo de fora sai no corte final)
              const om = this.acquire(kw, kh), ox = om.getContext('2d');
              ox.filter = `blur(${ocB}px)`;
              ox.drawImage(mk, -sx * ocD, -sy * ocD);
              ox.filter = 'none';
              cx.save();
              cx.setTransform(1, 0, 0, 1, 0, 0);
              clipBox(cx, [r0, r1, r0 + rw, r1 + rh], 0);
              cx.globalCompositeOperation = 'multiply';
              cx.globalAlpha = min(1, typeof it.oclusao === 'number' ? it.oclusao : U.oclusao);
              cx.drawImage(om, r0, r1);
              cx.restore();
              this.release(om);
            }
            this.release(mk);
          }
        }
        this.bbAcc = all;
        this.drawSkin(cx, n, it, S, rest, inh, t, env);
        any = true;
      });
    } finally {
      this.bbAcc = prev.acc;
      this.partK = prev.partK;
      this.partArea = 0;
      this.unidoAtivo = false;
    }
    if (silC) {
      cx.save();
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.globalCompositeOperation = 'destination-in';
      cx.drawImage(silC, 0, 0);
      cx.restore();
      this.release(silC);
    }
    if (!(all[2] > all[0])) {
      this.release(cc);
      return;
    }
    const pad = 0.04 * sz + 4;
    // caixa em pixels inteiros: recorte sem antialiasing (bordas de recorte parciais deixariam riscos)
    const bb = [max(0, floor(all[0] - pad)), max(0, floor(all[1] - pad)), min(W, Math.ceil(all[2] + pad)), min(H, Math.ceil(all[3] + pad))];
    const bw = bb[2] - bb[0], bh = bb[3] - bb[1];
    if (bw > 1 && bh > 1) {
      // os três passes LEEM o corpo antes de qualquer um escrever nele (uma leitura só da tela do corpo)
      const passes = [];
      const prep = (fillFn, cut, op, a) => {
        if (!(a > 0)) return;
        const tmp = this.acquire(W, H), tx = tmp.getContext('2d');
        tx.save();
        clipBox(tx, bb, 0);
        if (cut && cut.b > 6) {
          // desfoque largo: calcula a faixa em 1/4 da resolução (o desfoque esconde a perda) e amplia
          const f = 4, w = Math.ceil(W / f), h = Math.ceil(H / f);
          const sm = this.small(w, h, 'unido'), smx = sm.getContext('2d');
          fillFn(smx, 1 / f);
          smx.globalCompositeOperation = 'destination-out';
          smx.imageSmoothingQuality = 'low';
          smx.filter = `blur(${cut.b / f}px)`;
          smx.drawImage(cc, cut.dx / f, cut.dy / f, W / f, H / f);
          smx.filter = 'none';
          tx.imageSmoothingQuality = 'low';
          tx.drawImage(sm, 0, 0, w, h, 0, 0, w * f, h * f);
        } else {
          fillFn(tx, 1);
          if (cut) {
            // "sombra interna": tira a silhueta deslocada (e desfocada) — sobra a faixa do lado oposto
            tx.globalCompositeOperation = 'destination-out';
            tx.filter = `blur(${cut.b}px)`;
            tx.drawImage(cc, cut.dx, cut.dy);
            tx.filter = 'none';
          }
        }
        tx.globalCompositeOperation = 'destination-in';
        tx.drawImage(cc, 0, 0);
        tx.restore();
        passes.push({ tmp, op, a });
      };
      const chapado = c => (x, k) => {
        x.fillStyle = c;
        x.fillRect(bb[0] * k, bb[1] * k, bw * k + 2, bh * k + 2);
      };
      // banho de luz do corpo inteiro (um degradê só: as peças não recomeçam a luz)
      prep((x, k) => {
        const cxm = (bb[0] + bb[2]) / 2, cym = (bb[1] + bb[3]) / 2;
        const ext = abs((bw / 2) * sx) + abs((bh / 2) * sy);
        const g = x.createLinearGradient(cxm + sx * ext, cym + sy * ext, cxm - sx * ext, cym - sy * ext);
        g.addColorStop(0, lightC);
        g.addColorStop(0.5, '#808080');
        g.addColorStop(1, shadowC);
        x.fillStyle = g;
        x.fillRect(bb[0], bb[1], bw, bh);
      }, null, 'soft-light', (look.autoLuz ?? 0.38) > 0 ? U.banho : 0);
      // sombra de forma pela silhueta inteira
      prep(chapado(shadowC), { dx: sx * U.formaD * sz, dy: sy * U.formaD * sz, b: max(0.8, U.formaB * sz) }, 'multiply', U.forma);
      // realce de borda do lado do sol
      prep(chapado(lightC), { dx: -sx * U.bordaD * sz, dy: -sy * U.bordaD * sz, b: max(0.6, U.bordaB * sz) }, 'screen', U.borda);
      cx.save();
      cx.setTransform(1, 0, 0, 1, 0, 0);
      clipBox(cx, bb, 0);
      for (const p of passes) {
        cx.globalCompositeOperation = p.op;
        cx.globalAlpha = min(1, p.a);
        cx.drawImage(p.tmp, 0, 0);
        this.release(p.tmp);
      }
      cx.restore();
    }
    // o corpo entra na camada como uma imagem só
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    clipBox(ctx, [bb[0] + rx, bb[1] + ry, bb[2] + rx, bb[3] + ry], 0);
    ctx.drawImage(cc, rx, ry);
    ctx.restore();
    this.release(cc);
  }

  /** Sombras de contato (multiply, desfocadas) sob os ossos de contato, que somem quando o pé sobe. */
  contactShadows(ctx, n, S, inh, t, env) {
    const g = V(n.ground, t, env);
    if (g === undefined || g === null) return;
    const contacts = n._bones.filter(b => b.contact);
    if (!contacts.length || !this.curLayerM) return;
    const so = typeof n.sombra === 'object' ? n.sombra : {};
    const R = this.curLayerM.inverse().multiply(ctx.getTransform()); // rig → camada
    const tr = (x, y) => [R.a * x + R.c * y + R.e, R.b * x + R.d * y + R.f];
    const list = [];
    for (const b of contacts) {
      const s = S.get(b.name), sole = b.sole ?? 0;
      const nx = -sin((s.abs * PI) / 180) * sole, ny = cos((s.abs * PI) / 180) * sole;
      const a = tr(s.x0 + nx, s.y0 + ny), c = tr(s.x1 + nx, s.y1 + ny);
      const L = max(6, hypot(c[0] - a[0], c[1] - a[1]));
      const hgt = max(0, g - max(a[1], c[1]));
      const fade = 1 - smooth(0, max(25, 1.3 * L), hgt);
      if (fade > 0.02) list.push({ x0: min(a[0], c[0]), x1: max(a[0], c[0]), L, hgt, fade });
    }
    if (!list.length) return;
    const Lm = this.curLayerM, ds = sqrt(abs(Lm.a * Lm.d - Lm.b * Lm.c));
    ctx.save();
    ctx.setTransform(Lm);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = so.c ?? inh.shadow ?? '#43306a';
    const base = ctx.globalAlpha, A = so.a ?? 0.5;
    const blob = (cx, rx, ry, al) => {
      const bl = max(1.5, ry * 0.9);
      ctx.save();
      clipBox(ctx, [cx - rx, g - ry, cx + rx, g + ry], bl * 3 + 2);
      ctx.filter = `blur(${bl * ds}px)`;
      ctx.globalAlpha = base * al;
      ctx.beginPath();
      ctx.ellipse(cx, g, rx, ry, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    };
    // sombra ambiente sob todo o apoio + uma mais escura e justa sob cada pé
    const near = list.filter(p => p.fade > 0.3);
    if (near.length > 1) {
      const x0 = min(...near.map(p => p.x0)), x1 = max(...near.map(p => p.x1)), Lm2 = max(...near.map(p => p.L));
      blob((x0 + x1) / 2, (x1 - x0) / 2 + 0.35 * Lm2, max(4, 0.16 * Lm2), A * 0.45);
    }
    for (const p of list) {
      const grow = 1 + p.hgt / (1.3 * p.L);
      blob((p.x0 + p.x1) / 2, ((p.x1 - p.x0) / 2 + 0.15 * p.L) * grow, max(3, 0.11 * p.L) * grow, A * p.fade);
    }
    ctx.restore();
  }

  /** Sombra de contato avulsa: sombra(x, y, largura, { a, h }) — assenta objetos no chão. */
  drawSombra(ctx, n, inh, t, env) {
    const x = V(n.cx, t, env), y = V(n.cy, t, env), w = V(n.w, t, env);
    const rx = w / 2, ry = n.h === undefined ? max(3, w * 0.09) : V(n.h, t, env);
    const M = ctx.getTransform(), ds = sqrt(abs(M.a * M.d - M.b * M.c));
    const bl = max(1.5, ry * 0.9);
    ctx.save();
    clipBox(ctx, [x - rx, y - ry, x + rx, y + ry], bl * 3 + 2);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha *= n.a === undefined ? 0.45 : V(n.a, t, env);
    ctx.fillStyle = n.c === undefined ? inh.shadow ?? '#43306a' : V(n.c, t, env);
    ctx.filter = `blur(${bl * ds}px)`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /** Depuração (--arcos): trilhas das extremidades do rig em ±0.6 s — mostra arcos e espaçamento (slow in/out). */
  drawArcs(ctx, n, t, env) {
    const bones = n._bones;
    const leaf = bones.filter(b => b.len > 0 && !bones.some(c => c.p === b.name));
    const sel = [...new Set([...leaf, ...bones.filter(b => /cabeca/.test(b.name))])];
    const Lm = this.curLayerM;
    if (!Lm) return;
    const ds = sqrt(abs(Lm.a * Lm.d - Lm.b * Lm.c)) || 1;
    const NS = 24, span = 0.6, tr = [];
    for (let i = 0; i <= NS; i++) {
      const tau = t - span + (2 * span * i) / NS;
      const M = this.worldAt(tau, env), S = this.rigAt(n, tau, env).S;
      tr.push(sel.map(b => {
        const s = S.get(b.name);
        return [M[0] * s.x1 + M[2] * s.y1 + M[4], M[1] * s.x1 + M[3] * s.y1 + M[5]];
      }));
    }
    ctx.save();
    resetCtx(ctx);
    ctx.setTransform(Lm);
    sel.forEach((b, j) => {
      ctx.strokeStyle = '#ffffff88';
      ctx.lineWidth = 1.5 / ds;
      ctx.beginPath();
      tr.forEach((pts, i) => (i ? ctx.lineTo(pts[j][0], pts[j][1]) : ctx.moveTo(pts[j][0], pts[j][1])));
      ctx.stroke();
      tr.forEach((pts, i) => {
        const u = i / NS, cur = i === NS / 2;
        ctx.fillStyle = cur ? '#ffffff' : u < 0.5 ? `hsl(200, 90%, ${45 + 30 * u}%)` : `hsl(28, 95%, ${70 - 30 * (u - 0.5)}%)`;
        ctx.beginPath();
        ctx.arc(pts[j][0], pts[j][1], (cur ? 5 : 3) / ds, 0, TAU);
        ctx.fill();
      });
    });
    ctx.restore();
  }

  drawSkeleton(ctx, sol) {
    const M = ctx.getTransform();
    const ds = sqrt(abs(M.a * M.d - M.b * M.c)) || 1;
    const bad = new Set(sol.issues.filter(i => i.kind === 'limite').map(i => i.bone));
    const far = new Set(sol.issues.filter(i => i.kind === 'alcance').flatMap(i => i.chain));
    ctx.save();
    resetCtx(ctx);
    ctx.setTransform(M);
    ctx.lineCap = 'round';
    const list = [...sol.S.values()].sort((a, b) => ({ far: 0, mid: 1, near: 2 })[a.side] - ({ far: 0, mid: 1, near: 2 })[b.side]);
    for (const s of list) {
      const err = bad.has(s.name) || far.has(s.name);
      const col = err ? '#ff2d55' : s.side === 'near' ? '#ff9f43' : s.side === 'far' ? '#4aa3ff' : '#ffe14d';
      ctx.strokeStyle = '#000a';
      ctx.lineWidth = (err ? 8 : 6) / ds;
      if (s.len > 0) {
        ctx.beginPath();
        ctx.moveTo(s.x0, s.y0);
        ctx.lineTo(s.x1, s.y1);
        ctx.stroke();
        ctx.strokeStyle = col;
        ctx.lineWidth = (err ? 5 : 3) / ds;
        ctx.stroke();
      }
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(s.x0, s.y0, 4.5 / ds, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = '#2dff9a';
    ctx.lineWidth = 2 / ds;
    for (const tg of sol.targets) {
      const [x, y] = tg.p, r = 9 / ds;
      ctx.beginPath();
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      ctx.stroke();
    }
    // rótulos no espaço da tela (nunca espelhados)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `${max(9, 12 * this.s)}px "PT Sans"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000c';
    for (const s of list) {
      if (!(s.len > 0)) continue;
      const lx = (s.x0 + s.x1) / 2, ly = (s.y0 + s.y1) / 2;
      const x = M.a * lx + M.c * ly + M.e, y = M.b * lx + M.d * ly + M.f;
      ctx.strokeText(s.name, x, y);
      ctx.fillStyle = bad.has(s.name) ? '#ff8fa6' : '#fff';
      ctx.fillText(s.name, x, y);
    }
    ctx.restore();
  }

  drawLayerLegend(ctx) {
    const s = max(0.5, this.s);
    ctx.save();
    ctx.font = `${14 * s}px "PT Sans"`;
    ctx.textBaseline = 'middle';
    this.layerLegend.forEach((L, i) => {
      const y = (14 + i * 22) * s;
      ctx.fillStyle = '#000b';
      ctx.fillRect(8 * s, y - 9 * s, 150 * s, 18 * s);
      ctx.fillStyle = L.col;
      ctx.fillRect(12 * s, y - 6 * s, 12 * s, 12 * s);
      ctx.fillStyle = '#fff';
      ctx.fillText(`camada ${i}  z=${L.z}  (${L.n} nós)`, 30 * s, y);
    });
    ctx.restore();
  }

  drawGrid(ctx) {
    const s = this.s;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = `${max(10, 13 * s)}px "PT Sans"`;
    ctx.fillStyle = '#ffffffd0';
    ctx.textBaseline = 'top';
    for (let x = 0; x <= this.DW; x += 100) {
      ctx.strokeStyle = x % 500 === 0 ? '#ff3b6bb0' : '#ffffff40';
      ctx.beginPath();
      ctx.moveTo(x * s + 0.5, 0);
      ctx.lineTo(x * s + 0.5, this.H);
      ctx.stroke();
      ctx.fillText(String(x), x * s + 3, 3);
    }
    for (let y = 0; y <= this.DH; y += 100) {
      ctx.strokeStyle = y % 500 === 0 ? '#ff3b6bb0' : '#ffffff40';
      ctx.beginPath();
      ctx.moveTo(0, y * s + 0.5);
      ctx.lineTo(this.W, y * s + 0.5);
      ctx.stroke();
      if (y) ctx.fillText(String(y), 3, y * s + 3);
    }
    ctx.restore();
  }
}

/** Cor do "horizonte" de um fundo (para a névoa automática): cor sólida ou ponto a 70% do degradê. */
function horizonte(bg) {
  if (typeof bg === 'string') return bg;
  const st = Array.isArray(bg) ? bg : bg?.stops;
  if (!st?.length) return '#d7cfc4';
  const pts = st.map((x, i) => (Array.isArray(x) ? x : [st.length === 1 ? 0 : i / (st.length - 1), x]));
  const u = 0.7;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] >= u) {
      const [a0, c0] = pts[i - 1], [a1, c1] = pts[i];
      return mix(c0, c1, (u - a0) / (a1 - a0 || 1));
    }
  }
  return pts[pts.length - 1][1];
}

// Laços do pós-processamento (grade + vinheta + grão), especializados por caso para o JIT. A aritmética é
// exatamente a da versão original (mesma ordem de operações em double), então o resultado é idêntico byte a byte.
function postSat(s32, d32, W, H, lut, sat, VR, VG, VB, W4, tile, gsh, ox, oy) {
  const { L1, KR, KG, KB, R2, G2, B2 } = lut;
  for (let y = 0; y < H; y++) {
    const row = y * W, vrow = (y >> 2) * W4;
    const trow = (((y >> gsh) + oy) & 255) << 8;
    for (let x = 0; x < W; x++) {
      const p = row + x;
      const px = s32[p];
      const i0 = px & 255, i1 = (px >>> 8) & 255, i2 = (px >>> 16) & 255;
      const l = KR[i0] + KG[i1] + KB[i2];
      let r = l + (L1[i0] - l) * sat;
      let g = l + (L1[i1] - l) * sat;
      let b = l + (L1[i2] - l) * sat;
      r = R2[r < 0 ? 0 : r > 255 ? 255 : r | 0];
      g = G2[g < 0 ? 0 : g > 255 ? 255 : g | 0];
      b = B2[b < 0 ? 0 : b > 255 ? 255 : b | 0];
      d32[p] = postTail(px, r, g, b, VR, VG, VB, vrow + (x >> 2), tile, trow + (((x >> gsh) + ox) & 255));
    }
  }
}

function postLut(s32, d32, W, H, lut, VR, VG, VB, W4, tile, gsh, ox, oy) {
  const { CR, CG, CB } = lut;
  for (let y = 0; y < H; y++) {
    const row = y * W, vrow = (y >> 2) * W4;
    const trow = (((y >> gsh) + oy) & 255) << 8;
    for (let x = 0; x < W; x++) {
      const p = row + x;
      const px = s32[p];
      d32[p] = postTail(px, CR[px & 255], CG[(px >>> 8) & 255], CB[(px >>> 16) & 255], VR, VG, VB, vrow + (x >> 2), tile, trow + (((x >> gsh) + ox) & 255));
    }
  }
}

/** Vinheta (fator por bloco) + grão + saturação/truncamento em [0,255]; devolve o pixel RGBA de 32 bits. */
function postTail(px, r, g, b, VR, VG, VB, k, tile, ti) {
  if (VR) {
    r *= VR[k];
    g *= VG[k];
    b *= VB[k];
  }
  if (tile) {
    const l = (r + g + b) * (1 / 765);
    const d = tile[ti] * (0.3 + 2.8 * l * (1 - l));
    r += d;
    g += d;
    b += d;
  }
  r = r < 0 ? 0 : r > 255 ? 255 : r | 0;
  g = g < 0 ? 0 : g > 255 ? 255 : g | 0;
  b = b < 0 ? 0 : b > 255 ? 255 : b | 0;
  return ((px & 0xff000000) | (b << 16) | (g << 8) | r) >>> 0;
}

/** Maior diferença entre duas assinaturas de quadro. */
function difSig(a, b) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = max(m, abs(a[i] - b[i]));
  return m;
}

/**
 * Quanto a assinatura s foge dos vizinhos a e b além do que eles diferem entre si, somado nas células (acima de
 * uma folga de 4 níveis). Uma camada que some num quadro dá centenas a milhares; movimento normal (mesmo rápido,
 * asas batendo) fica quase sempre abaixo de 100, porque o quadro está "entre" os vizinhos ou só poucas células mudam.
 */
function desvio(s, a, b) {
  let m = 0;
  for (let i = 0; i < s.length; i++) {
    const e = min(abs(s[i] - a[i]), abs(s[i] - b[i])) - abs(a[i] - b[i]);
    if (e > 4) m += e - 4;
  }
  return m;
}

/** Vista Uint32 (um pixel RGBA por elemento) de um Buffer/Uint8Array alinhado. */
function u32(b) {
  if (b.byteOffset & 3) throw new Error('bamoo: buffer de pixels desalinhado');
  return new Uint32Array(b.buffer, b.byteOffset, b.length >> 2);
}

/** Expande a caixa acumulada `acc` (px do canvas) com o ponto (x, y). */
function accPt(acc, x, y) {
  if (x < acc[0]) acc[0] = x;
  if (y < acc[1]) acc[1] = y;
  if (x > acc[2]) acc[2] = x;
  if (y > acc[3]) acc[3] = y;
}

/** Expande `acc` com a caixa local bb transformada por M (DOMMatrix) + margem local `pad`. */
function accBox(acc, M, bb, pad = 0) {
  const x0 = bb[0] - pad, y0 = bb[1] - pad, x1 = bb[2] + pad, y1 = bb[3] + pad;
  if (!(x1 >= x0)) return;
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) accPt(acc, M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f);
}

/** Grupo de formas repetidas (≥3 filhos do mesmo tipo e sem cores próprias diferentes): penas, escamas... */
function repeticao(n) {
  if (n._rep !== undefined) return n._rep;
  const c = Array.isArray(n.children) ? n.children.filter(Boolean) : null;
  let r = false;
  if (c && c.length >= 3) {
    const ty = c[0].type, f0 = c[0].fill;
    r = c.every(k => k.type === ty && k.type !== 'rig' && (k.fill === undefined || k.fill === f0));
  }
  return (n._rep = r);
}

/** Escala a força de um efeito shade/hl (número | true | { a, ... }). */
function scaleFx(v, k, def) {
  if (!v || k === 1) return v;
  if (typeof v === 'number') return v * k;
  if (v === true) return (def ?? 0.4) * k;
  if (typeof v === 'object') return { ...v, a: (v.a ?? def ?? 0.4) * k };
  return v;
}

/** Recorta o contexto à caixa bb expandida (limita o custo de filtros de blur). */
function clipBox(ctx, bb, pad) {
  ctx.beginPath();
  ctx.rect(bb[0] - pad, bb[1] - pad, bb[2] - bb[0] + 2 * pad, bb[3] - bb[1] + 2 * pad);
  ctx.clip();
}

/** Corta uma lista de pontos na fração `f` do comprimento (para animações de "desenhar"). */
function cutPts(pts, f) {
  if (f >= 1 || pts.length < 2) return pts;
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const target = L[L.length - 1] * max(0.0001, f);
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (L[i] >= target) {
      const u = (target - L[i - 1]) / (L[i] - L[i - 1] || 1);
      out.push([lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)]);
      break;
    }
    out.push(pts[i]);
  }
  return out.length < 2 ? [pts[0], pts[0]] : out;
}
