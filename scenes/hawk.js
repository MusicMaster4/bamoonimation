// Benchmark 4 — Um gavião ataca um coelho no campo ao entardecer.
// 3 planos: o campo (gavião circulando) -> o mergulho -> o ataque (e a fuga para a toca).
// Gavião e coelho são rigs anatômicos: skeleton('ave') e skeleton('quadrupede', { variante: 'coelho' }).
import {
  scene, film, layer, G, blob, ellipse, circle, rect, taper, line, particles, rays, lin, rad, rig, skeleton, restPose,
  kf, osc, rng, scatter, rep, body, spline, move, heading, smooth, clamp, lerp, lerpAny, ease, V, noise, decay, between, darken, mix,
} from 'bamoonimation';

const C = {
  skyTop: '#7d9cc8', skyMid: '#f1c28e', skyLow: '#ffdca2', sun: '#fff3d0',
  hillFar: '#8fa08e', hill: '#6f8f4e', field: '#8eac46', fieldD: '#5a832f', grass: '#76983a', grass2: '#a2b84e', grassD: '#4a6a26', dirt: '#8a6243', hole: '#2a1a14',
  tree: '#5d7a45', trunk: '#5a3e30',
  hawk: '#7a4a2e', hawkD: '#5a3420', wingL: '#9a6440', cream: '#f2e2c4', rust: '#c2562e', beak: '#3a3640', cere: '#f0c040', leg: '#e8b440',
  rab: '#a98a6c', rabD: '#86684f', rabL: '#efe2cf', pink: '#e9a0a0',
};
const look = {
  sun: [-0.9, -0.45], light: '#fff0c8', shadow: '#5b3c62', shade: 0.45, hl: 0.4,
  haze: { c: '#f1cfa4', a: 0.36 }, vignette: 0.45, vignetteC: '#2a1428', bloom: 0.3,
  grade: { sat: 1.12, con: 1.08, lift: '#120a10', tint: '#ffb060', tintA: 0.12 },
};
const sky = lin(90, [0, C.skyTop], [0.55, C.skyMid], [1, C.skyLow]);
const GROUND = 860;

// ------------------------------------------------------------------ gavião (esqueleto skeleton('ave'))
const AVE = skeleton('ave', { tamanho: 420 });
const FEATHER = (len, w) => taper([[0, 0], [len * 0.55, 0], [len, 0]], [w, w * 0.9, w * 0.25], { caps: 'round' });
const pt = (s, u) => [s.x0 + (s.x1 - s.x0) * u, s.y0 + (s.y1 - s.y0) * u];
// poses de asa (ângulos relativos úmero/ulna/mão). Interpolam com kf/lerpAny.
const ASA = {
  dobrada: { u: 190, l: -160, m: 160 },
  alta: { u: -78, l: -10, m: 16 },
  baixa: { u: 92, l: -12, m: 10 },
  recolhe: { u: -40, l: -95, m: 120 },
  freio: { u: -112, l: -26, m: 44 },
};
/** Batida de asa: desce estendida, sobe recolhendo o punho (como as aves reais). */
function bater(t, freq = 2.2) {
  const f = ((t * freq) % 1 + 1) % 1;
  if (f < 0.45) return lerpAny(ASA.alta, ASA.baixa, ease.inOut(f / 0.45));
  if (f < 0.75) return lerpAny(ASA.baixa, ASA.recolhe, ease.inOut((f - 0.45) / 0.3));
  return lerpAny(ASA.recolhe, ASA.alta, ease.inOut((f - 0.75) / 0.25));
}
// asa desenhada a partir dos ossos: coberteiras + secundárias (na ulna) + primárias (na mão)
const asaPele = (side, fill, edge) => ({
  side: side === 'F' ? 'far' : 'near',
  draw: S => {
    const U = S.get('umero' + side), L = S.get('ulna' + side), M = S.get('mao' + side);
    const fold = clamp(-L.rel / 160);
    const sec = rep(8, i => {
      const [x, y] = pt(L, 0.05 + i * 0.12);
      return G({ x, y, rot: L.abs - (92 + 70 * fold) + i * 2 }, [FEATHER(74 - i * 2, 34)]);
    });
    const pri = rep(5, i => {
      const [x, y] = pt(M, 0.35 + i * 0.16);
      return G({ x, y, rot: M.abs - (26 - i * 8) * (1 - fold) - 3 * i * fold }, [FEATHER(150 - i * 12, 30)]);
    });
    const cov = blob([[U.x0, U.y0 - 16], [L.x0, L.y0 - 14], ...rep(4, i => pt(M, i / 3)).map(([x, y], i) => [x, y - 10 + i * 3]), [M.x1, M.y1 + 8], ...rep(4, i => pt(L, 1 - i / 3)).map(([x, y]) => [x, y + 24]), [U.x0 - 8, U.y0 + 18]],
      { fill, shade: 0.4, hl: 0.4, tex: { k: 'brush', a: 0.3, s: 0.6 } });
    return G([
      G({ fill: edge, shade: 0.3, hl: 0.2 }, sec),
      G({ fill: edge, shade: 0.35, hl: 0.25 }, pri),
      cov,
      ...rep(5, i => {
        const [x, y] = pt(L, 0.12 + i * 0.18);
        return ellipse(x, y + 6, 6, 3.5, { fill: C.hawkD, shade: 0, hl: 0 });
      }),
    ]);
  },
});
const garra = (fechada, near) =>
  G({ fill: '#2a2226', shade: 0, hl: 0 }, [
    ...rep(3, i => taper(t => {
      const g = clamp(V(fechada, t) ?? 0);
      return [[4 + i * 8, 0], [14 + i * 9, 6 + g * 6], [16 + i * 9 - g * 10, 16]];
    }, [6, 4, 1])),
    taper(t => {
      const g = clamp(V(fechada, t) ?? 0);
      return [[0, 0], [-10, 6], [-8 + g * 8, 16]];
    }, [6, 4, 1]),
    taper([[0, -3], [26, -3]], [10, 9], { fill: near ? C.leg : darken(C.leg, 0.08) }),
  ]);
