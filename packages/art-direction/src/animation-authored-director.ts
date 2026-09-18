import {
  ANIMATION_MOTION_STYLES,
  type AnimationArtifactId,
  type AnimationMotionStyle,
} from "./animation-director.js";

export const AUTHORED_ANIMATION_DIRECTOR_PROTOCOL_VERSION =
  "2026-09-18.1" as const;
export const AUTHORED_ANIMATION_DIRECTOR_PLAN_KIND =
  "evavo.animation-director.authored-plan" as const;

export interface AuthoredAnimationDurationInput {
  readonly numeratorMs: number;
  readonly denominator: number;
}

export interface AuthoredAnimationFrameInput {
  readonly role: string;
  readonly keyPose: boolean;
  readonly duration?: AuthoredAnimationDurationInput;
  readonly groundContactRequired?: boolean;
  readonly contactLandmarkId?: string | null;
}

export interface AuthoredAnimationDirectorRequest {
  readonly clipId: string;
  readonly subjectId: string;
  readonly action: string;
  readonly direction: string;
  readonly motionStyle: AnimationMotionStyle;
  readonly fps?: number;
  readonly canvas: Readonly<{ width: number; height: number }>;
  readonly canonicalIdentityArtifactId: AnimationArtifactId;
  readonly directionMasterArtifactId?: AnimationArtifactId;
  readonly loop?: boolean;
  readonly frames: readonly AuthoredAnimationFrameInput[];
  readonly structure: Readonly<{
    rootLandmarkId: string;
    requiredLandmarkIds: readonly string[];
    loopClosureLandmarkIds?: readonly string[];
    maximumRootStepPixels?: number;
    loopClosureTolerancePixels?: number;
    contactDriftTolerancePixels?: number;
  }>;
}

export interface AuthoredAnimationFramePlan {
  readonly frame: number;
  readonly role: string;
  readonly phase: number;
  readonly duration: Readonly<{
    numeratorMs: number;
    denominator: number;
  }>;
  readonly keyPose: boolean;
  readonly plantedFoot: "left" | "right" | "none";
  readonly plantedLandmarkId: string | null;
  readonly groundContactRequired: boolean;
  readonly providerReferenceRoles: readonly (
    | "canonical-identity"
    | "direction-master"
    | "previous-key-pose"
    | "next-key-pose"
    | "pose-control"
  )[];
}

export interface AuthoredAnimationGenerationBatch {
  readonly id: string;
  readonly phase: "key-pose" | "in-between";
  readonly frames: readonly number[];
  readonly dependsOnFrames: readonly number[];
  readonly maximumCandidatesPerFrame: number;
}

export interface AuthoredAnimationDirectorPlan {
  readonly kind: typeof AUTHORED_ANIMATION_DIRECTOR_PLAN_KIND;
  readonly protocolVersion: typeof AUTHORED_ANIMATION_DIRECTOR_PROTOCOL_VERSION;
  readonly clipId: string;
  readonly subjectId: string;
  readonly action: string;
  readonly direction: string;
  readonly motionStyle: AnimationMotionStyle;
  readonly loop: boolean;
  readonly fps: number;
  readonly canvas: Readonly<{ width: number; height: number }>;
  readonly canonicalIdentityArtifactId: AnimationArtifactId;
  readonly directionMasterArtifactId?: AnimationArtifactId;
  readonly frames: readonly AuthoredAnimationFramePlan[];
  readonly generationBatches: readonly AuthoredAnimationGenerationBatch[];
  readonly qualityRequirements: Readonly<{
    identityLocked: true;
    pivotLocked: true;
    baselineLocked: true;
    cameraLocked: true;
    loopClosureRequired: boolean;
    plantedFootDriftTolerancePixels: number;
    rootLandmarkId: string;
    requiredLandmarkIds: readonly string[];
    loopClosureLandmarkIds: readonly string[];
    maximumRootStepPixels: number;
    loopClosureTolerancePixels: number;
    alphaRequired: true;
  }>;
  readonly authority: Readonly<{
    providerExecution: false;
    creativeApproval: false;
    artifactPromotion: false;
    repositoryMutation: false;
    publication: false;
  }>;
}

