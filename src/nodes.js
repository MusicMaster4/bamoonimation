// Fábricas de nós: a "linguagem" que o agente escreve. Tudo é objeto simples; o renderer avalia por frame.
// Props comuns de transformação: x, y, rot (graus), s, sx, sy, px, py (pivô), skx (graus), flip
// Props de estilo: fill, stroke, lw, shade, hl, tex, glow, blur, alpha, blend, drop, show:[t0,t1]
// Qualquer prop pode ser valor fixo, kf(...) ou função (t, env) => valor.

import { rng } from './anim.js';

let NID = 0;
const mk = (type, props) => ({ type, id: ++NID, ...props });

/** Achata arrays aninhados e remove null/false/undefined (permite filhos condicionais). */
export function flat(list, out = []) {
  if (!list) return out;
  if (!Array.isArray(list)) {
    out.push(list);
    return out;
  }
  for (const x of list) {
    if (x === null || x === undefined || x === false) continue;
    if (Array.isArray(x)) flat(x, out);
    else out.push(x);
  }
  return out;
}

const kids = c => (typeof c === 'function' ? c : flat(c));

/** Grupo: G(props, filhos) ou G(filhos). filhos pode ser função (t, env) => [...]. */
export function G(a, b) {
  if (Array.isArray(a) || typeof a === 'function') return mk('group', { children: kids(a) });
  return mk('group', { ...a, children: kids(b ?? a?.children ?? []) });
}

/** Camada de profundidade. z=1 plano focal; z>1 fundo (parallax menor, névoa, desfoque); z<1 primeiro plano. */
export function layer(a, b) {
  if (Array.isArray(a) || typeof a === 'function') return mk('layer', { z: 1, children: kids(a) });
  return mk('layer', { z: 1, ...a, children: kids(b ?? a?.children ?? []) });
}

/** Forma fechada suave pelos pontos [[x,y],[x,y,r]...] (r=0 quina viva). */
export const blob = (pts, p = {}) => mk('blob', { pts, ...p });
/** Polígono de quinas vivas (use p.r para arredondar cantos em px). */
export const poly = (pts, p = {}) => mk('poly', { pts, ...p });
export const circle = (cx, cy, r, p = {}) => mk('ellipse', { ell: [cx, cy, r, r], ...p });
export const ellipse = (cx, cy, rx, ry, p = {}) => mk('ellipse', { ell: [cx, cy, rx, ry], ...p });
/** Retângulo (x, y = canto superior esquerdo). p.r = raio dos cantos. */
export const rect = (x, y, w, h, p = {}) => mk('rect', { rc: [x, y, w, h], ...p });
/** Path SVG ("M0 0 C ..."). */
export const path = (d, p = {}) => mk('path', { d, ...p });
/** Linha (traço) suave aberta pelos pontos. p.lw largura, p.stroke cor, p.dash [a,b]. */
export const line = (pts, p = {}) => mk('line', { pts, ...p });
/** Pincelada afinada: pontos + largura (número | [w0, w1, ...] | u=>w). Preenchida com fill. */
export const taper = (pts, w, p = {}) => mk('taper', { pts, w, ...p });
/**
 * Membro com IK de 2 ossos: de `a` até o alvo `b`, comprimentos [l1, l2], larguras [w0, wJunta, wPonta].
 * p.bend = 1|-1 lado da dobra; p.end = nó desenhado na ponta (mão/pé), rotacionado na direção do 2º osso
 * (+ p.endRot graus) ou com rotação absoluta p.endAbs (ex.: 0 = sapato sempre na horizontal).
 */
