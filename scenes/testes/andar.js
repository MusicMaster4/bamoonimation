// Exemplo de referência: caminhada anatômica com pessoa() + caminhada().
// Pé de apoio plantado, rolamento do pé (calcanhar -> plano -> ponta), quadril em arco
// calculado pelo alcance das pernas, braços em oposição; para com os dois pés no chão.
import { scene, layer, pessoa, caminhada, rect, lin, kf, rep } from 'bamoonimation';

const CHAO = 900;
const M = { sexo: 'm', altura: 740, cabecas: 6.5, cabelo: 'curto', barba: 'curta', roupa: 'camisa', cores: { cima: '#d9a441', baixo: '#3b4252' } };
const F = { sexo: 'f', altura: 690, cabecas: 6.5, cabelo: 'coque', roupa: 'vestido', cores: { cima: '#5b7fb0', baixo: '#5b7fb0' } };
const PASSO = 0.36 * 740, DUTY = 0.6;
const x = kf([0.3, 200], [5.6, 200 + (3 + 0.5) * (PASSO / DUTY), 'sine']);
const xf = kf([0.6, -120], [5.9, -120 + (3 + 0.5) * ((0.36 * 690) / DUTY), 'sine']);
const ele = caminhada(M, { x, chao: CHAO, passo: PASSO, duty: DUTY });
const ela = caminhada(F, { x: xf, chao: CHAO, duty: DUTY });

export default scene({
  dur: 6.2,
  bg: lin(90, '#cfe0e8', '#efe6d6'),
  look: { haze: null, vignette: 0.2 },
  camera: { x: t => x.at(t) - 120, y: 560, zoom: 1 },
  layers: [layer([
    rect(-600, CHAO, 6000, 300, { fill: '#b9a588', shade: 0, hl: 0 }),
    ...rep(40, i => rect(-600 + i * 140, CHAO, 6, 300, { fill: '#a8957a', shade: 0, hl: 0 })),
    pessoa({ ...F, name: 'ela', x: t => xf.at(t), ground: CHAO, ...ela }),
    pessoa({ ...M, name: 'ele', x: t => x.at(t), ground: CHAO, ...ele }),
  ])],
});
