// Figura humana BASE (homem e mulher), de perfil, sobre o esqueleto anatômico skeleton('humano').
// É um ponto de partida pronto e correto: o agente troca cores, cabelo, roupa, pose e pode
// acrescentar/substituir peles (opção `skin`, ou reaproveitando as funções exportadas).
//
//   const ana = pessoa({ sexo: 'f', x: 800, y: CHAO - pessoa.quadril({ sexo: 'f' }), ... })
//
// Origem do rig = articulação do quadril. Voltada para +x (use flip: true para olhar para a esquerda).

import { rig } from './nodes.js';
import { G, blob, circle, ellipse, rect, taper, line } from './nodes.js';
import { skeleton } from './anatomy.js';
import { restPose } from './rig.js';
import { body } from './geom.js';
import { V, blink, lerp } from './anim.js';
import { darken, mix } from './color.js';

// ---------------------------------------------------------------- rosto de perfil (coords do desenho)
// origem = junção nuca/mandíbula; topo da cabeça em y=-150; queixo ~(65,-10). Escala aplicada depois.
const FACE = {
  m: [[-24, 2], [-36, -30], [-52, -80], [-34, -132], [6, -150], [44, -134], [58, -106], [62, -86, 0.6], [58, -77], [64, -70], [80, -53, 0.5], [67, -44, 0.4], [69, -37], [65, -32, 0.3], [68, -27], [61, -21, 0.6], [65, -11, 0.8], [44, 0], [22, 4]],
  f: [[-22, 2], [-34, -30], [-50, -80], [-32, -130], [6, -148], [42, -132], [55, -106], [58, -88, 0.6], [55, -78], [61, -71], [72, -57, 0.5], [70, -51, 0.3], [62, -47, 0.4], [65, -40], [62, -35, 0.3], [65, -30], [58, -24, 0.6], [60, -14, 0.9], [40, -2], [20, 4]],
};
const EYE = [[-7, 0], [-1, -4.8], [7, -1.6, 0.4], [1, 3.4]];

/** Olho de perfil com pálpebra (piscar), íris que olha (look = deslocamento) e cílios opcionais. */
export function olho(x, y, pele, o = {}) {
  const seed = o.seed ?? 1;
  return G({ x, y, s: o.s ?? 1.2 }, [
    blob(EYE, { fill: '#fbf6ee', shade: 0, hl: 0 }),
    G({ clip: blob(EYE) }, [
      circle(t => 3 + (V(o.look, t) ?? 0), -0.6, 4, { fill: o.iris ?? '#3b2620', shade: 0, hl: 0 }),
      circle(t => 4.3 + (V(o.look, t) ?? 0), -1.9, 1.2, { fill: '#fff', shade: 0, hl: 0 }),
      rect(-10, -7, 20, 15, { fill: pele, shade: 0, hl: 0, py: -7, sy: t => Math.max(blink(t, seed), V(o.lid, t) ?? 0) }),
    ]),
    taper(t => {
      const b = Math.max(blink(t, seed), V(o.lid, t) ?? 0);
      return [[-8, -0.4 + b * 4], [0, -5.2 + b * 7], [8.5, -2 + b * 3]];
    }, [1, 2.8, 1.8], { fill: '#2a1915', shade: 0, hl: 0 }),
    o.cilios && taper([[6, -3], [10, -6], [13, -6.5]], [2, 1.2, 0.4], { fill: '#2a1915', shade: 0, hl: 0 }),
  ]);
}

/** Boca de perfil: abertura (fala 0..1) e canto que sobe (sorriso 0..1). */
export function boca(x, y, o = {}) {
  return G({ x, y }, [
    ellipse(-1, 1.5, 4.2, t => 0.3 + 4.5 * (V(o.fala, t) ?? 0), { fill: '#5b2323', shade: 0, hl: 0 }),
    taper(t => {
      const s = V(o.sorriso, t) ?? 0;
      return [[-10, -0.5 - s * 5], [-4, 1.5 - s * 1.5], [2, 0.5]];
    }, [1, 2.2, 1], { fill: '#4a2620', shade: 0, hl: 0 }),
  ]);
}

