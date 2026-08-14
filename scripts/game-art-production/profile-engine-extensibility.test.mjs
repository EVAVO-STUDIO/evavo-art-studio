import assert from "node:assert/strict";
import test from "node:test";

import {
  compileGameArtProductionWorkOrder,
  loadGameArtProductionProfile,
  loadGameArtProductionProjectBinding,
  resolveGameArtProductionProject,
} from "./index.mjs";
import { customStrategyInputs } from "./profile-engine.test-support.mjs";

test("a completely new game type resolves from in-memory profile and project data without engine changes", async () => {
  const inputs = customStrategyInputs();
  const before = JSON.stringify(inputs);
  const project = resolveGameArtProductionProject(inputs);
  const order = await compileGameArtProductionWorkOrder({
    resolvedProject: project,
    assetTypeId: "ranger-concept",
    unitId: "ranger-base-concept",
    subjectId: "ranger",
    productionGroup: "base",
    creativeIntent: "Readable long-range reconnaissance unit concept with a stable faction silhouette.",
  });

  assert.equal(project.gameType, "tactical-strategy");
  assert.equal(project.era, "modern");
  assert.deepEqual(order.assetContract.nativeDimensions, { width: 1024, height: 1024 });
  assert.equal(order.assetContract.authoringScale.policy, "uniform");
  assert.equal(order.assetContract.authoringScale.x, 1);
  assert.equal(order.renderingContract.textureFiltering, "linear");
  assert.equal(order.output.working, "working/units/ranger/base/ranger-base-concept.png");
  assert.equal(order.authority.providerExecution, false);
  assert.equal(JSON.stringify(inputs), before, "profile resolution must not mutate caller data");
});

test("project bindings may specialize production data but cannot escalate authority or inject arbitrary override fields", async () => {
  const profile = await loadGameArtProductionProfile("arcade-fighter-1990s");
  const baseProject = await loadGameArtProductionProjectBinding("heavy-metal-fighting");

  const authorityEscalation = structuredClone(baseProject);
  authorityEscalation.authority.targetRepositoryMutation = true;
  assert.throws(
    () => resolveGameArtProductionProject({ profile, project: authorityEscalation }),
    /targetRepositoryMutation must remain false/i,
  );

  const fanoutEscalation = structuredClone(baseProject);
  fanoutEscalation.productionDefaults.candidateFanout = 2;
  assert.throws(
    () => resolveGameArtProductionProject({ profile, project: fanoutEscalation }),
    /candidateFanout must be between 1 and 1/i,
  );

  const arbitraryOverride = structuredClone(baseProject);
  arbitraryOverride.assetTypeOverrides["character-body-cel"].authority = { providerExecution: true };
  assert.throws(
    () => resolveGameArtProductionProject({ profile, project: arbitraryOverride }),
    /unsupported key authority/i,
  );

  const traversalOverride = structuredClone(baseProject);
  traversalOverride.assetTypeOverrides["character-body-cel"].pathTemplate = "working/../escape/{unitId}.png";
  assert.throws(
    () => resolveGameArtProductionProject({ profile, project: traversalOverride }),
    /unsafe path segment/i,
  );
});
