// Benchmark 1 — Tubarão caçando um peixe no recife.
// 3 planos: recife (estabelecimento) -> o predador passa -> a caçada.
import {
  scene, film, layer, G, blob, ellipse, circle, rect, taper, line, particles, rays, dyn, lin, rad,
  kf, osc, wig, rng, scatter, rep, wave, body, along, sampleCurve, profile, spline, move,
  smooth, clamp, lerp, decay, between, V, heading, noise, darken, bocaAberta, fileiraDentes,
} from 'bamoonimation';

const C = {
  top: '#86cbd8', mid: '#2a7c9c', deep: '#0b3352', abyss: '#071f33', haze: '#2c7f9f',
  sand: '#d2c08f', sandD: '#a8936a', rock: '#3f5d72', rock2: '#557887', rockD: '#2a4356',
  kelp: '#5f7f34', kelp2: '#7d9a42', coral: '#e2737a', coral2: '#f2a15e', fan: '#a274b8', anem: '#f1a0a8',
  shark: '#5d7c92', sharkL: '#7e9bb0', belly: '#ecf0ec', mouth: '#5e1d2c', throat: '#2b0a14', teeth: '#fbf7ea',
  fish: '#f9c943', fishD: '#e5952c', fishInk: '#1d2635', fin: '#fbe08e',
};

const look = {
  sun: [0.12, -1], light: '#e2fbff', shadow: '#173a5c', shade: 0.5, hl: 0.28,
  haze: { c: C.haze, a: 0.78 }, vignette: 0.5, vignetteC: '#021423', bloom: 0.22,
  grade: { sat: 1.06, con: 1.05, lift: '#04121e', tint: '#4aa6c4', tintA: 0.1 },
};
const water = lin(90, [0, C.top], [0.35, C.mid], [0.75, C.deep], [1, C.abyss]);
const val = (v, t) => V(v, t);

// ---------------------------------------------------------------- tubarão
// Perfil voltado para +x. Espinha da cauda (u=0, x=-500) ao focinho (u=1, x=+500).
// opts: swim (amplitude), clock (t => fase da natação), open (0..1 mandíbula). Tudo pode ser função de t.
const TOP = profile([7, 16, 32, 58, 88, 108, 118, 116, 106, 92, 76, 56, 26]);
const BOT = profile([7, 14, 26, 44, 63, 77, 84, 84, 78, 68, 54, 36, 14]);
const MOUTH = u => BOT(u) * lerp(1, 0.4, smooth(0.7, 0.8, u)); // a parte de baixo da cabeça vira a linha da boca
const BELT = u => -BOT(u) * (u < 0.3 ? lerp(0.75, 0.45, u / 0.3) : u < 0.68 ? 0.06 + 0.06 * Math.sin(u * 40) : lerp(0.1, 0.4, smooth(0.68, 0.8, u)));
const H0 = 0.69, H1 = 0.985; // trecho da mandíbula

