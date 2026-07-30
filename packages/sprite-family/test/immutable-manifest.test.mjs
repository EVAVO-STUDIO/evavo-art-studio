import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import sharp from "sharp";

import {
  spriteFamilyManifestSha256,
  validateSpriteFamilyManifest,
  verifySpriteFamily,
} from "../dist/index.js";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-family-manifest-"));
  const artifacts = new LocalArtifactStore({ root });
  const width = 8;
  const height = 8;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 1; y < 7; y += 1) {
    for (let x = 2; x < 6; x += 1) {
      const offset = (y * width + x) * 4;
      rgba[offset] = 210;
      rgba[offset + 1] = 45;
      rgba[offset + 2] = 60;
      rgba[offset + 3] = 255;
    }
  }
  const png = await sharp(rgba, {
    raw: { width, height, channels: 4 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
  const layer = await artifacts.put(png, {
    mediaType: "image/png",
    storageClass: "source",
    fileName: "hero-body.png",
    labels: {
      artifactRole: "identity-core-layer",
      qualityState: "passed",
      approvalState: "approved",
    },
  });
  const declared = await artifacts.put(png, {
    mediaType: "image/png",
    storageClass: "source",
    fileName: "hero-idle-down-000.png",
    sourceArtifacts: [layer.artifactId],
    labels: {
      artifactRole: "declared-layered-composite",
      qualityState: "passed",
      approvalState: "approved",
    },
  });
  const manifest = {
    schemaVersion: "1.0",
    familyId: "hero-idle-down",
    canvas: { width, height },
    layerDefinitions: [
      {
        id: "body",
        role: "identity-core",
        sourcePolicy: "per-frame",
        required: true,
        contributesToComposite: true,
        contributesToIdentity: true,
        zIndex: 0,
        registrationTolerancePixels: 0,
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
        pivot: { x: 4, y: 6 },
        baseline: 6,
        groundContact: true,
        declaredCompositeArtifactId: declared.artifactId,
        layers: [{ layerId: "body", artifactId: layer.artifactId }],
      },
    ],
    policy: {
      identityReferenceFrameId: "idle-down-000",
      requireDeclaredComposite: true,
      requireReferenceLineage: true,
      requireQualityPassed: true,
      pivotTolerancePixels: 0,
      baselineTolerancePixels: 0,
      groundContactTolerancePixels: 0,
      compositeChannelTolerance: 0,
      maximumCompositeMeanError: 0,
      maximumCompositeMismatchFraction: 0,
    },
    metadata: {
      project: "manifest-test",
      exactTimingRequired: true,
    },
  };
  return { artifacts, layer, declared, manifest };
}

test("family verification publishes a normalized manifest and manifest-bound evidence", async () => {
  const data = await fixture();
  const result = await verifySpriteFamily(data.manifest, {
    artifacts: data.artifacts,
    now: () => new Date("2026-07-30T00:00:00.000Z"),
  });
  assert.equal(result.evidence.passed, true);
  assert.equal(result.evidence.manifestArtifactId, result.manifestArtifactId);
  assert.equal(
    result.evidence.kernelEvidenceArtifactId,
    result.kernelEvidenceArtifactId,
  );

  const manifestArtifact = await data.artifacts.get(result.manifestArtifactId);
  assert.equal(
    manifestArtifact.labels.artifactRole,
    "sprite-family-normalized-manifest",
  );
  assert.equal(manifestArtifact.storageClass, "manifest");
  assert.deepEqual(
    manifestArtifact.sourceArtifacts,
    [data.layer.artifactId, data.declared.artifactId].sort(),
  );
  const storedManifest = validateSpriteFamilyManifest(
    JSON.parse(
      (await data.artifacts.read(result.manifestArtifactId)).toString("utf8"),
    ),
  );
  assert.equal(
    spriteFamilyManifestSha256(storedManifest),
    result.evidence.manifestSha256,
  );
  assert.equal(storedManifest.frames[0].durationMs, 125);
  assert.equal(storedManifest.frames[0].layers[0].layerId, "body");

  const evidenceArtifact = await data.artifacts.get(result.evidenceArtifactId);
  assert.equal(evidenceArtifact.labels.evidenceEnvelope, "manifest-bound");
  assert.ok(
    evidenceArtifact.sourceArtifacts.includes(result.manifestArtifactId),
  );
  assert.ok(
    evidenceArtifact.sourceArtifacts.includes(result.kernelEvidenceArtifactId),
  );
  const kernelEvidence = await data.artifacts.get(result.kernelEvidenceArtifactId);
  assert.equal(
    kernelEvidence.labels.artifactRole,
    "sprite-family-consistency-evidence",
  );
  assert.notEqual(result.kernelEvidenceArtifactId, result.evidenceArtifactId);
});

test("identical verified manifests converge on the same immutable manifest artifact", async () => {
  const data = await fixture();
  const options = {
    artifacts: data.artifacts,
    now: () => new Date("2026-07-30T00:00:00.000Z"),
  };
  const first = await verifySpriteFamily(data.manifest, options);
  const second = await verifySpriteFamily(data.manifest, options);
  assert.equal(first.manifestArtifactId, second.manifestArtifactId);
  assert.equal(first.evidenceArtifactId, second.evidenceArtifactId);
});
