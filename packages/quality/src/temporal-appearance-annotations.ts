import type {
  TemporalAppearanceQualityReport,
  TemporalAppearancePairEvidence,
} from "./analyse-temporal-appearance.js";
import type { SpriteQualityGateResult } from "./types.js";

export const TEMPORAL_APPEARANCE_ANNOTATION_VERSION = "2026-08-26.1" as const;

export type TemporalAppearanceMetric =
  | "luma"
  | "chroma"
  | "palette"
  | "edge-density";

export interface TemporalAppearanceDiscontinuityAnnotation {
  readonly fromFrameId: string;
  readonly toFrameId: string;
  readonly metrics: readonly TemporalAppearanceMetric[];
  readonly reason: string;
}

export interface AnnotatedTemporalAppearanceQualityReport
  extends TemporalAppearanceQualityReport {
  readonly annotationVersion: typeof TEMPORAL_APPEARANCE_ANNOTATION_VERSION;
  readonly annotations: readonly TemporalAppearanceDiscontinuityAnnotation[];
}

const GATE_TO_METRIC: Readonly<Record<string, TemporalAppearanceMetric | undefined>> = {
  "temporal-luma": "luma",
  "temporal-chroma": "chroma",
  "temporal-palette": "palette",
  "temporal-edge-density": "edge-density",
};

function fail(message: string): never {
  throw new Error(`Temporal appearance annotation failed: ${message}`);
}

function text(value: unknown, field: string, maximum = 2000): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > maximum || value.includes("\0")) {
    fail(`${field} must be a non-empty safe string.`);
  }
  return value;
}

function isTemporalAppearanceMetric(value: unknown): value is TemporalAppearanceMetric {
  return (
    value === "luma" ||
    value === "chroma" ||
    value === "palette" ||
    value === "edge-density"
  );
}

function key(fromFrameId: string, toFrameId: string, metric: TemporalAppearanceMetric): string {
  return `${fromFrameId}\0${toFrameId}\0${metric}`;
}

function records(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" && entry !== null && !Array.isArray(entry),
      )
    : [];
}

export function applyTemporalAppearanceAnnotations(
  report: TemporalAppearanceQualityReport,
  annotations: readonly TemporalAppearanceDiscontinuityAnnotation[],
): AnnotatedTemporalAppearanceQualityReport {
  if (!report || typeof report !== "object" || !Array.isArray(report.gates)) {
    fail("report must be a temporal appearance quality report.");
  }
  if (!Array.isArray(annotations)) fail("annotations must be an array.");
  const knownPairs = new Set(
    report.adjacentPairs.map((pair: TemporalAppearancePairEvidence) => `${pair.fromFrameId}\0${pair.toFrameId}`),
  );
  const exemptions = new Set<string>();
  const normalized: TemporalAppearanceDiscontinuityAnnotation[] = annotations.map((annotation, index) => {
    if (!annotation || typeof annotation !== "object") fail(`annotations[${index}] must be an object.`);
    const candidate = annotation as unknown as Record<string, unknown>;
    const fromFrameId = text(candidate.fromFrameId, `annotations[${index}].fromFrameId`, 256);
    const toFrameId = text(candidate.toFrameId, `annotations[${index}].toFrameId`, 256);
    if (!knownPairs.has(`${fromFrameId}\0${toFrameId}`)) {
      fail(`annotations[${index}] does not identify an adjacent analysed frame pair.`);
    }
    const rawMetrics = candidate.metrics;
    if (!Array.isArray(rawMetrics) || rawMetrics.length === 0) {
      fail(`annotations[${index}].metrics must be non-empty.`);
    }
    const metrics: TemporalAppearanceMetric[] = [];
    const seenMetrics = new Set<TemporalAppearanceMetric>();
    for (const metric of rawMetrics) {
      if (!isTemporalAppearanceMetric(metric) || seenMetrics.has(metric)) {
        fail(`annotations[${index}].metrics contains duplicates or unsupported metrics.`);
      }
      seenMetrics.add(metric);
      metrics.push(metric);
    }
    const reason = text(candidate.reason, `annotations[${index}].reason`);
    for (const metric of metrics) exemptions.add(key(fromFrameId, toFrameId, metric));
    return { fromFrameId, toFrameId, metrics, reason };
  });

  const gates: SpriteQualityGateResult[] = report.gates.map((qualityGate) => {
    const metric = GATE_TO_METRIC[qualityGate.id];
    if (!metric) return qualityGate;
    const evidence = qualityGate.evidence as Record<string, unknown>;
    const failures = records(evidence.failures);
    const retained: Record<string, unknown>[] = [];
    const exempted: Record<string, unknown>[] = [];
    for (const failure of failures) {
      const fromFrameId = typeof failure.fromFrameId === "string" ? failure.fromFrameId : "";
      const toFrameId = typeof failure.toFrameId === "string" ? failure.toFrameId : "";
      if (exemptions.has(key(fromFrameId, toFrameId, metric))) exempted.push(failure);
      else retained.push(failure);
    }
    if (exempted.length === 0) return qualityGate;
    const status = retained.length === 0 ? "pass" : qualityGate.status;
    return {
      ...qualityGate,
      status,
      message:
        retained.length === 0
          ? `${qualityGate.id} discontinuities are explicitly annotated and no unannotated failures remain.`
          : qualityGate.message,
      evidence: {
        ...evidence,
        failures: retained,
        exempted,
      },
    };
  });

  return {
    ...report,
    passed: !gates.some((entry) => entry.blocking && entry.status === "fail"),
    gates,
    annotationVersion: TEMPORAL_APPEARANCE_ANNOTATION_VERSION,
    annotations: normalized,
  };
}
