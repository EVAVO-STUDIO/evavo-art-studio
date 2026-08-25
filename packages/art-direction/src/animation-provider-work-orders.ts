import {
  ANIMATION_DIRECTOR_PLAN_KIND,
  ANIMATION_DIRECTOR_PROTOCOL_VERSION,
  compileAnimationDirectorPlan,
  type AnimationArtifactId,
  type AnimationDirectorPlan,
  type AnimationFramePlan,
  type AnimationGenerationBatch,
} from "./animation-director.js";
import { artDirectionSha256 } from "./validation.js";

export const ANIMATION_PROVIDER_REQUEST_BATCH_KIND =
  "evavo.animation-director.provider-request-batch" as const;
export const ANIMATION_PROVIDER_REQUEST_BATCH_VERSION = "2026-08-25.1" as const;

export type AnimationProviderReferenceRole =
  | "canonical-identity"
  | "direction-master"
  | "previous-key-pose"
  | "next-key-pose"
  | "pose-control";

export interface AnimationFrameArtifactBinding {
  readonly frame: number;
  readonly artifactId: AnimationArtifactId;
}

export interface AnimationGenerationBindings {
  readonly poseControls: readonly AnimationFrameArtifactBinding[];
  readonly approvedFrames?: readonly AnimationFrameArtifactBinding[];
}

export interface AnimationProviderReference {
  readonly artifactId: AnimationArtifactId;
  readonly role: AnimationProviderReferenceRole;
  readonly required: true;
  readonly note: string;
}

export interface AnimationProviderCandidateRequest {
  readonly schemaVersion: "1.0";
  readonly operation: "generate";
  readonly assetKind: "sprite-frame";
  readonly continuityPhase: "key-pose" | "in-between";
  readonly assetId: string;
  readonly candidateFamilyId: string;
  readonly frameId: string;
  readonly creativeIntent: string;
  readonly negativeIntent: string;
  readonly style: Readonly<{
    styleName: string;
    intent: string;
    mustHave: readonly string[];
    mustAvoid: readonly string[];
    identityLocks: readonly string[];
    palette: readonly string[];
    lineTreatment: readonly string[];
    materials: readonly string[];
    cameraRules: readonly string[];
    compositionRules: readonly string[];
    eraRules: readonly string[];
  }>;
  readonly shot: Readonly<{
    subject: string;
    action: "walk";
    direction: string;
    include: readonly string[];
    exclude: readonly string[];
    separateAssets: readonly string[];
    framing: readonly string[];
  }>;
  readonly target: Readonly<{
    width: number;
    height: number;
    transparency: "required";
    outputFormat: "png";
  }>;
  readonly background: Readonly<{
    strategy: "provider-auto";
  }>;
  readonly quality: "high";
  readonly candidateCount: number;
  readonly references: readonly AnimationProviderReference[];
  readonly metadata: Readonly<{
    animationDirectorProtocolVersion: string;
    animationDirectorPlanSha256: string;
    animationBatchId: string;
    animationFrame: number;
    animationFrameRole: string;
    animationPhase: number;
    plantedFoot: string;
    plantedLandmarkId: string | null;
    groundContactRequired: boolean;
  }>;
}

export interface AnimationProviderRequestBatch {
  readonly kind: typeof ANIMATION_PROVIDER_REQUEST_BATCH_KIND;
  readonly version: typeof ANIMATION_PROVIDER_REQUEST_BATCH_VERSION;
  readonly animationDirectorPlanSha256: string;
  readonly batchId: string;
  readonly phase: "key-pose" | "in-between";
  readonly dependsOnFrames: readonly number[];
  readonly requests: readonly AnimationProviderCandidateRequest[];
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
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function canonicalArtifactId(value: unknown, field: string): AnimationArtifactId {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) {
    throw new Error(`${field} must use artifact_<sha256> format`);
  }
  return value as AnimationArtifactId;
}

function safeProviderId(value: string, field: string): string {
  if (!SAFE_ID.test(value)) {
    throw new Error(`${field} must be provider-safe`);
  }
  return value;
}

