export const ANIMATION_DIRECTOR_PROTOCOL_VERSION = "2026-08-25.7" as const;
export const ANIMATION_DIRECTOR_PLAN_KIND =
  "evavo.animation-director.plan" as const;

export const ANIMATION_MOTION_STYLES = [
  "cinematic-naturalistic",
  "vga-adventure",
  "arcade-snappy",
  "traditional-cel",
] as const;
export type AnimationMotionStyle = (typeof ANIMATION_MOTION_STYLES)[number];

export const ANIMATION_DIRECTIONS = ["left", "right", "up", "down"] as const;
export type AnimationDirection = (typeof ANIMATION_DIRECTIONS)[number];

export const ANIMATION_FRAME_ROLES = [
  "contact",
  "down",
  "passing",
  "up",
] as const;
export type AnimationFrameRole = (typeof ANIMATION_FRAME_ROLES)[number];

export type AnimationArtifactId = `artifact_${string}`;
export type AnimationFoot = "left" | "right" | "none";
export type AnimationFootLandmarkId = "leftFoot" | "rightFoot" | null;

export interface AnimationDirectorRequest {
  clipId: string;
  subjectId: string;
  action: "walk";
  direction: AnimationDirection;
  motionStyle: AnimationMotionStyle;
  fps?: number;
  canvas: {
    width: number;
    height: number;
  };
  canonicalIdentityArtifactId: AnimationArtifactId;
  directionMasterArtifactId?: AnimationArtifactId;
  loop?: boolean;
}

export interface AnimationFramePlan {
  frame: number;
  role: AnimationFrameRole;
  phase: number;
  duration: {
    numeratorMs: 1000;
    denominator: number;
  };
  plantedFoot: AnimationFoot;
  plantedLandmarkId: AnimationFootLandmarkId;
  groundContactRequired: boolean;
  providerReferenceRoles: Array<
    | "canonical-identity"
    | "direction-master"
    | "previous-key-pose"
    | "next-key-pose"
    | "pose-control"
  >;
}

export interface AnimationGenerationBatch {
  id: string;
  phase: "key-pose" | "in-between";
  frames: number[];
  dependsOnFrames: number[];
  maximumCandidatesPerFrame: number;
}

export interface AnimationDirectorPlan {
  kind: typeof ANIMATION_DIRECTOR_PLAN_KIND;
  protocolVersion: typeof ANIMATION_DIRECTOR_PROTOCOL_VERSION;
  clipId: string;
  subjectId: string;
  action: "walk";
  direction: AnimationDirection;
  motionStyle: AnimationMotionStyle;
  loop: boolean;
  fps: number;
  canvas: AnimationDirectorRequest["canvas"];
  canonicalIdentityArtifactId: AnimationArtifactId;
  directionMasterArtifactId?: AnimationArtifactId;
  frames: AnimationFramePlan[];
  generationBatches: AnimationGenerationBatch[];
  qualityRequirements: {
    identityLocked: true;
    pivotLocked: true;
    baselineLocked: true;
    cameraLocked: true;
    loopClosureRequired: boolean;
    plantedFootDriftTolerancePixels: number;
    rootLandmarkId: "root";
    requiredLandmarkIds: readonly ["root", "leftFoot", "rightFoot"];
    loopClosureLandmarkIds: readonly ["root"];
    maximumRootStepPixels: number;
    loopClosureTolerancePixels: number;
    alphaRequired: true;
  };
  authority: {
    providerExecution: false;
    creativeApproval: false;
    artifactPromotion: false;
    repositoryMutation: false;
    publication: false;
  };
}

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_PROVIDER_DIMENSION = 8_192;

const WALK_ROLES: AnimationFrameRole[] = [
  "contact",
  "down",
  "passing",
  "up",
  "contact",
  "down",
  "passing",
  "up",
];

const WALK_PLANTED_FEET: AnimationFoot[] = [
  "left",
  "left",
  "left",
  "left",
  "right",
  "right",
  "right",
  "right",
];

