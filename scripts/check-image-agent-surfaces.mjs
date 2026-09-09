#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifests = [
  "config/image-finishing-artist.capabilities.json",
  "config/image-finishing-packet.capabilities.json",
  "config/image-repair-agent.capabilities.json",
  "config/image-reference-consistency.capabilities.json",
  "config/image-artifact-triage.capabilities.json",
  "config/texture-review-agent.capabilities.json",
  "config/godot-material-delivery-agent.capabilities.json",
  "config/godot-material-validation-agent.capabilities.json",
  "config/image-effects-agent.capabilities.json",
  "config/image-agent-router.capabilities.json",
];

function supportedCapabilitySchema(value) {
  return typeof value === "string" && /^1\.\d+$/u.test(value);
}

const parsed = [];
for (const relative of manifests) {
  const filePath = path.join(root, relative);
  const manifest = JSON.parse(await readFile(filePath, "utf8"));
  if (!supportedCapabilitySchema(manifest.schemaVersion) || typeof manifest.entrypoint !== "string") {
    throw new Error(`${relative} is missing a supported 1.x capability contract.`);
  }
  const entrypoint = path.join(root, manifest.entrypoint);
  await access(entrypoint);
  const syntax = spawnSync(process.execPath, ["--check", entrypoint], { cwd: root, encoding: "utf8" });
  if (syntax.status !== 0) throw new Error(`${manifest.entrypoint} failed node --check:\n${syntax.stderr || syntax.stdout}`);
  const source = await readFile(entrypoint, "utf8");
  for (const tool of manifest.tools ?? []) {
    if (!source.includes(`name: "${tool}"`) && !source.includes(`name: '${tool}'`)) {
      throw new Error(`${relative} advertises ${tool}, but ${manifest.entrypoint} does not expose it.`);
    }
  }
  parsed.push({ id: manifest.id, schemaVersion: manifest.schemaVersion, entrypoint: manifest.entrypoint, tools: manifest.tools?.length ?? 0 });
}

const mediaIndex = await readFile(path.join(root, "packages/media/src/index.ts"), "utf8");
const mediaExports = [
  "image-repair-routing",
  "image-finishing-review-packet",
  "image-agent-routing",
  "image-reference-consistency",
  "image-reference-consistency-proof",
  "image-generated-detail-risk",
  "texture-map-review",
  "texture-tile-proof",
  "texture-set-review",
  "texture-channel-pack",
  "texture-preprocess",
  "uv-layout-review",
  "wavefront-obj-uv",
  "enhancement-structure-risk",
];
for (const requiredExport of mediaExports) {
  if (!mediaIndex.includes(`export * from "./${requiredExport}.js";`)) {
    throw new Error(`packages/media/src/index.ts does not export ${requiredExport}.`);
  }
}
const finishingPacket = await readFile(path.join(root, "packages/media/src/image-finishing-review-packet.ts"), "utf8");
for (const requiredPacketFeature of [
  "createImageFinishingReviewPacket",
  "createImageFinishingReviewBatch",
  "Finishing review batch requires 1 through 128 images",
  "automaticPromotionAllowed",
  "approved-reference-set-is-not-stable-enough",
  "generated-detail-risk:",
]) {
  if (!finishingPacket.includes(requiredPacketFeature)) throw new Error(`Unified finishing packet is missing ${requiredPacketFeature}.`);
}
const generatedDetailRisk = await readFile(path.join(root, "packages/media/src/image-generated-detail-risk.ts"), "utf8");
for (const requiredSignal of ["repeated-nontrivial-local-pattern-risk", "local-detail-density-imbalance", "advisoryOnly", "aiOriginDetection"]) {
  if (!generatedDetailRisk.includes(requiredSignal)) throw new Error(`Generated-detail triage is missing ${requiredSignal}.`);
}
const texturePreprocess = await readFile(path.join(root, "packages/media/src/texture-preprocess.ts"), "utf8");
for (const requiredPrimitive of ["convertTangentNormalYConvention", "composeOpacityIntoAlbedoAlpha", "G=255-G"]) {
  if (!texturePreprocess.includes(requiredPrimitive)) throw new Error(`Texture preprocessing is missing ${requiredPrimitive}.`);
}
const referenceConsistency = await readFile(path.join(root, "packages/media/src/image-reference-consistency.ts"), "utf8");
for (const requiredSignal of ["palette-distribution-drift", "silhouette-or-occupancy-drift", "reference-set-unstable", "aiOriginDetection"]) {
  if (!referenceConsistency.includes(requiredSignal)) throw new Error(`Reference consistency is missing ${requiredSignal}.`);
}
const referenceProof = await readFile(path.join(root, "packages/media/src/image-reference-consistency-proof.ts"), "utf8");
for (const requiredProofFeature of ["createImageReferenceConsistencyProof", "strongest deterministic visual drift first", "diagnosticOnly"]) {
  if (!referenceProof.includes(requiredProofFeature)) throw new Error(`Reference consistency proof is missing ${requiredProofFeature}.`);
}

