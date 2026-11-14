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
import { restPose, bindMatrix } from './rig.js';
import { body, ik2 } from './geom.js';
import { V, blink, lerp, noise, smooth } from './anim.js';
import { darken, mix } from './color.js';

// ---------------------------------------------------------------- rosto de perfil (coords do desenho)
// origem = junção nuca/mandíbula; topo da cabeça em y=-150; queixo ~(65,-10). Escala aplicada depois.
const FACE = {
  m: [[-24, 2], [-36, -30], [-52, -80], [-34, -132], [6, -150], [44, -134], [58, -106], [62, -86, 0.6], [58, -77], [64, -70], [80, -53, 0.5], [67, -44, 0.4], [69, -37], [65, -32, 0.3], [68, -27], [61, -21, 0.6], [65, -11, 0.8], [44, 0], [22, 4]],
  f: [[-22, 2], [-34, -30], [-50, -80], [-32, -130], [6, -148], [42, -132], [55, -106], [58, -88, 0.6], [55, -78], [61, -71], [72, -57, 0.5], [70, -51, 0.3], [62, -47, 0.4], [65, -40], [62, -35, 0.3], [65, -30], [58, -24, 0.6], [60, -14, 0.9], [40, -2], [20, 4]],
};
const EYE = [[-7, 0], [-1, -4.8], [7, -1.6, 0.4], [1, 3.4]];

// ---------------------------------------------------------------- EXPRESSÕES
/**
 * Canais do rosto (todos opcionais, 0 = neutro). Valores, kf ou funções de t.
 *  sorriso (-1 triste .. 1 feliz) · abre (0..1 boca aberta, a mandíbula desce) · dentes (0..1) · bico (0..1 boca em "o")
 *  sobrancelha (-1 baixa .. 1 alta) · sobInt (-1 bravo: ponta de dentro desce .. 1 triste/preocupado: sobe)
 *  palpebra (0..1 fecha de cima) · inferior (0..1 pálpebra de baixo sobe: olhar sorridente/desconfiado)
 *  arregala (0..1 olho maior) · pupila (escala da íris, 1 = normal) · olhar / olharY (deslocamento da íris)
 *  rubor (0..1 bochechas) · nojo (0..1 nariz franzido) · lagrima (0..1) · suor (0..1 gota na têmpora)
 *  cabeca (graus: + abaixa o queixo, − levanta) — aplicado pela pessoa() no osso da cabeça.
 */
export const EXPRESSOES = {
  neutro: {},
  feliz: { sorriso: 0.8, inferior: 0.25, rubor: 0.2, sobrancelha: 0.2, cabeca: -2 },
  rindo: { sorriso: 1, abre: 0.75, dentes: 1, inferior: 0.6, palpebra: 0.3, sobrancelha: 0.5, rubor: 0.45, cabeca: -7 },
  triste: { sorriso: -0.7, sobInt: 0.9, sobrancelha: -0.1, palpebra: 0.35, olharY: 1.5, cabeca: 7 },
  chorando: { sorriso: -0.9, abre: 0.25, sobInt: 1, palpebra: 0.45, inferior: 0.3, rubor: 0.35, lagrima: 1, olharY: 1.5, cabeca: 9 },
  bravo: { sorriso: -0.5, sobInt: -1, sobrancelha: -0.6, palpebra: 0.2, inferior: 0.3, cabeca: 4 },
  furioso: { sorriso: -0.6, abre: 0.45, dentes: 1, sobInt: -1, sobrancelha: -0.8, inferior: 0.35, arregala: 0.15, rubor: 0.55, cabeca: 5 },
  surpreso: { abre: 0.55, bico: 0.7, sobrancelha: 1, arregala: 0.85, pupila: 0.8, cabeca: -4 },
  assustado: { abre: 0.4, sorriso: -0.4, bico: 0.3, sobrancelha: 0.8, sobInt: 0.8, arregala: 1, pupila: 0.65, suor: 1, cabeca: 5 },
  nojo: { sorriso: -0.5, nojo: 1, sobInt: -0.5, sobrancelha: -0.3, inferior: 0.55, palpebra: 0.2, cabeca: -4 },
  desconfiado: { sorriso: -0.15, palpebra: 0.45, inferior: 0.45, sobInt: -0.4, sobrancelha: -0.2, olhar: -1.5, cabeca: 2 },
  pensativo: { sorriso: -0.1, bico: 0.4, olharY: -2.2, olhar: 0.6, sobrancelha: 0.3, sobInt: 0.3, palpebra: 0.15, cabeca: -6 },
  timido: { sorriso: 0.45, rubor: 1, palpebra: 0.4, olharY: 2, sobInt: 0.4, cabeca: 9 },
  apaixonado: { sorriso: 0.6, rubor: 0.8, palpebra: 0.4, pupila: 1.35, sobInt: 0.5, sobrancelha: 0.3, cabeca: -2 },
  entediado: { sorriso: -0.2, palpebra: 0.6, sobrancelha: -0.2, olharY: 0.5, cabeca: 4 },
  sonolento: { palpebra: 0.8, sobrancelha: -0.3, abre: 0.1, cabeca: 6 },
  confuso: { sorriso: -0.2, bico: 0.3, sobrancelha: 0.7, sobInt: -0.3, olharY: -1, cabeca: -3 },
  determinado: { sorriso: 0.1, sobInt: -0.6, sobrancelha: -0.3, palpebra: 0.15, inferior: 0.2, cabeca: 3 },
  convencido: { sorriso: 0.55, palpebra: 0.45, sobrancelha: 0.3, sobInt: -0.2, cabeca: -7 },
  preocupado: { sorriso: -0.35, sobInt: 1, sobrancelha: 0.3, palpebra: 0.1, suor: 0.5, olharY: 0.5, cabeca: 3 },
};
const CANAIS = ['sorriso', 'abre', 'dentes', 'bico', 'sobrancelha', 'sobInt', 'palpebra', 'inferior', 'arregala', 'pupila', 'olhar', 'olharY', 'rubor', 'nojo', 'lagrima', 'suor', 'cabeca'];
const NEUTRO1 = { pupila: 1 };

