// Cena mínima de exemplo: colinas em camadas, sol, árvore balançando, nuvens, folhas ao vento.
import { scene, layer, G, blob, circle, ellipse, rect, taper, particles, rays, kf, osc, wig, lin, rad, scatter } from 'bamoonimation';

const hill = (y, amp, col, seed) =>
  blob(
    [[-300, 1300], [-300, y], [200, y - amp], [700, y + amp * 0.4], [1200, y - amp * 0.8], [1700, y + amp * 0.2], [2250, y - amp], [2250, 1300]],
    { fill: col },
  );

const tree = (x, y, s) =>
  G({ x, y, s, rot: osc(0.3, 1.2), px: 0, py: 0 }, [
    taper([[0, 0], [-6, -120], [4, -240]], [34, 18], { fill: '#5b3a3a' }),
    G({ fill: '#3f7a52' }, [
      blob([[-110, -260], [-60, -380], [40, -420], [130, -330], [120, -230], [10, -190]]),
      blob([[-150, -230], [-120, -300], [-40, -290], [-30, -200], [-110, -180]]),
    ]),
  ]);

export default scene({
  dur: 6,
  bg: lin(90, '#f6c58f', '#f3a283', '#c8708a'),
  camera: { x: kf([0, 900], [6, 1020]), zoom: kf([0, 1], [6, 1.08]), dof: 6 },
  look: { sun: [0.6, -0.8], haze: { c: '#f2b59a', a: 0.6 } },
  layers: [
    layer({ z: 8 }, [
      circle(1450, 380, 120, { fill: '#fff1c9', glow: { r: 60, a: 0.9 }, shade: 0, hl: 0 }),
      ...scatter(4, 3, (r, i) =>
        G({ x: wig(0.05, 60, i, 300 + i * 450), y: 180 + r() * 160, fill: '#ffe2cf', hl: 0 }, [
          ellipse(0, 0, 120, 34), ellipse(-50, -20, 60, 40), ellipse(40, -26, 70, 46),
        ]),
      ),
    ]),
    layer({ z: 4 }, [hill(700, 90, '#b46a7e', 1)]),
    layer({ z: 2 }, [hill(800, 70, '#8a5a7a', 2), tree(400, 820, 0.6)]),
    layer({ z: 1 }, [
      hill(900, 50, '#5d4a6e', 3),
      tree(1200, 930, 1),
      rays({ at: [1450, 380], ang: 160, spread: 50, n: 6, len: 1400, w: [80, 200], a: 0.18 }),
    ]),
    layer({ z: 0.6 }, [
      particles({ rate: 6, life: [3, 5], at: [2000, 300], area: [100, 800], dir: 175, spread: 20, speed: [250, 380], size: [6, 10], color: ['#e2795a', '#f0b05a'], turb: 60, spin: 200, stretch: 0.3, shade: 0 }),
      blob([[-100, 1100], [-100, 960], [300, 1000], [600, 1100]], { fill: '#2f2440' }),
    ]),
  ],
});
