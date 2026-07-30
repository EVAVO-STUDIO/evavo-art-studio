import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import sharp from "sharp";

import { SpriteFamilyError, verifySpriteFamily } from "../dist/index.js";

async function layer(width, height, rectangle, colour) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = rectangle.y; y < rectangle.y + rectangle.height; y += 1) {
    for (let x = rectangle.x; x < rectangle.x + rectangle.width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = colour[0];
      data[offset + 1] = colour[1];
      data[offset + 2] = colour[2];
      data[offset + 3] = 255;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-family-occlusion-"));
  const store = new LocalArtifactStore({ root });
  const put = (fileName, bytes, role) =>
    store.put(bytes, {
      mediaType: "image/png",
      storageClass: "source",
      fileName,
      labels: {
        artifactRole: role,
        qualityState: "passed",
        approvalState: "approved",
      },
    });
  const body = await put(
    "body.png",
    await layer(8, 8, { x: 1, y: 1, width: 6, height: 6 }, [210, 40, 55]),
    "identity-core-layer",
  );
  const costume = await put(
    "costume.png",
    await layer(8, 8, { x: 3, y: 2, width: 3, height: 4 }, [40, 90, 210]),
    "costume-layer",
  );
  return { store, body, costume };
}

function manifest(body, costume, declaredOcclusion) {
  return {
    schemaVersion: "1.0",
    familyId: declaredOcclusion ? "declared-occlusion" : "undeclared-occlusion",
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
        minimumVisibleFraction: 0.4,
        registrationTolerancePixels: 0,
      },
      {
        id: "costume",
        role: "costume",
        sourcePolicy: "static-family",
        required: true,
        contributesToComposite: true,
        contributesToIdentity: true,
        mustRemainSeparate: true,
        zIndex: 10,
        blendMode: "normal",
        minimumVisibleFraction: 0.8,
        registrationTolerancePixels: 0,
        ...(declaredOcclusion ? { occludes: ["body"] } : {}),
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
        groundContact: false,
        layers: [
          { layerId: "body", artifactId: body.artifactId },
          { layerId: "costume", artifactId: costume.artifactId },
        ],
      },
    ],
    policy: {
      identityReferenceFrameId: "idle-000",
      requireDeclaredComposite: false,
      requireReferenceLineage: true,
      requireQualityPassed: true,
      pivotTolerancePixels: 0,
      baselineTolerancePixels: 0,
      groundContactTolerancePixels: 0,
    },
  };
}

test("undeclared higher-layer overlap fails before composites are stored", async () => {
  const { store, body, costume } = await fixture();
  await assert.rejects(
    () => verifySpriteFamily(manifest(body, costume, false), { artifacts: store }),
    (error) =>
      error instanceof SpriteFamilyError &&
      error.code === "SPRITE_FAMILY_OCCLUSION_POLICY_VIOLATION" &&
      /Declare allowedOccludedBy/.test(error.message),
  );
});

test("an explicit occludes relationship permits the intended overlap", async () => {
  const { store, body, costume } = await fixture();
  const result = await verifySpriteFamily(manifest(body, costume, true), {
    artifacts: store,
    now: () => new Date("2026-07-30T00:00:00.000Z"),
  });
  assert.equal(result.evidence.passed, true);
  assert.equal(result.generatedCompositeArtifactIds.length, 1);
});
