import assert from "node:assert/strict";
import test from "node:test";

import {
  assertAnimationSourceLegacyUsageV2,
  inspectAnimationSourceLegacyUsageV2,
} from "./lib/animation-source-legacy-boundary-v2.mjs";
import { legacyAnimationSourceAccesses as scan } from "./lib/animation-source-legacy-access-v2.mjs";
import {
  legacyFixture,
  removeFixture,
  track,
} from "./test-support/animation-source-legacy-v2-fixture.mjs";

const target = "../../../../scripts/lib/animation-source-bundle.mjs";

test("immutable aliases retain exact dynamic-import provenance", () => {
  const cases = [
    `const specifier = "${target}"; import(specifier);`,
    `const prefix = "../../../../scripts/lib/animation-source-"; const specifier = prefix + "bundle.mjs"; import(specifier);`,
    `const specifier = "${target}"; const url = new URL(specifier, import.meta.url); import(url);`,
    `const specifier = "${target}"; const url = new URL(specifier, import.meta.url); const href = url.href; import(href);`,
  ];
  for (const source of cases) {
    assert.deepEqual(
      scan(source, "apps/api/src/runtime.ts"),
      ["dynamic-import"],
      source,
    );
  }
});

test("immutable createRequire factories and loaders retain provenance", () => {
  const cases = [
    `import { createRequire as makeRequire } from "node:module"; const factory = makeRequire; const specifier = "${target}"; const loader = factory(import.meta.url); const load = loader; load(specifier);`,
    `import * as Module from "node:module"; const specifier = "${target}"; const loader = Module.createRequire(import.meta.url); loader(specifier);`,
    `const Module = require("node:module"); const specifier = "${target}"; const loader = Module.createRequire(import.meta.url); loader(specifier);`,
  ];
  for (const source of cases) {
    assert.deepEqual(
      scan(source, "apps/api/src/runtime.ts"),
      ["require-import"],
      source,
    );
  }
});

test("URL utility aliases remain governed", () => {
  const source = `import { URL as NodeURL, pathToFileURL as toUrl } from "node:url"; const specifier = "${target}"; const url = new NodeURL(toUrl(specifier)); import(url.href);`;
  assert.deepEqual(
    scan(source, "apps/api/src/runtime.ts"),
    ["dynamic-import"],
  );
});

test("lexical shadowing, temporal order and mutable values do not inherit authority", () => {
  const cases = [
    `const specifier = "${target}"; { const specifier = "./safe.mjs"; import(specifier); }`,
    `const specifier = "${target}"; function run(specifier) { import(specifier); }`,
    `const specifier = "${target}"; { import(specifier); const specifier = "./safe.mjs"; }`,
    `function createRequire() { return () => {}; } const specifier = "${target}"; const loader = createRequire("safe"); loader(specifier);`,
    `const URL = class {}; const specifier = "${target}"; const url = new URL(specifier); import(url);`,
    `let specifier = "${target}"; import(specifier);`,
  ];
  for (const source of cases) {
    assert.deepEqual(scan(source, "apps/api/src/runtime.ts"), [], source);
  }
});

test("the tracked-file boundary resolves constants and loaders end to end", async () => {
  const root = await legacyFixture();
  try {
    await track(
      root,
      "apps/api/src/runtime.ts",
      `import { createRequire as makeRequire } from "node:module";\nconst prefix = "../../../../scripts/lib/animation-source-";\nconst specifier = prefix + "bundle.mjs";\nconst url = new URL(specifier, import.meta.url);\nconst loader = makeRequire(import.meta.url);\nimport(url.href);\nloader(url.href);\n`,
    );
    await track(
      root,
      "apps/api/src/docs.ts",
      `export const example = 'const specifier = "${target}"; import(specifier);';\n`,
    );

    const report = await inspectAnimationSourceLegacyUsageV2(root);
    assert.equal(report.status, "failed");
    assert.equal(report.stableDoubleRead, true);
    assert.equal(report.portablePathCollisionCheck, true);
    assert.deepEqual(report.violations, [
      {
        trackedPath: "apps/api/src/runtime.ts",
        accesses: ["dynamic-import", "require-import"],
      },
    ]);
    assert.equal(report.authority.githubActionsRequired, false);
    assert.equal(report.authority.vercelRequired, false);
    await assert.rejects(
      assertAnimationSourceLegacyUsageV2(root),
      /ANIMATION_SOURCE_LEGACY_V2_PRODUCTION_USAGE_FORBIDDEN/u,
    );
  } finally {
    await removeFixture(root);
  }
});
