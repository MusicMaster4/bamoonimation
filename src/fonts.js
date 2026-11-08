// Fontes embutidas (licenças OFL/Apache em assets/fonts). Chaves curtas para o agente.

import canvas from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

const { GlobalFonts } = canvas;
const dir = fileURLToPath(new URL('../assets/fonts/', import.meta.url));

const FILES = [
  ['PatrickHand-Regular.ttf', 'Patrick Hand'],
  ['DMSerifDisplay-Regular.ttf', 'DM Serif Display'],
  ['SpecialElite-Regular.ttf', 'Special Elite'],
  ['PTSans-Regular.ttf', 'PT Sans'],
  ['PTSans-Bold.ttf', 'PT Sans'],
  ['Caveat.ttf', 'Caveat'],
];

let done = false;
export function loadFonts() {
  if (done) return;
  done = true;
  for (const [f] of FILES) {
    const p = path.join(dir, f);
    if (existsSync(p)) GlobalFonts.registerFromPath(p);
  }
}

/** Chaves: hand (legendas manuscritas), serif (títulos), mono (máquina de escrever), sans, script. */
export const FONT_KEYS = {
  hand: 'Patrick Hand',
  serif: 'DM Serif Display',
  mono: 'Special Elite',
  sans: 'PT Sans',
  script: 'Caveat',
};

export const fontFamily = k => FONT_KEYS[k] ?? k;

/** Registra uma fonte .ttf/.otf extra. Depois use text('...', { font: 'Nome da Família' }). */
export function registerFont(file, alias) {
  return GlobalFonts.registerFromPath(path.resolve(file), alias);
}
