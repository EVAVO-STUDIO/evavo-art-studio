#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const manifestContracts = [
  ["config/image-finishing-artist.capabilities.json", 1],
  ["config/image-finishing-packet.capabilities.json", 1],
  ["config/image-repair-agent.capabilities.json", 1],
  ["config/image-reference-consistency.capabilities.json", 1],
  ["config/image-artifact-triage.capabilities.json", 1],
  ["config/image-sequence-finishing.capabilities.json", 1],
  ["config/image-delivery-integrity.capabilities.json", 1],
  ["config/image-finalization.capabilities.json", 1],
  ["config/texture-review-agent.capabilities.json", 1],
  ["config/godot-material-delivery-agent.capabilities.json", 1],
  ["config/godot-material-validation-agent.capabilities.json", 1],
  ["config/image-effects-agent.capabilities.json", 1],
  ["config/image-agent-router.capabilities.json", 1],
  ["config/image-workflow-router-v2.capabilities.json", 2],
];

function requireIncludes(source, values, label) {
  for (const value of values) {
    if (!source.includes(value)) throw new Error(`${label} is missing ${value}.`);
  }
}

function supportedSchema(value, major) {
  return typeof value === "string" && new RegExp(`^${major}\\.\\d+$`, "u").test(value);
}

const manifests = new Map();
const surfaces = [];
for (const [relative, major] of manifestContracts) {
  const manifest = JSON.parse(await readFile(path.join(root, relative), "utf8"));
  if (!supportedSchema(manifest.schemaVersion, major) || typeof manifest.entrypoint !== "string") {
    throw new Error(`${relative} is missing a supported ${major}.x capability contract.`);
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
  manifests.set(relative, manifest);
  surfaces.push({ id: manifest.id, schemaVersion: manifest.schemaVersion, entrypoint: manifest.entrypoint, tools: manifest.tools?.length ?? 0 });
}

const routerV2 = manifests.get("config/image-workflow-router-v2.capabilities.json");
if (!Array.isArray(routerV2.goals) || routerV2.goals.length !== 15) throw new Error("Image workflow router v2 must advertise exactly fifteen goals.");
for (const goal of ["frame-consistency", "delivery-preflight", "finalize-image"]) {
  if (!routerV2.goals.includes(goal)) throw new Error(`Image workflow router v2 is missing ${goal}.`);
}
if (routerV2.guarantees?.v1RouterCompatibilityPreserved !== true || routerV2.guarantees?.explicitPrivilegeSeparation !== true) {
  throw new Error("Image workflow router v2 must preserve v1 routing and explicit privilege separation.");
}
if (routerV2.guarantees?.carriesApprovalAuthority !== false || routerV2.guarantees?.claimsAiOriginDetection !== false) {
  throw new Error("Image workflow router v2 must not claim approval authority or AI-origin detection.");
}
for (const existingContract of routerV2.integratesExistingContracts ?? []) await access(path.join(root, existingContract));

const sequenceManifest = manifests.get("config/image-sequence-finishing.capabilities.json");
if (sequenceManifest.guarantees?.writesFiles !== false
  || sequenceManifest.guarantees?.semanticMotionQualityClaimed !== false
  || sequenceManifest.guarantees?.automaticPromotionAllowed !== false) {
  throw new Error("Sequence finishing must remain read-only, technically scoped and non-promoting.");
}

const deliveryManifest = manifests.get("config/image-delivery-integrity.capabilities.json");
for (const check of ["encoded-format-vs-intent", "alpha-channel-compatibility", "encoded-byte-budget", "effective-print-dpi"]) {
  if (!deliveryManifest.checks?.includes(check)) throw new Error(`Delivery integrity is missing ${check}.`);
}
if (deliveryManifest.guarantees?.writesFiles !== false
  || deliveryManifest.guarantees?.explicitFormatMismatchBlocksDelivery !== true
  || deliveryManifest.guarantees?.explicitForbiddenAlphaBlocksDelivery !== true) {
  throw new Error("Delivery integrity must remain read-only and fail closed for explicit format/alpha conflicts.");
}

const finalizationManifest = manifests.get("config/image-finalization.capabilities.json");
for (const decision of ["blocked", "needs-image-finishing", "needs-delivery-review", "ready-for-approval-review"]) {
  if (!finalizationManifest.decisions?.includes(decision)) throw new Error(`Finalization capability is missing ${decision}.`);
}
if (finalizationManifest.guarantees?.automaticPromotionAllowed !== false
  || finalizationManifest.guarantees?.readyMeansApproved !== false
  || finalizationManifest.guarantees?.humanVisualReviewRequired !== true) {
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
for (const name of mediaExports) requireIncludes(mediaIndex, [`export * from "./${name}.js";`], "@evavo/art-media public index");

const reviewProfiles = await readFile(path.join(root, "packages/media/src/image-review-profiles.ts"), "utf8");
const canonicalProfiles = ["logo-transparent", "web-hero", "ui-screenshot", "product-cutout", "photo", "cel-animation-frame", "pixel-art", "texture", "illustration"];
for (const profile of canonicalProfiles) requireIncludes(reviewProfiles, [`"${profile}"`], "Canonical image review profile registry");
if (reviewProfiles.includes('"web-support"')) throw new Error("web-support is a finishing preset, not a canonical image review profile.");

const finishingPacket = await readFile(path.join(root, "packages/media/src/image-finishing-review-packet.ts"), "utf8");
requireIncludes(finishingPacket, [
  "createImageFinishingReviewPacket",
  "createImageFinishingReviewBatch",
  "Finishing review batch requires 1 through 128 images",
  "automaticPromotionAllowed",
  "approved-reference-set-is-not-stable-enough",
  "generated-detail-risk:",
], "Unified finishing packet");

const sequenceReview = await readFile(path.join(root, "packages/media/src/image-sequence-finishing-review.ts"), "utf8");
requireIncludes(sequenceReview, [
  "createImageSequenceFinishingReview",
  "neighbors",
  "neighbor similarity evidence",
  "Temporal semantic",
  "visualReviewRequired: true",
  "automaticPromotionAllowed: false",
], "Sequence finishing review");

const deliveryIntegrity = await readFile(path.join(root, "packages/media/src/image-delivery-integrity.ts"), "utf8");
requireIncludes(deliveryIntegrity, [
  "reviewImageDeliveryIntegrity",
  "maximumBytes",
  "forbidAlpha",
  "effectiveDpiX",
  "effectiveDpiY",
  "encoded-byte-budget-exceeded",
  "encoded-format-does-not-match-intent",
], "Delivery integrity core");

const finalizationReview = await readFile(path.join(root, "packages/media/src/image-finalization-review.ts"), "utf8");
requireIncludes(finalizationReview, [
  "reviewImageFinalization",
  "ready-for-approval-review",
  "requiresHumanVisualReview: true",
  "automaticPromotionAllowed: false",
  "existing-promotion-and-approval-gates",
], "Finalization review");

const routerV2Core = await readFile(path.join(root, "packages/media/src/image-agent-routing-v2.ts"), "utf8");
requireIncludes(routerV2Core, [
  "evavo_review_image_sequence_finishing",
  "evavo_review_image_delivery_integrity",
  "evavo_review_image_finalization",
  "evavo_validate_godot_material_resource",
  "write-gated-create-only",
  "candidate-and-mask-required",
  "provider-or-human-candidate-required",
  "execution-gated",
  "Ready-for-approval-review is not approval",
], "Image workflow router v2 core");

const generatedDetailRisk = await readFile(path.join(root, "packages/media/src/image-generated-detail-risk.ts"), "utf8");
requireIncludes(generatedDetailRisk, ["repeated-nontrivial-local-pattern-risk", "local-detail-density-imbalance", "advisoryOnly", "aiOriginDetection"], "Generated-detail triage");

const referenceConsistency = await readFile(path.join(root, "packages/media/src/image-reference-consistency.ts"), "utf8");
requireIncludes(referenceConsistency, ["palette-distribution-drift", "silhouette-or-occupancy-drift", "reference-set-unstable", "aiOriginDetection"], "Reference consistency");

const texturePreprocess = await readFile(path.join(root, "packages/media/src/texture-preprocess.ts"), "utf8");
requireIncludes(texturePreprocess, ["convertTangentNormalYConvention", "composeOpacityIntoAlbedoAlpha", "G=255-G"], "Texture preprocessing");

const enhancementSession = await readFile(path.join(root, "packages/media/src/enhancement-review-session.ts"), "utf8");
requireIncludes(enhancementSession, ["reviewEnhancementStructureRisk"], "Enhancement review session");

const godotIndex = await readFile(path.join(root, "packages/godot/src/index.ts"), "utf8");
for (const name of ["material-delivery", "material-resource", "material-validation"]) requireIncludes(godotIndex, [`export * from "./${name}.js";`], "@evavo/art-godot public index");

const godotResource = await readFile(path.join(root, "packages/godot/src/material-resource.ts"), "utf8");
requireIncludes(godotResource, ["renderGodotMaterialTres", "format=3"], "Godot material resource renderer");
if (godotResource.includes("load_steps=")) throw new Error("Godot material resource renderer must not emit deprecated load_steps for 4.6 resources.");

const godotValidation = await readFile(path.join(root, "packages/godot/src/material-validation.ts"), "utf8");
requireIncludes(godotValidation, ["runGodotMaterialValidation", "--headless", "--script", "shell: false", "EVAVO_MATERIAL_VALIDATION="], "Godot native material validation");

const spriteEffectsIndex = await readFile(path.join(root, "packages/godot-sprite-effects/src/index.ts"), "utf8");
requireIncludes(spriteEffectsIndex, ['export * from "./agent-planner.js";'], "Godot sprite effects public index");

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
for (const relative of requiredTests) await access(path.join(root, relative));

const routerDoctor = spawnSync(process.execPath, [path.join(root, "scripts/check-image-workflow-router-v2.mjs")], { cwd: root, encoding: "utf8" });
if (routerDoctor.status !== 0) throw new Error(`Image workflow router v2 doctor failed:\n${routerDoctor.stderr || routerDoctor.stdout}`);

process.stdout.write(`${JSON.stringify({
  contract: "evavo.image-agent-surfaces.check.v2",
  ok: true,
  preferredDiscovery: "evavo-image-workflow-router-v2",
  surfaces,
  mediaExports,
  canonicalProfiles,
  finishingPipeline: ["review", "sequence", "repair", "delivery-preflight", "finalization-admission", "explicit-approval-gate"],
  sequenceFinishing: ["ordered-frames", "adjacent-similarity", "technical-continuity", "no-semantic-motion-claim", "no-auto-promotion"],
  deliveryIntegrity: ["format", "alpha", "colour-space", "metadata", "megapixel-budget", "encoded-byte-budget", "print-dpi", "read-only"],
  finalizationAdmission: ["blocked", "needs-image-finishing", "needs-delivery-review", "ready-for-approval-review", "ready-is-not-approved"],
  routing: ["v2-preferred", "v1-preserved", "deterministic-pipeline-preserved", "model-router-preserved", "privilege-separated"],
  provenancePolicy: ["artifact-risk-is-advisory", "no-pixel-only-ai-origin-claim"],
  requiredTests: requiredTests.length,
}, null, 2)}\n`);
