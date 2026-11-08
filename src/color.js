// Cores: parse, conversão OKLab (misturas bonitas, sem "lama" cinza) e ajustes.

const NAMED = { white: '#ffffff', black: '#000000', transparent: '#0000', none: '#0000' };
const cache = new Map();

/** Converte qualquer cor aceita em [r, g, b, a] (0-255, alpha 0-1). */
export function rgba(c) {
  if (Array.isArray(c)) return c.length === 3 ? [c[0], c[1], c[2], 1] : c;
  let v = cache.get(c);
  if (v) return v;
  const s = typeof c === 'string' ? (NAMED[c] ?? c).trim() : c;
  if (typeof s !== 'string') throw new Error(`bamoo: cor inválida ${JSON.stringify(c)}`);
  if (s[0] === '#') {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map(x => x + x).join('');
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) throw new Error(`bamoo: cor inválida "${c}"`);
    const n = parseInt(h.slice(0, 6), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255, h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1];
  } else {
    const m = /^rgba?\(([^)]+)\)$/.exec(s);
    if (!m) throw new Error(`bamoo: cor inválida "${c}" (use #rrggbb, #rgb, #rrggbbaa ou rgba())`);
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    v = [p[0], p[1], p[2], p[3] ?? 1];
  }
  cache.set(c, v);
  return v;
}

const hx = n => {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return (v < 16 ? '0' : '') + v.toString(16);
};

/** [r,g,b,a] -> string CSS. */
export function css(c) {
  const [r, g, b, a = 1] = c;
  if (a >= 1) return '#' + hx(r) + hx(g) + hx(b);
  return '#' + hx(r) + hx(g) + hx(b) + hx(Math.max(0, a) * 255);
}

const toLin = c => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const toSrgb = c => {
  c = Math.max(0, c);
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
};

export function toOklab(c) {
  const [R, G, B, a] = rgba(c);
  const r = toLin(R), g = toLin(G), b = toLin(B);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    a,
  ];
}

export function fromOklab([L, A, B, a = 1]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a,
  ];
}

const mixCache = new Map();
/** Mistura duas cores em OKLab. t=0 -> a, t=1 -> b. Retorna string CSS. */
export function mix(a, b, t = 0.5) {
  if (t <= 0) return typeof a === 'string' ? a : css(rgba(a));
  if (t >= 1) return typeof b === 'string' ? b : css(rgba(b));
  const key = a + '|' + b;
  let pair = mixCache.get(key);
  if (!pair) {
    pair = [toOklab(a), toOklab(b)];
    if (mixCache.size > 5000) mixCache.clear();
    mixCache.set(key, pair);
  }
  const [p, q] = pair;
  return css(fromOklab([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t, p[3] + (q[3] - p[3]) * t]));
}

/** Ajuste em OKLCH: l = soma na luminosidade (-1..1), c = multiplica croma, h = gira matiz (graus), a = alpha. */
export function adj(color, { l = 0, c = 1, h = 0, a } = {}) {
  const [L, A, B, al] = toOklab(color);
  let C = Math.hypot(A, B) * c;
  const H = Math.atan2(B, A) + (h * Math.PI) / 180;
  return css(fromOklab([Math.max(0, Math.min(1, L + l)), C * Math.cos(H), C * Math.sin(H), a ?? al]));
}

export const lighten = (c, k = 0.1) => adj(c, { l: k });
export const darken = (c, k = 0.1) => adj(c, { l: -k });
export const alpha = (c, a) => {
  const [r, g, b] = rgba(c);
  return css([r, g, b, a]);
};

/** Verdadeiro se a string parece uma cor (para interpolação em keyframes). */
export const isColor = s => typeof s === 'string' && (s[0] === '#' || s.startsWith('rgb') || s in NAMED);