/** Canais de uma expressão (nome | objeto de canais), com intensidade k (0..1+). */
function exprCanais(e, k = 1) {
  const E = typeof e === 'string' ? EXPRESSOES[e] : e;
  if (!E) throw new Error(`bamoo: expressão desconhecida "${e}". Use: ${Object.keys(EXPRESSOES).join(', ')}`);
  const out = {};
  for (const c of CANAIS) {
    const n = NEUTRO1[c] ?? 0;
    out[c] = n + ((E[c] ?? n) - n) * k;
  }
  return out;
}

// na troca de expressão o rosto não muda todo de uma vez: sobrancelhas e olhos chegam antes, a boca depois
const ATRASO = { sobrancelha: -0.06, sobInt: -0.06, arregala: -0.05, palpebra: -0.02, sorriso: 0.05, abre: 0.06, dentes: 0.07, bico: 0.05, cabeca: 0.05 };

/**
 * Linha do tempo de expressões: 'feliz' | { canais } | [[t, 'nome' | {canais}, intensidade?], ...].
 * Troca suave em `trans` segundos, com sobrancelhas adiantadas, boca atrasada e um leve exagero de passagem.
 * Devolve t => canais (use em rosto.expressao ou direto).
 */
export function expressao(seq, { trans = 0.32 } = {}) {
  if (typeof seq === 'function') return seq;
  if (!Array.isArray(seq)) {
    const c = exprCanais(seq);
    return () => c;
  }
  const keys = seq.map(([t, e, k]) => ({ t, c: exprCanais(e, k ?? 1) })).sort((a, b) => a.t - b.t);
  return t => {
    const out = {};
    for (const c of CANAIS) {
      const tc = t - (ATRASO[c] ?? 0);
      let i = 0;
      while (i + 1 < keys.length && keys[i + 1].t <= tc) i++;
      const cur = keys[i], prev = i > 0 ? keys[i - 1] : null;
      if (!prev || tc >= cur.t + trans) out[c] = cur.c[c];
      else {
        const u = Math.max(0, (tc - cur.t) / trans);
        const e = u * u * (3 - 2 * u);
        // overshoot leve no fim da troca (o rosto "assenta" na nova expressão)
        const os = 0.1 * Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.4) / 0.6)));
        out[c] = prev.c[c] + (cur.c[c] - prev.c[c]) * (e + os);
      }
    }
    return out;
  };
}

/** Rosto efetivo: expressão + canais escritos à mão (somados; pupila multiplica). Cacheado por t. */
export function rostoCanais(r = {}) {
  const ex = r.expressao !== undefined ? expressao(r.expressao, { trans: r.troca }) : null;
  const neutro = exprCanais('neutro');
  let lt = NaN, lv = null;
  return t => {
    if (t === lt) return lv;
    const base = ex ? ex(t) : neutro;
    const out = { ...base };
    for (const c of CANAIS) if (r[c] !== undefined) out[c] = c === 'pupila' ? base.pupila * (V(r[c], t) ?? 1) : base[c] + (V(r[c], t) ?? 0);
    out.fala = V(r.fala, t) ?? 0;
    lt = t;
    lv = out;
    return out;
  };
}

/**
 * Olho de perfil: pálpebra de cima (piscar/palpebra), de baixo (inferior), íris que olha (olhar/olharY),
 * pupila que dilata, olho arregalado, lágrima e cílios opcionais. o.C = t => canais (ver EXPRESSOES).
 */
export function olho(x, y, pele, o = {}) {
  const seed = o.seed ?? 1;
  const C = o.C ?? rostoCanais({ olhar: o.look, palpebra: o.lid });
  const lid = t => Math.min(1, Math.max(blink(t, seed), C(t).palpebra));
  const inf = t => Math.max(0, Math.min(0.8, C(t).inferior));
  return G({ x, y, s: o.s ?? 1.2, sy: t => 1 + 0.35 * Math.max(0, C(t).arregala), sx: t => 1 + 0.1 * Math.max(0, C(t).arregala) }, [
    blob(EYE, { fill: '#fbf6ee', shade: 0, hl: 0 }),
    G({ clip: blob(EYE) }, [
      G({ x: t => C(t).olhar, y: t => C(t).olharY * 0.8 }, [
        circle(3, -0.6, t => 4 * C(t).pupila, { fill: o.iris ?? '#3b2620', shade: 0, hl: 0 }),
        circle(4.3, -1.9, t => 1.2 * Math.min(1.4, C(t).pupila), { fill: '#fff', shade: 0, hl: 0 }),
      ]),
      rect(-10, -7, 20, 15, { fill: pele, shade: 0, hl: 0, py: -7, sy: lid }),
      rect(-10, -4, 20, 9, { fill: pele, shade: 0, hl: 0, py: 5, sy: inf }),
      ellipse(1, 3.6, 6.5, 1.5, { fill: '#bfe4ff', alpha: t => 0.8 * Math.min(1, C(t).lagrima * 2), shade: 0, hl: 0 }),
    ]),
    taper(t => {
      const b = lid(t);
      return [[-8, -0.4 + b * 4], [0, -5.2 + b * 7], [8.5, -2 + b * 3]];
    }, [1, 2.8, 1.8], { fill: '#2a1915', shade: 0, hl: 0 }),
    taper(t => {
      const k = inf(t);
      return [[-6.5, 1 - 3 * k], [0, 3.4 - 6.5 * k], [5.5, 1.4 - 3 * k]];
    }, [0.3, 1, 0.4], { fill: darken(pele, 0.3), alpha: t => Math.min(1, inf(t) * 4), shade: 0, hl: 0 }),
    o.cilios && taper(t => {
      const b = lid(t);
      return [[6, -3 + b * 2.4], [10, -6 + b * 4], [13, -6.5 + b * 4.5]];
    }, [2, 1.2, 0.4], { fill: '#2a1915', shade: 0, hl: 0 }),
  ]);
}