const HAIR = {
  curto: (c, hi) => [
    blob([[-30, -40], [-52, -84], [-40, -140], [2, -164], [48, -152], [66, -124], [57, -106], [34, -124], [8, -120], [-8, -106], [-16, -80], [-22, -52]], { fill: c, shade: 0.35, hl: 0.3 }),
    blob([[-30, -128], [0, -152], [40, -146], [10, -140], [-18, -124]], { fill: hi, shade: 0, hl: 0 }),
  ],
  ondulado: (c, hi) => [
    blob([[-10, -46], [-48, -30, 0.7], [-78, -64], [-82, -112], [-62, -152], [-20, -176], [30, -170], [62, -150], [72, -122], [64, -100], [52, -112], [30, -122], [6, -118], [-8, -102], [-14, -84], [-6, -64]], { fill: c, shade: 0.42, hl: 0.25 }),
    blob([[-52, -136], [-24, -162], [18, -164], [44, -152], [12, -152], [-20, -150], [-44, -128]], { fill: hi, alpha: 0.85, shade: 0, hl: 0 }),
    blob([[-74, -96], [-70, -126], [-56, -140], [-62, -118], [-66, -96]], { fill: hi, alpha: 0.7, shade: 0, hl: 0 }),
    blob([[-6, -120], [14, -150], [48, -156], [70, -132], [70, -106], [58, -96], [52, -114], [34, -128], [10, -130]], { fill: c, shade: 0.35, hl: 0.3 }),
  ],
  coque: (c, hi) => [
    circle(-58, -122, 30, { fill: c, shade: 0.45, hl: 0.35 }),
    blob([[-24, -40], [-50, -84], [-38, -140], [2, -162], [46, -150], [64, -122], [56, -104], [36, -122], [8, -120], [-8, -104], [-16, -80], [-18, -52]], { fill: c, shade: 0.35, hl: 0.3 }),
    taper([[-30, -132], [0, -152], [40, -144]], [0, 6, 0], { fill: hi, shade: 0, hl: 0 }),
  ],
  longo: (c, hi) => [
    blob([[-12, -50], [-40, 40], [-70, 90, 0.6], [-96, 70], [-86, -60], [-70, -140], [-20, -176], [30, -170], [62, -150], [72, -120], [62, -100], [50, -114], [28, -124], [6, -118], [-8, -100], [-14, -80]], { fill: c, shade: 0.42, hl: 0.25 }),
    taper([[-60, -140], [-80, -60], [-76, 40]], [0, 8, 0], { fill: hi, shade: 0, hl: 0 }),
    blob([[-6, -120], [14, -150], [48, -156], [70, -132], [70, -106], [58, -96], [52, -114], [34, -128], [10, -130]], { fill: c, shade: 0.35, hl: 0.3 }),
  ],
  careca: () => [],
};

