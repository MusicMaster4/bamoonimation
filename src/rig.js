// Esqueletos 2D (rigs): ossos com comprimento fixo, limites de articulação, IK que escolhe a dobra
// anatomicamente válida, e "peles" (desenhos) presas aos ossos. Convenção: perfil voltado para +x,
// y para baixo, ângulos em graus; ângulo de cada osso é RELATIVO ao osso pai (positivo = horário na tela).

import { V, KF, acao, noise } from './anim.js';
import { ik2, taperPath, body, widthFn } from './geom.js';

const D = Math.PI / 180;
const { cos, sin, atan2, hypot, max, min } = Math;

/**
 * ATUAÇÃO automática dos rigs (os 12 princípios aplicados ao esqueleto — ver docs/PRINCIPIOS.md).
 * Vale para todo rig (pessoa, ave, animais) a menos que `acao: false`. Pés/patas e as cadeias que os
 * sustentam nunca são alterados (contato com o chão continua exato).
 * - antecipa / passa: antecipação e overshoot em poses e alvos IK escritos com kf (escalam com a rapidez);
 * - atraso: quebra sucessiva das juntas (overlapping action): cada nível da hierarquia segue o pai com
 *   esse atraso (s) — o quadril lidera, a mão chega por último;
 * - desfase: o lado de lá (F) segue o de cá com esse atraso (evita "twinning", membros espelhados);
 * - vida: "moving hold" — oscilação mínima (graus) nos ossos do meio (tronco, pescoço, cabeça, cauda);
 * - exagero: multiplica antecipação e overshoot (scene({ exagero }) também multiplica).
 */
export const ACAO_RIG = { antecipa: 0.12, passa: 0.1, atraso: 0.03, desfase: 0.035, vida: 1, exagero: 1 };

/**
 * Normaliza a definição dos ossos.
 * Formato curto: { nome: [pai, comprimento, ângulo, min, max, { at, off, side, contact, sole }] }
 * Formato longo: { nome: { p, len, ang, min, max, at, off, side, contact, sole } }
 * - at: fração do pai onde o osso nasce (padrão 1 = na ponta); off: [dx, dy] deslocamento no espaço do pai
 * - side: 'near' (lado de cá) | 'far' (lado de lá) | 'mid' — inferido pelo sufixo N/F do nome (coxaN, coxaF)
 * - contact: osso que toca o chão (pés/patas); sole: espessura da sola abaixo do osso (para checar o chão)
 */
export function normBones(def) {
  if (!def || typeof def !== 'object') throw new Error('bamoo rig: "bones" deve ser um objeto { nome: [pai, comp, ang, min, max] }');
  const list = [];
  for (const [name, b] of Object.entries(def)) {
    let o;
    if (Array.isArray(b)) {
      const [p, len, ang, mn, mx, extra] = b;
      o = { ...(extra ?? {}), name, p: p ?? null, len: len ?? 0, ang: ang ?? 0, min: mn ?? undefined, max: mx ?? undefined };
    } else o = { ...b, name, p: b.p ?? null, len: b.len ?? 0, ang: b.ang ?? 0, min: b.min ?? b.lim?.[0], max: b.max ?? b.lim?.[1] };
    o.at ??= 1;
    o.side ??= /N$/.test(name) ? 'near' : /F$/.test(name) ? 'far' : 'mid';
    list.push(o);
  }
  const byName = new Map(list.map(b => [b.name, b]));
  for (const b of list) if (b.p && !byName.has(b.p)) throw new Error(`bamoo rig: osso "${b.name}" tem pai inexistente "${b.p}"`);
  const out = [], seen = new Set();
  const visit = (b, stack) => {
    if (seen.has(b.name)) return;
    if (stack.has(b.name)) throw new Error(`bamoo rig: ciclo na hierarquia de ossos (${b.name})`);
    stack.add(b.name);
    if (b.p) visit(byName.get(b.p), stack);
    seen.add(b.name);
    out.push(b);
  };
  for (const b of list) visit(b, new Set());
  out.forEach((b, i) => (b.i = i));
  // profundidade na hierarquia e "membro de apoio" (do osso de contato até o primeiro ponto de ramificação):
  // esses ossos não recebem atuação automática (o pé/pata fica exatamente onde o agente pôs)
  const kids = new Map(out.map(b => [b.name, 0]));
  for (const b of out) if (b.p) kids.set(b.p, kids.get(b.p) + 1);
  for (const b of out) b.depth = b.p ? byName.get(b.p).depth + 1 : 0;
  for (const b of out) {
    if (!b.contact) continue;
    let c = b;
    while (c) {
      c.apoio = true;
      const p = c.p ? byName.get(c.p) : null;
      if (!p || kids.get(p.name) !== 1) break;
      c = p;
    }
  }
  return out;
}

