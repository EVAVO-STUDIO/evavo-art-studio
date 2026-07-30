import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import { LocalRuntimeRepository, RuntimeWorker } from "@evavo/art-runtime";
import sharp from "sharp";

import { createBuiltinHandlers } from "../dist/index.js";

const WIDTH = 16;
const HEIGHT = 16;

async function png(rectangles) {
  const data = Buffer.alloc(WIDTH * HEIGHT * 4);
  for (const rectangle of rectangles) {
    for (let y = rectangle.y; y < rectangle.y + rectangle.height; y += 1) {
      for (let x = rectangle.x; x < rectangle.x + rectangle.width; x += 1) {
        const offset = (y * WIDTH + x) * 4;
        data[offset] = rectangle.colour[0];
        data[offset + 1] = rectangle.colour[1];
        data[offset + 2] = rectangle.colour[2];
        data[offset + 3] = rectangle.colour[3] ?? 255;
      }
    }
  }
  return sharp(data, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

async function artifactByRole(store, artifactIds, role) {
  for (const artifactId of artifactIds) {
    const artifact = await store.get(artifactId);
    if (artifact?.labels.artifactRole === role) return artifact;
  }
  return null;
}

test("durable worker verifies a layered family without approving it", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-family-worker-"));
  const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const shadowBytes = await png([
    { x: 4, y: 12, width: 8, height: 2, colour: [12, 12, 12, 120] },
  ]);
  const bodyBytes = await png([
    { x: 5, y: 3, width: 6, height: 10, colour: [205, 46, 58, 255] },
  ]);
  const shadow = await artifacts.put(shadowBytes, {
    mediaType: "image/png",
    storageClass: "source",
    fileName: "shadow.png",
    labels: {
      artifactRole: "shadow-layer",
      approvalState: "approved",
      qualityState: "passed",
    },
  });
  const body = await artifacts.put(bodyBytes, {
    mediaType: "image/png",
    storageClass: "source",
    fileName: "body.png",
    labels: {
      artifactRole: "identity-core-layer",
      approvalState: "approved",
      qualityState: "passed",
    },
  });
  const declaredBytes = await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: shadowBytes, top: 0, left: 0, blend: "over" },
      { input: bodyBytes, top: 0, left: 0, blend: "over" },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  const declared = await artifacts.put(declaredBytes, {
    mediaType: "image/png",
    storageClass: "source",
    fileName: "declared.png",
    sourceArtifacts: [shadow.artifactId, body.artifactId],
    labels: {
      artifactRole: "declared-layered-composite",
      approvalState: "approved",
      qualityState: "passed",
    },
  });
  const manifest = {
    schemaVersion: "1.0",
    familyId: "worker-family",
    canvas: { width: WIDTH, height: HEIGHT },
    layerDefinitions: [
      {
        id: "shadow",
        role: "shadow",
        sourcePolicy: "static-family",
        required: true,
        contributesToComposite: true,
        contributesToIdentity: false,
        mustRemainSeparate: true,
        zIndex: -10,
        minimumVisibleFraction: 0.2,
        allowedOccludedBy: ["body"],
      },
      {
        id: "body",
        role: "identity-core",
        sourcePolicy: "per-frame",
        required: true,
        contributesToComposite: true,
        contributesToIdentity: true,
        zIndex: 0,
        minimumVisibleFraction: 0.75,
        registrationTolerancePixels: 0,
        occludes: ["shadow"],
      },
    ],
    frames: [
      {
        id: "idle-down-000",
        animation: "idle",
        direction: "down",
        frameIndex: 0,
        globalFrameIndex: 0,
        durationMs: 125,
        pivot: { x: 8, y: 12 },
        baseline: 12,
        groundContact: true,
        declaredCompositeArtifactId: declared.artifactId,
        layers: [
          { layerId: "shadow", artifactId: shadow.artifactId },
          { layerId: "body", artifactId: body.artifactId },
        ],
      },
    ],
    policy: {
      identityReferenceFrameId: "idle-down-000",
      pivotTolerancePixels: 0,
      baselineTolerancePixels: 0,
      groundContactTolerancePixels: 0,
      maximumCompositeMeanError: 0.5,
      maximumCompositeMismatchFraction: 0.01,
    },
  };
  const job = await runtime.submit({
    queue: "selection",
    kind: "sprite.family.verify",
    idempotencyKey: "worker-family",
    payload: manifest,
    inputArtifacts: [shadow.artifactId, body.artifactId, declared.artifactId],
    requiredCapabilities: [
      "sprite.family.verify",
      "media.layer-compose",
      "selection.compare",
      "evidence.bundle",
    ],
    maximumAttempts: 1,
    leaseDurationMs: 60_000,
    timeoutMs: 300_000,
  });
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: "family-worker-fixture",
      queues: ["selection"],
      capabilities: [
        "sprite.family.verify",
        "media.layer-compose",
        "selection.compare",
        "evidence.bundle",
      ],
    },
    handlers: createBuiltinHandlers([root]),
  });
  const run = await worker.runOnce();
  const completed = await runtime.get(job.id);
  assert.equal(run.succeeded, 1, JSON.stringify(completed?.failure ?? null));
  assert.equal(completed.state, "succeeded");
  assert.equal(completed.outputArtifacts.length, 4);
  const normalizedManifest = await artifactByRole(
    artifacts,
    completed.outputArtifacts,
    "sprite-family-normalized-manifest",
  );
  assert.ok(normalizedManifest);
  assert.equal(normalizedManifest.storageClass, "manifest");
  assert.equal(normalizedManifest.labels.approvalState, "evidence-only");
  const evidence = await artifactByRole(
    artifacts,
    completed.outputArtifacts,
    "sprite-family-consistency-evidence",
  );
  assert.ok(evidence);
  assert.equal(evidence.labels.evidenceEnvelope, "manifest-bound");
  assert.ok(evidence.sourceArtifacts.includes(normalizedManifest.artifactId));
  const bodyEvidence = JSON.parse(
    (await artifacts.read(evidence.artifactId)).toString("utf8"),
  );
  assert.equal(bodyEvidence.passed, true);
  assert.equal(bodyEvidence.manifestArtifactId, normalizedManifest.artifactId);
  const composite = await artifactByRole(
    artifacts,
    completed.outputArtifacts,
    "layered-frame-composite",
  );
  assert.ok(composite);
  assert.equal(composite.labels.approvalState, "unapproved");
  assert.equal(composite.labels.finalDeliverable, "false");
  assert.equal(
    await artifacts.resolveReference("projects/worker-family", "approved-master"),
    null,
  );
});
