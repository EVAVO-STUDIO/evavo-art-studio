import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { assertAnimationSourceLegacyUsageV2 } from "./lib/animation-source-legacy-boundary-v2.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

test("tracked Art Studio production code cannot regain legacy animation JSON authority", async () => {
  const report = await assertAnimationSourceLegacyUsageV2(repositoryRoot);
  assert.equal(report.status, "passed");
  assert.equal(report.stableDoubleRead, true);
  assert.equal(report.authority.githubActionsRequired, false);
  assert.equal(report.authority.vercelRequired, false);
});
