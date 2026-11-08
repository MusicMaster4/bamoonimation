// Benchmark 3 — Foguete decolando ao amanhecer.
// 3 planos: contagem regressiva na plataforma -> ignição e decolagem -> subida até o espaço.
import {
  scene, film, layer, G, blob, ellipse, circle, rect, taper, line, particles, rays, dyn, lin, rad,
  kf, osc, rng, scatter, rep, noise, smooth, clamp, lerp, V, decay, darken,
} from 'bamoonimation';

const C = {
  skyTop: '#1b2654', skyMid: '#5d4a8a', skyLow: '#e9836b', horizon: '#ffd08a',
  hill: '#3a3058', hill2: '#2a2342', ground: '#221c33', pad: '#7d7690', padD: '#4f4962',
  tower: '#b8432f', towerD: '#7e2a20', white: '#f6f2ea', grey: '#b9b4ad', black: '#25222b', red: '#c8402f',
  smoke: '#efe6da', fire: '#ffb347',
};
const look = {
  sun: [0.85, -0.45], light: '#ffe2b8', shadow: '#3c2c5c', shade: 0.5, hl: 0.35,
  haze: { c: '#d98a7f', a: 0.55 }, vignette: 0.45, vignetteC: '#120a22', bloom: 0.35,
  grade: { sat: 1.06, con: 1.05, lift: '#0c0718', tint: '#ff9a60', tintA: 0.1 },
};
const dawn = lin(90, [0, C.skyTop], [0.45, C.skyMid], [0.78, C.skyLow], [1, C.horizon]);

// ------------------------------------------------------------------ foguete (origem = base do 1º estágio)
const PAD_Y = 860; // topo da plataforma
const body = (y0, y1, w0, w1, extra = {}) =>
  blob([[-w0, y0, 0], [w0, y0, 0], [w1, y1, 0], [-w1, y1, 0]], { fill: lin(0, '#a9a49d', C.white, '#fffdf8', '#d8d2c8', '#8f8a84'), hl: 0.3, shade: 0.45, ...extra });
const fin = (side, front = false) =>
  blob([[0, -150], [side * 30, -60], [side * 46, 10, 0.3], [side * 40, 26, 0], [0, 4]].map(([x, y, r]) => [x + side * 42, y, r]), { fill: front ? C.black : darken(C.red, 0.05), shade: 0.4, hl: 0.3 });
const rocket = () =>
  G([
    fin(-1), fin(1),
    ...[-30, 0, 30].map(x => blob([[x - 13, 0], [x + 13, 0], [x + 20, 52, 0.4], [x - 20, 52, 0.4]], { fill: lin(0, '#3a3742', '#8c8896', '#2c2a33'), shade: 0.3 })),
    body(0, -270, 50, 50),
    G({ clip: rect(-50, -270, 100, 270) }, [rect(0, -250, 50, 70, { fill: C.black, shade: 0 }), rect(-50, -110, 50, 70, { fill: C.black, shade: 0 })]),
    rect(-52, -285, 104, 22, { fill: C.black, shade: 0.3, hl: 0.4 }),
    body(-283, -470, 46, 46),
    G({ clip: rect(-46, -470, 92, 190) }, [rect(-46, -440, 46, 50, { fill: C.black, shade: 0 })]),
    rect(-48, -482, 96, 16, { fill: C.grey, shade: 0.3, hl: 0.4 }),
    blob([[-46, -480, 0], [46, -480, 0], [26, -560], [6, -588, 0.4], [-6, -588, 0.4], [-26, -560]], { fill: lin(0, '#a9a49d', C.white, '#fffdf8', '#8f8a84'), shade: 0.45, hl: 0.35 }),
    taper([[0, -585], [0, -640]], [7, 3], { fill: C.red, shade: 0 }),
    blob([[-9, -640], [9, -640], [0, -668]], { fill: C.red }),
    // faixa vermelha com emblema (sem letras)
    rect(18, -452, 12, 150, { r: 4, fill: C.red, shade: 0.3, hl: 0.3 }),
    ...[0, 1, 2].map(i => circle(24, -430 + i * 52, 7, { fill: '#f6f2ea', shade: 0, hl: 0.4 })),
    fin(0, true),
  ]);

