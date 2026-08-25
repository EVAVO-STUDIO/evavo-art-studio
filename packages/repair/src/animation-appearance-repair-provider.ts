import {
  providerRequestSha256,
  validateProviderCandidateRequest,
  type NormalizedProviderCandidateRequest,
  type ProviderCandidateReferenceInput,
} from "@evavo/art-providers";
import {
  verifyAnimationMotionEvidenceLineage,
  verifyAnimationMotionEvidenceManifest,
  type AnimationMotionEvidenceLineage,
  type AnimationMotionEvidenceManifest,
} from "@evavo/art-quality";

import {
  ANIMATION_APPEARANCE_REPAIR_PLAN_KIND,
  ANIMATION_APPEARANCE_REPAIR_PLAN_VERSION,
  type AnimationAppearanceRepairDirective,
  type AnimationAppearanceRepairPlan,
} from "./animation-appearance-repair.js";

export const ANIMATION_APPEARANCE_REPAIR_PROVIDER_VERSION = "2026-08-26.1" as const;
export const ANIMATION_APPEARANCE_REPAIR_PROVIDER_KIND =
  "evavo.animation-appearance.repair-provider-request" as const;

export interface AnimationAppearanceRepairProviderCompileRequest {
  readonly repairPlan: AnimationAppearanceRepairPlan;
  readonly directiveFrameId: string;
  readonly evidence: AnimationMotionEvidenceManifest;
  readonly lineage: AnimationMotionEvidenceLineage;
  readonly originalRequest: NormalizedProviderCandidateRequest;
  readonly candidateCount?: number;
}

export interface AnimationAppearanceRepairProviderCompilation {
  readonly kind: typeof ANIMATION_APPEARANCE_REPAIR_PROVIDER_KIND;
  readonly version: typeof ANIMATION_APPEARANCE_REPAIR_PROVIDER_VERSION;
  readonly sequenceId: string;
  readonly frameId: string;
  readonly referenceFrameId: string;
  readonly originalProviderRequestSha256: string;
  readonly candidateArtifactId: string;
  readonly candidateContentSha256: string;
  readonly referenceArtifactId: string;
  readonly repairRequest: NormalizedProviderCandidateRequest;
  readonly repairRequestSha256: string;
  readonly authority: Readonly<{
    providerExecution: false;
    runtimeSubmission: false;
    creativeApproval: false;
    artifactPromotion: false;
    repositoryMutation: false;
    publication: false;
  }>;
}

function fail(message: string): never {
  throw new Error(`Animation appearance repair provider compile failed: ${message}`);
}

function directive(plan: AnimationAppearanceRepairPlan, frameId: string): AnimationAppearanceRepairDirective {
  const matches = plan.directives.filter((entry) => entry.frameId === frameId);
  if (matches.length !== 1) {
    fail(`directiveFrameId ${frameId} must identify exactly one appearance repair directive.`);
  }
  return matches[0]!;
}

