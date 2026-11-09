// Boca ABERTA de animal (perfil): tubarão, crocodilo, lobo, cão, peixe, dinossauro...
//
// O erro comum é preencher o vão entre as mandíbulas com um único polígono chapado, fechado na frente por
// uma reta entre as pontas — parece uma "membrana de carne" sem profundidade. bocaAberta() desenha uma
// cavidade de verdade:
//   · abertura frontal CÔNCAVA (o vão entre as pontas mostra o fundo, nada de membrana);
//   · garganta escura no fundo (perto da articulação) clareando para a frente;
//   · gengiva + dentes do LADO DE LÁ (menores, mais escuros, recuados) — é o que dá profundidade;
//   · língua apoiada na mandíbula de baixo; borda interna dos lábios.
//
// Uso (coords da cena/rig): passe as bordas dos lábios do fundo (articulação) para a frente (ponta):
//   bocaAberta({ cima: [[x,y], ...], baixo: [[x,y], ...] })        // interior + as duas fileiras de dentes
//   bocaAberta({ ..., dentes: false }) + fileiraDentes(cima, baixo, {...})   // para controlar a ordem de desenho

import { G, blob, circle, taper } from './nodes.js';
import { darken, mix, alpha } from './color.js';

const { hypot, max, min } = Math;
const P2 = p => [p[0], p[1]];
const lerp2 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