/**
 * Gavião rigado. o: asa (t => {u,l,m}), corpo (pitch, graus rel.), cabeca (graus), cauda (0..1 leque),
 * pe (t => [x,y] alvo do pé em coords do rig, ou null = pernas recolhidas), dedos (ângulo abs), garra (0..1),
 * coxa (ângulo do fêmur: 55 em pé; ~10 no golpe, quando a ave lança as garras à frente).
 */
function hawk(o = {}) {
  const asa = k => t => (V(o.asa, t) ?? ASA.dobrada)[k];
  const tuck = t => !V(o.pe, t);
  return rig({
    name: o.name ?? 'gavião', plan: 'ave', bones: AVE, ground: o.ground, x: o.x, y: o.y, rot: o.rot, s: o.s, flip: o.flip,
    pose: {
      corpo: t => -15 + (V(o.corpo, t) ?? 0), cabeca: t => 50 + (V(o.cabeca, t) ?? 0), cauda: t => 190 + (V(o.caudaAng, t) ?? 0),
      coxaN: t => V(o.coxa, t) ?? 55, coxaF: t => V(o.coxa, t) ?? 55,
      umeroN: asa('u'), ulnaN: asa('l'), maoN: asa('m'),
      umeroF: t => asa('u')(t) + 8, ulnaF: asa('l'), maoF: asa('m'),
      tibioN: t => (tuck(t) ? 150 : 70), tarsoN: t => (tuck(t) ? -150 : -45), dedosN: t => (tuck(t) ? -60 : -80),
      tibioF: t => (tuck(t) ? 150 : 70), tarsoF: t => (tuck(t) ? -150 : -45), dedosF: t => (tuck(t) ? -60 : -80),
    },
    ik: [
      { chain: ['tibioN', 'tarsoN', 'dedosN'], target: t => V(o.pe, t) ?? [0, 0], endAng: t => V(o.dedos, t) ?? 0, on: t => !tuck(t) },
      { chain: ['tibioF', 'tarsoF', 'dedosF'], target: t => V(o.peF, t) ?? (p => [p[0] - 18, p[1] - 4])(V(o.pe, t) ?? [0, 0]), endAng: t => V(o.dedos, t) ?? 0, on: t => !tuck(t) },
    ],
    skin: [
      asaPele('F', darken(C.hawk, 0.1), darken(C.hawkD, 0.08)),
      { draw: S => { const tb = S.get('tibioF'); return blob(body([[tb.x0, tb.y0], [tb.x1, tb.y1]], [13, 11, 7], [15, 13, 8], { n: 6 }), { fill: darken(C.hawk, 0.1), shade: 0.4 }); }, side: 'far', hidden: tuck },
      { limb: ['tarsoF'], w: [11, 9], fill: darken(C.leg, 0.08), hidden: tuck },
      { bone: 'dedosF', local: true, node: garra(o.garra, false), hidden: tuck },
      // cauda ruiva em leque
      { bone: 'cauda', node: G({ fill: lin(0, '#e0784a', C.rust), shade: 0.35, hl: 0.3 }, rep(5, i => G({ rot: t => 190 + (i - 2) * (4 + 5 * (V(o.cauda, t) ?? 0)) }, [FEATHER(140, 46)]))) },
      // corpo, barriga com estrias, pescoço, cabeça
      { bone: 'corpo', node: G([
        blob([[-64, -4], [-40, -30], [20, -52], [90, -60], [132, -54], [150, -36], [140, -12], [110, 12], [60, 32], [0, 32], [-44, 20]], { fill: lin(90, C.hawk, C.wingL), shade: 0.45, hl: 0.45, tex: { k: 'brush', a: 0.25, s: 0.5 } }),
        blob([[-34, 18], [20, 28], [80, 24], [122, 6], [138, -16], [110, -2], [60, 10], [0, 12]], { fill: C.cream, shade: 0.35, hl: 0.2 }),
        ...rep(7, i => taper([[-20 + i * 18, 18 + (i % 2) * 4], [-12 + i * 18, 25 + (i % 2) * 4]], [5, 1], { fill: C.hawkD, alpha: 0.7, shade: 0, hl: 0 })),
      ]) },
      { bone: 'pescoco', node: blob([[112, -40], [128, -78], [158, -98], [178, -62], [150, -30]], { fill: C.hawk, shade: 0.4, hl: 0.4 }) },
      { bone: 'cabeca', node: G({ x: 162, y: -72 }, [
        circle(0, 0, 38, { fill: C.hawk, shade: 0.4, hl: 0.45 }),
        blob([[-10, 6], [20, -4], [38, 6], [32, 26], [0, 30]], { fill: C.cream, shade: 0.3, hl: 0 }),
        blob([[28, -12], [40, -12], [42, 0], [30, 2]], { fill: C.cere, shade: 0.2 }),
        blob([[38, -14], [56, -10], [64, 6, 0.5], [58, 20, 0], [54, 8], [40, 4]], { fill: lin(0, '#5a5560', C.beak), shade: 0.3, hl: 0.5 }),
        circle(17, -8, 10, { fill: '#f2c640', shade: 0, hl: 0 }),
        circle(19, -8, 5.2, { fill: '#120c0a', shade: 0, hl: 0 }),
        circle(21, -10, 1.9, { fill: '#fff', shade: 0, hl: 0 }),
        taper([[4, -21], [19, -22], [34, -15]], [3, 7, 3], { fill: C.hawkD, shade: 0, hl: 0 }),
      ]) },
      // perna de cá: "calça" de penas na coxa + tarso amarelo + garra
      { draw: S => { const tb = S.get('tibioN'); return blob(body([[tb.x0, tb.y0], [tb.x1, tb.y1]], [14, 12, 8], [16, 14, 9], { n: 6 }), { fill: C.hawk, shade: 0.4, hl: 0.3 }); }, side: 'near', hidden: tuck },
      { limb: ['tarsoN'], w: [12, 10], fill: C.leg, hidden: tuck },
      { bone: 'dedosN', local: true, node: garra(o.garra, true), hidden: tuck },
      asaPele('N', C.hawk, C.hawkD),
    ],
  });
}