const mid = b => (b.min !== undefined && b.max !== undefined ? (b.min + b.max) / 2 : b.ang);
const wrapTo = (a, c) => {
  while (a - c > 180) a -= 360;
  while (a - c < -180) a += 360;
  return a;
};
const penalty = (b, r) => (b.min !== undefined && r < b.min ? b.min - r : 0) + (b.max !== undefined && r > b.max ? r - b.max : 0);

function fk(bones, rel) {
  const S = new Map();
  for (const b of bones) {
    let x0 = 0, y0 = 0, pa = 0;
    if (b.p) {
      const P = S.get(b.p);
      pa = P.abs;
      x0 = P.x0 + (P.x1 - P.x0) * b.at;
      y0 = P.y0 + (P.y1 - P.y0) * b.at;
    }
    if (b.off) {
      const c = cos(pa * D), s = sin(pa * D);
      x0 += b.off[0] * c - b.off[1] * s;
      y0 += b.off[0] * s + b.off[1] * c;
    }
    const r = rel.get(b.name), abs = pa + r;
    S.set(b.name, { name: b.name, x0, y0, x1: x0 + cos(abs * D) * b.len, y1: y0 + sin(abs * D) * b.len, abs, rel: r, len: b.len, side: b.side, b });
  }
  return S;
}

/** Pose de descanso (todos os ângulos = definição). Cacheada. */
export function restPose(n) {
  if (n._rest) return n._rest;
  const bones = (n._bones ??= normBones(n.bones));
  const rel = new Map(bones.map(b => [b.name, b.ang]));
  return (n._rest = fk(bones, rel));
}

/** Opções de atuação efetivas do rig (null = desligada). */
function acaoDe(n) {
  if (n.acao === false) return null;
  return { ...ACAO_RIG, ...(n.acao ?? {}) };
}

/**
 * Canais animados do rig, montados uma vez: para cada osso a pose "crua" (o que o agente escreveu) e a
 * pose "atuada" (antecipação/overshoot nos kf, atraso por nível da hierarquia, desfase do lado de lá,
 * moving hold). Idem para alvos IK e ângulos finais das cadeias.
 */
function canais(n) {
  if (n._chan) return n._chan;
  const bones = n._bones, byName = n._byName, A = acaoDe(n);
  const ikBones = new Set((n.ik ?? []).flatMap(k => k.chain));
  const pose = new Map();
  for (const b of bones) {
    const raw = n.pose?.[b.name];
    let fin = raw;
    const ok = A && b.depth >= 1 && !b.apoio;
    if (ok) {
      const d = A.atraso * max(0, b.depth - 1) + (b.side === 'far' ? A.desfase : 0);
      if (raw instanceof KF) fin = acao(raw, { antecipa: A.antecipa, passa: A.passa * (0.7 + 0.15 * b.depth), atraso: d, exagero: A.exagero });
      else if (typeof raw === 'function' && !raw._acao && d > 0) fin = (t, env) => raw(t - d, env);
    }
    const vida = ok && A.vida > 0 && b.side === 'mid' && !ikBones.has(b.name) && b.len > 0 ? A.vida : 0;
    const extra = n.extra?.[b.name];
    pose.set(b.name, { raw, fin, vida, seed: b.i * 7.31 + 3, extra });
  }
  const ik = (n.ik ?? []).map(k => {
    const ch = k.chain.map(nm => {
      const b = byName.get(nm);
      if (!b) throw new Error(`bamoo rig "${n.name ?? n.id}": IK usa osso inexistente "${nm}"`);
      return b;
    });
    if (ch.length < 2 || ch.length > 3) throw new Error('bamoo rig: cadeias IK têm 2 ou 3 ossos');
    const apoio = ch.some(b => b.apoio || b.contact);
    let target = k.target, endAng = k.endAng;
    if (A && !apoio) {
      const d = A.atraso * max(0, ch[0].depth) + (ch[0].side === 'far' ? A.desfase : 0);
      const wrap = (v, polar) =>
        v instanceof KF ? acao(v, { antecipa: A.antecipa, passa: A.passa * 1.2, atraso: d, exagero: A.exagero, polar })
          : typeof v === 'function' && !v._acao && d > 0 ? (t, env) => v(t - d, env) : v;
      target = wrap(k.target, k.arco);
      if (endAng !== undefined) endAng = wrap(k.endAng);
    }
    return { k, ch, target, endAng };
  });
  return (n._chan = { pose, ik, A });
}

