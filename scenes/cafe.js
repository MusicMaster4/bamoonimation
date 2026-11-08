// Benchmark 2 — Um casal se conhecendo numa cafeteria (tarde de chuva).
// 3 planos: ele chega (andar com IK) -> "posso sentar?" -> conversa, risos, café.
import {
  scene, film, layer, G, blob, ellipse, circle, rect, path, taper, line, particles, rays, lin, rad, pessoa, caminhada,
  kf, osc, rng, scatter, rep, blink, talk, gait, gaitPhase, ik2, smooth, clamp, lerp, V, wave, darken, mix,
} from 'bamoonimation';

const P = {
  wall: '#a9533f', wallD: '#8c4234', wainscot: '#4e2a20', panel: '#5e3427', floorA: '#eadbc0', floorB: '#4d332c',
  frame: '#3f2219', lamp: '#ffd27a', brass: '#c58f3a', plant: '#3f6e45', plant2: '#5f8f4f', pot: '#d07a52',
  marble: '#f4efe6', iron: '#2c2a33', cup: '#fbf8f1', coffee: '#5b3423', wood: '#5a3022', chalk: '#2f3a36',
  skinM: '#e0aa83', hairM: '#33241f', jacket: '#4d6088', shirt: '#f1e9d8', pants: '#33364a', shoes: '#4a2c24',
  skinW: '#f1c4a2', hairW: '#7a3622', hairWHi: '#b0583a', dress: '#2e8a83', collar: '#f7f1e6', lips: '#c4535a', shoesW: '#8b2f36',
};

const look = {
  sun: [-0.45, -1], light: '#ffeccc', shadow: '#47234d', shade: 0.45, hl: 0.24,
  haze: { c: '#e7b98f', a: 0.5 }, vignette: 0.48, vignetteC: '#220b1a', bloom: 0.3,
  grade: { sat: 1.05, con: 1.05, lift: '#14080f', tint: '#ffa860', tintA: 0.12 },
};
const D = Math.PI / 180;
const FLOOR = 1050, SEAT = FLOOR - 172, TABLE = SEAT - 117;

// ------------------------------------------------------------------ objetos
const steam = (seed, h = 130) =>
  G({ blend: 'screen', alpha: 0.75 }, rep(2, k =>
    taper(t => wave(rep(7, i => [k * 9 - 4, -i * (h / 6)]), t, { amp: u => 2 + 13 * u, freq: 0.5, len: 0.7, phase: seed + k * 0.4 }),
      [0, 9, 6, 0], { fill: '#fff8ee', blur: 3, shade: 0, hl: 0, alpha: t => 0.65 + 0.3 * Math.sin(t * 1.3 + k + seed) }),
  ));
const cup = (seed, hot = true) =>
  G([
    ellipse(0, 4, 36, 6.5, { fill: P.cup, shade: 0.4 }),
    line([[19, -24], [33, -22], [31, -9], [17, -9]], { stroke: P.cup, lw: 5.5 }),
    blob([[-23, -32], [23, -32], [20, -7, 0.5], [0, 1], [-20, -7, 0.5]], { fill: P.cup, shade: 0.45, hl: 0.4 }),
    taper([[-21, -24], [0, -22], [21, -24]], [0, 4, 0], { fill: '#d0644e', shade: 0, hl: 0 }),
    ellipse(0, -32, 23, 3.8, { fill: P.coffee, shade: 0, hl: 0 }),
    hot && G({ y: -36 }, [steam(seed)]),
  ]);
const heldCup = (seed, tilt = 0) => G({ x: 16, y: -14, rot: tilt }, [cup(seed)]);

const table = x =>
  G({ x, y: TABLE }, [
    taper([[0, 10], [0, 160], [0, 280]], [22, 14, 20], { fill: P.iron }),
    blob([[-84, 289], [84, 289], [46, 272], [-46, 272]], { fill: P.iron }),
    rect(-180, -8, 360, 18, { r: 7, fill: lin(90, '#fffdf8', P.marble, '#d8cdbd'), hl: 0.4 }),
    rect(-170, 10, 340, 7, { fill: '#a89a86', shade: 0, hl: 0, alpha: 0.6 }),
  ]);