export type AnimationProductionPlan =
  | import("./animation-director.js").AnimationDirectorPlan
  | AuthoredAnimationDirectorPlan;

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MAX_PROVIDER_DIMENSION = 8_192;
const MAX_FRAMES = 64;

function fail(message: string): never {
  throw new Error("Authored animation director failed: " + message);
}

function safeId(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    !SAFE_ID.test(value) ||
    value.length > 128
  ) {
    fail(
      field +
        " must use 1 to 128 letters, digits, dots, underscores, colons or hyphens",
    );
  }
  return value;
}

function artifactId(value: unknown, field: string): AnimationArtifactId {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) {
    fail(field + " must be a canonical artifact_[64 lowercase hex] id");
  }
  return value as AnimationArtifactId;
}

function integer(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail(
      field +
        " must be an integer from " +
        minimum +
        " to " +
        maximum,
    );
  }
  return value;
}

function finite(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail(
      field +
        " must be a finite number from " +
        minimum +
        " to " +
        maximum,
    );
  }
  return value;
}

function motionStyle(value: unknown): AnimationMotionStyle {
  if (
    typeof value !== "string" ||
    !ANIMATION_MOTION_STYLES.includes(value as AnimationMotionStyle)
  ) {
    fail(
      "motionStyle must be one of " +
        ANIMATION_MOTION_STYLES.join(", "),
    );
  }
  return value as AnimationMotionStyle;
}

function uniqueSafeIds(
  value: unknown,
  field: string,
  maximum: number,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > maximum
  ) {
    fail(field + " must contain 1 to " + maximum + " safe ids");
  }
  const result = value.map((entry, index) =>
    safeId(entry, field + "[" + index + "]"),
  );
  if (new Set(result).size !== result.length) {
    fail(field + " must not contain duplicates");
  }
  return result;
}

function defaultFps(
  requested: number | undefined,
  style: AnimationMotionStyle,
): number {
  if (requested !== undefined) {
    return integer(requested, "fps", 1, 60);
  }
  switch (style) {
    case "cinematic-naturalistic":
    case "traditional-cel":
      return 12;
    case "arcade-snappy":
      return 10;
    case "vga-adventure":
      return 8;
  }
}

function duration(
  value: AuthoredAnimationDurationInput | undefined,
  fps: number,
  field: string,
): Readonly<{ numeratorMs: number; denominator: number }> {
  if (value === undefined) {
    return { numeratorMs: 1000, denominator: fps };
  }
  if (!value || typeof value !== "object") {
    fail(field + " must be an object");
  }
  return {
    numeratorMs: integer(
      value.numeratorMs,
      field + ".numeratorMs",
      1,
      3_600_000,
    ),
    denominator: integer(
      value.denominator,
      field + ".denominator",
      1,
      100_000,
    ),
  };
}

function contactFoot(
  landmarkId: string | null,
): "left" | "right" | "none" {
  if (landmarkId === "leftFoot") return "left";
  if (landmarkId === "rightFoot") return "right";
  return "none";
}

function frameRange(
  startExclusive: number,
  endExclusive: number,
): readonly number[] {
  const result: number[] = [];
  for (
    let frame = startExclusive + 1;
    frame < endExclusive;
    frame += 1
  ) {
    result.push(frame);
  }
  return result;
}

