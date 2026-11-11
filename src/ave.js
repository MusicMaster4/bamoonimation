// Figura BASE de ave (rapina ou pássaro), de perfil, sobre o esqueleto skeleton('ave').
//
// A asa NÃO é desenhada como ossos girando no plano da tela (era isso que "quebrava" a asa): o bater de
// asa acontece num plano perpendicular à câmera. Aqui a asa é modelada na sua própria PLANTA (vista de cima):
//   úmero, ulna e mão com dobra em "Z" (cotovelo e punho com ângulos reais), secundárias presas à ulna,
//   primárias à mão, terciárias e coberteiras por cima — e então PROJETADA na tela pela elevação:
//   e = 90 asa para cima · 0 apontando para a câmera (vira uma lâmina fina) · −90 para baixo.
// A borda de fuga fica sempre para trás (para a cauda), em qualquer fase da batida.
//
//   ave({ tipo: 'rapina', tamanho: 420, x, y, asa: t => bater(t, 2), pe: null, ... })

import { rig, G, blob, circle, ellipse, taper, rep, lin } from './nodes.js';
import { skeleton } from './anatomy.js';
import { body } from './geom.js';
import { V, KF, acao, lerp, lerpAny, clamp, ease } from './anim.js';
import { darken, mix } from './color.js';

const D = Math.PI / 180;
const dir = a => [Math.cos(a * D), Math.sin(a * D)];
const add = (p, q, k = 1) => [p[0] + q[0] * k, p[1] + q[1] * k];
const lerp2 = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];

/**
 * Poses de asa: { e: elevação (graus), f: dobra 0 (aberta)..1 (fechada em Z), v: varredura (graus, + = pontas para trás) }.
 * Interpolam com kf/lerpAny.
 */
export const ASA = {
  alta: { e: 82, f: 0.04, v: 10 }, // topo da batida
  meio: { e: 15, f: 0, v: 2 }, // passando pelo meio (quase apontando para a câmera)
  baixa: { e: -58, f: 0.06, v: -6 }, // fim da descida
  recolhe: { e: 28, f: 0.55, v: 24 }, // subida com o punho recolhido
  planando: { e: 26, f: 0, v: 6 }, // planeio (leve diedro)
  freio: { e: 86, f: 0.12, v: -20 }, // freio/ataque: asas para cima e para a frente
  dobrada: { e: -80, f: 1, v: 0 }, // fechada no flanco (pousada ou mergulhando)
};

/** Batida de asa realista: desce estendida (força), sobe recolhendo o punho (menos arrasto). */
export function bater(t, freq = 2.2) {
  const f = ((t * freq) % 1 + 1) % 1;
  if (f < 0.5) return lerpAny(ASA.alta, ASA.baixa, ease.inOut2(f / 0.5));
  if (f < 0.78) return lerpAny(ASA.baixa, ASA.recolhe, ease.inOut2((f - 0.5) / 0.28));
  return lerpAny(ASA.recolhe, ASA.alta, ease.inOut2((f - 0.78) / 0.22));
}

/**
 * Planta da asa (coords da asa: X para a frente do corpo, Y para fora, ao longo da envergadura).
 * Proporções de rapina: úmero 0.18T, ulna 0.24T, mão 0.2T; primária mais longa 0.4T.
 */
