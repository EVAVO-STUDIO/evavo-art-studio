import assert from "node:assert/strict";
import test from "node:test";

import {
  compileGameArtProductionProject,
  compileGameArtProductionWorkOrder,
} from "./index.mjs";
import { runGameArtProductionProfileCli } from "./profile-cli.mjs";

test("resolved projects and work orders are deterministic and the CLI exposes the same generic contracts", async () => {
  const firstProject = await compileGameArtProductionProject("reference-pixel-platformer");
  const secondProject = await compileGameArtProductionProject("reference-pixel-platformer");
  assert.equal(firstProject.resolvedProjectSha256, secondProject.resolvedProjectSha256);

  const input = {
    resolvedProject: firstProject,
    assetTypeId: "hero-cel",
    unitId: "hero-idle-000",
    subjectId: "hero",
    productionGroup: "idle",
    tokens: { frameIndex: 0 },
    creativeIntent: "Neutral idle cel with stable proportions and a readable grounded stance.",
  };
  const firstOrder = await compileGameArtProductionWorkOrder(input);
  const secondOrder = await compileGameArtProductionWorkOrder(input);
  assert.equal(firstOrder.workOrderSha256, secondOrder.workOrderSha256);

  const verification = await runGameArtProductionProfileCli(["verify"]);
  const cliProject = await runGameArtProductionProfileCli(["project", "reference-pixel-platformer"]);
  assert.equal(verification.status, "passed");
  assert.equal(cliProject.resolvedProjectSha256, firstProject.resolvedProjectSha256);
});
