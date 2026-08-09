import { PUNCTUATION } from './glyph-punctuation.mjs';
import { DIGITS } from './glyph-digits.mjs';
import { UPPER } from './glyph-upper.mjs';
import { LOWER } from './glyph-lower.mjs';
import { EXTENDED } from './glyph-extended.mjs';
import { PRIVATE } from './glyph-private.mjs';

const GLYPHS = Object.freeze({ ...PUNCTUATION, ...DIGITS, ...UPPER, ...LOWER, ...EXTENDED });

export const CHARACTER_SETS = Object.freeze({
  'basic-latin': Object.freeze(Array.from({ length: 95 }, (_, index) => 32 + index)),
  'currency-core': Object.freeze(['£','¢','¥','€','°','×','÷'].map((value) => value.codePointAt(0))),
  'punctuation-extended': Object.freeze(['•','…','–','—','‘','’','“','”','©','®','™'].map((value) => value.codePointAt(0))),
  arrows: Object.freeze(['←','↑','→','↓','↔'].map((value) => value.codePointAt(0))),
  'box-drawing': Object.freeze(['─','│','┌','┐','└','┘','├','┤','┬','┴','┼','═','║','╔','╗','╚','╝','╬'].map((value) => value.codePointAt(0))),
  'evavo-symbols': Object.freeze(Array.from({ length: 16 }, (_, index) => 0xe000 + index)),
});

export function glyphPattern(codepoint) {
  const pattern = PRIVATE[codepoint] ?? GLYPHS[String.fromCodePoint(codepoint)];
  if (!pattern) return null;
  if (pattern.length !== 7 || pattern.some((row) => row.length !== 5 || /[^.#]/u.test(row))) {
    throw new Error(`Invalid EVAVO glyph primitive U+${codepoint.toString(16).toUpperCase()}.`);
  }
  return Object.freeze(pattern.map((row) => Object.freeze([...row].map((pixel) => pixel === '#'))));
}

export function codepointsForSets(setIds, additional = []) {
  if (!Array.isArray(setIds) || !setIds.length) throw new Error('characterSets must not be empty.');
  const values = new Set();
  for (const setId of setIds) {
    const set = CHARACTER_SETS[setId];
    if (!set) throw new Error(`Unknown character set ${setId}.`);
    for (const codepoint of set) values.add(codepoint);
  }
  for (const value of additional) {
    const codepoint = typeof value === 'number' ? value : String(value).codePointAt(0);
    if (!glyphPattern(codepoint)) throw new Error(`No glyph primitive for U+${codepoint.toString(16).toUpperCase()}.`);
    values.add(codepoint);
  }
  return Object.freeze([...values].sort((left, right) => left - right));
}
