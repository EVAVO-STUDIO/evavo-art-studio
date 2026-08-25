import { createHash } from "node:crypto";

import {
  compileAnimationDirectorPlan,
  type AnimationDirectorPlan,
} from "./animation-director.js";
import {
  compileAnimationPoseControl,
  type AnimationPoseControlManifest,
} from "./animation-pose-control.js";

export const SIDE_VIEW_BIPED_WALK_TEMPLATE_VERSION = "2026-08-26.2" as const;

export interface SideViewBipedWalkPoseSet {
  readonly templateId: "side-view-biped-walk";
  readonly templateVersion: typeof SIDE_VIEW_BIPED_WALK_TEMPLATE_VERSION;
  readonly templateSha256: string;
  readonly animationDirectorPlanSha256: string;
  readonly clipId: string;
  readonly direction: "left" | "right";
  readonly poses: readonly AnimationPoseControlManifest[];
  readonly authority: Readonly<{
    providerExecution: false;
    creativeApproval: false;
    artifactPromotion: false;
    repositoryMutation: false;
    publication: false;
  }>;
}

type Point = Readonly<{ x: number; y: number }>;
type Pose = Readonly<Record<string, Point>>;

function fail(message: string): never {
  throw new Error(`Side-view biped walk template failed: ${message}`);
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(object[key])}`)
    .join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function mirror(point: Point): Point {
  return { x: 1 - point.x, y: point.y };
}

function pose(
  rootY: number,
  leftFoot: Point,
  rightFoot: Point,
  leftKnee: Point,
  rightKnee: Point,
  leftHand: Point,
  rightHand: Point,
  leftElbow: Point,
  rightElbow: Point,
): Pose {
  const root = { x: 0.5, y: rootY };
  return {
    head: { x: 0.5, y: rootY - 0.36 },
    neck: { x: 0.5, y: rootY - 0.27 },
    leftShoulder: { x: 0.46, y: rootY - 0.25 },
    rightShoulder: { x: 0.54, y: rootY - 0.25 },
    leftElbow,
    rightElbow,
    leftHand,
    rightHand,
    root,
    leftHip: { x: 0.47, y: rootY + 0.02 },
    rightHip: { x: 0.53, y: rootY + 0.02 },
    leftKnee,
    rightKnee,
    leftFoot,
    rightFoot,
  };
}

// Right-facing authored walk landmarks. The stance foot remains position-locked
// through its four-frame support phase. Arm swing opposes the leading leg.
const RIGHT_FACING_POSES: readonly Pose[] = [
  pose(0.56, { x: 0.34, y: 0.92 }, { x: 0.67, y: 0.92 }, { x: 0.41, y: 0.75 }, { x: 0.59, y: 0.75 }, { x: 0.62, y: 0.56 }, { x: 0.39, y: 0.53 }, { x: 0.56, y: 0.43 }, { x: 0.44, y: 0.42 }),
  pose(0.59, { x: 0.34, y: 0.92 }, { x: 0.61, y: 0.90 }, { x: 0.40, y: 0.77 }, { x: 0.55, y: 0.78 }, { x: 0.59, y: 0.58 }, { x: 0.42, y: 0.55 }, { x: 0.55, y: 0.46 }, { x: 0.45, y: 0.45 }),
  pose(0.56, { x: 0.34, y: 0.92 }, { x: 0.52, y: 0.80 }, { x: 0.41, y: 0.76 }, { x: 0.51, y: 0.70 }, { x: 0.54, y: 0.56 }, { x: 0.47, y: 0.54 }, { x: 0.52, y: 0.44 }, { x: 0.48, y: 0.44 }),
  pose(0.53, { x: 0.34, y: 0.92 }, { x: 0.42, y: 0.85 }, { x: 0.40, y: 0.74 }, { x: 0.46, y: 0.72 }, { x: 0.47, y: 0.53 }, { x: 0.55, y: 0.51 }, { x: 0.48, y: 0.41 }, { x: 0.52, y: 0.41 }),
  pose(0.56, { x: 0.67, y: 0.92 }, { x: 0.34, y: 0.92 }, { x: 0.59, y: 0.75 }, { x: 0.41, y: 0.75 }, { x: 0.39, y: 0.53 }, { x: 0.62, y: 0.56 }, { x: 0.44, y: 0.42 }, { x: 0.56, y: 0.43 }),
  pose(0.59, { x: 0.61, y: 0.90 }, { x: 0.34, y: 0.92 }, { x: 0.55, y: 0.78 }, { x: 0.40, y: 0.77 }, { x: 0.42, y: 0.55 }, { x: 0.59, y: 0.58 }, { x: 0.45, y: 0.45 }, { x: 0.55, y: 0.46 }),
  pose(0.56, { x: 0.52, y: 0.80 }, { x: 0.34, y: 0.92 }, { x: 0.51, y: 0.70 }, { x: 0.41, y: 0.76 }, { x: 0.47, y: 0.54 }, { x: 0.54, y: 0.56 }, { x: 0.48, y: 0.44 }, { x: 0.52, y: 0.44 }),
  pose(0.53, { x: 0.42, y: 0.85 }, { x: 0.34, y: 0.92 }, { x: 0.46, y: 0.72 }, { x: 0.40, y: 0.74 }, { x: 0.55, y: 0.51 }, { x: 0.47, y: 0.53 }, { x: 0.52, y: 0.41 }, { x: 0.48, y: 0.41 }),
] as const;

const TEMPLATE_SHA256 = digest({
  templateId: "side-view-biped-walk",
  templateVersion: SIDE_VIEW_BIPED_WALK_TEMPLATE_VERSION,
  rightFacingPoses: RIGHT_FACING_POSES,
});

function mirroredPose(input: Pose): Pose {
  return Object.fromEntries(
    Object.entries(input).map(([id, point]) => [id, mirror(point)]),
  );
}

function canonicalPlan(input: AnimationDirectorPlan): AnimationDirectorPlan {
  let rebuilt: AnimationDirectorPlan;
  try {
    rebuilt = compileAnimationDirectorPlan({
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
    fail(`Director plan cannot be canonically recompiled: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (stable(rebuilt) !== stable(input)) {
    fail("Director plan is noncanonical or was mutated after compilation.");
  }
  return rebuilt;
}

