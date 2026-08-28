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

test("legacy v2 rejects namespace, star, default, require and dynamic module access", async () => {
  const root = await legacyFixture();
  try {
    const cases = [
      ["apps/api/src/namespace.ts", 'import * as bundle from "../../../../scripts/lib/animation-source-bundle.mjs";\nvoid bundle;\n'],
      ["apps/api/src/default.ts", 'import bundle from "../../../../scripts/lib/animation-source-bundle.mjs";\nvoid bundle;\n'],
      ["packages/example/src/star.ts", 'export * from "../../../../scripts/lib/animation-source-bundle.mjs";\n'],
      ["tools/dynamic.mjs", 'const bundle = await import("../scripts/lib/animation-source-bundle.mjs");\nvoid bundle;\n'],
      ["tools/require.cjs", 'const bundle = require("../scripts/lib/animation-source-bundle.mjs");\nvoid bundle;\n'],
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