// ------------------------------------------------------------------ coelho (esqueleto skeleton('quadrupede', coelho))
const COELHO = skeleton('quadrupede', { altura: 120, variante: 'coelho' });
const RB = restPose(rig({ bones: COELHO }));
const RT = (n, end = true) => { const s = RB.get(n); return end ? [s.x1, s.y1] : [s.x0, s.y0]; };
const HIP_H = RT('metaN')[1] + COELHO.pataN[5].sole; // altura do quadril agachado
const TOE0 = RT('pataN'), WRIST0 = RT('antebracoN'), PAW0 = RT('maoN');
const L_META = COELHO.metaN[1] + COELHO.pataN[1], L_MAO = COELHO.maoN[1];
const SOLE_P = COELHO.pataN[5].sole, SOLE_M = COELHO.maoN[5].sole;

/**
 * Salto de coelho dirigido pela distância (como gait): fase p de cada salto de comprimento Lh.
 * Apoio (patas plantadas, via IK): traseiras p∈[0,0.3) empurram e o calcanhar sobe; dianteiras p∈[0.62,0.92).
 * Voo: as patas seguem POSES DE ÂNGULOS VÁLIDOS (convertidas em alvos por cinemática direta), então nenhuma
 * articulação sai do limite; as transições começam/terminam exatamente nas posições plantadas.
 */
const D2R = Math.PI / 180;
const BL = n => COELHO[n + 'N'] ? COELHO[n + 'N'][1] : COELHO[n][1];
const FEM_OFF = COELHO.femurN[5].off, SH_OFF = COELHO.umeroN[5].off;
const pol = (p, len, ang) => [p[0] + len * Math.cos(ang * D2R), p[1] + len * Math.sin(ang * D2R)];
const sm = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp2 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
// cinemática direta: posição do jarrete (traseira) e do punho (dianteira) a partir de ângulos absolutos
const hindFK = (F, T) => pol(pol(FEM_OFF, BL('femur'), F), BL('tibia'), T);
const frontFK = (col, U, A) => {
  const c = Math.cos(col * D2R), s = Math.sin(col * D2R), L = BL('coluna');
  const sh = [L * c - SH_OFF[1] * s, L * s + SH_OFF[1] * c];
  return pol(pol(sh, BL('umero'), U), BL('antebraco'), A);
};
function salto(p, Lh) {
  const hipH = q => (q < 0.3 ? lerp(HIP_H, 92, sm(q / 0.3)) : q < 0.62 ? 92 + 34 * Math.sin((Math.PI * (q - 0.3)) / 0.32) : lerp(92, HIP_H, sm((q - 0.62) / 0.38)));
  // coluna: estica no impulso, inclina o focinho para baixo no pouso das patas curtas da frente
  const colA = q => (q < 0.3 ? lerp(-25, -12, sm(q / 0.3)) : q < 0.62 ? lerp(-12, 12, sm((q - 0.3) / 0.32)) : lerp(12, -25, sm((q - 0.62) / 0.38)));
  const hip = hipH(p), coluna = colA(p);
  // ---- traseiras
  const hindStance = q => {
    const a = 35 * sm((q - 0.08) / 0.22);
    const toe = [TOE0[0] - q * Lh, hipH(q) - SOLE_P];
    return { hock: [toe[0] - L_META * Math.cos(a * D2R), toe[1] - L_META * Math.sin(a * D2R)], a };
  };
  let hock, a;
  if (p < 0.3) ({ hock, a } = hindStance(p));
  else {
    const u = (p - 0.3) / 0.7;
    const k0 = hindStance(0.3), k1 = { hock: hindFK(125, 150), a: 112 }, k2 = { hock: hindFK(25, 160), a: 25 }, k3 = { hock: RT('tibiaN'), a: 0 };
    const seg = u < 0.3 ? [k0, k1, sm(u / 0.3)] : u < 0.75 ? [k1, k2, sm((u - 0.3) / 0.45)] : [k2, k3, sm((u - 0.75) / 0.25)];
    hock = lerp2(seg[0].hock, seg[1].hock, seg[2]);
    a = lerp(seg[0].a, seg[1].a, seg[2]);
    const toeY = hock[1] + L_META * Math.sin(a * D2R), floorY = hip - SOLE_P - 12 * (1 - sm((u - 0.88) / 0.12));
    if (toeY > floorY) hock = [hock[0], hock[1] - (toeY - floorY)];
  }
  // ---- dianteiras (q = 0 no pouso das patas da frente)
  const q = (p + 0.38) % 1;
  const frontStance = qq => {
    const pp = (qq + 0.62) % 1; // fase do salto correspondente
    const b = lerp(30, 60, sm(qq / 0.3));
    const paw = [PAW0[0] + (0.19 - qq) * Lh, hipH(pp) - SOLE_M];
    return { wrist: [paw[0] - L_MAO * Math.cos(b * D2R), paw[1] - L_MAO * Math.sin(b * D2R)], b };
  };
  let wrist, b;
  if (q < 0.3) ({ wrist, b } = frontStance(q));
  else {
    const u = (q - 0.3) / 0.7;
    const k0 = frontStance(0.3), k1 = { wrist: frontFK(coluna, 112, -8), b: 62 }, k2 = { wrist: frontFK(coluna, 48, 52), b: 42 }, k3 = frontStance(0);
    const seg = u < 0.35 ? [k0, k1, sm(u / 0.35)] : u < 0.8 ? [k1, k2, sm((u - 0.35) / 0.45)] : [k2, k3, sm((u - 0.8) / 0.2)];
    wrist = lerp2(seg[0].wrist, seg[1].wrist, seg[2]);
    b = lerp(seg[0].b, seg[1].b, seg[2]);
    const pawY = wrist[1] + L_MAO * Math.sin(b * D2R), floorY = hip - SOLE_M - 12 * (1 - sm((u - 0.88) / 0.12));
    if (pawY > floorY) wrist = [wrist[0], wrist[1] - (pawY - floorY)];
  }
  return { hip, hock, a, wrist, b, coluna };
}

