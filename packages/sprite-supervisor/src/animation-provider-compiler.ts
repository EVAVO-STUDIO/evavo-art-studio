import {
  normalizeJson,
  sha256,
  stableStringify,
  type ArtifactId,
} from "@evavo/art-artifacts";
import {
  compileAnimationDirectorPlan,
  type AnimationDirectorPlan,
  type AnimationFramePlan,
  type AnimationGenerationBatch,
} from "@evavo/art-direction";
import {
  validateProviderCandidateRequest,
  type NormalizedProviderCandidateRequest,
  type ProviderBackgroundStrategy,
  type ProviderCandidateQuality,
  type ProviderCandidateRequestInput,
  type ProviderCandidateReferenceInput,
  type ProviderStyleEnvelopeInput,
} from "@evavo/art-providers";

export const ANIMATION_PROVIDER_COMPILER_VERSION = "2026-08-25.3" as const;

export interface AnimationProviderBatchCompileRequest {
  readonly plan: AnimationDirectorPlan;
  readonly batchId: string;
  readonly poseControlArtifactIds: Readonly<Record<string, ArtifactId>>;
  readonly keyPoseArtifactIds?: Readonly<Record<string, ArtifactId>>;
  readonly style: ProviderStyleEnvelopeInput;
  readonly background: Readonly<{
    strategy: ProviderBackgroundStrategy;
    matteColour?: string;
  }>;
  readonly quality?: ProviderCandidateQuality;
  readonly candidateCount?: number;
  readonly selection?: ProviderCandidateRequestInput["selection"];
}

export interface AnimationProviderBatchCompilation {
  readonly schemaVersion: "1.0";
  readonly compilerVersion: typeof ANIMATION_PROVIDER_COMPILER_VERSION;
  readonly planProtocolVersion: AnimationDirectorPlan["protocolVersion"];
  readonly planSha256: string;
  readonly clipId: string;
  readonly batchId: string;
  readonly phase: AnimationGenerationBatch["phase"];
  readonly requests: readonly NormalizedProviderCandidateRequest[];
  readonly authority: Readonly<{
    providerExecution: false;
    runtimeSubmission: false;
    creativeApproval: false;
    artifactPromotion: false;
    repositoryMutation: false;
    publication: false;
  }>;
}

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;

function fail(message: string): never {
  throw new Error(`Animation provider compile failed: ${message}`);
}

function artifactId(value: unknown, field: string): ArtifactId {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) {
    fail(`${field} must be a canonical artifact_[64 lowercase hex] id.`);
  }
  return value as ArtifactId;
}

