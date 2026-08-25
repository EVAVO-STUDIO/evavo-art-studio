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
  ANIMATION_MOTION_REPAIR_PLAN_KIND,
  ANIMATION_MOTION_REPAIR_PLAN_VERSION,
  type AnimationMotionRepairDirective,
  type AnimationMotionRepairPlan,
} from "./animation-motion-repair.js";

export const ANIMATION_MOTION_REPAIR_PROVIDER_VERSION = "2026-08-25.1" as const;
export const ANIMATION_MOTION_REPAIR_PROVIDER_KIND =
  "evavo.animation-motion.repair-provider-request" as const;

export interface AnimationMotionRepairProviderCompileRequest {
  readonly repairPlan: AnimationMotionRepairPlan;
  readonly directiveFrameId: string;
  readonly evidence: AnimationMotionEvidenceManifest;
  readonly lineage: AnimationMotionEvidenceLineage;
  readonly originalRequest: NormalizedProviderCandidateRequest;
  readonly candidateCount?: number;
}

export interface AnimationMotionRepairProviderCompilation {
  readonly kind: typeof ANIMATION_MOTION_REPAIR_PROVIDER_KIND;
  readonly version: typeof ANIMATION_MOTION_REPAIR_PROVIDER_VERSION;
  readonly sequenceId: string;
  readonly frameId: string;
  readonly originalProviderRequestSha256: string;
  readonly candidateArtifactId: string;
  readonly candidateContentSha256: string;
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

const SHA256 = /^[a-f0-9]{64}$/;

function fail(message: string): never {
  throw new Error(`Animation motion repair provider compile failed: ${message}`);
}

function sha(value: unknown, field: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${field} must be 64 lowercase hexadecimal characters.`);
  }
  return value;
}

function directive(
  plan: AnimationMotionRepairPlan,
  frameId: string,
): AnimationMotionRepairDirective {
  const matches = plan.directives.filter((entry) => entry.frameId === frameId);
  if (matches.length !== 1) {
    fail(`directiveFrameId ${frameId} must identify exactly one repair directive.`);
  }
  return matches[0]!;
}

function resolveFrameId(
  directiveFrameId: string,
  evidence: AnimationMotionEvidenceManifest,
): string {
  if (directiveFrameId === "__loop-start__") {
    return evidence.frames[0]!.frameId;
  }
  if (directiveFrameId === "__loop-end__") {
    return evidence.frames[evidence.frames.length - 1]!.frameId;
  }
  return directiveFrameId;
}

function metadataPlanSha256(request: NormalizedProviderCandidateRequest): string {
  const metadata = request.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    fail("original provider request metadata must retain animation lineage.");
  }
  return sha(
    (metadata as Record<string, unknown>).animationDirectorPlanSha256,
    "originalRequest.metadata.animationDirectorPlanSha256",
  );
}

export function compileAnimationMotionRepairProviderRequest(
  input: AnimationMotionRepairProviderCompileRequest,
): AnimationMotionRepairProviderCompilation {
  if (!input || typeof input !== "object") fail("input must be an object.");
  if (
    input.repairPlan.kind !== ANIMATION_MOTION_REPAIR_PLAN_KIND ||
    input.repairPlan.version !== ANIMATION_MOTION_REPAIR_PLAN_VERSION ||
    input.repairPlan.motionReportPassed !== false
  ) {
    fail("repairPlan is not a supported failed-motion repair plan.");
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

  const requestedDirective = directive(input.repairPlan, input.directiveFrameId);
  const frameId = resolveFrameId(requestedDirective.frameId, input.evidence);
  const evidenceFrame = input.evidence.frames.find((frame) => frame.frameId === frameId);
  const lineageFrame = input.lineage.frames.find((frame) => frame.frameId === frameId);
  if (!evidenceFrame || !lineageFrame) {
    fail(`resolved repair frame ${frameId} is missing from evidence lineage.`);
  }
  if (
    lineageFrame.frameArtifactId !== evidenceFrame.frameArtifactId ||
    lineageFrame.frameContentSha256 !== evidenceFrame.frameContentSha256
  ) {
    fail(`candidate identity differs between evidence and lineage for ${frameId}.`);
  }

  const original = validateProviderCandidateRequest(input.originalRequest);
  const originalSha256 = providerRequestSha256(original);
  if (lineageFrame.providerRequestSha256 !== originalSha256) {
    fail(`original provider request hash differs from retained lineage for ${frameId}.`);
  }
  if (
    original.assetKind !== "sprite-frame" ||
    original.frameId !== frameId ||
    original.candidateFamilyId !== input.repairPlan.sequenceId
  ) {
    fail("original provider request does not identify the repaired animation frame.");
  }
  const planSha256 = metadataPlanSha256(original);
  if (input.lineage.animationDirectorPlanSha256 !== planSha256) {
    fail("original provider request and motion lineage use different Director plans.");
  }

  const candidateCount = input.candidateCount ?? 1;
  if (!Number.isInteger(candidateCount) || candidateCount < 1 || candidateCount > 2) {
    fail("candidateCount must be an integer from 1 to 2 for targeted repair.");
  }

  const retainedReferences: ProviderCandidateReferenceInput[] = original.references
    .filter((reference) => reference.role !== "base-image" && reference.role !== "mask")
    .map((reference) => ({
      artifactId: reference.artifactId,
      role: reference.role,
      strength: reference.strength,
      required: reference.required,
      ...(reference.note ? { note: reference.note } : {}),
    }));
  retainedReferences.push({
    artifactId: evidenceFrame.frameArtifactId as `artifact_${string}`,
    role: "base-image",
    strength: 1,
    required: true,
    note: `Exact failed candidate for targeted motion repair of ${frameId}.`,
  });

  const repairRequest = validateProviderCandidateRequest({
    schemaVersion: "1.0",
    requestId: `${original.requestId}:motion-repair`,
    operation: "edit",
    assetKind: "sprite-frame",
    continuityPhase: "repair",
    assetId: original.assetId,
    candidateFamilyId: original.candidateFamilyId,
    frameId,
    creativeIntent: [
      `Repair only ${frameId} in animation ${input.repairPlan.sequenceId}.`,
      ...requestedDirective.correct,
      `Preserve: ${requestedDirective.preserve.join("; ")}.`,
      "Return one corrected drawing on the exact original canvas; do not redesign the action.",
    ].join(" "),
    negativeIntent: [
      original.negativeIntent ?? "",
      "Do not change unaffected anatomy, costume, equipment, camera, pivot, baseline, neighbouring pose topology, palette or transparency policy.",
    ]
      .filter(Boolean)
      .join(" "),
    style: original.style,
    shot: original.shot,
    target: original.target,
    ...(original.sourceCanvas ? { sourceCanvas: original.sourceCanvas } : {}),
    background: original.background,
    quality: "high",
    candidateCount,
    references: retainedReferences,
    selection: original.selection,
    metadata: {
      animationDirectorPlanSha256: planSha256,
      animationProviderCompilerVersion: input.lineage.animationProviderCompilerVersion,
      motionEvidenceManifestSha256: input.evidence.manifestSha256,
      motionEvidenceLineageSha256: input.lineage.lineageSha256,
      originalProviderRequestSha256: originalSha256,
      failedCandidateArtifactId: evidenceFrame.frameArtifactId,
      failedCandidateContentSha256: evidenceFrame.frameContentSha256,
      repairPlanVersion: input.repairPlan.version,
      repairDirectiveFrameId: requestedDirective.frameId,
      repairedFrameId: frameId,
      repairReasons: requestedDirective.reasons,
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
    kind: ANIMATION_MOTION_REPAIR_PROVIDER_KIND,
    version: ANIMATION_MOTION_REPAIR_PROVIDER_VERSION,
    sequenceId: input.repairPlan.sequenceId,
    frameId,
    originalProviderRequestSha256: originalSha256,
    candidateArtifactId: evidenceFrame.frameArtifactId,
    candidateContentSha256: evidenceFrame.frameContentSha256,
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
