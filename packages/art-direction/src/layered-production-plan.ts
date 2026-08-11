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
import {
  providerContractForUnit,
  providerPrompt,
  reviewPlan,
} from "./layered-production-prompts.js";

const STYLE_PROOF_APPROVAL_RECEIPT_KIND =
  "evavo.layered-production.style-proof-approval.receipt";
const STYLE_PROOF_APPROVAL_PROTOCOL_VERSION = "2026-08-11.1";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ARTIFACT_ID_PATTERN = /^artifact_[0-9a-f]{64}$/;

function approvedReceipt(
  plan: CompiledLayeredProductionPlan,
): Record<string, unknown> {
  const approval = plan.styleProof.approval;
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) {
    fail(
      "LAYERED_PRODUCTION_PLAN_INVALID",
      "Approved style proof requires an embedded content-addressed approval receipt.",
    );
  }
  return approval as unknown as Record<string, unknown>;
}

function stringArray(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value
    : undefined;
}

function verifyApprovedStyleProof(
  plan: CompiledLayeredProductionPlan,
): void {
  if (plan.styleProof.status === "approval-required") {
    if (plan.styleProof.approval !== undefined) {
      fail(
        "LAYERED_PRODUCTION_PLAN_INVALID",
        "A pending style proof may not contain approval material.",
      );
    }
    return;
  }
  const receipt = approvedReceipt(plan);
  if (
    receipt.kind !== STYLE_PROOF_APPROVAL_RECEIPT_KIND ||
    receipt.protocolVersion !== STYLE_PROOF_APPROVAL_PROTOCOL_VERSION ||
    receipt.schemaVersion !== "1.0"
  ) {
    fail(
      "LAYERED_PRODUCTION_PLAN_INVALID",
      "Approved style proof receipt protocol identity is invalid.",
    );
  }
  const receiptSha256 = receipt.receiptSha256;
  if (typeof receiptSha256 !== "string" || !SHA256_PATTERN.test(receiptSha256)) {
    fail(
      "LAYERED_PRODUCTION_PLAN_INVALID",
      "Approved style proof receiptSha256 is invalid.",
    );
  }
  const { receiptSha256: _receiptSha256, ...receiptWithoutHash } = receipt;
  if (sha256(receiptWithoutHash) !== receiptSha256) {
    fail(
      "LAYERED_PRODUCTION_PLAN_INVALID",
      "Approved style proof receipt hash does not match its canonical payload.",
    );
  }
  const proofUnitIds = stringArray(receipt.proofUnitIds);
  if (
    !proofUnitIds ||
    proofUnitIds.length !== plan.styleProof.unitIds.length ||
    !plan.styleProof.unitIds.every(
      (unitId, index) => proofUnitIds[index] === unitId,
    )
  ) {
    fail(
      "LAYERED_PRODUCTION_PLAN_INVALID",
      "Approved style proof receipt does not cover the exact proof unit order.",
    );
  }
  const approvedUnitIds = stringArray(receipt.approvedUnitIds);
  if (
    !approvedUnitIds ||
    approvedUnitIds.length !== proofUnitIds.length ||
    !proofUnitIds.every(
      (unitId, index) => approvedUnitIds[index] === unitId,
    )
  ) {
    fail(
      "LAYERED_PRODUCTION_PLAN_INVALID",
      "Approved style proof receipt approvedUnitIds do not match the exact proof set.",
    );
  }
  if (
    receipt.planId !== plan.planId ||
    receipt.styleFingerprintSha256 !== plan.styleFingerprintSha256 ||
    typeof receipt.pendingPlanSha256 !== "string" ||
    !SHA256_PATTERN.test(receipt.pendingPlanSha256)
  ) {
    fail(
      "LAYERED_PRODUCTION_PLAN_INVALID",
      "Approved style proof receipt is not bound to this plan identity.",
    );
  }
  const { planSha256: _approvedPlanSha256, ...approvedWithoutHash } = plan;
  const {
    approval: _approval,
    status: _status,
    ...pendingStyleProofBase
  } = plan.styleProof;
  const reconstructedPending = {
    ...approvedWithoutHash,
    styleProof: {
      ...pendingStyleProofBase,
      status: "approval-required" as const,
    },
  };
  if (sha256(reconstructedPending) !== receipt.pendingPlanSha256) {
    fail(
      "LAYERED_PRODUCTION_PLAN_INVALID",
      "Approved style proof receipt pending-plan hash does not match the exact pre-approval plan.",
    );
  }
  for (const name of ["requestSha256", "evidenceSha256"] as const) {
    const value = receipt[name];
    if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
      fail(
        "LAYERED_PRODUCTION_PLAN_INVALID",
        `Approved style proof ${name} is invalid.`,
      );
    }
  }
  const evidence = Array.isArray(receipt.evidence) ? receipt.evidence : undefined;
  if (!evidence || evidence.length !== proofUnitIds.length) {
    fail(
      "LAYERED_PRODUCTION_PLAN_INVALID",
      "Approved style proof evidence count is invalid.",
    );
  }
  const unitById = new Map(
    plan.layers.flatMap((layer) => layer.units).map((unit) => [unit.id, unit]),
  );
  for (const [index, rawEvidence] of evidence.entries()) {
    if (
      !rawEvidence ||
      typeof rawEvidence !== "object" ||
      Array.isArray(rawEvidence)
    ) {
      fail(
        "LAYERED_PRODUCTION_PLAN_INVALID",
        `Approved style proof evidence ${index} is invalid.`,
      );
    }
    const entry = rawEvidence as Record<string, unknown>;
    const unitId = proofUnitIds[index];
    const unit = unitById.get(unitId ?? "");
    if (
      !unit ||
      entry.unitId !== unitId ||
      entry.width !== unit.dimensions.width ||
      entry.height !== unit.dimensions.height ||
      entry.providerJobIdempotencyKey !== unit.providerJob.idempotencyKey ||
      entry.decision !== "approved"
    ) {
      fail(
        "LAYERED_PRODUCTION_PLAN_INVALID",
        `Approved style proof evidence does not match exact unit ${unitId ?? index}.`,
      );
    }
    for (const [artifactField, hashField] of [
      ["sourceArtifactId", "sourceSha256"],
      ["sealedReviewArtifactId", "sealedReviewReceiptSha256"],
      ["reviewBundleArtifactId", "reviewBundleSha256"],
    ] as const) {
      const artifactId = entry[artifactField];
      const hash = entry[hashField];
      if (
        typeof artifactId !== "string" ||
        !ARTIFACT_ID_PATTERN.test(artifactId) ||
        typeof hash !== "string" ||
        !SHA256_PATTERN.test(hash) ||
        artifactId !== `artifact_${hash}`
      ) {
        fail(
          "LAYERED_PRODUCTION_PLAN_INVALID",
          `Approved style proof evidence ${artifactField} is invalid.`,
        );
      }
    }
    if (
      typeof entry.providerRequestSha256 !== "string" ||
      !SHA256_PATTERN.test(entry.providerRequestSha256)
    ) {
      fail(
        "LAYERED_PRODUCTION_PLAN_INVALID",
        "Approved style proof provider request hash is invalid.",
      );
    }
  }
  const crossUnitReview = receipt.crossUnitReview;
  if (
    !crossUnitReview ||
    typeof crossUnitReview !== "object" ||
    Array.isArray(crossUnitReview)
  ) {
    fail(
      "LAYERED_PRODUCTION_PLAN_INVALID",
      "Approved style proof cross-unit review is invalid.",
    );
  }
  const cross = crossUnitReview as Record<string, unknown>;
  for (const field of [
    "decision",
    "cameraConsistency",
    "lightingConsistency",
    "paletteConsistency",
    "pixelGrammarConsistency",
    "layerSeparation",
    "antiGenericQuality",
  ]) {
    if (cross[field] !== "approved") {
      fail(
        "LAYERED_PRODUCTION_PLAN_INVALID",
        `Approved style proof cross-unit ${field} is not approved.`,
      );
    }
  }
  if (
    cross.styleFingerprintSha256 !== plan.styleFingerprintSha256 ||
    typeof cross.evidenceSha256 !== "string" ||
    !SHA256_PATTERN.test(cross.evidenceSha256) ||
    cross.evidenceArtifactId !== `artifact_${cross.evidenceSha256}`
  ) {
    fail(
      "LAYERED_PRODUCTION_PLAN_INVALID",
      "Approved style proof cross-unit evidence identity is invalid.",
    );
  }
  const authority = receipt.authority;
  if (
    !authority ||
    typeof authority !== "object" ||
    Array.isArray(authority) ||
    Object.values(authority as Record<string, unknown>).some(
      (entry) => entry !== false,
    )
  ) {
    fail(
      "LAYERED_PRODUCTION_PLAN_INVALID",
      "Approved style proof receipt authority must remain entirely false.",
    );
  }
}

