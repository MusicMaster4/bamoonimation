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

// ---------- interpolação "auto" (tangentes automáticas, como o "auto clamped" dos programas de animação) ----------
// Trecho sem easing explícito: curva de Hermite cujas tangentes são calculadas pelas chaves vizinhas
// (PCHIP, monótona: nunca passa do valor da chave). Resultado: SLOW IN / SLOW OUT nas chaves de repouso
// (primeira, última, extremos e "holds") e movimento contínuo — sem a parada robótica — nas chaves de passagem.
// Trecho de repouso a repouso usa o inOut cúbico (o mesmo de antes).

const isNum = x => typeof x === 'number';

/** Tangente (por folha numérica) numa chave, a partir dos vizinhos p (anterior) e n (próximo). */
function tanAny(p, c, n, hp, hn) {
  if (isNum(c)) {
    if (!isNum(p) || !isNum(n)) return 0;
    const d0 = (c - p) / hp, d1 = (n - c) / hn;
    if (d0 * d1 <= 0) return 0; // extremo ou hold: repousa
    const w1 = 2 * hn + hp, w2 = hn + 2 * hp;
    return (w1 + w2) / (w1 / d0 + w2 / d1);
  }
  if (Array.isArray(c)) return c.map((x, i) => tanAny(Array.isArray(p) ? p[i] : undefined, x, Array.isArray(n) ? n[i] : undefined, hp, hn));
  if (c && typeof c === 'object' && !isColor(c)) {
    const o = {};
    for (const k in c) o[k] = tanAny(p?.[k], c[k], n?.[k], hp, hn);
    return o;
  }
  return null;
}
/** Tangente que continua a velocidade de um trecho com easing explícito (derivada `de` × secante), limitada. */
function tanMatch(edge, a, b, h, sec) {
  if (isNum(a) && isNum(b) && isNum(sec)) {
    if (Math.abs(edge) < 1e-3) return 0; // o trecho vizinho chega/sai parado
    const m = (edge * (b - a)) / h;
    if (!isFinite(m) || m * sec <= 0) return 0;
    return Math.sign(m) * min(Math.abs(m), 3 * Math.abs(sec));
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.map((x, i) => tanMatch(edge, x, b[i], h, Array.isArray(sec) ? sec[i] : undefined));
  if (a && b && typeof a === 'object' && !isColor(a)) {
    const o = {};
    for (const k in a) o[k] = tanMatch(edge, a[k], b[k], h, sec?.[k]);
    return o;
  }
  return null;
}
const secAny = (a, b, h) => {
  if (isNum(a) && isNum(b)) return (b - a) / h;
  if (Array.isArray(a) && Array.isArray(b)) return a.map((x, i) => secAny(x, b[i], h));
  if (a && b && typeof a === 'object' && !isColor(a)) {
    const o = {};
    for (const k in a) o[k] = secAny(a[k], b[k], h);
    return o;
  }
  return undefined;
};
/** Verdadeiro se todas as folhas numéricas da tangente são 0 (chave de repouso). */
function isRest(m) {
  if (m === null || m === undefined) return true;
  if (isNum(m)) return m === 0;
  if (Array.isArray(m)) return m.every(isRest);
  if (typeof m === 'object') {
    for (const k in m) if (!isRest(m[k])) return false;
    return true;
  }
  return true;
}
/** Hermite cúbico por folha (cores/strings: mistura suave). */
function hermAny(a, b, ma, mb, h, u) {
  if (isNum(a) && isNum(b)) {
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * h * (ma || 0) + (-2 * u3 + 3 * u2) * b + (u3 - u2) * h * (mb || 0);
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return u < 1 ? a : b;
    const n = max(a.length, b.length), out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = a[i] === undefined || b[i] === undefined ? (a[i] ?? b[i]) : hermAny(a[i], b[i], ma?.[i], mb?.[i], h, u);
    return out;
  }
  if (isColor(a) && isColor(b)) return a === b ? a : mix(a, b, u * u * (3 - 2 * u));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const o = {};
    for (const k in a) o[k] = k in b ? hermAny(a[k], b[k], ma?.[k], mb?.[k], h, u) : a[k];
    return o;
  }
  return u < 1 ? a : b;
}
/** base + k·(b − a) em cada folha numérica (usado pelas curvas de antecipação/overshoot). */
function addDelta(base, a, b, k) {
  if (!k) return base;
  if (isNum(base) && isNum(a) && isNum(b)) return base + k * (b - a);
  if (Array.isArray(base) && Array.isArray(a) && Array.isArray(b)) return base.map((x, i) => addDelta(x, a[i], b[i], k));
  if (base && typeof base === 'object' && !isColor(base) && a && b) {
    const o = {};
    for (const key in base) o[key] = addDelta(base[key], a?.[key], b?.[key], k);
    return o;
  }
  return base;
}
// formas das "bossas" de atuação dentro de um trecho (u = 0..1): começam e terminam com velocidade zero
const BUMP_ANT = u => (u < 0.36 ? Math.sin((PI * u) / 0.36) ** 2 : 0); // pico em u≈0.18 (antes do arranque)
const BUMP_OVR = u => (u > 0.66 ? Math.sin((PI * (u - 0.66)) / 0.34) ** 2 : 0); // pico em u≈0.83 (passa do alvo e volta)
const smoothstep = (e0, e1, x) => {
  const u = clamp((x - e0) / (e1 - e0));
  return u * u * (3 - 2 * u);
};
/** Quanto de antecipação/overshoot um trecho de duração h recebe: ações rápidas sim, movimentos lentos quase nada. */
export const fatorRapidez = h => 0.15 + 0.85 * (1 - smoothstep(0.3, 1.5, h));