const chair = (x, flip = false, col = P.wood) =>
  G({ x, y: SEAT + 8, flip, fill: col, shade: 0.35, hl: 0.25 }, [
    taper([[-46, 10], [-50, 90], [-56, 164]], [11, 9]),
    taper([[44, 10], [46, 90], [52, 164]], [11, 9]),
    line([[-48, 110], [46, 110]], { stroke: darken(col, 0.05), lw: 7 }),
    line([[-48, 4], [-68, -100], [-62, -198], [-34, -216], [-36, -110], [-38, 4]], { stroke: col, lw: 11 }),
    rect(-62, -2, 124, 16, { r: 6 }),
  ]);

const book = (p = {}) => G(p, [rect(-14, -56, 28, 112, { r: 4, fill: '#a33b3b', shade: 0.4, hl: 0.3 }), rect(-6, -52, 17, 104, { fill: '#f3ecdc', shade: 0.2 }), ...rep(5, i => line([[-4, -44 + i * 22], [9, -44 + i * 22]], { stroke: '#d9cdb5', lw: 1.5 }))]);

// ------------------------------------------------------------------ sala
const frameRect = (x, y, w, h, ix, iy, iw, ih) => `M${x} ${y}h${w}v${h}h${-w}Z M${ix} ${iy}h${iw}v${ih}h${-iw}Z`;
const WIN = [600, 100, 1220, 580]; // janela: x, y, w, h
const WAIN = 700; // topo do lambri

const outside = () =>
  G([
    rect(-800, -600, 4000, 1500, { fill: lin(90, '#566b82', '#7d8fa0', '#93a1ac'), shade: 0, hl: 0 }),
    ...scatter(14, 3, (r, i) => {
      const w = r.range(150, 230), h = r.range(420, 600), x = -200 + i * 190 + r.range(-20, 20), y = 780;
      const col = r.pick(['#9c5552', '#a7765a', '#5f7a83', '#a38f62', '#7f5c66', '#56706a']);
      return G({ x, y }, [
        blob([[-w / 2, 0, 0], [-w / 2, -h, 0], [-w * 0.25, -h - 40, 0], [0, -h - 90, 0], [w * 0.25, -h - 40, 0], [w / 2, -h, 0], [w / 2, 0, 0]], { fill: col, shade: 0.3 }),
        ...rep(4, k => rep(2, c => {
          const lit = r() < 0.55;
          return rect(-w * 0.32 + c * w * 0.38, -h + 40 + k * 110, w * 0.24, 72, { r: 6, fill: lit ? '#ffd88a' : '#4a5966', shade: 0, hl: 0 });
        })),
      ]);
    }),
    rect(-800, 780, 4000, 400, { fill: lin(90, '#3e4852', '#2b333b'), shade: 0, hl: 0 }),
    particles({ seed: 2, rate: 320, life: [0.6, 0.9], at: [1000, -300], area: [3600, 100], dir: 100, spread: 4, speed: [1500, 1800], size: [1.5, 2.6], stretch: 1.8, color: '#dfe9ef', alphaVar: 0.5, fadeIn: 0.05, fadeOut: 0.1 }),
  ]);

const lamp = (x, len, phase = 0) =>
  G({ x, y: -420, rot: osc(0.18, 0.8, phase), px: 0, py: 0 }, [
    line([[0, 0], [0, len]], { stroke: '#2a2224', lw: 4 }),
    G({ y: len }, [
      circle(0, 34, 34, { fill: '#fff4cf', glow: { r: 80, a: 0.85, c: '#ffcf7a' }, shade: 0, hl: 0 }),
      blob([[-74, 40], [-60, 6], [-22, -14], [22, -14], [60, 6], [74, 40]], { fill: lin(90, '#e2aa52', P.brass, '#8f6324'), shade: 0.4, hl: 0.5 }),
    ]),
  ]);

const lightPool = (x, y, r, a = 0.35) => circle(x, y, r, { fill: rad(null, '#ffd08ccc', '#ffb86a55', '#ffb86a00'), blend: 'screen', alpha: a, shade: 0, hl: 0 });

