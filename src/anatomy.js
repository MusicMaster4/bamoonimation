// Anatomia de referência: esqueletos 2D (perfil voltado para +x, y para baixo, origem no quadril)
// com proporções reais e limites articulares, e regras usadas pelo verificador (bamoo check).
// Não são desenhos: são o "esqueleto certo" sobre o qual o agente desenha as peles.
//
// Convenção dos ângulos: relativos ao osso pai, positivo = horário na tela. Ex.: para um humano,
// joelho (canela) só dobra para + (pé vai para trás) e cotovelo (antebraço) só para − (mão vem para frente).

const pairN = (o, names) => {
  // duplica ossos marcados com "*" para os lados de cá (N) e de lá (F)
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (!k.endsWith('*')) {
      out[k] = v;
      continue;
    }
    const base = k.slice(0, -1);
    for (const side of ['F', 'N']) {
      const b = v.slice();
      if (typeof b[0] === 'string' && b[0].endsWith('*')) b[0] = b[0].slice(0, -1) + side;
      if (b[5]?.off && side === 'F' && names?.farOff) b[5] = { ...b[5], off: [b[5].off[0] + names.farOff[0], b[5].off[1] + names.farOff[1]] };
      out[base + side] = b;
    }
  }
  return out;
};

/**
 * Humano adulto (sexo 'm' | 'f'). altura = do chão ao topo da cabeça. cabecas = altura em "cabeças"
 * (7.5 realista, 6–6.5 ilustração elegante, 4–5 cartum, 3 chibi). Pose de descanso: em pé, braços soltos.
 * Ossos: quadril, tronco, pescoco, cabeca, braco*, antebraco*, mao*, coxa*, canela*, pe* (* = N e F).
 * O pé tem `sole` = altura do tornozelo; a sola fica `sole` abaixo do osso do pé.
 */
function humano({ altura = 700, cabecas = 6.5, sexo = 'm' } = {}) {
  // alturas reais (fração da estatura, Drillis & Contini): sola 0.039, joelho 0.285, quadril 0.53,
  // C7 0.83, queixo 0.87, atlas (C1, pivô da cabeça, altura da orelha) ≈ queixo + 1/4 da cabeça, topo 1.0.
  // Estilização: a cabeça vale H/cabecas e o resto do corpo é escalado para fechar a altura.
  const H = altura, h = H / cabecas, k = (H - h) / (0.87 * H);
  const f = x => x * H * k;
  const fem = sexo === 'f';
  const arm = fem ? 0.97 : 1, hand = fem ? 0.92 : 1, foot = fem ? 0.9 : 1;
  return pairN({
    quadril: [null, 0, 0],
    tronco: ['quadril', f(0.3), -90, -125, -40],
    pescoco: ['tronco', f(0.04) * (fem ? 1.08 : 1) + 0.25 * h, 0, -45, 50],
    cabeca: ['pescoco', 0.75 * h, 0, -35, 35],
    'braco*': ['tronco', f(0.186) * arm, 180, -15, 245, { at: 0.96 }],
    'antebraco*': ['braco*', f(0.146) * arm, -10, -150, 5],
    'mao*': ['antebraco*', f(0.108) * hand, 0, -80, 80],
    'coxa*': ['quadril', f(0.245), 90, -40, 125],
    'canela*': ['coxa*', f(0.246), 0, -5, 155],
    'pe*': ['canela*', f(0.12) * foot, -90, -125, -40, { contact: true, sole: f(0.039) }],
  });
}

const QUAD = {
  // frações da altura da cernelha (ombro) — medidas de referência aproximadas
  cao: { coluna: 0.88, pesc: 0.38, cab: 0.42, cau: [0.22, 0.2, 0.18], umero: 0.3, antebraco: 0.33, mao: 0.16, femur: 0.36, tibia: 0.38, meta: 0.2, pata: 0.1 },
  gato: { coluna: 0.95, pesc: 0.3, cab: 0.36, cau: [0.34, 0.32, 0.3], umero: 0.3, antebraco: 0.32, mao: 0.14, femur: 0.38, tibia: 0.4, meta: 0.22, pata: 0.1 },
  cavalo: { coluna: 0.95, pesc: 0.62, cab: 0.48, cau: [0.18, 0.18, 0.15], umero: 0.22, antebraco: 0.3, mao: 0.26, femur: 0.3, tibia: 0.33, meta: 0.28, pata: 0.08 },
  coelho: { coluna: 0.95, pesc: 0.22, cab: 0.48, cau: [0.14], umero: 0.28, antebraco: 0.3, mao: 0.14, femur: 0.5, tibia: 0.6, meta: 0.5, pata: 0.14 },
};