export class KF {
  constructor(keys) {
    this.keys = keys
      .map(k => {
        if (!Array.isArray(k) || k.length < 2) throw new Error('bamoo: kf espera chaves [tempo, valor, easing?]');
        // sem easing = 'auto' (tangentes automáticas). Easing explícito mantém o comportamento clássico.
        const auto = k[2] === undefined || k[2] === 'auto';
        return { t: k[0], v: k[1], e: auto ? null : easeFn(k[2]) };
      })
      .sort((a, b) => a.t - b.t);
    this.period = 0;
    this.offset = 0;
    this.arcK = 0;
  }
  /** Repete o keyframe a cada `p` segundos (padrão: sua própria duração). */
  loop(p) {
    const k = this.keys;
    this.period = p ?? k[k.length - 1].t - k[0].t;
    this._seg = null;
    return this;
  }
  /** Atrasa o keyframe inteiro em `d` segundos. */
  delay(d) {
    this.offset += d;
    return this;
  }
  /**
   * ARCOS: trechos entre pontos [x, y] viram arcos (curvatura k = fração da distância; + = para cima/esquerda
   * da direção do movimento, − = para o outro lado). Ex.: kf([0, [100, 800]], [1, [900, 800]]).arco(0.25).
   */
  arco(k = 0.2) {
    this.arcK = k;
    return this;
  }
  /** Prepara tangentes e repousos de cada trecho (uma vez). */
  prep() {
    if (this._seg && this._segP === this.period) return this._seg;
    const k = this.keys, n = k.length;
    const cyc = this.period > 0 && n >= 3 && Math.abs(this.period - (k[n - 1].t - k[0].t)) < 1e-6;
    const tanAt = j => {
      let pj = j - 1, nj = j + 1, hp, hn;
      if (cyc && (j === 0 || j === n - 1)) {
        pj = n - 2;
        nj = 1;
        hp = k[n - 1].t - k[n - 2].t;
        hn = k[1].t - k[0].t;
      } else {
        hp = j > 0 ? k[j].t - k[j - 1].t : 1;
        hn = j < n - 1 ? k[j + 1].t - k[j].t : 1;
      }
      return tanAny(k[pj]?.v, k[j].v, k[nj]?.v, hp, hn);
    };
    const T = k.map((_, j) => tanAt(j));
    const seg = [null];
    for (let i = 1; i < n; i++) {
      const a = k[i - 1], b = k[i], h = b.t - a.t || 1e-6;
      if (b.e) {
        seg.push({ h, explicit: true });
        continue;
      }
      const sec = secAny(a.v, b.v, h);
      // vizinhos com easing explícito: continua a velocidade deles (C1), limitada para não passar do alvo
      let m0 = T[i - 1], m1 = T[i];
      if (i - 1 > 0 && a.e) {
        const pa = k[i - 2], e = a.e, d1 = (1 - e(1 - 1e-4)) / 1e-4;
        m0 = tanMatch(d1 > 50 ? 0 : d1, pa.v, a.v, a.t - pa.t || 1e-6, sec);
      }
      if (i + 1 < n && k[i + 1].e) {
        const nb = k[i + 1], e = nb.e, d0 = e(1e-4) / 1e-4;
        m1 = tanMatch(d0 > 50 ? 0 : d0, b.v, nb.v, nb.t - b.t || 1e-6, sec);
      }
      seg.push({ h, m0, m1, r0: isRest(m0), r1: isRest(m1) });
    }
    this._segP = this.period;
    return (this._seg = seg);
  }
  /** Avalia o trecho i (de k[i-1] a k[i]) na fração u. `ac` = { a, b } amplitudes de antecipação/overshoot. */
  segVal(i, u, ac) {
    const k = this.keys, A = k[i - 1], B = k[i], S = this.prep()[i];
    let v;
    if (S.explicit) v = lerpAny(A.v, B.v, B.e(u));
    else {
      v = S.r0 && S.r1 ? lerpAny(A.v, B.v, ease.inOut(u)) : hermAny(A.v, B.v, S.m0, S.m1, S.h, u);
      if (ac) {
        const g = fatorRapidez(S.h);
        const c = (S.r0 ? -ac.a * g * BUMP_ANT(u) : 0) + (S.r1 ? ac.b * g * BUMP_OVR(u) : 0);
        if (c) v = addDelta(v, A.v, B.v, c);
      }
    }
    if (this.arcK && Array.isArray(A.v) && A.v.length === 2 && isNum(A.v[0]) && Array.isArray(v)) {
      const dx = B.v[0] - A.v[0], dy = B.v[1] - A.v[1];
      // bojo parabólico perpendicular ao trecho (para cima da direção do movimento quando k > 0)
      const s = (dx >= 0 ? 1 : -1) * this.arcK * 4 * u * (1 - u);
      v = [v[0] + dy * s, v[1] - dx * s];
    }
    return v;
  }
  /** Avaliação com ATUAÇÃO: antecipação (a) no arranque e overshoot (b) na chegada dos trechos de repouso. */
  at(t, ac) {
    const k = this.keys;
    t -= this.offset;
    if (this.period > 0) t = k[0].t + ((((t - k[0].t) % this.period) + this.period) % this.period);
    if (t <= k[0].t) return k[0].v;
    const n = k.length;
    if (t >= k[n - 1].t) return k[n - 1].v;
    let i = 1;
    while (k[i].t < t) i++;
    return this.segVal(i, (t - k[i - 1].t) / (k[i].t - k[i - 1].t), ac);
  }
}

