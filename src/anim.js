// Animação: easings, keyframes, osciladores, ruído suave, RNG determinístico.
// Toda propriedade de nó pode ser: valor fixo | kf(...) | função (t, env) => valor.

import { mix, isColor } from './color.js';

const { sin, cos, PI, pow, sqrt, floor, min, max, abs, exp } = Math;

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, u) => a + (b - a) * u;
export const smooth = (e0, e1, x) => {
  const u = clamp((x - e0) / (e1 - e0));
  return u * u * (3 - 2 * u);
};
export const remap = (x, a0, a1, b0, b1) => b0 + ((x - a0) / (a1 - a0)) * (b1 - b0);
export const deg = r => (r * 180) / PI;
export const rad = d => (d * PI) / 180;

const c1 = 1.70158, c3 = c1 + 1, c4 = (2 * PI) / 3;
const bounceOut = x => {
  const n = 7.5625, d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
  return n * (x -= 2.625 / d) * x + 0.984375;
};

/** Easings. Padrão em keyframes: 'inOut'. */
export const ease = {
  linear: x => x,
  in: x => x * x * x,
  out: x => 1 - pow(1 - x, 3),
  inOut: x => (x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2),
  in2: x => x * x,
  out2: x => 1 - (1 - x) * (1 - x),
  inOut2: x => (x < 0.5 ? 2 * x * x : 1 - pow(-2 * x + 2, 2) / 2),
  sine: x => -(cos(PI * x) - 1) / 2,
  expoIn: x => (x === 0 ? 0 : pow(2, 10 * x - 10)),
  expoOut: x => (x === 1 ? 1 : 1 - pow(2, -10 * x)),
  expo: x => (x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? pow(2, 20 * x - 10) / 2 : (2 - pow(2, -20 * x + 10)) / 2),
  back: x => 1 + c3 * pow(x - 1, 3) + c1 * pow(x - 1, 2),
  backIn: x => c3 * x * x * x - c1 * x * x,
  backInOut: x => {
    const c2 = c1 * 1.525;
    return x < 0.5 ? (pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2 : (pow(2 * x - 2, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2;
  },
  elastic: x => (x === 0 ? 0 : x === 1 ? 1 : pow(2, -10 * x) * sin((x * 10 - 0.75) * c4) + 1),
  bounce: bounceOut,
  step: x => (x < 1 ? 0 : 1),
  hold: x => (x < 1 ? 0 : 1),
};

export function easeFn(e) {
  if (typeof e === 'function') return e;
  const f = ease[e ?? 'inOut'];
  if (!f) throw new Error(`bamoo: easing desconhecido "${e}". Use: ${Object.keys(ease).join(', ')}`);
  return f;
}

/** Interpola números, arrays (recursivo), cores e objetos. */
export function lerpAny(a, b, u) {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * u;
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return u < 1 ? a : b;
    const n = max(a.length, b.length), out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = lerpAny(a[i] ?? b[i], b[i] ?? a[i], u);
    return out;
  }
  if (isColor(a) && isColor(b)) return a === b ? a : mix(a, b, u);
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const o = {};
    for (const k in a) o[k] = k in b ? lerpAny(a[k], b[k], u) : a[k];
    return o;
  }
  return u < 1 ? a : b;
}

export class KF {
  constructor(keys) {
    this.keys = keys
      .map(k => {
        if (!Array.isArray(k) || k.length < 2) throw new Error('bamoo: kf espera chaves [tempo, valor, easing?]');
        return { t: k[0], v: k[1], e: easeFn(k[2]) };
      })
      .sort((a, b) => a.t - b.t);
    this.period = 0;
    this.offset = 0;
  }
  /** Repete o keyframe a cada `p` segundos (padrão: sua própria duração). */
  loop(p) {
    const k = this.keys;
    this.period = p ?? k[k.length - 1].t - k[0].t;
    return this;
  }
  /** Atrasa o keyframe inteiro em `d` segundos. */
  delay(d) {
    this.offset += d;
    return this;
  }
  at(t) {
    const k = this.keys;
    t -= this.offset;
    if (this.period > 0) t = k[0].t + ((((t - k[0].t) % this.period) + this.period) % this.period);
    if (t <= k[0].t) return k[0].v;
    const n = k.length;
    if (t >= k[n - 1].t) return k[n - 1].v;
    let i = 1;
    while (k[i].t < t) i++;
    const a = k[i - 1], b = k[i];
    return lerpAny(a.v, b.v, b.e((t - a.t) / (b.t - a.t)));
  }
}

/**
 * Keyframes: kf([t, valor], [t, valor, easing], ...). O easing de uma chave vale para o trecho QUE CHEGA nela.
 * Valores podem ser números, arrays de pontos, cores, objetos.
 */
export const kf = (...keys) => new KF(keys);

/** Resolve um valor possivelmente animado no tempo t. */
export function V(v, t, env) {
  if (v === null || v === undefined) return v;
  const ty = typeof v;
  if (ty === 'number' || ty === 'string' || ty === 'boolean') return v;
  if (ty === 'function') return v(t, env);
  if (v instanceof KF) return v.at(t);
  return v;
}

/** Verdadeiro se v (ou algo dentro dele) é animado. */
export function isAnim(v) {
  if (typeof v === 'function' || v instanceof KF) return true;
  if (Array.isArray(v)) {
    for (const x of v) if (isAnim(x)) return true;
  }
  return false;
}

/** Resolve recursivamente arrays com elementos animados. */
export function deepV(v, t, env) {
  const r = V(v, t, env);
  if (Array.isArray(r)) {
    let out = null;
    for (let i = 0; i < r.length; i++) {
      const x = r[i];
      if (typeof x === 'number') continue;
      const y = deepV(x, t, env);
      if (y !== x) {
        if (!out) out = r.slice();
        out[i] = y;
      }
    }
    return out ?? r;
  }
  return r;
}

// ---------- helpers de tempo ----------

/** Progresso 0..1 entre t0 e t1 com easing. */
export const prog = (t, t0, t1, e = 'inOut') => easeFn(e)(clamp((t - t0) / (t1 - t0)));
/** Tween: valor de a até b entre t0 e t1. */
export const tw = (t, t0, t1, a = 0, b = 1, e = 'inOut') => lerpAny(a, b, prog(t, t0, t1, e));
/** Fase 0..1 de um ciclo de período p. */
export const cycle = (t, p = 1, off = 0) => ((((t + off) / p) % 1) + 1) % 1;
/** Verdadeiro se a <= t < b. */
export const between = (t, a, b) => t >= a && t < b;
/** Pulso suave 0->1->0 centrado em c com largura w. */
export const pulse = (t, c, w = 0.3) => {
  const x = abs(t - c) / w;
  return x >= 1 ? 0 : 0.5 + 0.5 * cos(PI * x);
};

/** Oscilador senoidal como prop: osc(freq Hz, amp, fase 0..1, base). */
export const osc = (freq = 1, amp = 1, phase = 0, base = 0) => t => base + amp * sin(2 * PI * (freq * t + phase));

/**
 * Trajetória suave (Catmull-Rom) por chaves [t, [x, y]] — retorna função t => [x, y].
 * Ao contrário de kf (que liga as chaves em linha reta), a curva passa suavemente por todas.
 * Um 3º elemento opcional na chave é o easing do trecho que chega nela.
 */
export function spline(...keys) {
  const K = keys.map(k => ({ t: k[0], p: k[1], e: k[2] ? easeFn(k[2]) : null })).sort((a, b) => a.t - b.t);
  const n = K.length;
  return t => {
    if (t <= K[0].t) return K[0].p;
    if (t >= K[n - 1].t) return K[n - 1].p;
    let i = 1;
    while (K[i].t < t) i++;
    const a = K[i - 1], b = K[i];
    let u = (t - a.t) / (b.t - a.t);
    if (b.e) u = b.e(u);
    const p0 = (K[i - 2] ?? a).p, p1 = a.p, p2 = b.p, p3 = (K[i + 1] ?? b).p;
    const u2 = u * u, u3 = u2 * u;
    return p1.map((_, j) =>
      0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * u3),
    );
  };
}