export function plantaAsa(f, v, T) {
  f = clamp(f);
  const Lh = 0.18 * T, Lu = 0.24 * T, Lm = 0.2 * T;
  const cotovelo = lerp(165, 25, f), punho = lerp(165, 18, f); // ângulos internos reais (aberto ↔ dobrado)
  const p1 = lerp(95 + v, 172, f); // úmero: para fora ↔ para trás
  const p2 = p1 - (180 - cotovelo); // ulna vira para a frente ao dobrar
  const p3 = p2 + (180 - punho); // mão volta para trás
  const P0 = [0, 0], P1 = add(P0, dir(p1), Lh), P2 = add(P1, dir(p2), Lu), P3 = add(P2, dir(p3), Lm);
  const secAng = p2 + lerp(96, 166, f);
  const pen = [];
  // terciárias (perto do corpo)
  for (let i = 0; i < 3; i++) pen.push({ g: 'ter', b: lerp2(P0, P1, 0.45 + i * 0.22), a: lerp(176, 182, i / 2) + 4 * f, L: 0.21 * T, w: 0.085 * T });
  // secundárias (ulna) — borda de fuga do "braço"
  for (let i = 0; i < 9; i++) pen.push({ g: 'sec', b: lerp2(P1, P2, 0.03 + i * 0.12), a: secAng + (i - 4) * 0.8, L: (0.25 + 0.012 * Math.sin(i * 1.7)) * T, w: 0.078 * T });
  // primárias (mão) — leque que abre na ponta ("dedos")
  const PL = [0.27, 0.31, 0.35, 0.38, 0.4, 0.39, 0.33];
  for (let i = 0; i < 7; i++) {
    const u = i / 6;
    pen.push({ g: 'pri', b: lerp2(P2, P3, 0.1 + u * 0.9), a: p3 + lerp(lerp(64, 2, u), lerp(12, 1, u), f), L: PL[i] * T, w: 0.062 * T });
  }
  return { P0, P1, P2, P3, p1, p2, p3, secAng, pen, cotovelo, punho };
}

// pena como forma fechada (base larga, ponta arredondada) na planta da asa
const penaPts = ({ b, a, L, w }) => {
  const d = dir(a), n = [-d[1], d[0]];
  const at = (s, k) => [b[0] + d[0] * L * s + n[0] * w * k, b[1] + d[1] * L * s + n[1] * w * k];
  return [at(0, -0.45), at(0.4, -0.55), at(0.84, -0.42), [...at(1, 0), 0.8], at(0.84, 0.42), at(0.4, 0.55), at(0, 0.45)];
};

/**
 * Pele `draw` com a asa projetada. side 'N' | 'F'. asaFn(t) -> {e,f,v}. cores: { asa, borda, ponta, marcas }.
 */
export function pelesAsa(side, T, asaFn, cores, escuro = 0) {
  const tone = c => (escuro ? darken(c, escuro) : c);
  return {
    side: side === 'F' ? 'far' : 'near',
    draw: (S, t) => {
      const w = asaFn(t) ?? ASA.dobrada;
      const W = plantaAsa(w.f ?? 0, w.v ?? 0, T);
      const sh = S.get('ombro' + side), ax = S.get('corpo').abs;
      const se0 = Math.sin(clamp(w.e ?? 0, -90, 90) * D);
      const se = Math.sign(se0 || 1) * Math.max(Math.abs(se0), 0.1);
      const c = Math.cos(ax * D), s = Math.sin(ax * D);
      // projeção: X ao longo do eixo do corpo, envergadura (Y) achatada pela elevação
      const pr = ([X, Y, r]) => {
        const x = X, y = -Y * se;
        const q = [sh.x0 + x * c - y * s, sh.y0 + x * s + y * c];
        if (r !== undefined) q.push(r);
        return q;
      };
      const P = pts => pts.map(pr);
      const back = dir(W.secAng);
      const fwd = [-back[0], -back[1]];
      const k = 0.01 * T;
      const coverts = [
        add(W.P0, fwd, 2 * k), add(lerp2(W.P0, W.P2, 0.5), fwd, 3.5 * k), add(W.P2, fwd, 1.5 * k), lerp2(W.P2, W.P3, 0.6),
        add(lerp2(W.P2, W.P3, 0.6), back, 7 * k), add(W.P2, back, 11 * k), add(lerp2(W.P1, W.P2, 0.5), back, 12 * k), add(W.P1, back, 12 * k), add(W.P0, back, 13 * k),
      ];
      const pri = W.pen.filter(p => p.g === 'pri'), sec = W.pen.filter(p => p.g === 'sec'), ter = W.pen.filter(p => p.g === 'ter');
      return G([
        G({ fill: tone(cores.ponta), shade: 0.35, hl: 0.25 }, pri.map(p => blob(P(penaPts(p))))),
        G({ fill: tone(cores.borda), shade: 0.35, hl: 0.25 }, sec.map(p => blob(P(penaPts(p))))),
        G({ fill: tone(cores.borda), shade: 0.3, hl: 0.2 }, ter.map(p => blob(P(penaPts(p))))),
        blob(P(coverts), { fill: tone(cores.asa), shade: 0.4, hl: 0.4, tex: { k: 'brush', a: 0.25, s: 0.6 } }),
        ...rep(5, i => {
          const q = pr(add(lerp2(W.P1, W.P2, 0.12 + i * 0.19), back, 6 * k));
          return ellipse(q[0], q[1], 0.014 * T, 0.008 * T, { fill: tone(cores.marcas), shade: 0, hl: 0 });
        }),
      ]);
    },
  };
}