function generationBatches(
  clipId: string,
  keyPoses: readonly number[],
  frameCount: number,
  loop: boolean,
): readonly AuthoredAnimationGenerationBatch[] {
  const batches: AuthoredAnimationGenerationBatch[] = [
    {
      id: clipId + ":keys",
      phase: "key-pose",
      frames: [...keyPoses],
      dependsOnFrames: [],
      maximumCandidatesPerFrame: 4,
    },
  ];
  let ordinal = 1;
  const add = (
    frames: readonly number[],
    previousKey: number,
    nextKey: number,
  ) => {
    if (!frames.length) return;
    batches.push({
      id:
        clipId +
        ":inbetweens-" +
        String(ordinal).padStart(2, "0"),
      phase: "in-between",
      frames: [...frames],
      dependsOnFrames: [previousKey, nextKey],
      maximumCandidatesPerFrame: 3,
    });
    ordinal += 1;
  };

  for (let index = 0; index < keyPoses.length - 1; index += 1) {
    const previous = keyPoses[index]!;
    const next = keyPoses[index + 1]!;
    add(frameRange(previous, next), previous, next);
  }

  if (loop) {
    const last = keyPoses.at(-1)!;
    const first = keyPoses[0]!;
    const wrapped = [
      ...frameRange(last, frameCount + 1),
      ...frameRange(0, first),
    ].filter(
      (frame) =>
        frame >= 1 &&
        frame <= frameCount &&
        !keyPoses.includes(frame),
    );
    add(wrapped, last, first);
  }

  return batches;
}