function shark({ swim = 1, clock = t => 0.75 * t, open = 0 } = {}) {
  return dyn(t => {
    const sw = val(swim, t), o = clamp(val(open, t));
    const base = rep(12, i => [-500 + (i / 11) * 1000, 0]);
    const sp = wave(base, val(clock, t), { amp: u => sw * (3 + 72 * (1 - u) ** 2.2), len: 1.25, dir: -1 });
    const S = sampleCurve(sp);
    const at = (u, off = 0) => {
      const p = along(S, u);
      return [p.x + p.nx * off, p.y + p.ny * off, p.ang];
    };
    const fin = (u, off, pts, p = {}) => {
      const [x, y, a] = at(u, off);
      return blob(pts, { x, y, rot: a + (p.rot ?? 0), fill: p.fill ?? C.shark, shade: p.shade, hl: p.hl });
    };
    // mandíbula inferior: região entre a linha da boca e a barriga, girando no "dobradiça"
    const ang = (o * 34 * Math.PI) / 180, [hx, hy] = at(H0, -MOUTH(H0));
    const rot = ([x, y]) => [hx + (x - hx) * Math.cos(ang) - (y - hy) * Math.sin(ang), hy + (x - hx) * Math.sin(ang) + (y - hy) * Math.cos(ang)];
    const us = rep(10, i => lerp(H0, H1, i / 9));
    const upperLip = us.map(u => at(u, -MOUTH(u)));
    const jawTop = upperLip.map(rot);
    const jawBot = us.map(u => rot(at(u, -BOT(u)))).reverse();
    const teethK = smooth(0.03, 0.3, o);
    const tooth = (p, dir, s) => {
      const [x, y, a] = p;
      return blob([[-5 * s, 0], [0, 13 * s * dir, 0], [5 * s, 0]], { x, y, rot: a, fill: C.teeth, shade: 0, hl: 0 });
    };
    const [ex, ey] = at(0.9, 14);
    const [tx, ty, ta] = at(0, 0);
    return G([
      // nadadeiras de trás (atrás do corpo)
      G({ x: tx, y: ty, rot: ta + sw * 10 * Math.sin(2 * Math.PI * val(clock, t) + 1.2) }, [
        blob([[40, -14], [-14, -50], [-104, -170, 0.6], [-140, -200, 0], [-120, -140], [-74, -40], [-62, -2, 0.4], [-76, 34], [-118, 128, 0.6], [-134, 150, 0], [-108, 104], [-30, 30], [40, 12]], { fill: C.shark, shade: 0.45 }),
      ]),
      fin(0.6, TOP(0.6) * 0.85, [[80, 14], [44, -34], [-6, -112, 0.4], [-30, -132, 0], [-32, -110], [-44, -40], [-90, 16]]),
      fin(0.21, TOP(0.21) * 0.8, [[20, 6], [6, -16], [-14, -30, 0], [-18, -18], [-26, 6]]),
      fin(0.2, -BOT(0.2) * 0.8, [[20, -6], [4, 14], [-12, 26, 0], [-18, 14], [-26, -6]]),
      fin(0.4, -BOT(0.4) * 0.85, [[30, -6], [10, 22], [-20, 40, 0], [-26, 24], [-36, -6]]),
      // boca aberta (interior + dentes de cima)
      // boca aberta: cavidade com profundidade (garganta, língua, dentes do lado de lá) — bocaAberta() do motor
      o > 0.01 && bocaAberta({ cima: upperLip, baixo: jawTop, dentes: false, cores: { garganta: C.throat, boca: C.mouth } }),
      o > 0.01 && fileiraDentes(upperLip, jawTop, { n: 9, tam: 15, de: 0.28, k: teethK }),
      // corpo + barriga
      blob(body(sp, TOP, MOUTH, { n: 26 }), { fill: lin(90, '#4a6880', C.shark, C.sharkL), shade: 0.42, hl: 0.35, tex: { k: 'brush', a: 0.25, s: 1.2 } }),
      blob(body(sp, BELT, MOUTH, { n: 26 }), { fill: lin(90, '#f6f8f2', '#d3dedf'), shade: 0.38, hl: 0 }),
      // mandíbula inferior + dentes de baixo
      blob([...jawTop, ...jawBot], { fill: lin(90, '#eef2ec', '#c9d5d7'), shade: 0.4, hl: 0 }),
      o > 0.01 && fileiraDentes(jawTop, upperLip, { n: 8, tam: 13, de: 0.3, k: teethK }),
      // nadadeira peitoral (lado de cá)
      fin(0.68, -BOT(0.68) * 0.55, [[40, -12], [16, 26], [-50, 118, 0.4], [-74, 134, 0], [-66, 106], [-34, 36], [-44, -10]], { rot: 6 * Math.sin(t * 1.3) }),
      // brânquias
      G(rep(5, i => {
        const u = 0.715 + i * 0.016;
        const a = at(u, TOP(u) * 0.3), b = at(u + 0.008, -MOUTH(u) * 0.5);
        return taper([a, [(a[0] + b[0]) / 2 + 5, (a[1] + b[1]) / 2], b], [1, 4.5, 1.5], { fill: '#3c566b', shade: 0, hl: 0 });
      })),
      // linha da boca + olho
      taper(upperLip.slice(2), [1, 3.5, 1], { fill: '#2b3b48', shade: 0, hl: 0, alpha: 1 - o }),
      ellipse(ex, ey, 9, 8, { fill: '#0b1118', shade: 0, hl: 0 }),
      circle(ex - 2.5, ey - 3, 2.6, { fill: '#e8f4ff', shade: 0, hl: 0 }),
    ]);
  });
}

