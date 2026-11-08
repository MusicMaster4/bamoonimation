// Benchmark 2 — Um casal se conhecendo numa cafeteria (tarde de chuva).
// 3 planos: ele chega (andar com IK) -> "posso sentar?" -> conversa, risos, café.
import {
  scene, film, layer, G, blob, ellipse, circle, rect, path, taper, line, limb, particles, rays, dyn, text, lin, rad,
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

// ------------------------------------------------------------------ cabeça (perfil voltado p/ +x)
const FACE_M = [[-24, 2], [-36, -30], [-52, -80], [-34, -132], [6, -150], [44, -134], [58, -106], [62, -86, 0.6], [58, -77], [64, -70], [80, -53, 0.5], [67, -44, 0.4], [69, -37], [65, -32, 0.3], [68, -27], [61, -21, 0.6], [65, -11, 0.8], [44, 0], [22, 4]];
const FACE_W = [[-22, 2], [-34, -30], [-50, -80], [-32, -130], [6, -148], [42, -132], [55, -106], [58, -88, 0.6], [55, -78], [61, -71], [72, -57, 0.5], [70, -51, 0.3], [62, -47, 0.4], [65, -40], [62, -35, 0.3], [65, -30], [58, -24, 0.6], [60, -14, 0.9], [40, -2], [20, 4]];
const EYE = [[-7, 0], [-1, -4.8], [7, -1.6, 0.4], [1, 3.4]];

const eye = (x, y, skin, seed, lash, look = 0) =>
  G({ x, y, s: 1.2 }, [
    blob(EYE, { fill: '#fbf6ee', shade: 0, hl: 0 }),
    G({ clip: blob(EYE) }, [
      circle(t => 3 + V(look, t), -0.6, 4, { fill: '#3b2620', shade: 0, hl: 0 }),
      circle(t => 4.3 + V(look, t), -1.9, 1.2, { fill: '#fff', shade: 0, hl: 0 }),
      rect(-10, -7, 20, 15, { fill: skin, shade: 0, hl: 0, py: -7, sy: t => blink(t, seed) }),
    ]),
    taper(t => {
      const b = blink(t, seed);
      return [[-8, -0.4 + b * 4], [0, -5.2 + b * 7], [8.5, -2 + b * 3]];
    }, [1, 2.8, 1.8], { fill: '#2a1915', shade: 0, hl: 0 }),
    lash && taper([[6, -3], [10, -6], [13, -6.5]], [2, 1.2, 0.4], { fill: '#2a1915', shade: 0, hl: 0 }),
  ]);

const mouth = (x, y, o) =>
  G({ x, y }, [
    ellipse(-1, 1.5, 4.2, t => 0.3 + 4.5 * V(o.talk, t), { fill: '#5b2323', shade: 0, hl: 0 }),
    taper(t => {
      const s = V(o.smile, t) ?? 0;
      return [[-10, -0.5 - s * 5], [-4, 1.5 - s * 1.5], [2, 0.5]];
    }, [1, 2.2, 1], { fill: '#4a2620', shade: 0, hl: 0 }),
  ]);

function headM(o) {
  const skin = P.skinM;
  return G([
    blob(FACE_M, { fill: skin, shade: 0.42, hl: 0.25 }),
    ellipse(-6, -70, 11, 17, { fill: skin, shade: 0.5 }),
    taper([[-8, -78], [-2, -70], [-6, -62]], [2, 3, 1], { fill: '#b9805f', shade: 0, hl: 0 }),
    blob([[-6, -56], [18, -40], [44, -30], [60, -27], [66, -12], [52, 1], [26, 3], [2, -12]], { fill: P.hairM, alpha: 0.6, shade: 0, hl: 0, tex: { k: 'speckle', a: 0.5 } }),
    blob([[55, -42], [68, -41], [67, -35.5], [56, -36]], { fill: P.hairM, alpha: 0.85, shade: 0, hl: 0 }),
    ellipse(42, -54, 14, 8, { fill: '#e07a64', alpha: 0.22, blur: 5, shade: 0, hl: 0 }),
    eye(48, -77, skin, o.seed, false, o.look),
    taper([[36, -91], [49, -96], [62, -91]], [2, 6, 2], { fill: P.hairM, shade: 0, hl: 0, y: t => -2.5 * (V(o.brow, t) ?? 0) }),
    mouth(64, -32, o),
    blob([[-30, -40], [-52, -84], [-40, -140], [2, -164], [48, -152], [66, -124], [57, -106], [34, -124], [8, -120], [-8, -106], [-16, -80], [-22, -52]], { fill: P.hairM, shade: 0.35, hl: 0.3 }),
    blob([[-30, -128], [0, -152], [40, -146], [10, -140], [-18, -124]], { fill: '#5e463d', shade: 0, hl: 0 }),
    rect(36, -89, 28, 21, { r: 7, fill: '#ffffff18', stroke: '#2b1d1a', lw: 3.4, shade: 0, hl: 0 }),
    line([[36, -80], [10, -78], [-4, -74]], { stroke: '#2b1d1a', lw: 3 }),
  ]);
}

function headW(o) {
  const skin = P.skinW;
  return G([
    // cachos da nuca (atrás do rosto)
    ...[[-62, -20, 16], [-40, -8, 15], [-78, -46, 15], [-16, -4, 13]].map(([x, y, r]) => circle(x, y, r, { fill: P.hairW, shade: 0.45, hl: 0.2 })),
    blob([[4, -14], [-30, -6, 0.7], [-60, -24], [-70, -60], [-40, -60], [-10, -40]], { fill: P.hairW, shade: 0.4 }),
    blob(FACE_W, { fill: skin, shade: 0.38, hl: 0.25 }),
    ellipse(38, -52, 15, 9, { fill: '#e8735f', alpha: t => 0.25 + 0.2 * (V(o.smile, t) ?? 0), blur: 5, shade: 0, hl: 0 }),
    blob([[62, -47], [66, -46], [63, -41], [65, -38], [61, -35], [65, -31], [59, -25], [55, -32], [57, -41]], { fill: P.lips, shade: 0, hl: 0 }),
    eye(45, -78, skin, o.seed, true, o.look),
    taper([[34, -92], [46, -97], [58, -93]], [1.5, 4.2, 1.5], { fill: '#4a2416', shade: 0, hl: 0, y: t => -2.5 * (V(o.brow, t) ?? 0) }),
    mouth(61, -36, o),
    // volume do cabelo cobrindo o crânio (deixa testa e orelha à mostra)
    blob([[-10, -46], [-48, -30, 0.7], [-78, -64], [-82, -112], [-62, -152], [-20, -176], [30, -170], [62, -150], [72, -122], [64, -100], [52, -112], [30, -122], [6, -118], [-8, -102], [-14, -84], [-6, -64]], { fill: P.hairW, shade: 0.42, hl: 0.25 }),
    blob([[-52, -136], [-24, -162], [18, -164], [44, -152], [12, -152], [-20, -150], [-44, -128]], { fill: P.hairWHi, alpha: 0.85, shade: 0, hl: 0 }),
    blob([[-74, -96], [-70, -126], [-56, -140], [-62, -118], [-66, -96]], { fill: P.hairWHi, alpha: 0.7, shade: 0, hl: 0 }),
    blob([[-6, -120], [14, -150], [48, -156], [70, -132], [70, -106], [58, -96], [52, -114], [34, -128], [10, -130]], { fill: P.hairW, shade: 0.35, hl: 0.3 }),
    ellipse(-2, -70, 10, 15, { fill: skin, shade: 0.5 }),
    taper([[-4, -78], [2, -70], [-2, -62]], [1.5, 2.5, 1], { fill: '#c98a68', shade: 0, hl: 0 }),
    line([[-1, -56], [-1, -50]], { stroke: '#c9a03e', lw: 1.5 }),
    circle(-1, -47, 3.2, { fill: '#ecc04f', shade: 0, hl: 0.6 }),
  ]);
}

// ------------------------------------------------------------------ corpo (perfil voltado p/ +x, origem no quadril)
const JACKET = [[-50, 26], [-58, -50], [-54, -150], [-42, -232], [-8, -264], [32, -262], [58, -242], [64, -186], [60, -110], [56, -30], [46, 30]];
const DRESS = [[-42, 24], [-48, -50], [-44, -150], [-34, -224], [-8, -252], [24, -252], [46, -232], [58, -188, 0.6], [48, -148], [36, -112], [38, -60], [46, 24]];
const HAND = [[-4, -9], [12, -11], [26, -8, 0.6], [30, 1], [24, 8], [6, 10], [-4, 8]];
const hand = (skin, p = {}) => G({ s: 1.25, ...p }, [blob(HAND, { fill: skin, shade: 0.4 }), taper([[4, -8], [14, -17], [22, -15]], [8, 6, 4], { fill: skin, shade: 0.3 })]);
const SHOE_M = [[-18, -11], [8, -15], [46, -6, 0.6], [50, 7], [-20, 9]];
const SHOE_W = [[-12, -8], [8, -10], [38, -3, 0.6], [40, 4], [-2, 4], [-10, 17], [-16, 17], [-16, 4]];
const LEG = [170, 168];

const rotP = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

/**
 * Personagem. o.kind 'm'|'w'; o.x/o.y = quadril; o.flip vira para -x.
 * Funções de t: lean (graus), headRot, talk, smile, brow, look; armN/armF = alvos das mãos (relativos ao quadril);
 * footN/footF = alvos dos pés; o.handN/handF = nó extra na mão (xícara, livro); o.sit = sentado (saia cobre a coxa).
 */
function person(o) {
  const m = o.kind === 'm';
  const skin = m ? P.skinM : P.skinW;
  const H = (m ? headM : headW)(o);
  return G({ x: o.x, y: o.y, flip: o.flip }, [
    dyn(t => {
      const lean = (V(o.lean, t) ?? 0) * D;
      const sh = rotP([8, -232], lean);
      const tN = V(o.armN, t), tF = V(o.armF, t), fN = V(o.footN, t), fF = V(o.footF, t);
      const leg = (f, near) => limb([near ? 8 : -6, 0], f, LEG, m ? [74, 56, 40] : [58, 42, 26], {
        fill: m ? (near ? P.pants : darken(P.pants, 0.06)) : near ? skin : darken(skin, 0.08), bend: 1, endAbs: 0,
        end: blob(m ? SHOE_M : SHOE_W, { fill: m ? P.shoes : P.shoesW, y: -4 }),
      });
      const arm = (tg, near, extra) => {
        const a = [sh[0] + (near ? 0 : -16), sh[1] + (near ? 0 : 6)];
        const col = m ? (near ? P.jacket : darken(P.jacket, 0.08)) : near ? skin : darken(skin, 0.08);
        const { j } = ik2(a, tg, 120, 112, -1);
        return G([
          limb(a, tg, [120, 112], m ? [50, 40, 30] : [36, 28, 20], { fill: col, bend: -1, end: hand(near ? skin : darken(skin, 0.08), { x: 2 }), endRot: V(o.handRot, t) ?? 0 }),
          m && G({ x: tg[0], y: tg[1] }, [circle(0, 0, 14, { fill: P.shirt, shade: 0.3 })]),
          !m && taper([a, [lerp(a[0], j[0], 0.5), lerp(a[1], j[1], 0.5)]], [52, 44], { fill: near ? P.dress : darken(P.dress, 0.06), caps: 'flat' }),
          extra && G({ x: tg[0], y: tg[1] }, [extra]),
        ]);
      };
      // saia (sentada): cobre as coxas até o joelho
      let skirt = null;
      if (!m && o.sit) {
        const k = ik2([8, 0], fN, LEG[0], LEG[1], 1).j;
        skirt = blob([[-44, -46], [-52, 24, 0.7], [-10, 44], [k[0] - 20, k[1] + 32], [k[0] + 14, k[1] + 26, 0.6], [k[0] + 26, k[1] - 2], [k[0] + 4, k[1] - 30], [48, -40]], { fill: P.dress, shade: 0.42, tex: { k: 'brush', a: 0.16, s: 0.8 } });
      }
      return G([
        leg(fF, false),
        arm(tF, false, o.handF),
        G({ rot: lean / D }, [
          taper([[14, -244], [16, -272], [18, -292]], [m ? 46 : 38, m ? 42 : 34], { fill: skin, shade: 0.5 }),
          blob(m ? JACKET : DRESS, { fill: m ? P.jacket : P.dress, tex: { k: 'brush', a: 0.18, s: 0.8 }, shade: 0.45 }),
          m ? G([
            blob([[12, -268], [36, -264], [34, -234], [22, -250]], { fill: P.shirt, shade: 0.2 }),
            taper([[28, -256], [44, -212], [54, -150]], [7, 6, 1], { fill: '#3c4b6c', shade: 0, hl: 0 }),
            blob([[34, -210], [50, -212], [48, -200], [36, -200]], { fill: '#e8b04c', shade: 0.2 }),
            taper([[-40, -60], [0, -64], [50, -62]], [0, 5, 0], { fill: '#3c4b6c', shade: 0, hl: 0 }),
          ]) : G([
            blob([[-12, -254], [28, -254], [40, -236], [18, -230], [0, -240]], { fill: P.collar, shade: 0.25 }),
            taper([[-44, -104], [0, -108], [36, -112]], [8, 8, 7], { fill: '#1f625d', shade: 0, hl: 0 }),
          ]),
          G({ x: 18, y: -288, rot: t => V(o.headRot, t) ?? 0, px: 0, py: -30, s: 0.9 }, [H]),
        ]),
        skirt,
        leg(fN, true),
        arm(tN, true, o.handN),
      ]);
    }),
  ]);
}

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
    text('CAFÉ', { y: -70, size: 54, font: 'script', fill: '#f4efe4' }),
    text('expresso · 6\ncapuccino · 9\nbolo do dia · 12', { y: 30, size: 30, font: 'hand', fill: '#e9e4d8', lh: 1.3 }),
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
      text('ESPRESSO', { y: -150, size: 22, font: 'serif', fill: '#e9c27a' }),
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

const room = (extra = []) => [
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
  layer({ z: 1.15 }, [lamp(560, 300, 0.1), lamp(1210, 230, 0.4), lamp(1860, 300, 0.7)]),
  ...extra,
];

// ------------------------------------------------------------------ personagens nos planos
const TX = 1210; // mesa
const W_HIP = [TX + 230, SEAT];
const woman = (o = {}) =>
  person({
    kind: 'w', x: W_HIP[0], y: W_HIP[1], flip: true, sit: true, seed: 3,
    lean: o.lean ?? 8, headRot: o.headRot ?? 0, talk: o.talk ?? 0, smile: o.smile ?? 0.3, brow: o.brow ?? 0, look: o.look ?? 0,
    footN: [150, 168], footF: [120, 168],
    armN: o.armN ?? [150, -150], armF: o.armF ?? [170, -112], handRot: o.handRot ?? 0,
    handN: o.handN, handF: o.handF,
  });

// ------------------------------------------------------------------ plano 1: ele chega
const WALK0 = -500, STRIDE = 150, DUTY = 0.55;
const WALK1 = WALK0 + (4 + 0.525) * (STRIDE / DUTY); // para com os dois pés no chão
const manX = kf([0.4, WALK0], [5.2, WALK1, 'out']);
const walker = person({
  kind: 'm', y: FLOOR - 345, seed: 7,
  x: t => manX.at(t),
  lean: t => 4 * smooth(0.4, 1, t) * (1 - smooth(4.6, 5.3, t)),
  headRot: t => -2 + 5 * smooth(4.4, 5.4, t),
  smile: t => 0.1 + 0.4 * smooth(5, 6, t),
  footN: t => { const [dx, dy] = gait(manX.at(t) - WALK0, { stride: STRIDE, duty: DUTY, lift: 34 }); return [dx + 8, 336 + dy]; },
  footF: t => { const [dx, dy] = gait(manX.at(t) - WALK0, { stride: STRIDE, duty: DUTY, lift: 34, phase: 0.5 }); return [dx - 6, 336 + dy]; },
  armN: [70, -140], handN: heldCup(1),
  armF: t => { const p = gaitPhase(manX.at(t) - WALK0, { stride: STRIDE, duty: DUTY }); const k = 1 - smooth(4.6, 5.4, t); return [-10 + 50 * Math.sin(p * 2 * Math.PI) * k, -10]; },
});
const shot1 = scene({
  dur: 7,
  bg: '#20141c',
  look,
  camera: { x: kf([0, 620], [7, 960]), y: 560, zoom: kf([0, 0.74], [7, 0.8]), dof: 4, focus: 1 },
  layers: room([
    layer({ z: 1.2 }, [counter(-60)]),
    layer({ z: 1 }, [
      chair(TX + 260, true), table(TX), G({ x: TX + 60, y: TABLE - 8 }, [cup(4)]),
      woman({ armN: [128, -160], armF: [150, -150], headRot: kf([0, -14], [5.2, -14], [6, 2]), smile: kf([0, 0.2], [5.6, 0.2], [6.4, 0.7]), handN: book({ x: 6, y: -30, rot: -20 }) }),
      chair(TX - 260, false), G({ x: t => manX.at(t), y: t => FLOOR - 345 - 5 * Math.abs(Math.cos(gaitPhase(manX.at(t) - WALK0, { stride: STRIDE, duty: DUTY }) * 2 * Math.PI)) }, [G({ x: t => -manX.at(t), y: -(FLOOR - 345) }, [walker])]),
    ]),
    layer({ z: 0.55 }, [plant(-560, FLOOR + 80, 1.7, 2), plant(2500, FLOOR + 120, 1.9, 4)]),
  ]),
  captions: [[0.8, 4.2, 'Tarde de chuva. A cafeteria estava lotada...']],
  fadeIn: 0.8,
});

// ------------------------------------------------------------------ plano 2: "posso sentar?"
const M_STAND = [TX - 430, FLOOR - 345];
const standing = person({
  kind: 'm', x: M_STAND[0], y: M_STAND[1], seed: 7,
  lean: 3, headRot: kf([0, 0], [0.6, 4], [3, 2], [4, 6]),
  talk: t => talk(t, 0.6, 2.3, 1), smile: kf([0, 0.2], [2.4, 0.3], [3.4, 0.8]), brow: kf([0, 0], [0.7, 1], [2.2, 0.3]),
  footN: [30, 336], footF: [-30, 336],
  armN: [74, -140], handN: heldCup(2),
  armF: kf([0, [-10, -10]], [0.8, [120, -120], 'back'], [2.6, [130, -110]], [3.4, [-10, -10]]), handRot: kf([0.8, 0], [1.2, -30]),
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
        headRot: kf([0, -14], [2.3, -14], [2.9, 4, 'back']), smile: kf([0, 0.15], [2.6, 0.2], [3.2, 1]), talk: t => talk(t, 3.3, 4.8, 4), brow: kf([2.4, 0], [2.8, 1], [4, 0.4]),
        armN: kf([0, [128, -160]], [2.4, [128, -160]], [3, [150, -122]]), armF: kf([0, [150, -150]], [2.4, [150, -150]], [3, [180, -118]]),
        handN: G({ x: 6, rot: kf([2.4, -20], [3, -80]), y: kf([2.4, -30], [3, -8]) }, [book()]),
      }),
      standing,
    ]),
    layer({ z: 0.5 }, [plant(-60, FLOOR + 160, 2.2, 6)]),
  ]),
  captions: [[0.5, 2.6, '— Com licença... posso sentar aqui?'], [3.2, 5.4, '— Claro! Fique à vontade.']],
});

