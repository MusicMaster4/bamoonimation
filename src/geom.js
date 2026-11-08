// Geometria: splines suaves (Catmull-Rom), traços afinados (taper), IK de 2 ossos, ondas.

import canvas from '@napi-rs/canvas';
const { Path2D } = canvas;
const { hypot, atan2, cos, sin, acos, PI, max, min, abs, ceil } = Math;

/**
 * Forma fechada suave passando pelos pontos. Cada ponto: [x, y] ou [x, y, r],
 * r = arredondamento local (1 = suave, 0 = quina viva, >1 = mais bojudo).
 */
export function blobPath(pts, round = 1, path = new Path2D()) {
  const n = pts.length;
  if (n < 2) return path;
  const P = i => pts[((i % n) + n) % n];
  path.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const k1 = (round * (p1[2] ?? 1)) / 6, k2 = (round * (p2[2] ?? 1)) / 6;
    path.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) * k1, p1[1] + (p2[1] - p0[1]) * k1,
      p2[0] - (p3[0] - p1[0]) * k2, p2[1] - (p3[1] - p1[1]) * k2,
      p2[0], p2[1],
    );
  }
  path.closePath();
  return path;
}

/** Polígono de quinas vivas. */
export function polyPath(pts, path = new Path2D()) {
  if (!pts.length) return path;
  path.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
  path.closePath();
  return path;
}

/** Curva aberta suave passando pelos pontos (para linhas). */
export function curvePath(pts, round = 1, path = new Path2D()) {
  const n = pts.length;
  if (n < 2) return path;
  path.moveTo(pts[0][0], pts[0][1]);
  if (round === 0 || n === 2) {
    for (let i = 1; i < n; i++) path.lineTo(pts[i][0], pts[i][1]);
    return path;
  }
  const P = i => pts[max(0, min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const k1 = (round * (p1[2] ?? 1)) / 6, k2 = (round * (p2[2] ?? 1)) / 6;
    path.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) * k1, p1[1] + (p2[1] - p0[1]) * k1,
      p2[0] - (p3[0] - p1[0]) * k2, p2[1] - (p3[1] - p1[1]) * k2,
      p2[0], p2[1],
    );
  }
  return path;
}

/** Amostra a spline aberta em pontos densos. */
export function sampleCurve(pts, round = 1) {
  const n = pts.length;
  if (n < 2) return pts.map(p => [p[0], p[1]]);
  const P = i => pts[max(0, min(n - 1, i))];
  const out = [[pts[0][0], pts[0][1]]];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const k1 = (round * (p1[2] ?? 1)) / 6, k2 = (round * (p2[2] ?? 1)) / 6;
    const ax = p1[0], ay = p1[1];
    const bx = p1[0] + (p2[0] - p0[0]) * k1, by = p1[1] + (p2[1] - p0[1]) * k1;
    const cx = p2[0] - (p3[0] - p1[0]) * k2, cy = p2[1] - (p3[1] - p1[1]) * k2;
    const dx = p2[0], dy = p2[1];
    const len = hypot(bx - ax, by - ay) + hypot(cx - bx, cy - by) + hypot(dx - cx, dy - cy);
    const steps = max(3, min(40, ceil(len / 5)));
    for (let s = 1; s <= steps; s++) {
      const u = s / steps, v = 1 - u;
      const a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
      out.push([a * ax + b * bx + c * cx + d * dx, a * ay + b * by + c * cy + d * dy]);
    }
  }
  return out;
}

/** Perfil de largura: número | [w0, w1, ...] (suave) | função u=>w. */
export function widthFn(w) {
  if (typeof w === 'function') return w;
  if (typeof w === 'number') return () => w;
  if (!Array.isArray(w) || !w.length) return () => 4;
  if (w.length === 1) return () => w[0];
  const n = w.length - 1;
  return u => {
    const x = max(0, min(1, u)) * n;
    const i = min(n - 1, Math.floor(x));
    const f = x - i;
    const s = f * f * (3 - 2 * f);
    return w[i] + (w[i + 1] - w[i]) * s;
  };
}