export function compileLayeredProductionPlan(
  input: unknown,
): CompiledLayeredProductionPlan {
  const request = validateLayeredProductionRequest(input);
  const requestSha256 = sha256(request);
  const styleFingerprintSha256 = sha256({
    style: request.style,
    canvas: request.canvas,
    sourcePolicy: request.sourcePolicy,
  });
  const layerRoles = request.layers.map((layer) => layer.role);
  let sequence = 0;
  const layers = request.layers.map((layer) =>
    freeze({
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
    }),
  );
  const allUnits = layers.flatMap((layer) => layer.units);
  const proofLayers = [
    ...new Set(
      request.styleProof.unitIds
        .map(
          (unitId) =>
            allUnits.find((unit) => unit.id === unitId)?.layerId,
        )
        .filter((value): value is string => Boolean(value)),
    ),
  ];
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
      maximumUnitsBeforeApproval:
        request.styleProof.maximumUnitsBeforeApproval,
      unitIds: request.styleProof.unitIds,
      unitCount: request.styleProof.unitIds.length,
      layerIds: proofLayers,
      status: "approval-required" as const,
    }),
    layers,
    assembly: freeze({
      sourceAuthority: "approved-individual-source-pngs" as const,
      layerOrder: layers.map((layer) => layer.id),
      coordinateSystem: "top-left-integer" as const,
      compositePolicy: "approval-gated-derivative-only" as const,
      reviewCompositeIsRuntimeSource: false as const,
      automaticAssembly: false as const,
      ySortManifestRequired: layers.some(
        (layer) => layer.ySortMode !== "none",
      ),
      manifestPath: `${request.project.runtimeRoot}/manifests/${request.planId}.layer-assembly.json`,
    }),
    totals: freeze({
      layers: layers.length,
      units: allUnits.length,
      providerCalls: allUnits.length,
      maximumImagesPerProviderCall: 1 as const,
      fullCanvasLayers: allUnits.filter(
        (unit) => unit.kind === "full-canvas-layer",
      ).length,
      sprites: allUnits.filter((unit) => unit.kind === "sprite").length,
      animationFrames: allUnits.filter(
        (unit) => unit.kind === "animation-frame",
      ).length,
      tiles: allUnits.filter((unit) => unit.kind === "tile").length,
      overlays: allUnits.filter((unit) => unit.kind === "overlay").length,
      styleProofUnits: request.styleProof.unitIds.length,
    }),
    qualityGates: freeze([
      "style proof approval before expansion beyond the declared proof set",
      "content-addressed approval receipt binds exact source PNGs, provider jobs, sealed reviews and cross-unit style evidence",
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

export function verifyLayeredProductionPlan(
  plan: CompiledLayeredProductionPlan,
): true {
  if (plan.kind !== LAYERED_PRODUCTION_PLAN_KIND) {
    fail(
      "LAYERED_PRODUCTION_PLAN_INVALID",
      `plan.kind must equal ${LAYERED_PRODUCTION_PLAN_KIND}.`,
    );
  }
  if (plan.protocolVersion !== LAYERED_PRODUCTION_PROTOCOL_VERSION) {
    fail(
      "LAYERED_PRODUCTION_PLAN_INVALID",
      "Layered production protocol version mismatch.",
    );
  }
  if (!SHA256_PATTERN.test(plan.planSha256)) {
    fail(
      "LAYERED_PRODUCTION_PLAN_INVALID",
      "plan.planSha256 must be a lowercase SHA-256.",
    );
  }
  const { planSha256, ...withoutHash } = plan;
  if (sha256(withoutHash) !== planSha256) {
    fail(
      "LAYERED_PRODUCTION_PLAN_INVALID",
      "plan.planSha256 does not match the canonical plan payload.",
    );
  }
  verifyApprovedStyleProof(plan);
  return true;
}

export function getLayeredProductionUnit(
  plan: CompiledLayeredProductionPlan,
  unitId: string,
): CompiledLayeredProductionUnit {
  verifyLayeredProductionPlan(plan);
  const id = idValue(unitId, "unitId");
  for (const layer of plan.layers) {
    const unit = layer.units.find((entry) => entry.id === id);
    if (unit) {
      if (
        plan.styleProof.status !== "approved" &&
        !plan.styleProof.unitIds.includes(id)
      ) {
        fail(
          "LAYERED_PRODUCTION_STYLE_PROOF_REQUIRED",
          `Unit ${id} is outside the style-proof set. Approve the exact proof evidence before production expansion.`,
        );
      }
      return unit;
    }
  }
  fail(
    "LAYERED_PRODUCTION_UNIT_NOT_FOUND",
    `Unknown layered production unit ${id}.`,
  );
}