export function compileSideViewBipedWalkPoseControls(
  input: AnimationDirectorPlan,
): SideViewBipedWalkPoseSet {
  if (!input || typeof input !== "object") fail("plan must be an Animation Director plan.");
  const plan = canonicalPlan(input);
  if (plan.action !== "walk" || plan.frames.length !== 8) {
    fail("template requires the eight-phase walk Director plan.");
  }
  if (plan.direction !== "left" && plan.direction !== "right") {
    fail("side-view biped walk template supports only left or right directions.");
  }
  if (plan.motionStyle === "traditional-cel") {
    fail("traditional-cel plans route to Cel Animation Studio rather than the sprite pose template.");
  }

  const authored = plan.direction === "right"
    ? RIGHT_FACING_POSES
    : RIGHT_FACING_POSES.map(mirroredPose);
  const required = [
    "head", "neck", "leftShoulder", "rightShoulder",
    "leftElbow", "rightElbow", "leftHand", "rightHand",
    "root", "leftHip", "rightHip", "leftKnee", "rightKnee",
    "leftFoot", "rightFoot",
  ] as const;

  const poses = plan.frames.map((frame, index) => {
    const points = authored[index]!;
    return compileAnimationPoseControl({
      clipId: plan.clipId,
      frameId: `${plan.clipId}:f${String(frame.frame).padStart(3, "0")}`,
      frameNumber: frame.frame,
      canvas: plan.canvas,
      landmarks: Object.fromEntries(
        Object.entries(points).map(([id, point]) => [id, { ...point, confidence: 1 }]),
      ),
      requiredLandmarkIds: [...required],
      source: {
        kind: "authored",
        id: "side-view-biped-walk-template",
        version: SIDE_VIEW_BIPED_WALK_TEMPLATE_VERSION,
        configSha256: TEMPLATE_SHA256,
      },
    });
  });

  return {
    templateId: "side-view-biped-walk",
    templateVersion: SIDE_VIEW_BIPED_WALK_TEMPLATE_VERSION,
    templateSha256: TEMPLATE_SHA256,
    animationDirectorPlanSha256: digest(plan),
    clipId: plan.clipId,
    direction: plan.direction,
    poses,
    authority: {
      providerExecution: false,
      creativeApproval: false,
      artifactPromotion: false,
      repositoryMutation: false,
      publication: false,
    },
  };
}