/** Direção (graus) do movimento de uma função posição t => [x, y] no instante t. */
export function heading(pos, t, dt = 1 / 60) {
  const a = pos(t - dt), b = pos(t + dt);
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / PI;
}

/**
 * Props de movimento para espalhar num grupo: G({ ...move(pos, { orient: true }) }, [...]).
 * orient: gira o grupo para a direção do movimento (offset em graus soma). maxTurn limita a rotação.
 */
export function move(pos, { orient = false, offset = 0, lag = 0 } = {}) {
  const p = { x: t => pos(t - lag)[0], y: t => pos(t - lag)[1] };
  if (orient) p.rot = t => heading(pos, t - lag) + offset;
  return p;
}

// ---------- ruído / aleatório determinístico ----------

function hash(i, seed) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(seed | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export { hash };

/** Ruído 1D suave (Perlin) em [-1, 1]. */
export function noise(x, seed = 0) {
  const i = floor(x), f = x - i;
  const g0 = hash(i, seed) * 2 - 1, g1 = hash(i + 1, seed) * 2 - 1;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  return 2 * lerp(g0 * f, g1 * (f - 1), u);
}

/** Ruído fractal 1D em ~[-1, 1]. */
export function fbm(x, seed = 0, oct = 3) {
  let s = 0, a = 1, n = 0;
  for (let o = 0; o < oct; o++) {
    s += a * noise(x, seed + o * 101);
    n += a;
    a *= 0.5;
    x *= 2.03;
  }
  return s / n;
}

/** Tremor orgânico como prop: wig(freq, amp, seed, base). */
export const wig = (freq = 1, amp = 1, seed = 0, base = 0) => t => base + amp * noise(t * freq, seed);

/** RNG determinístico (mulberry32). r() -> [0,1); r.range(a,b); r.int(a,b); r.pick(arr); r.sign() */
export function rng(seed = 1) {
  let s = (seed * 2654435761) >>> 0 || 1;
  const r = () => {
    s = (s + 0x6d2b79f5) | 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => floor(a + (b - a + 1) * r());
  r.pick = arr => arr[floor(r() * arr.length)];
  r.sign = () => (r() < 0.5 ? -1 : 1);
  r.gauss = () => {
    let u = 0;
    for (let i = 0; i < 4; i++) u += r();
    return (u - 2) / 0.577;
  };
  return r;
}

// ---------- vida de personagem ----------

/** Piscar natural: 0 = aberto, 1 = fechado. `every` = intervalo médio (s). */
export function blink(t, seed = 0, every = 3.6) {
  const k = floor(t / every);
  for (let j = k - 1; j <= k; j++) {
    const bt = j * every + hash(j, seed + 17) * (every - 0.4);
    const d = t - bt;
    if (d >= 0 && d < 0.17) return sin((PI * d) / 0.17);
  }
  return 0;
}

/** Abertura de boca para fala entre t0 e t1 (0..1). */
export function talk(t, t0, t1, seed = 0, rate = 9) {
  if (t < t0 || t > t1) return 0;
  const env = smooth(t0, t0 + 0.08, t) * (1 - smooth(t1 - 0.12, t1, t));
  const n = abs(noise(t * rate, seed)) * 1.25 + 0.25 * max(0, sin(t * rate * 1.7));
  return clamp(n * env);
}

/** Respiração: oscilação lenta 0..1. */
export const breathe = (t, rate = 0.25, seed = 0) => 0.5 + 0.5 * sin(2 * PI * rate * t + seed);

/**
 * Passada (andar/correr) dirigida pela DISTÂNCIA percorrida pelo quadril — o pé de apoio fica plantado
 * no chão com qualquer curva de velocidade (acelerar, frear, parar). Retorna [dx, dy] do pé relativo
 * à vertical do quadril (dy <= 0 = pé no ar). Use phase: 0.5 para a outra perna.
 * Para parar com os dois pés no chão: distância total = (n + 0.525) * stride / duty.
 */
export function gait(dist, { stride = 140, lift = 30, duty = 0.55, phase = 0 } = {}) {
  const p = (((dist * duty) / stride + phase) % 1 + 1) % 1;
  if (p < duty) return [stride * (0.5 - p / duty), 0];
  const u = (p - duty) / (1 - duty);
  const e = 0.5 - 0.5 * cos(PI * u);
  return [stride * (-0.5 + e), -lift * sin(PI * u)];
}
/** Fase 0..1 da passada (para balançar braços / quadril em sincronia com gait). */
export const gaitPhase = (dist, { stride = 140, duty = 0.55, phase = 0 } = {}) => ((((dist * duty) / stride + phase) % 1) + 1) % 1;

/** Decaimento exponencial (útil para impactos/tremores). */
export const decay = (t, t0, k = 6) => (t < t0 ? 0 : exp(-k * (t - t0)));

/** Mola amortecida: resposta 0->1 a partir de t0 com overshoot. */
export function spring(t, t0, freq = 3, damp = 5) {
  if (t < t0) return 0;
  const x = t - t0;
  return 1 - exp(-damp * x) * cos(2 * PI * freq * x);
}

export { sin, cos, PI, sqrt, abs, min, max, floor };
