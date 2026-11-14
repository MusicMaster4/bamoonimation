// Peça única (personagem pintado como um corpo só), expressões prontas e jeitos de andar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scene, layer, rect, pessoa, caminhada, kf, EXPRESSOES, expressao, rostoCanais, JEITOS, solveRig } from '../src/index.js';
import { Renderer } from '../src/render.js';

const CHAO = 900;
const M = { sexo: 'm', altura: 700 };
const cena = look => scene({
  dur: 1, look: { grain: 0, ...look },
  layers: [layer([rect(-100, CHAO, 2200, 200, { fill: '#b89f80' }), pessoa({ ...M, x: 900, y: CHAO - pessoa.quadril(M), ground: CHAO, ik: { maoN: [60, -300] } })])],
});
const px = (r, x, y) => {
  const d = r.frame(0.5).getContext('2d').getImageData(x * r.s, y * r.s, 1, 1).data;
  return [d[0], d[1], d[2]];
};

test('peça única: determinística, sem halo fora do corpo e diferente das peças soltas', () => {
  const a = new Renderer(cena({}), { scale: 0.5 });
  const b = new Renderer(cena({}), { scale: 0.5 });
  const sem = new Renderer(cena({ unido: false }), { scale: 0.5 });
  const fa = Buffer.from(a.pixels(0.5)), fb = Buffer.from(b.pixels(0.5)), fs = Buffer.from(sem.pixels(0.5));
  assert.ok(fa.equals(fb), 'o mesmo quadro sai sempre igual');
  assert.ok(!fa.equals(fs), 'unido muda o acabamento do personagem');
  // fundo longe do personagem não é tocado (nenhum resto de máscara/sombra fora do corpo)
  assert.deepEqual(px(a, 300, 300), px(sem, 300, 300));
  assert.deepEqual(px(a, 1500, 700), px(sem, 1500, 700));
});

test('expressões: todas válidas, troca suave e canais somados à mão', () => {
  assert.ok(Object.keys(EXPRESSOES).length >= 12);
  for (const e of Object.keys(EXPRESSOES)) assert.ok(expressao(e)(0), e);
  assert.throws(() => expressao('inexistente'));
  const f = expressao([[0, 'neutro'], [1, 'feliz']]);
  assert.equal(f(0.5).sorriso, 0);
  assert.ok(Math.abs(f(3).sorriso - EXPRESSOES.feliz.sorriso) < 1e-9);
  const meio = f(1.2).sorriso;
  assert.ok(meio > 0 && meio < EXPRESSOES.feliz.sorriso * 1.15, `troca ${meio}`);
  const C = rostoCanais({ expressao: 'triste', sorriso: 0.3 });
  assert.ok(Math.abs(C(0).sorriso - (EXPRESSOES.triste.sorriso + 0.3)) < 1e-9);
});

test('jeitos de andar: pés respeitam os limites do tornozelo', () => {
  for (const j of Object.keys(JEITOS)) {
    const x = kf([0, 0], [4, 1400 * (JEITOS[j].passo ?? 1)]);
    const p = pessoa({ ...M, x: t => x.at(t), ground: CHAO, ...caminhada(M, { x, chao: CHAO, jeito: j }) });
    for (let t = 0; t <= 4; t += 0.1) {
      const lim = solveRig(p, t, {}, { check: true }).issues.filter(i => i.kind === 'limite');
      assert.equal(lim.length, 0, `${j} t=${t.toFixed(1)}: ${lim.map(i => `${i.bone} ${i.val.toFixed(0)}`).join(', ')}`);
    }
  }
});