const plant = (x, y, s, seed) =>
  G({ x, y, s }, [
    ...scatter(10, seed, (r, i) => {
      const a = -160 + i * 14 + r.range(-6, 6), L = r.range(150, 240);
      const tip = [Math.cos(a * D) * L, Math.sin(a * D) * L - 60];
      return G({ rot: osc(0.3, 2, r()), px: 0, py: -60 }, [taper([[0, -60], [tip[0] * 0.5, tip[1] * 0.6 - 20], tip], [0, 40, 0], { fill: i % 2 ? P.plant : P.plant2, shade: 0.45, hl: 0.35 })]);
    }),
    blob([[-62, -64], [62, -64], [50, 40, 0.4], [-50, 40, 0.4]], { fill: P.pot, shade: 0.45, hl: 0.3, tex: { k: 'speckle', a: 0.3 } }),
    rect(-68, -76, 136, 22, { r: 6, fill: '#c46e48', shade: 0.4 }),
  ]);

const shelf = (x, y, w, seed) =>
  G({ x, y }, [
    rect(0, 0, w, 16, { fill: P.wood, shade: 0.4 }),
    ...scatter(Math.floor(w / 70), seed, (r, i) => {
      const k = r.int(0, 2), cx = 34 + i * 70 + r.range(-8, 8);
      if (k === 0) return blob([[cx - 18, 0], [cx - 18, -62], [cx - 10, -74], [cx + 10, -74], [cx + 18, -62], [cx + 18, 0]], { fill: r.pick(['#d9b06a', '#8fae9c', '#c98a6a']) });
      if (k === 1) return G([rect(cx - 22, -48, 44, 48, { r: 8, fill: '#f1ebe0' }), ellipse(cx, -48, 22, 5, { fill: '#e0d6c6', shade: 0 })]);
      return G([ellipse(cx, -20, 24, 22, { fill: '#c0674a' }), ...rep(5, j => taper([[cx, -34], [cx - 32 + j * 16, -86]], [9, 0], { fill: P.plant2 }))]);
    }),
  ]);

const chalkboard = (x, y) =>
  G({ x, y }, [
    rect(-170, -130, 340, 260, { r: 6, fill: P.chalk, stroke: '#7a4a2e', lw: 14, tex: { k: 'blot', a: 0.5 }, shade: 0.2 }),
    // desenho a giz (sem letras): xícara fumegante e um bolo
    G({ x: -70, y: 10, shade: 0, hl: 0 }, [
      line([[-40, -10], [40, -10], [32, 40], [-32, 40], [-40, -10]], { stroke: '#efe9dc', lw: 5, round: 0 }),
      line([[40, 0], [58, 4], [56, 22], [36, 26]], { stroke: '#efe9dc', lw: 5 }),
      ...[-14, 6].map(x => line([[x, -24], [x + 8, -44], [x - 2, -62], [x + 6, -80]], { stroke: '#efe9dc', lw: 4 })),
    ]),
    G({ x: 80, y: 20, shade: 0, hl: 0 }, [
      line([[-46, 30], [46, 30], [46, -6], [-46, -6], [-46, 30]], { stroke: '#f2c4c4', lw: 5, round: 0 }),
      line([[-46, 8], [46, 8]], { stroke: '#efe9dc', lw: 4 }),
      circle(0, -20, 9, { fill: '#e46a6a', shade: 0, hl: 0 }),
    ]),
    line([[-130, -90], [130, -90]], { stroke: '#efe9dc', lw: 4, dash: [18, 12] }),
  ]);