// ---------------------------------------------------------------- peixinho (voltado para +x)
const FISH = [[68, 3, 0.5], [38, -30], [-6, -45], [-44, -31], [-58, -3], [-44, 30], [-6, 43], [38, 26]];
function fish({ flap = 6 } = {}) {
  return G([
    G({ x: -50, rot: osc(flap, 16) }, [blob([[8, 0], [-34, -30, 0.4], [-42, -36, 0], [-30, 0, 0.5], [-42, 36, 0], [-34, 30, 0.4]], { fill: C.fin, shade: 0.3 })]),
    blob([[-42, -24], [-28, -62, 0.3], [8, -58], [36, -28]], { fill: C.fishD, shade: 0.3 }),
    blob([[-38, 22], [-24, 52, 0.3], [10, 46], [24, 24]], { fill: C.fishD, shade: 0.3 }),
    G({ clip: blob(FISH) }, [
      blob(FISH, { fill: lin(90, '#ffe07a', C.fish, C.fishD), shade: 0.45, hl: 0.35 }),
      rect(22, -60, 15, 120, { rot: 8, fill: C.fishInk, shade: 0, hl: 0 }),
      rect(-50, -60, 7, 120, { rot: -6, fill: '#e59a35', shade: 0, hl: 0 }),
      circle(-26, -8, 8, { fill: C.fishInk, shade: 0, hl: 0 }),
      circle(-26, -8, 3.5, { fill: '#ffe07a', shade: 0, hl: 0 }),
    ]),
    circle(30, -9, 7, { fill: '#fff3d0', shade: 0, hl: 0 }),
    circle(31, -9, 4.2, { fill: '#0b0f15', shade: 0, hl: 0 }),
    circle(29.5, -10.5, 1.6, { fill: '#fff', shade: 0, hl: 0 }),
    G({ x: 10, y: 10, rot: osc(flap * 0.7, 22, 0.2, 14) }, [blob([[0, 0], [-28, -6], [-32, 9], [-6, 8]], { fill: '#fde9a6', alpha: 0.85, shade: 0 })]),
  ]);
}

// ---------------------------------------------------------------- cenário
const rock = (x, y, w, h, fill, seed, detail = false) => {
  const r = rng(seed);
  const pts = rep(9, i => {
    const a = Math.PI + (i / 8) * Math.PI;
    return [Math.cos(a) * (w / 2) * r.range(0.85, 1.1), Math.sin(a) * h * r.range(0.75, 1.1), r() < 0.3 ? 0.5 : 1];
  });
  const main = blob([...pts, [w * 0.55, h * 0.4], [-w * 0.55, h * 0.4]], { fill: lin(90, fill, darken(fill, 0.12)), tex: { k: 'speckle', a: 0.35 }, hl: 0.35 });
  if (!detail) return G({ x, y }, [main]);
  // manchas de alga coralina e cracas no topo
  return G({ x, y }, [
    main,
    ...scatter(5, seed + 9, r2 => {
      const cx = r2.range(-w * 0.35, w * 0.35), cy = -h * r2.range(0.25, 0.6), rx = r2.range(30, 70);
      return ellipse(cx, cy, rx, rx * 0.45, { fill: r2.pick(['#5d8a8c', '#6e7fa3', '#8a6f9b']), alpha: 0.55, shade: 0.3, hl: 0.3 });
    }),
    ...scatter(10, seed + 3, r2 => circle(r2.range(-w * 0.4, w * 0.4), -h * r2.range(0.05, 0.7), r2.range(3, 7), { fill: '#d9e6e0', alpha: 0.5, shade: 0, hl: 0 })),
  ]);
};

const LEAF = [[0, 0], [22, -9], [58, -5, 0.4], [74, 0, 0], [58, 7], [22, 10]];
const kelp = (x, y, h, seed, fill = C.kelp, w = 16) => {
  const base = rep(7, i => [0, (-h * i) / 6]);
  const sway = t => wave(base, t, { amp: u => 4 + 46 * u * u, freq: 0.2, len: 1.7, phase: seed * 0.37 });
  return G({ x, y }, [
    taper(sway, [w, w * 0.75, w * 0.3], { fill, shade: 0.35 }),
    dyn(t => {
      const S = sampleCurve(sway(t));
      return rep(7, k => {
        const p = along(S, 0.16 + k * 0.12), side = k % 2 ? 1 : -1;
        return blob(LEAF, { x: p.x, y: p.y, s: 0.7 + 0.05 * k, rot: p.ang + side * 55 + 8 * Math.sin(t * 0.9 + k), fill: k % 2 ? fill : C.kelp2, shade: 0.35 });
      });
    }),
  ]);
};