/**
 * Keyframes: kf([t, valor], [t, valor, easing], ...). O easing de uma chave vale para o trecho QUE CHEGA nela.
 * Sem easing ('auto'): tangentes automáticas — slow in/slow out nas chaves de repouso (primeira, última,
 * extremos, holds) e passagem contínua pelas chaves intermediárias (sem a parada robótica a cada chave).
 * Valores podem ser números, arrays de pontos, cores, objetos.
 */
export const kf = (...keys) => new KF(keys);

// ---------- princípios de animação como valores ----------

/** Converte um kf de pontos [x, y] em kf polar [raio, ângulo] em torno de c (ângulo desenrolado: arco mais curto). */
function polarKF(K, c) {
  let prev = null;
  const keys = K.keys.map(k => {
    const [x, y] = k.v;
    let a = (Math.atan2(y - c[1], x - c[0]) * 180) / PI;
    if (prev !== null) {
      while (a - prev > 180) a -= 360;
      while (a - prev < -180) a += 360;
    }
    prev = a;
    return [k.t, [Math.hypot(x - c[0], y - c[1]), a], k.e ? k.e : undefined];
  });
  const P = new KF(keys);
  P.period = K.period;
  P.offset = K.offset;
  return P;
}

/**
 * ATUAÇÃO (antecipação + follow-through + timing): envolve um valor animado.
 *   acao(kf(...), { antecipa: 0.1, passa: 0.08, atraso: 0, polar: [cx, cy], exagero: 1 })
 * - antecipa: recuo contrário antes de cada arranque a partir do repouso (fração do movimento);
 * - passa: passa do alvo e assenta na chegada (overshoot/follow-through), dentro do próprio trecho;
 * - os dois escalam com a rapidez do trecho (ação rápida = mais; movimento lento ≈ nada);
 * - atraso: desloca no tempo (overlapping action: partes que seguem a principal);
 * - polar: interpola pontos em ARCO em torno de [cx, cy] (ex.: mão girando em torno do ombro);
 * - exagero: multiplica antecipação e overshoot (o env.exagero da cena também multiplica).
 * Funções de t recebem só o atraso. Valores fixos passam direto.
 */