// chama: camadas em gota com tremulação
const flamePts = (t, w, L, seed) => {
  const n = k => noise(t * 9 + k * 3.1, seed + k);
  return [[-w / 2, 0], [w / 2, 0], [w * 0.62 + 6 * n(1), L * 0.28], [w * 0.32 + 8 * n(2), L * 0.66], [5 * n(3), L * (1 + 0.12 * n(4))], [-w * 0.32 + 8 * n(5), L * 0.66], [-w * 0.62 + 6 * n(6), L * 0.28]];
};
const flame = power =>
  G({ y: 50 }, [
    blob(t => flamePts(t, 120, 520 * V(power, t), 1), { fill: lin(90, '#ffe9a8', '#ff9c3a', '#ff5a2600'), glow: { r: 50, c: '#ff8a3a', a: 0.9 }, shade: 0, hl: 0 }),
    blob(t => flamePts(t, 80, 330 * V(power, t), 2), { fill: lin(90, '#ffffff', '#fff3b8', '#ffd26a00'), shade: 0, hl: 0 }),
    circle(0, 30, t => 160 * V(power, t), { fill: rad(null, '#ffd08a', '#ff9a4a66', '#ff9a4a00'), blend: 'screen', shade: 0, hl: 0 }),
  ]);

// nuvem de fumaça: partículas fundidas numa silhueta só, iluminada por baixo pelo fogo
const smoke = (seed, at, dir, o = {}) =>
  particles({
    seed, rate: o.rate ?? 40, t0: o.t0 ?? 0, t1: o.t1, life: o.life ?? [3, 5], at, area: [70, 20], dir, spread: o.spread ?? 26,
    speed: o.speed ?? [300, 520], drag: 1.3, grav: [0, -30], size: o.size ?? [26, 56], grow: o.grow ?? 3.4, turb: 30,
    merge: true, fill: o.fill ?? C.smoke, sun: o.sun ?? [0.3, 1], light: '#ffb35c', shadow: '#5e4b74',
    shade: { a: 0.55, dp: o.dp ?? 30, soft: 0.6 }, hl: { a: 0.85, dp: o.dp ? o.dp * 0.5 : 16 }, tex: { k: 'grain', a: 0.25 },
  });

// vapor saindo do foguete antes da ignição
const vent = (seed, x, y, dir) =>
  particles({ seed, rate: 26, life: [1.4, 2.4], at: [x, y], area: 4, dir, spread: 40, speed: [60, 130], drag: 1, grav: [0, 70], size: [3, 5], grow: 7, color: '#ffffff', alpha: 0.32, alphaVar: 0.6, blur: 5, fadeIn: 0.05, fadeOut: 0.8 });

// ------------------------------------------------------------------ cenário
const tower = (x, armsOut) =>
  G({ x, y: PAD_Y }, [
    ...[-34, 34].map(dx => rect(dx - 7, -760, 14, 760, { fill: C.tower, shade: 0.35, hl: 0.3 })),
    ...rep(19, i => line([[-30, -i * 40], [30, -(i + 1) * 40]], { stroke: C.towerD, lw: 5 })),
    ...rep(19, i => line([[30, -i * 40], [-30, -(i + 1) * 40]], { stroke: C.towerD, lw: 5 })),
    ...rep(20, i => rect(-38, -i * 40 - 4, 76, 8, { fill: C.tower, shade: 0 })),
    rect(-50, -790, 100, 30, { fill: C.tower, shade: 0.3, hl: 0.4 }),
    circle(0, -800, 9, { fill: '#ff4a3a', glow: { r: 20, a: t => 0.5 + 0.5 * Math.sin(t * 6) }, shade: 0, hl: 0 }),
    // braços de serviço: giram para longe na decolagem
    ...[-560, -380, -200].map((y, i) => G({ x: 34, y, rot: t => -70 * V(armsOut, t) * (1 - i * 0.1), px: 0, py: 0 }, [
      rect(0, -8, 130, 16, { fill: C.towerD, shade: 0.3 }), line([[0, 8], [70, -8], [130, 8]], { stroke: C.towerD, lw: 4 }),
    ])),
  ]);

const pad = () =>
  G([
    blob([[-900, PAD_Y + 30], [-900, PAD_Y + 10], [-260, PAD_Y], [260, PAD_Y], [900, PAD_Y + 10], [2900, PAD_Y + 30], [2900, 1400], [-900, 1400]], { fill: lin(90, C.ground, '#14101f'), shade: 0, hl: 0 }),
    rect(560, PAD_Y, 800, 80, { fill: lin(90, C.pad, C.padD), shade: 0.3, hl: 0.4, tex: { k: 'speckle', a: 0.3 } }),
    rect(860, PAD_Y + 10, 200, 70, { fill: '#18131f', shade: 0 }),
    ...[620, 1300].map(x => G({ x, y: PAD_Y }, [rect(-6, -180, 12, 180, { fill: '#3a3446' }), circle(0, -186, 12, { fill: '#fff8de', glow: { r: 40, a: 0.8, c: '#fff1c0' }, shade: 0, hl: 0 })])),
  ]);

