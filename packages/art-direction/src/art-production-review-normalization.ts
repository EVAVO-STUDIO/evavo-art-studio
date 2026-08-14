import {
  exactKeys,
  fail,
  freeze,
  integerValue,
  numberValue,
  record,
  stringValue,
} from "./layered-production-internal.js";
import type { CompiledLayeredProductionUnit } from "./layered-production-types.js";
import {
  ART_PRODUCTION_BLOCKING_DETECTIONS,
  ART_PRODUCTION_METRIC_IDS,
} from "./art-production-orchestrator-types.js";
import type {
  ArtProductionBlockingDetection,
  ArtProductionCandidateEvidence,
  ArtProductionDetectionEvidence,
  ArtProductionMetricEvidence,
  ArtProductionMetricId,
  CompiledArtProductionProfile,
} from "./art-production-orchestrator-types.js";

export const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const ARTIFACT_ID_PATTERN = /^artifact_[0-9a-f]{64}$/u;
const DETECTION_SET = new Set<ArtProductionBlockingDetection>(
  ART_PRODUCTION_BLOCKING_DETECTIONS,
);
const COMMON_METRICS: readonly ArtProductionMetricId[] = [
  "alpha-quality",
  "layer-purity",
  "native-readability",
  "palette-discipline",
  "pixel-cluster-quality",
  "camera-accuracy",
  "era-authenticity",
  "non-generic-quality",
  "runtime-usability",
];
const ANIMATION_METRICS: readonly ArtProductionMetricId[] = [
  "identity-consistency",
  "pivot-stability",
  "ground-contact-stability",
  "pose-progression",
];


export function strictUtc(value: unknown, label: string): string {
  const output = stringValue(value, label, 64);
  const date = new Date(output);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== output) {
    fail(
      "ART_PRODUCTION_ATTEMPT_INVALID",
      `${label} must be canonical UTC ISO-8601 text.`,
    );
  }
  return output;
}

export function sha256Value(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail("ART_PRODUCTION_ATTEMPT_INVALID", `${label} must be lowercase SHA-256.`);
  }
  return value;
}

export function artifactId(value: unknown, label: string, digest?: string): string {
  if (typeof value !== "string" || !ARTIFACT_ID_PATTERN.test(value)) {
    fail(
      "ART_PRODUCTION_ATTEMPT_INVALID",
      `${label} must use artifact_<sha256> format.`,
    );
  }
  if (digest !== undefined && value !== `artifact_${digest}`) {
    fail(
      "ART_PRODUCTION_ATTEMPT_INVALID",
      `${label} does not match the candidate SHA-256.`,
    );
  }
  return value;
}

export function requiredMetrics(
  unit: CompiledLayeredProductionUnit,
): readonly ArtProductionMetricId[] {
  return unit.kind === "animation-frame"
    ? freeze([...COMMON_METRICS, ...ANIMATION_METRICS])
    : freeze([...COMMON_METRICS]);
}

export function normalizeCandidate(
  value: unknown,
  unit: CompiledLayeredProductionUnit,
): ArtProductionCandidateEvidence {
  const input = record(value, "attempt.candidate");
  exactKeys(input, "attempt.candidate", [
    "artifactId",
    "sha256",
    "bytes",
    "width",
    "height",
    "alphaPolicy",
  ]);
  const digest = sha256Value(input.sha256, "attempt.candidate.sha256");
  const candidate = freeze({
    artifactId: artifactId(
      input.artifactId,
      "attempt.candidate.artifactId",
      digest,
    ),
    sha256: digest,
    bytes: integerValue(
      input.bytes,
      "attempt.candidate.bytes",
      1,
      256 * 1024 * 1024,
    ),
    width: integerValue(input.width, "attempt.candidate.width", 1, 8192),
    height: integerValue(input.height, "attempt.candidate.height", 1, 8192),
    alphaPolicy: input.alphaPolicy as ArtProductionCandidateEvidence["alphaPolicy"],
  });
  if (
    candidate.width !== unit.dimensions.width ||
    candidate.height !== unit.dimensions.height ||
    candidate.alphaPolicy !== unit.alpha
  ) {
    fail(
      "ART_PRODUCTION_CANDIDATE_MISMATCH",
      `Candidate geometry or alpha policy does not match source unit ${unit.id}.`,
    );
  }
  return candidate;
}