export function compileAnimationAppearanceRepairProviderRequest(
  input: AnimationAppearanceRepairProviderCompileRequest,
): AnimationAppearanceRepairProviderCompilation {
  if (!input || typeof input !== "object") fail("input must be an object.");
  if (
    input.repairPlan.kind !== ANIMATION_APPEARANCE_REPAIR_PLAN_KIND ||
    input.repairPlan.version !== ANIMATION_APPEARANCE_REPAIR_PLAN_VERSION
  ) {
    fail("repairPlan is not a supported temporal appearance repair plan.");
  }
  if (!verifyAnimationMotionEvidenceManifest(input.evidence)) {
    fail("motion evidence manifest verification failed.");
  }
  if (!verifyAnimationMotionEvidenceLineage(input.lineage, input.evidence)) {
    fail("motion evidence lineage verification failed.");
  }
  if (
    input.repairPlan.sequenceId !== input.evidence.sequenceId ||
    input.lineage.sequenceId !== input.evidence.sequenceId
  ) {
    fail("repair plan, evidence and lineage sequence identities differ.");
  }

  const repair = directive(input.repairPlan, input.directiveFrameId);
  const targetEvidence = input.evidence.frames.find((frame) => frame.frameId === repair.frameId);
  const targetLineage = input.lineage.frames.find((frame) => frame.frameId === repair.frameId);
  const referenceEvidence = input.evidence.frames.find((frame) => frame.frameId === repair.referenceFrameId);
  if (!targetEvidence || !targetLineage || !referenceEvidence) {
    fail("target or reference frame is missing from retained animation evidence.");
  }
  if (
    targetLineage.frameArtifactId !== targetEvidence.frameArtifactId ||
    targetLineage.frameContentSha256 !== targetEvidence.frameContentSha256
  ) {
    fail("target candidate identity differs between evidence and lineage.");
  }

  const original = validateProviderCandidateRequest(input.originalRequest);
  const originalSha256 = providerRequestSha256(original);
  if (targetLineage.providerRequestSha256 !== originalSha256) {
    fail("original provider request hash differs from retained target-frame lineage.");
  }
  if (
    original.assetKind !== "sprite-frame" ||
    original.frameId !== repair.frameId ||
    original.candidateFamilyId !== input.repairPlan.sequenceId
  ) {
    fail("original provider request does not identify the appearance-repair target frame.");
  }

  const metadata = original.metadata;
  const planSha256 =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).animationDirectorPlanSha256
      : undefined;
  if (typeof planSha256 !== "string" || planSha256 !== input.lineage.animationDirectorPlanSha256) {
    fail("original provider request and retained lineage use different Director plans.");
  }

  const candidateCount = input.candidateCount ?? 1;
  if (!Number.isInteger(candidateCount) || candidateCount < 1 || candidateCount > 2) {
    fail("candidateCount must be an integer from 1 to 2 for targeted appearance repair.");
  }

  const references: ProviderCandidateReferenceInput[] = original.references
    .filter((reference) => reference.role !== "base-image" && reference.role !== "mask")
    .map((reference) => ({
      artifactId: reference.artifactId,
      role: reference.role,
      strength: reference.strength,
      required: reference.required,
      ...(reference.note ? { note: reference.note } : {}),
    }));
  references.push({
    artifactId: targetEvidence.frameArtifactId as `artifact_${string}`,
    role: "base-image",
    required: true,
    strength: 1,
    note: `Exact candidate for targeted appearance repair of ${repair.frameId}.`,
  });
  if (repair.reasons.some((reason) => reason === "colour-drift" || reason === "palette-drift" || reason === "luminance-flicker")) {
    references.push({
      artifactId: referenceEvidence.frameArtifactId as `artifact_${string}`,
      role: "palette-reference",
      required: true,
      strength: 1,
      note: `Neighbouring approved appearance reference ${repair.referenceFrameId}.`,
    });
  }
  if (repair.reasons.includes("edge-density-drift")) {
    references.push({
      artifactId: referenceEvidence.frameArtifactId as `artifact_${string}`,
      role: "line-reference",
      required: true,
      strength: 1,
      note: `Neighbouring approved line/detail reference ${repair.referenceFrameId}.`,
    });
  }

  const repairRequest = validateProviderCandidateRequest({
    schemaVersion: "1.0",
    requestId: `${original.requestId}:appearance-repair`,
    operation: "edit",
    assetKind: "sprite-frame",
    continuityPhase: "repair",
    assetId: original.assetId,
    candidateFamilyId: original.candidateFamilyId,
    frameId: repair.frameId,
    creativeIntent: [
      `Repair only temporal appearance drift in ${repair.frameId}.`,
      ...repair.correct,
      `Preserve: ${repair.preserve.join("; ")}.`,
      `Use neighbouring retained frame ${repair.referenceFrameId} only for appearance continuity, not to replace the authored pose.`,
    ].join(" "),
    negativeIntent: [
      original.negativeIntent ?? "",
      "Do not copy the neighbouring pose, alter motion timing, redesign anatomy/costume/equipment, move the pivot/baseline, crop the sprite, or invent a new lighting setup.",
    ].filter(Boolean).join(" "),
    style: original.style,
    shot: original.shot,
    target: original.target,
    ...(original.sourceCanvas ? { sourceCanvas: original.sourceCanvas } : {}),
    background: original.background,
    quality: "high",
    candidateCount,
    references,
    selection: original.selection,
    metadata: {
      animationDirectorPlanSha256: input.lineage.animationDirectorPlanSha256,
      animationProviderCompilerVersion: input.lineage.animationProviderCompilerVersion,
      motionEvidenceManifestSha256: input.evidence.manifestSha256,
      motionEvidenceLineageSha256: input.lineage.lineageSha256,
      originalProviderRequestSha256: originalSha256,
      failedCandidateArtifactId: targetEvidence.frameArtifactId,
      failedCandidateContentSha256: targetEvidence.frameContentSha256,
      appearanceReferenceFrameId: repair.referenceFrameId,
      appearanceReferenceArtifactId: referenceEvidence.frameArtifactId,
      repairPlanVersion: input.repairPlan.version,
      repairReasons: repair.reasons,
      authority: {
        providerExecution: false,
        runtimeSubmission: false,
        creativeApproval: false,
        artifactPromotion: false,
        repositoryMutation: false,
        publication: false,
      },
    },
  });

  return {
    kind: ANIMATION_APPEARANCE_REPAIR_PROVIDER_KIND,
    version: ANIMATION_APPEARANCE_REPAIR_PROVIDER_VERSION,
    sequenceId: input.repairPlan.sequenceId,
    frameId: repair.frameId,
    referenceFrameId: repair.referenceFrameId,
    originalProviderRequestSha256: originalSha256,
    candidateArtifactId: targetEvidence.frameArtifactId,
    candidateContentSha256: targetEvidence.frameContentSha256,
    referenceArtifactId: referenceEvidence.frameArtifactId,
    repairRequest,
    repairRequestSha256: providerRequestSha256(repairRequest),
    authority: {
      providerExecution: false,
      runtimeSubmission: false,
      creativeApproval: false,
      artifactPromotion: false,
      repositoryMutation: false,
      publication: false,
    },
  };
}
