// Renderer: avalia a árvore de nós em um tempo t e desenha um frame com Skia.
// Pipeline: fundo -> camadas (parallax, névoa, profundidade de campo) -> grade de cor -> bloom -> vinheta
//           -> legendas -> transições -> grão de filme -> tarjas.

import canvas from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { V, deepV, isAnim, KF, noise, hash, clamp, smooth, lerp } from './anim.js';
import { mix, rgba, css } from './color.js';
import { blobPath, polyPath, curvePath, taperPath, ik2, widthFn } from './geom.js';
import { flat } from './nodes.js';
import { texCanvas, TEX_MODE } from './textures.js';
import { loadFonts, fontFamily } from './fonts.js';
import { solveRig, restPose, chainPoints, limbPath, spinePoints, bindMatrix } from './rig.js';

const { createCanvas, Path2D, DOMMatrix, PathOp, Image, ImageData } = canvas;
const { PI, cos, sin, tan, abs, hypot, min, max, floor, round, exp, sqrt } = Math;
const TAU = PI * 2;

export const DEFAULT_LOOK = {
  sun: [-0.55, -0.85], // direção PARA a fonte de luz (y para baixo). Ex.: [-1,-1] = luz vindo de cima-esquerda
  light: '#fff2d8', // cor do realce (lado iluminado)
  shadow: '#3e3470', // cor da sombra própria (aplicada em multiply)
  shade: 0.42, // força padrão da sombra própria automática (0 = desliga)
  hl: 0.22, // força padrão do realce do lado da luz
  shadeD: 0.22, // deslocamento da sombra (fração do menor lado da forma)
  hlD: 0.07,
  soft: 0.3, // suavidade do terminador (fração do deslocamento)
  tex: null, // textura padrão por forma: 'grain'|'speckle'|'brush'|'paper'|'hatch'|'blot'|{k,a,s,rot}
  grain: 0.08, // grão de filme global
  grainFps: 8, // quantas vezes por segundo o grão muda (0 = estático, arquivo bem menor)
  paper: 0, // papel global (multiply)
  vignette: 0.32,
  vignetteC: '#1a0f2e',
  bloom: 0.15,
  haze: { c: '#c9d6e3', a: 0.5 }, // névoa atmosférica para camadas com z > 1
  grade: { sat: 1.04, con: 1.03, bri: 1, lift: '#0f0b1c' },
  bars: 0, // tarjas de cinema (fração da altura, ex.: 0.1)
  steps: 0, // animar "em dois": 12 => poses a 12 fps (câmera continua suave)
  mblur: 0, // motion blur: nº de subquadros (ex.: 4). Pode ser animado.
  shutter: 0.5,
  caption: { font: 'hand', size: 46, c: '#ffffff', y: 0.885 },
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
  constructor(root, { scale = 1, fps = 30, debug = false, rig = false, layers = false } = {}) {
    loadFonts();
    if (!root || (root.kind !== 'scene' && root.kind !== 'film'))
      throw new Error('bamoo: o módulo da cena deve exportar default scene({...}) ou film([...])');
    this.root = root.kind === 'film' ? root : { kind: 'film', scenes: [root], trans: 'cut', d: 0 };
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
    return c;
  }
  release(c) {
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
    this.filmPost(ctx, this.curLook);
    return main;
  }

  lookOf(sc, t) {
    const env = { t, dur: sc.dur, W: this.DW, H: this.DH, fps: this.fps };
    const L = { ...DEFAULT_LOOK, ...(this.root.look ?? {}), ...(sc.look ?? {}) };
    const out = {};
    for (const k in L) {
      const v = V(L[k], t, env);
      out[k] = v;
    }
    if (out.haze === false || out.haze === 0) out.haze = null;
    if (out.caption) out.caption = { ...DEFAULT_LOOK.caption, ...out.caption };
    return out;
  }

  renderScene(entry, t, cv) {
    const sc = entry.sc;
    this.curScene = entry.i;
    this.layerLegend = [];
    const look = this.lookOf(sc, t);
    const env = { t, dur: sc.dur, W: this.DW, H: this.DH, fps: this.fps, scale: this.s };
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

  camera(sc, t, env) {
    const c = typeof sc.camera === 'function' ? sc.camera(t, env) : sc.camera ?? {};
    const g = (k, d) => (c[k] === undefined ? d : V(c[k], t, env));
    const cam = {
      x: g('x', this.DW / 2), y: g('y', this.DH / 2), zoom: g('zoom', 1), rot: g('rot', 0),
      dolly: g('dolly', 0), focus: g('focus', 1), dof: g('dof', 0), shake: g('shake', 0),
    };
    if (cam.shake) {
      const f = g('shakeF', 9);
      cam.x += cam.shake * noise(t * f, 7);
      cam.y += cam.shake * noise(t * f, 13);
      cam.rot += cam.shake * 0.04 * noise(t * f * 0.7, 19);
    }
    return cam;
  }

  renderLayers(sc, t, cv, look, env) {
    const ctx = cv.getContext('2d');
    resetCtx(ctx);
    const s = this.s;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const bg = V(sc.bg, t, env) ?? '#000';
    ctx.fillStyle = this.paint(ctx, bg, [0, 0, this.DW, this.DH]);
    ctx.fillRect(0, 0, this.DW, this.DH);
    const cam = this.camera(sc, t, env);
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
    let blurPx = blurD * this.s * cam.zoom;
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
    const alpha = L.alpha === undefined ? 1 : V(L.alpha, t, env);
    if (alpha <= 0.002) return;
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
    const kids = typeof L.children === 'function' ? flat(L.children(t, env)) : L.children;
    for (const c of kids) this.drawNode(tctx, c, inh, t, env);
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
    const m = localMat(n, t, env);
    if (m) ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
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
      case 'img': {
        const im = this.image(V(n.src, t, env));
        const w = n.w !== undefined ? V(n.w, t, env) : im.width;
        const h = n.h !== undefined ? V(n.h, t, env) : (im.height * w) / im.width;
        if (n.blend) ctx.globalCompositeOperation = blendOp(V(n.blend, t, env));
        ctx.drawImage(im, 0, 0, w, h);
        break;
      }
      case 'particles':
        this.drawParticles(ctx, n, inh, t, env);
        break;
      case 'rays':
        this.drawRays(ctx, n, inh, t, env);
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
    ctx.restore();
  }

  kids(n, t, env) {
    return typeof n.children === 'function' ? flat(n.children(t, env)) : n.children ?? [];
  }

  drawGroup(ctx, n, inh, t, env, alpha) {
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
      const tex = this.st(n, 'tex', inh, t, env);
      if (tex) this.applyTex(ctx, g, tex, rule);
      const shade = this.st(n, 'shade', inh, t, env);
      const hl = this.st(n, 'hl', inh, t, env);
      const size = sizeHint ?? min(g.bb[2] - g.bb[0], g.bb[3] - g.bb[1]);
      if ((shade || hl) && size * ds > 5) this.applyShade(ctx, g, size, shade, hl, inh, M, ds, rule);
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

  applyTex(ctx, g, spec, rule) {
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
    ctx.clip(g.path, rule);
    ctx.globalCompositeOperation = blendOp(mode ?? def[0]);
    ctx.globalAlpha *= a ?? def[1];
    ctx.fillStyle = pat;
    const [x0, y0, x1, y1] = g.bb;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  }

  /** Sombra própria + realce em "meia-lua" a partir da direção da luz (o visual ilustrado). */
  applyShade(ctx, g, size, shade, hl, inh, M, ds, rule) {
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
      ctx.clip(g.path, rule);
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
    const col = n.stroke !== undefined ? V(n.stroke, t, env) : inh.stroke ?? '#1d1a2b';
    const bb = p.getBounds();
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
    const fill = n.fill !== undefined ? V(n.fill, t, env) : inh.fill ?? '#1d1a2b';
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
    const list = this.evalParticles(n, t, env);
    if (!list.length) return;
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
    if (look.bloom > 0) {
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
    if (look.paper > 0) {
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
    const buf = Buffer.from(this.main.data());
    this.postPixels(buf, this.curLook, frameIndex);
    return buf;
  }

  /** Frame final como canvas (para PNG / folhas de contato). */
  image(T, frameIndex = round(T * this.fps)) {
    const buf = this.pixels(T, frameIndex);
    if (!this.out) this.out = createCanvas(this.W, this.H);
    const ctx = this.out.getContext('2d');
    resetCtx(ctx);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.length), this.W, this.H), 0, 0);
    if (this.debug) this.drawGrid(ctx);
    if (this.debugLayers && this.layerLegend?.length) this.drawLayerLegend(ctx);
    return this.out;
  }

  vignetteMap(look) {
    const key = `${look.vignette}|${look.vignetteR ?? 0.3}`;
    if (this._vigKey === key) return this._vig;
    const W = this.W, H = this.H, m = new Float32Array(W * H);
    const r0 = H * (look.vignetteR ?? 0.3), r1 = hypot(W, H) * 0.56, cx = W / 2, cy = H / 2;
    for (let y = 0; y < H; y++) {
      const dy = y - cy;
      for (let x = 0; x < W; x++) {
        const d = sqrt((x - cx) * (x - cx) + dy * dy);
        const u = clamp((d - r0) / (r1 - r0));
        m[y * W + x] = u * u * (3 - 2 * u) * look.vignette;
      }
    }
    this._vigKey = key;
    this._vig = m;
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

  postPixels(buf, look, frameIndex) {
    if (!look) return;
    const W = this.W, H = this.H;
    const gr = look.grade || {};
    const sat = gr.sat ?? 1, con = gr.con ?? 1, bri = gr.bri ?? 1;
    const vig = look.vignette > 0 ? this.vignetteMap(look) : null;
    const grain = look.grain > 0 ? look.grain : 0;
    if (sat === 1 && con === 1 && bri === 1 && !gr.lift && !gr.tint && !vig && !grain) return;
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
    const [R2, G2, B2] = L2;
    const vc = rgba(look.vignetteC ?? '#000');
    const vr = 1 - vc[0] / 255, vg = 1 - vc[1] / 255, vb = 1 - vc[2] / 255;
    const tile = grain ? this.grainTile() : null;
    const gi = look.grainFps > 0 ? floor((frameIndex / this.fps) * look.grainFps) : 0;
    const ox = floor(hash(gi, 3) * 256), oy = floor(hash(gi, 5) * 256);
    const gsh = this.s > 1.4 ? 1 : 0;
    const gk = grain * 255 * 0.32;
    const doSat = sat !== 1;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      const trow = (((y >> gsh) + oy) & 255) << 8;
      for (let x = 0; x < W; x++) {
        const i = (row + x) << 2;
        let r = L1[buf[i]], g = L1[buf[i + 1]], b = L1[buf[i + 2]];
        if (doSat) {
          const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          r = l + (r - l) * sat;
          g = l + (g - l) * sat;
          b = l + (b - l) * sat;
        }
        r = R2[r < 0 ? 0 : r > 255 ? 255 : r | 0];
        g = G2[g < 0 ? 0 : g > 255 ? 255 : g | 0];
        b = B2[b < 0 ? 0 : b > 255 ? 255 : b | 0];
        if (vig) {
          const w = vig[row + x];
          r *= 1 - w * vr;
          g *= 1 - w * vg;
          b *= 1 - w * vb;
        }
        if (tile) {
          const l = (r + g + b) * (1 / 765);
          const d = tile[trow + (((x >> gsh) + ox) & 255)] * gk * (0.3 + 2.8 * l * (1 - l));
          r += d;
          g += d;
          b += d;
        }
        buf[i] = r < 0 ? 0 : r > 255 ? 255 : r;
        buf[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        buf[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      }
    }
  }

  // ---------- esqueletos ----------
  drawRig(ctx, n, inh, t, env) {
    const sol = solveRig(n, t, env);
    const { S } = sol;
    if (this.probe) {
      const M = this.curLayerM ? this.curLayerM.inverse().multiply(ctx.getTransform()) : ctx.getTransform();
      this.probe.rigs.push({ scene: this.curScene, rig: n, name: n.name ?? `rig#${n.id}`, t, S, issues: sol.issues, M, ground: n.ground === undefined ? undefined : V(n.ground, t, env) });
    }
    const rest = restPose(n);
    const inh2 = this.inherit(inh, n, t, env);
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
    for (const it of n._skin) {
      if (it.show && (t < it.show[0] || t >= it.show[1])) continue;
      if (it.hidden && V(it.hidden, t, env)) continue;
      ctx.save();
      if (it.alpha !== undefined) ctx.globalAlpha *= V(it.alpha, t, env);
      if (it.kind === 'bone') {
        const cur = S.get(it.bone);
        if (!cur) throw new Error(`bamoo rig "${n.name ?? n.id}": pele presa a osso inexistente "${it.bone}"`);
        if (it.local) {
          ctx.translate(cur.x0, cur.y0);
          ctx.rotate((cur.abs * PI) / 180);
        } else ctx.transform(...bindMatrix(rest.get(it.bone), cur));
        this.drawNode(ctx, it.node, inh2, t, env);
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
    if (this.debugRig) this.drawSkeleton(ctx, sol);
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