/**
 * Coelho rigado. o: x (fn: x do quadril no mundo), chao, Lh (comprimento do salto), salta (fn t -> bool),
 * orelhas (0 relaxadas..1 em pé), mastiga (0/1), cabeca (graus), ground (fn ou número, p/ o verificador).
 */
function coelho(o) {
  const X = t => V(o.x, t);
  const X0 = o.x0 ?? X(0);
  const Lh = o.Lh ?? 150;
  const st = t => {
    if (!(V(o.salta, t) ?? false)) return { hip: HIP_H, hock: RT('tibiaN'), a: 0, wrist: WRIST0, b: 30, coluna: -25 };
    return salto((((X(t) - X0) / (Lh * (o.s ?? 1))) % 1 + 1) % 1, Lh);
  };
  const ear = (side, dark) => ({
    bone: 'cabeca',
    side,
    node: G({ x: 128, y: -96, rot: t => lerp(64, -4, clamp(V(o.orelhas, t) ?? 0.4)) + 6 * noise(t * 3, side === 'far' ? 4 : 5) + (side === 'far' ? 10 : 0), px: 0, py: 0 }, [
      taper([[0, 0], [-10, -48], [-4, -100]], [20, 26, 7], { fill: dark ? C.rabD : C.rab, shade: 0.4, hl: 0.4 }),
      !dark && taper([[-2, -8], [-9, -48], [-5, -88]], [8, 13, 3], { fill: C.pink, shade: 0, hl: 0, alpha: 0.85 }),
    ]),
  });
  return rig({
    name: o.name ?? 'coelho', plan: 'quadrupede', bones: COELHO, ground: o.ground,
    x: X, y: t => V(o.chao, t) - st(t).hip * (o.s ?? 1), s: o.s, rot: o.rot,
    pose: { coluna: t => st(t).coluna, cabeca: t => 72 + (V(o.cabeca, t) ?? 0) },
    ik: [
      { chain: ['femurN', 'tibiaN', 'metaN'], target: t => st(t).hock, endAng: t => st(t).a },
      { chain: ['femurF', 'tibiaF', 'metaF'], target: t => { const h = st(t).hock; return [h[0] - 6, h[1]]; }, endAng: t => st(t).a },
      { chain: ['umeroN', 'antebracoN', 'maoN'], target: t => st(t).wrist, endAng: t => st(t).b },
      { chain: ['umeroF', 'antebracoF', 'maoF'], target: t => { const w = st(t).wrist; return [w[0] - 6, w[1]]; }, endAng: t => st(t).b },
    ],
    skin: [
      ear('far', true),
      { limb: ['umeroF', 'antebracoF'], w: [14, 10, 8], fill: C.rabD },
      { bone: 'maoF', node: blob([[120, 27], [132, 32], [146, 39], [148, 45], [128, 45], [118, 37]], { fill: C.rabD, shade: 0.3 }) },
      { bone: 'metaF', node: blob([[-18, 34], [0, 32], [50, 34], [68, 37], [70, 44], [-16, 45]], { fill: C.rabD, shade: 0.3 }) },
      // corpo e barriga (presos à coluna), cauda
      { bone: 'cauda1', node: circle(-22, -6, 13, { fill: '#fbf6ee', shade: 0.35, hl: 0.3 }) },
      { bone: 'coluna', node: G([
        blob([[-40, 8], [-36, -24], [-6, -52], [44, -66], [92, -60], [118, -44], [126, -14], [116, 14], [80, 22], [36, 26], [-8, 30], [-34, 24]], { fill: lin(90, C.rab, C.rabD), shade: 0.45, hl: 0.45, tex: { k: 'brush', a: 0.22, s: 0.5 } }),
        blob([[60, 18], [96, 14], [118, 0], [124, -18], [110, -6], [80, 6]], { fill: C.rabL, shade: 0.25, hl: 0 }),
      ]) },
      // anca (coxa) gira com o fêmur
      { bone: 'femurN', node: ellipse(10, 6, 44, 34, { fill: lin(90, C.rab, C.rabD), shade: 0.45, hl: 0.4, tex: { k: 'brush', a: 0.22, s: 0.5 } }) },
      { bone: 'metaN', node: blob([[-18, 34], [0, 32], [50, 34], [68, 37], [70, 44], [-16, 45]], { fill: C.rab, shade: 0.4, hl: 0.3 }) },
      { limb: ['tibiaN'], w: [28, 15], fill: C.rab, side: 'near' },
      // cabeça
      { bone: 'pescoco', node: blob([[96, -40], [104, -76], [130, -84], [134, -50], [118, -30]], { fill: C.rab, shade: 0.4, hl: 0.4 }) },
      { bone: 'cabeca', node: G([
        blob([[108, -70], [112, -92], [132, -102], [156, -96], [172, -80], [176, -68], [166, -56], [146, -50], [122, -52]], { fill: C.rab, shade: 0.42, hl: 0.45 }),
        blob([[150, -64], [170, -70], [174, -60], [160, -52], [146, -54]], { fill: C.rabL, shade: 0.25, hl: 0 }),
        circle(174, -70, 4.5, { fill: C.pink, shade: 0, hl: 0 }),
        ellipse(164, -57, 6, t => 2 + 3 * (V(o.mastiga, t) ?? 0) * Math.abs(Math.sin(t * 14)), { fill: C.rabL, shade: 0, hl: 0 }),
        circle(146, -82, 8.5, { fill: '#1a1210', shade: 0, hl: 0 }),
        circle(148.5, -84.5, 2.6, { fill: '#fff', shade: 0, hl: 0 }),
        ...rep(3, i => line([[168, -64 + i * 3], [194, -72 + i * 7]], { stroke: '#f6eee2', lw: 1.2 })),
      ]) },
      { limb: ['umeroN', 'antebracoN'], w: [16, 11, 9], fill: C.rabL },
      { bone: 'maoN', node: blob([[120, 27], [132, 32], [146, 39], [148, 45], [128, 45], [118, 37]], { fill: C.rabL, shade: 0.3 }) },
      ear('near', false),
    ],
  });
}