/**
 * Quadrúpede (cão, gato, cavalo, coelho). altura = cernelha (topo do ombro) ao chão. Pose: em pé
 * (coelho: agachado, patas traseiras dobradas sob o corpo). Ossos: quadril, coluna, pescoco, cabeca,
 * cauda1..n, umero*, antebraco*, mao* (metacarpo+pata), femur*, tibia*, meta* (metatarso), pata*.
 * Juntas: cotovelo dobra para − (pata vem para frente), carpo dobra para + (pata dobra para trás),
 * joelho (tíbia) para +, jarrete (meta) para −.
 */
function quadrupede({ altura = 300, variante = 'cao' } = {}) {
  const P = QUAD[variante];
  if (!P) throw new Error(`bamoo skeleton: variante desconhecida "${variante}". Use: ${Object.keys(QUAD).join(', ')}`);
  const h = altura, c = variante === 'coelho';
  const o = {
    quadril: [null, 0, 0],
    coluna: ['quadril', h * P.coluna, c ? -25 : 0, -45, 35],
    pescoco: ['coluna', h * P.pesc, c ? -45 : -50, -115, 20],
    cabeca: ['pescoco', h * P.cab, c ? 72 : 70, -40, 115],
    'umero*': ['coluna', h * P.umero, c ? 112 : 110, 30, 165, { off: [0, h * 0.12] }],
    'antebraco*': ['umero*', h * P.antebraco, c ? -22 : -25, -135, 10],
    'mao*': ['antebraco*', h * P.mao, c ? -30 : -5, -45, 155, { contact: true, sole: h * 0.03 }],
    'femur*': ['quadril', h * P.femur, c ? 15 : 70, -10, 145, { off: [0, h * 0.06] }],
    'tibia*': ['femur*', h * P.tibia, c ? 150 : 65, 10, 172],
    'meta*': ['tibia*', h * P.meta, c ? -165 : -60, -186, -5],
    'pata*': ['meta*', h * P.pata, c ? 0 : -75, -120, 35, { contact: true, sole: h * 0.025 }],
  };
  P.cau.forEach((L, i) => (o['cauda' + (i + 1)] = i === 0 ? ['quadril', h * L, 200, 110, 280] : ['cauda' + i, h * L, 10, -70, 70]));
  return pairN(o);
}

/**
 * Ave (rapina, pombo, pardal...). tamanho = comprimento do bico à ponta da cauda. Ossos: quadril, corpo,
 * pescoco, cabeca, cauda, ombro* (fixação da asa), coxa*, tibio* ("coxinha"), tarso* (a "canela"
 * escamosa), dedos*. A "junta para trás" da perna é o tornozelo (tarso dobra para −), não o joelho.
 * A asa bate num plano perpendicular à câmera, então é modelada à parte (src/ave.js: plantaAsa/ave).
 */
function ave({ tamanho = 400 } = {}) {
  const T = tamanho;
  return pairN({
    quadril: [null, 0, 0],
    corpo: ['quadril', T * 0.3, -15, -70, 45],
    pescoco: ['corpo', T * 0.09, -45, -110, 40],
    cabeca: ['pescoco', T * 0.12, 50, -45, 100],
    cauda: ['quadril', T * 0.32, 190, 140, 235],
    // ponto de fixação da asa: a asa em si (úmero 0.18T, ulna 0.24T, mão 0.2T, dobra em Z) é modelada
    // na sua própria planta e projetada pela elevação — ver plantaAsa()/ave() em src/ave.js
    'ombro*': ['corpo', 0, 0, undefined, undefined, { at: 0.82, off: [0, -T * 0.02] }],
    'coxa*': ['quadril', T * 0.09, 55, -10, 115, { off: [T * 0.02, T * 0.04] }],
    'tibio*': ['coxa*', T * 0.17, 70, 10, 165],
    'tarso*': ['tibio*', T * 0.13, -45, -165, 10],
    'dedos*': ['tarso*', T * 0.07, -80, -150, 45, { contact: true, sole: T * 0.012 }],
  });
}

