import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createArtStudioApiServer } from "../dist/index.js";

const IDENTITY = `artifact_${"a".repeat(64)}`;

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

async function spritePlanRequest() {
  return JSON.parse(
    await readFile(
      new URL(
        "../../../examples/sprite-plan-isometric-playable-character.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}

async function supervisorRequest() {
  return {
    schemaVersion: "1.0",
    runId: "api-supervisor-proof",
    spritePlanRequest: await spritePlanRequest(),
    initialArtifactBindings: [
      { role: "canonical-identity", artifactIds: [IDENTITY] },
    ],
    tasks: [
      {
        id: "generate-direction-master",
        stage: "direction-masters",
        title: "Generate one bounded direction master",
        queue: "provider",
        kind: "art.candidate.generate",
        payloadTemplate: {
          schemaVersion: "1.0",
          operation: "generate",
          assetKind: "sprite-frame",
          continuityPhase: "direction-master",
          assetId: { $plan: "/asset/assetId" },
          candidateFamilyId: "deckhand-direction-master",
          frameId: "south-master",
          creativeIntent: "Create one south-facing direction master.",
          style: {
            styleName: "bound art direction",
            intent: "follow the compiled sprite plan",
          },
          shot: { subject: "approved deckhand", direction: "south" },
          target: {
            width: { $plan: "/asset/dimensions/width" },
            height: { $plan: "/asset/dimensions/height" },
            transparency: "required",
          },
          references: [
            {
              artifactId: { $artifact: "canonical-identity" },
              role: "canonical-identity",
            },
          ],
        },
        requiredCapabilities: [
          "provider.generate",
          "provider.reference-lock",
          "provider.candidate-store",
          "evidence.bundle",
        ],
        requiredArtifactRoles: ["canonical-identity"],
        outputBindings: [
          {
            role: "direction-master",
            source: "output-artifact-labels",
            labels: {
              artifactRole: "selected-art-master",
              approvalState: "selected",
              qualityState: "passed",
            },
            cardinality: "one",
          },
        ],
        failurePolicy: {
          redriveClassifications: ["transient"],
          maxRedrives: 2,
          reviewOnUnclassified: true,
        },
      },
    ],
    policy: {
      requireAllPlanStagesCovered: false,
      requireFinalHumanApproval: true,
      requiredReleaseArtifactRoles: ["direction-master"],
    },
  };
}

test("sprite supervisor protocol and compiler remain provider-free", async () => {
  await withServer(async (base) => {
    const protocol = await fetch(`${base}/v1/sprite-supervisor-protocol`);
    assert.equal(protocol.status, 200);
    const protocolBody = await protocol.json();
    assert.equal(protocolBody.protocolVersion, "2026-08-01.1");
    assert.ok(
      protocolBody.failureRules.some((entry) => entry.includes("redriven")),
    );
    assert.match(protocolBody.executionBoundary, /compile/i);

    const compiled = await fetch(`${base}/v1/sprite-supervisors/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(await supervisorRequest()),
    });
    assert.equal(compiled.status, 200);
    const body = await compiled.json();
    assert.equal(body.workflow.rootJob.kind, "art.sprite-production.supervise");
    assert.equal(body.workflow.request.spritePlan.directions.length, 8);
    assert.equal(body.workflow.request.tasks[0].kind, "art.candidate.generate");
    assert.deepEqual(body.workflow.rootJob.requiredCapabilities, [
      "sprite.supervisor.run",
      "runtime.jobs",
      "artifacts.store",
      "evidence.bundle",
    ]);
    assert.match(body.executionBoundary, /does not submit runtime work/i);
  });
});

test("sprite supervisor API rejects secrets and quality bypasses", async () => {
  await withServer(async (base) => {
    const input = await supervisorRequest();
    input.tasks[0].payloadTemplate.apiKey = "not-allowed";
    const response = await fetch(`${base}/v1/sprite-supervisors/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.equal(body.error.code, "SPRITE_SUPERVISOR_SECRET_FIELD_REJECTED");
  });
});
