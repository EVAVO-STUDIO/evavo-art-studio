import type { LayeredProductionRequestInput } from "./layered-production-types.js";
import { LAYERED_PRODUCTION_REQUEST_KIND } from "./layered-production-types.js";
import { normalizeLayeredProductionCore } from "./layered-production-core-validation.js";
import {
  SEMVER_PATTERN,
  exactKeys,
  fail,
  freeze,
  idValue,
  integerValue,
  literalTrue,
  normalizedLayer,
  record,
  stringValue,
  strings,
} from "./layered-production-internal.js";

export function validateLayeredProductionRequest(
  inputValue: unknown,
): LayeredProductionRequestInput {
  const { input, intent, project, canvas, style } =
    normalizeLayeredProductionCore(inputValue);
  const policyInput = record(input.sourcePolicy, "request.sourcePolicy");
  exactKeys(policyInput, "request.sourcePolicy", ["oneImagePerProviderJob", "oneLayerRolePerSourceUnit", "conceptArtAsRuntimeSourceForbidden", "collagesAsRuntimeSourceForbidden", "contactSheetsAsRuntimeSourceForbidden", "readableGeneratedTextForbidden", "automaticAssemblyForbidden", "automaticPromotionForbidden", "humanApprovalRequired", "styleProofApprovalRequired", "maximumProviderImagesPerJob"]);
  const sourcePolicy = freeze({
    oneImagePerProviderJob: literalTrue(policyInput.oneImagePerProviderJob, "request.sourcePolicy.oneImagePerProviderJob"),
    oneLayerRolePerSourceUnit: literalTrue(policyInput.oneLayerRolePerSourceUnit, "request.sourcePolicy.oneLayerRolePerSourceUnit"),
    conceptArtAsRuntimeSourceForbidden: literalTrue(policyInput.conceptArtAsRuntimeSourceForbidden, "request.sourcePolicy.conceptArtAsRuntimeSourceForbidden"),
    collagesAsRuntimeSourceForbidden: literalTrue(policyInput.collagesAsRuntimeSourceForbidden, "request.sourcePolicy.collagesAsRuntimeSourceForbidden"),
    contactSheetsAsRuntimeSourceForbidden: literalTrue(policyInput.contactSheetsAsRuntimeSourceForbidden, "request.sourcePolicy.contactSheetsAsRuntimeSourceForbidden"),
    readableGeneratedTextForbidden: literalTrue(policyInput.readableGeneratedTextForbidden, "request.sourcePolicy.readableGeneratedTextForbidden"),
    automaticAssemblyForbidden: literalTrue(policyInput.automaticAssemblyForbidden, "request.sourcePolicy.automaticAssemblyForbidden"),
    automaticPromotionForbidden: literalTrue(policyInput.automaticPromotionForbidden, "request.sourcePolicy.automaticPromotionForbidden"),
    humanApprovalRequired: literalTrue(policyInput.humanApprovalRequired, "request.sourcePolicy.humanApprovalRequired"),
    styleProofApprovalRequired: literalTrue(policyInput.styleProofApprovalRequired, "request.sourcePolicy.styleProofApprovalRequired"),
    maximumProviderImagesPerJob: integerValue(policyInput.maximumProviderImagesPerJob, "request.sourcePolicy.maximumProviderImagesPerJob", 1, 1) as 1,
  });

  if (!Array.isArray(input.layers) || input.layers.length < 2 || input.layers.length > 128) fail("LAYERED_PRODUCTION_LAYER_INVALID", "request.layers must contain between 2 and 128 layers.");
  const layers = input.layers.map((entry, index) => normalizedLayer(entry, `request.layers[${index}]`, canvas)).sort((left, right) => left.zOrder - right.zOrder || left.id.localeCompare(right.id));
  const layerIds = layers.map((layer) => layer.id);
  if (new Set(layerIds).size !== layerIds.length) fail("LAYERED_PRODUCTION_LAYER_INVALID", "Layer IDs must be unique.");
  const zOrders = layers.map((layer) => layer.zOrder);
  if (new Set(zOrders).size !== zOrders.length) fail("LAYERED_PRODUCTION_LAYER_INVALID", "Layer zOrder values must be unique.");
  if (!layers.some((layer) => layer.alpha === "opaque" && layer.assemblyMode === "full-canvas" && layer.units.some((unit) => unit.kind === "full-canvas-layer"))) {
    fail("LAYERED_PRODUCTION_LAYER_INVALID", "The plan requires at least one opaque full-canvas base layer.");
  }
  const byLayerId = new Map(layers.map((layer) => [layer.id, layer]));
  for (const layer of layers) for (const dependency of layer.dependsOn ?? []) {
    const target = byLayerId.get(dependency);
    if (!target) fail("LAYERED_PRODUCTION_LAYER_INVALID", `Layer ${layer.id} depends on unknown layer ${dependency}.`);
    if (target.zOrder >= layer.zOrder) fail("LAYERED_PRODUCTION_LAYER_INVALID", `Layer ${layer.id} may depend only on a lower zOrder layer.`);
  }
  const allUnits = layers.flatMap((layer) => layer.units);
  const unitIds = allUnits.map((unit) => unit.id);
  const fileNames = allUnits.map((unit) => unit.fileName);
  const targetPaths = allUnits.map((unit) => unit.targetPath);
  if (new Set(unitIds).size !== unitIds.length) fail("LAYERED_PRODUCTION_UNIT_INVALID", "Unit IDs must be unique across the plan.");
  if (new Set(fileNames).size !== fileNames.length) fail("LAYERED_PRODUCTION_PATH_INVALID", "Source filenames must be unique across the plan.");
  if (new Set(targetPaths).size !== targetPaths.length) fail("LAYERED_PRODUCTION_PATH_INVALID", "Target paths must be unique across the plan.");

  const proofInput = record(input.styleProof, "request.styleProof");
  exactKeys(proofInput, "request.styleProof", ["required", "approvalBeforeExpansion", "maximumUnitsBeforeApproval", "unitIds", "approval"]);
  literalTrue(proofInput.required, "request.styleProof.required");
  literalTrue(proofInput.approvalBeforeExpansion, "request.styleProof.approvalBeforeExpansion");
  const proofUnitIds = strings(proofInput.unitIds, "request.styleProof.unitIds", 3, 64).map((entry) => idValue(entry, "request.styleProof.unitIds"));
  const maximumUnitsBeforeApproval = integerValue(proofInput.maximumUnitsBeforeApproval, "request.styleProof.maximumUnitsBeforeApproval", proofUnitIds.length, 64);
  const unitLayer = new Map<string, string>();
  for (const layer of layers) for (const unit of layer.units) unitLayer.set(unit.id, layer.id);
  for (const unitId of proofUnitIds) if (!unitLayer.has(unitId)) fail("LAYERED_PRODUCTION_STYLE_PROOF_INVALID", `Style proof references unknown unit ${unitId}.`);
  const proofLayerIds = new Set(proofUnitIds.map((unitId) => unitLayer.get(unitId)));
  if (proofLayerIds.size < 3) fail("LAYERED_PRODUCTION_STYLE_PROOF_INVALID", "Style proof must span at least three layers.");
  const opaqueBaseIds = new Set(layers.filter((layer) => layer.alpha === "opaque").flatMap((layer) => layer.units.map((unit) => unit.id)));
  if (!proofUnitIds.some((unitId) => opaqueBaseIds.has(unitId))) fail("LAYERED_PRODUCTION_STYLE_PROOF_INVALID", "Style proof must include an opaque base unit.");
  const animationIds = new Set(allUnits.filter((unit) => unit.kind === "animation-frame").map((unit) => unit.id));
  if (animationIds.size && !proofUnitIds.some((unitId) => animationIds.has(unitId))) fail("LAYERED_PRODUCTION_STYLE_PROOF_INVALID", "Style proof must include an animation frame when the plan contains animation.");
  const approval = proofInput.approval === undefined ? undefined : (() => {
    const approvalInput = record(proofInput.approval, "request.styleProof.approval");
    exactKeys(approvalInput, "request.styleProof.approval", ["approved", "reviewer", "reviewedAt", "evidenceSha256", "approvedUnitIds"]);
    literalTrue(approvalInput.approved, "request.styleProof.approval.approved");
    const reviewedAt = stringValue(approvalInput.reviewedAt, "request.styleProof.approval.reviewedAt", 100);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(reviewedAt)) {
      fail("LAYERED_PRODUCTION_STYLE_PROOF_INVALID", "request.styleProof.approval.reviewedAt must be an ISO UTC timestamp.");
    }
    const evidenceSha256 = stringValue(approvalInput.evidenceSha256, "request.styleProof.approval.evidenceSha256", 64);
    if (!/^[0-9a-f]{64}$/.test(evidenceSha256)) fail("LAYERED_PRODUCTION_STYLE_PROOF_INVALID", "request.styleProof.approval.evidenceSha256 must be a lowercase SHA-256.");
    const approvedUnitIds = strings(approvalInput.approvedUnitIds, "request.styleProof.approval.approvedUnitIds", proofUnitIds.length, proofUnitIds.length).map((entry) => idValue(entry, "request.styleProof.approval.approvedUnitIds"));
    if (approvedUnitIds.length !== proofUnitIds.length || !proofUnitIds.every((unitId) => approvedUnitIds.includes(unitId))) {
      fail("LAYERED_PRODUCTION_STYLE_PROOF_INVALID", "Style-proof approval must cover the exact declared proof unit set.");
    }
    return freeze({
      approved: true as const,
      reviewer: stringValue(approvalInput.reviewer, "request.styleProof.approval.reviewer", 300),
      reviewedAt,
      evidenceSha256,
      approvedUnitIds,
    });
  })();
  const styleProof = freeze({
    required: true as const,
    approvalBeforeExpansion: true as const,
    maximumUnitsBeforeApproval,
    unitIds: proofUnitIds,
    ...(approval ? { approval } : {}),
  });

  return freeze({
    schemaVersion: "1.0" as const,
    kind: LAYERED_PRODUCTION_REQUEST_KIND,
    planId: idValue(input.planId, "request.planId"),
    revision: (() => {
      const value = stringValue(input.revision, "request.revision", 50);
      if (!SEMVER_PATTERN.test(value)) fail("LAYERED_PRODUCTION_INPUT_INVALID", "request.revision must be semantic versioning.");
      return value;
    })(),
    intent,
    project,
    canvas,
    style,
    sourcePolicy,
    styleProof,
    layers,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  });
}
