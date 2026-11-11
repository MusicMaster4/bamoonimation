// Regressão: um grupo com clip + alpha/blur não pode deixar o clip grudado no canvas do pool.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scene, layer, G, rect } from '../src/index.js';
import { Renderer } from '../src/render.js';

const sc = scene({
  dur: 2, bg: '#000', estilo: 'limpo',
  layers: [
    layer({ z: 1 }, [
      // clip num canto pequeno, isolado por alpha → usa canvas do pool
      G({ alpha: 0.5, clip: rect(0, 0, 100, 100) }, [rect(0, 0, 1920, 1080, { fill: '#f00' })]),
      // grupo isolado depois, desenhando longe do clip
      G({ alpha: 0.9 }, [rect(1500, 700, 400, 360, { fill: '#0f0' })]),
    ]),
  ],
});

test('clip de grupo isolado não vaza para os próximos quadros', () => {
  const r = new Renderer(sc, { scale: 0.25 });
  for (const T of [0, 1 / 30, 2 / 30]) {
    r.frame(T);
    const px = r.main.getContext('2d').getImageData(Math.round(1700 * r.s), Math.round(900 * r.s), 1, 1).data;
    assert.ok(px[1] > 150, `quadro t=${T}: verde sumiu (g=${px[1]})`);
  }
});