const branch = (r, x, y, ang, len, w, depth, out) => {
  const a = (ang * Math.PI) / 180;
  const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
  out.push([[x, y], [(x + ex) / 2 + r.range(-6, 6), (y + ey) / 2], [ex, ey], w]);
  if (depth > 0) for (const d of [-1, 1]) branch(r, ex, ey, ang + d * r.range(18, 34), len * r.range(0.6, 0.78), w * 0.68, depth - 1, out);
  return out;
};
const coralTree = (x, y, s, fill, seed) =>
  G({ x, y, s, fill, shade: 0.3 }, branch(rng(seed), 0, 0, -90, 90, 22, 3, []).map(([a, m, b, w]) => taper([a, m, b], [w, w * 0.72])));

// gorgônia (leque): silhueta larga + nervuras irradiando do pé
const FAN = [[0, -30], [-90, -60], [-190, -150], [-210, -240, 0.6], [-120, -300], [0, -318], [130, -296], [205, -220, 0.6], [180, -130], [80, -55]];
const fanCoral = (x, y, s, seed, fill = C.fan) =>
  G({ x, y, s, rot: osc(0.22, 2.5, seed * 0.1), px: 0, py: 0 }, [
    blob(FAN, { fill, alpha: 0.55, tex: { k: 'hatch', a: 0.35, s: 0.45 }, shade: 0.3, hl: 0.2 }),
    G({ fill, shade: 0, hl: 0 }, branch(rng(seed + 40), 0, -20, -90, 120, 9, 4, []).map(([a, m, b, w]) => taper([a, m, b], [w, w * 0.7]))),
    ...rep(9, i => {
      const a = -160 + i * 17.5, r = 240 + 50 * Math.sin(i * 1.7);
      const ex = Math.cos((a * Math.PI) / 180) * r, ey = Math.sin((a * Math.PI) / 180) * r - 20;
      return taper([[0, -10], [ex * 0.45 + 10 * Math.sin(i), ey * 0.5], [ex, ey]], [9, 5, 1.5], { fill: '#6d3f87', shade: 0, hl: 0, alpha: 0.75 });
    }),
    taper([[0, 30], [2, -6], [0, -30]], [16, 10], { fill: '#5d3574', shade: 0 }),
  ]);

// esponjas-tubo e estrela-do-mar: detalhes que dão densidade de ilustração
const sponges = (x, y, s, fill = '#f08a4b') =>
  G({ x, y, s, fill, shade: 0.4, hl: 0.3 }, [
    ...[[-26, 70, -6], [0, 110, 2], [28, 84, 8]].map(([dx, h, r]) =>
      G({ x: dx, rot: r }, [taper([[0, 0], [0, -h / 2], [0, -h]], [28, 30, 32], { caps: 'flat' }), ellipse(0, -h, 15, 6, { fill: '#7a3424', shade: 0, hl: 0 })]),
    ),
  ]);
const STAR = rep(10, i => {
  const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 16 : 44;
  return [Math.cos(a) * r, Math.sin(a) * r * 0.55, i % 2 ? 1 : 0.6];
});
const seaStar = (x, y, s, rot = 0) => G({ x, y, s, rot }, [blob(STAR, { fill: '#e8603f', tex: { k: 'speckle', a: 0.5 }, shade: 0.4 })]);

const anemone = (x, y, s, seed) =>
  G({ x, y, s }, [
    ...rep(11, i => {
      const a = -160 + i * 14, ph = i * 0.13 + seed;
      return taper(t => {
        const sw = 10 * Math.sin(2 * Math.PI * (0.4 * t + ph));
        const r = (d => [Math.cos(((a + sw * d) * Math.PI) / 180), Math.sin(((a + sw * d) * Math.PI) / 180)]);
        const [c1, s1] = r(0.3), [c2, s2] = r(1);
        return [[0, 0], [c1 * 45, s1 * 45], [c2 * 90 + sw, s2 * 90]];
      }, [12, 8, 4], { fill: i % 2 ? C.anem : '#f6c0bd', shade: 0.3 });
    }),
    ellipse(0, 6, 34, 14, { fill: '#b8576b' }),
  ]);

