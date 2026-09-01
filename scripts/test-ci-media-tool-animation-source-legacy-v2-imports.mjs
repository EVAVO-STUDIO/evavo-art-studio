import assert from "node:assert/strict";
import test from "node:test";

import {
  assertAnimationSourceLegacyUsageV2,
  inspectAnimationSourceLegacyUsageV2,
} from "./lib/animation-source-legacy-boundary-v2.mjs";
import {
  legacyFixture,
  removeFixture,
  track,
} from "./test-support/animation-source-legacy-v2-fixture.mjs";

test("legacy v2 permits safe production imports and historical test coverage", async () => {
  const root = await legacyFixture();
  try {
    await track(root, "scripts/lib/animation-source-bundle.mjs",
      "export async function readJson() {}\nexport async function writeJsonAtomic() {}\n");
    await track(root, "scripts/test-ci-media-tool-compat.mjs",
      'import { readJson } from "./lib/animation-source-bundle.mjs";\nvoid readJson;\n');
    await track(root, "scripts/production-safe.mjs",
      'import { assertAnimationSourceBundle } from "./lib/animation-source-bundle.mjs";\nvoid assertAnimationSourceBundle;\n');
    const report = await assertAnimationSourceLegacyUsageV2(root);
    assert.equal(report.status, "passed");
    assert.equal(report.stableDoubleRead, true);
    assert.equal(report.portablePathCollisionCheck, true);
  } finally {
    await removeFixture(root);
  }
});

test("legacy v2 rejects named imports and re-exports", async () => {
  const root = await legacyFixture();
  try {
    await track(root, "scripts/unsafe.mjs",
      'import { readJson as unsafe } from "./lib/animation-source-bundle.mjs";\nvoid unsafe;\n');
    await track(root, "packages/example/src/export.ts",
      'export { writeJsonAtomic } from "../../../../scripts/lib/animation-source-bundle.mjs";\n');
    const report = await inspectAnimationSourceLegacyUsageV2(root);
    assert.equal(report.status, "failed");
    assert.deepEqual(report.violations.map((entry) => entry.trackedPath), [
      "packages/example/src/export.ts",
      "scripts/unsafe.mjs",
    ]);
    await assert.rejects(
      assertAnimationSourceLegacyUsageV2(root),
      /ANIMATION_SOURCE_LEGACY_V2_PRODUCTION_USAGE_FORBIDDEN/u,
    );
  } finally {
    await removeFixture(root);
  }
});

test("legacy v2 does not treat a production test-prefixed filename as a test boundary", async () => {
  const root = await legacyFixture();
  try {
    await track(root, "apps/api/src/test-runtime.ts",
      'import { readJson } from "../../../../scripts/lib/animation-source-bundle.mjs";\nvoid readJson;\n');
    const report = await inspectAnimationSourceLegacyUsageV2(root);
    assert.equal(report.status, "failed");
    assert.equal(report.violations[0].trackedPath, "apps/api/src/test-runtime.ts");
  } finally {
    await removeFixture(root);
  }
});

test("legacy v2 rejects URL variants, encoded dots, escaped dots and portable case variants", async () => {
  const root = await legacyFixture();
  try {
    const cases = [
      ["apps/api/src/query.ts", 'import { readJson } from "../../../../scripts/lib/animation-source-bundle.mjs?legacy=1";\nvoid readJson;\n'],
      ["apps/api/src/fragment.ts", 'import { readJson } from "../../../../scripts/lib/animation-source-bundle.mjs#legacy";\nvoid readJson;\n'],
      ["apps/api/src/percent.ts", 'import { readJson } from "../../../../scripts/lib/animation-source-bundle%2Emjs";\nvoid readJson;\n'],
      ["apps/api/src/unicode.ts", 'import { readJson } from "../../../../scripts/lib/animation-source-bundle\\u002emjs";\nvoid readJson;\n'],
      ["apps/api/src/hex.ts", 'import { readJson } from "../../../../scripts/lib/animation-source-bundle\\x2emjs";\nvoid readJson;\n'],
      ["apps/api/src/case.ts", 'import type { readJson } from "../../../../scripts/lib/Animation-Source-Bundle.mjs";\n'],
    ];
    for (const [trackedPath, content] of cases) {
      await track(root, trackedPath, content);
    }
    const report = await inspectAnimationSourceLegacyUsageV2(root);
    assert.equal(report.status, "failed");
    assert.equal(report.violations.length, cases.length);
    assert.ok(report.violations.every((entry) => entry.accesses.includes("readJson")));
  } finally {
    await removeFixture(root);
  }
});

