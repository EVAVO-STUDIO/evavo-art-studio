import { codePointCompare } from "./animation-source-legacy-common-v2.mjs";

const MODULE = String.raw`["'][^"']*animation-source-bundle\.mjs["']`;
const NAMED = new RegExp(
  String.raw`\b(?:import|export)\s*\{([\s\S]*?)\}\s*from\s*${MODULE}`,
  "gu",
);
const PATTERNS = Object.freeze([
  [new RegExp(String.raw`\bimport\s*\*\s*as\s*[A-Za-z_$][\w$]*\s*from\s*${MODULE}`, "gu"), "namespace-import"],
  [new RegExp(String.raw`\bexport\s*\*\s*from\s*${MODULE}`, "gu"), "star-reexport"],
  [new RegExp(String.raw`\bimport\s*\(\s*${MODULE}\s*\)`, "gu"), "dynamic-import"],
  [new RegExp(String.raw`\brequire\s*\(\s*${MODULE}\s*\)`, "gu"), "require-import"],
  [new RegExp(String.raw`\bimport\s+(?!\{|\*)[A-Za-z_$][\w$]*(?:\s*,\s*\{[\s\S]*?\})?\s*from\s*${MODULE}`, "gu"), "default-import"],
]);
const HELPERS = new Set(["readJson", "writeJsonAtomic"]);

export function legacyAnimationSourceAccesses(source) {
  const accesses = new Set();
  NAMED.lastIndex = 0;
  for (const match of source.matchAll(NAMED)) {
    for (const raw of match[1].split(",")) {
      const specifier = raw.trim().replace(/^type\s+/u, "");
      if (!specifier) continue;
      const imported = specifier.split(/\s+as\s+/u)[0].trim();
      if (HELPERS.has(imported)) accesses.add(imported);
    }
  }
  for (const [pattern, name] of PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(source)) accesses.add(name);
  }
  return Object.freeze([...accesses].sort(codePointCompare));
}