export const limb = (a, b, len, w, p = {}) => mk('limb', { a, b, len, w, ...p });
/** Texto. p.font: 'hand'|'serif'|'sans'|'mono'|'script' ou família registrada; p.size; p.align; p.reveal 0..1 */
export const text = (str, p = {}) => mk('text', { str, ...p });
/** Imagem (png/jpg) do disco. p.w, p.h; desenhada a partir de (0,0) local (use px/py para centralizar). */
export const img = (src, p = {}) => mk('img', { src, ...p });
/** Sistema de partículas analítico (determinístico, sem estado). Ver README. */
export const particles = (o = {}) => mk('particles', o);
/** Raios de luz suaves (sol pela janela, luz subaquática, holofote). */
export const rays = (o = {}) => mk('rays', o);
/**
 * Esqueleto com peles (pessoas, animais). Ver docs/ANATOMIA.md.
 * { name, plan, bones (use skeleton(...)), pose: { osso: ângulo|kf|fn }, ik: [{ chain, target, endAng, bend }],
 *   skin: [{ bone, node } | { limb: [ossos], w, fill } | { spine: [ossos], top, bot, fill } | { draw: S => nó }],
 *   ground (y do chão nas coordenadas da camada, p/ o verificador), clamp (padrão true), order ('auto'|'manual') }
 * + props de transformação (x, y, rot, s, flip...). Peles com `bone` são desenhadas na POSE DE DESCANSO,
 * em coordenadas do rig, e acompanham o osso. Ordem automática: lado de lá (F) -> meio -> lado de cá (N).
 */
export const rig = (o = {}) => {
  if (!o.bones) throw new Error('bamoo: rig({...}) precisa de bones (use skeleton("humano"|"quadrupede"|"ave"|"peixe", {...}))');
  return mk('rig', { ...o, skin: o.skin ?? [] });
};
/** Escape: desenho livre com a API do canvas. fn(ctx, t, env). */
export const custom = (fn, p = {}) => mk('custom', { fn, ...p });
/** Nó dinâmico: fn(t, env) => nó | [nós]. */
export const dyn = (fn, p = {}) => mk('dyn', { fn, ...p });

// ---------- pinturas (gradientes relativos à caixa da forma) ----------

const stops = s => (s.length === 1 && Array.isArray(s[0]) && typeof s[0][0] !== 'number' ? s[0] : s);

/**
 * Gradiente linear. lin(ângulo, ...cores) — ângulo em graus (90 = de cima para baixo), relativo à caixa da forma.
 * Ou lin([x0,y0,x1,y1], ...cores) em coordenadas locais. Cores podem ser [posição, cor].
 */
export const lin = (a, ...s) => ({ grad: 'lin', a, stops: stops(s) });
/**
 * Gradiente radial. rad(null, ...cores) centro da caixa, raio = metade do maior lado (termina na borda);
 * rad({x:.3,y:.3,r:1}, ...) relativo à caixa (r em frações do maior lado);
 * rad([cx, cy, r], ...) absoluto local.
 */
export const rad = (c, ...s) => ({ grad: 'rad', c, stops: stops(s) });

// ---------- cena e filme ----------

/**
 * Cena: { size:[1920,1080], dur, bg, look, camera, layers, captions, fadeIn, fadeOut }.
 */
export function scene(o) {
  if (!o || typeof o !== 'object') throw new Error('bamoo: scene({...}) espera um objeto');
  if (!(o.dur > 0)) throw new Error('bamoo: scene precisa de dur (segundos) > 0');
  if (!Array.isArray(o.layers) && typeof o.layers !== 'function') throw new Error('bamoo: scene precisa de layers: [...]');
  return { kind: 'scene', size: [1920, 1080], ...o, layers: Array.isArray(o.layers) ? flat(o.layers) : o.layers };
}

/**
 * Filme com vários planos: film([cenaA, cenaB, ...], { trans: 'cross'|'black'|'white'|'wipe'|'cut', d: 0.6 }).
 * Cada cena pode definir sua própria transição de entrada com { trans, transD }.
 */
export function film(scenes, o = {}) {
  const list = flat(scenes);
  if (!list.length) throw new Error('bamoo: film precisa de pelo menos uma cena');
  return { kind: 'film', scenes: list, trans: o.trans ?? 'cross', d: o.d ?? 0.6, look: o.look, captions: o.captions };
}

/** Cria n nós variados de forma determinística: scatter(n, seed, (r, i) => nó). r = rng. */
export const scatter = (n, seed, fn) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push(fn(rng(seed * 7919 + i * 31 + 1), i));
  return out;
};

/** Repete i = 0..n-1: rep(n, i => valor). Serve para nós e para listas de pontos. */
export const rep = (n, fn) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push(fn(i, n));
  return out;
};