const sandFloor = (y, seed) => {
  const r = rng(seed);
  const pts = [[-600, 1400], [-600, y], ...rep(9, i => [-400 + i * 350, y + r.range(-25, 25)]), [3000, y], [3000, 1400]];
  return G([
    blob(pts, { fill: lin(90, C.sand, C.sandD), shade: 0, hl: 0, tex: { k: 'speckle', a: 0.35 } }),
    ...scatter(14, seed + 1, r2 => {
      const x = r2.range(-400, 2700), yy = y + r2.range(40, 320), w = r2.range(80, 200);
      return taper([[x, yy], [x + w / 2, yy - 6], [x + w, yy]], [0, 5, 0], { fill: '#e6d7aa', alpha: 0.7, shade: 0, hl: 0 });
    }),
  ]);
};

// redes de cáusticas (luz que atravessa a superfície) — anéis que respiram
const caustics = (y0, y1, seed) =>
  G({ blend: 'screen', alpha: 0.32 }, scatter(26, seed, r => {
    const cx = r.range(-300, 2600), cy = r.range(y0, y1), R = r.range(30, 70), ph = r() * 10;
    return line(t => rep(7, k => {
      const a = (k / 7) * Math.PI * 2;
      const rr = R * (1 + 0.25 * Math.sin(2 * Math.PI * (0.35 * t + ph) + k * 1.7));
      return [cx + Math.cos(a) * rr * 1.6, cy + Math.sin(a) * rr * 0.45];
    }), { closed: true, stroke: '#d8f8ff', lw: 6, blur: 2.5 });
  }));

const surface = () =>
  G([
    blob(t => [[-800, -300], [3000, -300], [3000, 40], ...rep(12, i => [2900 - i * 300, 40 + 14 * Math.sin(i * 1.3 + t * 0.8)]), [-800, 40]], { fill: lin(90, '#e3fbff', '#a6e3ee'), shade: 0, hl: 0 }),
    ...scatter(16, 5, r => taper(t => {
      const x = r.range(-600, 2800) + 30 * Math.sin(t * 0.5 + r() * 9), y = r.range(60, 120);
      return [[x, y], [x + 60, y - 6], [x + 130, y]];
    }, [0, 4, 0], { fill: '#e9fdff', alpha: 0.6, shade: 0, hl: 0 })),
  ]);

const snow = (seed, n = 18) =>
  particles({ seed, rate: n, life: [5, 9], at: [960, 540], area: [3000, 1600], dir: -80, spread: 360, speed: [4, 18], size: [1.2, 3.2], color: '#e4f8ff', alphaVar: 0.7, turb: 30, fadeIn: 0.3, fadeOut: 0.3 });

const bubble = p =>
  G([
    circle(0, 0, p.size, { fill: '#d9f6ff33', stroke: '#e6fbffcc', lw: Math.max(1, p.size * 0.14), shade: 0, hl: 0 }),
    circle(-p.size * 0.35, -p.size * 0.35, p.size * 0.28, { fill: '#ffffffd0', shade: 0, hl: 0 }),
  ]);
const bubbles = (seed, at, rate = 3, size = [3, 9]) =>
  particles({ seed, rate, life: [2.5, 4], at, area: 30, dir: -90, spread: 20, speed: [70, 120], size, turb: 25, turbF: 2, shape: bubble });

// cardume distante: silhuetas simples que se movem juntas, cada uma com seu próprio "balanço"
const school = (seed, x0, y0, vx, n = 14, fill = '#2f6f8a') =>
  G({ x: t => x0 + vx * t, y: y0, fill, shade: 0, hl: 0 }, scatter(n, seed, (r, i) => {
    const dx = r.range(-160, 160), dy = r.range(-70, 70), ph = r() * 6;
    return G({ x: t => dx + 10 * Math.sin(t * 1.3 + ph), y: t => dy + 6 * Math.sin(t * 1.7 + ph), s: r.range(0.6, 1), flip: vx < 0 }, [
      ellipse(0, 0, 18, 7), blob([[-14, 0], [-28, -9], [-26, 9]]),
    ]);
  }));