// ------------------------------------------------------------------ cenário
const blade = (x, y, h, seed, fill, w = 10, sway = 1) =>
  taper(t => {
    const s = sway * (10 + 0.06 * h) * (Math.sin(t * 1.6 + x * 0.01 + seed) + 0.4 * noise(t * 0.8 + seed, 3));
    return [[x, y], [x + s * 0.25, y - h * 0.5], [x + s, y - h]];
  }, [w, w * 0.7, 0], { fill, shade: 0, hl: 0.25 });

const grassBand = (seed, y0, y1, n, hMin, hMax, cols, w = 10, sway = 1) =>
  G(scatter(n, seed, r => blade(r.range(-500, 2900), r.range(y0, y1), r.range(hMin, hMax), r() * 9, r.pick(cols), w * r.range(0.7, 1.3), sway)));

const flowers = (seed, y0, y1, n) =>
  G(scatter(n, seed, r => {
    const x = r.range(-400, 2800), y = r.range(y0, y1), h = r.range(40, 90), col = r.pick(['#f6d44c', '#fbf3e6', '#e98a5a', '#c99ad8']);
    return G([blade(x, y, h, r() * 9, C.grassD, 4), G({ x: t => x + (10 + 0.06 * h) * Math.sin(t * 1.6 + x * 0.01), y: y - h }, [circle(0, 0, r.range(6, 10), { fill: col, shade: 0.3, hl: 0.4 }), circle(0, 0, 3, { fill: '#c98a2a', shade: 0 })])]);
  }));

const hill = (y, amp, fill, seed, w = 4200) => {
  const r = rng(seed);
  return blob([[-1000, 1500], [-1000, y], ...rep(9, i => [-900 + (i * w) / 8, y - r.range(0, amp)]), [w - 800, y], [w - 800, 1500]], { fill, shade: 0, hl: 0.3 });
};
const tree = (x, y, s, seed) =>
  G({ x, y, s, rot: osc(0.2, 1.2, seed * 0.1), px: 0, py: 0 }, [
    taper([[0, 0], [-6, -90], [4, -170]], [34, 20], { fill: C.trunk }),
    G({ merge: true, fill: C.tree, shade: { a: 0.5, dp: 22 }, hl: { a: 0.5, dp: 10 } }, [circle(0, -230, 90), circle(-70, -190, 60), circle(70, -190, 66), circle(-30, -290, 60), circle(40, -280, 62)]),
  ]);
const cloud = (x, y, s, seed) =>
  G({ x, y, s, merge: true, fill: '#fff1de', sun: [-0.9, -0.3], shade: { a: 0.35, dp: 18 }, hl: { a: 0.5, dp: 8 } }, [
    ellipse(0, 0, 180, 36), circle(-80, -24, 50), circle(0, -50, 72), circle(84, -26, 56), circle(150, -6, 36),
  ]);

const sunDisk = (x, y) => [circle(x, y, 90, { fill: C.sun, glow: { r: 160, c: '#ffd890', a: 1 }, shade: 0, hl: 0 }), rays({ at: [x, y], ang: 20, spread: 120, n: 9, len: 2200, w: [80, 220], w0: 30, c: '#fff0c0', a: 0.16, sway: 3 })];