/**
 * Contorno de um traço afinado ("pincelada") ao longo da spline.
 * Retorna Path2D. caps: 'round' | 'flat'.
 */
export function taperPath(pts, w, { round = 1, caps = 'round' } = {}, path = new Path2D()) {
  const S = sampleCurve(pts, round);
  const n = S.length;
  if (n < 2) return path;
  const W = widthFn(w);
  const L = new Array(n);
  L[0] = 0;
  for (let i = 1; i < n; i++) L[i] = L[i - 1] + hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]);
  const total = L[n - 1] || 1;
  const left = new Array(n), right = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = S[max(0, i - 1)], b = S[min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const tl = hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const hw = max(0, W(L[i] / total)) / 2;
    left[i] = [S[i][0] - ty * hw, S[i][1] + tx * hw];
    right[i] = [S[i][0] + ty * hw, S[i][1] - tx * hw];
  }
  path.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < n; i++) path.lineTo(left[i][0], left[i][1]);
  // ponta final
  const wEnd = max(0, W(1)) / 2;
  if (caps === 'round' && wEnd > 0.3) {
    const e = S[n - 1], p = S[n - 2];
    const ang = atan2(e[1] - p[1], e[0] - p[0]);
    path.arc(e[0], e[1], wEnd, ang + PI / 2, ang - PI / 2, true);
  } else path.lineTo(right[n - 1][0], right[n - 1][1]);
  for (let i = n - 2; i >= 0; i--) path.lineTo(right[i][0], right[i][1]);
  const w0 = max(0, W(0)) / 2;
  if (caps === 'round' && w0 > 0.3) {
    const s = S[0], q = S[1];
    const ang = atan2(q[1] - s[1], q[0] - s[0]);
    path.arc(s[0], s[1], w0, ang - PI / 2, ang + PI / 2, true);
  }
  path.closePath();
  return path;
}

/**
 * IK de 2 ossos: ombro `a`, alvo `b`, comprimentos l1/l2. bend = 1 ou -1 escolhe o lado do cotovelo/joelho.
 * Retorna { j: [x,y] articulação, e: [x,y] ponta (alvo limitado ao alcance) }.
 */
export function ik2(a, b, l1, l2, bend = 1) {
  let dx = b[0] - a[0], dy = b[1] - a[1];
  let d = hypot(dx, dy) || 1e-6;
  const dmax = l1 + l2 - 1e-4, dmin = abs(l1 - l2) + 1e-4;
  const dd = max(dmin, min(dmax, d));
  const ux = dx / d, uy = dy / d;
  const e = [a[0] + ux * dd, a[1] + uy * dd];
  const ang = atan2(uy, ux);
  const A = acos(max(-1, min(1, (l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd))));
  const th = ang - bend * A;
  return { j: [a[0] + cos(th) * l1, a[1] + sin(th) * l1], e };
}

/**
 * Aplica uma onda viajante perpendicular a uma "espinha" de pontos (peixes, caudas, cobras, algas, bandeiras).
 * amp pode ser número ou função u=>amp (u=0 no primeiro ponto, 1 no último).
 * dir = 1: a onda viaja do primeiro ponto para o último; dir = -1: do último para o primeiro
 * (espinha cauda->cabeça de um peixe: use dir:-1 para a onda ir da cabeça para a cauda).
 */
export function wave(pts, t, { amp = 10, freq = 1, len = 1, phase = 0, dir = 1 } = {}) {
  const n = pts.length;
  const A = typeof amp === 'function' ? amp : () => amp;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[max(0, i - 1)], b = pts[min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const tl = hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const u = n > 1 ? i / (n - 1) : 0;
    const off = A(u) * sin(2 * PI * (freq * t - (dir * u) / len + phase));
    out[i] = [pts[i][0] - ty * off, pts[i][1] + tx * off, pts[i][2]];
  }
  return out;
}

