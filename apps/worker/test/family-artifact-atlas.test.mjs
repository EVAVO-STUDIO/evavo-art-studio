import assert from "node:assert/strict";
import { access, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import { LocalRuntimeRepository, RuntimeWorker } from "@evavo/art-runtime";
import sharp from "sharp";

import { createBuiltinHandlers } from "../dist/index.js";

const WIDTH = 16;
const HEIGHT = 16;

async function spritePng() {
  const data = Buffer.alloc(WIDTH * HEIGHT * 4);
  for (let y = 3; y < 14; y += 1) {
    for (let x = 5; x < 11; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      data[offset] = 205;
      data[offset + 1] = 46;
      data[offset + 2] = 58;
      data[offset + 3] = 255;
    }
  }
  return sharp(data, {
    raw: { width: WIDTH, height: HEIGHT, channels: 4 },
  })
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

async function verifiedFamily(root, runtime, artifacts) {
  const source = await artifacts.put(await spritePng(), {
    mediaType: "image/png",
    storageClass: "master",
    fileName: "walk-frame.png",
    labels: {
      artifactRole: "selected-art-master",
      approvalState: "selected",
      qualityState: "passed",
    },
  });
  const manifest = {
    schemaVersion: "1.0",
    familyId: "artifact-atlas-family",
    canvas: { width: WIDTH, height: HEIGHT },
    layerDefinitions: [
      {
        id: "identity-core",
        role: "identity-core",
        sourcePolicy: "per-frame",
        required: true,
        contributesToComposite: true,
        contributesToIdentity: true,
        mustRemainSeparate: false,
        zIndex: 0,
        minimumVisibleFraction: 0.01,
        registrationTolerancePixels: 0,
      },
    ],
    frames: [
      {
        id: "walk-right-000",
        animation: "walk",
        direction: "right",
        frameIndex: 0,
        globalFrameIndex: 0,
        durationMs: 125,
        pivot: { x: 8, y: 15 },
        groundContact: false,
        layers: [
          {
            layerId: "identity-core",
            artifactId: source.artifactId,
          },
        ],
      },
    ],
    policy: {
      identityReferenceFrameId: "walk-right-000",
      requireDeclaredComposite: false,
      requireReferenceLineage: false,
      requireQualityPassed: true,
      pivotTolerancePixels: 0,
      maximumCompositeMeanError: 0,
      maximumCompositeMismatchFraction: 0,
    },
    metadata: {
      loop: true,
    },
  };
  const job = await runtime.submit({
    queue: "selection",
    kind: "sprite.family.verify",
    idempotencyKey: "artifact-atlas-family-verify",
    payload: manifest,
    inputArtifacts: [source.artifactId],
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
      id: "artifact-atlas-family-worker",
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
  const normalizedManifest = await artifactByRole(
    artifacts,
    completed.outputArtifacts,
    "sprite-family-normalized-manifest",
  );
  const evidence = await artifactByRole(
    artifacts,
    completed.outputArtifacts,
    "sprite-family-consistency-evidence",
  );
  const composite = await artifactByRole(
    artifacts,
    completed.outputArtifacts,
    "layered-frame-composite",
  );
  assert.ok(normalizedManifest);
  assert.ok(evidence);
  assert.ok(composite);
  return { manifest, normalizedManifest, evidence, composite };
}

test("artifact-backed atlas build consumes only passed manifest-bound family composites", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-family-atlas-"));
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
  const family = await verifiedFamily(root, runtime, artifacts);
  const output = path.join(root, "generated");

  const job = await runtime.submit({
    queue: "media",
    kind: "sprite.atlas.build",
    idempotencyKey: "artifact-family-atlas-build",
    payload: {
      familyManifestArtifactId: family.normalizedManifest.artifactId,
      familyEvidenceArtifactId: family.evidence.artifactId,
      outputDirectory: output,
      atlasId: "artifact-family-atlas",
    },
    inputArtifacts: [
      family.normalizedManifest.artifactId,
      family.evidence.artifactId,
      family.composite.artifactId,
    ],
    requiredCapabilities: [
      "atlas.pack",
      "media.raster",
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
      id: "artifact-family-atlas-worker",
      queues: ["media"],
      capabilities: [
        "atlas.pack",
        "media.raster",
        "evidence.bundle",
      ],
    },
    handlers: createBuiltinHandlers([root]),
  });
  const run = await worker.runOnce();
  const completed = await runtime.get(job.id);
  assert.equal(run.succeeded, 1, JSON.stringify(completed?.failure ?? null));
  assert.equal(completed.state, "succeeded");

  for (const role of ["atlas-image", "atlas-data", "atlas-evidence"]) {
    const artifact = await artifactByRole(
      artifacts,
      completed.outputArtifacts,
      role,
    );
    assert.ok(artifact, role);
    assert.equal(artifact.labels.qualityState, "passed");
    assert.ok(
      artifact.sourceArtifacts.includes(
        family.normalizedManifest.artifactId,
      ),
    );
    assert.ok(
      artifact.sourceArtifacts.includes(family.evidence.artifactId),
    );
    assert.ok(
      artifact.sourceArtifacts.includes(family.composite.artifactId),
    );
  }
  await access(path.join(output, "artifact-family-atlas.png"));
  await access(path.join(output, "artifact-family-atlas.atlas.json"));
  await access(path.join(output, "artifact-family-atlas.evidence.json"));
});

test("artifact-backed atlas build rejects a manifest swapped after family verification", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-family-atlas-swap-"));
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
  const family = await verifiedFamily(root, runtime, artifacts);
  const swapped = await artifacts.put(
    JSON.stringify(family.manifest, null, 2) + "\n",
    {
      mediaType: "application/json",
      storageClass: "manifest",
      fileName: "swapped.sprite-family.manifest.json",
      sourceArtifacts: [family.composite.artifactId],
      labels: {
        artifactRole: "sprite-family-normalized-manifest",
        approvalState: "evidence-only",
      },
    },
  );

  const job = await runtime.submit({
    queue: "media",
    kind: "sprite.atlas.build",
    idempotencyKey: "artifact-family-atlas-swapped-manifest",
    payload: {
      familyManifestArtifactId: swapped.artifactId,
      familyEvidenceArtifactId: family.evidence.artifactId,
      outputDirectory: path.join(root, "generated"),
      atlasId: "artifact-family-atlas",
    },
    inputArtifacts: [
      swapped.artifactId,
      family.evidence.artifactId,
      family.composite.artifactId,
    ],
    requiredCapabilities: [
      "atlas.pack",
      "media.raster",
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
      id: "artifact-family-atlas-swap-worker",
      queues: ["media"],
      capabilities: [
        "atlas.pack",
        "media.raster",
        "evidence.bundle",
      ],
    },
    handlers: createBuiltinHandlers([root]),
  });
  const run = await worker.runOnce();
  const completed = await runtime.get(job.id);
  assert.equal(run.failed, 1);
  assert.equal(completed.state, "failed");
  assert.equal(
    completed.failure?.code,
    "ATLAS_FAMILY_EVIDENCE_STATE_INVALID",
  );
});