const hills = (y, col, seed, amp = 120) => {
  const r = rng(seed);
  return blob([[-1200, 1400], [-1200, y], ...rep(12, i => [-1100 + i * 380, y - r.range(0, amp)]), [3400, y], [3400, 1400]], { fill: col, shade: 0, hl: 0.25 });
};

const sea = y =>
  G([
    rect(-1200, y, 4600, 300, { fill: lin(90, '#f2a27c', '#7b5a8c', '#3a3058'), shade: 0, hl: 0 }),
    ...scatter(26, 5, r => {
      const x = r.range(-1000, 3200), yy = y + r.range(8, 160), w = r.range(40, 160);
      return taper([[x, yy], [x + w, yy]], [0, 3, 0], { fill: '#ffe0b0', alpha: 0.5, shade: 0, hl: 0 });
    }),
  ]);

const sun = (x, y, r = 90) => circle(x, y, r, { fill: '#fff4d6', glow: { r: 140, a: 0.9, c: '#ffc070' }, shade: 0, hl: 0 });
const stars = (seed, n, alpha) =>
  G({ alpha }, scatter(n, seed, r => circle(r.range(-1200, 3200), r.range(-1500, 700), r.range(1, 3.2), { fill: '#fff8e8', alpha: t => 0.6 + 0.4 * Math.sin(t * r.range(1, 4) + r() * 6), shade: 0, hl: 0 })));
const cloudBank = (seed, y, w, col = '#f3d2c0', sc = 1) =>
  G({ fill: col, sun: [0.8, -0.5], shade: { a: 0.45, dp: 26 * sc }, hl: { a: 0.6, dp: 12 * sc } }, scatter(6, seed, (r, i) =>
    G({ merge: true, x: -600 + i * (w / 5) + r.range(-80, 80), y: y + r.range(-40, 40), s: sc * r.range(0.8, 1.3) }, [
      ellipse(0, 0, 200, 50), circle(-90, -30, 60), circle(-10, -60, 85), circle(90, -34, 66), circle(170, -10, 44), circle(-170, -6, 40),
    ])));

// contagem regressiva visual (sem texto): três luzes de aviso acendem uma a uma; na ignição ficam verdes
const countdown = (x, y, t0) =>
  G({ x, y, s: 1.4 }, [
    rect(-22, -140, 44, 150, { r: 10, fill: '#2b2533', shade: 0.3, hl: 0.3 }),
    ...[0, 1, 2].map(i =>
      circle(0, -112 + i * 46, 15, {
        fill: t => (t >= t0 + 3 ? '#7dff9a' : t >= t0 + i ? '#ff5a3c' : '#5a2a2a'),
        glow: t => (t >= t0 + i ? { r: 26, a: 0.9, c: t >= t0 + 3 ? '#7dff9a' : '#ff6a3c' } : 0),
        shade: 0, hl: 0.4,
      }),
    ),
  ]);

// ------------------------------------------------------------------ plano 1: contagem e ignição
const IGN = 4.4, LIFT = 5.4;
const power = kf([IGN - 0.05, 0], [IGN + 0.4, 0.7, 'out'], [LIFT, 1]);
const rise = t => (t < LIFT ? 0 : -60 * (t - LIFT) ** 2);
const shot1 = scene({
  dur: 6.6,
  bg: dawn,
  look,
  camera: { zoom: kf([0, 1], [6.6, 1.08]), y: kf([0, 560], [6.6, 520]), shake: t => 7 * smooth(IGN, IGN + 0.6, t), dof: 3 },
  layers: [
    layer({ z: 30, haze: 0 }, [stars(1, 70, 0.6), sun(1550, 760), rays({ at: [1550, 760], ang: 200, spread: 80, n: 7, len: 1300, w: [60, 160], w0: 20, c: '#ffd9a0', a: 0.12 })]),
    layer({ z: 8 }, [cloudBank(2, 330, 2600, '#f0b9a8', 0.8), hills(780, C.hill, 3, 160), sea(770)]),
    layer({ z: 3 }, [hills(850, C.hill2, 5, 90)]),
    layer({ z: 1 }, [
      pad(),
      tower(1120, kf([IGN, 0], [LIFT + 0.4, 1])),
      countdown(1240, PAD_Y - 40, 1.4),
      smoke(11, [960, PAD_Y + 40], 180, { t0: IGN + 0.1, rate: 30, size: [24, 46], speed: [380, 620] }),
      smoke(12, [960, PAD_Y + 40], 0, { t0: IGN + 0.1, rate: 30, size: [24, 46], speed: [380, 620] }),
      G({ x: 960, y: t => PAD_Y - 52 + rise(t) }, [
        vent(3, 46, -300, -10), vent(4, -46, -470, 190), vent(5, 44, -520, -20),
        G({ show: [IGN - 0.05, 99] }, [flame(power)]),
        rocket(),
      ]),
      smoke(13, [960, PAD_Y + 60], -90, { t0: IGN + 0.2, rate: 22, spread: 90, speed: [120, 260], size: [30, 60], grow: 2.6 }),
    ]),
  ],
  fadeIn: 0.8,
});

