// Prancha de referência das aves: ciclo de batida (8 fases), poses prontas e o tipo 'passaro'.
import { scene, layer, lin, ave, ASA, bater, rect } from 'bamoonimation';

const CHAO = 1010;
const FREQ = 1; // 1 batida por segundo: a fase i/8 é o tempo i/8
export default scene({
  dur: 1,
  bg: lin(90, '#9cb8d8', '#f4d9b0'),
  look: { haze: null, vignette: 0.15, grain: 0.04 },
  layers: [layer([
    rect(-200, CHAO, 2400, 200, { fill: '#9fb05a', shade: 0, hl: 0 }),
    // linha 1: ciclo de batida (desce estendida, sobe recolhendo o punho)
    ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => ave({ name: `fase ${i}/8`, x: 140 + i * 235, y: 170, s: 0.42, asa: () => bater(i / 8, FREQ), cauda: 0.5 })),
    // linha 2: poses
    ave({ name: 'planando', x: 160, y: 470, s: 0.55, asa: ASA.planando, cauda: 0.7 }),
    ave({ name: 'freio/ataque', x: 620, y: 470, s: 0.55, rot: -12, asa: ASA.freio, cauda: 1, coxa: 10, pe: [125, 115], dedos: 40 }),
    ave({ name: 'mergulho', x: 1080, y: 420, s: 0.55, rot: 50, asa: ASA.dobrada, cabeca: -30 }),
    ave({ name: 'recolhendo', x: 1520, y: 470, s: 0.55, asa: ASA.recolhe }),
    // linha 3: pousados (rapina e pássaro)
    ave({ name: 'pousada', x: 300, y: CHAO - 165 * 0.6, s: 0.6, rot: -30, ground: CHAO, asa: ASA.dobrada, coxa: 95, pe: [-58, 152], peF: [-72, 146], dedos: 30 }),
    ave({ name: 'pardal', tipo: 'passaro', tamanho: 420, x: 900, y: CHAO - 165 * 0.45, s: 0.45, rot: -20, ground: CHAO, asa: ASA.dobrada, coxa: 85, pe: [-30, 158], dedos: 20,
      cores: { corpo: '#8a6446', asa: '#7a573c', ventre: '#efe0c6' } }),
    ave({ name: 'pardal voando', tipo: 'passaro', x: 1420, y: 800, s: 0.45, asa: () => bater(0.15, FREQ), cauda: 0.6, cores: { corpo: '#8a6446', asa: '#7a573c' } }),
  ])],
});
