import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import sharp from "sharp";

import { SpriteFamilyError, verifySpriteFamily } from "../dist/index.js";

test("explicit rejected quality cannot be overridden by an approved label", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-family-quality-"));
  const store = new LocalArtifactStore({ root });
  const png = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 210, g: 42, b: 58, alpha: 1 },
    },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  const rejected = await store.put(png, {
    mediaType: "image/png",
    storageClass: "source",
    fileName: "rejected-approved.png",
    labels: {
      artifactRole: "identity-core-layer",
      qualityState: "rejected",
      approvalState: "approved",
    },
  });
  const manifest = {
    schemaVersion: "1.0",
    familyId: "strict-quality-family",
    canvas: { width: 8, height: 8 },
    layerDefinitions: [
      {
        id: "body",
        role: "identity-core",
        sourcePolicy: "static-family",
        required: true,
        contributesToComposite: true,
        contributesToIdentity: true,
        zIndex: 0,
        blendMode: "normal",
      },
    ],
    frames: [
      {
        id: "idle-000",
        animation: "idle",
        direction: "down",
        frameIndex: 0,
        globalFrameIndex: 0,
        durationMs: 125,
        pivot: { x: 4, y: 7 },
        baseline: 7,
        groundContact: true,
        declaredCompositeArtifactId: rejected.artifactId,
        layers: [{ layerId: "body", artifactId: rejected.artifactId }],
      },
    ],
    policy: {
      identityReferenceFrameId: "idle-000",
      requireDeclaredComposite: true,
      requireReferenceLineage: true,
      requireQualityPassed: true,
      groundContactTolerancePixels: 1,
    },
  };
  await assert.rejects(
    () => verifySpriteFamily(manifest, { artifacts: store }),
    (error) =>
      error instanceof SpriteFamilyError &&
      error.code === "SPRITE_FAMILY_ARTIFACT_QUALITY_REJECTED" &&
      /cannot override rejected quality evidence/.test(error.message),
  );
});