test("legacy v2 treats JavaScript comments as token gaps, not scanner bypasses", async () => {
  const root = await legacyFixture();
  try {
    const cases = [
      ["apps/api/src/commented-named.ts", 'import/*a*/{ readJson }/*b*/from/*c*/"../../../../scripts/lib/animation-source-bundle.mjs";\nvoid readJson;\n'],
      ["apps/api/src/commented-export.ts", 'export/*a*/{ writeJsonAtomic }/*b*/from/*c*/"../../../../scripts/lib/animation-source-bundle.mjs";\n'],
      ["apps/api/src/commented-namespace.ts", 'import/*a*/* as bundle/*b*/from/*c*/"../../../../scripts/lib/animation-source-bundle.mjs";\nvoid bundle;\n'],
      ["tools/commented-dynamic.mjs", 'const bundle = await import/*a*/(/*b*/"../scripts/lib/animation-source-bundle.mjs?legacy=1"/*c*/, { with: { type: "json" } });\nvoid bundle;\n'],
      ["tools/commented-require.cjs", 'const bundle = require/*a*/(/*b*/"../scripts/lib/animation-source-bundle.mjs#legacy"/*c*/);\nvoid bundle;\n'],
    ];
    for (const [trackedPath, content] of cases) {
      await track(root, trackedPath, content);
    }
    const report = await inspectAnimationSourceLegacyUsageV2(root);
    assert.equal(report.status, "failed");
    assert.equal(report.violations.length, cases.length);
    assert.ok(report.violations.some((entry) => entry.accesses.includes("readJson")));
    assert.ok(report.violations.some((entry) => entry.accesses.includes("writeJsonAtomic")));
    assert.ok(report.violations.some((entry) => entry.accesses.includes("dynamic-import")));
  } finally {
    await removeFixture(root);
  }
});

test("legacy v2 rejects namespace, star, default, require and dynamic module access", async () => {
  const root = await legacyFixture();
  try {
    const cases = [
      ["apps/api/src/namespace.ts", 'import * as bundle from "../../../../scripts/lib/animation-source-bundle.mjs";\nvoid bundle;\n'],
      ["apps/api/src/default.ts", 'import bundle from "../../../../scripts/lib/animation-source-bundle.mjs";\nvoid bundle;\n'],
      ["packages/example/src/star.ts", 'export * from "../../../../scripts/lib/animation-source-bundle.mjs";\n'],
      ["tools/dynamic.mjs", 'const bundle = await import("../scripts/lib/animation-source-bundle.mjs?legacy=1", { with: { type: "json" } });\nvoid bundle;\n'],
      ["tools/require.cjs", 'const bundle = require("../scripts/lib/animation-source-bundle.mjs#legacy");\nvoid bundle;\n'],
    ];
    for (const [trackedPath, content] of cases) await track(root, trackedPath, content);
    const report = await inspectAnimationSourceLegacyUsageV2(root);
    assert.equal(report.status, "failed");
    assert.equal(report.violations.length, 5);
    assert.ok(report.violations.some((entry) => entry.accesses.includes("namespace-import")));
    assert.ok(report.violations.some((entry) => entry.accesses.includes("dynamic-import")));
  } finally {
    await removeFixture(root);
  }
});