const counter = x =>
  G({ x, y: FLOOR }, [
    rect(-380, -330, 760, 330, { fill: lin(90, '#6a3a2a', '#4a271c'), tex: { k: 'brush', a: 0.3, rot: 90 }, shade: 0.3 }),
    ...rep(4, i => rect(-350 + i * 180, -300, 150, 260, { r: 4, fill: '#ffffff00', stroke: '#7c4a36', lw: 6, shade: 0, hl: 0 })),
    rect(-400, -352, 800, 26, { r: 6, fill: lin(90, '#fbf7ef', '#d9cfbf'), hl: 0.4 }),
    // máquina de espresso (cromo, 2 grupos com porta-filtro, manômetro, vaporizador)
    G({ x: -120, y: -352 }, [
      rect(-120, -200, 240, 200, { r: 18, fill: lin(0, '#7f868e', '#eef2f5', '#c9cfd4', '#8a9199'), hl: 0.5, shade: 0.35 }),
      rect(-130, -224, 260, 32, { r: 10, fill: '#b0302c', shade: 0.3, hl: 0.4 }),
      rect(-100, -170, 200, 40, { r: 8, fill: '#3b3f45', shade: 0 }),
      circle(0, -100, 16, { fill: '#f6f1e2', stroke: '#585f66', lw: 4, shade: 0.2 }),
      line([[0, -100], [8, -108]], { stroke: '#b0302c', lw: 2.5 }),
      ...[-62, 62].map(x => G({ x, y: -70 }, [
        rect(-18, -6, 36, 22, { r: 6, fill: '#c9cfd4', shade: 0.3, hl: 0.5 }),
        taper([[0, 22], [x > 0 ? 30 : -30, 30], [x > 0 ? 70 : -70, 34]], [12, 10, 9], { fill: '#1e1c20', shade: 0.2 }),
      ])),
      taper([[110, -60], [124, -20], [118, 10]], [7, 6, 5], { fill: '#aeb5bb', shade: 0.3 }),
      rect(-90, -26, 180, 14, { r: 5, fill: '#3b3f45', shade: 0 }),
      G({ x: -62, y: -10 }, [cup(21, false)]), G({ x: 62, y: -10 }, [cup(22, false)]),
      G({ x: 0, y: -224 }, [steam(5, 160)]),
    ]),
    G({ x: 220, y: -352 }, [rect(-60, -110, 120, 110, { r: 10, fill: '#ffffff30', stroke: '#e9e2d4', lw: 4, shade: 0, hl: 0 }), ...rep(3, i => circle(-30 + i * 30, -30, 22, { fill: ['#c98445', '#e3b45e', '#a55a3a'][i], shade: 0.4 }))]),
  ]);

const room = (extra = [], back = []) => [
  layer({ z: 4 }, [outside()]),
  layer({ z: 1.5 }, [
    path(frameRect(-900, -800, 4400, 1900, ...WIN), { rule: 'evenodd', fill: lin(90, '#b45d47', P.wall, P.wallD), shade: 0, hl: 0, tex: { k: 'blot', a: 0.5 } }),
    G({ clip: path(frameRect(-900, -800, 4400, 1500, ...WIN), { rule: 'evenodd' }) }, rep(60, i => rect(-900 + i * 74, -800, 30, 1600, { fill: '#7d2e24', alpha: 0.13, shade: 0, hl: 0 }))),
    rect(-900, WAIN, 4400, FLOOR - WAIN, { fill: lin(90, P.panel, P.wainscot), shade: 0, hl: 0, tex: { k: 'brush', a: 0.3 } }),
    ...rep(20, i => rect(-880 + i * 220, WAIN + 40, 180, FLOOR - WAIN - 80, { r: 4, fill: '#ffffff00', stroke: '#6d3e2e', lw: 6, shade: 0, hl: 0 })),
    rect(-900, WAIN - 14, 4400, 22, { fill: '#3a1f17', shade: 0.3, hl: 0.5 }),
    lightPool(560, -40, 420, 0.5), lightPool(1210, -110, 380, 0.45), lightPool(1860, -40, 420, 0.5),
    // janela: moldura de madeira, reflexo e gotas
    G({ fill: P.frame, shade: 0.3, hl: 0.35 }, [
      rect(WIN[0] - 30, WIN[1] - 30, WIN[2] + 60, 32), rect(WIN[0] - 44, WIN[1] + WIN[3] - 6, WIN[2] + 88, 40),
      rect(WIN[0] - 30, WIN[1] - 30, 32, WIN[3] + 60), rect(WIN[0] + WIN[2] - 2, WIN[1] - 30, 32, WIN[3] + 60),
      rect(WIN[0] + WIN[2] / 2 - 12, WIN[1], 24, WIN[3]), rect(WIN[0], WIN[1] + WIN[3] * 0.36, WIN[2], 18),
    ]),
    G({ clip: rect(...WIN) }, [
      rect(...WIN, { fill: lin(60, '#ffffff00', '#ffffff26', '#ffffff00', '#ffffff1c', '#ffffff00'), shade: 0, hl: 0, blend: 'screen' }),
      particles({ seed: 9, rate: 18, life: [1.5, 3], at: [WIN[0] + WIN[2] / 2, WIN[1] + WIN[3] / 2], area: [WIN[2], WIN[3]], dir: 90, spread: 6, speed: [20, 90], size: [2.4, 5], stretch: 2, color: '#e9f4fa', alphaVar: 0.5 }),
    ]),
    shelf(-640, 330, 440, 5), shelf(2020, 300, 440, 8),
    chalkboard(2240, 520),
    rect(-900, FLOOR - 10, 4400, 700, { fill: P.floorA, shade: 0, hl: 0 }),
    ...rep(3, row => rep(46, i => rect(-900 + i * 96 + (row % 2) * 48, FLOOR - 10 + [0, 34, 80][row], 48, [34, 46, 70][row], { fill: P.floorB, shade: 0, hl: 0 }))),
    rect(-900, FLOOR - 10, 4400, 160, { fill: lin(90, '#3a1e1888', '#3a1e1800'), shade: 0, hl: 0 }),
  ]),
  ...back,
  layer({ z: 1.15 }, [lamp(560, 300, 0.1), lamp(1210, 230, 0.4), lamp(1860, 300, 0.7)]),
  ...extra,
];

