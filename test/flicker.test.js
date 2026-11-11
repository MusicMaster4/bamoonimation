// Regressão: falha aleatória do desfoque (camada desfocada saindo vazia num quadro) não pode chegar ao vídeo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scene, layer, rect, circle, kf } from '../src/index.js';
import { Renderer } from '../src/render.js';

const sc = scene({
  dur: 2, bg: '#203040',
  camera: { dof: 8, vida: 0 },
  layers: [
    layer({ z: 3 }, [rect(-200, 500, 2400, 700, { fill: '#6a8a5a' })]),
    layer({ z: 1 }, [circle(kf([0, 400], [2, 1500]), 540, 120, { fill: '#e2574c' })]),
    layer({ z: 0.5 }, [rect(-300, 800, 900, 600, { fill: '#2f3a2a' })]), // primeiro plano desfocado
  ],
});

test('quadros com camada desfocada "sumida" são detectados e redesenhados', () => {
  const ref = new Renderer(sc, { scale: 0.25 });
  const r = new Renderer(sc, { scale: 0.25 });
  // injeta a falha: de tempos em tempos o desfoque não desenha nada (como o Skia faz, raramente)
  let n = 0;
  const draw = r.drawLayer.bind(r);
  r.drawLayer = (ctx, L, ...rest) => (L.z === 0.5 && ++n % 5 === 2 ? undefined : draw(ctx, L, ...rest));
  for (let f = 0; f < 30; f++) {
    const a = r.pixelsVerificado(f / 30, f), b = ref.pixels(f / 30, f);
    let m = 0;
    for (let i = 0; i < a.length; i += 4) m = Math.max(m, Math.abs(a[i] - b[i]));
    assert.ok(m <= 2, `quadro ${f}: difere da referência em ${m}`);
  }
  assert.ok(r.falhas > 0, 'a falha injetada foi detectada');
});

test('rng sorteado dentro de função de t é detectado (a cena piscaria)', async () => {
  const { scatter, RNG_MONITOR } = await import('../src/index.js');
  const ruim = scene({ dur: 1, bg: '#000', layers: [layer(scatter(5, 1, r => circle(100, 100, 5, { fill: '#fff', alpha: t => r() })))] });
  const bom = scene({ dur: 1, bg: '#000', layers: [layer(scatter(5, 1, r => { const a = r(); return circle(100, 100, 5, { fill: '#fff', alpha: () => a }); }))] });
  RNG_MONITOR.misuse = 0;
  new Renderer(bom, { scale: 0.1 }).frame(0.5);
  assert.equal(RNG_MONITOR.misuse, 0);
  new Renderer(ruim, { scale: 0.1 }).frame(0.5);
  assert.ok(RNG_MONITOR.misuse > 0);
});