/**
 * Ponto e ângulo (graus) na fração u (0..1, por comprimento de arco) de uma polilinha/espinha.
 * Retorna { x, y, ang, nx, ny } — (nx, ny) = normal à esquerda (para y para baixo: "acima" de uma espinha que aponta p/ direita).
 */
export function along(pts, u) {
  const n = pts.length;
  if (n < 2) return { x: pts[0]?.[0] ?? 0, y: pts[0]?.[1] ?? 0, ang: 0, nx: 0, ny: -1 };
  const L = [0];
  for (let i = 1; i < n; i++) L.push(L[i - 1] + hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const target = max(0, min(1, u)) * L[n - 1];
  let i = 1;
  while (i < n - 1 && L[i] < target) i++;
  const seg = L[i] - L[i - 1] || 1;
  const f = (target - L[i - 1]) / seg;
  const a = pts[i - 1], b = pts[i];
  const dx = b[0] - a[0], dy = b[1] - a[1], dl = hypot(dx, dy) || 1;
  return { x: a[0] + dx * f, y: a[1] + dy * f, ang: (atan2(dy, dx) * 180) / PI, nx: dy / dl, ny: -dx / dl };
}

/**
 * Contorno de um corpo ao redor de uma espinha (peixes, tubarões, aves, mamíferos de perfil, cobras...).
 * top/bot = perfis de "meia-altura" (número | array | u=>w) acima e abaixo da espinha.
 * Retorna pontos prontos para blob(). `n` = amostras por lado. Use `sharp` p/ pontas (u=0/1) em quina.
 */
export function body(spine, top, bot = top, { n = 14, sharp = false } = {}) {
  const T = widthFn(top), B = widthFn(bot);
  const S = sampleCurve(spine);
  const upper = [], lower = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = along(S, u);
    upper.push([p.x + p.nx * T(u), p.y + p.ny * T(u)]);
    lower.push([p.x - p.nx * B(u), p.y - p.ny * B(u)]);
  }
  lower.reverse();
  // pontas com largura ~0: não duplica o ponto (evita dobra)
  if (T(1) + B(1) < 0.5) lower.shift();
  if (T(0) + B(0) < 0.5) lower.pop();
  if (sharp) {
    upper[0] = [...upper[0], 0];
    upper[n] = [...upper[n], 0];
  }
  return upper.concat(lower);
}

/** Caixa delimitadora [x0, y0, x1, y1] de uma lista de pontos. */
export function bboxPts(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  return [x0, y0, x1, y1];
}

/** Pontos de uma elipse/círculo como lista (útil para morphing com blob). */
export function ellipsePts(cx, cy, rx, ry = rx, n = 8, rot = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * 2 * PI;
    out.push([cx + cos(a) * rx, cy + sin(a) * ry]);
  }
  return out;
}

/** Transforma pontos: translada/rotaciona(graus)/escala em torno de (0,0). */
export function xf(pts, { x = 0, y = 0, rot = 0, s = 1, sx = 1, sy = 1 } = {}) {
  const r = (rot * PI) / 180, c = cos(r), si = sin(r);
  return pts.map(p => {
    const px = p[0] * s * sx, py = p[1] * s * sy;
    const q = [x + px * c - py * si, y + px * si + py * c];
    if (p.length > 2) q.push(p[2]);
    return q;
  });
}

/** Espelha pontos horizontalmente em torno de x = cx. */
export const mirror = (pts, cx = 0) => pts.map(p => (p.length > 2 ? [2 * cx - p[0], p[1], p[2]] : [2 * cx - p[0], p[1]]));

/** Ponto em um arco: ângulo em graus. */
export const polar = (cx, cy, r, angDeg) => [cx + r * cos((angDeg * PI) / 180), cy + r * sin((angDeg * PI) / 180)];