// ------------------------------------------------------------------ personagens (base anatômica: pessoa())
const TX = 1210; // mesa
const M = {
  sexo: 'm', altura: 740, cabecas: 6.2, barba: 'curta', oculos: true, cabelo: 'curto', pele: P.skinM, corCabelo: P.hairM, roupa: 'jaqueta',
  cores: { cima: P.jacket, baixo: P.pants, sapato: P.shoes, detalhe: P.shirt },
  skin: [{ bone: 'tronco', node: blob([[30, -168], [44, -170], [42, -158], [32, -158]], { fill: '#e8b04c', shade: 0.2 }) }],
};
const W = { sexo: 'f', altura: 700, cabecas: 6.2, cabelo: 'ondulado', pele: P.skinW, corCabelo: P.hairW, roupa: 'vestido', cores: { cima: P.dress, baixo: P.dress, sapato: P.shoesW, detalhe: P.collar } };
const HIP_M = pessoa.quadril(M), HIP_W = pessoa.quadril(W);
const SOLE_M = pessoa.sola(M), SOLE_W = pessoa.sola(W);
const SEAT_TOP = SEAT + 8;
const SIT_Y = (o, hip) => SEAT_TOP - 0.052 * o.altura; // articulação do quadril ~5% da altura acima do assento
const xicara = (seed, hot = true) => G({ x: -6, y: 4 }, [cup(seed, hot)]);
const livro = () => G({ rot: -90, x: 10 }, [book()]);

// ela, sentada à mesa olhando para a esquerda (flip). Alvos IK em coords do rig (voltado para +x).
const W_SIT = { x: TX + 250, y: SIT_Y(W) };
const ankleW = FLOOR - SOLE_W - W_SIT.y;
const woman = (o = {}) =>
  pessoa({
    ...W, name: 'ela', x: W_SIT.x, y: W_SIT.y, flip: true, ground: FLOOR,
    pose: { tronco: o.tronco ?? -82, pescoco: o.pescoco ?? 0, cabeca: o.cabeca ?? 0 },
    ik: { peN: [150, ankleW], peF: [118, ankleW], maoN: o.maoN ?? [150, -130], angMaoN: o.angMaoN ?? 10, maoF: o.maoF ?? [175, -128], angMaoF: o.angMaoF ?? 0 },
    rosto: { piscar: 3, sorriso: o.sorriso ?? 0.3, fala: o.fala ?? 0, sobrancelha: o.sobrancelha ?? 0, olhar: o.olhar ?? 0 },
    segura: o.segura,
  });

