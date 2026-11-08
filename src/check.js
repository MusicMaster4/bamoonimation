// Verificador (bamoo check): amostra o filme no tempo e aponta problemas de camadas, texto e anatomia.
// Saída curta e objetiva, pensada para o agente corrigir em poucas iterações.

import { Renderer } from './render.js';
import { PLAN_RULES } from './anatomy.js';
import { normBones } from './rig.js';

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

const pick = (bones, base) => bones.find(b => b.name === base + 'N') ?? bones.find(b => b.name === base + 'F') ?? bones.find(b => b.name === base);

/**
 * Verifica um filme/cena. Retorna { lines, errors, warnings }.
 * opts: fps (amostragem, padrão 12), allowText (não reclamar de texto)
 */
export function checkFilm(root, { fps = 12, allowText = false } = {}) {
  const r = new Renderer(root, { scale: 0.18, fps });
  r.probe = { rigs: [], texts: [] };
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
  for (let f = 0; f <= N; f++) r.frame(Math.min(f * step, r.dur - 1e-3), f);

  const texts = r.probe.texts;
  if ((caps || texts.length) && !allowText) {
    const uniq = [...new Set(texts.map(x => `"${x.str}"`))].slice(0, 5);
    err(`texto na tela: ${caps} legenda(s)${texts.length ? `, textos ${uniq.join(', ')}` : ''}. A regra padrão é NÃO usar texto (use --allow-text se o pedido incluir texto).`);
  } else if (!caps && !texts.length) ok('sem texto na tela');

  // ---------- rigs ----------
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
    if (!problems) ok(`${tag}: anatomia ok (${list.length} amostras, proporções, limites, alcance${hasGround ? ', chão' : ''})`);
  }

  const head = `bamoo check — ${r.timeline.length} plano(s) · ${r.dur.toFixed(1)} s · ${N + 1} amostras (${fps}/s)`;
  const tail = errors || warnings ? `Resumo: ${errors} erro(s), ${warnings} aviso(s). Dica: "bamoo still <cena> -t <s> --rig" mostra o esqueleto (vermelho = problema).` : 'Resumo: nenhum problema encontrado.';
  return { lines: [head, ...out, tail], errors, warnings };
}