/**
 * Peixe. comprimento = do focinho à base da cauda. Ossos: cabeca (aponta +x, da guelra ao focinho),
 * s1..sN (espinha indo para trás, cada junta ±25°). Anime com pose: { s1: fn, ... } (onda) e use
 * pele { spine: ['sN', ..., 's1', 'cabeca'], top, bot }.
 */
function peixe({ comprimento = 600, segmentos = 6 } = {}) {
  const L = comprimento, body = L * 0.78 / segmentos;
  const o = { cabeca: [null, L * 0.22, 0] };
  for (let i = 1; i <= segmentos; i++) o['s' + i] = i === 1 ? ['cabeca', body, 180, 155, 205, { at: 0 }] : ['s' + (i - 1), body, 0, -25, 25];
  return o;
}

const PLANS = { humano, quadrupede, ave, peixe };

/** Esqueleto de referência: skeleton('humano', { altura, cabecas }) | ('quadrupede', { altura, variante }) | ('ave', { tamanho }) | ('peixe', { comprimento, segmentos }). */
export function skeleton(plan, opts = {}) {
  const f = PLANS[plan];
  if (!f) throw new Error(`bamoo skeleton: plano desconhecido "${plan}". Use: ${Object.keys(PLANS).join(', ')}`);
  return f(opts);
}

/**
 * Regras de proporção por plano: [ossos A, ossos B, min, max, explicação] — compara soma(A)/soma(B).
 * O verificador usa a versão N (ou F, ou sem sufixo) de cada osso.
 */
export const PLAN_RULES = {
  humano: [
    [['coxa'], ['canela'], 0.85, 1.2, 'coxa e canela têm quase o mesmo comprimento'],
    [['braco'], ['antebraco'], 1.05, 1.5, 'braço ≈ 1.25× antebraço'],
    [['braco', 'antebraco'], ['coxa', 'canela'], 0.55, 0.8, 'braço inteiro ≈ 0.68 da perna (punho na altura da virilha)'],
    [['tronco'], ['coxa', 'canela'], 0.45, 0.8, 'tronco (quadril→base do pescoço) ≈ 0.6 da perna'],
    [['mao'], ['antebraco'], 0.55, 0.95, 'mão ≈ 0.75 do antebraço (cobre metade do rosto)'],
    [['pe'], ['canela'], 0.35, 0.65, 'pé (tornozelo→dedos) ≈ 0.5 da canela'],
    [['cabeca'], ['coxa', 'canela', 'tronco', 'pescoco', 'cabeca'], 0.11, 0.4, 'cabeça entre 1/9 (heroico) e 1/2.5 (chibi) da altura'],
  ],
  quadrupede: [
    [['umero', 'antebraco', 'mao'], ['femur', 'tibia', 'meta'], 0.38, 1.15, 'pernas da frente ≈ traseiras (cão, gato, cavalo ≈ 0.8–1.1; coelho ≈ 0.45)'],
    [['cabeca'], ['coluna'], 0.15, 0.75, 'cabeça ≈ 0.25–0.55 da coluna'],
    [['tibia'], ['femur'], 0.8, 1.5, 'tíbia ≈ fêmur ou um pouco maior'],
  ],
  ave: [
    [['tibio'], ['tarso'], 0.8, 2.2, 'tibiotarso ("coxinha") maior que o tarso'],
    [['cabeca'], ['corpo'], 0.25, 0.7, 'cabeça ≈ 0.4 do corpo'],
  ],
  peixe: [],
};

/** Limites padrão por nome de osso (aplicados pelo verificador a rigs com `plan` cujos ossos não têm limites). */
export function defaultLimits(plan) {
  const sk = PLANS[plan] ? PLANS[plan]({}) : {};
  const out = {};
  for (const [k, v] of Object.entries(sk)) if (v[3] !== undefined) out[k] = [v[3], v[4]];
  return out;
}
