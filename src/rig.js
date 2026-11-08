// Esqueletos 2D (rigs): ossos com comprimento fixo, limites de articulação, IK que escolhe a dobra
// anatomicamente válida, e "peles" (desenhos) presas aos ossos. Convenção: perfil voltado para +x,
// y para baixo, ângulos em graus; ângulo de cada osso é RELATIVO ao osso pai (positivo = horário na tela).

import { V } from './anim.js';
import { ik2, taperPath, body, widthFn } from './geom.js';

const D = Math.PI / 180;
const { cos, sin, atan2, hypot, max, min } = Math;

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

/**
 * Resolve o esqueleto no tempo t: pose (FK) -> cadeias IK (escolhendo a dobra que respeita os limites)
 * -> limites (registra violações e, por padrão, trava no limite).
 * Retorna { S: Map(nome -> {x0,y0,x1,y1,abs,rel,len,side}), issues: [...], targets: [...] }.
 */
export function solveRig(n, t, env) {
  const bones = (n._bones ??= normBones(n.bones));
  const byName = (n._byName ??= new Map(bones.map(b => [b.name, b])));
  const rel = new Map();
  for (const b of bones) {
    const pv = n.pose?.[b.name];
    rel.set(b.name, pv === undefined ? b.ang : V(pv, t, env));
  }
  let S = fk(bones, rel);
  const issues = [], targets = [];
  for (const k of n.ik ?? []) {
    if (k.on !== undefined && !V(k.on, t, env)) continue;
    const ch = k.chain.map(nm => {
      const b = byName.get(nm);
      if (!b) throw new Error(`bamoo rig "${n.name ?? n.id}": IK usa osso inexistente "${nm}"`);
      return b;
    });
    if (ch.length < 2 || ch.length > 3) throw new Error('bamoo rig: cadeias IK têm 2 ou 3 ossos');
    const [A, B, C] = ch;
    const tg = V(k.target, t, env);
    if (!Array.isArray(tg)) throw new Error(`bamoo rig: alvo IK de ${k.chain.join('>')} deve ser [x, y]`);
    targets.push({ chain: k.chain, p: tg });
    const a = S.get(A.name);
    const root = [a.x0, a.y0];
    const d = hypot(tg[0] - root[0], tg[1] - root[1]);
    if (d > A.len + B.len + 0.5) issues.push({ kind: 'alcance', chain: k.chain, t, d, reach: A.len + B.len });
    const parentAbs = A.p ? S.get(A.p).abs : 0;
    const cands = k.bend === 1 || k.bend === -1 ? [k.bend] : [1, -1];
    let best = null;
    for (const bend of cands) {
      const { j, e } = ik2(root, tg, A.len, B.len, bend);
      const absA = atan2(j[1] - root[1], j[0] - root[0]) / D;
      const absB = atan2(e[1] - j[1], e[0] - j[0]) / D;
      const rA = wrapTo(absA - parentAbs, mid(A)), rB = wrapTo(absB - absA, mid(B));
      // desempate: prefere a dobra natural (perto do meio da faixa de cada junta)
      let pen = penalty(A, rA) + penalty(B, rB) + 1e-3 * (Math.abs(rB - mid(B)) + Math.abs(rA - mid(A)));
      let rC;
      if (C && k.endAng !== undefined) {
        rC = wrapTo(V(k.endAng, t, env) - absB, mid(C));
        pen += penalty(C, rC);
      }
      if (!best || pen < best.pen - 1e-6) best = { rA, rB, rC, pen };
    }
    rel.set(A.name, best.rA);
    rel.set(B.name, best.rB);
    if (best.rC !== undefined) rel.set(C.name, best.rC);
    S = fk(bones, rel);
  }
  let clamped = false;
  for (const b of bones) {
    if (b.min === undefined && b.max === undefined) continue;
    const r = wrapTo(rel.get(b.name), mid(b));
    const mn = b.min ?? -Infinity, mx = b.max ?? Infinity;
    if (r < mn - 0.5 || r > mx + 0.5) {
      issues.push({ kind: 'limite', bone: b.name, t, val: r, min: mn, max: mx });
      if (n.clamp !== false) {
        rel.set(b.name, max(mn, min(mx, r)));
        clamped = true;
      }
    }
  }
  if (clamped) S = fk(bones, rel);
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
