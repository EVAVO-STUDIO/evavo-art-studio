export const ANIMATION_DIRECTOR_PROTOCOL_VERSION = "2026-08-25.1" as const;
export const ANIMATION_DIRECTOR_PLAN_KIND =
  "evavo.animation-director.plan" as const;

export const ANIMATION_MOTION_STYLES = [
  "cinematic-naturalistic",
  "vga-adventure",
  "arcade-snappy",
  "traditional-cel",
] as const;
export type AnimationMotionStyle = (typeof ANIMATION_MOTION_STYLES)[number];

export const ANIMATION_FRAME_ROLES = [
  "contact",
  "down",
  "passing",
  "up",
] as const;
export type AnimationFrameRole = (typeof ANIMATION_FRAME_ROLES)[number];

export type AnimationFoot = "left" | "right" | "none";

export interface AnimationDirectorRequest {
  clipId: string;
  subjectId: string;
  action: "walk";
  direction: "left" | "right" | "up" | "down";
  motionStyle: AnimationMotionStyle;
  fps?: number;
  canvas: {
    width: number;
    height: number;
  };
  canonicalIdentityArtifactId: string;
  directionMasterArtifactId?: string;
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
  groundContactRequired: boolean;
  providerReferenceRoles: Array<
    | "canonical-identity"
    | "direction-master"
    | "previous-approved-frame"
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
  direction: AnimationDirectorRequest["direction"];
  motionStyle: AnimationMotionStyle;
  loop: boolean;
  fps: number;
  canvas: AnimationDirectorRequest["canvas"];
  canonicalIdentityArtifactId: string;
  directionMasterArtifactId?: string;
  frames: AnimationFramePlan[];
  generationBatches: AnimationGenerationBatch[];
  qualityRequirements: {
    identityLocked: true;
    pivotLocked: true;
    baselineLocked: true;
    cameraLocked: true;
    loopClosureRequired: boolean;
    plantedFootDriftTolerancePixels: number;
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

function requireNonBlank(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${field} must be non-empty`);
  }
  return normalized;
}

function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
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

export function compileAnimationDirectorPlan(
  request: AnimationDirectorRequest,
): AnimationDirectorPlan {
  const clipId = requireNonBlank(request.clipId, "clipId");
  const subjectId = requireNonBlank(request.subjectId, "subjectId");
  const canonicalIdentityArtifactId = requireNonBlank(
    request.canonicalIdentityArtifactId,
    "canonicalIdentityArtifactId",
  );
  const width = requirePositiveInteger(request.canvas.width, "canvas.width");
  const height = requirePositiveInteger(request.canvas.height, "canvas.height");
  const fps = walkFps(request.fps, request.motionStyle);
  const loop = request.loop ?? true;

  const frames: AnimationFramePlan[] = WALK_ROLES.map((role, index) => {
    const frame = index + 1;
    const referenceRoles: AnimationFramePlan["providerReferenceRoles"] = [
      "canonical-identity",
      "pose-control",
    ];
    if (request.directionMasterArtifactId) {
      referenceRoles.push("direction-master");
    }
    if (frame > 1) {
      referenceRoles.push("previous-approved-frame");
    }
    if (![1, 5].includes(frame)) {
      referenceRoles.push("next-key-pose");
    }
    return {
      frame,
      role,
      phase: index / WALK_ROLES.length,
      duration: { numeratorMs: 1000, denominator: fps },
      plantedFoot: WALK_PLANTED_FEET[index]!,
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
    direction: request.direction,
    motionStyle: request.motionStyle,
    loop,
    fps,
    canvas: { width, height },
    canonicalIdentityArtifactId,
    ...(request.directionMasterArtifactId
      ? {
          directionMasterArtifactId: requireNonBlank(
            request.directionMasterArtifactId,
            "directionMasterArtifactId",
          ),
        }
      : {}),
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
        dependsOnFrames: loop ? [5, 1] : [5],
        maximumCandidatesPerFrame: 3,
      },
    ],
    qualityRequirements: {
      identityLocked: true,
      pivotLocked: true,
      baselineLocked: true,
      cameraLocked: true,
      loopClosureRequired: loop,
      plantedFootDriftTolerancePixels: plantedFootTolerance(request.motionStyle),
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
