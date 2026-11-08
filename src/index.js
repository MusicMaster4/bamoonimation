// bamoonimation — API pública. Importe tudo daqui:
//   import { scene, layer, G, blob, kf, ... } from 'bamoonimation';

export {
  scene, film, layer, G, blob, poly, circle, ellipse, rect, path, line, taper, limb, text, img,
  particles, rays, custom, dyn, lin, rad, scatter, rep, flat, rig,
} from './nodes.js';

export {
  kf, KF, ease, V, tw, prog, cycle, between, pulse, osc, wig, noise, fbm, rng, hash, blink, talk,
  breathe, decay, spring, clamp, lerp, smooth, remap, lerpAny, spline, heading, move,
  gait, gaitPhase,
} from './anim.js';

export { mix, adj, lighten, darken, alpha, rgba, css } from './color.js';
export { ik2, wave, ellipsePts, xf, mirror, polar, bboxPts, along, body, sampleCurve, widthFn as profile } from './geom.js';
export { registerFont, FONT_KEYS } from './fonts.js';
export { Renderer, DEFAULT_LOOK } from './render.js';
export { TEXTURES } from './textures.js';
export { skeleton, PLAN_RULES } from './anatomy.js';
export { solveRig, restPose, chainPoints } from './rig.js';
export { pessoa, caminhada, cabecaPerfil, olho, boca } from './pessoa.js';
export { ave, ASA, bater, plantaAsa, pelesAsa } from './ave.js';