/** Resolve as cadeias IK sobre `rel` (in-place). Registra alcance em `issues` se dado. */
function runIK(n, bones, rel, list, useRaw, t, env, issues, targets) {
  let S = fk(bones, rel);
  for (const it of list) {
    const k = it.k;
    if (k.on !== undefined && !V(k.on, t, env)) continue;
    const [A, B, C] = it.ch;
    const tg = V(useRaw ? k.target : it.target, t, env);
    if (!Array.isArray(tg)) throw new Error(`bamoo rig: alvo IK de ${k.chain.join('>')} deve ser [x, y]`);
    if (targets) targets.push({ chain: k.chain, p: tg });
    const a = S.get(A.name);
    const root = [a.x0, a.y0];
    const d = hypot(tg[0] - root[0], tg[1] - root[1]);
    if (issues && d > A.len + B.len + 0.5) issues.push({ kind: 'alcance', chain: k.chain, t, d, reach: A.len + B.len });
    const parentAbs = A.p ? S.get(A.p).abs : 0;
    const cands = k.bend === 1 || k.bend === -1 ? [k.bend] : [1, -1];
    const eA = useRaw ? k.endAng : it.endAng;
    let best = null;
    for (const bend of cands) {
      const { j, e } = ik2(root, tg, A.len, B.len, bend);
      const absA = atan2(j[1] - root[1], j[0] - root[0]) / D;
      const absB = atan2(e[1] - j[1], e[0] - j[0]) / D;
      const rA = wrapTo(absA - parentAbs, mid(A)), rB = wrapTo(absB - absA, mid(B));
      // desempate: prefere a dobra natural (perto do meio da faixa de cada junta)
      let pen = penalty(A, rA) + penalty(B, rB) + 1e-3 * (Math.abs(rB - mid(B)) + Math.abs(rA - mid(A)));
      let rC;
      if (C && eA !== undefined) {
        rC = wrapTo(V(eA, t, env) - absB, mid(C));
        pen += penalty(C, rC);
      }
      if (!best || pen < best.pen - 1e-6) best = { rA, rB, rC, pen };
    }
    rel.set(A.name, best.rA);
    rel.set(B.name, best.rB);
    if (best.rC !== undefined) rel.set(C.name, best.rC);
    S = fk(bones, rel);
  }
  return S;
}

/** Trava nos limites articulares. Com `issues`, registra as violações. Retorna true se travou algo. */
function clampLimits(n, bones, rel, t, issues) {
  let clamped = false;
  for (const b of bones) {
    if (b.min === undefined && b.max === undefined) continue;
    const r = wrapTo(rel.get(b.name), mid(b));
    const mn = b.min ?? -Infinity, mx = b.max ?? Infinity;
    if (r < mn - 0.5 || r > mx + 0.5) {
      if (issues) issues.push({ kind: 'limite', bone: b.name, t, val: r, min: mn, max: mx });
      if (n.clamp !== false) {
        rel.set(b.name, max(mn, min(mx, r)));
        clamped = true;
      }
    }
  }
  return clamped;
}

/**
 * Resolve o esqueleto no tempo t: pose (FK) -> cadeias IK (escolhendo a dobra que respeita os limites)
 * -> limites (registra violações e, por padrão, trava no limite).
 * Com a ATUAÇÃO ligada (padrão), a pose desenhada recebe antecipação, overshoot, atraso entre juntas e
 * moving hold; as violações de limite/alcance são checadas na pose CRUA (a intenção do agente) — o que a
 * atuação acrescenta é travado em silêncio. `opts.check` = calcula issues (verificador / --rig).
 * Retorna { S: Map(nome -> {x0,y0,x1,y1,abs,rel,len,side}), issues: [...], targets: [...] }.
 */