/** Reamostra uma polilinha em m pontos igualmente espaçados (por comprimento). */
function resample(pts, m) {
  const p = pts.map(P2);
  const L = [0];
  for (let i = 1; i < p.length; i++) L.push(L[i - 1] + hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const T = L[L.length - 1] || 1, out = [];
  let j = 1;
  for (let k = 0; k < m; k++) {
    const d = (T * k) / (m - 1);
    while (j < p.length - 1 && L[j] < d) j++;
    out.push(lerp2(p[j - 1], p[j], (d - L[j - 1]) / (L[j] - L[j - 1] || 1)));
  }
  return out;
}

const PALETA = { garganta: '#2a0a14', boca: '#8a2f3e', gengiva: '#c9606c', lingua: '#c4586a', dente: '#fbf7ea' };

/**
 * Fileira de dentes ao longo de `linha` (fundo -> ponta), apontando para `oposta`.
 * o: n (qtd), tam (altura do maior dente, unidades da cena), de/ate (trecho 0..1), cor, k (escala 0..1, p/ animar), forma ('ponta'|'serra'|'canino')
 */
export function fileiraDentes(linha, oposta, o = {}) {
  const n = o.n ?? 8, de = o.de ?? 0.22, ate = o.ate ?? 0.96, k = o.k ?? 1;
  if (k <= 0.01) return null;
  const A = resample(linha, 40), B = resample(oposta, 40);
  const at = (arr, u) => {
    const x = u * (arr.length - 1), i = min(arr.length - 2, Math.floor(x));
    return lerp2(arr[i], arr[i + 1], x - i);
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = de + ((ate - de) * (i + 0.5)) / n;
    const p = at(A, u), q = at(B, u), a0 = at(A, u - 0.02), a1 = at(A, u + 0.02);
    let tx = a1[0] - a0[0], ty = a1[1] - a0[1];
    const tl = hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    let nx = q[0] - p[0], ny = q[1] - p[1];
    const nl = hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    // dentes maiores no meio da fileira, menores nas pontas
    const prof = o.forma === 'canino' && i === n - 2 ? 1.6 : 0.65 + 0.35 * Math.sin(Math.PI * ((i + 0.5) / n));
    const h = min((o.tam ?? 14) * prof, nl * 0.45) * k, w = (o.tam ?? 14) * 0.7 * k;
    const back = o.forma === 'serra' ? 0.25 : 0;
    out.push(blob([
      [p[0] - tx * w * 0.5 - nx * 1, p[1] - ty * w * 0.5 - ny * 1],
      [p[0] + nx * h + tx * w * back, p[1] + ny * h + ty * w * back, 0],
      [p[0] + tx * w * 0.5 - nx * 1, p[1] + ty * w * 0.5 - ny * 1],
    ], { fill: o.cor ?? PALETA.dente, shade: 0, hl: 0, tex: false, luz: false }));
  }
  return G(out);
}

/**
 * Interior de boca aberta + dentes. o: cima, baixo (bordas dos lábios, do fundo para a ponta),
 * cores { garganta, boca, gengiva, lingua, dente }, profundidade (recuo da abertura frontal, fração do vão; 0.28),
 * lingua (true), ladoDeLa (true: gengiva e dentes do outro lado), dentes (true | false | { n, tam, de, ate, forma, k }:
 * false = não desenha os dentes do lado de cá, para você controlar a ordem com fileiraDentes), dentesLadoDeLa (true).
 */
export function bocaAberta(o) {
  const C = { ...PALETA, ...(o.cores ?? {}) };
  const m = 14;
  const U = resample(o.cima, m), D = resample(o.baixo, m);
  const tipU = U[m - 1], tipD = D[m - 1], hinge = lerp2(U[0], D[0], 0.5);
  const gap = hypot(tipU[0] - tipD[0], tipU[1] - tipD[1]);
  if (gap < 2) return null;
  const front = lerp2(tipU, tipD, 0.5);
  let fx = front[0] - hinge[0], fy = front[1] - hinge[1];
  const fl = hypot(fx, fy) || 1;
  fx /= fl;
  fy /= fl;
  const depth = (o.profundidade ?? 0.28) * gap;
  // contorno da cavidade: lábio de cima -> abertura côncava -> lábio de baixo
  const Q = [front[0] - fx * depth, front[1] - fy * depth];
  const outline = [...U.slice(0, -1), [tipU[0], tipU[1], 0], lerp2(tipU, Q, 0.55), Q, lerp2(tipD, Q, 0.55), [tipD[0], tipD[1], 0], ...D.slice(0, -1).reverse()];
  const mid = U.map((p, i) => lerp2(p, D[i], 0.5));
  const back = (p, s) => [p[0] - fx * s, p[1] - fy * s];
  const lado = o.ladoDeLa !== false;
  // linhas do lado de lá: recuadas para dentro e para trás
  const farU = U.map((p, i) => back(lerp2(p, mid[i], 0.26), gap * 0.12));
  const farD = D.map((p, i) => back(lerp2(p, mid[i], 0.2), gap * 0.12));
  const base = { n: 8, tam: gap * 0.16, ...(typeof o.dentes === 'object' ? o.dentes : {}) };
  const dent = o.dentes === false ? null : base; // dentes do lado de cá (dentes: false = você desenha com fileiraDentes)
  const farDent = o.dentesLadoDeLa === false ? null : base; // dentes do lado de lá (sempre, salvo dentesLadoDeLa: false)
  const interior = G({ clip: blob(outline) }, [
    blob(outline, { fill: { grad: 'lin', a: [hinge[0], hinge[1], front[0], front[1]], stops: [C.garganta, darken(C.boca, 0.04), C.boca] }, shade: 0, hl: 0, tex: false, luz: false }),
    // gengiva + dentes do lado de lá (dão a leitura de profundidade)
    lado && taper(farU, [0, gap * 0.13, gap * 0.15, gap * 0.05], { fill: darken(C.gengiva, 0.18), shade: 0, hl: 0 }),
    lado && taper(farD, [0, gap * 0.11, gap * 0.13, gap * 0.05], { fill: darken(C.gengiva, 0.18), shade: 0, hl: 0 }),
    lado && farDent && fileiraDentes(farU, farD, { ...farDent, tam: farDent.tam * 0.6, cor: mix(C.dente, C.boca, 0.42), de: (farDent.de ?? 0.22) + 0.05 }),
    lado && farDent && fileiraDentes(farD, farU, { ...farDent, tam: farDent.tam * 0.55, cor: mix(C.dente, C.boca, 0.42), de: (farDent.de ?? 0.22) + 0.05 }),
    // língua sobre a mandíbula de baixo
    o.lingua !== false && blob([...D.slice(1, 10), ...D.slice(1, 10).reverse().map((p, i, a) => {
      const u = 1 - i / (a.length - 1);
      return lerp2(p, mid[min(m - 1, 1 + a.length - 1 - i)], 0.62 * Math.sin(Math.PI * max(0.1, u * 0.9)));
    })], { fill: { grad: 'lin', a: [hinge[0], hinge[1], front[0], front[1]], stops: [darken(C.lingua, 0.3), C.lingua, mix(C.lingua, '#ffd0d0', 0.25)] }, shade: 0, hl: 0, tex: false, luz: false }),
    o.lingua !== false && taper(D.slice(2, 9).map((p, i) => lerp2(p, mid[i + 2], 0.3)), [0, gap * 0.025, 0], { fill: darken(C.lingua, 0.3), shade: 0, hl: 0 }),
    // garganta (sombra profunda na articulação)
    circle(hinge[0], hinge[1], gap * 0.75, { fill: { grad: 'rad', c: [hinge[0], hinge[1], gap * 0.75], stops: [alpha(C.garganta, 0.85), alpha(C.garganta, 0)] }, shade: 0, hl: 0, tex: false, luz: false }),
    // borda interna dos lábios (gengiva do lado de cá)
    taper(U, [0, gap * 0.07, gap * 0.08, gap * 0.04], { fill: C.gengiva, shade: 0, hl: 0 }),
    taper(D, [0, gap * 0.06, gap * 0.07, gap * 0.04], { fill: C.gengiva, shade: 0, hl: 0 }),
  ]);
  if (!dent) return interior;
  return G([interior, fileiraDentes(U, D, dent), fileiraDentes(D, U, { ...dent, tam: dent.tam * 0.85 })]);
}
