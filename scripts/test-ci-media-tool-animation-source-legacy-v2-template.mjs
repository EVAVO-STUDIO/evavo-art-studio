import assert from "node:assert/strict";
import test from "node:test";

import {
  legacyAnimationSourceAccesses,
} from "./lib/animation-source-legacy-access-v2.mjs";

test("legacy v2 rejects dynamic-import template literals", () => {
  assert.deepEqual(
    legacyAnimationSourceAccesses(
      'const module = await import(`./animation-source-bundle.mjs?legacy=${variant}`);',
    ),
    ["dynamic-import"],
  );
  assert.deepEqual(
    legacyAnimationSourceAccesses(
      'const module = await import/*a*/(`./animation-source-bundle%2Emjs#legacy`/*b*/);',
    ),
    ["dynamic-import"],
  );
});

test("legacy v2 rejects CommonJS template-literal module access", () => {
  assert.deepEqual(
    legacyAnimationSourceAccesses(
      'const module = require(`./Animation-Source-Bundle.mjs?legacy=1`);',
    ),
    ["require-import"],
  );
  assert.deepEqual(
    legacyAnimationSourceAccesses(
      'const module = require/*a*/(`./animation-source-bundle\\u002emjs#legacy`/*b*/);',
    ),
    ["require-import"],
  );
});
