import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import {
  LocalRuntimeRepository,
  RuntimeWorker,
} from "@evavo/art-runtime";
import { SPRITE_FAMILY_PROTOCOL_VERSION } from "@evavo/art-sprite-family";
import sharp from "sharp";

import { createBuiltinHandlers } from "../dist/index.js";

const gate = (id, status = "pass") => ({
  id,
  status,
  blocking: true,
  message: `${id} ${status}`,
  evidence: {},
});

test("durable repair worker stores planning evidence without mutating approved references", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-repair-worker-"));
  const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const bytes = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 220, g: 40, b: 50, alpha: 1 },
    },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  const body = await artifacts.put(bytes, {
    mediaType: "image/png",
    storageClass: "source",
    fileName: "body.png",
    labels: {
      artifactRole: "identity-core-layer",
      qualityState: "passed",
      approvalState: "approved",
    },
  });
  const evidence = {
    schemaVersion: "1.0",
    protocolVersion: SPRITE_FAMILY_PROTOCOL_VERSION,
    familyId: "worker-family",
    manifestSha256: "a".repeat(64),
    passed: false,
    completedAt: "2026-07-30T00:00:00.000Z",
    canvas: { width: 8, height: 8 },
    layerDefinitions: [
      {
        id: "body",
        role: "identity-core",
        sourcePolicy: "per-frame",
        required: true,
        contributesToComposite: true,
        contributesToIdentity: true,
        mustRemainSeparate: false,
        zIndex: 0,
        blendMode: "normal",
        minimumVisibleFraction: 0.5,
        registrationTolerancePixels: 0,
        allowedOccludedBy: [],
        occludes: [],
      },
    ],
    frameEvidence: [
      {
        frameId: "idle-000",
        animation: "idle",
        direction: "down",
        frameIndex: 0,
        globalFrameIndex: 0,
        pivot: { x: 4, y: 7 },
        groundContact: true,
        generatedCompositeArtifactId: body.artifactId,
        generatedCompositeSha256: body.contentSha256,
        identityCompositeSha256: body.contentSha256,
        layers: [
          {
            layerId: "body",
            role: "identity-core",
            artifactId: body.artifactId,
            descriptorSha256: body.descriptorSha256,
            contentSha256: body.contentSha256,
            width: 8,
            height: 8,
            offset: { x: 0, y: 0 },
            opacity: 1,
            visiblePixels: 64,
            visibleFraction: 1,
            compositeContributionPixels: 64,
            compositeContributionFraction: 1,
            occludedPixels: 0,
            occludedFraction: 0,
            centroid: { x: 3.5, y: 3.5 },
            centroidRelativeToPivot: { x: -0.5, y: -3.5 },
            gates: [gate("layer-registration")],
          },
        ],
        parity: {
          generatedSha256: body.contentSha256,
          exact: true,
          comparedChannels: 256,
          mismatchedChannels: 0,
          mismatchFraction: 0,
          meanAbsoluteError: 0,
          maximumAbsoluteError: 0,
        },
        comparisons: [],
        gates: [gate("frame-pivot", "fail")],
        passed: false,
      },
    ],
    familyGates: [gate("family-all-frames-pass", "fail")],
    generatedCompositeArtifactIds: [body.artifactId],
    sourceArtifactIds: [body.artifactId],
  };
  const familyEvidence = await artifacts.put(`${JSON.stringify(evidence)}\n`, {
    mediaType: "application/json",
    storageClass: "evidence",
    fileName: "worker-family.evidence.json",
    sourceArtifacts: [body.artifactId],
    labels: {
      artifactRole: "sprite-family-consistency-evidence",
      qualityState: "rejected",
      approvalState: "evidence-only",
    },
  });
  const job = await runtime.submit({
    queue: "selection",
    kind: "art.repair.plan",
    idempotencyKey: "worker-pivot-repair",
    payload: {
      schemaVersion: "1.0",
      repairId: "worker-pivot-repair",
      familyEvidenceArtifactId: familyEvidence.artifactId,
      target: { frameId: "idle-000", gateIds: ["frame-pivot"] },
      intent: "Correct the approved pivot metadata without changing pixels.",
      provider: { enabled: false },
    },
    inputArtifacts: [familyEvidence.artifactId],
    requiredCapabilities: [
      "repair.plan",
      "artifacts.store",
      "evidence.bundle",
    ],
    maximumAttempts: 1,
    leaseDurationMs: 10_000,
    timeoutMs: 60_000,
  });
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: "repair-worker-fixture",
      queues: ["selection"],
      capabilities: ["repair.plan", "artifacts.store", "evidence.bundle"],
    },
    handlers: createBuiltinHandlers([root]),
  });
  const run = await worker.runOnce();
  assert.equal(run.succeeded, 1);
  const completed = await runtime.get(job.id);
  assert.equal(completed.state, "succeeded");
  assert.equal(completed.outputArtifacts.length, 2);
  const outputRecords = await Promise.all(
    completed.outputArtifacts.map(async (artifactId) => ({
      artifactId,
      artifact: await artifacts.get(artifactId),
    })),
  );
  const packet = outputRecords.find(
    (entry) => entry.artifact?.labels.artifactRole === "targeted-repair-packet",
  );
  assert.ok(packet, "worker output must include targeted-repair-packet evidence");
  const bodyResult = JSON.parse(
    (await artifacts.read(packet.artifactId)).toString("utf8"),
  );
  assert.equal(bodyResult.disposition, "ready");
  assert.deepEqual(bodyResult.steps.map((step) => step.strategy), [
    "metadata-adjustment",
  ]);
  assert.equal(bodyResult.providerPlan, undefined);
  assert.equal(
    await artifacts.resolveReference("projects/worker", "approved-master"),
    null,
  );
});
