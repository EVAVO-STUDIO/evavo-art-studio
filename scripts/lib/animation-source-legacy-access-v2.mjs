import { codePointCompare } from "./animation-source-legacy-common-v2.mjs";

const GAP = String.raw`(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))*`;

function escapeRegexCharacter(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&");
}

function encodedCharacterPattern(value) {
  const codePoint = value.codePointAt(0);
  const hexadecimal = codePoint.toString(16);
  const byteHexadecimal = hexadecimal.padStart(2, "0");
  const unicodeHexadecimal = hexadecimal.padStart(4, "0");
  return String.raw`(?:${escapeRegexCharacter(value)}|%${byteHexadecimal}|\\x${byteHexadecimal}|\\u${unicodeHexadecimal}|\\u\{0*${hexadecimal}\})`;
}

const MODULE_SUFFIX = [..."animation-source-bundle.mjs"]
  .map(encodedCharacterPattern)
  .join("");
const MODULE = String.raw`["'][^"']*${MODULE_SUFFIX}(?:[?#][^"']*)?["']`;
const TEMPLATE_MODULE = String.raw`\x60(?:\\[\s\S]|[^\x60\\])*${MODULE_SUFFIX}(?:[?#](?:\\[\s\S]|[^\x60\\])*)?\x60`;
const RUNTIME_MODULE = String.raw`(?:${MODULE}|${TEMPLATE_MODULE})`;
const IDENTIFIER = String.raw`[A-Za-z_$][\w$]*`;
const NAMED = new RegExp(
  String.raw`\b(?:import|export)${GAP}(?:type${GAP})?\{([\s\S]*?)\}${GAP}from${GAP}${MODULE}`,
  "giu",
);
const PATTERNS = Object.freeze([
  [new RegExp(String.raw`\bimport${GAP}\*${GAP}as${GAP}${IDENTIFIER}${GAP}from${GAP}${MODULE}`, "giu"), "namespace-import"],
  [new RegExp(String.raw`\bexport${GAP}\*${GAP}from${GAP}${MODULE}`, "giu"), "star-reexport"],
  [new RegExp(String.raw`\bimport${GAP}\(${GAP}${RUNTIME_MODULE}(?:${GAP},[\s\S]*?)?${GAP}\)`, "giu"), "dynamic-import"],
  [new RegExp(String.raw`\brequire${GAP}\(${GAP}${RUNTIME_MODULE}${GAP}\)`, "giu"), "require-import"],
  [new RegExp(String.raw`\bimport${GAP}(?:type${GAP})?(?!\{|\*)${IDENTIFIER}(?:${GAP},${GAP}(?:\{[\s\S]*?\}|\*${GAP}as${GAP}${IDENTIFIER}))?${GAP}from${GAP}${MODULE}`, "giu"), "default-import"],
]);
const HELPERS = Object.freeze(["readJson", "writeJsonAtomic"]);
const COMMENT = /\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/gu;

function namedLegacyAccesses(clause) {
  const uncommented = clause.replace(COMMENT, " ");
  return HELPERS.filter((helper) =>
    new RegExp(String.raw`\b${helper}\b`, "u").test(uncommented),
  );
}

export function legacyAnimationSourceAccesses(source) {
  const accesses = new Set();
  NAMED.lastIndex = 0;
  for (const match of source.matchAll(NAMED)) {
    for (const imported of namedLegacyAccesses(match[1])) {
      accesses.add(imported);
    }
  }
  for (const [pattern, name] of PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(source)) accesses.add(name);
  }
  return Object.freeze([...accesses].sort(codePointCompare));
}