export function acao(v, o = {}) {
  const d = o.atraso ?? 0;
  if (v instanceof KF) {
    const K = o.polar ? polarKF(v, o.polar) : v;
    const a0 = o.antecipa ?? 0.1, b0 = o.passa ?? 0.08, ex0 = o.exagero ?? 1, c = o.polar;
    const f = (t, env) => {
      const ex = ex0 * (env?.exagero ?? 1);
      const r = K.at(t - d, ex > 0 ? { a: a0 * ex, b: b0 * ex } : null);
      if (!c) return r;
      const ang = (r[1] * PI) / 180;
      return [c[0] + r[0] * cos(ang), c[1] + r[0] * sin(ang)];
    };
    f._acao = true;
    return f;
  }
  if (typeof v === 'function') {
    if (!d) return v;
    const f = (t, env) => v(t - d, env);
    f._acao = true;
    return f;
  }
  return v;
}

/** Atrasa um valor animado em `d` segundos (overlapping action manual). */
export const atraso = (v, d) => acao(v, { atraso: d, antecipa: 0, passa: 0 });

// soma ponderada de valores (números, arrays, objetos) para os filtros por convolução
function accum(acc, v, w) {
  if (isNum(v)) return (acc ?? 0) + v * w;
  if (Array.isArray(v)) {
    const out = acc ?? new Array(v.length).fill(undefined);
    for (let i = 0; i < v.length; i++) out[i] = accum(out[i], v[i], w);
    return out;
  }
  if (v && typeof v === 'object' && !isColor(v)) {
    const out = acc ?? {};
    for (const k in v) out[k] = accum(out[k], v[k], w);
    return out;
  }
  return acc ?? v;
}

/** Pesos da resposta ao impulso de um sistema massa-mola (normalizados: soma 1 → holds exatos). */
export function pesosMola(freq = 2, amort = 0.6, dt = 1 / 60) {
  const w = 2 * PI * freq, z = clamp(amort, 0.05, 3);
  const win = min(3, 6 / (z * w));
  const N = max(4, Math.ceil(win / dt));
  const out = [];
  let s = 0;
  for (let k = 0; k <= N; k++) {
    const tau = k * dt;
    let h;
    if (z < 0.999) {
      const wd = w * sqrt(1 - z * z);
      h = (w / sqrt(1 - z * z)) * exp(-z * w * tau) * sin(wd * tau);
    } else h = w * w * tau * exp(-w * tau);
    const tw = k === 0 || k === N ? 0.5 : 1;
    out.push([tau, h * tw]);
    s += h * tw;
  }
  for (const p of out) p[1] /= s || 1;
  return out;
}

/**
 * SEGUE: o valor persegue `v` como uma mola (lag + overshoot + assentamento) — follow-through/overlap
 * para qualquer coisa: câmera que segue o personagem, antena, rabo, objeto pendurado...
 *   camera: { x: segue(t => heroi(t)[0], { freq: 0.8, amort: 0.9 }) }
 * freq (Hz): rigidez (maior = segue mais de perto); amort: 0.2 balança muito, 1 sem overshoot.
 */
export function segue(v, { freq = 2, amort = 0.6, dt } = {}) {
  const W = pesosMola(freq, amort, dt ?? min(1 / 60, 1 / (12 * freq)));
  const f = (t, env) => {
    let acc;
    for (const [tau, w] of W) acc = accum(acc, V(v, t - tau, env), w);
    return acc;
  };
  f._acao = true;
  return f;
}

/**
 * QUICA: objeto quicando no chão (arcos parabólicos, alturas que decaem, cada quique mais curto) — com
 * `squash` automático (estica na queda, achata no impacto). Desenhe o objeto com a BASE em (0, 0).
 *   G({ ...quica({ x0: 300, vx: 380, chao: 900, altura: 420, t0: 0.5, queda: 0.55 }) }, [circle(0, -60, 60)])
 * o: x0, vx (px/s, desacelera com o atrito), chao, altura (1ª queda), t0, queda (s da 1ª queda),
 *    perda (fração da altura que sobra a cada quique, 0.5), quiques (máx. 6), squash (1), atrito (s, 1.6).
 */
