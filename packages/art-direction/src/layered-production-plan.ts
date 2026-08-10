import type {
  CompiledLayeredProductionPlan,
  CompiledLayeredProductionUnit,
} from "./layered-production-types.js";
import {
  LAYERED_PRODUCTION_PLAN_KIND,
  LAYERED_PRODUCTION_PROTOCOL_VERSION,
} from "./layered-production-types.js";
import { fail, freeze, idValue, sha256 } from "./layered-production-internal.js";
import { validateLayeredProductionRequest } from "./layered-production-validation.js";
import { providerContractForUnit, providerPrompt, reviewPlan } from "./layered-production-prompts.js";

export function compileLayeredProductionPlan(input: unknown): CompiledLayeredProductionPlan {
  const request = validateLayeredProductionRequest(input);
  const requestSha256 = sha256(request);
  const styleFingerprintSha256 = sha256({
    style: request.style,
    canvas: request.canvas,
    sourcePolicy: request.sourcePolicy,
  });
  const layerRoles = request.layers.map((layer) => layer.role);
  let sequence = 0;
  const layers = request.layers.map((layer) => freeze({
    id: layer.id,
    role: layer.role,
    zOrder: layer.zOrder,
    alpha: layer.alpha,
    assemblyMode: layer.assemblyMode,
    ySortMode: layer.ySortMode,
    dependsOn: layer.dependsOn ?? [],
    include: layer.include,
    exclude: layer.exclude,
    units: layer.units.map((unit) => {
      sequence += 1;
      const prompts = providerPrompt(request, layer, unit, layerRoles);
      const jobSeed = {
        planId: request.planId,
        styleFingerprintSha256,
        layerId: layer.id,
        unit,
        prompt: prompts.prompt,
        negativePrompt: prompts.negativePrompt,
      };
      return freeze({
        sequence,
        id: unit.id,
        layerId: layer.id,
        layerRole: layer.role,
        zOrder: layer.zOrder,
        alpha: layer.alpha,
        kind: unit.kind,
        purpose: unit.purpose,
        dimensions: unit.dimensions,
        ...(unit.position ? { position: unit.position } : {}),
        ...(unit.pivot ? { pivot: unit.pivot } : {}),
        ...(unit.ySortOrigin ? { ySortOrigin: unit.ySortOrigin } : {}),
        continuityKey: unit.continuityKey,
        include: unit.include,
        exclude: unit.exclude,
        fileName: unit.fileName,
        targetPath: unit.targetPath,
        ...(unit.frame ? { frame: unit.frame } : {}),
        providerJob: freeze({
          schemaVersion: "1.0" as const,
          kind: "art.image.generate.source-unit" as const,
          sourceIntent: "runtime-source" as const,
          executionUnit: "one-image" as const,
          images: 1 as const,
          width: unit.dimensions.width,
          height: unit.dimensions.height,
          transparentBackground: layer.alpha !== "opaque",
          prompt: prompts.prompt,
          negativePrompt: prompts.negativePrompt,
          idempotencyKey: sha256(jobSeed),
          labels: freeze({
            planId: request.planId,
            styleId: request.style.styleId,
            layerId: layer.id,
            unitId: unit.id,
            continuityKey: unit.continuityKey,
          }),
          providerContract: providerContractForUnit(request, layer, unit),
        }),
        review: reviewPlan(unit, layer),
      });
    }),
  }));
  const allUnits = layers.flatMap((layer) => layer.units);
  const proofLayers = [...new Set(request.styleProof.unitIds.map((unitId) => allUnits.find((unit) => unit.id === unitId)?.layerId).filter((value): value is string => Boolean(value)))];
  const partial = {
    schemaVersion: "1.0" as const,
    kind: LAYERED_PRODUCTION_PLAN_KIND,
    protocolVersion: LAYERED_PRODUCTION_PROTOCOL_VERSION,
    planId: request.planId,
    revision: request.revision,
    intent: request.intent,
    requestSha256,
    styleFingerprintSha256,
    project: request.project,
    canvas: request.canvas,
    style: request.style,
    sourcePolicy: request.sourcePolicy,
    styleProof: freeze({
      required: true as const,
      approvalBeforeExpansion: true as const,
      maximumUnitsBeforeApproval: request.styleProof.maximumUnitsBeforeApproval,
      unitIds: request.styleProof.unitIds,
      unitCount: request.styleProof.unitIds.length,
      layerIds: proofLayers,
      status: request.styleProof.approval ? "approved" as const : "approval-required" as const,
      ...(request.styleProof.approval ? {
        approval: freeze({
          reviewer: request.styleProof.approval.reviewer,
          reviewedAt: request.styleProof.approval.reviewedAt,
          evidenceSha256: request.styleProof.approval.evidenceSha256,
          approvedUnitIds: request.styleProof.approval.approvedUnitIds,
        }),
      } : {}),
    }),
    layers,
    assembly: freeze({
      sourceAuthority: "approved-individual-source-pngs" as const,
      layerOrder: layers.map((layer) => layer.id),
      coordinateSystem: "top-left-integer" as const,
      compositePolicy: "approval-gated-derivative-only" as const,
      reviewCompositeIsRuntimeSource: false as const,
      automaticAssembly: false as const,
      ySortManifestRequired: layers.some((layer) => layer.ySortMode !== "none"),
      manifestPath: `${request.project.runtimeRoot}/manifests/${request.planId}.layer-assembly.json`,
    }),
    totals: freeze({
      layers: layers.length,
      units: allUnits.length,
      providerCalls: allUnits.length,
      maximumImagesPerProviderCall: 1 as const,
      fullCanvasLayers: allUnits.filter((unit) => unit.kind === "full-canvas-layer").length,
      sprites: allUnits.filter((unit) => unit.kind === "sprite").length,
      animationFrames: allUnits.filter((unit) => unit.kind === "animation-frame").length,
      tiles: allUnits.filter((unit) => unit.kind === "tile").length,
      overlays: allUnits.filter((unit) => unit.kind === "overlay").length,
      styleProofUnits: request.styleProof.unitIds.length,
    }),
    qualityGates: freeze([
      "style proof approval before expansion beyond the declared proof set",
      "one provider call produces exactly one source PNG and one layer role",
      "no complete scene, screenshot, concept art, sheet, grid, collage, storyboard, labels or generated readable text as runtime source",
      "exact native dimensions, integer geometry, fixed projection, fixed camera and fixed lighting",
      "deliberate pixel clusters, fixed density, palette limits and no antialiasing, gradients, bloom or AI microtexture noise",
      "true alpha or fully opaque coverage according to each layer contract",
      "isolated review plus composite review against approved lower layers",
      "human approval per exact source hash before assembly, integration or promotion",
    ]),
    authority: freeze({
      planningOnly: true as const,
      providerExecution: false as const,
      automaticAssembly: false as const,
      automaticPromotion: false as const,
      targetRepositoryMutation: false as const,
      approval: false as const,
      gitCommit: false as const,
      gitPush: false as const,
      publication: false as const,
    }),
    ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
  };
  const planSha256 = sha256(partial);
  return freeze({ ...partial, planSha256 });
}

