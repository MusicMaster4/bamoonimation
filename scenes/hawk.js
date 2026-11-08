// Benchmark 4 — Um gavião ataca um coelho no campo ao entardecer.
// 3 planos: o campo (gavião circulando) -> o mergulho -> o ataque (e a fuga para a toca).
import {
  scene, film, layer, G, blob, ellipse, circle, rect, taper, line, limb, particles, rays, dyn, lin, rad,
  kf, osc, wig, rng, scatter, rep, body, profile, spline, move, heading, cycle, smooth, clamp, lerp, V, noise, decay, between, darken, mix,
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

// ------------------------------------------------------------------ gavião (perfil voltado p/ +x)
const FEATHER = (len, w) => taper([[0, 0], [len * 0.55, 0], [len, 0]], [w, w * 0.9, w * 0.25], { caps: 'round' });
// asa: sai do ombro ao longo de +x; fold 0..1 encolhe as rêmiges
const wing = (fill, edge, o = {}) =>
  dyn(t => {
    const fold = clamp(V(o.fold, t) ?? 0);
    const spread = 1 - 0.75 * fold;
    return G({ rot: V(o.rot, t) ?? 0, sy: V(o.sy, t) ?? 1, sx: 1 - 0.35 * fold }, [
      // secundárias (borda de fuga)
      G({ fill: edge, shade: 0.3, hl: 0.2 }, rep(8, i => G({ x: 22 + i * 27, y: 30, rot: 102 - i * 4 }, [FEATHER(66 - i * 2, 38)]))),
      // primárias ("dedos" na ponta)
      G({ fill: edge, shade: 0.35, hl: 0.25 }, rep(5, i => G({ x: 226 + i * 6, y: 6 + i * 6, rot: (-12 + i * 15) * spread }, [FEATHER(150 - i * 12, 32)]))),
      blob([[0, -18], [90, -30], [180, -34], [250, -22], [256, 18], [190, 48], [100, 60], [20, 44]], { fill, shade: 0.4, hl: 0.4, tex: { k: 'brush', a: 0.3, s: 0.6 } }),
      // coberteiras (faixa clara + pintas)
      taper([[20, 20], [110, 34], [200, 28]], [10, 16, 6], { fill: mix(fill, C.cream, 0.35), shade: 0, hl: 0 }),
      ...rep(6, i => ellipse(40 + i * 32, 8 + (i % 2) * 8, 6, 3.5, { fill: C.hawkD, shade: 0, hl: 0 })),
    ]);
  });

const TOPB = profile([6, 22, 34, 38, 34, 26]);
const BOTB = profile([6, 26, 42, 48, 40, 24]);
/** o: wingRot, wingFold, wingSy, legs (0 recolhidas..1 garras à frente), grab (0 aberta..1 fechada), headRot, farWing */
function hawk(o = {}) {
  return dyn(t => {
    const legs = clamp(V(o.legs, t) ?? 0), grab = clamp(V(o.grab, t) ?? 0), stand = clamp(V(o.stand, t) ?? 0);
    const spine = [[-110, 4], [-40, 0], [30, -4], [78, -14]];
    const talon = side => G({ fill: '#2a2226', shade: 0, hl: 0 }, rep(3, i => taper([[0, 0], [12, 8 + i * 4], [16 - grab * 10, 22 + i * 3]], [6, 4, 1], { rot: -30 + i * 30 + grab * 20 }))
      .concat([taper([[0, 0], [-10, 10], [-6 + grab * 6, 20]], [6, 4, 1])]));
    const foot = (dx, near) => {
      let tgt = [lerp(-10 + dx, 110 + dx, legs), lerp(40, 92, legs)];
      if (stand > 0) tgt = [lerp(tgt[0], dx - 56, stand), lerp(tgt[1], 112, stand)];
      return limb([dx, 30], tgt, [52, 60], near ? [22, 12, 10] : [20, 11, 9], {
        fill: near ? C.leg : darken(C.leg, 0.08), bend: -1, end: talon(near), endRot: -90 + legs * 40 * (1 - stand), endAbs: stand > 0.5 ? 0 : undefined,
      });
    };
    return G([
      // asa de trás (mais escura)
      G({ x: 10, y: -24 }, [wing(darken(C.hawk, 0.1), darken(C.hawkD, 0.08), { rot: t2 => (V(o.wingRot, t2) ?? -130) + 12, fold: o.wingFold, sy: t2 => (V(o.wingSy, t2) ?? 0.7) * 0.8 })]),
      // cauda ruiva em leque
      G({ x: -100, y: 4, fill: lin(0, '#e0784a', C.rust), shade: 0.35, hl: 0.3 }, rep(5, i => G({ rot: 170 + (i - 2) * (4 + 5 * (V(o.tailFan, t) ?? 0)) }, [FEATHER(128, 44)]))),
      legs > 0.02 && foot(-6, false),
      // corpo + barriga clara com estrias
      blob(body(spine, TOPB, BOTB, { n: 16 }), { fill: lin(90, C.hawk, C.wingL), shade: 0.45, hl: 0.45, tex: { k: 'brush', a: 0.25, s: 0.5 } }),
      blob(body(spine, profile([-4, -8, -10, -8, -4, 0]), BOTB, { n: 16 }), { fill: C.cream, shade: 0.4, hl: 0.2 }),
      ...rep(7, i => taper([[-60 + i * 18, 22 + (i % 2) * 6], [-52 + i * 18, 30 + (i % 2) * 6]], [5, 1], { fill: C.hawkD, alpha: 0.7, shade: 0, hl: 0 })),
      legs > 0.02 && foot(8, true),
      // cabeça
      G({ x: 92, y: -30, rot: V(o.headRot, t) ?? 0, px: -20, py: 10 }, [
        circle(0, 0, 36, { fill: C.hawk, shade: 0.4, hl: 0.45 }),
        blob([[-10, 6], [20, -4], [36, 6], [30, 26], [0, 30]], { fill: C.cream, shade: 0.3, hl: 0 }),
        blob([[26, -12], [38, -12], [40, 0], [28, 2]], { fill: C.cere, shade: 0.2 }),
        blob([[36, -14], [54, -10], [62, 6, 0.5], [56, 20, 0], [52, 8], [38, 4]], { fill: lin(0, '#5a5560', C.beak), shade: 0.3, hl: 0.5 }),
        circle(16, -8, 9.5, { fill: '#f2c640', shade: 0, hl: 0 }),
        circle(18, -8, 5, { fill: '#120c0a', shade: 0, hl: 0 }),
        circle(20, -10, 1.8, { fill: '#fff', shade: 0, hl: 0 }),
        taper([[4, -20], [18, -21], [32, -14]], [3, 7, 3], { fill: C.hawkD, shade: 0, hl: 0 }),
      ]),
      // asa da frente
      G({ x: 4, y: -20 }, [wing(C.hawk, C.hawkD, { rot: o.wingRot ?? -130, fold: o.wingFold, sy: o.wingSy ?? 0.7 })]),
    ]);
  });
}

// ------------------------------------------------------------------ coelho (perfil voltado p/ +x, origem no chão sob o corpo)
/** o: hop (fase 0..1 ou null = sentado), ears (0 relaxadas..1 em pé/alerta), chew (0/1), headRot, look */
function rabbit(o = {}) {
  return dyn(t => {
    const ears = clamp(V(o.ears, t) ?? 0.4);
    const hp = V(o.hop, t);
    const hopping = hp !== null && hp !== undefined;
    const p = hopping ? hp : 0;
    const air = hopping ? Math.sin(Math.PI * clamp(p / 0.6)) : 0;
    const stretch = hopping ? (p < 0.6 ? 1 + 0.35 * air : 1 - 0.18 * Math.sin(Math.PI * (p - 0.6) / 0.4)) : 1;
    const tilt = hopping ? (p < 0.3 ? -14 : p < 0.6 ? 10 : -4) * air : 0;
    const chew = V(o.chew, t) ?? 0;
    const twitch = 6 * noise(t * 3, 4) * (1 - ears * 0.5);
    return G({ y: -70 * air, rot: tilt, sx: stretch, sy: 1 / Math.sqrt(stretch), py: -40 }, [
      // pata traseira de trás + orelha de trás
      blob([[-40, -6], [10, -6], [26, 0], [-36, 4]], { fill: C.rabD, shade: 0.3, x: hopping ? -30 * air : 0, rot: hopping ? 30 * air : 0, px: -30, py: -20 }),
      G({ x: 52, y: -86, rot: lerp(70, 8, ears) + twitch + 10, px: 0, py: 0 }, [taper([[0, 0], [-8, -44], [-4, -90]], [18, 22, 6], { fill: C.rabD, shade: 0.3 })]),
      // corpo (anca grande atrás)
      blob([[-62, -10], [-80, -50], [-60, -92], [-10, -104], [36, -86], [58, -60], [50, -20], [20, -2]], { fill: lin(90, C.rab, C.rabD), shade: 0.45, hl: 0.45, tex: { k: 'brush', a: 0.22, s: 0.5 } }),
      blob([[-30, -6], [-40, -30], [0, -26], [40, -40], [48, -14], [20, -2]], { fill: C.rabL, shade: 0.3, hl: 0 }),
      circle(-80, -46, 16, { fill: '#fbf6ee', shade: 0.35, hl: 0.3 }),
      // pata traseira (grande)
      G({ x: -34, y: -4, rot: hopping ? lerp(0, 50, air) : 0, px: 20, py: -10 }, [blob([[-26, -10], [28, -10], [44, -2], [36, 6], [-28, 6]], { fill: C.rab, shade: 0.4, hl: 0.3 })]),
      // patas da frente
      G({ x: 40, y: -10, rot: hopping ? lerp(0, -55, air) : 0, px: 0, py: -20 }, [taper([[0, -24], [4, -10], [10, 2]], [14, 11, 10], { fill: C.rabL, shade: 0.3 })]),
      // cabeça
      G({ x: 52, y: -84, rot: V(o.headRot, t) ?? 0, px: -10, py: 10 }, [
        blob([[-26, 10], [-24, -18], [0, -34], [30, -26], [46, -6], [44, 8], [26, 20], [0, 22]], { fill: C.rab, shade: 0.42, hl: 0.45 }),
        blob([[18, 6], [40, 0], [44, 10], [28, 20], [12, 18]], { fill: C.rabL, shade: 0.25, hl: 0 }),
        circle(42, 2, 4.5, { fill: C.pink, shade: 0, hl: 0, y: t2 => Math.sin(t2 * 18) * 1.2 }),
        ellipse(32, 14, 6, 2 + 3 * chew * Math.abs(Math.sin(t * 14)), { fill: C.rabL, shade: 0, hl: 0 }),
        circle(14, -10, 8.5, { fill: '#1a1210', shade: 0, hl: 0 }),
        circle(16.5, -12.5, 2.6, { fill: '#fff', shade: 0, hl: 0 }),
        ...rep(3, i => line([[38, 4 + i * 3], [64, -4 + i * 7]], { stroke: '#f6eee2', lw: 1.2 })),
      ]),
      // orelha da frente (com interior rosado)
      G({ x: 46, y: -112, rot: lerp(64, -4, ears) + twitch, px: 0, py: 0 }, [
        taper([[0, 0], [-10, -48], [-4, -100]], [20, 26, 7], { fill: C.rab, shade: 0.4, hl: 0.4 }),
        taper([[-2, -8], [-9, -48], [-5, -88]], [8, 13, 3], { fill: C.pink, shade: 0, hl: 0, alpha: 0.85 }),
      ]),
    ]);
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
const shot1 = scene({
  dur: 6.5,
  bg: sky,
  look,
  camera: { x: kf([0, 900], [6.5, 1000]), y: 520, zoom: kf([0, 1], [6.5, 1.1]), dof: 5 },
  layers: [
    layer({ z: 30, haze: 0 }, [...sunDisk(420, 600), cloud(t => 500 + t * 8, 160, 1.2, 1), cloud(t => 1500 + t * 6, 260, 0.9, 2), cloud(t => 2400 + t * 8, 120, 1.1, 3)]),
    layer({ z: 12 }, [hill(700, 120, C.hillFar, 1)]),
    layer({ z: 6 }, [
      // gavião circulando no alto (vira de lado conforme a direção)
      G({ x: t => 1350 + 300 * Math.cos(t * 0.9), y: t => 230 + 50 * Math.sin(t * 0.9), flip: t => -Math.sin(t * 0.9) < 0, rot: t => 10 * Math.cos(t * 0.9), s: 0.32 }, [hawk({ wingRot: t => -105 + 6 * Math.sin(t * 2), wingSy: 0.5 })]),
    ]),
    layer({ z: 4 }, [hill(780, 90, C.hill, 2), tree(300, 760, 0.8, 1), tree(560, 770, 0.6, 2), tree(1900, 760, 0.9, 3)]),
    layer({ z: 1 }, [
      rect(-1000, GROUND - 40, 4400, 900, { fill: lin(90, C.field, C.fieldD), shade: 0, hl: 0, tex: { k: 'blot', a: 0.4 } }),
      grassBand(1, GROUND - 40, GROUND + 60, 160, 30, 70, [C.grass, C.grass2, C.grassD], 8),
      G({ x: 900, y: GROUND + 40, s: 1.35 }, [rabbit({ ears: t => 0.35 + 0.15 * Math.sin(t * 0.7), chew: 1, headRot: t => -8 + 4 * Math.sin(t * 1.1) })]),
      flowers(3, GROUND + 20, GROUND + 160, 40),
      grassBand(2, GROUND + 60, GROUND + 260, 160, 50, 110, [C.grass, C.grass2, C.grassD], 10),
    ]),
    layer({ z: 0.5 }, [grassBand(4, 1180, 1300, 70, 220, 420, [C.grassD, '#4d6628', C.grass], 22, 1.6)]),
  ],
  captions: [[0.8, 5.8, 'Fim de tarde no campo. Lá do alto, alguém observa...']],
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
    layer({ z: 2.5 }, [G({ y: t => 2200 - 1700 * smooth(3.2, 4.6, t) }, [hill(0, 60, C.hill, 9), rect(-1000, 0, 4400, 1600, { fill: lin(90, C.field, C.fieldD), shade: 0, hl: 0 }), tree(400, 10, 1.2, 7), tree(1500, 20, 1, 8)])]),
    layer({ z: 3 }, [G({ x: t => -200 * t, y: t => -1500 * smooth(DIVE, 4.6, t) * (t - DIVE) }, [cloud(1600, 200, 1.2, 8), cloud(200, 1100, 1.4, 9), cloud(1300, 2000, 1.6, 10)])]),
    layer({ z: 1 }, [
      G({ x: 960, y: t => 520 + 20 * Math.sin(t * 2), rot: kf([0, -4], [DIVE, 0], [DIVE + 0.8, 58, 'inOut']), s: 1.5 }, [
        hawk({
          wingRot: t => (t < DIVE ? -118 + 28 * Math.sin(t * 5) : lerp(-118, -172, smooth(DIVE, DIVE + 0.7, t))),
          wingSy: t => (t < DIVE ? 0.75 + 0.2 * Math.sin(t * 5 + 1) : 0.6),
          wingFold: kf([DIVE, 0], [DIVE + 0.7, 1]),
          headRot: kf([DIVE, 0], [DIVE + 0.8, -30]),
          tailFan: kf([DIVE, 0.6], [DIVE + 0.7, 0]),
        }),
      ]),
    ]),
    layer({ z: 0.7 }, [particles({ seed: 5, rate: 46, t0: DIVE + 0.3, life: [0.4, 0.7], at: [960, 1500], area: [2400, 100], dir: -96, spread: 6, speed: [2400, 3000], size: [1.5, 3], stretch: 3, color: '#fffaf0', alphaVar: 0.5 })]),
  ],
});

// ------------------------------------------------------------------ plano 3: o ataque
const TC = 2.42, HOLE = 1390;
const rabX = kf([1.0, 900], [TC - 0.14, HOLE - 50, 'linear']);
const hawkP = spline([1.2, [-400, -220]], [1.95, [560, 400]], [TC, [HOLE - 30, GROUND - 60]], [2.7, [HOLE + 10, GROUND - 92]], [4.5, [HOLE + 20, GROUND - 92]], [5.2, [1700, 480]], [6.4, [2500, -100]]);
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
      G({ show: [0, TC], x: t => rabX.at(t), y: t => GROUND + 50 + 110 * smooth(TC - 0.14, TC, t), rot: t => 35 * smooth(TC - 0.2, TC, t), s: 1.15 }, [
        rabbit({
          ears: kf([0, 0.35], [0.6, 0.35], [0.8, 1, 'back']), chew: t => (t < 0.6 ? 1 : 0), headRot: kf([0, -8], [0.6, -8], [0.8, 8]),
          hop: t => (t < 1.0 ? null : ((rabX.at(t) - 900) / 150) % 1),
        }),
      ]),
      // o coelho espia da toca no final
      G({ show: [5.8, 99], x: HOLE + 6, y: t => GROUND + 150 - 70 * smooth(5.9, 6.5, t), s: 1.1 }, [rabbit({ ears: kf([5.9, 0.6], [6.6, 1]), headRot: t => 6 * Math.sin(t * 3) })]),
      blob([[HOLE - 110, GROUND + 60], [HOLE - 80, GROUND + 26], [HOLE - 20, GROUND + 36], [HOLE + 50, GROUND + 34], [HOLE + 100, GROUND + 20], [HOLE + 130, GROUND + 60], [HOLE, GROUND + 74]], { fill: lin(90, '#9a7050', C.dirt), shade: 0.4, hl: 0.4, tex: { k: 'speckle', a: 0.4 } }),
      // gavião
      G({ ...move(hawkP), rot: t => (t < TC - 0.3 ? Math.max(-10, Math.min(55, heading(hawkP, t))) : t < 2.7 ? -6 : t < 4.4 ? -6 - 26 * smooth(2.7, 3.1, t) + 3 * Math.sin(t * 2) : -25), s: 1.05 }, [
        hawk({
          wingRot: t => (t < 1.9 ? -160 : t < 2.9 ? -95 + 12 * Math.sin(t * 9) : t < 4.4 ? lerp(-95, -176, smooth(2.9, 3.3, t)) : -110 + 50 * Math.sin((t - 4.4) * 12)),
          wingSy: t => (t < 1.9 ? 0.6 : t < 4.4 ? 1 : 0.6 + 0.35 * Math.sin((t - 4.4) * 12 + 1)),
          wingFold: t => (t < 1.9 ? 0.6 : t < 2.9 ? 0 : t < 4.4 ? smooth(2.9, 3.3, t) : 0),
          legs: t => (t < 1.8 ? 0 : t < 4.6 ? smooth(1.8, 2.1, t) : 1 - smooth(4.6, 5.0, t)),
          stand: t => smooth(2.6, 3.0, t) * (1 - smooth(4.3, 4.6, t)),
          grab: kf([TC - 0.05, 0], [TC + 0.08, 1]),
          tailFan: t => (between(t, 1.9, 2.9) ? 1 : 0.2),
          headRot: t => (between(t, 2.8, 4.4) ? 30 * smooth(2.8, 3.1, t) - 40 * smooth(3.6, 3.9, t) + 6 * Math.sin(t * 7) : 0),
        }),
      ]),
      // impacto: terra, capim e penas
      particles({ seed: 7, burst: 50, t0: TC, at: [HOLE - 10, GROUND + 20], area: 50, dir: -90, spread: 150, speed: [200, 620], drag: 1.5, grav: [0, 900], life: [0.8, 1.6], size: [4, 11], color: ['#9a7050', '#7a5236', '#b98a62'], alphaVar: 0.2 }),
      particles({ seed: 8, burst: 18, t0: TC, at: [HOLE - 10, GROUND], area: 40, dir: -90, spread: 120, speed: [250, 500], drag: 1.8, grav: [0, 500], life: [1, 1.8], size: [10, 18], spin: 600, shape: p => taper([[0, 0], [p.size, -p.size * 0.3], [p.size * 2, 0]], [0, 4, 0], { rot: p.rot, fill: C.grass2, shade: 0, hl: 0 }) }),
      particles({ seed: 9, burst: 4, t0: TC + 0.05, at: [HOLE - 20, GROUND - 120], area: 40, dir: -90, spread: 120, speed: [80, 160], drag: 2.5, grav: [0, 60], life: [2.5, 3.5], size: [14, 18], spin: 120, turb: 40, fadeOut: 0.3, shape: p => G({ rot: p.rot }, [taper([[0, 0], [p.size, -3], [p.size * 2.2, 0]], [2, 9, 0], { fill: C.wingL, shade: 0.3, hl: 0.3 })]) }),
      grassBand(6, GROUND + 50, GROUND + 260, 150, 50, 110, [C.grass, C.grass2, C.grassD], 10),
      flowers(7, GROUND + 40, GROUND + 200, 36),
    ]),
    layer({ z: 0.5 }, [grassBand(8, 1180, 1300, 60, 240, 440, [C.grassD, '#4d6628', C.grass], 24, 1.6)]),
  ],
  captions: [[6.0, 7.5, 'Hoje não, gavião.']],
  fadeOut: 0.9,
});

// ------------------------------------------------------------------ teste de poses (export nomeado, útil para iterar no desenho)
export const poseTest = scene({
  dur: 2, bg: sky, look, layers: [layer([
    G({ x: 380, y: 300 }, [hawk({ wingRot: -130 })]),
    G({ x: 980, y: 300 }, [hawk({ wingRot: -70, wingSy: 0.9 })]),
    G({ x: 1560, y: 300, rot: 50 }, [hawk({ wingRot: -175, wingFold: 1, wingSy: 0.6 })]),
    G({ x: 420, y: 800 }, [hawk({ wingRot: -100, wingSy: 1, legs: 1, grab: 0, tailFan: 1 })]),
    G({ x: 1000, y: 900, s: 1.3 }, [rabbit({ ears: 0.3, chew: 1 })]),
    G({ x: 1500, y: 900, s: 1.3 }, [rabbit({ ears: 1, hop: 0.3 })]),
  ])],
});

export default film([shot1, shot2, shot3], { trans: 'cross', d: 0.5 });
