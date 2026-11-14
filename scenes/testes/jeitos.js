// Prancha dos JEITOS de andar prontos: caminhada(M, { x, chao, jeito }). Cada faixa mostra um jeito.
import { scene, layer, G, pessoa, caminhada, rect, lin, kf, JEITOS } from 'bamoonimation';

const nomes = Object.keys(JEITOS);
const DUR = 6;
const pessoas = nomes.map((j, i) => {
  const lane = Math.floor(i / 2), lado = i % 2;
  const chao = 250 + lane * 262;
  const P = i % 2 ? { sexo: 'f', altura: 220, cabelo: 'coque', cores: { cima: '#2e8a83', baixo: '#2e8a83' } } : { sexo: 'm', altura: 230, roupa: 'camisa', cores: { cima: '#d9a441', baixo: '#3b4252' } };
  const x0 = 80 + lado * 960;
  const x = kf([0.3, x0], [DUR - 0.3, x0 + 640 * (JEITOS[j].passo ?? 1), 'sine']);
  const passos = caminhada(P, { x, chao, jeito: j });
  return [rect(lado * 960, chao, 960, 12, { fill: '#b9a588', shade: 0, hl: 0 }), pessoa({ ...P, name: j, x: t => x.at(t), ground: chao, ...passos })];
});

export default scene({
  dur: DUR,
  bg: lin(90, '#cfe0e8', '#efe6d6'),
  look: { haze: null, vignette: 0.1 },
  camera: { vida: 0 },
  layers: [layer(pessoas.flat())],
});