const sunRays = (x = 900) => rays({ at: [x, -250], ang: 96, spread: 50, n: 10, len: 1900, w: [110, 260], w0: 70, c: '#dcf8ff', a: 0.42, sway: 5, speed: 0.12, fade: 0.55 });

const farReef = seed =>
  G(scatter(7, seed, (r, i) => rock(-500 + i * 520 + r.range(-80, 80), 980, r.range(380, 620), r.range(160, 300), C.rockD, seed + i)));

// ---------------------------------------------------------------- plano 1: o recife
const fishIdle = spline([0, [1000, 585]], [3, [1040, 570]], [6.5, [1015, 590]]);
const shot1 = scene({
  dur: 6.5,
  bg: water,
  look,
  camera: { x: kf([0, 880], [6.5, 1080]), dolly: kf([0, 0], [6.5, 0.07]), dof: 7 },
  layers: [
    layer({ z: 14, haze: 0.12 }, [surface(), sunRays(700)]),
    layer({ z: 6 }, [school(3, 1500, 300, -40), farReef(1), ...scatter(10, 3, r => kelp(r.range(-300, 2500), 1000, r.range(350, 600), r() * 9, '#3d6b55', 20))]),
    layer({ z: 3.4 }, [G({ ...move(t => [-500 + t * 420, 430 + 20 * Math.sin(t * 0.6)], { orient: true }), s: 0.3 }, [G({ x: -500 }, [shark({ swim: 0.7 })])])]),
    layer({ z: 2 }, [
      rock(150, 940, 520, 220, C.rock, 11), rock(1750, 960, 600, 260, C.rock, 12),
      kelp(320, 900, 520, 1), kelp(420, 920, 430, 2, C.kelp2), kelp(1650, 900, 560, 3), kelp(1900, 930, 480, 4, C.kelp2),
      snow(7, 10),
    ]),
    layer({ z: 1 }, [
      sandFloor(900, 21),
      caustics(920, 1150, 4),
      fanCoral(1420, 790, 0.95, 1), sponges(1560, 880, 0.9),
      rock(1180, 900, 560, 240, C.rock2, 31, true), rock(820, 930, 360, 160, C.rock, 32, true),
      coralTree(1050, 760, 1, C.coral, 9), coralTree(1240, 800, 0.7, C.coral2, 4), anemone(900, 820, 1, 2), sponges(1330, 790, 0.6, '#f4c04d'),
      seaStar(640, 1010, 1, 20), seaStar(1700, 1040, 0.8, -15),
      G({ ...move(t => [fishIdle(t)[0] + 12 * Math.sin(t * 2.1), fishIdle(t)[1] + 8 * Math.sin(t * 1.7)]), rot: wig(0.6, 8, 3), s: 0.75 }, [fish()]),
      snow(8, 14),
    ]),
    layer({ z: 0.5 }, [kelp(-60, 1150, 900, 6, '#2f4d2a', 30), kelp(80, 1200, 760, 7, '#36552d', 26), rock(2050, 1180, 700, 300, '#183142', 41), bubbles(3, [1900, 1050])]),
  ],
  fadeIn: 0.8,
});

// ---------------------------------------------------------------- plano 2: o predador
const sharkX = t => -900 + t * 470;
const shot2 = scene({
  dur: 5.5,
  bg: water,
  look,
  camera: { x: t => 820 + 0.3 * (sharkX(t) - 500), y: 520, zoom: 1.02, dof: 9 },
  layers: [
    layer({ z: 14, haze: 0.12 }, [surface(), sunRays(1100)]),
    layer({ z: 5 }, [farReef(5), ...scatter(8, 6, r => kelp(r.range(-300, 2500), 1000, r.range(400, 700), r() * 9, '#3d6b55', 22))]),
    layer({ z: 2.2 }, [rock(300, 1010, 700, 260, C.rock, 51), rock(1500, 1030, 800, 280, C.rock, 52), kelp(900, 1000, 600, 5), snow(9, 12)]),
    layer({ z: 1 }, [
      G({ x: t => sharkX(t), y: t => 560 + 14 * Math.sin(t * 0.8), rot: osc(0.4, 1.5), s: 1.15 }, [shark({ swim: 0.8, clock: t => 0.7 * t })]),
    ]),
    layer({ z: 0.45 }, [bubbles(11, [300, 1150], 2, [6, 16]), snow(12, 8)]),
  ],
});

