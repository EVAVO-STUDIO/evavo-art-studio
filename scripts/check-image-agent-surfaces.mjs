#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestContracts = [
  { path: "config/image-finishing-artist.capabilities.json", major: 1 },
  { path: "config/image-finishing-packet.capabilities.json", major: 1 },
  { path: "config/image-repair-agent.capabilities.json", major: 1 },
  { path: "config/image-reference-consistency.capabilities.json", major: 1 },
  { path: "config/image-artifact-triage.capabilities.json", major: 1 },
  { path: "config/image-sequence-finishing.capabilities.json", major: 1 },
  { path: "config/image-delivery-integrity.capabilities.json", major: 1 },
  { path: "config/image-finalization.capabilities.json", major: 1 },
  { path: "config/texture-review-agent.capabilities.json", major: 1 },
  { path: "config/godot-material-delivery-agent.capabilities.json", major: 1 },
  { path: "config/godot-material-validation-agent.capabilities.json", major: 1 },
  { path: "config/image-effects-agent.capabilities.json", major: 1 },
  { path: "config/image-agent-router.capabilities.json", major: 1 },
  { path: "config/image-workflow-router-v2.capabilities.json", major: 2 },
];

function supportedCapabilitySchema(value, major) {
  return typeof value === "string" && new RegExp(`^${major}\\.\\d+$`, "u").test(value);
}

const parsed = [];
const manifests = new Map();
for (const contract of manifestContracts) {
  const filePath = path.join(root, contract.path);
  const manifest = JSON.parse(await readFile(filePath, "utf8"));
  if (!supportedCapabilitySchema(manifest.schemaVersion, contract.major) || typeof manifest.entrypoint !== "string") {
    throw new Error(`${contract.path} is missing a supported ${contract.major}.x capability contract.`);
  }
  const entrypoint = path.join(root, manifest.entrypoint);
  await access(entrypoint);
  const syntax = spawnSync(process.execPath, ["--check", entrypoint], { cwd: root, encoding: "utf8" });
  if (syntax.status !== 0) throw new Error(`${manifest.entrypoint} failed node --check:\n${syntax.stderr || syntax.stdout}`);
  const source = await readFile(entrypoint, "utf8");
  for (const tool of manifest.tools ?? []) {
    if (!source.includes(`name: "${tool}"`) && !source.includes(`name: '${tool}'`)) {
      throw new Error(`${contract.path} advertises ${tool}, but ${manifest.entrypoint} does not expose it.`);
    }
  }
  manifests.set(contract.path, manifest);
  parsed.push({ id: manifest.id, schemaVersion: manifest.schemaVersion, entrypoint: manifest.entrypoint, tools: manifest.tools?.length ?? 0 });
}

const routerV2 = manifests.get("config/image-workflow-router-v2.capabilities.json");
if (!Array.isArray(routerV2.goals) || routerV2.goals.length !== 15) {
  throw new Error("Image workflow router v2 must remain the fifteen-goal authoritative modern router.");
}
for (const requiredGoal of ["frame-consistency", "delivery-preflight", "finalize-image"]) {
  if (!routerV2.goals.includes(requiredGoal)) throw new Error(`Image workflow router v2 is missing ${requiredGoal}.`);
}
if (routerV2.guarantees?.v1RouterCompatibilityPreserved !== true || routerV2.guarantees?.explicitPrivilegeSeparation !== true) {
  throw new Error("Image workflow router v2 must preserve v1 routing while separating review/write/provider/execution privileges.");
}
if (routerV2.guarantees?.carriesApprovalAuthority !== false || routerV2.guarantees?.claimsAiOriginDetection !== false) {
  throw new Error("Image workflow router v2 must not claim approval authority or AI-origin detection.");
}
for (const existingContract of routerV2.integratesExistingContracts ?? []) await access(path.join(root, existingContract));