const godotIndex = await readFile(path.join(root, "packages/godot/src/index.ts"), "utf8");
for (const requiredExport of ["material-delivery", "material-resource", "material-validation"]) {
  if (!godotIndex.includes(`export * from "./${requiredExport}.js";`)) throw new Error(`packages/godot/src/index.ts does not export ${requiredExport}.`);
}
const godotMaterialDelivery = await readFile(path.join(root, "packages/godot/src/material-delivery.ts"), "utf8");
for (const requiredBinding of ["albedo_texture", "normal_texture", "roughness_texture", "metallic_texture", "ao_texture", "heightmap_texture", "emission_texture", "orm_texture"]) {
  if (!godotMaterialDelivery.includes(requiredBinding)) throw new Error(`Godot material delivery planner is missing ${requiredBinding}.`);
}
const godotMaterialResource = await readFile(path.join(root, "packages/godot/src/material-resource.ts"), "utf8");
if (!godotMaterialResource.includes("renderGodotMaterialTres") || !godotMaterialResource.includes("format=3")) {
  throw new Error("Godot material resource renderer is missing current format=3 TRES rendering.");
}
if (godotMaterialResource.includes("load_steps=")) throw new Error("Godot material resource renderer must not emit deprecated load_steps for 4.6 resources.");
const godotMaterialValidation = await readFile(path.join(root, "packages/godot/src/material-validation.ts"), "utf8");
for (const requiredValidationContract of ["runGodotMaterialValidation", "--headless", "--script", "shell: false", "EVAVO_MATERIAL_VALIDATION="]) {
  if (!godotMaterialValidation.includes(requiredValidationContract)) {
    throw new Error(`Godot native material validation is missing ${requiredValidationContract}.`);
  }
}

const enhancementSession = await readFile(path.join(root, "packages/media/src/enhancement-review-session.ts"), "utf8");
if (!enhancementSession.includes("reviewEnhancementStructureRisk")) throw new Error("Enhancement review session does not enforce macro structure preservation.");

const spriteEffectsIndex = await readFile(path.join(root, "packages/godot-sprite-effects/src/index.ts"), "utf8");
if (!spriteEffectsIndex.includes('export * from "./agent-planner.js";')) throw new Error("godot-sprite-effects index does not export the agent planner.");

for (const requiredTest of [
  "packages/media/test/image-repair-routing.test.mjs",
  "packages/media/test/image-finishing-review-packet.test.mjs",
  "packages/media/test/image-agent-routing.test.mjs",
  "packages/media/test/image-reference-consistency.test.mjs",
  "packages/media/test/image-reference-consistency-proof.test.mjs",
  "packages/media/test/image-generated-detail-risk.test.mjs",
  "packages/media/test/texture-map-review.test.mjs",
  "packages/media/test/texture-tile-proof.test.mjs",
  "packages/media/test/texture-set-review.test.mjs",
  "packages/media/test/texture-channel-pack.test.mjs",
  "packages/media/test/texture-preprocess.test.mjs",
  "packages/media/test/uv-layout-review.test.mjs",
  "packages/media/test/wavefront-obj-uv.test.mjs",
  "packages/media/test/enhancement-structure-risk.test.mjs",
  "packages/godot/test/material-delivery.test.mjs",
  "packages/godot/test/material-resource.test.mjs",
  "packages/godot/test/material-validation.test.mjs",
  "packages/godot/test/material-validation-native.test.mjs",
  "packages/godot/test/material-delivery-mcp.test.mjs",
  "packages/godot-sprite-effects/test/agent-planner.test.mjs",
  "tools/image_finishing_packet_mcp.test.mjs",
  "tools/image_reference_consistency_mcp.test.mjs",
  "tools/image_artifact_triage_mcp.test.mjs",
  "tools/texture_review_mcp.test.mjs",
  "tools/texture_preprocess_mcp.test.mjs",
  "tools/godot_material_delivery_mcp.test.mjs",
  "tools/godot_material_validation_mcp.test.mjs",
]) await access(path.join(root, requiredTest));

process.stdout.write(`${JSON.stringify({
  contract: "evavo.image-agent-surfaces.check.v1",
  ok: true,
  surfaces: parsed,
  mediaExports,
  finishingPacket: ["single-review", "batch-1-to-128", "shared-reference-model", "compact-batch-response", "artifact-triage", "repair-routing", "approved-reference-consistency", "semantic-findings", "no-auto-promotion"],
  enhancementIntegrity: ["local-detail-risk", "macro-structure-risk"],
  artifactTriage: ["ringing", "posterization", "resampling", "repeated-detail", "detail-density-imbalance", "advisory-only", "no-ai-origin-claim"],
  referenceConsistency: ["approved-reference-baseline", "reference-set-coherence", "palette-tone-detail-silhouette-framing", "batch-outlier-ranking", "guarded-visual-proof", "no-ai-origin-claim"],
  textureProofSampling: ["continuous", "nearest"],
  textureMaterialReview: ["single-map", "material-set", "normal-y-conversion", "opacity-alpha-composition", "godot-orm-pack", "uv-layout", "wavefront-obj-uv"],
  godotMaterialDelivery: ["StandardMaterial3D", "ORMMaterial3D", "guarded-preprocessing", "format-3-tres", "create-only-resource-write"],
  godotMaterialValidation: ["execution-gated", "headless-native-load", "resource-class-check", "operator-configured-executable", "opt-in-runtime-test"],
  unifiedRouting: true,
  spriteEffectExports: ["agent-planner"],
}, null, 2)}\n`);