// ---------------------------------------------------------------- plano 3: a caçada
const TC = 2.4; // instante da mordida
const fishPath = spline([0, [960, 560]], [1.15, [985, 552]], [1.45, [1080, 515], 'out'], [2.15, [1300, 490]], [TC, [1345, 505]], [3.5, [1650, 420]]);
const snout = spline([0, [-300, 790]], [1.3, [420, 660]], [TC, [1450, 470]], [3.4, [2250, 350]], [6, [3800, 260]]);
const shot3 = scene({
  dur: 6,
  bg: water,
  look: { ...look, mblur: t => (between(t, 1.6, 2.8) ? 4 : 0) },
  camera: {
    x: kf([0, 900], [1.2, 960], [TC, 1160], [4, 1290], [6, 1320]),
    y: kf([0, 560], [TC, 500], [6, 470]),
    zoom: kf([0, 1], [2.3, 1.05], [2.48, 1.11, 'out'], [3.6, 1.06], [6, 1.05]),
    shake: t => 16 * decay(t, TC, 5),
    dof: 7,
  },
  layers: [
    layer({ z: 14, haze: 0.12 }, [surface(), sunRays(1000)]),
    layer({ z: 6 }, [school(5, 300, 250, 35, 18), farReef(8), ...scatter(9, 9, r => kelp(r.range(-300, 2700), 1000, r.range(350, 650), r() * 9, '#3d6b55', 20))]),
    layer({ z: 2 }, [rock(200, 960, 600, 230, C.rock, 61), rock(1900, 980, 700, 260, C.rock, 62), kelp(520, 930, 500, 8), kelp(1750, 940, 540, 9, C.kelp2), snow(13, 10)]),
    layer({ z: 1 }, [
      sandFloor(930, 71),
      caustics(950, 1150, 6),
      fanCoral(620, 930, 0.85, 4, '#c0687f'), sponges(860, 990, 0.8),
      rock(1500, 950, 620, 230, C.rock2, 72, true), coralTree(1420, 830, 0.9, C.coral, 3), anemone(1700, 860, 0.9, 5), sponges(1260, 900, 0.7, '#f4c04d'),
      seaStar(1050, 1040, 0.9, 10),
      G({ ...move(snout, { orient: true }), s: kf([0, 0.55], [1.3, 0.65], [TC, 0.9], [4, 1]) }, [
        G({ x: -500 }, [shark({ swim: kf([0, 0.8], [1.3, 1.2], [TC, 1.7], [3.6, 1]), clock: t => 0.75 * t + 0.9 * smooth(1.2, 2.6, t), open: kf([0, 0], [1.75, 0], [2.25, 1, 'out'], [TC + 0.05, 0, 'in']) })]),
      ]),
      G({ show: [0, TC + 0.02], ...move(fishPath), s: 0.9, rot: t => (t < 1.15 ? 7 * noise(t * 1.3, 2) : heading(fishPath, t)) }, [fish({ flap: 6 })]),
      // impacto: bolhas + escamas brilhando
      particles({ seed: 4, burst: 46, t0: TC, at: [1350, 470], area: 40, dir: -90, spread: 360, speed: [80, 360], drag: 2.2, grav: [0, -60], life: [1.2, 2.6], size: [3, 12], turb: 20, shape: bubble }),
      particles({ seed: 5, burst: 16, t0: TC, at: [1350, 470], area: 20, spread: 360, speed: [60, 200], drag: 3, grav: [0, 30], life: [0.8, 1.6], size: [2, 4], color: ['#ffe58a', '#fff4c4'], spin: 400, glow: { r: 6, a: 0.6 } }),
      snow(14, 12),
    ]),
    layer({ z: 0.5 }, [kelp(2100, 1250, 900, 10, '#2f4d2a', 30), bubbles(15, [1950, 1100], 2, [6, 14])]),
  ],
  fadeOut: 0.9,
});

export const sharkTest = scene({ dur: 2, bg: water, look, layers: [layer([
  G({ x: 900, y: 330, s: 0.9 }, [shark({ swim: 1 })]),
  G({ x: 900, y: 780, s: 0.9 }, [shark({ swim: 1.6, open: 0.8 })]),
  G({ x: 1650, y: 540, s: 1.6 }, [fish()]),
])] });
export default film([shot1, shot2, shot3], { trans: 'cross', d: 0.6 });
