// Verificador (bamoo check): amostra o filme no tempo e aponta problemas de camadas, texto e anatomia.
// Saída curta e objetiva, pensada para o agente corrigir em poucas iterações.

import canvas from '@napi-rs/canvas';
import { Renderer } from './render.js';
import { RNG_MONITOR } from './anim.js';
import { PLAN_RULES } from './anatomy.js';
import { normBones } from './rig.js';

const { createCanvas } = canvas;

const { hypot, max, abs, cos, sin, PI } = Math;
const D = PI / 180;

function ranges(ts, step) {
  if (!ts.length) return '';
  ts.sort((a, b) => a - b);
  const out = [];
  let a = ts[0], b = ts[0];
  for (let i = 1; i < ts.length; i++) {
    if (ts[i] - b <= step * 1.6) b = ts[i];
    else {
      out.push([a, b]);
      a = b = ts[i];
    }
  }
  out.push([a, b]);
  const fmt = ([x, y]) => (y - x < 1e-6 ? `${x.toFixed(2)}s` : `${x.toFixed(2)}–${y.toFixed(2)}s`);
  return out.length > 4 ? out.slice(0, 4).map(fmt).join(', ') + ` (+${out.length - 4})` : out.map(fmt).join(', ');
}

// diferença média de luminância (0..255, quadro em 48×27) abaixo da qual o quadro é considerado parado
const STILL_THR = Number(process.env.BAMOO_STILL_THR ?? 0.008);

const pick = (bones, base) => bones.find(b => b.name === base + 'N') ?? bones.find(b => b.name === base + 'F') ?? bones.find(b => b.name === base);

/**
 * Verifica um filme/cena. Retorna { lines, errors, warnings }.
 * opts: fps (amostragem, padrão 12), allowText (não reclamar de texto)
 */