export function verifyLayeredProductionPlan(plan: CompiledLayeredProductionPlan): true {
  if (plan.kind !== LAYERED_PRODUCTION_PLAN_KIND) {
    fail("LAYERED_PRODUCTION_PLAN_INVALID", `plan.kind must equal ${LAYERED_PRODUCTION_PLAN_KIND}.`);
  }
  if (plan.protocolVersion !== LAYERED_PRODUCTION_PROTOCOL_VERSION) {
    fail("LAYERED_PRODUCTION_PLAN_INVALID", "Layered production protocol version mismatch.");
  }
  if (!/^[0-9a-f]{64}$/.test(plan.planSha256)) {
    fail("LAYERED_PRODUCTION_PLAN_INVALID", "plan.planSha256 must be a lowercase SHA-256.");
  }
  const { planSha256, ...withoutHash } = plan;
  if (sha256(withoutHash) !== planSha256) {
    fail("LAYERED_PRODUCTION_PLAN_INVALID", "plan.planSha256 does not match the canonical plan payload.");
  }
  return true;
}

export function getLayeredProductionUnit(plan: CompiledLayeredProductionPlan, unitId: string): CompiledLayeredProductionUnit {
  verifyLayeredProductionPlan(plan);
  const id = idValue(unitId, "unitId");
  for (const layer of plan.layers) {
    const unit = layer.units.find((entry) => entry.id === id);
    if (unit) {
      if (plan.styleProof.status !== "approved" && !plan.styleProof.unitIds.includes(id)) {
        fail(
          "LAYERED_PRODUCTION_STYLE_PROOF_REQUIRED",
          `Unit ${id} is outside the style-proof set. Approve the exact proof evidence before production expansion.`,
        );
      }
      return unit;
    }
  }
  fail("LAYERED_PRODUCTION_UNIT_NOT_FOUND", `Unknown layered production unit ${id}.`);
}

