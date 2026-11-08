// Prancha de referência das figuras base: homem e mulher em pose de descanso + poses de teste.
import { scene, layer, pessoa, rect, lin } from 'bamoonimation';

const CHAO = 980;
const yOf = o => CHAO - pessoa.quadril(o);
const M = { sexo: 'm', altura: 740, cabecas: 6.5, barba: 'curta', oculos: true };
const F = { sexo: 'f', altura: 700, cabecas: 6.5 };

export default scene({
  dur: 2,
  bg: lin(90, '#e9dcc8', '#d8c6ae'),
  look: { grain: 0, vignette: 0, haze: null },
  layers: [layer([
    rect(-100, CHAO, 2200, 200, { fill: '#b89f80', shade: 0, hl: 0 }),
    pessoa({ ...M, name: 'homem', x: 260, y: yOf(M), ground: CHAO }),
    pessoa({ ...F, name: 'mulher', x: 620, y: yOf(F), ground: CHAO }),
    // andando (meio passo), braços em contrafase
    pessoa({ ...M, name: 'andando', x: 980, y: yOf(M) + 14, ground: CHAO, cores: { cima: '#7a4a3a' },
      ik: { peN: [70, pessoa.quadril(M) - 42], peF: [-62, pessoa.quadril(M) - 70], angPeF: 18 }, pose: { bracoN: 205, bracoF: 160, antebracoN: -25, antebracoF: -20, tronco: -86 } }),
    // sentada (assento na altura do joelho)
    pessoa({ ...F, name: 'sentada', x: 1380, y: CHAO - 175, ground: CHAO, cabelo: 'coque', cores: { cima: '#c8573f', baixo: '#c8573f' },
      ik: { peN: [150, 175 - 26], peF: [120, 175 - 26], maoN: [120, -60], angMaoN: 20, maoF: [100, -40] }, pose: { tronco: -84 } }),
    // braço levantado (acenando)
    pessoa({ ...M, name: 'acenando', x: 1740, y: yOf(M), ground: CHAO, cabelo: 'careca', barba: 'cheia', oculos: false, roupa: 'camisa', cores: { cima: '#e7d9b8', baixo: '#3c4a3a' },
      ik: { maoN: [60, -420], angMaoN: -80 }, rosto: { sorriso: 1 } }),
  ])],
});
