import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import {
  LocalRuntimeRepository,
  RuntimeWorker,
} from "@evavo/art-runtime";
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
    familyId: "artifact-native-delivery-family",
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
    metadata: { loop: true },
  };
  const job = await runtime.submit({
    queue: "selection",
    kind: "sprite.family.verify",
    idempotencyKey: "artifact-native-delivery-family-verify",
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
      id: "artifact-native-delivery-family-worker",
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
  return { normalizedManifest, evidence, composite };
}

async function runDelivery({
  root,
  runtime,
  artifacts,
  family,
  payload,
  capabilities = [],
}) {
  const job = await runtime.submit({
    queue: "media",
    kind: "sprite.family.deliver",
    idempotencyKey:
      "artifact-native-family-delivery-" +
      Math.random().toString(16).slice(2),
    payload: {
      schemaVersion: "1.0",
      familyManifestArtifactId: family.normalizedManifest.artifactId,
      familyEvidenceArtifactId: family.evidence.artifactId,
      familyCompositeArtifactIds: [family.composite.artifactId],
      ...payload,
    },
    inputArtifacts: [
      family.normalizedManifest.artifactId,
      family.evidence.artifactId,
      family.composite.artifactId,
    ],
    requiredCapabilities: [
      "sprite.family.deliver",
      "media.atlas-build",
      "atlas.pack",
      "evidence.bundle",
      ...capabilities,
    ],
    maximumAttempts: 1,
    leaseDurationMs: 60_000,
    timeoutMs: 300_000,
  });
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: "artifact-native-family-delivery-worker",
      queues: ["media"],
      capabilities: [
        "sprite.family.deliver",
        "media.atlas-build",
        "atlas.pack",
        "evidence.bundle",
        ...capabilities,
      ],
    },
    handlers: createBuiltinHandlers([root]),
  });
  const run = await worker.runOnce();
  return {
    run,
    completed: await runtime.get(job.id),
  };
}

test("artifact-native family delivery builds atlas artifacts without an output path", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "evavo-family-delivery-"),
  );
  const runtime = new LocalRuntimeRepository({
    root: path.join(root, "runtime"),
  });
  const artifacts = new LocalArtifactStore({
    root: path.join(root, "artifacts"),
  });
  const family = await verifiedFamily(root, runtime, artifacts);

  const { run, completed } = await runDelivery({
    root,
    runtime,
    artifacts,
    family,
    payload: {
      atlas: {
        atlasId: "artifact-native-atlas",
        maximumWidth: 1024,
        maximumHeight: 1024,
        padding: 2,
        extrusion: 1,
        trim: true,
        powerOfTwo: "preferred",
        textureFiltering: "nearest",
        pngCompressionLevel: 9,
        loopMode: "linear",
      },
    },
  });
  assert.equal(run.succeeded, 1, JSON.stringify(completed?.failure ?? null));
  assert.equal(completed.state, "succeeded");
  const roles = new Set();
  for (const artifactId of completed.outputArtifacts) {
    const artifact = await artifacts.get(artifactId);
    if (artifact?.labels.artifactRole) {
      roles.add(artifact.labels.artifactRole);
    }
  }
  for (const role of [
    "verified-family-atlas-image",
    "verified-family-atlas-data",
    "verified-family-atlas-evidence",
    "verified-family-delivery-evidence",
  ]) {
    assert.ok(roles.has(role), role);
  }

  const delivery = await artifactByRole(
    artifacts,
    completed.outputArtifacts,
    "verified-family-delivery-evidence",
  );
  assert.ok(delivery);
  assert.equal(delivery.labels.qualityState, "passed");
  assert.equal(delivery.labels.releaseReady, "true");
  const body = JSON.parse(
    (await artifacts.read(delivery.artifactId)).toString("utf8"),
  );
  assert.equal(body.proof.sourceFamilyPassed, true);
  assert.equal(body.proof.sourceCompositeSetExact, true);
  assert.equal(body.proof.nativeAlphaRequired, true);
  assert.equal(body.proof.rotationForbidden, true);
  assert.equal(body.proof.callerSelectedExecutable, false);
  assert.equal(body.proof.localOnly, true);
  assert.equal(body.atlas.frameCount, 1);
  assert.equal(body.atlas.animationCount, 1);

  const stagingRoot = path.join(root, ".art-studio", "family-delivery");
  const remaining = await readdir(stagingRoot);
  assert.deepEqual(remaining, []);
});