function canonicalPlan(plan: AnimationDirectorPlan): AnimationDirectorPlan {
  if (!plan || typeof plan !== "object") {
    throw new Error("animation director plan must be an object");
  }
  if (
    plan.kind !== ANIMATION_DIRECTOR_PLAN_KIND ||
    plan.protocolVersion !== ANIMATION_DIRECTOR_PROTOCOL_VERSION
  ) {
    throw new Error("animation director plan kind or protocol version is unsupported");
  }
  const rebuilt = compileAnimationDirectorPlan({
    clipId: plan.clipId,
    subjectId: plan.subjectId,
    action: plan.action,
    direction: plan.direction,
    motionStyle: plan.motionStyle,
    fps: plan.fps,
    canvas: plan.canvas,
    canonicalIdentityArtifactId: plan.canonicalIdentityArtifactId,
    ...(plan.directionMasterArtifactId
      ? { directionMasterArtifactId: plan.directionMasterArtifactId }
      : {}),
    loop: plan.loop,
  });
  if (artDirectionSha256(rebuilt) !== artDirectionSha256(plan)) {
    throw new Error("animation director plan is not canonical or was mutated after compilation");
  }
  return rebuilt;
}

function bindingMap(
  values: readonly AnimationFrameArtifactBinding[] | undefined,
  field: string,
): ReadonlyMap<number, AnimationArtifactId> {
  const result = new Map<number, AnimationArtifactId>();
  for (const [index, entry] of (values ?? []).entries()) {
    if (!entry || typeof entry !== "object") {
      throw new Error(`${field}[${index}] must be an object`);
    }
    if (!Number.isInteger(entry.frame) || entry.frame < 1 || entry.frame > 8) {
      throw new Error(`${field}[${index}].frame must be an integer from 1 to 8`);
    }
    if (result.has(entry.frame)) {
      throw new Error(`${field} contains duplicate frame ${entry.frame}`);
    }
    result.set(
      entry.frame,
      canonicalArtifactId(entry.artifactId, `${field}[${index}].artifactId`),
    );
  }
  return result;
}

function frameByNumber(plan: AnimationDirectorPlan, frame: number): AnimationFramePlan {
  const value = plan.frames.find((entry) => entry.frame === frame);
  if (!value) throw new Error(`animation frame ${frame} is missing from canonical plan`);
  return value;
}

function batchById(plan: AnimationDirectorPlan, batchId: string): AnimationGenerationBatch {
  const value = plan.generationBatches.find((entry) => entry.id === batchId);
  if (!value) throw new Error(`animation generation batch ${batchId} is not in the plan`);
  return value;
}

function frameId(frame: number): string {
  return `frame-${String(frame).padStart(3, "0")}`;
}

function temporalReferences(
  batch: AnimationGenerationBatch,
  approvedFrames: ReadonlyMap<number, AnimationArtifactId>,
): readonly AnimationProviderReference[] {
  if (batch.phase === "key-pose") return [];
  if (batch.dependsOnFrames.length !== 2) {
    throw new Error(`in-between batch ${batch.id} must depend on exactly two key poses`);
  }
  const previousFrame = batch.dependsOnFrames[0]!;
  const nextFrame = batch.dependsOnFrames[1]!;
  const previous = approvedFrames.get(previousFrame);
  const next = approvedFrames.get(nextFrame);
  if (!previous || !next) {
    throw new Error(
      `in-between batch ${batch.id} requires approved key-pose artifacts for frames ${previousFrame} and ${nextFrame}`,
    );
  }
  return [
    {
      artifactId: previous,
      role: "previous-key-pose",
      required: true,
      note: `Approved key pose at animation frame ${previousFrame}.`,
    },
    {
      artifactId: next,
      role: "next-key-pose",
      required: true,
      note: `Approved key pose at animation frame ${nextFrame}.`,
    },
  ];
}

