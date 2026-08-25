import type { TemporalAppearanceQualityReport } from "@evavo/art-quality";

export const ANIMATION_APPEARANCE_REPAIR_PLAN_VERSION = "2026-08-26.1" as const;
export const ANIMATION_APPEARANCE_REPAIR_PLAN_KIND =
  "evavo.animation-appearance.repair-plan" as const;

export type AnimationAppearanceRepairReason =
  | "luminance-flicker"
  | "colour-drift"
  | "palette-drift"
  | "edge-density-drift";

export interface AnimationAppearanceRepairDirective {
  readonly frameId: string;
  readonly referenceFrameId: string;
  readonly reasons: readonly AnimationAppearanceRepairReason[];
  readonly preserve: readonly string[];
  readonly correct: readonly string[];
}

export interface AnimationAppearanceRepairPlan {
  readonly kind: typeof ANIMATION_APPEARANCE_REPAIR_PLAN_KIND;
  readonly version: typeof ANIMATION_APPEARANCE_REPAIR_PLAN_VERSION;
  readonly sequenceId: string;
  readonly directives: readonly AnimationAppearanceRepairDirective[];
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
  throw new Error(`Animation appearance repair compile failed: ${message}`);
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

function reasonForGate(id: string): AnimationAppearanceRepairReason | undefined {
  if (id === "temporal-luma") return "luminance-flicker";
  if (id === "temporal-chroma") return "colour-drift";
  if (id === "temporal-palette") return "palette-drift";
  if (id === "temporal-edge-density") return "edge-density-drift";
  return undefined;
}

function correctionForReason(reason: AnimationAppearanceRepairReason): string {
  switch (reason) {
    case "luminance-flicker":
      return "Match the neighbouring approved frame's overall visible luminance and light treatment while preserving the authored pose and local form shading.";
    case "colour-drift":
      return "Restore the neighbouring approved frame's character and material colour relationships without flattening intentional local shading.";
    case "palette-drift":
      return "Restore the approved sequence palette distribution; remove newly invented colours or colour casts while preserving intended sprite detail.";
    case "edge-density-drift":
      return "Restore the neighbouring approved frame's line/detail density and edge treatment without changing silhouette, anatomy or pose timing.";
  }
}

export function compileAnimationAppearanceRepairPlan(
  sequenceId: string,
  report: TemporalAppearanceQualityReport,
): AnimationAppearanceRepairPlan {
  if (typeof sequenceId !== "string" || !sequenceId.trim()) {
    fail("sequenceId must be non-empty.");
  }
  if (!report || typeof report !== "object" || !Array.isArray(report.gates)) {
    fail("report must be a temporal appearance quality report.");
  }

  const repairs = new Map<
    string,
    {
      referenceFrameId: string;
      reasons: Set<AnimationAppearanceRepairReason>;
      correct: Set<string>;
    }
  >();

  for (const qualityGate of report.gates) {
    if (qualityGate.status !== "warning" && qualityGate.status !== "fail") continue;
    const reason = reasonForGate(qualityGate.id);
    if (!reason) continue;
    const evidence = qualityGate.evidence as Record<string, unknown>;
    for (const failure of records(evidence.failures)) {
      const fromFrameId = text(failure.fromFrameId);
      const toFrameId = text(failure.toFrameId);
      if (!fromFrameId || !toFrameId || fromFrameId === toFrameId) continue;
      const current = repairs.get(toFrameId) ?? {
        referenceFrameId: fromFrameId,
        reasons: new Set<AnimationAppearanceRepairReason>(),
        correct: new Set<string>(),
      };
      if (current.referenceFrameId !== fromFrameId) {
        fail(`frame ${toFrameId} has conflicting appearance reference frames.`);
      }
      current.reasons.add(reason);
      current.correct.add(correctionForReason(reason));
      repairs.set(toFrameId, current);
    }
  }

  if (repairs.size === 0) {
    fail("report does not contain actionable temporal appearance warnings or failures.");
  }

  const preserve = [
    "canonical identity, anatomy and proportions",
    "authored pose, motion phase and planted contacts",
    "costume, equipment and prop geometry",
    "camera, canvas, pivot, baseline and framing",
    "silhouette and neighbouring motion topology",
    "real transparency and safe uncropped sprite bounds",
  ] as const;

  return {
    kind: ANIMATION_APPEARANCE_REPAIR_PLAN_KIND,
    version: ANIMATION_APPEARANCE_REPAIR_PLAN_VERSION,
    sequenceId: sequenceId.trim(),
    directives: [...repairs.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([frameId, entry]) => ({
        frameId,
        referenceFrameId: entry.referenceFrameId,
        reasons: [...entry.reasons].sort(),
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
