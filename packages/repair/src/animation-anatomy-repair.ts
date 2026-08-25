import type { AnimationAnatomyStabilityReport } from "@evavo/art-quality";

export const ANIMATION_ANATOMY_REPAIR_PLAN_VERSION = "2026-08-26.1" as const;
export const ANIMATION_ANATOMY_REPAIR_PLAN_KIND =
  "evavo.animation-anatomy.repair-plan" as const;

export interface AnimationAnatomyRepairDirective {
  readonly frameId: string;
  readonly segmentIds: readonly string[];
  readonly preserve: readonly string[];
  readonly correct: readonly string[];
}

export interface AnimationAnatomyRepairPlan {
  readonly kind: typeof ANIMATION_ANATOMY_REPAIR_PLAN_KIND;
  readonly version: typeof ANIMATION_ANATOMY_REPAIR_PLAN_VERSION;
  readonly sequenceId: string;
  readonly directives: readonly AnimationAnatomyRepairDirective[];
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
  throw new Error(`Animation anatomy repair compile failed: ${message}`);
}

function records(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" && entry !== null && !Array.isArray(entry),
      )
    : [];
}

export function compileAnimationAnatomyRepairPlan(
  report: AnimationAnatomyStabilityReport,
): AnimationAnatomyRepairPlan {
  if (!report || typeof report !== "object" || !Array.isArray(report.gates)) {
    fail("report must be an animation anatomy stability report.");
  }
  const repairs = new Map<string, { segmentIds: Set<string>; correct: Set<string> }>();
  for (const qualityGate of report.gates) {
    if (qualityGate.status !== "fail" && qualityGate.status !== "warning") continue;
    if (!qualityGate.id.startsWith("anatomy-segment:")) continue;
    const evidence = qualityGate.evidence as Record<string, unknown>;
    const segmentId = typeof evidence.segmentId === "string" ? evidence.segmentId : qualityGate.id.slice("anatomy-segment:".length);
    const fromLandmarkId = typeof evidence.fromLandmarkId === "string" ? evidence.fromLandmarkId : "segment start";
    const toLandmarkId = typeof evidence.toLandmarkId === "string" ? evidence.toLandmarkId : "segment end";
    const referenceLength = typeof evidence.referenceLengthPixels === "number" ? evidence.referenceLengthPixels : null;
    for (const failure of records(evidence.failures)) {
      const frameId = typeof failure.frameId === "string" && failure.frameId.trim() ? failure.frameId.trim() : undefined;
      if (!frameId) continue;
      const entry = repairs.get(frameId) ?? { segmentIds: new Set<string>(), correct: new Set<string>() };
      entry.segmentIds.add(segmentId);
      entry.correct.add(
        referenceLength === null
          ? `Restore landmarks ${fromLandmarkId} and ${toLandmarkId} so segment ${segmentId} is measurable and anatomically consistent with neighbouring retained frames.`
          : `Restore segment ${segmentId} (${fromLandmarkId} to ${toLandmarkId}) toward the retained sequence reference length ${referenceLength.toFixed(3)} px without changing the authored joint direction, pose phase or root position.`,
      );
      repairs.set(frameId, entry);
    }
  }
  if (repairs.size === 0) fail("report contains no actionable anatomy segment failures.");

  const preserve = [
    "canonical identity, face, costume and equipment",
    "authored pose phase, gesture and motion arc",
    "root position, planted contacts, pivot and baseline",
    "camera, canvas and framing",
    "palette, lighting, line treatment and transparency",
    "unaffected limb and body proportions",
  ] as const;

  return {
    kind: ANIMATION_ANATOMY_REPAIR_PLAN_KIND,
    version: ANIMATION_ANATOMY_REPAIR_PLAN_VERSION,
    sequenceId: report.sequenceId,
    directives: [...repairs.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([frameId, entry]) => ({
        frameId,
        segmentIds: [...entry.segmentIds].sort(),
        preserve: [...preserve],
        correct: [...entry.correct].sort(),
      })),
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