// ------------------------------------------------------------------ plano 1: ele chega (caminhada anatômica)
const PASSO = 0.36 * M.altura, DUTY = 0.6;
const WALK1 = TX - 430; // para onde o plano 2 começa (ele em pé ao lado da mesa)
const WALK0 = WALK1 - (2 + 0.5) * (PASSO / DUTY); // 2,5 ciclos: termina com os dois pés no chão
const manX = kf([0.6, WALK0], [4.8, WALK1, 'sine']);
const passos = caminhada(M, { x: manX, chao: FLOOR, passo: PASSO, duty: DUTY });
const walker = pessoa({
  ...M, name: 'ele andando', ground: FLOOR, x: t => manX.at(t), ...passos,
  pose: { ...passos.pose, cabeca: t => -3 + 5 * smooth(4.6, 5.6, t) },
  ik: { ...passos.ik, maoN: [70, -110], angMaoN: -6 },
  rosto: { piscar: 7, sorriso: t => 0.1 + 0.5 * smooth(5, 6, t) },
  segura: { N: xicara(1) },
});
const shot1 = scene({
  dur: 7,
  bg: '#20141c',
  look,
  camera: { x: kf([0, 620], [7, 960]), y: 560, zoom: kf([0, 0.74], [7, 0.8]), dof: 4, focus: 1 },
  layers: room(
    [
      layer({ z: 1 }, [
        chair(TX + 260, true), table(TX), G({ x: TX + 60, y: TABLE - 8 }, [cup(4)]),
        woman({ maoN: [118, -150], angMaoN: -60, maoF: [126, -138], cabeca: kf([0, 18], [5.2, 18], [6, 0]), sorriso: kf([0, 0.2], [5.6, 0.2], [6.4, 0.7]), segura: { N: livro() } }),
        chair(TX - 260, false), walker,
      ]),
      layer({ z: 0.55 }, [plant(-560, FLOOR + 80, 1.7, 2), plant(2500, FLOOR + 120, 1.9, 4)]),
    ],
    [layer({ z: 1.2 }, [counter(-60)])],
  ),
  fadeIn: 0.8,
});

// ------------------------------------------------------------------ plano 2: "posso sentar?"
const M_STAND = { x: TX - 430, y: FLOOR - HIP_M + 3 };
const standing = pessoa({
  ...M, name: 'ele em pé', x: M_STAND.x, y: M_STAND.y, ground: FLOOR,
  pose: { tronco: -87, cabeca: kf([0, 0], [0.6, 4], [3, 2], [4, 6]) },
  ik: {
    peN: [36, FLOOR - SOLE_M - M_STAND.y], peF: [-34, FLOOR - SOLE_M - M_STAND.y],
    maoN: [70, -110], angMaoN: -6,
    maoF: kf([0, [8, 26]], [0.8, [150, -110], 'back'], [2.6, [156, -100]], [3.4, [8, 26]]), angMaoF: kf([0, 72], [0.8, -10], [2.6, -10], [3.4, 72]),
  },
  rosto: { piscar: 7, fala: t => talk(t, 0.6, 2.3, 1), sorriso: kf([0, 0.2], [2.4, 0.3], [3.4, 0.8]), sobrancelha: kf([0, 0], [0.7, 1], [2.2, 0.3]) },
  segura: { N: xicara(2) },
});
const shot2 = scene({
  dur: 6,
  bg: '#20141c',
  look,
  camera: { x: kf([0, 1060], [6, 1100]), y: 600, zoom: kf([0, 1.12], [6, 1.2]), dof: 6 },
  layers: room([
    layer({ z: 1 }, [
      chair(TX + 260, true), chair(TX - 260, false), table(TX), G({ x: TX + 70, y: TABLE - 8 }, [cup(4)]),
      woman({
        cabeca: kf([0, 18], [2.3, 18], [2.9, -4, 'back']), sorriso: kf([0, 0.15], [2.6, 0.2], [3.2, 1]), fala: t => talk(t, 3.3, 4.8, 4), sobrancelha: kf([2.4, 0], [2.8, 1], [4, 0.4]),
        maoN: kf([0, [118, -150]], [2.4, [118, -150]], [3, [176, -112]]), angMaoN: kf([2.4, -60], [3, 0]),
        maoF: kf([0, [126, -138]], [2.4, [126, -138]], [3, [190, -114]]),
        segura: { N: G({ show: [0, 3] }, [livro()]) },
      }),
      G({ show: [3, 99], x: TX + 110, y: TABLE - 6, rot: 90 }, [book()]),
      standing,
    ]),
    layer({ z: 0.5 }, [plant(-60, FLOOR + 160, 2.2, 6)]),
  ]),
});