/** Cabeça de perfil completa (no sistema de coords do desenho; a pessoa() escala e posiciona). */
export function cabecaPerfil(o = {}) {
  const f = o.sexo === 'f';
  const pele = o.pele ?? (f ? '#f1c4a2' : '#e0aa83');
  const cab = o.corCabelo ?? (f ? '#7a3622' : '#33241f');
  const hi = mix(cab, '#f6d9b0', 0.28);
  const r = o.rosto ?? {};
  const estilo = o.cabelo ?? (f ? 'ondulado' : 'curto');
  const back = estilo === 'ondulado' && [
    ...[[-62, -20, 16], [-40, -8, 15], [-78, -46, 15], [-16, -4, 13]].map(([x, y, rr]) => circle(x, y, rr, { fill: cab, shade: 0.45, hl: 0.2 })),
    blob([[4, -14], [-30, -6, 0.7], [-60, -24], [-70, -60], [-40, -60], [-10, -40]], { fill: cab, shade: 0.4 }),
  ];
  const ex = f ? 45 : 48, ey = -78;
  return G([
    back,
    blob(FACE[f ? 'f' : 'm'], { fill: pele, shade: 0.4, hl: 0.25 }),
    f && blob([[62, -47], [66, -46], [63, -41], [65, -38], [61, -35], [65, -31], [59, -25], [55, -32], [57, -41]], { fill: o.labios ?? '#c4535a', shade: 0, hl: 0 }),
    ellipse(f ? 38 : 42, -53, 15, 9, { fill: '#e8735f', alpha: t => (f ? 0.25 : 0.15) + 0.2 * (V(r.sorriso, t) ?? 0), blur: 5, shade: 0, hl: 0 }),
    taper(f ? [[66, -56], [62, -50]] : [[72, -50], [66, -45]], [2, 1], { fill: darken(pele, 0.25), shade: 0, hl: 0 }),
    o.barba && blob(o.barba === 'cheia'
      ? [[-8, -60], [14, -36], [40, -28], [60, -26], [70, -6], [56, 14, 0.6], [24, 12], [0, -10]]
      : [[-6, -56], [18, -40], [44, -30], [60, -27], [66, -12], [52, 1], [26, 3], [2, -12]], { fill: cab, alpha: o.barba === 'cheia' ? 0.95 : 0.6, shade: o.barba === 'cheia' ? 0.35 : 0, hl: 0, tex: { k: 'speckle', a: 0.5 } }),
    o.barba && blob([[55, -42], [68, -41], [67, -35.5], [56, -36]], { fill: cab, alpha: 0.9, shade: 0, hl: 0 }),
    olho(ex, ey, pele, { seed: r.piscar ?? 1, look: r.olhar, lid: r.palpebra, cilios: f, iris: o.olhos }),
    taper(f ? [[34, -92], [46, -97], [58, -93]] : [[36, -91], [49, -96], [62, -91]], f ? [1.5, 4.2, 1.5] : [2, 6, 2], { fill: f ? '#4a2416' : cab, shade: 0, hl: 0, y: t => -2.5 * (V(r.sobrancelha, t) ?? 0) }),
    boca(f ? 61 : 64, f ? -36 : -32, { fala: r.fala, sorriso: r.sorriso }),
    ...HAIR[estilo](cab, hi),
    ellipse(f ? -2 : -6, -70, f ? 10 : 11, f ? 15 : 17, { fill: pele, shade: 0.5 }),
    taper([[f ? -4 : -8, -78], [f ? 2 : -2, -70], [f ? -2 : -6, -62]], [1.5, 2.5, 1], { fill: darken(pele, 0.18), shade: 0, hl: 0 }),
    f && o.brinco !== false && G([line([[-1, -56], [-1, -50]], { stroke: '#c9a03e', lw: 1.5 }), circle(-1, -47, 3.2, { fill: '#ecc04f', shade: 0, hl: 0.6 })]),
    o.oculos && G([rect(36, -89, 28, 21, { r: 7, fill: '#ffffff18', stroke: '#2b1d1a', lw: 3.4, shade: 0, hl: 0 }), line([[36, -80], [10, -78], [-4, -74]], { stroke: '#2b1d1a', lw: 3 })]),
  ]);
}

// ---------------------------------------------------------------- corpo
const sk = o => skeleton('humano', { altura: o.altura ?? 700, cabecas: o.cabecas ?? 6.5, sexo: o.sexo ?? 'm' });

/** Distância do quadril (origem) até o chão na pose em pé: y = CHAO - pessoa.quadril({...}). */
function quadril(o = {}) {
  const b = sk(o);
  return b.coxaN[1] + b.canelaN[1] + b.peN[5].sole;
}