export function checkFilm(root, { fps = 12, allowText = false } = {}) {
  const r = new Renderer(root, { scale: 0.18, fps });
  r.probe = { rigs: [], texts: [] };
  r.noDrift = true; // "nada parado" mede o movimento da CENA, não a deriva automática da câmera
  const out = [];
  let errors = 0, warnings = 0;
  const err = m => (out.push('✖ ' + m), errors++);
  const warn = m => (out.push('⚠ ' + m), warnings++);
  const ok = m => out.push('✔ ' + m);
  const step = 1 / fps;

  // ---------- estático: camadas e legendas ----------
  let layerOk = true, caps = 0;
  r.timeline.forEach(({ sc, i }) => {
    const L = Array.isArray(sc.layers) ? sc.layers : [];
    const zs = L.map((l, k) => ({ k, z: typeof l.z === 'number' ? l.z : null, fixed: !!l.fixed })).filter(o => !o.fixed && o.z !== null);
    for (let k = 1; k < zs.length; k++) {
      if (zs[k].z > zs[k - 1].z + 1e-9) {
        layerOk = false;
        err(`plano ${i}: camada #${zs[k].k} (z=${zs[k].z}) vem depois da #${zs[k - 1].k} (z=${zs[k - 1].z}) — ficará NA FRENTE mesmo sendo mais distante. Liste do fundo (z maior) para a frente (z menor).`);
      }
    }
    const fixedBefore = L.findIndex(l => l.fixed);
    if (fixedBefore >= 0 && L.slice(fixedBefore + 1).some(l => !l.fixed)) warn(`plano ${i}: camada fixa (HUD) antes de camadas de cena — ela ficará por baixo delas.`);
    if (sc.captions?.length) caps += sc.captions.length;
  });
  if (layerOk) ok('camadas em ordem (fundo → frente)');

  // ---------- dinâmico: amostragem ----------
  const N = Math.max(1, Math.ceil(r.dur * fps));
  // assinatura de cada quadro em 48×27 (luminância) para achar trechos parados
  const sigC = createCanvas(48, 27), sigX = sigC.getContext('2d');
  const motion = [];
  let prevSig = null;
  // aleatoriedade recalculada a cada quadro (pisca): rng de fora chamado no render, ou Math.random
  RNG_MONITOR.misuse = 0;
  let mathRandom = 0;
  const realRandom = Math.random;
  Math.random = () => (RNG_MONITOR.rendering > 0 && mathRandom++, realRandom());
  for (let f = 0; f <= N; f++) {
    const T = Math.min(f * step, r.dur - 1e-3);
    const cv = r.frame(T, f);
    sigX.drawImage(cv, 0, 0, 48, 27);
    const d = sigX.getImageData(0, 0, 48, 27).data, sig = new Float32Array(48 * 27);
    for (let i = 0; i < sig.length; i++) sig[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
    if (prevSig) {
      let s = 0;
      for (let i = 0; i < sig.length; i++) s += Math.abs(sig[i] - prevSig[i]);
      motion.push({ t: T, scene: r.curScene, d: s / sig.length });
    }
    prevSig = sig;
  }
  Math.random = realRandom;
  // determinismo: o mesmo quadro desenhado duas vezes tem que sair igual (senão o vídeo pisca)
  const naoDet = [];
  const probe = r.probe;
  r.probe = null; // estes quadros extras (fora de ordem) não entram nas amostras dos rigs
  for (const T of [0.37, 0.61, 0.83].map(u => u * r.dur)) {
    const grab = () => {
      const cv = r.frame(T);
      return cv.getContext('2d').getImageData(0, 0, r.W, r.H).data;
    };
    const a = grab(), b = grab();
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let i = 0; i < a.length; i += 4) {
      if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 12) {
        const p = i / 4, X = p % r.W, Y = (p / r.W) | 0;
        x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y);
      }
    }
    if (x1 >= 0) naoDet.push(`${T.toFixed(2)}s na região x ${Math.round(x0 / r.s)}–${Math.round(x1 / r.s)}, y ${Math.round(y0 / r.s)}–${Math.round(y1 / r.s)}`);
  }
  r.probe = probe;
  if (RNG_MONITOR.misuse || mathRandom || naoDet.length) {
    err(`a cena NÃO é determinística — o vídeo vai piscar${RNG_MONITOR.misuse ? ` (rng criado na montagem e chamado dentro de função de t ${RNG_MONITOR.misuse}×)` : ''}${mathRandom ? ` (Math.random no render ${mathRandom}×)` : ''}${naoDet.length ? `; o mesmo quadro sai diferente em ${naoDet.join('; ')}` : ''}. Sorteie UMA vez fora da função: scatter(n, seed, r => { const ph = r(); return nó({ x: t => ... + ph }) }) e use noise()/hash() para variar no tempo.`);
  } else ok('determinística (o mesmo quadro sai sempre igual — sem pisca-pisca)');

  const texts = r.probe.texts;
  if ((caps || texts.length) && !allowText) {
    const uniq = [...new Set(texts.map(x => `"${x.str}"`))].slice(0, 5);
    err(`texto na tela: ${caps} legenda(s)${texts.length ? `, textos ${uniq.join(', ')}` : ''}. A regra padrão é NÃO usar texto (use --allow-text se o pedido incluir texto).`);
  } else if (!caps && !texts.length) ok('sem texto na tela');

  // ---------- rigs ----------
  const bigH = new Map(); // maior personagem do plano focal em cada amostra (staging)
  const groups = new Map();
  for (const p of r.probe.rigs) {
    const k = `${p.scene}|${p.rig.id}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  if (!groups.size) out.push('· nenhum rig (esqueleto) nas cenas — personagens sem rig não têm checagem de anatomia');
  for (const list of groups.values()) {
    const { rig, name, scene } = list[0];
    const tag = `rig "${name}"${rig.plan ? ` (${rig.plan})` : ''} no plano ${scene}`;
    const bones = rig._bones ?? normBones(rig.bones);
    let problems = 0;
    // proporções
    for (const [A, B, mn, mx, why] of PLAN_RULES[rig.plan] ?? []) {
      const la = A.map(n => pick(bones, n)), lb = B.map(n => pick(bones, n));
      if (la.some(b => !b) || lb.some(b => !b)) continue;
      const ratio = la.reduce((s, b) => s + b.len, 0) / lb.reduce((s, b) => s + b.len, 0);
      if (ratio < mn || ratio > mx) {
        problems++;
        warn(`${tag}: proporção ${A.join('+')}/${B.join('+')} = ${ratio.toFixed(2)} (esperado ${mn}–${mx}: ${why})`);
      }
    }
    // simetria e limites ausentes
    for (const b of bones) {
      if (b.name.endsWith('N')) {
        const f = bones.find(x => x.name === b.name.slice(0, -1) + 'F');
        if (f && abs(f.len - b.len) / max(f.len, b.len, 1e-6) > 0.03) {
          problems++;
          warn(`${tag}: "${b.name}" (${b.len.toFixed(0)}) e "${f.name}" (${f.len.toFixed(0)}) deveriam ter o mesmo comprimento`);
        }
      }
    }
    const noLim = bones.filter(b => b.p && b.len > 0 && b.min === undefined && b.max === undefined).map(b => b.name);
    if (rig.plan && noLim.length) warn(`${tag}: ossos sem limite articular: ${noLim.join(', ')} (use skeleton(...) ou defina min/max)`);
    // limites violados e alcance
    const lim = new Map(), reach = new Map();
    for (const p of list) {
      for (const is of p.issues) {
        if (is.kind === 'limite') {
          const e = lim.get(is.bone) ?? { ts: [], worst: is };
          e.ts.push(p.t);
          const over = x => max(x.min - x.val, x.val - x.max);
          if (over(is) > over(e.worst)) e.worst = is;
          lim.set(is.bone, e);
        } else if (is.kind === 'alcance') {
          const k = is.chain.join('>');
          const e = reach.get(k) ?? { ts: [], worst: is };
          e.ts.push(p.t);
          if (is.d - is.reach > e.worst.d - e.worst.reach) e.worst = is;
          reach.set(k, e);
        }
      }
    }
    for (const [bone, e] of lim) {
      problems++;
      const w = e.worst;
      err(`${tag}: articulação "${bone}" fora do limite (${w.val.toFixed(0)}°, permitido ${w.min}…${w.max}) em ${ranges(e.ts, step)} — pose anatomicamente impossível (foi travada no limite)`);
    }
    for (const [ch, e] of reach) {
      problems++;
      const w = e.worst;
      warn(`${tag}: alvo IK de ${ch} fora de alcance (${w.d.toFixed(0)} > ${w.reach.toFixed(0)}) em ${ranges(e.ts, step)} — o membro estica até o limite; aproxime o alvo ou o corpo`);
    }
    // chão: afundar / deslizar
    const contact = bones.filter(b => b.contact);
    const hasGround = list.some(p => p.ground !== undefined);
    if (contact.length && !hasGround) out.push(`· ${tag}: defina ground (y do chão na camada) para checar pés afundando/deslizando`);
    if (contact.length && hasGround) {
      const sink = new Map(), slide = new Map();
      const size = bones.reduce((s, b) => s + b.len, 0) / bones.length || 10;
      const tol = max(3, size * 0.05);
      for (const b of contact) {
        // pontos de contato (calcanhar/tornozelo e ponta) no chão, por amostra
        const seq = list.filter(p => p.ground !== undefined).map(p => {
          const s = p.S.get(b.name);
          const sole = b.sole ?? 0, nx = -sin(s.abs * D) * sole, ny = cos(s.abs * D) * sole;
          const pts = [[s.x0 + nx, s.y0 + ny], [s.x1 + nx, s.y1 + ny]].map(([x, y]) => [p.M.a * x + p.M.c * y + p.M.e, p.M.b * x + p.M.d * y + p.M.f]);
          const lo = pts[0][1] > pts[1][1] ? pts[0] : pts[1];
          if (lo[1] > p.ground + tol) (sink.get(b.name) ?? sink.set(b.name, []).get(b.name)).push(p.t);
          return { t: p.t, pts, on: pts.map(q => abs(q[1] - p.ground) <= max(2, size * 0.03)) };
        });
        // deslize: um MESMO ponto encostado no chão em 3 amostras seguidas que anda na horizontal
        for (let k = 1; k + 1 < seq.length; k++) {
          const a = seq[k - 1], c = seq[k + 1];
          if (c.t - a.t > step * 2.5) continue;
          for (const i of [0, 1]) {
            if (!(a.on[i] && seq[k].on[i] && c.on[i])) continue;
            if (abs(c.pts[i][0] - a.pts[i][0]) > max(8, size * 0.1)) {
              (slide.get(b.name) ?? slide.set(b.name, []).get(b.name)).push(seq[k].t);
              break;
            }
          }
        }
      }
      for (const [b, ts] of sink) {
        problems++;
        warn(`${tag}: "${b}" afunda no chão em ${ranges(ts, step)} (ajuste y do personagem ou o alvo do pé)`);
      }
      for (const [b, ts] of slide) {
        problems++;
        warn(`${tag}: "${b}" desliza no chão em ${ranges(ts, step)} (pé de apoio deve ficar parado — use gait() dirigido pela distância)`);
      }
    }
    // saltos (teleportes) das juntas
    const pops = new Map();
    for (const b of bones) {
      const P = list.map(p => {
        const s = p.S.get(b.name);
        return { t: p.t, x: p.M.a * s.x1 + p.M.c * s.y1 + p.M.e, y: p.M.b * s.x1 + p.M.d * s.y1 + p.M.f };
      });
      const d = P.map((q, k) => (k && q.t - P[k - 1].t <= step * 1.5 ? hypot(q.x - P[k - 1].x, q.y - P[k - 1].y) : 0));
      for (let k = 1; k < d.length; k++) {
        // teleporte: um deslocamento enorme cercado de deslocamentos pequenos (movimento rápido contínuo não conta)
        const nb = (d[k - 1] ?? 0) + (d[k + 1] ?? 0);
        if (d[k] > 60 && d[k] > 5 * max(nb, 8)) (pops.get(b.name) ?? pops.set(b.name, []).get(b.name)).push(P[k].t);
      }
    }
    if (pops.size) {
      problems++;
      const [b, ts] = [...pops][0];
      warn(`${tag}: salto brusco de posição (teleporte) em "${b}"${pops.size > 1 ? ` e mais ${pops.size - 1} osso(s)` : ''} em ${ranges(ts, step)} — keyframe faltando ou troca de pose instantânea`);
    }
    // ---------- princípios de animação (o que dá para medir) ----------
    const sc0 = Math.sqrt(Math.abs(list[0].M.a * list[0].M.d - list[0].M.b * list[0].M.c)) || 1;
    const Hs = bones.reduce((s, b) => s + b.len, 0) * 0.45 * sc0 || 100; // "tamanho" do personagem (px da camada)
    const childOf = new Set(bones.map(b => b.p).filter(Boolean));
    const onScreen = p => !p.bb || (p.bb[2] > 0 && p.bb[0] < r.W && p.bb[3] > 0 && p.bb[1] < r.H);
    const pts = b => list.map(p => {
      const s = p.S.get(b.name);
      return { t: p.t, x: p.M.a * s.x1 + p.M.c * s.y1 + p.M.e, y: p.M.b * s.x1 + p.M.d * s.y1 + p.M.f };
    });
    // SLOW IN / SLOW OUT: extremidade que sai do repouso a toda velocidade (ou para de golpe) num único passo
    const abrupt = new Map();
    for (const b of bones) {
      if (childOf.has(b.name) || b.apoio || b.contact || !(b.len > 0) || pops.has(b.name)) continue;
      const P = pts(b);
      // velocidade por passo (só com o personagem visível)
      const v = P.map((q, k) => (k && q.t - P[k - 1].t <= step * 1.5 && onScreen(list[k]) ? hypot(q.x - P[k - 1].x, q.y - P[k - 1].y) / (q.t - P[k - 1].t) : NaN));
      for (let k = 2; k + 1 < v.length; k++) {
        const [a, b0, c, d] = [v[k - 1], v[k], v[k + 1], v[k - 2]];
        if ([a, b0, c].some(Number.isNaN)) continue;
        // arranque brusco: do repouso direto para a velocidade de cruzeiro (sem fase de aceleração)
        const start = a < 0.08 * Hs && b0 > 1.1 * Hs && c < 1.3 * b0 && c > 0.6 * b0;
        // parada brusca: em cruzeiro e, num passo, parado
        const stop = b0 < 0.08 * Hs && a > 1.1 * Hs && !Number.isNaN(d) && d > 0.6 * a && d < 1.3 * a;
        if (start || stop) (abrupt.get(b.name) ?? abrupt.set(b.name, []).get(b.name)).push(P[k - 1].t);
      }
    }
    if (abrupt.size) {
      problems++;
      const [b, ts] = [...abrupt][0];
      warn(`${tag}: começo/parada brusca (sem slow in/out) em "${b}"${abrupt.size > 1 ? ` e mais ${abrupt.size - 1}` : ''} em ${ranges(ts, step)} — use kf sem easing (auto) ou 'inOut'/'sine'; evite 'linear' e trocas instantâneas`);
    }
    // TWINNING (appeal): membros N e F fazendo exatamente a mesma coisa
    const twins = [];
    for (const b of bones) {
      if (!b.name.endsWith('N') || b.apoio || !(b.len > 0)) continue;
      const f = bones.find(x => x.name === b.name.slice(0, -1) + 'F');
      if (!f) continue;
      const aN = list.map(p => p.S.get(b.name).rel), aF = list.map(p => p.S.get(f.name).rel);
      const range = Math.max(...aN) - Math.min(...aN);
      const diff = aN.reduce((s, v, i) => s + Math.abs(v - aF[i]), 0) / aN.length;
      if (range > 12 && diff < 2.5) twins.push(b.name.slice(0, -1));
    }
    if (twins.length) {
      problems++;
      warn(`${tag}: "twinning" — ${twins.join(', ')} N e F fazem o mesmo movimento ao mesmo tempo (fica mecânico). Varie altura, ângulo ou tempo de um dos lados (o motor já defasa F em ${(rig.acao?.desfase ?? 0.035) * 1000} ms)`);
    }
    // MOVING HOLD: personagem completamente imóvel por muito tempo
    {
      // congelado = nenhuma junta sai de um raio de 0.6 px da posição em que o trecho começou
      const all = bones.filter(b => b.len > 0).map(pts);
      let run = 0, worst = 0, at = 0, a0 = 0;
      for (let k = 1; k < list.length; k++) {
        const dt = list[k].t - list[k - 1].t;
        const moved = dt > step * 1.5 || all.some(P => hypot(P[k].x - P[a0].x, P[k].y - P[a0].y) > 0.6);
        if (moved) {
          run = 0;
          a0 = k;
          continue;
        }
        run += dt;
        if (run > worst) { worst = run; at = list[k].t; }
      }
      if (worst >= 1.5) {
        problems++;
        warn(`${tag}: personagem congelado por ${worst.toFixed(1)} s (até ${at.toFixed(2)}s) — um "hold" precisa de vida: respiração, peso, olhar (rig: acao.vida; pessoa: vida)`);
      }
    }
    // STAGING: personagem do plano focal cortado pela borda ou pequeno demais
    const vis = list.filter(p => p.bb && p.focal);
    if (vis.length) {
      const W = r.W, H = r.H;
      const frac = p => {
        const [x0, y0, x1, y1] = p.bb, a = (x1 - x0) * (y1 - y0) || 1;
        return (Math.max(0, Math.min(x1, W) - Math.max(x0, 0)) * Math.max(0, Math.min(y1, H) - Math.max(y0, 0))) / a;
      };
      let run = 0, worst = 0, at = 0;
      for (let k = 0; k < vis.length; k++) {
        const fr = frac(vis[k]);
        if (fr < 0.2) { run = 0; continue; }
        const key = `${vis[k].scene}|${vis[k].t.toFixed(3)}`;
        bigH.set(key, Math.max(bigH.get(key) ?? 0, (vis[k].bb[3] - vis[k].bb[1]) / H));
        const dt = k ? vis[k].t - vis[k - 1].t : 0;
        run = fr < 0.6 && dt <= step * 1.5 ? run + dt : 0;
        if (run > worst) { worst = run; at = vis[k].t; }
      }
      if (worst >= 1.0) {
        problems++;
        warn(`${tag}: staging — personagem do plano focal fica cortado pela borda do quadro por ${worst.toFixed(1)} s (até ${at.toFixed(2)}s); enquadre a ação (câmera/zoom) ou tire-o de cena de vez`);
      }
    }
    if (!problems) ok(`${tag}: anatomia ok (${list.length} amostras, proporções, limites, alcance${hasGround ? ', chão' : ''})`);
  }

  // staging: plano em que o maior personagem do plano focal é minúsculo quase o tempo todo
  for (const { i } of r.timeline) {
    const hs = [...bigH].filter(([k]) => k.startsWith(i + '|')).map(([, h]) => h);
    if (hs.length > 4 && hs.filter(h => h < 0.07).length / hs.length > 0.8)
      warn(`plano ${i}: staging — o maior personagem do plano focal ocupa < 7% da altura do quadro: aproxime a câmera ou dê ao protagonista um plano mais perto`);
  }
  // ---------- "nada parado": trechos em que nenhum pixel relevante muda ----------
  {
    let run = 0, start = 0, end = 0, sceneOf = -1;
    const still = [];
    const close = () => {
      if (run >= 1.5) still.push([start, end]);
      run = 0;
    };
    for (const m of motion) {
      if (m.scene !== sceneOf) {
        close();
        sceneOf = m.scene;
      }
      if (m.d < STILL_THR) {
        if (!run) start = m.t - step;
        run += step;
        end = m.t;
      } else close();
    }
    close();
    if (still.length) warn(`quadro parado (nada se move) em ${still.slice(0, 3).map(([a, b]) => `${a.toFixed(1)}–${b.toFixed(1)}s`).join(', ')} — mantenha algo vivo: respiração, vento, partículas, um movimento lento de câmera`);
    else if (motion.length) ok('nada parado (há movimento em todo o filme)');
  }
  out.push('· princípios automáticos: kf com slow in/out e passagem contínua · atuação nos rigs (antecipação, overshoot, quebra de juntas, desfase N/F, moving hold) · vida da pessoa (respiração, peso, fala, piscar ao virar) · molas (cabelo, brinco, cauda, mola:) · sombra de contato · câmera viva · foco da vinheta no plano focal. Veja docs/PRINCIPIOS.md.');

  const head = `bamoo check — ${r.timeline.length} plano(s) · ${r.dur.toFixed(1)} s · ${N + 1} amostras (${fps}/s)`;
  out.push('· revisão manual (o check não detecta): cada personagem/objeto é o que foi pedido? Confira os traços que o identificam no still, remova partes herdadas de exemplos que não existem nele e faça o teste da silhueta (AGENTS.md, regra 4).');
  const tail = errors || warnings ? `Resumo: ${errors} erro(s), ${warnings} aviso(s). Dica: "bamoo still <cena> -t <s> --rig" mostra o esqueleto (vermelho = problema).` : 'Resumo: nenhum problema encontrado.';
  return { lines: [head, ...out, tail], errors, warnings };
}
