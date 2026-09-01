import assert from "node:assert/strict";
import test from "node:test";

import { legacyAnimationSourceAccesses as scan } from "./lib/animation-source-legacy-access-v2.mjs";

const target = "../../../../scripts/lib/animation-source-bundle.mjs";

test("scope-correct const resolution catches indirect dynamic loads", () => {
  const cases = [
    [`const modulePath = "${target}"; import(modulePath);`, ["dynamic-import"]],
    [`const suffix = "bundle.mjs"; const modulePath = "../../../../scripts/lib/animation-source-" + suffix; import(modulePath);`, ["dynamic-import"]],
    [`const config = { legacy: "${target}" }; import(config.legacy);`, ["dynamic-import"]],
    [`const config = { ["legacy"]: "${target}" }; import(config["legacy"]);`, ["dynamic-import"]],
    [`const url = new URL("${target}", import.meta.url); import(url);`, ["dynamic-import"]],
    [`const url = new URL("${target}", import.meta.url); import(url.href);`, ["dynamic-import"]],
    [`const load = createRequire(import.meta.url); load("${target}");`, ["require-import"]],
    [`const load = module.createRequire(import.meta.url); load("${target}");`, ["require-import"]],
  ];
  for (const [source, expected] of cases) {
    assert.deepEqual(scan(source, "apps/api/src/runtime.ts"), expected, source);
  }
});

test("scope-correct const resolution respects shadows and mutable bindings", () => {
  const source = `
    const modulePath = "${target}";
    function safe() {
      const modulePath = "./safe.mjs";
      return import(modulePath);
    }
    let mutablePath = "${target}";
    mutablePath = "./safe.mjs";
    import(mutablePath);
  `;
  assert.deepEqual(scan(source, "apps/api/src/runtime.ts"), []);
});

test("cyclic const bindings terminate without granting authority", () => {
  const source = `const left = right; const right = left; import(left);`;
  assert.deepEqual(scan(source, "apps/api/src/runtime.ts"), []);
});