/**
 * Pessoa base. Opções:
 *  sexo 'm'|'f', altura (700), cabecas (6.5), pele, corCabelo, cabelo ('curto'|'ondulado'|'coque'|'longo'|'careca'),
 *  barba ('curta'|'cheia'), oculos, labios, olhos, brinco,
 *  roupa: 'jaqueta' | 'camisa' | 'vestido' | 'blusa' (blusa + saia), cores: { cima, baixo, sapato, detalhe },
 *  rosto: { piscar (seed), fala, sorriso, sobrancelha, olhar, palpebra } (valores/funções de t),
 *  pose: { osso: ângulo }, ik: { maoN, maoF, peN, peF: [x,y]|fn (alvo do PUNHO/TORNOZELO), angMaoN, angMaoF, angPeN, angPeF },
 *  segura: { N: nó, F: nó } — objeto na mão (coords da mão: +x ao longo dos dedos, -y = lado do polegar);
 *  skin: [peles extras], + props do rig (x, y, flip, s, rot, ground, name).
 */
export function pessoa(o = {}) {
  const f = o.sexo === 'f';
  const bones = sk(o);
  const R = restPose({ bones });
  const P = nm => R.get(nm);
  const H = o.altura ?? 700, u = H / 100;
  const pele = o.pele ?? (f ? '#f1c4a2' : '#e0aa83');
  const roupa = o.roupa ?? (f ? 'vestido' : 'jaqueta');
  const cores = { cima: f ? '#2e8a83' : '#4d6088', baixo: f ? '#2e8a83' : '#33364a', sapato: f ? '#8b2f36' : '#4a2c24', detalhe: f ? '#f7f1e6' : '#f1e9d8', ...(o.cores ?? {}) };
  const T = P('tronco').len, N0 = P('pescoco').y0, N1 = P('pescoco').y1;
  const yT = fr => -fr * T;
  const sole = bones.peN[5].sole;

  // tronco (perfil): costas à esquerda, peito à direita; desce até a virilha
  const TORSO = f
    ? [[-4.2 * u, 6.8 * u], [-9.2 * u, 2 * u], [-6.6 * u, yT(0.22)], [-5.2 * u, yT(0.45)], [-6 * u, yT(0.72)], [-4.8 * u, yT(0.9)], [-2.8 * u, yT(1.0)], [2.4 * u, yT(1.0)], [5 * u, yT(0.92)], [7.9 * u, yT(0.74), 0.8], [7.2 * u, yT(0.63)], [4.9 * u, yT(0.56)], [4.6 * u, yT(0.4)], [5.6 * u, yT(0.2)], [5.2 * u, 0], [4 * u, 4.8 * u], [0, 6.8 * u]]
    : [[-4 * u, 6.5 * u], [-8.4 * u, 2 * u], [-7.2 * u, yT(0.22)], [-6 * u, yT(0.45)], [-6.8 * u, yT(0.72)], [-5.6 * u, yT(0.9)], [-3.2 * u, yT(1.0)], [2.8 * u, yT(1.0)], [6 * u, yT(0.92)], [7.6 * u, yT(0.76)], [7 * u, yT(0.58)], [6.2 * u, yT(0.4)], [6.6 * u, yT(0.2)], [5.8 * u, 0], [4.2 * u, 4.8 * u], [0, 6.8 * u]];
  const jaqueta = roupa === 'jaqueta';
  const longTorso = jaqueta
    ? [[-4.6 * u, 9.4 * u], [-7.9 * u, 3.4 * u], ...TORSO.slice(2, -3).map(([x, y, r]) => [x * 1.05, y, r]), [6.4 * u, 2 * u], [5.4 * u, 7.6 * u], [0, 9.6 * u]]
    : TORSO;
  const neckW = f ? 2.5 * u : 3 * u;

  // braço: manga longa (camisa/jaqueta) ou curta (vestido/blusa)
  const armTop = [3.4, 2.9, 2.5, 2.2, 2.4, 1.9, 1.6].map(x => x * u * (f ? 0.8 : 1));
  const armBot = [3.6, 3.0, 2.6, 2.1, 2.5, 2.0, 1.5].map(x => x * u * (f ? 0.8 : 1));
  const manga = jaqueta || roupa === 'camisa';
  const legTop = (manga || roupa === 'calca' ? [4.4, 4.0, 3.4, 2.9, 2.7, 2.6, 2.5] : [4.2, 3.7, 3.0, 2.2, 1.9, 1.6, 1.2]).map(x => x * u);
  const legBot = (manga || roupa === 'calca' ? [5.0, 4.2, 3.3, 2.9, 2.9, 2.7, 2.6] : [5.2, 4.2, 3.0, 2.1, 2.8, 2.1, 1.3]).map(x => x * u);
  const calca = !f || roupa === 'calca';

  // mão (aponta para +x a partir do punho; polegar do lado -y = frente quando pendurada)
  const mao = side => {
    const m = P('mao' + side), L = m.len;
    const c = side === 'F' ? darken(pele, 0.07) : pele;
    return G({ x: m.x0, y: m.y0, rot: m.abs }, [
      blob([[0, -0.17 * L], [0.28 * L, -0.21 * L], [0.56 * L, -0.18 * L], [0.82 * L, -0.12 * L], [1.0 * L, -0.03 * L, 0.6], [0.97 * L, 0.07 * L], [0.78 * L, 0.11 * L], [0.52 * L, 0.16 * L], [0.24 * L, 0.18 * L], [0, 0.16 * L]], { fill: c, shade: 0.4, hl: 0.3 }),
      taper([[0.12 * L, -0.16 * L], [0.36 * L, -0.3 * L], [0.56 * L, -0.27 * L]], [0.13 * L, 0.11 * L, 0.08 * L], { fill: c, shade: 0.3 }),
      taper([[0.55 * L, -0.02 * L], [0.9 * L, 0.0]], [0, 0.025 * L, 0], { fill: darken(c, 0.15), shade: 0, hl: 0 }),
      manga && rect(-0.12 * L, -0.24 * L, 0.16 * L, 0.48 * L, { r: 0.05 * L, fill: cores.detalhe, shade: 0.3 }),
    ]);
  };
  // pé + sapato (do tornozelo para +x; sola a `sole` abaixo)
  const sapato = side => {
    const p = P('pe' + side), s = sole, L = p.len;
    const cs = side === 'F' ? darken(cores.sapato, 0.06) : cores.sapato;
    if (!f || roupa === 'calca')
      return G({ x: p.x0, y: p.y0 }, [blob([[-2.6 * u, -0.6 * u], [-2.4 * u, -2.6 * u], [1 * u, -2.6 * u], [0.5 * L, -1.4 * u], [0.95 * L, 0.8 * u, 0.6], [1.08 * L, 2.4 * u], [1.03 * L, s], [-2.6 * u, s]], { fill: cs, shade: 0.4, hl: 0.4 })]);
    const pc = side === 'F' ? darken(pele, 0.07) : pele;
    return G({ x: p.x0, y: p.y0 }, [
      blob([[-2 * u, -1.8 * u], [1.6 * u, -2 * u], [0.55 * L, -0.4 * u], [0.95 * L, 1.6 * u, 0.6], [1.02 * L, s * 0.8], [-2.2 * u, s * 0.8]], { fill: pc, shade: 0.35 }),
      blob([[-2.3 * u, 0.4 * u], [-1.2 * u, -0.6 * u], [0.35 * L, 0.8 * u], [0.8 * L, 1.8 * u], [1.04 * L, s * 0.8, 0.6], [1.0 * L, s], [0.25 * L, s], [-0.4 * u, s * 0.62], [-1.6 * u, s], [-2.4 * u, s]], { fill: cs, shade: 0.4, hl: 0.45 }),
    ]);
  };
  // saia: uma silhueta única que nasce na cintura e segue as duas coxas (em pé, andando ou sentada)
  const saia = {
    side: 'near',
    draw: S => {
      const piece = side => {
        const c = S.get('coxa' + side), k = S.get('canela' + side);
        const waist = [c.x0 - 0.3 * u, c.y0 - 0.36 * T];
        const hem = [c.x1 + (k.x1 - k.x0) * 0.2, c.y1 + (k.y1 - k.y0) * 0.2];
        return blob(body([waist, [c.x0, c.y0], [c.x1, c.y1], hem], [4.9 * u, 5.8 * u, 6.2 * u, 7 * u], [6.5 * u, 9.2 * u, 6.6 * u, 7.6 * u], { n: 14 }));
      };
      return G({ merge: true, fill: cores.baixo, shade: 0.42, hl: 0.22, tex: { k: 'brush', a: 0.16, s: 0.8 } }, [piece('F'), piece('N')]);
    },
  };

  const legSkin = side => ({ spine: ['coxa' + side, 'canela' + side], top: legTop, bot: legBot, fill: calca ? (side === 'F' ? darken(cores.baixo, 0.06) : cores.baixo) : side === 'F' ? darken(pele, 0.07) : pele, tex: calca ? { k: 'brush', a: 0.18, s: 0.8, rot: 90 } : null, shade: 0.42, hl: 0.25 });
  const armSkin = side => ({ spine: ['braco' + side, 'antebraco' + side], top: armTop, bot: armBot, fill: manga ? (side === 'F' ? darken(cores.cima, 0.08) : cores.cima) : side === 'F' ? darken(pele, 0.07) : pele, tex: manga ? { k: 'brush', a: 0.18, s: 0.8 } : null, shade: 0.42, hl: 0.25 });
  const sh = P('bracoN');
  const mangaCurta = side => !manga && { bone: 'braco' + side, node: G({ x: sh.x0, y: sh.y0 }, [blob([[-4.4 * u, -1.4 * u], [4.2 * u, -1.6 * u], [4.6 * u, 6 * u], [3.8 * u, 8.6 * u], [-3.8 * u, 8.6 * u], [-4.6 * u, 4 * u]], { fill: side === 'F' ? darken(cores.cima, 0.06) : cores.cima, shade: 0.4 })]) };

  const head = P('cabeca'), hs = (head.len / 0.75) / 140;
  const hold = side => o.segura?.[side] && { bone: 'mao' + side, local: true, side: side === 'F' ? 'far' : 'near', node: G({ x: P('mao' + side).len * 0.5, y: -P('mao' + side).len * 0.2 }, [o.segura[side]]) };
  const ikList = [];
  const ik = o.ik ?? {};
  for (const [k, chain] of [['maoN', ['bracoN', 'antebracoN', 'maoN']], ['maoF', ['bracoF', 'antebracoF', 'maoF']], ['peN', ['coxaN', 'canelaN', 'peN']], ['peF', ['coxaF', 'canelaF', 'peF']]]) {
    if (ik[k] === undefined) continue;
    const angK = 'ang' + k[0].toUpperCase() + k.slice(1);
    ikList.push({ chain, target: ik[k], endAng: ik[angK] ?? (k.startsWith('pe') ? 0 : undefined), bend: ik['bend' + k] });
  }

  const node = rig({
    name: o.name ?? (f ? 'mulher' : 'homem'),
    plan: 'humano',
    ...o,
    bones,
    ik: ikList,
    skin: [
      // lado de lá
      legSkin('F'), { bone: 'peF', node: sapato('F') },
      armSkin('F'), mangaCurta('F'), { bone: 'maoF', node: mao('F') }, hold('F'),
      // meio: pescoço, tronco/roupa, cabeça
      { bone: 'pescoco', node: blob([[-neckW, N0 + 1 * u], [-neckW * 0.86, N1 + 2 * u], [neckW, N1 + 1.5 * u], [neckW * 0.92, N0 - 0.5 * u]], { fill: pele, shade: 0.5 }) },
      { bone: 'tronco', node: G([
        blob(longTorso, { fill: cores.cima, shade: 0.45, hl: 0.25, tex: { k: 'brush', a: 0.18, s: 0.8 } }),
        jaqueta && blob([[1.8 * u, yT(1.03)], [4.6 * u, yT(1.0)], [4.2 * u, yT(0.85)], [2.8 * u, yT(0.92)]], { fill: cores.detalhe, shade: 0.2 }),
        jaqueta && taper([[3.8 * u, yT(0.98)], [5.8 * u, yT(0.78)], [7 * u, yT(0.5)]], [0.9 * u, 0.8 * u, 0.1 * u], { fill: darken(cores.cima, 0.12), shade: 0, hl: 0 }),
        jaqueta && taper([[-6.4 * u, yT(0.2)], [0, yT(0.24)], [6.6 * u, yT(0.22)]], [0, 0.7 * u, 0], { fill: darken(cores.cima, 0.1), shade: 0, hl: 0 }),
        roupa === 'camisa' && blob([[1.6 * u, yT(1.03)], [4.2 * u, yT(1.0)], [3.6 * u, yT(0.9)]], { fill: darken(cores.cima, 0.08), shade: 0 }),
        f && blob([[-3.4 * u, yT(1.01)], [3.2 * u, yT(1.01)], [5 * u, yT(0.94)], [2 * u, yT(0.9)], [-0.6 * u, yT(0.95)]], { fill: cores.detalhe, shade: 0.25 }),
        f && taper([[-6.6 * u, yT(0.42)], [0, yT(0.44)], [4.7 * u, yT(0.42)]], [1 * u, 1 * u, 0.9 * u], { fill: darken(cores.cima, 0.14), shade: 0, hl: 0 }),
      ]) },
      { bone: 'cabeca', node: G({ x: head.x0 + 2 * hs, y: head.y0 + 45 * hs, s: hs }, [cabecaPerfil({ ...o, pele })]) },
      // lado de cá
      legSkin('N'), { bone: 'peN', node: sapato('N') }, f && roupa !== 'calca' && saia,
      armSkin('N'), mangaCurta('N'), hold('N'), { bone: 'maoN', node: mao('N') },
      ...(o.skin ?? []),
    ],
  });
  node.hip = quadril(o);
  node.ankle = node.hip - sole;
  return node;
}
pessoa.quadril = quadril;
/** Espessura da sola (tornozelo -> chão) da pessoa com essas opções. */
pessoa.sola = (o = {}) => sk(o).peN[5].sole;
/** Distância do quadril até o tornozelo com a perna esticada (coxa + canela). */
pessoa.perna = (o = {}) => sk(o).coxaN[1] + sk(o).canelaN[1];