function canonicalJson(value: unknown): string {
  try {
    return stableStringify(normalizeJson(value));
  } catch (error: unknown) {
    fail(
      `value must be canonical JSON data: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function verifiedPlan(input: AnimationDirectorPlan): AnimationDirectorPlan {
  if (!input || typeof input !== "object") {
    fail("plan must be an Animation Director plan object.");
  }
  let canonical: AnimationDirectorPlan;
  try {
    canonical = compileAnimationDirectorPlan({
      clipId: input.clipId,
      subjectId: input.subjectId,
      action: input.action,
      direction: input.direction,
      motionStyle: input.motionStyle,
      fps: input.fps,
      canvas: input.canvas,
      canonicalIdentityArtifactId: input.canonicalIdentityArtifactId,
      ...(input.directionMasterArtifactId
        ? { directionMasterArtifactId: input.directionMasterArtifactId }
        : {}),
      loop: input.loop,
    });
  } catch (error: unknown) {
    fail(
      `plan cannot be canonically recompiled: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (canonicalJson(input) !== canonicalJson(canonical)) {
    fail("plan does not match the canonical Animation Director compilation.");
  }
  return canonical;
}

function findBatch(
  plan: AnimationDirectorPlan,
  batchId: string,
): AnimationGenerationBatch {
  if (typeof batchId !== "string" || !batchId.trim()) {
    fail("batchId must be non-empty.");
  }
  const matches = plan.generationBatches.filter((batch) => batch.id === batchId);
  if (matches.length !== 1) {
    fail(`batchId ${batchId} must identify exactly one animation generation batch.`);
  }
  return matches[0]!;
}

function framePlan(plan: AnimationDirectorPlan, frameNumber: number): AnimationFramePlan {
  const matches = plan.frames.filter((frame) => frame.frame === frameNumber);
  if (matches.length !== 1) {
    fail(`frame ${frameNumber} must identify exactly one animation frame plan.`);
  }
  return matches[0]!;
}

function candidateCount(
  requested: number | undefined,
  maximum: number,
): number {
  const value = requested ?? maximum;
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    fail(`candidateCount must be an integer from 1 to ${maximum} for this batch.`);
  }
  return value;
}

function temporalReferences(
  batch: AnimationGenerationBatch,
  keyPoseArtifactIds: Readonly<Record<string, ArtifactId>> | undefined,
): readonly ProviderCandidateReferenceInput[] {
  if (batch.phase !== "in-between") return [];
  if (batch.dependsOnFrames.length !== 2) {
    fail(`in-between batch ${batch.id} must declare exactly two key-pose dependencies.`);
  }
  if (!keyPoseArtifactIds) {
    fail(`in-between batch ${batch.id} requires retained keyPoseArtifactIds.`);
  }
  const previousFrame = batch.dependsOnFrames[0]!;
  const nextFrame = batch.dependsOnFrames[1]!;
  return [
    {
      artifactId: artifactId(
        keyPoseArtifactIds[String(previousFrame)],
        `keyPoseArtifactIds.${previousFrame}`,
      ),
      role: "previous-key-pose",
      required: true,
      strength: 1,
      note: `Retained key pose frame ${previousFrame} for ${batch.id}.`,
    },
    {
      artifactId: artifactId(
        keyPoseArtifactIds[String(nextFrame)],
        `keyPoseArtifactIds.${nextFrame}`,
      ),
      role: "next-key-pose",
      required: true,
      strength: 1,
      note: `Retained key pose frame ${nextFrame} for ${batch.id}.`,
    },
  ];
}

function referencesForFrame(
  plan: AnimationDirectorPlan,
  batch: AnimationGenerationBatch,
  frame: AnimationFramePlan,
  request: AnimationProviderBatchCompileRequest,
): readonly ProviderCandidateReferenceInput[] {
  const references: ProviderCandidateReferenceInput[] = [
    {
      artifactId: artifactId(
        plan.canonicalIdentityArtifactId,
        "plan.canonicalIdentityArtifactId",
      ),
      role: "canonical-identity",
      required: true,
      strength: 1,
      note: `Canonical identity for ${plan.subjectId}.`,
    },
  ];

  if (plan.directionMasterArtifactId) {
    references.push({
      artifactId: artifactId(
        plan.directionMasterArtifactId,
        "plan.directionMasterArtifactId",
      ),
      role: "direction-master",
      required: true,
      strength: 1,
      note: `Direction master for ${plan.direction}.`,
    });
  }

  const poseArtifact = artifactId(
    request.poseControlArtifactIds[String(frame.frame)],
    `poseControlArtifactIds.${frame.frame}`,
  );
  references.push({
    artifactId: poseArtifact,
    role: "pose-control",
    required: true,
    strength: 1,
    note: `Structural pose control for ${plan.clipId} frame ${frame.frame} (${frame.role}).`,
  });

  references.push(...temporalReferences(batch, request.keyPoseArtifactIds));
  return references;
}

function requestForFrame(
  plan: AnimationDirectorPlan,
  planSha256: string,
  batch: AnimationGenerationBatch,
  frame: AnimationFramePlan,
  request: AnimationProviderBatchCompileRequest,
  count: number,
): NormalizedProviderCandidateRequest {
  const frameId = `${plan.clipId}:f${String(frame.frame).padStart(3, "0")}`;
  const intent = [
    `Render exactly one ${plan.subjectId} sprite animation drawing for ${plan.action}.`,
    `This is frame ${frame.frame} of ${plan.frames.length}, role ${frame.role}, facing ${plan.direction}.`,
    `Preserve canonical identity, proportions, costume, camera, canvas, pivot and baseline.`,
    frame.groundContactRequired
      ? `Preserve ${frame.plantedFoot} foot contact using landmark ${frame.plantedLandmarkId ?? "none"}.`
      : "No planted-foot constraint is declared for this drawing.",
    batch.phase === "in-between"
      ? "Respect both retained neighbouring key poses; do not redesign the action or invent a new motion path."
      : "Establish the authored key pose clearly and readably; do not generate a sprite sheet or multiple poses.",
  ].join(" ");

  const providerInput: ProviderCandidateRequestInput = {
    schemaVersion: "1.0",
    requestId: `${frameId}:${batch.phase}`,
    operation: "generate",
    assetKind: "sprite-frame",
    continuityPhase: batch.phase,
    assetId: frameId,
    candidateFamilyId: plan.clipId,
    frameId,
    creativeIntent: intent,
    negativeIntent:
      "No contact sheet, sprite sheet, storyboard, multiple poses, scenery, readable text, camera drift, identity drift, proportion drift, costume drift, cropped anatomy, fake transparency grid or arbitrary lighting change.",
    style: request.style,
    shot: {
      subject: plan.subjectId,
      action: `${plan.action}:${frame.role}`,
      direction: plan.direction,
      include: [
        "exactly one complete sprite drawing",
        `frame role ${frame.role}`,
        `planted foot ${frame.plantedFoot}`,
        "stable camera, pivot and baseline",
      ],
      exclude: [
        "additional characters or duplicate subject poses",
        "background scenery",
        "contact sheets or animation strips",
        "readable generated text",
      ],
      separateAssets: [],
      framing: [
        `exact ${plan.canvas.width}x${plan.canvas.height} source canvas`,
        "preserve safe uncropped silhouette and ground contact",
      ],
    },
    target: {
      width: plan.canvas.width,
      height: plan.canvas.height,
      transparency: "required",
      outputFormat: "png",
    },
    sourceCanvas: {
      width: plan.canvas.width,
      height: plan.canvas.height,
    },
    background: request.background,
    quality: request.quality ?? "high",
    candidateCount: count,
    references: referencesForFrame(plan, batch, frame, request),
    ...(request.selection ? { selection: request.selection } : {}),
    metadata: {
      animationDirectorProtocolVersion: plan.protocolVersion,
      animationDirectorPlanSha256: planSha256,
      animationProviderCompilerVersion: ANIMATION_PROVIDER_COMPILER_VERSION,
      clipId: plan.clipId,
      batchId: batch.id,
      phase: batch.phase,
      frame: frame.frame,
      frameRole: frame.role,
      framePhase: frame.phase,
      timing: {
        numeratorMs: frame.duration.numeratorMs,
        denominator: frame.duration.denominator,
      },
      plantedFoot: frame.plantedFoot,
      plantedLandmarkId: frame.plantedLandmarkId,
      requiredLandmarkIds: plan.qualityRequirements.requiredLandmarkIds,
      loopClosureLandmarkIds: plan.qualityRequirements.loopClosureLandmarkIds,
      authority: {
        providerExecution: false,
        runtimeSubmission: false,
        creativeApproval: false,
        artifactPromotion: false,
        repositoryMutation: false,
        publication: false,
      },
    },
  };

  return validateProviderCandidateRequest(providerInput);
}

export function compileAnimationProviderBatch(
  request: AnimationProviderBatchCompileRequest,
): AnimationProviderBatchCompilation {
  if (!request || typeof request !== "object") {
    fail("request must be an object.");
  }
  const plan = verifiedPlan(request.plan);
  const planSha256 = sha256(canonicalJson(plan));
  const batch = findBatch(plan, request.batchId);
  const count = candidateCount(request.candidateCount, batch.maximumCandidatesPerFrame);
  const requests = batch.frames.map((frameNumber) =>
    requestForFrame(
      plan,
      planSha256,
      batch,
      framePlan(plan, frameNumber),
      request,
      count,
    ),
  );

  return {
    schemaVersion: "1.0",
    compilerVersion: ANIMATION_PROVIDER_COMPILER_VERSION,
    planProtocolVersion: plan.protocolVersion,
    planSha256,
    clipId: plan.clipId,
    batchId: batch.id,
    phase: batch.phase,
    requests,
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