export function compileAuthoredAnimationDirectorPlan(
  request: AuthoredAnimationDirectorRequest,
): AuthoredAnimationDirectorPlan {
  if (!request || typeof request !== "object") {
    fail("request must be an object");
  }
  const clipId = safeId(request.clipId, "clipId");
  const subjectId = safeId(request.subjectId, "subjectId");
  const action = safeId(request.action, "action");
  const direction = safeId(request.direction, "direction");
  const style = motionStyle(request.motionStyle);
  const fps = defaultFps(request.fps, style);
  const width = integer(
    request.canvas?.width,
    "canvas.width",
    1,
    MAX_PROVIDER_DIMENSION,
  );
  const height = integer(
    request.canvas?.height,
    "canvas.height",
    1,
    MAX_PROVIDER_DIMENSION,
  );
  const canonicalIdentityArtifactId = artifactId(
    request.canonicalIdentityArtifactId,
    "canonicalIdentityArtifactId",
  );
  const directionMasterArtifactId =
    request.directionMasterArtifactId === undefined
      ? undefined
      : artifactId(
          request.directionMasterArtifactId,
          "directionMasterArtifactId",
        );
  const loop = request.loop ?? false;
  if (typeof loop !== "boolean") {
    fail("loop must be boolean when supplied");
  }
  if (
    !Array.isArray(request.frames) ||
    request.frames.length < 1 ||
    request.frames.length > MAX_FRAMES
  ) {
    fail("frames must contain 1 to " + MAX_FRAMES + " entries");
  }

  const rootLandmarkId = safeId(
    request.structure?.rootLandmarkId,
    "structure.rootLandmarkId",
  );
  const requiredLandmarkIds = uniqueSafeIds(
    request.structure?.requiredLandmarkIds,
    "structure.requiredLandmarkIds",
    64,
  );
  if (!requiredLandmarkIds.includes(rootLandmarkId)) {
    fail(
      "structure.requiredLandmarkIds must contain structure.rootLandmarkId",
    );
  }
  const loopClosureLandmarkIds =
    request.structure?.loopClosureLandmarkIds === undefined
      ? [rootLandmarkId]
      : uniqueSafeIds(
          request.structure.loopClosureLandmarkIds,
          "structure.loopClosureLandmarkIds",
          64,
        );
  for (const landmark of loopClosureLandmarkIds) {
    if (!requiredLandmarkIds.includes(landmark)) {
      fail(
        "loop-closure landmark " +
          landmark +
          " must also be required",
      );
    }
  }

  const frames: AuthoredAnimationFramePlan[] = request.frames.map(
    (raw, index) => {
      if (!raw || typeof raw !== "object") {
        fail("frames[" + index + "] must be an object");
      }
      if (typeof raw.keyPose !== "boolean") {
        fail("frames[" + index + "].keyPose must be boolean");
      }
      const role = safeId(raw.role, "frames[" + index + "].role");
      const contact =
        raw.contactLandmarkId === undefined ||
        raw.contactLandmarkId === null
          ? null
          : safeId(
              raw.contactLandmarkId,
              "frames[" + index + "].contactLandmarkId",
            );
      if (contact !== null && !requiredLandmarkIds.includes(contact)) {
        fail(
          "frames[" +
            index +
            "].contactLandmarkId must be one required landmark",
        );
      }
      const groundContactRequired =
        raw.groundContactRequired ?? contact !== null;
      if (typeof groundContactRequired !== "boolean") {
        fail(
          "frames[" +
            index +
            "].groundContactRequired must be boolean",
        );
      }
      if (groundContactRequired && contact === null) {
        fail(
          "frames[" +
            index +
            "] requires contactLandmarkId when groundContactRequired=true",
        );
      }
      const referenceRoles: AuthoredAnimationFramePlan["providerReferenceRoles"][number][] =
        ["canonical-identity", "pose-control"];
      if (directionMasterArtifactId) {
        referenceRoles.push("direction-master");
      }
      if (!raw.keyPose) {
        referenceRoles.push(
          "previous-key-pose",
          "next-key-pose",
        );
      }
      return {
        frame: index + 1,
        role,
        phase: index / request.frames.length,
        duration: duration(
          raw.duration,
          fps,
          "frames[" + index + "].duration",
        ),
        keyPose: raw.keyPose,
        plantedFoot: contactFoot(contact),
        plantedLandmarkId: contact,
        groundContactRequired,
        providerReferenceRoles: referenceRoles,
      };
    },
  );

  const keyPoses = frames
    .filter((frame) => frame.keyPose)
    .map((frame) => frame.frame);
  if (!keyPoses.length) {
    fail("at least one frame must be a key pose");
  }
  if (frames.length > 1 && keyPoses.length < 2) {
    fail("multi-frame clips require at least two key poses");
  }
  if (keyPoses[0] !== 1) {
    fail("frame 1 must be a key pose");
  }
  if (!loop && keyPoses.at(-1) !== frames.length) {
    fail("non-looping clips require the final frame to be a key pose");
  }

  const maximumRootStepPixels =
    request.structure.maximumRootStepPixels === undefined
      ? 8
      : finite(
          request.structure.maximumRootStepPixels,
          "structure.maximumRootStepPixels",
          0,
          256,
        );
  const loopClosureTolerancePixels =
    request.structure.loopClosureTolerancePixels === undefined
      ? 3
      : finite(
          request.structure.loopClosureTolerancePixels,
          "structure.loopClosureTolerancePixels",
          0,
          256,
        );
  const contactDriftTolerancePixels =
    request.structure.contactDriftTolerancePixels === undefined
      ? 2
      : finite(
          request.structure.contactDriftTolerancePixels,
          "structure.contactDriftTolerancePixels",
          0,
          256,
        );

  return {
    kind: AUTHORED_ANIMATION_DIRECTOR_PLAN_KIND,
    protocolVersion: AUTHORED_ANIMATION_DIRECTOR_PROTOCOL_VERSION,
    clipId,
    subjectId,
    action,
    direction,
    motionStyle: style,
    loop,
    fps,
    canvas: { width, height },
    canonicalIdentityArtifactId,
    ...(directionMasterArtifactId
      ? { directionMasterArtifactId }
      : {}),
    frames,
    generationBatches: generationBatches(
      clipId,
      keyPoses,
      frames.length,
      loop,
    ),
    qualityRequirements: {
      identityLocked: true,
      pivotLocked: true,
      baselineLocked: true,
      cameraLocked: true,
      loopClosureRequired: loop,
      plantedFootDriftTolerancePixels:
        contactDriftTolerancePixels,
      rootLandmarkId,
      requiredLandmarkIds,
      loopClosureLandmarkIds,
      maximumRootStepPixels,
      loopClosureTolerancePixels,
      alphaRequired: true,
    },
    authority: {
      providerExecution: false,
      creativeApproval: false,
      artifactPromotion: false,
      repositoryMutation: false,
      publication: false,
    },
  };
}