export function solveRig(n, t, env, opts = {}) {
  const bones = (n._bones ??= normBones(n.bones));
  n._byName ??= new Map(bones.map(b => [b.name, b]));
  const C = canais(n);
  const check = opts.check !== false;
  const issues = [], targets = [];
  // 1) pose crua: só quando é preciso checar (ou quando a atuação está desligada)
  if (check || !C.A) {
    const rel = new Map();
    for (const b of bones) {
      const c = C.pose.get(b.name);
      rel.set(b.name, c.raw === undefined ? b.ang : V(c.raw, t, env));
    }
    let S = runIK(n, bones, rel, C.ik, true, t, env, issues, targets);
    if (clampLimits(n, bones, rel, t, issues)) S = fk(bones, rel);
    if (!C.A) return { S, issues, targets };
  }
  // 2) pose atuada (o que é desenhado)
  const rel = new Map();
  for (const b of bones) {
    const c = C.pose.get(b.name);
    let v = c.fin === undefined ? b.ang : V(c.fin, t, env);
    if (c.vida) v += c.vida * noise(t * 0.45 + c.seed, 71 + b.i);
    if (c.extra) v += V(c.extra, t, env) ?? 0;
    rel.set(b.name, v);
  }
  let S = runIK(n, bones, rel, C.ik, false, t, env, null, check ? null : targets);
  if (clampLimits(n, bones, rel, t, null)) S = fk(bones, rel);
  return { S, issues, targets };
}

/** Pontos ao longo de uma cadeia de ossos conectados (na ordem listada), com as juntas compartilhadas. */
export function chainPoints(S, names) {
  const seg = names.map(nm => {
    const s = S.get(nm);
    if (!s) throw new Error(`bamoo rig: pele usa osso inexistente "${nm}"`);
    return s;
  });
  const dist = (p, q) => hypot(p[0] - q[0], p[1] - q[1]);
  if (seg.length === 1) return [[seg[0].x0, seg[0].y0], [seg[0].x1, seg[0].y1]];
  const pts = [];
  for (let i = 0; i < seg.length; i++) {
    let a = [seg[i].x0, seg[i].y0], b = [seg[i].x1, seg[i].y1];
    if (i === 0) {
      const nA = [seg[1].x0, seg[1].y0], nB = [seg[1].x1, seg[1].y1];
      if (min(dist(a, nA), dist(a, nB)) < min(dist(b, nA), dist(b, nB))) [a, b] = [b, a];
      pts.push(a, b);
    } else {
      const last = pts[pts.length - 1];
      if (dist(b, last) < dist(a, last)) [a, b] = [b, a];
      if (dist(a, last) > 0.5) pts.push(a);
      pts.push(b);
    }
  }
  return pts;
}

/** Caminho de um membro contínuo pelas juntas: larguras w = [na 1ª ponta, juntas..., na última ponta]. */
export function limbPath(pts, w, { joint = 0.7, caps = 'round' } = {}) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = L[L.length - 1] || 1;
  const ws = typeof w === 'number' ? pts.map(() => w) : w.length === pts.length ? w : null;
  const W = ws
    ? u => {
        const x = u * total;
        let i = 1;
        while (i < L.length - 1 && L[i] < x) i++;
        const f = (x - L[i - 1]) / (L[i] - L[i - 1] || 1);
        return ws[i - 1] + (ws[i] - ws[i - 1]) * f;
      }
    : widthFn(w);
  // pontos médios mantêm os ossos retos; a junta ganha arredondamento
  const dense = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    dense.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    dense.push(i < pts.length - 1 ? [b[0], b[1], joint] : b);
  }
  return taperPath(dense, W, { caps });
}

/** Contorno de corpo ao longo de uma cadeia (liste da cauda para a cabeça: "top" fica nas costas). */
export const spinePoints = (S, names, top, bot, n = 16) => body(chainPoints(S, names), top, bot, { n });

/** Matriz [a,b,c,d,e,f] que leva a pose de descanso de um osso para a pose atual (skin "bind"). */
export function bindMatrix(rest, cur) {
  const r = (cur.abs - rest.abs) * D, c = cos(r), s = sin(r);
  return [c, s, -s, c, cur.x0 - (c * rest.x0 - s * rest.y0), cur.y0 - (s * rest.x0 + c * rest.y0)];
}