export function quica(o = {}) {
  const H0 = o.altura ?? 400, Tq = o.queda ?? 0.5, g = (2 * H0) / (Tq * Tq), r = o.perda ?? 0.5;
  const t0 = o.t0 ?? 0, nq = o.quiques ?? 6, chao = o.chao ?? 900, x0 = o.x0 ?? 0, vx = o.vx ?? 0, tau = o.atrito ?? 1.6;
  // instantes de impacto
  const imp = [t0 + Tq];
  let h = H0;
  for (let i = 0; i < nq; i++) {
    h *= r;
    imp.push(imp[imp.length - 1] + 2 * sqrt((2 * h) / g));
  }
  const height = t => {
    if (t <= t0) return H0;
    if (t < imp[0]) return H0 - 0.5 * g * (t - t0) ** 2;
    for (let i = 1; i < imp.length; i++) {
      if (t < imp[i]) {
        const T = imp[i] - imp[i - 1], s = t - imp[i - 1], v0 = (g * T) / 2;
        return v0 * s - 0.5 * g * s * s;
      }
    }
    return 0;
  };
  return {
    x: t => x0 + vx * tau * (1 - exp(-max(0, t - t0) / tau)),
    y: t => chao - height(t),
    squash: { k: o.squash ?? 1, base: [0, 0] },
    impactos: imp,
  };
}

/**
 * PULO com os princípios embutidos: agacha antes (antecipação), sai esticando, arco parabólico (arcs),
 * "flutua" no topo (slow in/out natural da física), pousa achatando e amortece (follow-through).
 * Devolve { x, y, sx, sy, squash } para espalhar num grupo cuja ORIGEM é o ponto de apoio (base no chão).
 * (Personagens com pernas: use o y para o quadril e dobre as pernas por IK; aqui o "agachar" é um achatar.)
 * o: de [x, y], ate [x, y], altura (do arco, px), t0 (decolagem), dur (no ar), agacha (fração, 0.22),
 *    prep (s de preparação, 0.3), amortece (s, 0.35), squash (1).
 */
export function pulo(o = {}) {
  const [x0, y0] = o.de ?? [0, 0], [x1, y1] = o.ate ?? [x0, y0];
  const H = o.altura ?? 200, t0 = o.t0 ?? 1, T = o.dur ?? 0.7, ag = o.agacha ?? 0.22;
  const prep = o.prep ?? 0.3, am = o.amortece ?? 0.35, t1 = t0 + T;
  const dip = t => {
    if (t < t0 - prep) return 0;
    if (t < t0) {
      const u = (t - (t0 - prep)) / prep;
      // desce devagar e sobe rápido no impulso
      return u < 0.7 ? ag * ease.inOut2(u / 0.7) : ag * (1 - ease.in2((u - 0.7) / 0.3));
    }
    if (t < t1) return 0;
    if (t < t1 + am) {
      const u = (t - t1) / am;
      return 0.7 * ag * (u < 0.35 ? ease.out2(u / 0.35) : 1 - ease.inOut2((u - 0.35) / 0.65));
    }
    return 0;
  };
  const arc = t => {
    if (t <= t0) return [x0, y0];
    if (t >= t1) return [x1, y1];
    const u = (t - t0) / T;
    return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u - 4 * H * u * (1 - u)];
  };
  const sy = t => 1 - dip(t);
  return {
    x: t => arc(t)[0],
    y: t => arc(t)[1],
    sy,
    sx: t => 1 / sy(t), // área constante (volume consistente)
    squash: { k: o.squash ?? 1, base: [0, 0] },
  };
}

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

/**
 * Monitor de aleatoriedade: o renderer marca quando está desenhando um quadro. Um rng criado FORA do render
 * (na montagem da cena) e chamado DENTRO dele (numa função de t) sorteia um valor novo a cada avaliação — o
 * desenho pisca. O verificador usa `misuse` para acusar isso.
 */
export const RNG_MONITOR = { rendering: 0, misuse: 0 };

/** RNG determinístico (mulberry32). r() -> [0,1); r.range(a,b); r.int(a,b); r.pick(arr); r.sign() */
export function rng(seed = 1) {
  let s = (seed * 2654435761) >>> 0 || 1;
  const born = RNG_MONITOR.rendering > 0;
  const r = () => {
    if (!born && RNG_MONITOR.rendering > 0) RNG_MONITOR.misuse++;
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