/** Abertura total da boca (expressão + fala). */
const abertura = c => Math.min(1.1, Math.max(c.abre, 0) + 0.42 * c.fala);
/** Canto da boca (x, y) no desenho da boca. */
const cantoBoca = c => [-10 + 5 * Math.max(0, c.bico) - 2.5 * Math.max(0, c.sorriso), -0.5 - 6.5 * c.sorriso];

/**
 * Boca de perfil: canto que sobe/desce (sorriso −1..1), abertura (fala/abre) com dentes e língua, bico ("o").
 * o.C = t => canais; ou o.fala / o.sorriso soltos (compatível com a versão antiga).
 */
export function boca(x, y, o = {}) {
  const C = o.C ?? rostoCanais({ fala: o.fala, sorriso: o.sorriso });
  const forma = t => {
    const c = C(t), a = abertura(c), [bx, by] = cantoBoca(c);
    const h = 0.4 + 12.5 * a; // acompanha a mandíbula (desce até ~12 px)
    return [[2.5, -1.2], [bx * 0.45, -1.4 + by * 0.25], [bx, by, 0.5], [bx * 0.6, by * 0.5 + h * 0.6], [0.8, h]];
  };
  return G({ x, y }, [
    G({ alpha: t => smooth(0.02, 0.07, abertura(C(t))) }, [
      blob(forma, { fill: '#5b2323', shade: 0, hl: 0 }),
      G({ clip: blob(forma) }, [
        ellipse(-2, t => 1.5 + 12.5 * abertura(C(t)), 7, 4, { fill: '#c45a5f', shade: 0, hl: 0 }),
        rect(-14, -4, 18, t => 0.6 + 2.8 * Math.max(0, C(t).dentes) * Math.min(1, abertura(C(t)) * 3), { fill: '#fbf6ee', shade: 0, hl: 0 }),
      ]),
    ]),
    taper(t => {
      const c = C(t), [bx, by] = cantoBoca(c);
      return [[bx, by], [bx * 0.4, 1.5 - c.sorriso * 1.5], [2, 0.5]];
    }, [1, 2.2, 1], { fill: '#4a2620', shade: 0, hl: 0, alpha: t => 1 - 0.8 * smooth(0.02, 0.2, abertura(C(t))) }),
    // covinha do sorriso / ruga de tristeza no canto
    taper(t => {
      const c = C(t), s = c.sorriso, [bx, by] = cantoBoca(c);
      return s >= 0 ? [[bx - 1.5, by - 3], [bx - 3.2, by - 0.5], [bx - 2.5, by + 2]] : [[bx - 0.5, by + 1.5], [bx - 2, by + 4.5]];
    }, [0.3, 1.2, 0.3], { fill: '#4a2620', alpha: t => 0.5 * Math.min(1, Math.abs(C(t).sorriso) * 1.5), shade: 0, hl: 0 }),
  ]);
}

/** Gira para baixo (mandíbula) os pontos abaixo da linha da boca: boca aberta = queixo desce. */
const mandibula = (pts, yBoca, ang) => {
  if (!ang) return pts;
  const a = (ang * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), px = -5, py = -62;
  return pts.map(p => {
    if (p[1] <= yBoca) return p;
    const dx = p[0] - px, dy = p[1] - py;
    const q = [px + dx * c - dy * s, py + dx * s + dy * c];
    if (p[2] !== undefined) q.push(p[2]);
    return q;
  });
};