/**
 * Caminhada anatômica para pessoa(): devolve { y, pose, ik } prontos para espalhar nas opções.
 *   const passos = caminhada(M, { x: kf(...), chao: CHAO });
 *   pessoa({ ...M, x: t => ..., ...passos, ik: { ...passos.ik, maoN: ... } })
 * - pé de apoio plantado (dirigido pela distância), rolamento do pé (calcanhar -> plano -> ponta),
 * - quadril em arco de "pêndulo invertido" calculado pelo alcance real das pernas (nunca estica demais),
 * - braços em oposição às pernas, leve inclinação do tronco; tudo some suavemente ao parar.
 * o: x (posição do quadril, kf/fn), chao (y do chão), passo (≈0.36×altura), duty (0.6), ativo (fn 0..1, opcional).
 * Para parar com os dois pés no chão: distância total = (n + 0.5) × passo / duty.
 */
export function caminhada(p, o) {
  const b = sk(p);
  const H = p.altura ?? 700, sole = b.peN[5].sole, Lft = b.peN[1];
  const L = (b.coxaN[1] + b.canelaN[1]) * 0.985;
  const step = o.passo ?? 0.36 * H, duty = o.duty ?? 0.6;
  const X = typeof o.x === 'function' ? o.x : t => V(o.x, t);
  const x0 = X(o.t0 ?? 0);
  const vRef = o.vRef ?? 0.5 * H;
  const ativo = o.ativo ?? (t => Math.min(1, Math.abs(X(t + 0.04) - X(t - 0.04)) / 0.08 / vRef) ** 0.7);
  const lift = o.levanta ?? 0.045 * H;
  const foot = (t, phase) => {
    const d = X(t) - x0, k = ativo(t);
    const pp = ((((d * duty) / step + phase) % 1) + 1) % 1;
    let dx, dy = 0, ang;
    if (pp < duty) {
      const u = pp / duty;
      dx = step * (0.5 - u);
      ang = u < 0.15 ? -12 * (1 - u / 0.15) : u > 0.65 ? 34 * ((u - 0.65) / 0.35) ** 1.6 : 0;
    } else {
      const u = (pp - duty) / (1 - duty), e = 0.5 - 0.5 * Math.cos(Math.PI * u);
      dx = step * (-0.5 + e);
      dy = -lift * Math.sin(Math.PI * u); // passo lento também levanta o pé (sem arrastar)
      ang = u < 0.5 ? lerp(34, 14, u / 0.5) : lerp(14, -12, (u - 0.5) / 0.5);
    }
    ang *= k;
    // calcanhar sobe girando sobre a ponta do pé (ângulo +): o tornozelo sobe E avança,
    // mantendo a ponta plantada no mesmo lugar
    // rotação exata em torno do ponto de contato (na altura da sola): ponta (ângulo +) ou calcanhar (ângulo −)
    const a = (ang * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    let raise = 0;
    if (ang > 0) {
      raise = Lft * sa + sole * ca - sole;
      if (pp < duty) dx += Lft * (1 - ca) + sole * sa;
      else {
        // continua a compensação do impulso na ponta e a desfaz suavemente no começo do balanço
        const u = (pp - duty) / (1 - duty), a0 = (34 * k * Math.PI) / 180;
        dx += (Lft * (1 - Math.cos(a0)) + sole * Math.sin(a0)) * (1 - smoothstep01(u / 0.45));
      }
    } else if (pp < duty) {
      raise = sole * (1 - ca);
      dx += sole * sa;
    }
    return { dx, lift: -dy + raise, ang, stance: pp < duty };
  };
  const hipH = t => {
    let best = Infinity;
    // o quadril precisa alcançar os DOIS pés (o de apoio e o que vai pousar)
    for (const ph of [0, 0.5]) {
      const f = foot(t, ph);
      best = Math.min(best, f.lift + Math.sqrt(Math.max(0, L * L - f.dx * f.dx)));
    }
    return Math.min(best, b.coxaN[1] + b.canelaN[1]);
  };
  const y = t => o.chao - sole - hipH(t);
  const pe = ph => t => {
    const f = foot(t, ph);
    return [f.dx, o.chao - sole - y(t) - f.lift];
  };
  const arm = ph => t => {
    const d = X(t) - x0;
    const pp = (((d * duty) / step + ph) % 1 + 1) % 1;
    return 180 + 22 * Math.cos(2 * Math.PI * pp) * ativo(t);
  };
  return {
    y,
    pose: { tronco: t => -90 + 3 * ativo(t), bracoN: arm(0), bracoF: arm(0.5), antebracoN: t => -12 - 10 * ativo(t), antebracoF: t => -12 - 10 * ativo(t) },
    ik: { peN: pe(0), peF: pe(0.5), angPeN: t => foot(t, 0).ang, angPeF: t => foot(t, 0.5).ang },
  };
}
function smoothstep01(x) {
  const u = Math.max(0, Math.min(1, x));
  return u * u * (3 - 2 * u);
}
