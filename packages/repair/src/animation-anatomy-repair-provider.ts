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
  ANIMATION_ANATOMY_REPAIR_PLAN_KIND,
  ANIMATION_ANATOMY_REPAIR_PLAN_VERSION,
  type AnimationAnatomyRepairPlan,
} from "./animation-anatomy-repair.js";

export const ANIMATION_ANATOMY_REPAIR_PROVIDER_VERSION = "2026-08-26.1" as const;
export const ANIMATION_ANATOMY_REPAIR_PROVIDER_KIND =
  "evavo.animation-anatomy.repair-provider-request" as const;

export interface AnimationAnatomyRepairProviderCompileRequest {
  readonly repairPlan: AnimationAnatomyRepairPlan;
  readonly directiveFrameId: string;
  readonly evidence: AnimationMotionEvidenceManifest;
  readonly lineage: AnimationMotionEvidenceLineage;
  readonly originalRequest: NormalizedProviderCandidateRequest;
  readonly candidateCount?: number;
}

export interface AnimationAnatomyRepairProviderCompilation {
  readonly kind: typeof ANIMATION_ANATOMY_REPAIR_PROVIDER_KIND;
  readonly version: typeof ANIMATION_ANATOMY_REPAIR_PROVIDER_VERSION;
  readonly sequenceId: string;
  readonly frameId: string;
  readonly segmentIds: readonly string[];
  readonly candidateArtifactId: string;
  readonly candidateContentSha256: string;
  readonly originalProviderRequestSha256: string;
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
  throw new Error(`Animation anatomy repair provider compile failed: ${message}`);
}

export function compileAnimationAnatomyRepairProviderRequest(
  input: AnimationAnatomyRepairProviderCompileRequest,
): AnimationAnatomyRepairProviderCompilation {
  if (!input || typeof input !== "object") fail("input must be an object.");
  if (
    input.repairPlan.kind !== ANIMATION_ANATOMY_REPAIR_PLAN_KIND ||
    input.repairPlan.version !== ANIMATION_ANATOMY_REPAIR_PLAN_VERSION
  ) {
    fail("repairPlan is not a supported anatomy repair plan.");
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

  const directives = input.repairPlan.directives.filter(
    (entry) => entry.frameId === input.directiveFrameId,
  );
  if (directives.length !== 1) {
    fail(`directiveFrameId ${input.directiveFrameId} must identify exactly one anatomy repair directive.`);
  }
  const directive = directives[0]!;
  const evidenceFrame = input.evidence.frames.find((frame) => frame.frameId === directive.frameId);
  const lineageFrame = input.lineage.frames.find((frame) => frame.frameId === directive.frameId);
  if (!evidenceFrame || !lineageFrame) {
    fail(`repair frame ${directive.frameId} is missing from retained evidence lineage.`);
  }
  if (
    evidenceFrame.frameArtifactId !== lineageFrame.frameArtifactId ||
    evidenceFrame.frameContentSha256 !== lineageFrame.frameContentSha256
  ) {
    fail("candidate identity differs between evidence and lineage.");
  }

  const original = validateProviderCandidateRequest(input.originalRequest);
  const originalSha256 = providerRequestSha256(original);
  if (lineageFrame.providerRequestSha256 !== originalSha256) {
    fail("original provider request hash differs from retained frame lineage.");
  }
  if (
    original.assetKind !== "sprite-frame" ||
    original.frameId !== directive.frameId ||
    original.candidateFamilyId !== input.repairPlan.sequenceId
  ) {
    fail("original provider request does not identify the anatomy-repair target frame.");
  }
  const metadata = original.metadata;
  const planSha256 =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).animationDirectorPlanSha256
      : undefined;
  if (
    typeof planSha256 !== "string" ||
    planSha256 !== input.lineage.animationDirectorPlanSha256
  ) {
    fail("original provider request and retained lineage use different Director plans.");
  }

  const candidateCount = input.candidateCount ?? 1;
  if (!Number.isInteger(candidateCount) || candidateCount < 1 || candidateCount > 2) {
    fail("candidateCount must be an integer from 1 to 2 for targeted anatomy repair.");
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
    artifactId: evidenceFrame.frameArtifactId as `artifact_${string}`,
    role: "base-image",
    required: true,
    strength: 1,
    note: `Exact candidate for anatomy repair of ${directive.frameId}.`,
  });

  const repairRequest = validateProviderCandidateRequest({
    schemaVersion: "1.0",
    requestId: `${original.requestId}:anatomy-repair`,
    operation: "edit",
    assetKind: "sprite-frame",
    continuityPhase: "repair",
    assetId: original.assetId,
    candidateFamilyId: original.candidateFamilyId,
    frameId: directive.frameId,
    creativeIntent: [
      `Repair only the declared anatomy-proportion defects in ${directive.frameId}.`,
      ...directive.correct,
      `Preserve: ${directive.preserve.join("; ")}.`,
      "Keep the authored gesture, joint direction and motion phase; correct proportion drift without making the pose stiff or generic.",
    ].join(" "),
    negativeIntent: [
      original.negativeIntent ?? "",
      "Do not change the root trajectory, planted contacts, pose timing, silhouette intent, costume, props, palette, lighting, camera, pivot, baseline or transparency policy beyond what is necessary to restore the named segment proportions.",
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
      failedCandidateArtifactId: evidenceFrame.frameArtifactId,
      failedCandidateContentSha256: evidenceFrame.frameContentSha256,
      repairPlanVersion: input.repairPlan.version,
      repairedFrameId: directive.frameId,
      anatomySegmentIds: directive.segmentIds,
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
    kind: ANIMATION_ANATOMY_REPAIR_PROVIDER_KIND,
    version: ANIMATION_ANATOMY_REPAIR_PROVIDER_VERSION,
    sequenceId: input.repairPlan.sequenceId,
    frameId: directive.frameId,
    segmentIds: directive.segmentIds,
    candidateArtifactId: evidenceFrame.frameArtifactId,
    candidateContentSha256: evidenceFrame.frameContentSha256,
    originalProviderRequestSha256: originalSha256,
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