test("artifact-native family delivery emits project-scoped Godot descriptor and importer", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "evavo-family-delivery-godot-"),
  );
  const runtime = new LocalRuntimeRepository({
    root: path.join(root, "runtime"),
  });
  const artifacts = new LocalArtifactStore({
    root: path.join(root, "artifacts"),
  });
  const family = await verifiedFamily(root, runtime, artifacts);
  const project = path.join(root, "game");
  await mkdir(project, { recursive: true });
  await writeFile(
    path.join(project, "project.godot"),
    '[application]\nconfig/name="EVAVO Test"\n',
    "utf8",
  );

  const { run, completed } = await runDelivery({
    root,
    runtime,
    artifacts,
    family,
    payload: {
      atlas: {
        atlasId: "artifact-native-godot-atlas",
        maximumWidth: 1024,
        maximumHeight: 1024,
        padding: 2,
        extrusion: 1,
        trim: false,
        powerOfTwo: "preferred",
        textureFiltering: "nearest",
        pngCompressionLevel: 9,
        loopMode: "linear",
      },
      godot: {
        projectPath: project,
        outputRelativeDirectory: "generated/evavo-test",
        runImporter: false,
        timeoutMs: 120000,
      },
    },
    capabilities: ["godot.spriteframes-build", "godot.export"],
  });
  assert.equal(run.succeeded, 1, JSON.stringify(completed?.failure ?? null));

  const descriptor = await artifactByRole(
    artifacts,
    completed.outputArtifacts,
    "godot-spriteframes-descriptor",
  );
  const importer = await artifactByRole(
    artifacts,
    completed.outputArtifacts,
    "godot-spriteframes-importer",
  );
  assert.ok(descriptor);
  assert.ok(importer);
  assert.equal(
    await artifactByRole(
      artifacts,
      completed.outputArtifacts,
      "godot-spriteframes-resource",
    ),
    null,
  );

  const output = path.join(
    project,
    "generated",
    "evavo-test",
    "artifact-native-godot-atlas",
  );
  await access(path.join(output, "artifact-native-godot-atlas.png"));
  await access(
    path.join(output, "artifact-native-godot-atlas.atlas.json"),
  );
  await access(
    path.join(
      output,
      "artifact-native-godot-atlas.godot.json",
    ),
  );
  await access(
    path.join(
      output,
      "artifact-native-godot-atlas.spriteframes.import.gd",
    ),
  );
});

test("artifact-native delivery rejects a composite set that differs from family evidence", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "evavo-family-delivery-mismatch-"),
  );
  const runtime = new LocalRuntimeRepository({
    root: path.join(root, "runtime"),
  });
  const artifacts = new LocalArtifactStore({
    root: path.join(root, "artifacts"),
  });
  const family = await verifiedFamily(root, runtime, artifacts);
  const unrelated = await artifacts.put(await spritePng(), {
    mediaType: "image/png",
    storageClass: "intermediate",
    fileName: "unrelated.png",
    labels: {
      artifactRole: "layered-frame-composite",
      qualityState: "passed",
      familyId: "artifact-native-delivery-family",
      frameId: "walk-right-000",
    },
  });

  const job = await runtime.submit({
    queue: "media",
    kind: "sprite.family.deliver",
    idempotencyKey: "artifact-native-family-delivery-mismatch",
    payload: {
      schemaVersion: "1.0",
      familyManifestArtifactId: family.normalizedManifest.artifactId,
      familyEvidenceArtifactId: family.evidence.artifactId,
      familyCompositeArtifactIds: [unrelated.artifactId],
      atlas: {
        atlasId: "artifact-native-atlas",
      },
    },
    inputArtifacts: [
      family.normalizedManifest.artifactId,
      family.evidence.artifactId,
      unrelated.artifactId,
    ],
    requiredCapabilities: [
      "sprite.family.deliver",
      "media.atlas-build",
      "atlas.pack",
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
      id: "artifact-native-family-delivery-mismatch-worker",
      queues: ["media"],
      capabilities: [
        "sprite.family.deliver",
        "media.atlas-build",
        "atlas.pack",
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
    "SPRITE_FAMILY_DELIVERY_COMPOSITE_SET_MISMATCH",
  );
});
