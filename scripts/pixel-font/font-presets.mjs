import { booleanValue, integer, text } from './common.mjs';

export const PRESETS = Object.freeze({
  'dos-display': Object.freeze({ pixelScale: 3, tracking: 2, lineGap: 3, monospace: false, uppercaseOnly: true, boldPixels: 1, outline: 1, shadowX: 2, shadowY: 2 }),
  'dos-ui': Object.freeze({ pixelScale: 2, tracking: 1, lineGap: 2, monospace: false, uppercaseOnly: false, boldPixels: 0, outline: 1, shadowX: 1, shadowY: 1 }),
  'dos-ledger': Object.freeze({ pixelScale: 2, tracking: 1, lineGap: 2, monospace: true, uppercaseOnly: false, boldPixels: 0, outline: 0, shadowX: 1, shadowY: 1 }),
  'dos-micro': Object.freeze({ pixelScale: 1, tracking: 1, lineGap: 1, monospace: false, uppercaseOnly: false, boldPixels: 0, outline: 0, shadowX: 0, shadowY: 0 }),
  'dos-symbols': Object.freeze({ pixelScale: 2, tracking: 1, lineGap: 2, monospace: true, uppercaseOnly: false, boldPixels: 0, outline: 1, shadowX: 1, shadowY: 1 }),
});

export const FACE_ROLES = Object.freeze(['display', 'ui', 'ledger', 'micro', 'symbols']);

export const CONFUSABLES = Object.freeze([
  Object.freeze(['0', 'O']),
  Object.freeze(['1', 'I', 'l']),
  Object.freeze(['5', 'S']),
  Object.freeze(['2', 'Z']),
  Object.freeze(['8', 'B']),
]);

export const KERNING = Object.freeze([
  ['A', 'V'], ['A', 'W'], ['A', 'Y'], ['F', 'A'], ['L', 'T'], ['P', 'A'],
  ['T', 'A'], ['T', 'o'], ['V', 'A'], ['W', 'a'], ['Y', 'o'],
]);

export function color(value, label) {
  const source = text(value, label, 7, 9);
  if (!/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/u.test(source)) {
    throw new Error(`${label} must be #RRGGBB or #RRGGBBAA.`);
  }
  const hex = source.slice(1);
  return Object.freeze({
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
    a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255,
  });
}

export function exactKeys(value, allowed, label) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) throw new Error(`${label} contains unknown fields: ${unexpected.join(', ')}.`);
}

export function optionalInteger(value, fallback, label, minimum, maximum) {
  return integer(value === undefined ? fallback : value, label, minimum, maximum);
}

export function optionalBoolean(value, fallback, label) {
  return value === undefined ? fallback : booleanValue(value, label);
}
