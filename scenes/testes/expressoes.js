// Prancha de referência das EXPRESSÕES prontas: pessoa({ rosto: { expressao: 'nome' } }).
// Cada busto mostra uma expressão (a cabeça também inclina com ela). Ver EXPRESSOES em src/pessoa.js.
import { scene, layer, G, pessoa, rect, lin, EXPRESSOES } from 'bamoonimation';

const nomes = Object.keys(EXPRESSOES);
const M = { sexo: 'm', altura: 980, barba: 'curta', cabelo: 'curto', roupa: 'camisa', cores: { cima: '#5b7fb0' } };
const F = { sexo: 'f', altura: 940, cabelo: 'coque', roupa: 'blusa', cores: { cima: '#c8573f', baixo: '#3a3f58' } };

export default scene({
  dur: 2,
  bg: lin(90, '#efe4d2', '#dccab0'),
  look: { grain: 0, vignette: 0, haze: null },
  layers: [layer(nomes.map((e, i) => {
    const o = i % 2 ? F : M, col = i % 5, row = Math.floor(i / 5);
    const topo = row * 270 + 30; // topo da cabeça
    return G({ clip: rect(col * 384 + 4, row * 270 + 4, 376, 262), x: 0 }, [
      rect(col * 384 + 4, row * 270 + 4, 376, 262, { fill: '#e8dccb', shade: 0, hl: 0, tex: false, luz: false }),
      pessoa({ ...o, name: e, x: col * 384 + 150, y: topo + o.altura * 0.47, rosto: { expressao: e, piscar: 7 + i } }),
    ]);
  }))],
});
