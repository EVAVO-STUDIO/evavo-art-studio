import assert from "node:assert/strict";
import test from "node:test";

import { legacyAnimationSourceAccesses as scan } from "./lib/animation-source-legacy-access-v2.mjs";

const target = "../../../../scripts/lib/animation-source-bundle.mjs";

test("catch bindings remain confined to their lexical scope", () => {
  const source = `const specifier = "${target}"; try { throw new Error("x"); } catch (specifier) { import(specifier); } import(specifier);`;
  assert.deepEqual(
    scan(source, "apps/api/src/runtime.ts"),
    ["dynamic-import"],
  );
});

test("catch destructuring shadows only inside the catch body", () => {
  const source = `const specifier = "${target}"; try { throw { specifier: "./safe.mjs" }; } catch ({ specifier }) { import(specifier); } import(specifier);`;
  assert.deepEqual(
    scan(source, "apps/api/src/runtime.ts"),
    ["dynamic-import"],
  );
});