// ------------------------------------------------------------------ plano 1: o campo
const SHAWK1 = 0.3;
const shot1 = scene({
  dur: 6.5,
  bg: sky,
  look,
  camera: { x: kf([0, 900], [6.5, 1000]), y: 520, zoom: kf([0, 1], [6.5, 1.1]), dof: 5 },
  layers: [
    layer({ z: 30, haze: 0 }, [...sunDisk(420, 600), cloud(t => 500 + t * 8, 160, 1.2, 1), cloud(t => 1500 + t * 6, 260, 0.9, 2), cloud(t => 2400 + t * 8, 120, 1.1, 3)]),
    layer({ z: 12 }, [hill(700, 120, C.hillFar, 1)]),
    layer({ z: 6 }, [
      // gavião planando em círculos lá no alto (vira conforme a direção do voo)
      hawk({
        name: 'gavião no alto', s: SHAWK1, x: t => 1080 + 90 * t, y: t => 240 + 40 * Math.sin(t * 0.8),
        rot: t => -6 * Math.cos(t * 0.8),
        asa: t => lerpAny(ASA.alta, ASA.baixa, 0.25 + 0.12 * Math.sin(t * 2)), cauda: 0.7,
      }),
    ]),
    layer({ z: 4 }, [hill(780, 90, C.hill, 2), tree(300, 760, 0.8, 1), tree(560, 770, 0.6, 2), tree(1900, 760, 0.9, 3)]),
    layer({ z: 1 }, [
      rect(-1000, GROUND - 40, 4400, 900, { fill: lin(90, C.field, C.fieldD), shade: 0, hl: 0, tex: { k: 'blot', a: 0.4 } }),
      grassBand(1, GROUND - 40, GROUND + 60, 160, 30, 70, [C.grass, C.grass2, C.grassD], 8),
      coelho({ name: 'coelho comendo', x: 860, chao: GROUND + 40, s: 1.35, ground: GROUND + 40, orelhas: t => 0.35 + 0.15 * Math.sin(t * 0.7), mastiga: 1, cabeca: t => 14 + 5 * Math.sin(t * 1.1) }),
      flowers(3, GROUND + 20, GROUND + 160, 40),
      grassBand(2, GROUND + 60, GROUND + 260, 160, 50, 110, [C.grass, C.grass2, C.grassD], 10),
    ]),
    layer({ z: 0.5 }, [grassBand(4, 1180, 1300, 70, 220, 420, [C.grassD, '#4d6628', C.grass], 22, 1.6)]),
  ],
  fadeIn: 0.8,
});

// ------------------------------------------------------------------ plano 2: o mergulho
const DIVE = 1.5;
const shot2 = scene({
  dur: 4.6,
  bg: sky,
  look: { ...look, mblur: t => (t > DIVE + 0.4 ? 3 : 0) },
  camera: { zoom: 1.05, shake: t => 4 * smooth(DIVE, DIVE + 1.5, t), dof: 3 },
  layers: [
    layer({ z: 30, haze: 0 }, [...sunDisk(300, 760)]),
    layer({ z: 8 }, [G({ x: t => -60 * t, y: t => -900 * smooth(DIVE, 4.6, t) * (t - DIVE) }, [cloud(300, 300, 1.6, 4), cloud(1500, 700, 1.3, 5), cloud(900, 1300, 1.8, 6), cloud(1700, 1800, 1.5, 7)])]),
    layer({ z: 3 }, [G({ x: t => -200 * t, y: t => -1500 * smooth(DIVE, 4.6, t) * (t - DIVE) }, [cloud(1600, 200, 1.2, 8), cloud(200, 1100, 1.4, 9), cloud(1300, 2000, 1.6, 10)])]),
    layer({ z: 2.5 }, [G({ y: t => 2200 - 1700 * smooth(3.2, 4.6, t) }, [hill(0, 60, C.hill, 9), rect(-1000, 0, 4400, 1600, { fill: lin(90, C.field, C.fieldD), shade: 0, hl: 0 }), tree(400, 10, 1.2, 7), tree(1500, 20, 1, 8)])]),
    layer({ z: 1 }, [
      hawk({
        name: 'gavião mergulhando', s: 1.25, x: 860, y: t => 560 + 20 * Math.sin(t * 2), rot: kf([0, -4], [DIVE, 0], [DIVE + 0.8, 58, 'inOut']),
        asa: t => (t < DIVE ? bater(t, 1.6) : lerpAny(bater(DIVE, 1.6), ASA.dobrada, smooth(DIVE, DIVE + 0.7, t))),
        cabeca: kf([DIVE, 0], [DIVE + 0.8, -30]), cauda: kf([DIVE, 0.6], [DIVE + 0.7, 0]),
      }),
    ]),
    layer({ z: 0.7 }, [particles({ seed: 5, rate: 46, t0: DIVE + 0.3, life: [0.4, 0.7], at: [960, 1500], area: [2400, 100], dir: -96, spread: 6, speed: [2400, 3000], size: [1.5, 3], stretch: 3, color: '#fffaf0', alphaVar: 0.5 })]),
  ],
});