const garra = (fechada, cor, unha, near, T) =>
  G({ s: T / 420, fill: unha, shade: 0, hl: 0 }, [
    ...rep(3, i => taper(t => {
      const g = clamp(V(fechada, t) ?? 0);
      return [[4 + i * 8, 0], [14 + i * 9, 6 + g * 6], [16 + i * 9 - g * 10, 16]];
    }, [6, 4, 1])),
    taper(t => {
      const g = clamp(V(fechada, t) ?? 0);
      return [[0, 0], [-10, 6], [-8 + g * 8, 16]];
    }, [6, 4, 1]),
    taper([[0, -3], [26, -3]], [10, 9], { fill: near ? cor : darken(cor, 0.08) }),
  ]);

const FEATHER = (len, w) => taper([[0, 0], [len * 0.55, 0], [len, 0]], [w, w * 0.9, w * 0.25], { caps: 'round' });

/**
 * Ave base. Opções:
 *  tipo 'rapina' | 'passaro', tamanho T (bico à ponta da cauda, padrão 420), cores { corpo, ventre, asa, borda,
 *  ponta, marcas, cauda: [c1, c2], bico, cera, perna, unha, olho },
 *  asa (t => {e,f,v}; ver ASA/bater), asaF (opcional, lado de lá), corpo (inclinação, graus), cabeca (graus),
 *  cauda (0..1 leque), caudaAng (graus), pe/peF (alvo do pé em coords do rig, ou null = pernas recolhidas),
 *  dedos (ângulo absoluto dos dedos), garra (0..1 fecha), coxa (ângulo do fêmur: 55 em pé, ~10 no ataque),
 *  + props do rig (x, y, rot, s, flip, ground, name).
 */
