// Prancha de referência dos 12 PRINCÍPIOS DA ANIMAÇÃO como o motor os aplica (ver docs/PRINCIPIOS.md).
// Cada elemento isola um princípio; rode:
//   bamoo sheet scenes/testes/principios.js            (12 momentos)
//   bamoo still scenes/testes/principios.js -t 1.9 --arcos   (trilhas: arcos e espaçamento)
//   bamoo still scenes/testes/principios.js -t 2 --silhueta  (staging: leitura da silhueta)
import { scene, layer, G, blob, circle, ellipse, rect, taper, line, sombra, kf, quica, pulo, pessoa, ave, bater, ASA, talk } from 'bamoonimation';

const CHAO = 900;

// 1 · squash & stretch + arcos + slow in/out + timing: bola que quica (base em 0,0)
const bola = quica({ x0: 140, vx: 300, chao: CHAO, altura: 520, t0: 0.3, queda: 0.55, perda: 0.55 });
const BOLA = G({ ...bola }, [circle(0, -48, 48, { fill: '#e2574c' }), taper([[-30, -70], [-8, -88], [18, -86]], [0, 7, 0], { fill: '#fff4e0', alpha: 0.7, shade: 0, hl: 0 })]);

// 2 · antecipação + squash + arco + follow-through: bichinho que pula (achata antes, estica no ar, amortece)
const bicho = pulo({ de: [700, CHAO], ate: [1000, CHAO], altura: 260, t0: 1.4, dur: 0.62 });
const BICHO = G({ ...bicho }, [
  blob([[-56, 0], [-60, -60], [-30, -104], [20, -110], [56, -70], [58, 0]], { fill: '#5b8fd1' }),
  circle(18, -70, 11, { fill: '#fff', shade: 0, hl: 0 }), circle(22, -70, 5, { fill: '#1d1a2b', shade: 0, hl: 0 }),
  // antena com mola: segue o corpo com atraso e balança (overlapping action)
  G({ px: 0, py: -104, mola: { freq: 2, amort: 0.22, ganho: 1.2, max: 40 } }, [taper([[0, -104], [6, -150], [-4, -190]], [6, 4, 2], { fill: '#3d6aa8' }), circle(-4, -194, 10, { fill: '#ffd25a' })]),
]);

// 3 · pose a pose com atuação automática: aceno (kf cru — o motor acrescenta antecipação, overshoot,
//     arco em torno do ombro, quebra das juntas e o atraso do lado de lá)
const M = { sexo: 'm', altura: 560, cabecas: 6.2, cabelo: 'curto', roupa: 'camisa', cores: { cima: '#d9a441', baixo: '#3b4252' } };
const ACENO = pessoa({
  ...M, name: 'acenando', x: 1240, y: CHAO - pessoa.quadril(M), ground: CHAO,
  ik: {
    maoN: kf([0, [14, 20]], [1.0, [14, 20]], [1.45, [110, -285]], [1.8, [150, -240]], [2.1, [100, -285]], [2.4, [150, -240]], [3.2, [150, -240]], [3.7, [14, 20]]),
    angMaoN: kf([0, 80], [1.0, 80], [1.45, -80], [3.2, -80], [3.7, 80]),
  },
  rosto: { fala: t => talk(t, 1.5, 3.2, 2), sorriso: kf([0, 0.2], [1.2, 0.9]) },
});

// 4 · follow-through do cabelo/brinco + piscar ao virar a cabeça + respiração (ação secundária)
const F = { sexo: 'f', altura: 540, cabecas: 6.2, cabelo: 'longo', roupa: 'vestido', cores: { cima: '#2e8a83', baixo: '#2e8a83' } };
const VIRA = pessoa({
  ...F, name: 'virando', x: 1640, y: CHAO - pessoa.quadril(F), ground: CHAO, flip: true,
  pose: { pescoco: kf([0, 0], [1.6, 0], [1.9, -25], [3.0, -25], [3.3, 10]), cabeca: kf([0, 0], [1.6, 0], [1.9, -15], [3.0, -15], [3.3, 15]) },
  rosto: { sorriso: 0.5 },
});

// 5 · mola num objeto carregado: lanterna pendurada que balança quando a mão para (follow-through)
const LANTERNA = G({ x: kf([0.4, 380], [1.4, 760], [2.6, 760], [3.2, 520]), y: 120 }, [
  rect(-90, -8, 180, 14, { r: 7, fill: '#6b4a3a' }),
  G({ px: 0, py: 0, mola: { freq: 1.3, amort: 0.12, ganho: 1, max: 45 } }, [
    line([[0, 0], [0, 90]], { stroke: '#3a2a26', lw: 3 }),
    circle(0, 120, 30, { fill: '#ffd27a', glow: { r: 30, a: 0.6, c: '#ffcf7a' } }),
    rect(-34, 86, 68, 12, { r: 4, fill: '#7a5a3a' }),
  ]),
]);

// 6 · ação secundária automática da ave: corpo sobe a cada batida, cauda com mola
const AVE = ave({ tipo: 'passaro', x: kf([0, 1350], [4, 1780]), y: t => 200 + 30 * Math.sin(t * 1.4), s: 0.38, asa: t => bater(t, 2.4), cauda: 0.6, cores: { corpo: '#8a6446', asa: '#7a573c' } });

export default scene({
  dur: 4,
  bg: ['#cfe0e8', '#f3e6d0'],
  camera: { x: 960, y: 560 },
  layers: [
    layer({ z: 3 }, [blob([[-400, 1300], [-400, 760], [600, 700], [1400, 760], [2400, 700], [2400, 1300]], { fill: '#b9c7b0' })]),
    layer({ z: 1 }, [
      rect(-600, CHAO, 3200, 400, { fill: '#c9b48c' }),
      // sombras de contato de objetos sem rig: acompanham a altura (some quando o objeto sobe)
      sombra(t => bola.x(t), CHAO, t => 110 * (1 - 0.6 * Math.min(1, (CHAO - bola.y(t)) / 520)), { a: t => 0.5 * (1 - 0.7 * Math.min(1, (CHAO - bola.y(t)) / 520)) }),
      sombra(t => bicho.x(t), CHAO, t => 130 * (1 - 0.5 * Math.min(1, (CHAO - bicho.y(t)) / 260)), { a: 0.4 }),
      BOLA, BICHO, LANTERNA, ACENO, VIRA, AVE,
    ]),
  ],
});