// ------------------------------------------------------------------ plano 3: o ataque
const TC = 2.42, HOLE = 1390, SH = 0.95, SR = 1.15;
const rabX = kf([1.0, 900], [TC - 0.14, HOLE - 50, 'linear']);
// gavião: quadril do pássaro. No golpe, as garras (≈ 140,150 locais) chegam na toca.
const STAND_Y = GROUND + 18 - 165 * SH;
const hawkRot = t => (t < 1.9 ? Math.max(-10, Math.min(50, heading(hawkP, t))) : t < TC ? lerp(30, -10, smooth(1.9, TC, t)) : t < 4.45 ? -6 - 26 * smooth(2.7, 3.1, t) * (1 - smooth(4.2, 4.45, t)) + 2 * Math.sin(t * 2) : -22);
// ponto do mundo -> coordenadas do rig (desfaz posição, escala e rotação do corpo)
const toLocal = (t, [wx, wy]) => {
  const [hx, hy] = hawkP(t), r = (-hawkRot(t) * Math.PI) / 180, dx = (wx - hx) / SH, dy = (wy - hy) / SH;
  return [dx * Math.cos(r) - dy * Math.sin(r), dx * Math.sin(r) + dy * Math.cos(r)];
};
const FOOT_W = [HOLE - 10, GROUND + 18 - 5 * SH]; // onde ele pousa (base dos dedos, acima da sola)
const TUCK = [-3, 63]; // posição do pé com a perna recolhida (cinemática direta da pose recolhida)
const hawkFoot = (t, back) => {
  if (t < 1.8 || t > 4.75) return null;
  const ground = toLocal(t, [FOOT_W[0] - back, FOOT_W[1]]);
  if (t < 2.45) return lerpAny(TUCK, [125 - back, 115], smooth(1.8, 2.05, t));
  if (t < 4.45) return lerpAny([125 - back, 115], ground, smooth(2.45, 2.75, t));
  return lerpAny(ground, TUCK, smooth(4.45, 4.75, t));
};
const hawkP = spline([1.2, [-420, -260]], [1.95, [520, 380]], [TC, [HOLE - 140 * SH, GROUND + 14 - 134 * SH]], [2.75, [HOLE - 40, STAND_Y]], [4.45, [HOLE - 36, STAND_Y]], [5.2, [1700, 460]], [6.4, [2500, -120]]);
const shot3 = scene({
  dur: 7.6,
  bg: sky,
  look: { ...look, mblur: t => (between(t, 1.6, 2.6) ? 3 : 0) },
  camera: {
    x: kf([0, 1000], [1.6, 1040], [TC, 1160], [7.6, 1180]), y: kf([0, 560], [TC, 600], [7.6, 590]),
    zoom: kf([0, 1.12], [TC - 0.05, 1.15], [TC + 0.1, 1.24, 'out'], [4, 1.18], [7.6, 1.2]),
    shake: t => 14 * decay(t, TC, 6), dof: 6,
  },
  layers: [
    layer({ z: 30, haze: 0 }, [...sunDisk(380, 640), cloud(600, 200, 1.1, 11), cloud(1700, 150, 0.9, 12)]),
    layer({ z: 10 }, [hill(720, 110, C.hillFar, 3)]),
    layer({ z: 4 }, [hill(790, 80, C.hill, 4), tree(200, 780, 0.9, 4), tree(1700, 770, 0.7, 5), tree(2300, 780, 1, 6)]),
    layer({ z: 1 }, [
      rect(-1000, GROUND - 40, 4400, 900, { fill: lin(90, C.field, C.fieldD), shade: 0, hl: 0, tex: { k: 'blot', a: 0.4 } }),
      grassBand(5, GROUND - 40, GROUND + 30, 150, 30, 70, [C.grass, C.grass2, C.grassD], 8),
      // sombra do gavião varrendo o chão
      ellipse(t => lerp(-600, 2600, smooth(0.35, 1.0, t)), GROUND + 40, 160, 22, { fill: '#3a2a30', alpha: t => 0.45 * (between(t, 0.35, 1.0) ? 1 : 0), blur: 14, blend: 'multiply', shade: 0, hl: 0 }),
      // toca: buraco atrás, montinho de terra na frente
      ellipse(HOLE, GROUND + 26, 74, 24, { fill: C.hole, shade: 0, hl: 0 }),
      // coelho: come, fica alerta, foge aos saltos e mergulha na toca
      G({ show: [0, TC], y: t => 110 * smooth(TC - 0.14, TC, t), rot: t => 35 * smooth(TC - 0.2, TC, t), px: HOLE - 50, py: GROUND + 40 }, [
        coelho({
          name: 'coelho fugindo', x: t => rabX.at(t), x0: 900, chao: GROUND + 40, s: SR, Lh: (HOLE - 50 - 900) / (3 * SR),
          ground: t => (t < TC - 0.2 ? GROUND + 40 : undefined),
          salta: t => t >= 1.0 && t < TC - 0.14,
          orelhas: kf([0, 0.35], [0.6, 0.35], [0.8, 1, 'back']), mastiga: t => (t < 0.6 ? 1 : 0), cabeca: kf([0, 14], [0.6, 14], [0.8, -6]),
        }),
      ]),
      // o coelho espia da toca no final
      G({ show: [5.8, 99], y: t => 150 - 72 * smooth(5.9, 6.5, t) }, [coelho({ name: 'coelho espiando', x: HOLE - 60, chao: GROUND + 40, s: 1.1, orelhas: kf([5.9, 0.6], [6.6, 1]), cabeca: t => 6 * Math.sin(t * 3) })]),
      blob([[HOLE - 110, GROUND + 60], [HOLE - 80, GROUND + 26], [HOLE - 20, GROUND + 36], [HOLE + 50, GROUND + 34], [HOLE + 100, GROUND + 20], [HOLE + 130, GROUND + 60], [HOLE, GROUND + 74]], { fill: lin(90, '#9a7050', C.dirt), shade: 0.4, hl: 0.4, tex: { k: 'speckle', a: 0.4 } }),
      // gavião: mergulho -> freio com garras à frente -> golpe -> pousa e procura -> decola
      hawk({
        name: 'gavião atacando', s: SH, ...move(hawkP), ground: t => (between(t, 2.75, 4.45) ? GROUND + 18 : undefined),
        rot: hawkRot,
        asa: t => (t < 1.85 ? ASA.dobrada : t < 2.05 ? lerpAny(ASA.dobrada, ASA.freio, smooth(1.85, 2.05, t)) : t < 2.9 ? lerpAny(ASA.freio, ASA.alta, 0.3 + 0.3 * Math.sin(t * 14)) : t < 4.4 ? lerpAny(ASA.freio, ASA.dobrada, smooth(2.9, 3.3, t)) : bater(t, 3)),
        cauda: t => (between(t, 1.9, 2.9) ? 1 : 0.2), caudaAng: t => (between(t, 1.9, 2.6) ? 18 : 0),
        pe: t => hawkFoot(t, 0),
        peF: t => hawkFoot(t, 14),
        dedos: t => (t < 2.3 ? lerp(-5, 40, smooth(1.8, 2.05, t)) : t < 4.45 ? lerp(40, -hawkRot(t), smooth(2.3, 2.6, t)) : lerp(-hawkRot(t), -5, smooth(4.45, 4.75, t))), garra: kf([TC - 0.05, 0], [TC + 0.08, 1], [2.75, 0.2]),
        coxa: t => (t < 2.45 ? lerp(55, 10, smooth(1.8, 2.05, t)) : t < 4.45 ? lerp(10, 95, smooth(2.45, 2.8, t)) : lerp(95, 55, smooth(4.45, 4.75, t))),
        cabeca: t => (between(t, 2.8, 4.4) ? 30 * smooth(2.8, 3.1, t) - 40 * smooth(3.6, 3.9, t) + 6 * Math.sin(t * 7) : 0),
      }),
      // impacto: terra, capim e penas
      particles({ seed: 7, burst: 50, t0: TC, at: [HOLE - 10, GROUND + 20], area: 50, dir: -90, spread: 150, speed: [200, 620], drag: 1.5, grav: [0, 900], life: [0.8, 1.6], size: [4, 11], color: ['#9a7050', '#7a5236', '#b98a62'], alphaVar: 0.2 }),
      particles({ seed: 8, burst: 18, t0: TC, at: [HOLE - 10, GROUND], area: 40, dir: -90, spread: 120, speed: [250, 500], drag: 1.8, grav: [0, 500], life: [1, 1.8], size: [10, 18], spin: 600, shape: p => taper([[0, 0], [p.size, -p.size * 0.3], [p.size * 2, 0]], [0, 4, 0], { rot: p.rot, fill: C.grass2, shade: 0, hl: 0 }) }),
      particles({ seed: 9, burst: 4, t0: TC + 0.05, at: [HOLE - 20, GROUND - 120], area: 40, dir: -90, spread: 120, speed: [80, 160], drag: 2.5, grav: [0, 60], life: [2.5, 3.5], size: [14, 18], spin: 120, turb: 40, fadeOut: 0.3, shape: p => G({ rot: p.rot }, [taper([[0, 0], [p.size, -3], [p.size * 2.2, 0]], [2, 9, 0], { fill: C.wingL, shade: 0.3, hl: 0.3 })]) }),
      grassBand(6, GROUND + 50, GROUND + 260, 150, 50, 110, [C.grass, C.grass2, C.grassD], 10),
      flowers(7, GROUND + 40, GROUND + 200, 36),
    ]),
    layer({ z: 0.5 }, [grassBand(8, 1180, 1300, 60, 240, 440, [C.grassD, '#4d6628', C.grass], 24, 1.6)]),
  ],
  fadeOut: 0.9,
});