export function ave(o = {}) {
  const T = o.tamanho ?? 420, k = T / 420, rap = (o.tipo ?? 'rapina') === 'rapina';
  const C = {
    corpo: rap ? '#7a4a2e' : '#8a6a4a', ventre: rap ? '#f2e2c4' : '#efe2cc', asa: rap ? '#7a4a2e' : '#7f5f42',
    borda: rap ? '#5a3420' : '#5e4430', ponta: rap ? '#3f2618' : '#3a2c22', marcas: rap ? '#5a3420' : '#4a3424',
    cauda: rap ? ['#e0784a', '#c2562e'] : ['#6a5038', '#4e3a28'], bico: rap ? '#3a3640' : '#3a3036', cera: '#f0c040',
    perna: rap ? '#e8b440' : '#c99a86', unha: '#2a2226', olho: rap ? '#f2c640' : '#1a1210',
    ...(o.cores ?? {}),
  };
  const bones = skeleton('ave', { tamanho: T });
  const tuck = t => !V(o.pe, t);
  const asaN = t => V(o.asa, t) ?? ASA.dobrada;
  const asaF = t => V(o.asaF, t) ?? asaN(t);
  // atuação nos kf do usuário (antecipação/overshoot, atraso da cabeça em relação ao corpo)
  const A = (v, d) => (v instanceof KF && o.acao !== false ? acao(v, { atraso: d }) : v);
  const corpo = A(o.corpo, 0), cabeca = A(o.cabeca, 0.06), caudaAng = A(o.caudaAng, 0.05);
  // ação secundária: o corpo sobe na descida da asa e desce na subida (só em voo, pernas recolhidas)
  const bob = t => {
    if (o.vida === 0) return 0;
    let m = 0, voo = 0;
    for (let j = -4; j <= 4; j++) {
      m += asaN(t + j * 0.1).e ?? 0;
      voo += tuck(t + j * 0.05) ? 1 : 0;
    }
    return (0.035 * T * (V(o.s, t) ?? 1) * ((asaN(t - 0.05).e ?? 0) - m / 9) * (voo / 9)) / 90;
  };
  const yy = o.y === undefined ? undefined : t => V(o.y, t) + bob(t);
  return rig({
    name: o.name ?? (rap ? 'ave de rapina' : 'pássaro'), plan: 'ave', ...o, bones, y: yy,
    pose: {
      corpo: t => -15 + (V(corpo, t) ?? 0), cabeca: t => 50 + (V(cabeca, t) ?? 0), cauda: t => 190 + (V(caudaAng, t) ?? 0),
      coxaN: t => V(o.coxa, t) ?? 55, coxaF: t => V(o.coxa, t) ?? 55,
      tibioN: t => (tuck(t) ? 150 : 70), tarsoN: t => (tuck(t) ? -150 : -45), dedosN: t => (tuck(t) ? -60 : -80),
      tibioF: t => (tuck(t) ? 150 : 70), tarsoF: t => (tuck(t) ? -150 : -45), dedosF: t => (tuck(t) ? -60 : -80),
      ...(o.pose ?? {}),
    },
    ik: [
      { chain: ['tibioN', 'tarsoN', 'dedosN'], target: t => V(o.pe, t) ?? [0, 0], endAng: t => V(o.dedos, t) ?? 0, on: t => !tuck(t) },
      { chain: ['tibioF', 'tarsoF', 'dedosF'], target: t => V(o.peF, t) ?? (p => [p[0] - 18 * k, p[1] - 4 * k])(V(o.pe, t) ?? [0, 0]), endAng: t => V(o.dedos, t) ?? 0, on: t => !tuck(t) },
    ],
    skin: [
      pelesAsa('F', T, asaF, C, 0.1),
      { draw: S => { const tb = S.get('tibioF'), dx = tb.x1 - tb.x0, dy = tb.y1 - tb.y0; return blob(body([[tb.x0 - dx * 0.45, tb.y0 - dy * 0.45], [tb.x0, tb.y0], [tb.x1, tb.y1]], [16 * k, 14 * k, 6 * k], [19 * k, 16 * k, 7 * k], { n: 8 }), { fill: darken(mix(C.corpo, C.ventre, 0.35), 0.1), shade: 0.4 }); }, side: 'far', hidden: t => tuck(t) || !rap },
      { limb: ['tarsoF'], w: [11 * k, 9 * k], fill: darken(C.perna, 0.08), hidden: tuck },
      { bone: 'dedosF', local: true, node: garra(o.garra, C.perna, C.unha, false, T), hidden: tuck },
      // cauda com mola: segue os giros do corpo com atraso e assenta (follow-through)
      { bone: 'cauda', node: G({ s: k, fill: lin(0, C.cauda[0], C.cauda[1]), shade: 0.35, hl: 0.3, mola: o.vida === 0 ? null : { freq: 2.2, amort: 0.32, ganho: 0.9, max: 14 } }, rep(5, i => G({ rot: t => 190 + (i - 2) * (4 + 5 * (V(o.cauda, t) ?? 0)) }, [FEATHER(140, 46)]))) },
      { bone: 'corpo', node: G({ s: k }, [
        blob(rap
          ? [[-64, -4], [-40, -30], [20, -52], [90, -60], [132, -54], [150, -36], [140, -12], [110, 12], [60, 32], [0, 32], [-44, 20]]
          : [[-60, -2], [-34, -34], [24, -58], [92, -62], [134, -50], [152, -28], [142, 0], [108, 26], [56, 40], [0, 34], [-42, 20]],
        { fill: lin(90, C.corpo, mix(C.corpo, C.ventre, 0.25)), shade: 0.45, hl: 0.45, tex: { k: 'brush', a: 0.25, s: 0.5 } }),
        blob([[-34, 18], [20, 28], [80, 24], [122, 6], [138, -16], [110, -2], [60, 10], [0, 12]], { fill: C.ventre, shade: 0.35, hl: 0.2 }),
        rap && G(rep(7, i => taper([[-20 + i * 18, 18 + (i % 2) * 4], [-12 + i * 18, 25 + (i % 2) * 4]], [5, 1], { fill: C.marcas, alpha: 0.7, shade: 0, hl: 0 }))),
      ]) },
      { bone: 'pescoco', node: G({ s: k }, [blob([[112, -40], [128, -78], [158, -98], [178, -62], [150, -30]], { fill: C.corpo, shade: 0.4, hl: 0.4 })]) },
      { bone: 'cabeca', node: G({ s: k }, [G({ x: 162, y: -72 }, rap
        ? [
            circle(0, 0, 38, { fill: C.corpo, shade: 0.4, hl: 0.45 }),
            blob([[-10, 6], [20, -4], [38, 6], [32, 26], [0, 30]], { fill: C.ventre, shade: 0.3, hl: 0 }),
            blob([[28, -12], [40, -12], [42, 0], [30, 2]], { fill: C.cera, shade: 0.2 }),
            blob([[38, -14], [56, -10], [64, 6, 0.5], [58, 20, 0], [54, 8], [40, 4]], { fill: C.bico, shade: 0.3, hl: 0.5 }),
            circle(17, -8, 10, { fill: C.olho, shade: 0, hl: 0 }),
            circle(19, -8, 5.2, { fill: '#120c0a', shade: 0, hl: 0 }),
            circle(21, -10, 1.9, { fill: '#fff', shade: 0, hl: 0 }),
            taper([[4, -21], [19, -22], [34, -15]], [3, 7, 3], { fill: C.marcas, shade: 0, hl: 0 }),
          ]
        : [
            circle(0, 0, 40, { fill: C.corpo, shade: 0.4, hl: 0.45 }),
            blob([[-6, 10], [24, 4], [40, 14], [30, 32], [0, 34]], { fill: C.ventre, shade: 0.3, hl: 0 }),
            blob([[34, -8], [62, 2, 0], [36, 12]], { fill: C.bico, shade: 0.3, hl: 0.5 }),
            circle(16, -6, 9, { fill: '#fdf6ea', shade: 0, hl: 0 }),
            circle(17, -6, 6.5, { fill: C.olho, shade: 0, hl: 0 }),
            circle(19, -8, 2, { fill: '#fff', shade: 0, hl: 0 }),
          ])]) },
      { draw: S => { const tb = S.get('tibioN'), dx = tb.x1 - tb.x0, dy = tb.y1 - tb.y0; return blob(body([[tb.x0 - dx * 0.45, tb.y0 - dy * 0.45], [tb.x0, tb.y0], [tb.x1, tb.y1]], [17 * k, 15 * k, 6 * k], [20 * k, 17 * k, 7 * k], { n: 8 }), { fill: mix(C.corpo, C.ventre, 0.35), shade: 0.4, hl: 0.3, tex: { k: 'brush', a: 0.25, s: 0.5 } }); }, side: 'near', hidden: t => tuck(t) || !rap },
      { limb: ['tarsoN'], w: [12 * k, 10 * k], fill: C.perna, hidden: tuck },
      { bone: 'dedosN', local: true, node: garra(o.garra, C.perna, C.unha, true, T), hidden: tuck },
      pelesAsa('N', T, asaN, C),
      ...(o.skin ?? []),
    ],
  });
}

