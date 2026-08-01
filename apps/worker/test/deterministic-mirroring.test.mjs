import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import { decodeSpriteFrame } from "@evavo/art-quality";
import sharp from "sharp";

import {
  createDeterministicMirrorAwareFinalizerHandlers,
  mirrorHorizontalRgba,
} from "../dist/deterministic-mirror-handlers.js";
import { createMirroredSpriteFamilyHandlers } from "../dist/mirrored-sprite-family-handlers.js";

const WIDTH = 16;
const HEIGHT = 16;

async function sourcePng() {
  const data = Buffer.alloc(WIDTH * HEIGHT * 4);
  for (let y = 3; y <= 12; y += 1) {
    for (let x = 4; x <= 9; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      data[offset] = 30 + x * 5;
      data[offset + 1] = 70 + y * 3;
      data[offset + 2] = 190;
      data[offset + 3] = 255;
    }
  }
  const hidden = (1 * WIDTH + 1) * 4;
  data[hidden] = 17;
  data[hidden + 1] = 43;
  data[hidden + 2] = 91;
  data[hidden + 3] = 0;
  return sharp(data, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
}

function context(store, payload, inputArtifacts, requiredCapabilities) {
  return {
    job: {
      id: "job_deterministic_mirror_fixture",
      spec: {
        payload,
        inputArtifacts,
        requiredCapabilities,
      },
    },
    artifacts: store,
    putArtifact: (value, descriptor) => store.put(value, descriptor),
    signal: new AbortController().signal,
  };
}

test("worker mirrors the complete RGBA canvas and emits family-level proof", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-mirror-worker-"));
  const store = new LocalArtifactStore({ root });
  try {
    const source = await store.put(await sourcePng(), {
      mediaType: "image/png",
      storageClass: "master",
      fileName: "right-selected-master.png",
      labels: {
        artifactRole: "selected-art-master",
        approvalState: "selected",
        qualityState: "passed",
      },
    });
    const mirrorHandler = createDeterministicMirrorAwareFinalizerHandlers()[
      "art.candidate.finalize-adaptive"
    ];
    const mirrorResult = await mirrorHandler(
      context(
        store,
        {
          schemaVersion: "1.0",
          operation: "mirror-horizontal",
          sourceArtifactId: source.artifactId,
          sourceDirection: "right",
          targetDirection: "left",
          unitKind: "frame",
          layerRole: "identity-core",
          sourceFrameId: "idle:right:0000",
          targetFrameId: "idle:left:0000",
          clipId: "idle",
          frameIndex: 0,
          expectedWidth: WIDTH,
          expectedHeight: HEIGHT,
          pivot: { x: WIDTH / 2, y: HEIGHT - 1 },
          baseline: HEIGHT - 1,
          quality: {
            frameId: "idle:left:0000",
            transparency: "alpha-required",
            expectedWidth: WIDTH,
            expectedHeight: HEIGHT,
            expectedFormat: "png",
            safePadding: 1,
            maximumHaloFraction: 0.02,
            maximumUnexpectedTransparentRgbFraction: 0.02,
          },
          policy: {
            axis: "full-canvas-horizontal",
            preserveCanvas: true,
            preserveAlpha: true,
            preserveTransparentRgb: true,
            prohibitTrim: true,
            prohibitResample: true,
            requireExactRoundTrip: true,
          },
        },
        [source.artifactId],
        [
          "media.adaptive-finalize",
          "media.sprite-mirror",
          "media.raster",
          "quality.sprite-frame",
          "evidence.bundle",
        ],
      ),
    );
    const masterId = mirrorResult.result.masterArtifactId;
    const evidenceId = mirrorResult.result.evidenceArtifactId;
    const master = await store.get(masterId);
    const evidence = await store.get(evidenceId);
    assert.equal(master.labels.artifactRole, "deterministic-mirrored-sprite-master");
    assert.equal(master.labels.approvalState, "selected");
    assert.equal(evidence.labels.artifactRole, "sprite-horizontal-mirror-evidence");

    const [sourceDecoded, targetDecoded] = await Promise.all([
      decodeSpriteFrame(await store.read(source.artifactId)),
      decodeSpriteFrame(await store.read(masterId)),
    ]);
    assert.deepEqual(
      Buffer.from(targetDecoded.data),
      mirrorHorizontalRgba(sourceDecoded.data, WIDTH, HEIGHT),
    );
    assert.deepEqual(
      mirrorHorizontalRgba(targetDecoded.data, WIDTH, HEIGHT),
      Buffer.from(sourceDecoded.data),
    );
    const mirroredHidden = (1 * WIDTH + (WIDTH - 2)) * 4;
    assert.deepEqual(
      [...targetDecoded.data.subarray(mirroredHidden, mirroredHidden + 4)],
      [17, 43, 91, 0],
    );

    const manifest = {
      schemaVersion: "1.0",
      familyId: "mirror-worker-family",
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
          blendMode: "normal",
          minimumVisibleFraction: 0,
          registrationTolerancePixels: WIDTH,
        },
      ],
      frames: [
        {
          id: "idle:right:0000",
          animation: "idle",
          direction: "right",
          frameIndex: 0,
          globalFrameIndex: 0,
          durationMs: 100,
          pivot: { x: WIDTH / 2, y: HEIGHT - 1 },
          baseline: HEIGHT - 1,
          groundContact: true,
          layers: [{ layerId: "identity-core", artifactId: source.artifactId }],
        },
        {
          id: "idle:left:0000",
          animation: "idle",
          direction: "left",
          frameIndex: 0,
          globalFrameIndex: 1,
          durationMs: 100,
          pivot: { x: WIDTH / 2, y: HEIGHT - 1 },
          baseline: HEIGHT - 1,
          groundContact: true,
          layers: [{ layerId: "identity-core", artifactId: masterId }],
        },
      ],
      policy: {
        identityReferenceFrameId: "idle:right:0000",
        requireDeclaredComposite: false,
        requireReferenceLineage: false,
        requireQualityPassed: true,
        alphaVisibleThreshold: 8,
        maximumTranslationPixels: WIDTH,
        maximumEdgeDistancePixels: WIDTH,
        pivotTolerancePixels: 0,
        baselineTolerancePixels: 0,
        groundContactTolerancePixels: 0,
        minimumCanonicalVisibleAreaSimilarity: 0,
        minimumCanonicalPaletteSimilarity: 0,
        minimumCanonicalCentroidSimilarity: 0,
        minimumAdjacentVisibleAreaSimilarity: 0,
        minimumAdjacentPaletteSimilarity: 0,
        minimumAdjacentCentroidSimilarity: 0,
        minimumLoopClosureSimilarity: 0,
        maximumCompositeMeanError: 0,
        maximumCompositeMismatchFraction: 0,
        compositeChannelTolerance: 0,
      },
      metadata: {
        deterministicMirroring: {
          operation: "mirror-horizontal",
          qualityThresholdsRelaxed: false,
          units: [
            {
              id: "frame:idle:left:0000:identity-core:mirror",
              unitKind: "frame",
              sourceDirection: "right",
              targetDirection: "left",
              sourceFrameId: "idle:right:0000",
              targetFrameId: "idle:left:0000",
              layerRole: "identity-core",
              sourceArtifactId: source.artifactId,
              targetArtifactId: masterId,
              evidenceArtifactId: evidenceId,
            },
          ],
        },
      },
    };
    const familyHandler = createMirroredSpriteFamilyHandlers()[
      "sprite.family.verify"
    ];
    const requiredCapabilities = [
      "sprite.family.verify",
      "media.layer-compose",
      "selection.compare",
      "evidence.bundle",
      "media.sprite-mirror",
    ];
    const inputArtifacts = [source.artifactId, masterId, evidenceId];
    const tamperedManifest = structuredClone(manifest);
    tamperedManifest.metadata.deterministicMirroring.units[0].targetDirection =
      "right";
    await assert.rejects(
      () =>
        familyHandler(
          context(
            store,
            tamperedManifest,
            inputArtifacts,
            requiredCapabilities,
          ),
        ),
      (error) => error?.code === "MIRRORED_FAMILY_TARGET_STATE_INVALID",
    );

    const familyResult = await familyHandler(
      context(store, manifest, inputArtifacts, requiredCapabilities),
    );
    const proofId = familyResult.result.horizontalMirrorProofEvidenceArtifactId;
    const proof = await store.get(proofId);
    assert.equal(
      proof.labels.artifactRole,
      "sprite-family-horizontal-mirror-proof-evidence",
    );
    assert.equal(proof.labels.releaseReady, "true");
    assert.ok(proof.sourceArtifacts.includes(source.artifactId));
    assert.ok(proof.sourceArtifacts.includes(masterId));
    assert.ok(proof.sourceArtifacts.includes(evidenceId));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("worker rejects any weakened exact-mirror policy", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-mirror-policy-"));
  const store = new LocalArtifactStore({ root });
  try {
    const source = await store.put(await sourcePng(), {
      mediaType: "image/png",
      storageClass: "master",
      fileName: "right-selected-master.png",
      labels: {
        artifactRole: "selected-art-master",
        approvalState: "selected",
        qualityState: "passed",
      },
    });
    const mirrorHandler = createDeterministicMirrorAwareFinalizerHandlers()[
      "art.candidate.finalize-adaptive"
    ];
    await assert.rejects(
      () =>
        mirrorHandler(
          context(
            store,
            {
              schemaVersion: "1.0",
              operation: "mirror-horizontal",
              sourceArtifactId: source.artifactId,
              sourceDirection: "right",
              targetDirection: "left",
              unitKind: "frame",
              layerRole: "identity-core",
              sourceFrameId: "idle:right:0000",
              targetFrameId: "idle:left:0000",
              expectedWidth: WIDTH,
              expectedHeight: HEIGHT,
              pivot: { x: WIDTH / 2, y: HEIGHT - 1 },
              baseline: HEIGHT - 1,
              policy: {
                axis: "full-canvas-horizontal",
                preserveCanvas: true,
                preserveAlpha: true,
                preserveTransparentRgb: false,
                prohibitTrim: true,
                prohibitResample: true,
                requireExactRoundTrip: true,
              },
            },
            [source.artifactId],
            [
              "media.adaptive-finalize",
              "media.sprite-mirror",
              "media.raster",
              "quality.sprite-frame",
              "evidence.bundle",
            ],
          ),
        ),
      (error) => error?.code === "DETERMINISTIC_MIRROR_POLICY_INVALID",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