function requireNonBlank(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${field} must be non-empty`);
  }
  return normalized;
}

function requireSafeId(value: unknown, field: string): string {
  const normalized = requireNonBlank(value, field);
  if (!SAFE_ID.test(normalized)) {
    throw new Error(
      `${field} must use 1 to 128 letters, digits, dots, underscores, colons or hyphens`,
    );
  }
  return normalized;
}

function requireArtifactId(value: unknown, field: string): AnimationArtifactId {
  const normalized = requireNonBlank(value, field);
  if (!ARTIFACT_ID.test(normalized)) {
    throw new Error(`${field} must be a canonical artifact_[64 lowercase hex] id`);
  }
  return normalized as AnimationArtifactId;
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function requireDimension(value: unknown, field: string): number {
  const dimension = requirePositiveInteger(value, field);
  if (dimension > MAX_PROVIDER_DIMENSION) {
    throw new Error(`${field} cannot exceed ${MAX_PROVIDER_DIMENSION}`);
  }
  return dimension;
}

function requireMotionStyle(value: unknown): AnimationMotionStyle {
  if (
    typeof value !== "string" ||
    !ANIMATION_MOTION_STYLES.includes(value as AnimationMotionStyle)
  ) {
    throw new Error(
      `motionStyle must be one of ${ANIMATION_MOTION_STYLES.join(", ")}`,
    );
  }
  return value as AnimationMotionStyle;
}

function requireDirection(value: unknown): AnimationDirection {
  if (
    typeof value !== "string" ||
    !ANIMATION_DIRECTIONS.includes(value as AnimationDirection)
  ) {
    throw new Error(`direction must be one of ${ANIMATION_DIRECTIONS.join(", ")}`);
  }
  return value as AnimationDirection;
}

function walkFps(requested: number | undefined, style: AnimationMotionStyle): number {
  if (requested !== undefined) {
    const fps = requirePositiveInteger(requested, "fps");
    if (fps < 4 || fps > 30) {
      throw new Error("fps must be between 4 and 30 for authored sprite animation");
    }
    return fps;
  }
  switch (style) {
    case "cinematic-naturalistic":
      return 12;
    case "traditional-cel":
      return 12;
    case "arcade-snappy":
      return 10;
    case "vga-adventure":
      return 8;
  }
}

function plantedFootTolerance(style: AnimationMotionStyle): number {
  switch (style) {
    case "cinematic-naturalistic":
      return 2;
    case "traditional-cel":
      return 3;
    case "arcade-snappy":
      return 2;
    case "vga-adventure":
      return 1;
  }
}

function maximumRootStep(style: AnimationMotionStyle): number {
  switch (style) {
    case "cinematic-naturalistic":
      return 6;
    case "traditional-cel":
      return 8;
    case "arcade-snappy":
      return 8;
    case "vga-adventure":
      return 4;
  }
}

function loopClosureTolerance(style: AnimationMotionStyle): number {
  switch (style) {
    case "cinematic-naturalistic":
      return 3;
    case "traditional-cel":
      return 4;
    case "arcade-snappy":
      return 3;
    case "vga-adventure":
      return 2;
  }
}

function footLandmarkId(foot: AnimationFoot): AnimationFootLandmarkId {
  if (foot === "left") return "leftFoot";
  if (foot === "right") return "rightFoot";
  return null;
}

export function compileAnimationDirectorPlan(
  request: AnimationDirectorRequest,
): AnimationDirectorPlan {
  if (!request || typeof request !== "object") {
    throw new Error("animation director request must be an object");
  }
  if (request.action !== "walk") {
    throw new Error("action must be walk in animation director protocol 2026-08-25.7");
  }
  if (!request.canvas || typeof request.canvas !== "object") {
    throw new Error("canvas must be an object");
  }

  const clipId = requireSafeId(request.clipId, "clipId");
  const subjectId = requireSafeId(request.subjectId, "subjectId");
  const canonicalIdentityArtifactId = requireArtifactId(
    request.canonicalIdentityArtifactId,
    "canonicalIdentityArtifactId",
  );
  const directionMasterArtifactId =
    request.directionMasterArtifactId === undefined
      ? undefined
      : requireArtifactId(
          request.directionMasterArtifactId,
          "directionMasterArtifactId",
        );
  const motionStyle = requireMotionStyle(request.motionStyle);
  const direction = requireDirection(request.direction);
  const width = requireDimension(request.canvas.width, "canvas.width");
  const height = requireDimension(request.canvas.height, "canvas.height");
  const fps = walkFps(request.fps, motionStyle);
  const loop = request.loop ?? true;
  if (typeof loop !== "boolean") {
    throw new Error("loop must be a boolean when supplied");
  }

  const frames: AnimationFramePlan[] = WALK_ROLES.map((role, index) => {
    const frame = index + 1;
    const plantedFoot = WALK_PLANTED_FEET[index]!;
    const keyPose = frame === 1 || frame === 5;
    const referenceRoles: AnimationFramePlan["providerReferenceRoles"] = [
      "canonical-identity",
      "pose-control",
    ];
    if (directionMasterArtifactId) {
      referenceRoles.push("direction-master");
    }
    if (!keyPose) {
      referenceRoles.push("previous-key-pose", "next-key-pose");
    }
    return {
      frame,
      role,
      phase: index / WALK_ROLES.length,
      duration: { numeratorMs: 1000, denominator: fps },
      plantedFoot,
      plantedLandmarkId: footLandmarkId(plantedFoot),
      groundContactRequired: true,
      providerReferenceRoles: referenceRoles,
    };
  });

  return {
    kind: ANIMATION_DIRECTOR_PLAN_KIND,
    protocolVersion: ANIMATION_DIRECTOR_PROTOCOL_VERSION,
    clipId,
    subjectId,
    action: "walk",
    direction,
    motionStyle,
    loop,
    fps,
    canvas: { width, height },
    canonicalIdentityArtifactId,
    ...(directionMasterArtifactId ? { directionMasterArtifactId } : {}),
    frames,
    generationBatches: [
      {
        id: `${clipId}:keys`,
        phase: "key-pose",
        frames: [1, 5],
        dependsOnFrames: [],
        maximumCandidatesPerFrame: 4,
      },
      {
        id: `${clipId}:inbetweens-a`,
        phase: "in-between",
        frames: [2, 3, 4],
        dependsOnFrames: [1, 5],
        maximumCandidatesPerFrame: 3,
      },
      {
        id: `${clipId}:inbetweens-b`,
        phase: "in-between",
        frames: [6, 7, 8],
        dependsOnFrames: [5, 1],
        maximumCandidatesPerFrame: 3,
      },
    ],
    qualityRequirements: {
      identityLocked: true,
      pivotLocked: true,
      baselineLocked: true,
      cameraLocked: true,
      loopClosureRequired: loop,
      plantedFootDriftTolerancePixels: plantedFootTolerance(motionStyle),
      rootLandmarkId: "root",
      requiredLandmarkIds: ["root", "leftFoot", "rightFoot"],
      loopClosureLandmarkIds: ["root"],
      maximumRootStepPixels: maximumRootStep(motionStyle),
      loopClosureTolerancePixels: loopClosureTolerance(motionStyle),
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