// cabelo e brinco são "partes soltas": seguem a cabeça com inércia (follow-through / overlapping action)
const MOLA_CABELO = { freq: 1.7, amort: 0.24, ganho: 1, max: 18, pendulo: 0.7 };
const MOLA_BRINCO = { freq: 2.4, amort: 0.12, ganho: 1.3, max: 40, pendulo: 1 };

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
    G({ px: -42, py: -118, mola: MOLA_CABELO }, [circle(-58, -122, 30, { fill: c, shade: 0.45, hl: 0.35 })]),
    blob([[-24, -40], [-50, -84], [-38, -140], [2, -162], [46, -150], [64, -122], [56, -104], [36, -122], [8, -120], [-8, -104], [-16, -80], [-18, -52]], { fill: c, shade: 0.35, hl: 0.3 }),
    taper([[-30, -132], [0, -152], [40, -144]], [0, 6, 0], { fill: hi, shade: 0, hl: 0 }),
  ],
  longo: (c, hi) => [
    G({ px: -40, py: -128, mola: MOLA_CABELO }, [
      blob([[-12, -50], [-40, 40], [-70, 90, 0.6], [-96, 70], [-86, -60], [-70, -140], [-20, -176], [30, -170], [62, -150], [72, -120], [62, -100], [50, -114], [28, -124], [6, -118], [-8, -100], [-14, -80]], { fill: c, shade: 0.42, hl: 0.25 }),
      taper([[-60, -140], [-80, -60], [-76, 40]], [0, 8, 0], { fill: hi, shade: 0, hl: 0 }),
    ]),
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
  const C = o._C ?? rostoCanais(r);
  const estilo = o.cabelo ?? (f ? 'ondulado' : 'curto');
  const back = estilo === 'ondulado' && G({ px: -36, py: -66, mola: MOLA_CABELO }, [
    ...[[-62, -20, 16], [-40, -8, 15], [-78, -46, 15], [-16, -4, 13]].map(([x, y, rr]) => circle(x, y, rr, { fill: cab, shade: 0.45, hl: 0.2 })),
    blob([[4, -14], [-30, -6, 0.7], [-60, -24], [-70, -60], [-40, -60], [-10, -40]], { fill: cab, shade: 0.4 }),
  ]);
  const ex = f ? 45 : 48, ey = -78;
  const yB = f ? -36 : -32, xB = f ? 61 : 64; // linha da boca
  // graus que a mandíbula desce: muito na boca aberta da expressão, pouco na fala (o queixo não "bate")
  const jaw = t => {
    const c = C(t);
    return 11 * Math.min(1.1, Math.max(0, c.abre)) + 3.5 * c.fala;
  };
  const comMandibula = pts => t => mandibula(pts, yB + 0.5, jaw(t));
  const LABIOS = [[62, -47], [66, -46], [63, -41], [65, -38], [61, -35], [65, -31], [59, -25], [55, -32], [57, -41]];
  const BARBA = o.barba === 'cheia'
    ? [[-8, -60], [14, -36], [40, -28], [60, -26], [70, -6], [56, 14, 0.6], [24, 12], [0, -10]]
    : [[-6, -56], [18, -40], [44, -30], [60, -27], [66, -12], [52, 1], [26, 3], [2, -12]];
  const gota = (x0, y0, dx, dy, per, fase, cor, k) =>
    G({ alpha: t => Math.min(1, k(t) * 2) }, [
      G({ x: t => x0 + dx * ((t / per + fase) % 1), y: t => y0 + dy * ((t / per + fase) % 1) ** 1.6, alpha: t => 1 - ((t / per + fase) % 1) ** 4, s: 1.1 }, [
        blob([[0, -6, 0], [3, -1], [2.6, 2.4], [0, 3.6], [-2.6, 2.4], [-3, -1]], { fill: cor, shade: 0, hl: 0 }),
        circle(-0.9, 1, 0.9, { fill: '#ffffff', shade: 0, hl: 0 }),
      ]),
    ]);
  return G([
    back,
    blob(comMandibula(FACE[f ? 'f' : 'm']), { fill: pele, shade: 0.4, hl: 0.25 }),
    f && blob(comMandibula(LABIOS), { fill: o.labios ?? '#c4535a', shade: 0, hl: 0 }),
    ellipse(f ? 38 : 42, -53, 15, 9, { fill: '#e8735f', alpha: t => (f ? 0.25 : 0.15) + 0.2 * Math.max(0, C(t).sorriso) + 0.5 * Math.max(0, C(t).rubor), blur: 5, shade: 0, hl: 0 }),
    taper(f ? [[66, -56], [62, -50]] : [[72, -50], [66, -45]], [2, 1], { fill: darken(pele, 0.25), shade: 0, hl: 0 }),
    // nojo: nariz franzido
    G({ alpha: t => Math.min(1, C(t).nojo * 1.3) }, [
      taper(f ? [[52, -71], [57, -68]] : [[55, -70], [60, -67]], [0.4, 1.4, 0.4], { fill: darken(pele, 0.3), shade: 0, hl: 0 }),
      taper(f ? [[52, -66], [58, -63]] : [[55, -65], [61, -62]], [0.4, 1.3, 0.4], { fill: darken(pele, 0.3), shade: 0, hl: 0 }),
    ]),
    o.barba && blob(comMandibula(BARBA), { fill: cab, alpha: o.barba === 'cheia' ? 0.95 : 0.6, shade: o.barba === 'cheia' ? 0.35 : 0, hl: 0, tex: { k: 'speckle', a: 0.5 } }),
    o.barba && blob([[55, -42], [68, -41], [67, -35.5], [56, -36]], { fill: cab, alpha: 0.9, shade: 0, hl: 0 }),
    olho(ex, ey, pele, { seed: r.piscar ?? 1, C, cilios: f, iris: o.olhos }),
    // sobrancelha: altura (sobrancelha) e inclinação (sobInt: + ponta de dentro sobe = triste; − desce = bravo)
    taper(t => {
      const c = C(t), h = -5 * c.sobrancelha, k = 1.4 * c.sobInt;
      const P = f ? [[34, -92], [46, -97], [58, -93]] : [[36, -91], [49, -96], [62, -91]];
      return [[P[0][0], P[0][1] + h + 1.6 * k], [P[1][0], P[1][1] + h - 1.2 * k - 1.2 * Math.max(0, -k)], [P[2][0], P[2][1] + h - 4.2 * k + 1.2 * Math.max(0, -k)]];
    }, f ? [1.5, 4.2, 1.5] : [2, 6, 2], { fill: f ? '#4a2416' : cab, shade: 0, hl: 0 }),
    // ruga entre as sobrancelhas (bravo) / da testa (preocupado)
    taper(f ? [[57, -101], [60, -97]] : [[61, -100], [64, -96]], [0.3, 1.2, 0.3], { fill: darken(pele, 0.25), alpha: t => 0.8 * Math.min(1, Math.max(0, -C(t).sobInt - 0.3) * 1.6), shade: 0, hl: 0 }),
    G({ alpha: t => 0.55 * Math.min(1, Math.max(0, C(t).sobInt - 0.4) * 2) }, [
      taper(f ? [[40, -106], [48, -108], [55, -105]] : [[42, -106], [51, -108], [59, -105]], [0.3, 1.1, 0.3], { fill: darken(pele, 0.22), shade: 0, hl: 0 }),
    ]),
    // a boca acompanha a mandíbula: o lábio de baixo desce com o queixo
    boca(xB, yB, { C }),
    ...HAIR[estilo](cab, hi),
    ellipse(f ? -2 : -6, -70, f ? 10 : 11, f ? 15 : 17, { fill: pele, shade: 0.5 }),
    taper([[f ? -4 : -8, -78], [f ? 2 : -2, -70], [f ? -2 : -6, -62]], [1.5, 2.5, 1], { fill: darken(pele, 0.18), shade: 0, hl: 0 }),
    f && o.brinco !== false && G({ px: -1, py: -56, mola: MOLA_BRINCO }, [line([[-1, -56], [-1, -50]], { stroke: '#c9a03e', lw: 1.5 }), circle(-1, -47, 3.2, { fill: '#ecc04f', shade: 0, hl: 0.6 })]),
    o.oculos && G([rect(36, -89, 28, 21, { r: 7, fill: '#ffffff18', stroke: '#2b1d1a', lw: 3.4, shade: 0, hl: 0 }), line([[36, -80], [10, -78], [-4, -74]], { stroke: '#2b1d1a', lw: 3 })]),
    // lágrima escorrendo pela bochecha e gota de suor na têmpora
    gota(ex - 1, ey + 7, -5, 42, 1.6, (r.piscar ?? 1) * 0.37, '#cdeaff', t => C(t).lagrima),
    gota(f ? 36 : 38, -114, -2, 18, 2.4, (r.piscar ?? 1) * 0.61, '#dff2ff', t => C(t).suor),
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
 *  vida (1): ação secundária automática — respiração, peso que oscila, cabeça e sobrancelhas acompanhando a fala,
 *  piscar ao virar a cabeça (0 desliga). acao: atuação do rig (antecipação, overshoot, atraso das juntas) ou false.
 *  Cabelo ondulado/longo/coque e brinco têm mola (follow-through); `ground` também desenha a sombra de contato.
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
  const neckW = f ? 2.75 * u : 3.3 * u;

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
  // ROUPA DE BAIXO FEMININA (vestido / blusa + saia): UMA silhueta que nasce no corpete e segue as duas coxas
  // (em pé, andando ou sentada). Vestido = corpete e saia fundidos numa peça só (sem emenda na cintura).
  const vestidoInteiro = roupa === 'vestido' || cores.cima === cores.baixo;
  const noTronco = (S, pts) => {
    const m = bindMatrix(P('tronco'), S.get('tronco'));
    return pts.map(([x, y, r]) => (r === undefined ? [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] : [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5], r]));
  };
  const saia = {
    side: 'mid',
    draw: S => {
      const piece = side => {
        const c = S.get('coxa' + side), k = S.get('canela' + side);
        const hem = [c.x1 + (k.x1 - k.x0) * 0.2, c.y1 + (k.y1 - k.y0) * 0.2];
        // vestido: a saia nasce DENTRO do corpete (sem degrau na cintura)
        if (vestidoInteiro) return blob(body([[c.x0 - 0.3 * u, c.y0 - 0.3 * T], [c.x0, c.y0], [c.x1, c.y1], hem], [4.4 * u, 5.8 * u, 6.2 * u, 7 * u], [4.2 * u, 9.2 * u, 6.6 * u, 7.6 * u], { n: 14 }));
        const waist = [c.x0 - 0.3 * u, c.y0 - 0.36 * T];
        return blob(body([waist, [c.x0, c.y0], [c.x1, c.y1], hem], [4.9 * u, 5.8 * u, 6.2 * u, 7 * u], [6.5 * u, 9.2 * u, 6.6 * u, 7.6 * u], { n: 14 }));
      };
      const tex = { k: 'brush', a: 0.16, s: 0.8 };
      const pecas = vestidoInteiro ? [blob(noTronco(S, TORSO)), piece('F'), piece('N')] : [piece('F'), piece('N')];
      return G({ merge: true, fill: cores.baixo, shade: 0.42, hl: 0.22, tex }, pecas);
    },
  };
  // detalhes por cima da saia (gola, cinto), presos ao tronco
  const detalhesSaia = {
    bone: 'tronco',
    node: G([
      taper([[-6.4 * u, yT(0.4)], [0, yT(0.43)], [4.9 * u, yT(0.41)]], [0.9 * u, 1.1 * u, 0.9 * u], { fill: darken(cores.baixo, 0.18), shade: 0, hl: 0 }),
    ]),
  };

  const saiaOn = f && roupa !== 'calca';
  const legSkin = side => ({ spine: ['coxa' + side, 'canela' + side], top: legTop, bot: legBot, fill: calca ? (side === 'F' ? darken(cores.baixo, 0.06) : cores.baixo) : side === 'F' ? darken(pele, 0.07) : pele, tex: calca ? { k: 'brush', a: 0.18, s: 0.8, rot: 90 } : null, shade: 0.42, hl: 0.25 });
  const armSkin = side => ({ spine: ['braco' + side, 'antebraco' + side], top: armTop, bot: armBot, fill: manga ? (side === 'F' ? darken(cores.cima, 0.08) : cores.cima) : side === 'F' ? darken(pele, 0.07) : pele, tex: manga ? { k: 'brush', a: 0.18, s: 0.8 } : null, shade: 0.42, hl: 0.25 });
  const sh = P('bracoN');
  const mangaCurta = side => !manga && { bone: 'braco' + side, node: G({ x: sh.x0, y: sh.y0 }, [blob([[-4.3 * u, 0.6 * u], [-3.1 * u, -2.3 * u], [0, -3.2 * u], [3.2 * u, -2.3 * u], [4.5 * u, 0.8 * u], [4.8 * u, 5.6 * u], [4.1 * u, 8.3 * u, 0.5], [0, 8.9 * u], [-4 * u, 8.3 * u, 0.5], [-4.8 * u, 5 * u]], { fill: side === 'F' ? darken(cores.cima, 0.06) : cores.cima, shade: 0.4 })]) };

  const head = P('cabeca'), hs = (head.len / 0.75) / 140;
  const hold = side => o.segura?.[side] && { bone: 'mao' + side, local: true, side: side === 'F' ? 'far' : 'near', node: G({ x: P('mao' + side).len * 0.5, y: -P('mao' + side).len * 0.2 }, [o.segura[side]]) };
  const ikList = [];
  const ik = o.ik ?? {};
  for (const [k, chain] of [['maoN', ['bracoN', 'antebracoN', 'maoN']], ['maoF', ['bracoF', 'antebracoF', 'maoF']], ['peN', ['coxaN', 'canelaN', 'peN']], ['peF', ['coxaF', 'canelaF', 'peF']]]) {
    if (ik[k] === undefined) continue;
    const angK = 'ang' + k[0].toUpperCase() + k.slice(1);
    // mãos: o alvo (kf) é interpolado em ARCO em torno do ombro — o braço gira, a mão não anda em linha reta
    const arco = k.startsWith('mao') ? [P(chain[0]).x0, P(chain[0]).y0] : undefined;
    ikList.push({ chain, target: ik[k], endAng: ik[angK] ?? (k.startsWith('pe') ? 0 : undefined), bend: ik['bend' + k], arco });
  }

  // ---- VIDA (ação secundária automática; vida: 0 desliga, 0.5 metade, 2 dobro) ----
  const vida = o.vida ?? 1;
  const r0 = o.rosto ?? {};
  const sd = (r0.piscar ?? 1) * 1.37;
  const andando = typeof o._ativo === 'function' ? o._ativo : () => 0;
  const fase = typeof o._fase === 'function' ? o._fase : () => 0;
  const resp = t => Math.sin(2 * Math.PI * 0.23 * t + sd * 3); // ~14 respirações por minuto
  const falando = r0.fala === undefined ? () => 0 : t => {
    let s = 0;
    for (let j = -2; j <= 2; j++) s += V(r0.fala, t + 0.07 * j) ?? 0;
    return Math.min(1, (s / 5) * 1.8);
  };
  const extraVida = vida ? {
    // respiração (o peito sobe), peso que oscila quando parado (moving hold), cabeça que acompanha a fala
    tronco: t => vida * (-0.9 * resp(t) + 1.2 * noise(t * 0.17, sd) * (1 - andando(t))),
    pescoco: t => vida * 0.5 * resp(t),
    cabeca: t => vida * (1.3 * noise(t * 0.3, sd + 5) + 3.2 * falando(t) * noise(t * 2.3, sd + 11) - 1.6 * andando(t) * Math.sin(4 * Math.PI * fase(t))),
  } : {};
  const extra = { ...extraVida };
  for (const [k, v] of Object.entries(o.extra ?? {})) extra[k] = extra[k] ? (t, env) => extra[k](t, env) + (V(v, t, env) ?? 0) : v;
  // piscar ao virar a cabeça (animadores fazem isso: o piscar "esconde" a troca de direção do olhar)
  const angCab = t => (V(o.pose?.tronco, t) ?? -90) + (V(o.pose?.pescoco, t) ?? 0) + (V(o.pose?.cabeca, t) ?? 0) + (V(o.rot, t) ?? 0);
  const vira = t => 0.95 * smooth(70, 150, Math.abs(angCab(t + 0.09) - angCab(t + 0.01)) / 0.08);
  const rosto = vida ? {
    ...r0,
    palpebra: t => Math.max(V(r0.palpebra, t) ?? 0, vira(t)),
    sobrancelha: t => (V(r0.sobrancelha, t) ?? 0) + 0.7 * falando(t) * Math.max(0, noise(t * 1.6, sd + 13)),
  } : r0;
  // expressão: a cabeça acompanha (triste abaixa o queixo, convencido levanta, surpreso recua)
  const C = rostoCanais(rosto);
  const cabExtra = extra.cabeca;
  extra.cabeca = cabExtra ? (t, env) => cabExtra(t, env) + C(t).cabeca : t => C(t).cabeca;

  const node = rig({
    name: o.name ?? (f ? 'mulher' : 'homem'),
    plan: 'humano',
    ...o,
    bones,
    ik: ikList,
    extra,
    // a vida do rig genérico é trocada pela vida própria da pessoa (respiração, peso, fala)
    acao: o.acao === false ? false : { vida: 0, ...(o.acao ?? {}) },
    skin: [
      // lado de lá
      legSkin('F'), { bone: 'peF', node: sapato('F') },
      armSkin('F'), mangaCurta('F'), { bone: 'maoF', node: mao('F') }, hold('F'),
      // meio: perna de cá (fica POR BAIXO do paletó/saia: a roupa de cima cobre o quadril), pescoço, tronco/roupa, cabeça
      { ...legSkin('N'), side: 'mid' }, { bone: 'peN', side: 'mid', node: sapato('N') },
      { bone: 'pescoco', node: blob([[-neckW * 1.15, N0 + 1.5 * u], [-neckW * 0.86, N1 + 2 * u], [neckW * 0.95, N1 + 1.5 * u], [neckW * 1.05, N0 - 0.5 * u]], { fill: pele, shade: 0.5 }) },
      { bone: 'tronco', node: G([
        blob(longTorso, { fill: cores.cima, shade: 0.45, hl: 0.25, tex: { k: 'brush', a: 0.18, s: 0.8 } }),
        jaqueta && blob([[1.8 * u, yT(1.03)], [4.6 * u, yT(1.0)], [4.2 * u, yT(0.85)], [2.8 * u, yT(0.92)]], { fill: cores.detalhe, shade: 0.2 }),
        jaqueta && taper([[3.8 * u, yT(0.98)], [5.8 * u, yT(0.78)], [7 * u, yT(0.5)]], [0.9 * u, 0.8 * u, 0.1 * u], { fill: darken(cores.cima, 0.12), shade: 0, hl: 0 }),
        jaqueta && taper([[-6.4 * u, yT(0.2)], [0, yT(0.24)], [6.6 * u, yT(0.22)]], [0, 0.7 * u, 0], { fill: darken(cores.cima, 0.1), shade: 0, hl: 0 }),
        roupa === 'camisa' && blob([[1.6 * u, yT(1.03)], [4.2 * u, yT(1.0)], [3.6 * u, yT(0.9)]], { fill: darken(cores.cima, 0.08), shade: 0 }),
        f && !vestidoInteiro && blob([[-2.8 * u, yT(1.02)], [2.6 * u, yT(1.02)], [3.8 * u, yT(0.97)], [1.6 * u, yT(0.94)], [-0.6 * u, yT(0.97)]], { fill: cores.detalhe, shade: 0.25 }),
      ]) },
      saiaOn && saia, saiaOn && detalhesSaia,
      { bone: 'cabeca', node: G({ x: head.x0 + 2 * hs, y: head.y0 + 45 * hs, s: hs }, [cabecaPerfil({ ...o, pele, rosto, _C: C })]) },
      // lado de cá
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
 * Jeitos de andar prontos (caminhada(M, { jeito: 'alegre' })). Cada um ajusta:
 *  passo (× do passo normal), levanta (altura do pé), afunda (descida do corpo depois do contato, × altura),
 *  agacha (joelhos sempre dobrados, × altura), braco (graus do balanço), cotovelo (dobra extra), inclina (tronco,
 *  graus para a frente), cabeca (graus: + olha para baixo), quica (balanço do tronco a cada passo, graus).
 */
export const JEITOS = {
  normal: { passo: 1, levanta: 1, afunda: 0.012, agacha: 0, braco: 26, cotovelo: 0, inclina: 3, cabeca: 0, quica: 1.4 },
  alegre: { passo: 1, levanta: 1.35, afunda: 0.022, agacha: 0, braco: 36, cotovelo: 8, inclina: 1, cabeca: -6, quica: 2.4 },
  triste: { passo: 0.72, levanta: 0.55, afunda: 0.008, agacha: 0.008, braco: 9, cotovelo: -6, inclina: 9, cabeca: 16, quica: 0.6 },
  apressado: { passo: 1.08, levanta: 1.1, afunda: 0.014, agacha: 0.004, braco: 34, cotovelo: 18, inclina: 9, cabeca: 2, quica: 1.8 },
  cansado: { passo: 0.7, levanta: 0.65, afunda: 0.018, agacha: 0.012, braco: 8, cotovelo: -4, inclina: 11, cabeca: 10, quica: 2.2 },
  furtivo: { passo: 0.7, levanta: 1.7, afunda: 0.006, agacha: 0.028, braco: 10, cotovelo: 45, inclina: 13, cabeca: -2, quica: 0.8 },
  confiante: { passo: 1, levanta: 1.05, afunda: 0.014, agacha: 0, braco: 30, cotovelo: 4, inclina: -2, cabeca: -7, quica: 1.6 },
};

/**
 * Caminhada anatômica para pessoa(): devolve { y, pose, ik } prontos para espalhar nas opções.
 *   const passos = caminhada(M, { x: kf(...), chao: CHAO, jeito: 'alegre' });
 *   pessoa({ ...M, x: t => ..., ...passos, ik: { ...passos.ik, maoN: ... } })
 * As quatro posições clássicas em cada passo: CONTATO (calcanhar toca, perna da frente esticada), DESCIDA
 * (o joelho de apoio dobra e absorve o peso — o ponto mais baixo), PASSAGEM (o corpo sobe sobre a perna
 * esticada) e IMPULSO (o calcanhar sobe, o pé rola até a ponta). Além disso:
 * - pé de apoio plantado (dirigido pela distância), rolamento calcanhar -> plano -> ponta, pé de balanço que
 *   sobe rápido depois do impulso e desce devagar antes do contato (ponta levantada);
 * - quadril em arco limitado pelo alcance real das pernas (nunca estica demais) + descida depois do contato;
 * - braços em oposição às pernas, com o cotovelo atrasado (follow-through) e balanço maior para a frente;
 * - tronco que inclina um pouco a cada contato (o peso cai) e cabeça que compensa; tudo some ao parar.
 * o: x (posição do quadril, kf/fn), chao (y do chão), jeito ('normal' | 'alegre' | 'triste' | 'apressado' |
 *   'cansado' | 'furtivo' | 'confiante' ou objeto como em JEITOS), passo (≈0.36×altura), duty (0.6),
 *   ativo (fn 0..1, opcional), e qualquer chave de JEITOS para ajuste fino (braco, inclina, afunda...).
 * Para parar com os dois pés no chão: distância total = (n + 0.5) × passo / duty.
 */
export function caminhada(p, o) {
  const J = { ...JEITOS.normal, ...(typeof o.jeito === 'object' ? o.jeito : JEITOS[o.jeito ?? 'normal'] ?? {}) };
  if (typeof o.jeito === 'string' && !JEITOS[o.jeito]) throw new Error(`bamoo caminhada: jeito desconhecido "${o.jeito}". Use: ${Object.keys(JEITOS).join(', ')}`);
  for (const k of Object.keys(JEITOS.normal)) if (k !== 'passo' && k !== 'levanta' && typeof o[k] === 'number') J[k] = o[k];
  const b = sk(p);
  const H = p.altura ?? 700, sole = b.peN[5].sole, Lft = b.peN[1];
  const L = (b.coxaN[1] + b.canelaN[1]) * 0.985;
  const step = o.passo ?? 0.36 * H * J.passo, duty = o.duty ?? 0.6;
  const X = typeof o.x === 'function' ? o.x : t => V(o.x, t);
  const x0 = X(o.t0 ?? 0);
  const vRef = o.vRef ?? 0.5 * H;
  const ativo = o.ativo ?? (t => Math.min(1, Math.abs(X(t + 0.04) - X(t - 0.04)) / 0.08 / vRef) ** 0.7);
  const lift = o.levanta ?? 0.045 * H * J.levanta;
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
      // sobe rápido logo depois do impulso, desce devagar até o contato (o pé não "cai" no chão)
      dy = -lift * Math.sin(Math.PI * u ** 0.75);
      ang = u < 0.5 ? lerp(34, 10, u / 0.5) : lerp(10, -12, (u - 0.5) / 0.5);
    }
    ang *= k;
    return { ...rola(dx, dy, ang, pp, k), stance: pp < duty, u: pp < duty ? pp / duty : null, dx0: dx, dy0: dy, pp, k };
  };
  // rotação exata em torno do ponto de contato (na altura da sola): ponta (ângulo +) ou calcanhar (ângulo −)
  const rola = (dx, dy, ang, pp, k) => {
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
    return { dx, lift: -dy + raise, ang };
  };
  // DESCIDA: logo depois do contato o joelho de apoio dobra e o corpo afunda (o peso chega)
  const desce = t => {
    let s = 0;
    for (const ph of [0, 0.5]) {
      const f = foot(t, ph);
      if (f.stance && f.u < 0.45) s = Math.max(s, Math.sin((Math.PI * f.u) / 0.45));
    }
    return s;
  };
  const hipH = t => {
    let best = Infinity;
    // o quadril precisa alcançar os DOIS pés (o de apoio e o que vai pousar)
    for (const ph of [0, 0.5]) {
      const f = foot(t, ph);
      best = Math.min(best, f.lift + Math.sqrt(Math.max(0, L * L - f.dx * f.dx)));
    }
    const k = ativo(t);
    return Math.min(best, b.coxaN[1] + b.canelaN[1]) - H * k * (J.afunda * desce(t) + J.agacha);
  };
  const y = t => o.chao - sole - hipH(t);
  // TORNOZELO: com o corpo baixo (descida, agachado) a canela inclina muito sobre o pé plantado; como num pé
  // de verdade, o calcanhar sobe antes de passar do limite da articulação (≈35° de dorsiflexão)
  const lc = b.coxaN[1], ln = b.canelaN[1], minRel = (b.peN[3] ?? -125) + 3;
  const pePos = (t, ph) => {
    let f = foot(t, ph);
    const yy = y(t);
    let tg = [f.dx, o.chao - sole - yy - f.lift];
    for (let it = 0; it < 2; it++) {
      const A = ik2([0, 0], tg, lc, ln, 1), B = ik2([0, 0], tg, lc, ln, -1);
      const kn = A.j[0] > B.j[0] ? A : B; // joelho para a frente
      const shin = (Math.atan2(kn.e[1] - kn.j[1], kn.e[0] - kn.j[0]) * 180) / Math.PI;
      if (f.ang - shin >= minRel) break;
      const r = rola(f.dx0, f.dy0, shin + minRel, f.pp, f.k);
      f = { ...f, ...r };
      tg = [f.dx, o.chao - sole - yy - f.lift];
    }
    return { tg, ang: f.ang };
  };
  const pe = ph => t => pePos(t, ph).tg;
  const fase = ph => t => ((((X(t) - x0) * duty) / step + ph) % 1 + 1) % 1;
  // braço: balanço maior para a frente que para trás (como o pêndulo do ombro de verdade)
  const arm = ph => t => {
    const c = Math.cos(2 * Math.PI * fase(ph)(t));
    return 180 + J.braco * (c > 0 ? 1.15 * c : 0.85 * c) * ativo(t);
  };
  // follow-through do braço: o cotovelo dobra mais no balanço para a frente, um pouco DEPOIS do ombro
  const ante = ph => t => -12 - ativo(t) * (6 + J.cotovelo + (J.braco * 0.62) * (0.5 - 0.5 * Math.cos(2 * Math.PI * (fase(ph)(t) - 0.08))));
  // tronco: inclinação do jeito + o peso que cai a cada contato (duas vezes por ciclo)
  const tronco = t => -90 + ativo(t) * (J.inclina + J.quica * desce(t));
  const cabeca = t => ativo(t) * (J.cabeca - 0.6 * J.quica * desce(t));
  return {
    y,
    pose: { tronco, cabeca, bracoN: arm(0), bracoF: arm(0.5), antebracoN: ante(0), antebracoF: ante(0.5) },
    ik: { peN: pe(0), peF: pe(0.5), angPeN: t => pePos(t, 0).ang, angPeF: t => pePos(t, 0.5).ang },
    // usados pela pessoa(): a vida (peso, cabeça) se adapta a quem está andando
    _ativo: ativo,
    _fase: fase(0),
  };
}
function smoothstep01(x) {
  const u = Math.max(0, Math.min(1, x));
  return u * u * (3 - 2 * u);
}
