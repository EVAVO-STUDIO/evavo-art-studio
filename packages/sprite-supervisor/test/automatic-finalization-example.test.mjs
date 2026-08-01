import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { compileAutomaticSpriteFinalizationWorkflow } from "../dist/index.js";

test("published eight-direction 3d finalization example compiles completely", async () => {
  const input = JSON.parse(
    await readFile(
      new URL(
        "../../../examples/automatic-sprite-finalization.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const compiled = compileAutomaticSpriteFinalizationWorkflow(input);
  const plan = compiled.baseWorkflow.request.spritePlan;
  assert.equal(plan.directions.length, 8);
  assert.equal(
    plan.directions.every((direction) => direction.authored),
    true,
  );
  assert.equal(compiled.analysis.threeD.directionCoverage.length, 8);
  assert.deepEqual(compiled.analysis.threeD.missingDirectionReferences, []);
  assert.equal(compiled.analysis.background.resolvedMode, "chroma-key");
  assert.equal(compiled.analysis.finalization.fakeTransparencyIsBlocking, true);
  assert.ok(compiled.analysis.finalization.candidateFinalizationTasks > 0);
  assert.ok(
    compiled.supervisorRequest.tasks.some(
      (task) => task.kind === "sprite.family.verify",
    ),
  );
  assert.deepEqual(
    compiled.supervisorRequest.policy.requiredReleaseArtifactRoles,
    [
      "automatic.family-manifest",
      "automatic.family-finalization-evidence",
      "automatic.family-adaptive-proof-evidence",
    ],
  );
});
