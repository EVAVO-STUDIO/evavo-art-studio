import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  REQUEST_CONTRACT,
  compileReferenceHandoff,
  verifyReferenceHandoff,
} from "./asset-fabricator-reference-handoff.mjs";

async function fixture({ assetClass = "vehicle", omitView = null } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-reference-handoff-"));
  const sourceProgramPath = path.join(root, "source-program.json");
  await writeFile(sourceProgramPath, `${JSON.stringify({ contractVersion: "evavo_art_reference_program_v1" })}\n`);
  const views = ["front", "back", "left", "right", "three-quarter", "top"].filter((view) => view !== omitView);
  const references = [];
  for (const [index, view] of views.entries()) {
    const imagePath = path.join(root, `${view}.png`);
    await writeFile(imagePath, Buffer.from(`not-a-real-png-but-byte-bound-${view}-${"x".repeat(32)}`));
    references.push({
      id: `reference-${index + 1}`,
      path: imagePath,
      view,
      role: view === "three-quarter" ? "appearance" : "geometry",
      rights: "owned",
      notes: `${view} reference`,
    });
  }
  const request = {
    contractVersion: REQUEST_CONTRACT,
    assetId: "rally-coupe-v1",
    subjectId: "rally-coupe",
    assetClass,
    sourceProgramPath,
    references,
    artDirection: {
      styleFamily: "stylised-realism",
      styleDescription: "Crisp 1990s rally-game stylisation with believable construction.",
      silhouette: "Compact coupe with a planted stance and readable wheel arches.",
      palette: ["#d83a32", "#202020", "#d8d0bc"],
      detailStrategy: "Large readable forms first, restrained high-frequency detail.",
      avoid: ["photoreal showroom finish", "modern LED lighting"],
    },
    geometryIntent: {
      topologyStrategy: "manual-review",
      targetTriangles: 90000,
      maximumTriangles: 160000,
      watertightRequired: false,
      manifoldRequired: true,
      maximumComponents: 64,
      minimumThicknessMetres: 0.001,
      symmetry: true,
      hardSurface: true,
      subdivisionReady: false,
    },
    materialIntent: {
      workflow: "openpbr-surface",
      graphId: "rally-vehicle-materials",
      textureResolution: 2048,
      requiredChannels: ["base-color", "normal", "roughness", "metalness", "ao", "mask"],
      channelPacking: { r: "ao", g: "roughness", b: "metalness", a: "mask" },
      delightRequired: true,
      bakeRequired: true,
    },
    riggingIntent: {
      type: "mechanical",
      required: true,
      maximumBones: 48,
      maximumInfluences: 4,
      blendshapes: [],
      animations: ["wheel-steer", "wheel-spin", "suspension-travel"],
    },
    deliveryIntent: {
      targets: ["godot", "blender"],
      format: "glb",
      meshCompression: "meshopt",
      textureCompression: "ktx2-uastc",
      embedTextures: true,
      generateManifest: true,
    },
    dimensionsMetres: { width: 1.74, height: 1.31, depth: 4.12, groundOrigin: "bottom-center" },
    anchors: [
      { id: "wheel-fl", purpose: "Front-left wheel and suspension pivot", parentHint: "vehicle-root", positionMetres: [-0.72, 0.34, 1.25] },
      { id: "wheel-fr", purpose: "Front-right wheel and suspension pivot", parentHint: "vehicle-root", positionMetres: [0.72, 0.34, 1.25] },
    ],
    provenance: {
      requestedBy: "EVAVO Studio",
      project: "Rally 2.5D",
      rightsReviewRequired: false,
      notes: "Original EVAVO concept set.",
    },
  };
  return { root, request };
}

test("compiles deterministic multi-view reference evidence", async () => {
  const { request } = await fixture();
  const first = await compileReferenceHandoff(request);
  const second = await compileReferenceHandoff(request);
  assert.deepEqual(first, second);
  assert.equal(first.references.length, 6);
  assert.equal(first.viewCoverage.complete, true);
  assert.equal(first.materialIntent.normalConvention, "opengl");
  assert.deepEqual(first.materialIntent.channelPacking, { r: "ao", g: "roughness", b: "metalness", a: "mask" });
  assert.equal(first.authority.automatic3dGeneration, false);
  assert.equal(verifyReferenceHandoff(first), true);
});

test("requires top coverage for vehicle and environment classes", async () => {
  const { request } = await fixture({ omitView: "top" });
  await assert.rejects(() => compileReferenceHandoff(request), /missing-views:top/);
  const character = await fixture({ assetClass: "character", omitView: "top" });
  const handoff = await compileReferenceHandoff(character.request);
  assert.equal(verifyReferenceHandoff(handoff), true);
});

test("rejects duplicate ids and missing canonical views", async () => {
  const { request } = await fixture();
  request.references[1].id = request.references[0].id;
  await assert.rejects(() => compileReferenceHandoff(request), /duplicate-id/);
});

test("rejects material packing drift", async () => {
  const { request } = await fixture();
  request.materialIntent.channelPacking = { r: "roughness", g: "ao", b: "metalness", a: "mask" };
  await assert.rejects(() => compileReferenceHandoff(request), /materialIntent:packing/);
});

test("rejects rehashed authority escalation", async () => {
  const { request } = await fixture();
  const handoff = await compileReferenceHandoff(request);
  handoff.authority.automatic3dGeneration = true;
  assert.throws(() => verifyReferenceHandoff(handoff), /sha-mismatch|authority/);
});