// ------------------------------------------------------------------ plano 3: a conversa
const M_SIT = { x: TX - 250, y: SIT_Y(M) };
const ankleM = FLOOR - SOLE_M - M_SIT.y;
const sipT = [4.6, 5.8];
const sitting = pessoa({
  ...M, name: 'ele sentado', x: M_SIT.x, y: M_SIT.y, ground: FLOOR,
  pose: { tronco: kf([0, -82], [2.8, -78], [4, -84]), cabeca: t => 3 * Math.sin(t * 1.4) * (t < 2.6 ? 1 : 0.4) - 6 * smooth(2.6, 3, t) * (1 - smooth(3.8, 4.3, t)) },
  ik: {
    peN: [152, ankleM], peF: [120, ankleM],
    maoN: kf([0, [178, -118]], [sipT[0], [178, -118]], [sipT[0] + 0.5, [104, -236]], [sipT[1], [104, -236]], [sipT[1] + 0.5, [178, -118]]),
    angMaoN: kf([0, -4], [sipT[0], -4], [sipT[0] + 0.5, -48], [sipT[1], -48], [sipT[1] + 0.5, -4]),
    maoF: kf([0, [150, -40]], [0.6, [176, -200], 'back'], [1.6, [160, -186]], [2.4, [150, -40]]), angMaoF: kf([0, 20], [0.6, -50], [1.6, -30], [2.4, 20]),
  },
  rosto: { piscar: 7, fala: t => talk(t, 0.4, 2.5, 9), sorriso: kf([0, 0.4], [2.7, 0.5], [3.1, 1]), sobrancelha: t => 0.6 * Math.max(0, Math.sin(t * 2.3)) },
  segura: { N: xicara(5) },
});
const shot3 = scene({
  dur: 7.5,
  bg: '#20141c',
  look: { ...look, bloom: 0.32 },
  camera: { x: kf([0, 1200], [7.5, 1215]), y: kf([0, 660], [7.5, 640]), zoom: kf([0, 1.3], [7.5, 1.5]), dof: 7 },
  layers: room([
    layer({ z: 1 }, [
      chair(TX + 260, true), chair(TX - 260, false), table(TX),
      book({ x: TX + 110, y: TABLE - 6, rot: 90 }),
      G({ x: TX + 70, y: TABLE - 8 }, [cup(4)]),
      woman({
        tronco: kf([0, -76], [2.8, -76], [3.2, -86], [4.2, -78]),
        cabeca: t => 4 - 12 * smooth(2.7, 3.1, t) * (1 - smooth(4, 4.6, t)) + 2 * Math.sin(t * 1.1),
        sorriso: kf([0, 0.6], [2.7, 0.7], [3.0, 1]), fala: t => talk(t, 2.8, 3.9, 13, 13) * 0.8 + talk(t, 5.8, 7, 3),
        maoN: kf([0, [172, -112]], [2.7, [172, -112]], [3, [74, -118]], [4.2, [74, -118]], [4.6, [172, -112]]), angMaoN: kf([0, 0], [2.7, 0], [3, -65], [4.2, -65], [4.6, 0]),
        maoF: [186, -114],
      }),
      sitting,
      particles({ seed: 3, rate: 2, t0: 3, t1: 6, life: [2, 3], at: [TX, TABLE - 160], area: 80, dir: -90, spread: 50, speed: [20, 40], size: [6, 9], color: '#ff9a9a', alphaVar: 0.3,
        shape: p => G({ s: p.size / 10, rot: p.r * 30 - 15 }, [blob([[0, 8], [-10, -2, 0.8], [-6, -10], [0, -5, 0], [6, -10], [10, -2, 0.8]], { fill: '#ff8d8d', shade: 0.3, hl: 0.4 })]) }),
    ]),
    layer({ z: 0.5 }, [plant(420, FLOOR + 260, 2, 9), plant(2050, FLOOR + 300, 2.1, 11)]),
  ]),
  fadeOut: 1,
});

export default film([shot1, shot2, shot3], { trans: 'cross', d: 0.6 });