// ------------------------------------------------------------------ plano 2: decolagem (câmera acompanha)
const rise2 = t => -40 - 55 * t * t;
const shot2 = scene({
  dur: 5.6,
  bg: dawn,
  look: { ...look, bloom: 0.45 },
  camera: { x: 980, y: t => 560 + 0.82 * rise2(t), zoom: 1.45, shake: t => 9 * (1 - smooth(3, 5.6, t)) + 2, dof: 5 },
  layers: [
    layer({ z: 30, haze: 0 }, [stars(1, 70, 0.5), sun(1600, 820)]),
    layer({ z: 8 }, [cloudBank(2, 330, 2600, '#f0b9a8', 0.8), hills(780, C.hill, 3, 160), sea(770)]),
    layer({ z: 1 }, [
      pad(),
      tower(1120, 1),
      smoke(21, [960, PAD_Y + 40], 180, { rate: 34, size: [30, 52], speed: [420, 680], life: [3.5, 5] }),
      smoke(22, [960, PAD_Y + 40], 0, { rate: 34, size: [30, 52], speed: [420, 680], life: [3.5, 5] }),
      G({ x: 960, y: t => PAD_Y - 52 + rise2(t) }, [flame(t => 1 + 0.15 * Math.sin(t * 20)), rocket()]),
      // fumaça que sobe acompanhando o foguete (rastro)
      smoke(23, t => [960 + 6 * Math.sin(t * 3), PAD_Y + 170 + rise2(t)], 90, { rate: 30, spread: 40, speed: [40, 120], size: [28, 46], grow: 2.6, life: [3, 4.5] }),
    ]),
    layer({ z: 0.6 }, [smoke(24, [600, 1250], -20, { rate: 14, size: [50, 80], speed: [200, 300], dp: 50 }), smoke(25, [1500, 1250], 200, { rate: 14, size: [50, 80], speed: [200, 300], dp: 50 })]),
  ],
});

// ------------------------------------------------------------------ plano 3: rumo ao espaço
const climb = t => t * 520; // deslocamento do mundo para baixo (nuvens passando)
const shot3 = scene({
  dur: 7,
  bg: kf([0, lin(90, '#3b4c8f', '#8a74b0', '#f2a58a')], [6, lin(90, '#05061a', '#151a46', '#3d3f7a')]),
  look: { ...look, haze: { c: '#8a8ac0', a: 0.4 } },
  camera: { x: 960, y: 540, zoom: kf([0, 1], [7, 0.9]), rot: kf([0, -6], [7, -10]), shake: t => 3 * (1 - smooth(0, 5, t)), dof: 4 },
  layers: [
    layer({ z: 30, haze: 0 }, [stars(7, 140, kf([1, 0], [5, 1]))]),
    layer({ z: 20, haze: 0 }, [
      G({ y: t => 260 - 30 * t }, [circle(1640, 700, 46, { fill: '#fff6dc', glow: { r: 130, c: '#ffd59a', a: 1 }, shade: 0, hl: 0 })]),
    ]),
    layer({ z: 6 }, [G({ y: t => climb(t) * 0.25 }, [cloudBank(31, 900, 3000, '#e9c3c8', 1.2), cloudBank(32, 1500, 3000, '#d7b5c6', 1.4)])]),
    layer({ z: 1 }, [
      // rastro de condensação
      taper(t => [[960, 1700], [970, 1250], [960, 900], [960, 610]], [120, 70, 30, 10], { fill: lin(90, '#ffffff00', '#fff6ecaa', '#ffe9c8'), blur: 8, shade: 0, hl: 0 }),
      G({ x: 960, y: 520 }, [flame(t => 1.1 + 0.15 * Math.sin(t * 22)), rocket()]),
    ]),
    layer({ z: 0.7 }, [G({ y: t => climb(t) - 600 }, [cloudBank(41, 400, 3200, '#f4dce0', 2), cloudBank(42, -900, 3200, '#efd2da', 2.2)])]),
  ],
  fadeOut: 1,
});

export default film([shot1, shot2, shot3], { trans: 'cross', d: 0.6 });