function requestForFrame(
  plan: AnimationDirectorPlan,
  planSha256: string,
  batch: AnimationGenerationBatch,
  frame: AnimationFramePlan,
  poseControlArtifactId: AnimationArtifactId,
  approvedFrames: ReadonlyMap<number, AnimationArtifactId>,
): AnimationProviderCandidateRequest {
  const references: AnimationProviderReference[] = [
    {
      artifactId: plan.canonicalIdentityArtifactId,
      role: "canonical-identity",
      required: true,
      note: "Canonical identity lock for every animation drawing.",
    },
  ];
  if (plan.directionMasterArtifactId) {
    references.push({
      artifactId: plan.directionMasterArtifactId,
      role: "direction-master",
      required: true,
      note: `Approved ${plan.direction} direction master.`,
    });
  }
  references.push(...temporalReferences(batch, approvedFrames));
  references.push({
    artifactId: poseControlArtifactId,
    role: "pose-control",
    required: true,
    note: `Structural pose control for ${frame.role} drawing at frame ${frame.frame}.`,
  });

  return {
    schemaVersion: "1.0",
    operation: "generate",
    assetKind: "sprite-frame",
    continuityPhase: batch.phase,
    assetId: safeProviderId(plan.subjectId, "subjectId"),
    candidateFamilyId: safeProviderId(plan.clipId, "clipId"),
    frameId: frameId(frame.frame),
    creativeIntent:
      `Create the authored ${frame.role} drawing for ${plan.subjectId}'s ${plan.direction}-facing walk cycle. ` +
      `Match the supplied pose control while preserving the canonical identity, exact camera, canvas, baseline, pivot and art direction. ` +
      `The planted ${frame.plantedFoot} foot must read as weight-bearing and remain stable against the ground line.`,
    negativeIntent:
      "No identity drift, costume drift, camera drift, scale pumping, foot sliding, anatomy mutation, invented props, painted checkerboards, scenery, labels, contact sheets or multi-frame output.",
    style: {
      styleName: `evavo-${plan.motionStyle}`,
      intent: `Preserve the approved ${plan.motionStyle} animation language across the complete clip rather than redesigning this frame independently.`,
      mustHave: [
        "one complete sprite drawing only",
        "clear readable silhouette",
        "exact canvas and camera continuity",
        "stable pivot and baseline",
        "pose-control conformance",
      ],
      mustAvoid: [
        "identity drift",
        "proportion drift",
        "camera drift",
        "lighting or palette flicker",
        "foot sliding",
        "painted transparency grids",
      ],
      identityLocks: [
        `subject:${plan.subjectId}`,
        `canonical-artifact:${plan.canonicalIdentityArtifactId}`,
      ],
      palette: [],
      lineTreatment: [],
      materials: [],
      cameraRules: [
        `direction:${plan.direction}`,
        "do not alter camera projection or framing between drawings",
      ],
      compositionRules: [
        "preserve pivot, baseline and ground-contact topology",
        "keep the complete subject inside the canvas",
      ],
      eraRules: [],
    },
    shot: {
      subject: plan.subjectId,
      action: "walk",
      direction: plan.direction,
      include: [
        `${frame.role} walk pose`,
        `${frame.plantedFoot} foot ground contact`,
      ],
      exclude: ["background scenery", "text", "additional characters"],
      separateAssets: [],
      framing: ["match the canonical sprite framing exactly"],
    },
    target: {
      width: plan.canvas.width,
      height: plan.canvas.height,
      transparency: "required",
      outputFormat: "png",
    },
    background: { strategy: "provider-auto" },
    quality: "high",
    candidateCount: batch.maximumCandidatesPerFrame,
    references,
    metadata: {
      animationDirectorProtocolVersion: plan.protocolVersion,
      animationDirectorPlanSha256: planSha256,
      animationBatchId: batch.id,
      animationFrame: frame.frame,
      animationFrameRole: frame.role,
      animationPhase: frame.phase,
      plantedFoot: frame.plantedFoot,
      plantedLandmarkId: frame.plantedLandmarkId,
      groundContactRequired: frame.groundContactRequired,
    },
  };
}

export function compileAnimationProviderRequestBatch(
  submittedPlan: AnimationDirectorPlan,
  batchId: string,
  bindings: AnimationGenerationBindings,
): AnimationProviderRequestBatch {
  const plan = canonicalPlan(submittedPlan);
  if (plan.canvas.width > 8_192 || plan.canvas.height > 8_192) {
    throw new Error("animation provider targets cannot exceed 8192 pixels per dimension");
  }
  const batch = batchById(plan, batchId);
  const poseControls = bindingMap(bindings?.poseControls, "poseControls");
  const approvedFrames = bindingMap(bindings?.approvedFrames, "approvedFrames");
  const planSha256 = artDirectionSha256(plan);

  const requests = batch.frames.map((number) => {
    const poseControl = poseControls.get(number);
    if (!poseControl) {
      throw new Error(`animation frame ${number} requires an exact pose-control artifact`);
    }
    return requestForFrame(
      plan,
      planSha256,
      batch,
      frameByNumber(plan, number),
      poseControl,
      approvedFrames,
    );
  });

  return {
    kind: ANIMATION_PROVIDER_REQUEST_BATCH_KIND,
    version: ANIMATION_PROVIDER_REQUEST_BATCH_VERSION,
    animationDirectorPlanSha256: planSha256,
    batchId: batch.id,
    phase: batch.phase,
    dependsOnFrames: [...batch.dependsOnFrames],
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