// ------------------------------------------------------------------ plano 3: a conversa
const M_SIT = [TX - 230, SEAT];
const sipT = [4.6, 5.8];
const sitting = person({
  kind: 'm', x: M_SIT[0], y: M_SIT[1], seed: 7,
  lean: kf([0, 8], [2.8, 12], [4, 6]), headRot: t => 3 * Math.sin(t * 1.4) * (t < 2.6 ? 1 : 0.4) + 6 * smooth(2.6, 3, t) * (1 - smooth(3.8, 4.3, t)),
  talk: t => talk(t, 0.4, 2.5, 9), smile: kf([0, 0.4], [2.7, 0.5], [3.1, 1]), brow: t => 0.6 * Math.max(0, Math.sin(t * 2.3)),
  footN: [150, 168], footF: [120, 168],
  armN: kf([0, [170, -128]], [sipT[0], [170, -128]], [sipT[0] + 0.5, [86, -258]], [sipT[1], [86, -258]], [sipT[1] + 0.5, [170, -128]]),
  handN: G({ x: 14, y: -12, rot: kf([sipT[0] + 0.3, 0], [sipT[0] + 0.6, -28], [sipT[1], -28], [sipT[1] + 0.3, 0]) }, [cup(5)]),
  armF: kf([0, [120, -70]], [0.6, [160, -200], 'back'], [1.6, [130, -180]], [2.4, [120, -70]]), handRot: kf([0.6, -20], [1.6, 10]),
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
        lean: kf([0, 12], [2.8, 12], [3.2, 2], [4.2, 10]),
        headRot: t => -4 + 10 * smooth(2.7, 3.1, t) * (1 - smooth(4, 4.6, t)) + 2 * Math.sin(t * 1.1),
        smile: kf([0, 0.6], [2.7, 0.7], [3.0, 1]), talk: t => talk(t, 2.8, 3.9, 13, 13) * 0.8 + talk(t, 5.8, 7, 3),
        armN: kf([0, [118, -230]], [2.7, [118, -230]], [3, [110, -262]], [4.2, [110, -262]], [4.6, [118, -230]]), handRot: -95,
        armF: [175, -118],
      }),
      sitting,
      particles({ seed: 3, rate: 2, t0: 3, t1: 6, life: [2, 3], at: [TX, TABLE - 160], area: 80, dir: -90, spread: 50, speed: [20, 40], size: [6, 9], color: '#ff9a9a', alphaVar: 0.3,
        shape: p => G({ s: p.size / 10, rot: p.r * 30 - 15 }, [blob([[0, 8], [-10, -2, 0.8], [-6, -10], [0, -5, 0], [6, -10], [10, -2, 0.8]], { fill: '#ff8d8d', shade: 0.3, hl: 0.4 })]) }),
    ]),
    layer({ z: 0.5 }, [plant(420, FLOOR + 260, 2, 9), plant(2050, FLOOR + 300, 2.1, 11)]),
  ]),
  captions: [[5.2, 7.2, '...e aquele café durou a tarde inteira.']],
  fadeOut: 1,
});

export default film([shot1, shot2, shot3], { trans: 'cross', d: 0.6 });