export function normalizeMetrics(
  value: unknown,
  required: readonly ArtProductionMetricId[],
): readonly ArtProductionMetricEvidence[] {
  if (!Array.isArray(value) || value.length !== required.length) {
    fail(
      "ART_PRODUCTION_ATTEMPT_INVALID",
      "Attempt metrics must cover the exact required metric set.",
    );
  }
  const seen = new Set<ArtProductionMetricId>();
  const entries = value.map((entryValue, index) => {
    const entry = record(entryValue, `attempt.metrics[${index}]`);
    exactKeys(entry, `attempt.metrics[${index}]`, [
      "metricId",
      "score",
      "evidenceSha256",
      "note",
    ]);
    const metricId = entry.metricId as ArtProductionMetricId;
    if (!ART_PRODUCTION_METRIC_IDS.includes(metricId) || !required.includes(metricId)) {
      fail(
        "ART_PRODUCTION_ATTEMPT_INVALID",
        `attempt.metrics[${index}].metricId is not required for this source unit.`,
      );
    }
    if (seen.has(metricId)) {
      fail(
        "ART_PRODUCTION_ATTEMPT_INVALID",
        `Duplicate attempt metric ${metricId}.`,
      );
    }
    seen.add(metricId);
    return freeze({
      metricId,
      score: numberValue(
        entry.score,
        `attempt.metrics[${index}].score`,
        0,
        100,
      ),
      evidenceSha256: sha256Value(
        entry.evidenceSha256,
        `attempt.metrics[${index}].evidenceSha256`,
      ),
      ...(entry.note === undefined
        ? {}
        : {
            note: stringValue(
              entry.note,
              `attempt.metrics[${index}].note`,
              1000,
            ),
          }),
    });
  });
  for (const metricId of required) {
    if (!seen.has(metricId)) {
      fail(
        "ART_PRODUCTION_ATTEMPT_INVALID",
        `Attempt is missing required metric ${metricId}.`,
      );
    }
  }
  return freeze(
    [...entries].sort(
      (left, right) => required.indexOf(left.metricId) - required.indexOf(right.metricId),
    ),
  );
}

export function normalizeDetections(
  value: unknown,
  profile: CompiledArtProductionProfile,
): readonly ArtProductionDetectionEvidence[] {
  if (!Array.isArray(value) || value.length > ART_PRODUCTION_BLOCKING_DETECTIONS.length) {
    fail(
      "ART_PRODUCTION_ATTEMPT_INVALID",
      "Attempt detections must be a bounded array.",
    );
  }
  const seen = new Set<ArtProductionBlockingDetection>();
  const output = value.map((entryValue, index) => {
    const entry = record(entryValue, `attempt.detections[${index}]`);
    exactKeys(entry, `attempt.detections[${index}]`, [
      "detection",
      "evidenceSha256",
      "note",
    ]);
    const detection = entry.detection as ArtProductionBlockingDetection;
    if (
      !DETECTION_SET.has(detection) ||
      !profile.iteration.blockingDetections.includes(detection)
    ) {
      fail(
        "ART_PRODUCTION_ATTEMPT_INVALID",
        `attempt.detections[${index}].detection is unsupported.`,
      );
    }
    if (seen.has(detection)) {
      fail(
        "ART_PRODUCTION_ATTEMPT_INVALID",
        `Duplicate blocking detection ${detection}.`,
      );
    }
    seen.add(detection);
    return freeze({
      detection,
      evidenceSha256: sha256Value(
        entry.evidenceSha256,
        `attempt.detections[${index}].evidenceSha256`,
      ),
      ...(entry.note === undefined
        ? {}
        : {
            note: stringValue(
              entry.note,
              `attempt.detections[${index}].note`,
              1000,
            ),
          }),
    });
  });
  return freeze(
    [...output].sort(
      (left, right) =>
        ART_PRODUCTION_BLOCKING_DETECTIONS.indexOf(left.detection) -
        ART_PRODUCTION_BLOCKING_DETECTIONS.indexOf(right.detection),
    ),
  );
}
