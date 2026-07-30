import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import sharp from "sharp";

import {
  SpriteFamilyError,
  renderSpriteComposite,
  spriteFamilyProtocolSummary,
  validateSpriteFamilyManifest,
  verifySpriteFamily,
} from "../dist/index.js";
import { decodeSelectionImage } from "@evavo/art-selection";

const CANVAS = { width: 16, height: 16 };

async function layerPng(rectangles) {
  const data = Buffer.alloc(CANVAS.width * CANVAS.height * 4);
  for (const rectangle of rectangles) {
    for (let y = rectangle.y; y < rectangle.y + rectangle.height; y += 1) {
      for (let x = rectangle.x; x < rectangle.x + rectangle.width; x += 1) {
        const offset = (y * CANVAS.width + x) * 4;
        data[offset] = rectangle.colour[0];
        data[offset + 1] = rectangle.colour[1];
        data[offset + 2] = rectangle.colour[2];
        data[offset + 3] = rectangle.colour[3] ?? 255;
      }
    }
  }
  return sharp(data, {
    raw: { width: CANVAS.width, height: CANVAS.height, channels: 4 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

async function putImage(store, fileName, bytes, options = {}) {
  return store.put(bytes, {
    mediaType: "image/png",
    storageClass: options.storageClass ?? "source",
    fileName,
    sourceArtifacts: options.sourceArtifacts ?? [],
    labels: {
      artifactRole: options.role ?? "sprite-layer",
      qualityState: "passed",
      approvalState: options.approvalState ?? "approved",
      ...options.labels,
    },
  });
}

async function declaredComposite(store, fileName, layers) {
  const image = await sharp({
    create: {
      width: CANVAS.width,
      height: CANVAS.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(
      layers.map((entry) => ({
        input: entry.bytes,
        top: entry.offset?.y ?? 0,
        left: entry.offset?.x ?? 0,
        blend: "over",
      })),
    )
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  return putImage(store, fileName, image, {
    role: "declared-layered-composite",
  });
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-family-"));
  const store = new LocalArtifactStore({ root });
  const body0Bytes = await layerPng([
    { x: 5, y: 3, width: 6, height: 10, colour: [205, 46, 58, 255] },
  ]);
  const body0 = await putImage(store, "body-0.png", body0Bytes, {
    role: "identity-core-layer",
  });
  const body1Bytes = await layerPng([
    { x: 6, y: 3, width: 6, height: 10, colour: [205, 46, 58, 255] },
  ]);
  const body1 = await putImage(store, "body-1.png", body1Bytes, {
    role: "identity-core-layer",
    sourceArtifacts: [body0.artifactId],
  });
  const shadowBytes = await layerPng([
    { x: 4, y: 12, width: 8, height: 2, colour: [18, 18, 18, 120] },
  ]);
  const shadow = await putImage(store, "shadow.png", shadowBytes, {
    role: "shadow-layer",
  });
  const weaponBytes = await layerPng([
    { x: 10, y: 6, width: 3, height: 5, colour: [74, 112, 176, 255] },
  ]);
  const weapon = await putImage(store, "weapon.png", weaponBytes, {
    role: "weapon-layer",
    sourceArtifacts: [body0.artifactId],
  });
  const normalBytes = await layerPng([
    { x: 5, y: 3, width: 6, height: 10, colour: [128, 128, 255, 255] },
  ]);
  const normal = await putImage(store, "normal.png", normalBytes, {
    role: "normal-sidecar",
  });
  const declared0 = await declaredComposite(store, "declared-0.png", [
    { bytes: shadowBytes },
    { bytes: body0Bytes },
    { bytes: weaponBytes },
  ]);
  const declared1 = await declaredComposite(store, "declared-1.png", [
    { bytes: shadowBytes },
    { bytes: body1Bytes },
    { bytes: weaponBytes },
  ]);

  const definitions = [
    {
      id: "shadow",
      role: "shadow",
      sourcePolicy: "static-family",
      required: true,
      contributesToComposite: true,
      contributesToIdentity: false,
      mustRemainSeparate: true,
      zIndex: -10,
      blendMode: "normal",
      minimumVisibleFraction: 0.2,
      registrationTolerancePixels: 0,
      allowedOccludedBy: ["body", "weapon"],
    },
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
      minimumVisibleFraction: 0.75,
      registrationTolerancePixels: 2,
      occludes: ["shadow"],
    },
    {
      id: "weapon",
      role: "weapon",
      sourcePolicy: "linked-cel",
      required: true,
      contributesToComposite: true,
      contributesToIdentity: true,
      mustRemainSeparate: true,
      zIndex: 10,
      blendMode: "normal",
      minimumVisibleFraction: 0.9,
      registrationTolerancePixels: 0,
      occludes: ["body", "shadow"],
    },
    {
      id: "normal",
      role: "normal",
      sourcePolicy: "engine-sidecar",
      required: true,
      contributesToComposite: false,
      contributesToIdentity: false,
      mustRemainSeparate: false,
      zIndex: 20,
      blendMode: "normal",
    },
  ];
  const frames = [
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
      declaredCompositeArtifactId: declared0.artifactId,
      layers: [
        { layerId: "shadow", artifactId: shadow.artifactId },
        { layerId: "body", artifactId: body0.artifactId },
        { layerId: "weapon", artifactId: weapon.artifactId },
        { layerId: "normal", artifactId: normal.artifactId },
      ],
    },
    {
      id: "idle-down-001",
      animation: "idle",
      direction: "down",
      frameIndex: 1,
      globalFrameIndex: 1,
      durationMs: 125,
      pivot: { x: 8, y: 12 },
      baseline: 12,
      groundContact: true,
      declaredCompositeArtifactId: declared1.artifactId,
      layers: [
        { layerId: "shadow", artifactId: shadow.artifactId },
        { layerId: "body", artifactId: body1.artifactId },
        {
          layerId: "weapon",
          artifactId: weapon.artifactId,
          linkedFromFrameId: "idle-down-000",
        },
        { layerId: "normal", artifactId: normal.artifactId },
      ],
    },
  ];
  const manifest = {
    schemaVersion: "1.0",
    familyId: "hero-idle-down",
    canvas: CANVAS,
    layerDefinitions: definitions,
    frames,
    policy: {
      identityReferenceFrameId: "idle-down-000",
      requireDeclaredComposite: true,
      requireReferenceLineage: true,
      requireQualityPassed: true,
      maximumTranslationPixels: 3,
      maximumEdgeDistancePixels: 8,
      pivotTolerancePixels: 0,
      baselineTolerancePixels: 0,
      groundContactTolerancePixels: 0,
      minimumCanonicalVisibleAreaSimilarity: 0.75,
      minimumCanonicalPaletteSimilarity: 0.7,
      minimumCanonicalCentroidSimilarity: 0.7,
      minimumAdjacentVisibleAreaSimilarity: 0.75,
      minimumAdjacentPaletteSimilarity: 0.7,
      minimumAdjacentCentroidSimilarity: 0.7,
      compositeChannelTolerance: 1,
      maximumCompositeMeanError: 0.5,
      maximumCompositeMismatchFraction: 0.01,
    },
  };
  return {
    root,
    store,
    manifest,
    artifacts: { body0, body1, shadow, weapon, normal, declared0, declared1 },
    bytes: { body0Bytes, body1Bytes, shadowBytes, weaponBytes, normalBytes },
  };
}

test("protocol defines explicit layer and family boundaries", () => {
  const protocol = spriteFamilyProtocolSummary();
  assert.ok(protocol.layerRoles.includes("identity-core"));
  assert.ok(protocol.layerRoles.includes("shadow"));
  assert.ok(protocol.layerRoles.includes("collision"));
  assert.ok(protocol.sourcePolicies.includes("linked-cel"));
  assert.ok(protocol.rules.some((entry) => entry.includes("sidecars")));
});

test("normal source-over compositing honours z-order", async () => {
  const bottomBytes = await layerPng([
    { x: 4, y: 4, width: 4, height: 4, colour: [255, 0, 0, 255] },
  ]);
  const topBytes = await layerPng([
    { x: 5, y: 5, width: 2, height: 2, colour: [0, 0, 255, 255] },
  ]);
  const definition = (id, zIndex) => ({
    id,
    role: "identity-core",
    sourcePolicy: "per-frame",
    required: true,
    contributesToComposite: true,
    contributesToIdentity: true,
    mustRemainSeparate: false,
    zIndex,
    blendMode: "normal",
    minimumVisibleFraction: 0,
    registrationTolerancePixels: 8,
    allowedOccludedBy: [],
    occludes: [],
  });
  const resolved = async (id, zIndex, bytes) => ({
    definition: definition(id, zIndex),
    instance: {
      layerId: id,
      artifactId: `artifact_${(zIndex ? "2" : "1").repeat(64)}`,
      offset: { x: 0, y: 0 },
      opacity: 1,
    },
    features: await decodeSelectionImage(bytes, { alphaVisibleThreshold: 8 }),
    descriptorSha256: "a".repeat(64),
    contentSha256: "b".repeat(64),
  });
  const output = await renderSpriteComposite(
    CANVAS,
    [await resolved("bottom", 0, bottomBytes), await resolved("top", 1, topBytes)],
    8,
  );
  const pixel = (x, y) => [
    ...output.rgba.subarray(
      (y * CANVAS.width + x) * 4,
      (y * CANVAS.width + x) * 4 + 4,
    ),
  ];
  assert.deepEqual(pixel(4, 4), [255, 0, 0, 255]);
  assert.deepEqual(pixel(5, 5), [0, 0, 255, 255]);
  assert.equal(output.layerEvidence[0].occludedPixels, 4);
  assert.equal(output.layerEvidence[1].contributionPixels, 4);
});

test("verifies a layered family and retains unapproved reconstructed composites", async () => {
  const { store, manifest } = await fixture();
  const result = await verifySpriteFamily(manifest, {
    artifacts: store,
    now: () => new Date("2026-07-30T03:00:00.000Z"),
  });
  assert.equal(result.evidence.passed, true);
  assert.equal(result.generatedCompositeArtifactIds.length, 2);
  assert.equal(result.evidence.frameEvidence.length, 2);
  assert.ok(
    result.evidence.frameEvidence.every((entry) => entry.parity.meanAbsoluteError <= 0.5),
  );
  assert.ok(
    result.evidence.frameEvidence.every((entry) =>
      entry.layers.find((layer) => layer.layerId === "weapon").compositeContributionPixels > 0,
    ),
  );
  for (const artifactId of result.generatedCompositeArtifactIds) {
    const artifact = await store.get(artifactId);
    assert.equal(artifact.labels.artifactRole, "layered-frame-composite");
    assert.equal(artifact.labels.approvalState, "unapproved");
    assert.equal(artifact.labels.qualityState, "passed");
  }
  const evidence = await store.get(result.evidenceArtifactId);
  assert.equal(evidence.labels.artifactRole, "sprite-family-consistency-evidence");
  assert.equal(evidence.labels.qualityState, "passed");
});

test("rejects linked-cel and static-family drift during validation", async () => {
  const { manifest, artifacts } = await fixture();
  const linkedDrift = structuredClone(manifest);
  linkedDrift.frames[1].layers.find((entry) => entry.layerId === "weapon").artifactId =
    artifacts.body1.artifactId;
  assert.throws(
    () => validateSpriteFamilyManifest(linkedDrift),
    (error) =>
      error instanceof SpriteFamilyError && /linked cel/.test(error.message),
  );

  const staticDrift = structuredClone(manifest);
  staticDrift.frames[1].layers.find((entry) => entry.layerId === "shadow").artifactId =
    artifacts.body1.artifactId;
  assert.throws(
    () => validateSpriteFamilyManifest(staticDrift),
    (error) =>
      error instanceof SpriteFamilyError && /static-family/.test(error.message),
  );
});

test("rejects sidecar leakage into the colour composite", async () => {
  const { manifest } = await fixture();
  const invalid = structuredClone(manifest);
  const normal = invalid.layerDefinitions.find((entry) => entry.id === "normal");
  normal.contributesToComposite = true;
  assert.throws(
    () => validateSpriteFamilyManifest(invalid),
    (error) =>
      error instanceof SpriteFamilyError && /cannot contribute/.test(error.message),
  );
});

test("fails family evidence when a required separate layer is fully occluded", async () => {
  const { store, manifest } = await fixture();
  const hiddenBytes = await layerPng([
    { x: 6, y: 5, width: 2, height: 2, colour: [255, 220, 10, 255] },
  ]);
  const hidden = await putImage(store, "hidden-effect.png", hiddenBytes, {
    role: "effect-layer",
  });
  const invalid = structuredClone(manifest);
  invalid.layerDefinitions.push({
    id: "hidden-effect",
    role: "effect",
    sourcePolicy: "static-family",
    required: true,
    contributesToComposite: true,
    contributesToIdentity: false,
    mustRemainSeparate: true,
    zIndex: -1,
    blendMode: "normal",
    minimumVisibleFraction: 0.1,
    registrationTolerancePixels: 0,
    allowedOccludedBy: ["body", "weapon"],
  });
  for (const frame of invalid.frames) {
    frame.layers.push({
      layerId: "hidden-effect",
      artifactId: hidden.artifactId,
    });
  }
  invalid.policy.requireDeclaredComposite = false;
  const result = await verifySpriteFamily(invalid, { artifacts: store });
  assert.equal(result.evidence.passed, false);
  const effect = result.evidence.frameEvidence[0].layers.find(
    (entry) => entry.layerId === "hidden-effect",
  );
  assert.equal(effect.compositeContributionPixels, 0);
  assert.ok(
    effect.gates.some(
      (entry) => entry.id === "separate-layer-contribution" && entry.status === "fail",
    ),
  );
});

test("fails declared composite parity without discarding reconstructed evidence", async () => {
  const { store, manifest, artifacts } = await fixture();
  const invalid = structuredClone(manifest);
  invalid.frames[1].declaredCompositeArtifactId = artifacts.declared0.artifactId;
  const result = await verifySpriteFamily(invalid, { artifacts: store });
  assert.equal(result.evidence.passed, false);
  const frame = result.evidence.frameEvidence.find(
    (entry) => entry.frameId === "idle-down-001",
  );
  assert.ok(frame.parity.mismatchFraction > 0.01);
  assert.equal(
    (await store.get(frame.generatedCompositeArtifactId)).labels.qualityState,
    "rejected",
  );
});

test("detects undeclared duplicate composites", async () => {
  const { store, manifest, artifacts } = await fixture();
  const duplicate = structuredClone(manifest);
  duplicate.frames[1].layers.find((entry) => entry.layerId === "body").artifactId =
    artifacts.body0.artifactId;
  duplicate.frames[1].declaredCompositeArtifactId = artifacts.declared0.artifactId;
  duplicate.policy.requireReferenceLineage = false;
  const result = await verifySpriteFamily(duplicate, { artifacts: store });
  assert.equal(result.evidence.passed, false);
  assert.ok(
    result.evidence.familyGates.some(
      (entry) => entry.id.startsWith("duplicate-composite:") && entry.status === "fail",
    ),
  );
});
