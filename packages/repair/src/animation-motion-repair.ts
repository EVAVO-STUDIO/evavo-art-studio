import type { AnimationMotionQualityReport } from "@evavo/art-quality";

export const ANIMATION_MOTION_REPAIR_PLAN_VERSION = "2026-08-25.1" as const;
export const ANIMATION_MOTION_REPAIR_PLAN_KIND =
  "evavo.animation-motion.repair-plan" as const;

export type AnimationMotionRepairReason =
  | "missing-landmark"
  | "planted-foot-drift"
  | "root-discontinuity"
  | "attachment-separation"
  | "loop-seam";

export interface AnimationMotionRepairDirective {
  readonly frameId: string;
  readonly reasons: readonly AnimationMotionRepairReason[];
  readonly preserve: readonly string[];
  readonly correct: readonly string[];
}

export interface AnimationMotionRepairPlan {
  readonly kind: typeof ANIMATION_MOTION_REPAIR_PLAN_KIND;
  readonly version: typeof ANIMATION_MOTION_REPAIR_PLAN_VERSION;
  readonly sequenceId: string;
  readonly motionReportPassed: false;
  readonly directives: readonly AnimationMotionRepairDirective[];
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
  throw new Error(`Animation motion repair compile failed: ${message}`);
}

function records(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" && entry !== null && !Array.isArray(entry),
      )
    : [];
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function add(
  map: Map<string, { reasons: Set<AnimationMotionRepairReason>; correct: Set<string> }>,
  frameId: string | undefined,
  reason: AnimationMotionRepairReason,
  correction: string,
): void {
  if (!frameId) return;
  const entry = map.get(frameId) ?? { reasons: new Set(), correct: new Set() };
  entry.reasons.add(reason);
  entry.correct.add(correction);
  map.set(frameId, entry);
}

export function compileAnimationMotionRepairPlan(
  report: AnimationMotionQualityReport,
): AnimationMotionRepairPlan {
  if (!report || typeof report !== "object") fail("report must be an object.");
  if (report.passed) fail("a passing motion report does not require repair.");
  if (!Array.isArray(report.gates)) fail("report.gates must be an array.");

  const repairs = new Map<
    string,
    { reasons: Set<AnimationMotionRepairReason>; correct: Set<string> }
  >();

  for (const gate of report.gates) {
    if (!gate.blocking || gate.status !== "fail") continue;
    const evidence = gate.evidence as Record<string, unknown>;

    if (gate.id === "motion-required-landmarks") {
      for (const missing of records(evidence.missing)) {
        const frameId = text(missing.frameId);
        const landmarkId = text(missing.landmarkId) ?? "required landmark";
        add(
          repairs,
          frameId,
          "missing-landmark",
          `Restore ${landmarkId} so it is visible, measurable and consistent with the neighbouring approved motion.`,
        );
      }
      continue;
    }

    if (gate.id === "motion-planted-lock") {
      for (const failure of records(evidence.failures)) {
        const startFrameId = text(failure.startFrameId);
        const endFrameId = text(failure.endFrameId);
        const landmarkId = text(failure.landmarkId) ?? "planted foot";
        const correction =
          `Lock ${landmarkId} to the same ground contact across the failed planted segment; correct foot sliding without changing the intended body pose or camera.`;
        add(repairs, startFrameId, "planted-foot-drift", correction);
        add(repairs, endFrameId, "planted-foot-drift", correction);
      }
      continue;
    }

    if (gate.id === "motion-root-step") {
      for (const failure of records(evidence.failures)) {
        const fromFrameId = text(failure.fromFrameId);
        const toFrameId = text(failure.toFrameId);
        const correction =
          "Correct the root/body translation discontinuity so spacing follows the intended motion arc; preserve pose phase, identity, baseline and planted contact.";
        add(repairs, fromFrameId, "root-discontinuity", correction);
        add(repairs, toFrameId, "root-discontinuity", correction);
      }
      continue;
    }

    if (gate.id === "motion-attachments") {
      for (const failure of records(evidence.failures)) {
        const frameId = text(failure.frameId);
        const constraintId = text(failure.constraintId) ?? "attachment";
        add(
          repairs,
          frameId,
          "attachment-separation",
          `Restore attachment ${constraintId} to its declared grip/socket relationship without redesigning the prop, hand, costume or action.`,
        );
      }
      continue;
    }

    if (gate.id === "motion-loop-closure") {
      const failures = records(evidence.failures);
      if (failures.length > 0) {
        add(
          repairs,
          "__loop-start__",
          "loop-seam",
          "Repair the loop seam using the first and last retained drawings together; align only the declared seam anchors and preserve the authored limb progression.",
        );
        add(
          repairs,
          "__loop-end__",
          "loop-seam",
          "Repair the loop seam using the first and last retained drawings together; align only the declared seam anchors and preserve the authored limb progression.",
        );
      }
    }
  }

  if (repairs.size === 0) {
    fail("failed blocking gates did not contain actionable frame evidence.");
  }

  const preserve = [
    "canonical identity and proportions",
    "costume, equipment and prop design",
    "camera, canvas, pivot and baseline",
    "approved neighbouring poses and animation phase",
    "palette, lighting and line treatment unless the failed gate explicitly concerns them",
    "real transparency and safe uncropped silhouette",
  ] as const;

  const directives = [...repairs.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([frameId, value]) => ({
      frameId,
      reasons: [...value.reasons].sort(),
      preserve: [...preserve],
      correct: [...value.correct].sort(),
    }));

  return {
    kind: ANIMATION_MOTION_REPAIR_PLAN_KIND,
    version: ANIMATION_MOTION_REPAIR_PLAN_VERSION,
    sequenceId: report.sequenceId,
    motionReportPassed: false,
    directives,
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
