import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createArtStudioApiServer } from "../dist/index.js";

async function withServer(run) {
  const server = createArtStudioApiServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

async function request() {
  const workflow = JSON.parse(
    await readFile(
      new URL("../../../examples/automatic-sprite-workflow.json", import.meta.url),
      "utf8",
    ),
  );
  workflow.spritePlanRequest.artDirectionRequest.style.palette = {
    mode: "indexed",
    colours: ["#00ff00", "#202020", "#eeeeee"],
    maxColours: 32,
  };
  return {
    schemaVersion: "1.0",
    workflow,
    background: {
      mode: "auto",
      nativeAlphaAdapterIds: [],
      requireFakeTransparencyRejection: true,
      requireMeaningfulAlpha: true,
      proofBackgrounds: [
        "#000000",
        "#ffffff",
        "#808080",
        "#00ff00",
        "#ff00ff",
      ],
    },
    finalization: {
      deliveryProfileId: "godot-sprite-lossless",
      requireFamilyVerification: true,
      requireHostileMatteProof: true,
      requireNoRejectedArtifacts: true,
      requireExactDimensions: true,
      maximumDeterministicRepairPasses: 2,
      transparentBleedRadius: 2,
      matteSearchRadius: 6,
      matteDistanceThreshold: 72,
    },
  };
}

test("automatic finalization API compiles adaptive proof without executing work", async () => {
  await withServer(async (base) => {
    const protocol = await fetch(
      `${base}/v1/automatic-sprite-finalization-protocol`,
    );
    assert.equal(protocol.status, 200);
    const protocolBody = await protocol.json();
    assert.equal(protocolBody.protocolVersion, "2026-08-01.1");
    assert.ok(protocolBody.backgroundModes.includes("magenta-matte"));
    assert.ok(
      protocolBody.backgroundRules.some((entry) =>
        entry.includes("checkerboards"),
      ),
    );
    assert.ok(
      protocolBody.adaptiveRepairRules.some((entry) => entry.includes("bounded")),
    );
    assert.ok(
      protocolBody.proofRules.some((entry) => entry.includes("proof artifact")),
    );

    const compiled = await fetch(
      `${base}/v1/automatic-sprite-finalizations/compile`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(await request()),
      },
    );
    assert.equal(compiled.status, 200);
    const body = await compiled.json();
    assert.equal(
      body.workflow.analysis.background.matteColour,
      "#ff00ff",
    );
    assert.equal(
      body.workflow.supervisorWorkflow.rootJob.kind,
      "art.sprite-production.supervise",
    );
    assert.ok(
      body.workflow.supervisorRequest.policy.requiredReleaseArtifactRoles.includes(
        "automatic.family-finalization-evidence",
      ),
    );
    assert.ok(
      body.workflow.supervisorRequest.policy.requiredReleaseArtifactRoles.includes(
        "automatic.family-adaptive-proof-evidence",
      ),
    );
    assert.ok(
      body.workflow.supervisorRequest.tasks.some(
        (task) => task.kind === "art.candidate.finalize-adaptive",
      ),
    );
    assert.match(body.executionBoundary, /Compile-only/i);
  });
});

test("automatic finalization API rejects unsafe black background use", async () => {
  await withServer(async (base) => {
    const input = await request();
    input.background.mode = "black-additive";
    const response = await fetch(
      `${base}/v1/automatic-sprite-finalizations/validate`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.equal(body.error.code, "AUTOMATIC_SPRITE_BACKGROUND_BLACK_INVALID");
  });
});

test("automatic finalization API rejects unbounded repair options", async () => {
  await withServer(async (base) => {
    const input = await request();
    input.finalization.maximumDeterministicRepairPasses = 99;
    const response = await fetch(
      `${base}/v1/automatic-sprite-finalizations/validate`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.equal(body.error.code, "ADAPTIVE_FINALIZATION_OPTION_INVALID");
  });
});