// ------------------------------------------------------------------ prancha de poses (export nomeado: iterar no desenho)
export const poseTest = scene({
  dur: 2, bg: sky, look: { ...look, haze: null }, layers: [layer([
    hawk({ name: 'asa alta', x: 250, y: 330, s: 0.8, asa: ASA.alta, cauda: 0.6 }),
    hawk({ name: 'asa baixa', x: 720, y: 330, s: 0.8, asa: ASA.baixa }),
    hawk({ name: 'asa recolhendo', x: 1180, y: 330, s: 0.8, asa: ASA.recolhe }),
    hawk({ name: 'mergulho', x: 1640, y: 300, s: 0.8, rot: 50, asa: ASA.dobrada, cabeca: -30 }),
    hawk({ name: 'golpe', x: 300, y: 760, s: 0.8, rot: -10, asa: ASA.freio, cauda: 1, coxa: 10, pe: [125, 115], dedos: 40 }),
    hawk({ name: 'pousado', x: 760, y: 900 - 165 * 0.8, s: 0.8, ground: 900, asa: ASA.dobrada, pe: [26, 160], cabeca: 20 }),
    coelho({ name: 'coelho sentado', x: 1150, chao: 900, s: 1.2, ground: 900, orelhas: 0.4 }),
    ...[0.12, 0.45, 0.75].map((p, i) => coelho({ name: `salto ${p}`, x: t => 1400 + i * 240 + p * 150 * 0.9, x0: 1400 + i * 240, chao: 900, s: 0.9, salta: true, orelhas: 1 })),
  ])],
});

export default film([shot1, shot2, shot3], { trans: 'cross', d: 0.5 });
