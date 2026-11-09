// Teste do estilo PADRÃO: nenhuma configuração de look/câmera além do mínimo.
// Tudo o que deixa o quadro com cara de ilustração vem do motor.
import { scene, layer, G, blob, circle, rect, taper, kf, osc, pessoa, ave, bater } from 'bamoonimation';

const CHAO = 900;
const M = { sexo: 'f', altura: 640, cabelo: 'ondulado', roupa: 'vestido', cores: { cima: '#c8573f', baixo: '#c8573f' } };
const morro = (y, a, cor) => blob([[-500, 1500], [-500, y], [300, y - a], [900, y + a * 0.3], [1500, y - a * 0.7], [2400, y], [2400, 1500]], { fill: cor });

export default scene({
  dur: 4,
  bg: ['#9ec3e0', '#f6dcb4'],
  camera: { x: kf([0, 920], [4, 1000]) },
  layers: [
    layer({ z: 8 }, [circle(1450, 330, 90, { fill: '#fff4d6', glow: 60 }), morro(700, 120, '#8fa7b0')]),
    layer({ z: 3 }, [morro(800, 80, '#6f9a6a'), G({ x: 420, y: 790, rot: osc(0.3, 1.5) }, [taper([[0, 0], [0, -200]], [26, 14], { fill: '#5a3e30' }), circle(0, -250, 90, { fill: '#4f7d4a' })])]),
    layer({ z: 1 }, [
      rect(-600, CHAO, 3200, 500, { fill: '#7ea04e' }),
      blob([[1100, CHAO], [1150, 820], [1300, 790], [1420, 840], [1460, CHAO]], { fill: '#8a8a94' }),
      pessoa({ ...M, x: 820, y: CHAO - pessoa.quadril(M), ground: CHAO, ik: { maoN: [40, -330], angMaoN: -80 }, rosto: { sorriso: 1 } }),
      ave({ tipo: 'passaro', x: kf([0, 300], [4, 1500]), y: 380, s: 0.25, asa: t => bater(t, 3) }),
    ]),
    layer({ z: 0.5 }, [blob([[-400, 1300], [-400, 1000], [200, 1040], [450, 1300]], { fill: '#2f3a2a' })]),
  ],
});