const sequenceManifest = manifests.get("config/image-sequence-finishing.capabilities.json");
if (sequenceManifest.guarantees?.writesFiles !== false || sequenceManifest.guarantees?.semanticMotionQualityClaimed !== false || sequenceManifest.guarantees?.automaticPromotionAllowed !== false) {
  throw new Error("Sequence finishing must remain read-only, technically scoped and non-promoting.");
}
const deliveryManifest = manifests.get("config/image-delivery-integrity.capabilities.json");
for (const requiredCheck of ["encoded-format-vs-intent", "alpha-channel-compatibility", "encoded-byte-budget", "effective-print-dpi"]) {
  if (!deliveryManifest.checks?.includes(requiredCheck)) throw new Error(`Delivery integrity is missing ${requiredCheck}.`);
}
if (deliveryManifest.guarantees?.writesFiles !== false || deliveryManifest.guarantees?.explicitFormatMismatchBlocksDelivery !== true || deliveryManifest.guarantees?.explicitForbiddenAlphaBlocksDelivery !== true) {
  throw new Error("Delivery integrity must remain read-only and fail closed for explicit format/alpha conflicts.");
}
const finalizationManifest = manifests.get("config/image-finalization.capabilities.json");
for (const decision of ["blocked", "needs-image-finishing", "needs-delivery-review", "ready-for-approval-review"]) {
  if (!finalizationManifest.decisions?.includes(decision)) throw new Error(`Finalization capability is missing ${decision}.`);
}
if (finalizationManifest.guarantees?.automaticPromotionAllowed !== false || finalizationManifest.guarantees?.readyMeansApproved !== false || finalizationManifest.guarantees?.humanVisualReviewRequired !== true) {
  throw new Error("Finalization must stop at approval review and never grant promotion authority.");
}

