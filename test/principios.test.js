// Princípios da animação no motor: interpolação auto, atuação, molas e atuação dos rigs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kf, acao, segue, quica, skeleton, rig, solveRig, scene, layer, G, circle, rect } from '../src/index.js';
import { Renderer } from '../src/render.js';

const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

test('kf auto: 2 chaves = inOut clássico; chave de passagem não para', () => {
  const two = kf([0, 0], [1, 10]);
  assert.ok(near(two.at(0.5), 5));
  assert.ok(near(two.at(0.25), 10 * 4 * 0.25 ** 3));
  const pass = kf([0, 0], [1, 10], [2, 20]);
  const v = (pass.at(1.01) - pass.at(0.99)) / 0.02;
  assert.ok(v > 5, `velocidade na chave de passagem = ${v}`);
  const ext = kf([0, 0], [1, 10], [2, 0]);
  assert.ok(Math.abs((ext.at(1.001) - ext.at(0.999)) / 0.002) < 0.05, 'extremo repousa');
  assert.ok(ext.at(1.5) <= 10 && ext.at(0.5) <= 10, 'monótono: não passa do valor da chave');
});

test('kf: easing explícito mantém o comportamento clássico', () => {
  const k = kf([0, 0], [1, 10, 'linear']);
  assert.ok(near(k.at(0.3), 3));
});

test('acao: antecipa (recua) e passa do alvo nos trechos rápidos, termina exato', () => {
  const f = acao(kf([0, 0], [0.5, 0], [0.9, 100], [2, 100]));
  let lo = Infinity, hi = -Infinity;
  for (let t = 0.5; t <= 0.9; t += 0.005) {
    lo = Math.min(lo, f(t));
    hi = Math.max(hi, f(t));
  }
  assert.ok(lo < -3, `antecipação ${lo}`);
  assert.ok(hi > 103, `overshoot ${hi}`);
  assert.ok(near(f(0.9), 100, 1e-6) && near(f(1.5), 100));
  // movimento lento: quase sem antecipação
  const s = acao(kf([0, 0], [3, 100]));
  let lo2 = 0;
  for (let t = 0; t <= 3; t += 0.01) lo2 = Math.min(lo2, s(t));
  assert.ok(lo2 > -3, `lento ${lo2}`);
});

test('acao polar: interpola em arco (raio constante)', () => {
  const f = acao(kf([0, [100, 0]], [1, [0, 100]]), { polar: [0, 0], antecipa: 0, passa: 0 });
  for (const t of [0.2, 0.5, 0.8]) {
    const [x, y] = f(t);
    assert.ok(near(Math.hypot(x, y), 100, 1e-6));
  }
});

test('segue: persegue com overshoot e assenta exatamente', () => {
  const f = segue(t => (t < 0.5 ? 0 : 1), { freq: 2, amort: 0.4 });
  let hi = 0;
  for (let t = 0.5; t < 1.5; t += 0.01) hi = Math.max(hi, f(t));
  assert.ok(hi > 1.05);
  assert.ok(near(f(4), 1, 1e-6));
});

test('quica: toca o chão nos impactos e perde altura', () => {
  const q = quica({ altura: 400, queda: 0.5, chao: 900, t0: 0 });
  assert.ok(near(q.y(q.impactos[0]), 900, 1e-6));
  const apex = t => 900 - q.y(t);
  const mid1 = (q.impactos[0] + q.impactos[1]) / 2;
  assert.ok(apex(mid1) < 400 * 0.6 && apex(mid1) > 400 * 0.4);
});

test('rig: atuação não altera a pose crua checada e pé de apoio fica fixo', () => {
  const bones = skeleton('humano', { altura: 700 });
  const pose = kf([0, 180], [0.5, 180], [0.8, 60], [2, 60]);
  const r = rig({ bones, pose: { bracoN: pose }, ik: [{ chain: ['coxaN', 'canelaN', 'peN'], target: [20, 330], endAng: 0 }] });
  const r0 = rig({ bones, acao: false, pose: { bracoN: pose }, ik: [{ chain: ['coxaN', 'canelaN', 'peN'], target: [20, 330], endAng: 0 }] });
  for (const t of [0.6, 0.7, 0.8, 1.2]) {
    const a = solveRig(r, t, {}), b = solveRig(r0, t, {});
    assert.equal(a.issues.length, b.issues.length, 'issues vêm da pose crua');
    const pa = a.S.get('peN'), pb = b.S.get('peN');
    assert.ok(near(pa.x1, pb.x1, 1e-6) && near(pa.y1, pb.y1, 1e-6), 'pé de apoio intacto');
  }
  // o braço (atuado) difere do cru durante o gesto
  const d = Math.abs(solveRig(r, 0.62, {}).S.get('bracoN').rel - solveRig(r0, 0.62, {}).S.get('bracoN').rel);
  assert.ok(d > 1, `atuação no braço: ${d}`);
});

test('render: mola e squash produzem deformação e não quebram quadros', () => {
  const ball = quica({ x0: 200, chao: 800, altura: 400, t0: 0, queda: 0.4 });
  const sc = scene({
    dur: 2, bg: '#fff', look: { estilo: 'limpo' },
    layers: [layer([
      rect(-200, 800, 2400, 400, { fill: '#888' }),
      G({ ...ball }, [circle(0, -50, 50, { fill: '#f00' })]),
      G({ x: kf([0, 600], [0.5, 1000]), y: 300 }, [G({ mola: { freq: 1.5, amort: 0.2 }, px: 0, py: 0 }, [rect(-5, 0, 10, 200, { fill: '#00f' })])]),
    ])],
  });
  const r = new Renderer(sc, { scale: 0.5 });
  r.noDrift = true;
  const box = t => {
    r.frame(t);
    const { data, width, height } = r.main.getContext('2d').getImageData(0, 0, r.W, r.H);
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (data[i] > 180 && data[i + 1] < 90 && data[i + 2] < 90) {
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
      }
    return { w: x1 - x0, h: y1 - y0 };
  };
  const fall = box(0.33), hit = box(ball.impactos[0]);
  assert.ok(fall.h > fall.w * 1.05, `estica na queda: ${JSON.stringify(fall)}`);
  assert.ok(hit.w > hit.h * 1.15, `achata no impacto: ${JSON.stringify(hit)}`);
});
