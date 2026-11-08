// Texturas procedurais (geradas uma vez por processo, determinísticas).
// Dão o acabamento "impresso/pintado" das ilustrações: grão, respingos, pincel seco, papel, hachura.

import canvas from '@napi-rs/canvas';
import { rng } from './anim.js';
const { createCanvas } = canvas;

const cache = new Map();

function noiseCanvas(size, seed, fn) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const r = rng(seed);
  fn(img.data, size, r);
  ctx.putImageData(img, 0, 0);
  return c;
}

// ruído de valor 2D tileável (para manchas de papel)
function tileNoise(size, cells, r) {
  const g = [];
  for (let i = 0; i < cells * cells; i++) g.push(r());
  const at = (x, y) => g[((y % cells) + cells) % cells * cells + (((x % cells) + cells) % cells)];
  return (x, y) => {
    const fx = (x / size) * cells, fy = (y / size) * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    let u = fx - ix, v = fy - iy;
    u = u * u * (3 - 2 * u);
    v = v * v * (3 - 2 * v);
    const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

const GEN = {
  // grão fino de filme (cinza médio) — usar com 'overlay'
  grain: () =>
    noiseCanvas(256, 11, (d, n, r) => {
      for (let i = 0; i < n * n; i++) {
        const v = Math.max(0, Math.min(255, 128 + r.gauss() * 46));
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
        d[i * 4 + 3] = 255;
      }
    }),
  // respingos/pontilhado de spray — usar com 'multiply'
  speckle: () => {
    const n = 512, c = createCanvas(n, n), x = c.getContext('2d');
    const r = rng(23);
    for (let i = 0; i < 2600; i++) {
      const s = r() ** 3 * 2.6 + 0.35;
      x.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.6})`;
      const px = r() * n, py = r() * n;
      for (const [ox, oy] of [[0, 0], [n, 0], [-n, 0], [0, n], [0, -n]]) {
        x.beginPath();
        x.ellipse(px + ox, py + oy, s, s * (0.7 + r() * 0.5), r() * 3, 0, Math.PI * 2);
        x.fill();
      }
    }
    return c;
  },
  // pincel seco: estrias horizontais — usar com 'overlay'/'soft-light'
  brush: () => {
    const n = 512, c = createCanvas(n, n), x = c.getContext('2d');
    x.fillStyle = '#808080';
    x.fillRect(0, 0, n, n);
    const r = rng(37);
    for (let i = 0; i < 900; i++) {
      const y = r() * n, len = 40 + r() * 260, px = r() * n, w = 0.6 + r() * 2.6;
      const v = r() < 0.5 ? 255 : 0;
      x.strokeStyle = `rgba(${v},${v},${v},${0.05 + r() * 0.16})`;
      x.lineWidth = w;
      x.lineCap = 'round';
      for (const ox of [0, n, -n]) {
        for (const oy of [0, n, -n]) {
          x.beginPath();
          x.moveTo(px + ox, y + oy);
          x.quadraticCurveTo(px + ox + len / 2, y + oy + (r() - 0.5) * 6, px + ox + len, y + oy + (r() - 0.5) * 4);
          x.stroke();
        }
      }
    }
    return c;
  },
  // papel: manchas suaves + fibras (quase branco) — usar com 'multiply'
  paper: () =>
    noiseCanvas(512, 41, (d, n, r) => {
      const a = tileNoise(n, 8, r), b = tileNoise(n, 32, r);
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const i = (y * n + x) * 4;
          const v = 236 + a(x, y) * 14 + b(x, y) * 8 + r.gauss() * 3 - 6;
          d[i] = Math.min(255, v + 2);
          d[i + 1] = Math.min(255, v);
          d[i + 2] = Math.min(255, v - 5);
          d[i + 3] = 255;
        }
    }),
  // hachura diagonal fina — usar com 'multiply'
  hatch: () => {
    const n = 64, c = createCanvas(n, n), x = c.getContext('2d');
    x.strokeStyle = 'rgba(0,0,0,0.55)';
    x.lineWidth = 1.2;
    for (let k = -n; k <= 2 * n; k += 8) {
      x.beginPath();
      x.moveTo(k, 0);
      x.lineTo(k - n, n);
      x.stroke();
    }
    return c;
  },
  // manchas grandes (aquarela/guache) cinza médio — usar com 'soft-light'
  blot: () =>
    noiseCanvas(512, 53, (d, n, r) => {
      const a = tileNoise(n, 6, r), b = tileNoise(n, 18, r);
      for (let i = 0; i < n * n; i++) {
        const x = i % n, y = (i / n) | 0;
        const v = 128 + (a(x, y) - 0.5) * 120 + (b(x, y) - 0.5) * 50;
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
        d[i * 4 + 3] = 255;
      }
    }),
};

/** Modo de mesclagem e intensidade padrão de cada textura. */
export const TEX_MODE = {
  grain: ['overlay', 0.35],
  speckle: ['multiply', 0.35],
  brush: ['overlay', 0.5],
  paper: ['multiply', 0.6],
  hatch: ['multiply', 0.25],
  blot: ['soft-light', 0.6],
};

export function texCanvas(name) {
  let c = cache.get(name);
  if (!c) {
    const g = GEN[name];
    if (!g) throw new Error(`bamoo: textura desconhecida "${name}". Use: ${Object.keys(GEN).join(', ')}`);
    c = g();
    cache.set(name, c);
  }
  return c;
}

export const TEXTURES = Object.keys(GEN);