const mediaIndex = await readFile(path.join(root, "packages/media/src/index.ts"), "utf8");
const mediaExports = [
  "image-repair-routing",
  "image-finishing-review-packet",
  "image-agent-routing",
  "image-agent-routing-v2",
  "image-reference-consistency",
  "image-reference-consistency-proof",
  "image-generated-detail-risk",
  "image-sequence-finishing-review",
  "image-delivery-integrity",
  "image-finalization-review",
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

const reviewProfiles = await readFile(path.join(root, "packages/media/src/image-review-profiles.ts"), "utf8");
for (const profile of [
  "logo-transparent",
  "web-hero",
  "ui-screenshot",
  "product-cutout",
  "photo",
  "cel-animation-frame",
  "pixel-art",
  "texture",
  "illustration",
]) {
  if (!reviewProfiles.includes(`"${profile}"`)) throw new Error(`Canonical image review profile is missing ${profile}.`);
}
if (reviewProfiles.includes('"web-support"')) throw new Error("web-support is a finishing preset, not a canonical image review profile.");

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
const sequenceReview = await readFile(path.join(root, "packages/media/src/image-sequence-finishing-review.ts"), "utf8");
for (const requiredSequenceFeature of ["reviewImageSequenceFinishing", "adjacent", "automaticPromotionAllowed", "semanticMotionQualityClaimed"]) {
  if (!sequenceReview.includes(requiredSequenceFeature)) throw new Error(`Sequence finishing review is missing ${requiredSequenceFeature}.`);
}
const deliveryIntegrity = await readFile(path.join(root, "packages/media/src/image-delivery-integrity.ts"), "utf8");
for (const requiredDeliveryFeature of ["reviewImageDeliveryIntegrity", "maximumBytes", "forbidAlpha", "effectivePrintDpi"]) {
  if (!deliveryIntegrity.includes(requiredDeliveryFeature)) throw new Error(`Delivery integrity core is missing ${requiredDeliveryFeature}.`);
}
const finalizationReview = await readFile(path.join(root, "packages/media/src/image-finalization-review.ts"), "utf8");
for (const requiredFinalizationFeature of ["reviewImageFinalization", "ready-for-approval-review", "requiresHumanVisualReview", "automaticPromotionAllowed: false"]) {
  if (!finalizationReview.includes(requiredFinalizationFeature)) throw new Error(`Finalization review is missing ${requiredFinalizationFeature}.`);
}
const routerV2Core = await readFile(path.join(root, "packages/media/src/image-agent-routing-v2.ts"), "utf8");
for (const requiredRouteFeature of [
  "evavo_review_image_sequence_finishing",
  "evavo_review_image_delivery_integrity",
  "evavo_review_image_finalization",
  "evavo_validate_godot_material_resource",
  "write-gated-create-only",
  "candidate-and-mask-required",
  "provider-or-human-candidate-required",
  "execution-gated",
  "Ready-for-approval-review is not approval",
]) {
  if (!routerV2Core.includes(requiredRouteFeature)) throw new Error(`Image workflow router v2 core is missing ${requiredRouteFeature}.`);
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

const requiredTests = [
  "packages/media/test/image-repair-routing.test.mjs",
  "packages/media/test/image-finishing-review-packet.test.mjs",
  "packages/media/test/image-agent-routing.test.mjs",
  "packages/media/test/image-agent-routing-v2.test.mjs",
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
  "tools/image_sequence_finishing_mcp.test.mjs",
  "tools/image_delivery_integrity_mcp.test.mjs",
  "tools/image_finalization_mcp.test.mjs",
  "tools/image_workflow_router_v2_mcp.test.mjs",
  "tools/texture_review_mcp.test.mjs",
  "tools/texture_preprocess_mcp.test.mjs",
  "tools/godot_material_delivery_mcp.test.mjs",
  "tools/godot_material_validation_mcp.test.mjs",
];
for (const requiredTest of requiredTests) await access(path.join(root, requiredTest));

const routerDoctor = spawnSync(process.execPath, [path.join(root, "scripts/check-image-workflow-router-v2.mjs")], { cwd: root, encoding: "utf8" });
if (routerDoctor.status !== 0) throw new Error(`Image workflow router v2 doctor failed:\n${routerDoctor.stderr || routerDoctor.stdout}`);

process.stdout.write(`${JSON.stringify({
  contract: "evavo.image-agent-surfaces.check.v2",
  ok: true,
  preferredDiscovery: "evavo-image-workflow-router-v2",
  surfaces: parsed,
  mediaExports,
  canonicalReviewProfiles: ["logo-transparent", "web-hero", "ui-screenshot", "product-cutout", "photo", "cel-animation-frame", "pixel-art", "texture", "illustration"],
  finishingPacket: ["single-review", "batch-1-to-128", "shared-reference-model", "compact-batch-response", "artifact-triage", "repair-routing", "approved-reference-consistency", "semantic-findings", "no-auto-promotion"],
  sequenceFinishing: ["ordered-frames", "adjacent-similarity", "technical-continuity", "per-frame-repair-routing", "no-semantic-motion-claim", "no-auto-promotion"],
  deliveryIntegrity: ["format", "alpha", "colour-space", "metadata", "megapixel-budget", "encoded-byte-budget", "print-dpi", "read-only"],
  finalizationAdmission: ["blocked", "needs-image-finishing", "needs-delivery-review", "ready-for-approval-review", "human-review-required", "ready-is-not-approved"],
  routerV2: ["15-goals", "v1-compatible", "legacy-pipeline-compatible", "legacy-model-router-compatible", "privilege-separated", "no-approval-authority"],
  enhancementIntegrity: ["local-detail-risk", "macro-structure-risk"],
  artifactTriage: ["ringing", "posterization", "resampling", "repeated-detail", "detail-density-imbalance", "advisory-only", "no-ai-origin-claim"],
  referenceConsistency: ["approved-reference-baseline", "reference-set-coherence", "palette-tone-detail-silhouette-framing", "batch-outlier-ranking", "guarded-visual-proof", "no-ai-origin-claim"],
  textureProofSampling: ["continuous", "nearest"],
  textureMaterialReview: ["single-map", "material-set", "normal-y-conversion", "opacity-alpha-composition", "godot-orm-pack", "uv-layout", "wavefront-obj-uv"],
  godotMaterialDelivery: ["StandardMaterial3D", "ORMMaterial3D", "guarded-preprocessing", "format-3-tres", "create-only-resource-write"],
  godotMaterialValidation: ["execution-gated", "headless-native-load", "resource-class-check", "operator-configured-executable", "opt-in-runtime-test"],
  unifiedRouting: "v2-preferred-v1-preserved",
  spriteEffectExports: ["agent-planner"],
  requiredTests: requiredTests.length,
}, null, 2)}\n`);
