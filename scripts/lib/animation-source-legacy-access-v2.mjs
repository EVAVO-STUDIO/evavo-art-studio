import { codePointCompare } from "./animation-source-legacy-common-v2.mjs";

const MODULE = String.raw`["'][^"']*animation-source-bundle(?:\.|%2e|\\u\{0*2e\}|\\u0*2e|\\x2e)mjs(?:[?#][^"']*)?["']`;
const NAMED = new RegExp(
  String.raw`\b(?:import|export)\s*(?:type\s+)?\{([\s\S]*?)\}\s*from\s*${MODULE}`,
  "giu",
);
const PATTERNS = Object.freeze([
  [new RegExp(String.raw`\bimport\s*\*\s*as\s*[A-Za-z_$][\w$]*\s*from\s*${MODULE}`, "giu"), "namespace-import"],
  [new RegExp(String.raw`\bexport\s*\*\s*from\s*${MODULE}`, "giu"), "star-reexport"],
  [new RegExp(String.raw`\bimport\s*\(\s*${MODULE}(?:\s*,[\s\S]*?)?\s*\)`, "giu"), "dynamic-import"],
  [new RegExp(String.raw`\brequire\s*\(\s*${MODULE}\s*\)`, "giu"), "require-import"],
  [new RegExp(String.raw`\bimport\s+(?:type\s+)?(?!\{|\*)[A-Za-z_$][\w$]*(?:\s*,\s*(?:\{[\s\S]*?\}|\*\s*as\s*[A-Za-z_$][\w$]*))?\s*from\s*${MODULE}`, "giu"), "default-import"],
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
