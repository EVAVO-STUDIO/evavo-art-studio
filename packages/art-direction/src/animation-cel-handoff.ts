import { createHash } from "node:crypto";

import {
  ANIMATION_DIRECTOR_PLAN_KIND,
  ANIMATION_DIRECTOR_PROTOCOL_VERSION,
  compileAnimationDirectorPlan,
  type AnimationDirectorPlan,
} from "./animation-director.js";
import { resolveAnimationProductionRoute } from "./animation-routing.js";
import { artDirectionSha256 } from "./validation.js";

export const ART_STUDIO_ANIMATION_HANDOFF_SCHEMA =
  "evavo.art-to-cel-animation-handoff.v1" as const;

export interface ArtStudioCelAnimationHandoff {
  readonly schema: typeof ART_STUDIO_ANIMATION_HANDOFF_SCHEMA;
  readonly sourceStudio: "evavo-art-studio";
  readonly productionRoute: "cel-animation-studio";
  readonly sourceAnimationDirectorProtocolVersion: string;
  readonly sourceAnimationDirectorPlanSha256: string;
  readonly clipId: string;
  readonly subjectId: string;
  readonly action: "walk";
  readonly direction: AnimationDirectorPlan["direction"];
  readonly motionStyle: "traditional-cel";
  readonly framesPerSecond: 12 | 24 | 25 | 30;
  readonly loop: boolean;
  readonly canvas: Readonly<{ width: number; height: number }>;
  readonly identity: Readonly<{
    canonicalIdentityArtifactId: string;
    directionMasterArtifactId?: string;
  }>;
  readonly motionGuidance: readonly Readonly<{
    frameNumber: number;
    role: "contact" | "down" | "passing" | "up";
    phase: number;
    plantedFoot: "left" | "right" | "none";
    plantedLandmarkId: "leftFoot" | "rightFoot" | null;
    suggestedKeyPose: boolean;
  }>[];
  readonly celAuthority: Readonly<{
    xSheetTiming: "cel-animation-studio";
    exposureAndHolds: "cel-animation-studio";
    drawingRoles: "cel-animation-studio";
    uniqueDrawingCount: "cel-animation-studio";
  }>;
  readonly authority: Readonly<{
    providerExecution: false;
    renderExecution: false;
    creativeApproval: false;
    xSheetApproval: false;
    artifactPromotion: false;
    repositoryMutation: false;
    publication: false;
  }>;
  readonly handoffDigest: `sha256:${string}`;
  readonly runId: string;
}

const CEL_FPS = new Set([12, 24, 25, 30]);

function fail(message: string): never {
  throw new Error(`Traditional cel handoff failed: ${message}`);
}

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) sorted[key] = canonicalise(entry);
    }
    return sorted;
  }
  return value;
}

function digest(value: unknown): `sha256:${string}` {
  const body = JSON.stringify(canonicalise(value));
  return `sha256:${createHash("sha256").update(body).digest("hex")}`;
}

function canonicalPlan(input: AnimationDirectorPlan): AnimationDirectorPlan {
  if (
    !input ||
    typeof input !== "object" ||
    input.kind !== ANIMATION_DIRECTOR_PLAN_KIND ||
    input.protocolVersion !== ANIMATION_DIRECTOR_PROTOCOL_VERSION
  ) {
    fail("plan kind or protocol version is unsupported.");
  }
  const rebuilt = compileAnimationDirectorPlan({
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
  if (artDirectionSha256(rebuilt) !== artDirectionSha256(input)) {
    fail("plan is not canonical or was mutated after compilation.");
  }
  return rebuilt;
}

export function compileArtStudioCelAnimationHandoff(
  submittedPlan: AnimationDirectorPlan,
): ArtStudioCelAnimationHandoff {
  const plan = canonicalPlan(submittedPlan);
  const route = resolveAnimationProductionRoute(plan.motionStyle);
  if (route.route !== "cel-animation-studio") {
    fail(`motion style ${plan.motionStyle} routes to ${route.route}, not Cel Animation Studio.`);
  }
  if (!CEL_FPS.has(plan.fps)) {
    fail(
      `Cel Animation Studio accepts 12, 24, 25 or 30 FPS; received ${plan.fps}. Recompile the Director plan with a Cel-compatible FPS.`,
    );
  }

  const body = {
    schema: ART_STUDIO_ANIMATION_HANDOFF_SCHEMA,
    sourceStudio: "evavo-art-studio" as const,
    productionRoute: "cel-animation-studio" as const,
    sourceAnimationDirectorProtocolVersion: plan.protocolVersion,
    sourceAnimationDirectorPlanSha256: artDirectionSha256(plan),
    clipId: plan.clipId,
    subjectId: plan.subjectId,
    action: plan.action,
    direction: plan.direction,
    motionStyle: "traditional-cel" as const,
    framesPerSecond: plan.fps as 12 | 24 | 25 | 30,
    loop: plan.loop,
    canvas: { ...plan.canvas },
    identity: {
      canonicalIdentityArtifactId: plan.canonicalIdentityArtifactId,
      ...(plan.directionMasterArtifactId
        ? { directionMasterArtifactId: plan.directionMasterArtifactId }
        : {}),
    },
    motionGuidance: plan.frames.map((frame) => ({
      frameNumber: frame.frame,
      role: frame.role,
      phase: frame.phase,
      plantedFoot: frame.plantedFoot,
      plantedLandmarkId: frame.plantedLandmarkId,
      suggestedKeyPose: frame.frame === 1 || frame.frame === 5,
    })),
    celAuthority: {
      xSheetTiming: "cel-animation-studio" as const,
      exposureAndHolds: "cel-animation-studio" as const,
      drawingRoles: "cel-animation-studio" as const,
      uniqueDrawingCount: "cel-animation-studio" as const,
    },
    authority: {
      providerExecution: false as const,
      renderExecution: false as const,
      creativeApproval: false as const,
      xSheetApproval: false as const,
      artifactPromotion: false as const,
      repositoryMutation: false as const,
      publication: false as const,
    },
  };
  const handoffDigest = digest(body);
  return {
    ...body,
    handoffDigest,
    runId: handoffDigest.slice("sha256:".length, "sha256:".length + 20),
  };
}
