import assert from "node:assert/strict";
import test from "node:test";

import {
  legacyAnimationSourceAccesses,
} from "./lib/animation-source-legacy-access-v2.mjs";

test("legacy v2 normalizes percent-encoded basename characters", () => {
  for (const source of [
    'import { readJson } from "./%61nimation-source-bundle.mjs";',
    'import { readJson } from "./animation%2Dsource%2Dbundle.mjs";',
    'import { readJson } from "./animation-source-bundle%2Emjs?legacy=1";',
  ]) {
    assert.deepEqual(
      legacyAnimationSourceAccesses(source),
      ["readJson"],
      source,
    );
  }
});

test("legacy v2 normalizes JavaScript escapes across the basename", () => {
  for (const source of [
    'import { readJson } from "./\\u0061nimation-source-bundle.mjs";',
    'import { readJson } from "./\\u{61}nimation-source-bundle.mjs";',
    'import { readJson } from "./\\x61nimation-source-bundle.mjs";',
    'const module = await import(`./%61nimation-source-bundle.mjs?legacy=${variant}`);',
  ]) {
    const accesses = legacyAnimationSourceAccesses(source);
    assert.ok(
      accesses.includes(source.startsWith("const") ? "dynamic-import" : "readJson"),
      `${source}: ${accesses.join(",")}`,
    );
  }
});
