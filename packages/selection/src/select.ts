import {
  normalizeJson,
  type ArtifactId,
  type ArtifactStore,
  type JsonValue,
  type StoredArtifact,
} from "@evavo/art-artifacts";

import { compareSelectionImages } from "./compare.js";
import { decodeSelectionImage, type SelectionImageFeatures } from "./features.js";
import {
  SELECTION_PROTOCOL_VERSION,
  CandidateSelectionError,
  type CandidateExternalEvidenceReading,
  type CandidateMetricReading,
  type CandidateSelectionEvidence,
  type CandidateSelectionOptions,
  type CandidateSelectionRankingEntry,
  type CandidateSelectionRunResult,
  type ExternalSelectionEvidenceInput,
  type ExternalSelectionEvidenceKind,
  type NormalizedCandidateSelectionRequest,
} from "./types.js";
import {
  selectionRequestSha256,
  validateCandidateSelectionRequest,
} from "./validation.js";

const SHA256 = /^[a-f0-9]{64}$/;
const IMAGE_MEDIA_TYPES = new Set(["image/png", "image/webp", "image/jpeg"]);
const DEFAULT_MAXIMUM_INPUT_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAXIMUM_PIXELS = 16_777_216;
const DEFAULT_MAXIMUM_LINEAGE_DEPTH = 16;
const DEFAULT_DECODE_CONCURRENCY = 4;

interface ResolvedSelectionImage {
  readonly artifact: StoredArtifact;
  readonly features: SelectionImageFeatures;
  readonly lineage: ReadonlySet<ArtifactId>;
  readonly stateViolations: readonly string[];
}

interface ParsedExternalEvidence {
  readonly artifactId: ArtifactId;
  readonly value: ExternalSelectionEvidenceInput;
}

function integer(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new CandidateSelectionError(
      "CANDIDATE_SELECTION_OPTIONS_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return resolved;
}

function nowIso(now: () => Date): string {
  const value = now();
  if (!Number.isFinite(value.getTime())) {
    throw new CandidateSelectionError(
      "CANDIDATE_SELECTION_CLOCK_INVALID",
      "Candidate selection clock returned an invalid date.",
    );
  }
  return value.toISOString();
}

async function verifiedArtifact(
  artifacts: ArtifactStore,
  artifactId: ArtifactId,
  role: string,
): Promise<StoredArtifact> {
  const [artifact, verification] = await Promise.all([
    artifacts.get(artifactId),
    artifacts.verify(artifactId),
  ]);
  if (!artifact || !verification.exists) {
    throw new CandidateSelectionError(
      "CANDIDATE_SELECTION_ARTIFACT_NOT_FOUND",
      `${role} artifact was not found: ${artifactId}`,
    );
  }
  if (!verification.descriptorValid || !verification.contentValid) {
    throw new CandidateSelectionError(
      "CANDIDATE_SELECTION_ARTIFACT_VERIFICATION_FAILED",
      `${role} artifact failed immutable verification: ${artifactId}`,
    );
  }
  return artifact;
}

async function collectLineage(
  artifacts: ArtifactStore,
  artifact: StoredArtifact,
  maximumDepth: number,
): Promise<ReadonlySet<ArtifactId>> {
  const lineage = new Set<ArtifactId>();
  const queue = artifact.sourceArtifacts.map((artifactId) => ({
    artifactId,
    depth: 1,
  }));
  while (queue.length) {
    const next = queue.shift()!;
    if (lineage.has(next.artifactId)) continue;
    lineage.add(next.artifactId);
    if (next.depth >= maximumDepth) continue;
    const source = await verifiedArtifact(
      artifacts,
      next.artifactId,
      "candidate lineage",
    );
    for (const sourceArtifactId of source.sourceArtifacts) {
      queue.push({ artifactId: sourceArtifactId, depth: next.depth + 1 });
    }
  }
  return lineage;
}

function candidateStateViolations(
  artifact: StoredArtifact,
  request: NormalizedCandidateSelectionRequest,
  lineage: ReadonlySet<ArtifactId>,
): readonly string[] {
  const violations: string[] = [];
  const role = artifact.labels.artifactRole ?? "";
  if (!request.policy.allowedCandidateRoles.includes(role)) {
    violations.push(`artifact role ${role || "<missing>"} is not allowed`);
  }
  if (artifact.storageClass !== "intermediate") {
    violations.push(`storage class ${artifact.storageClass} is not intermediate`);
  }
  if (artifact.labels.approvalState !== "unapproved") {
    violations.push("candidate is not explicitly unapproved");
  }
  if (
    request.policy.requireQualityPassed &&
    artifact.labels.qualityState !== "passed"
  ) {
    violations.push("candidate does not carry qualityState=passed");
  }
  if (artifact.labels.finalDeliverable === "true") {
    violations.push("candidate is incorrectly marked as a final deliverable");
  }
  if (request.policy.requireReferenceLineage) {
    if (!lineage.has(request.referenceArtifactId)) {
      violations.push(
        `reference ${request.referenceArtifactId} is absent from candidate lineage`,
      );
    }
  }
  return violations;
}

async function mapLimit<T, R>(
  values: readonly T[],
  limit: number,
  operation: (value: T, index: number) => Promise<R>,
): Promise<readonly R[]> {
  const output = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, values.length) },
    async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= values.length) return;
        output[index] = await operation(values[index]!, index);
      }
    },
  );
  await Promise.all(workers);
  return output;
}

async function resolveSelectionImage(
  artifacts: ArtifactStore,
  artifactId: ArtifactId,
  request: NormalizedCandidateSelectionRequest,
  options: Readonly<{
    maximumInputBytes: number;
    maximumPixels: number;
    maximumLineageDepth: number;
  }>,
): Promise<ResolvedSelectionImage> {
  const artifact = await verifiedArtifact(artifacts, artifactId, "candidate");
  if (!IMAGE_MEDIA_TYPES.has(artifact.mediaType)) {
    throw new CandidateSelectionError(
      "CANDIDATE_SELECTION_MEDIA_TYPE_INVALID",
      `Candidate ${artifactId} must contain PNG, WebP or JPEG image bytes.`,
    );
  }
  const lineage = await collectLineage(
    artifacts,
    artifact,
    options.maximumLineageDepth,
  );
  const bytes = await artifacts.read(artifactId);
  const features = await decodeSelectionImage(bytes, {
    alphaVisibleThreshold: request.policy.alphaVisibleThreshold,
    maximumInputBytes: options.maximumInputBytes,
    maximumPixels: options.maximumPixels,
  });
  if (features.encodedSha256 !== artifact.contentSha256) {
    throw new CandidateSelectionError(
      "CANDIDATE_SELECTION_CONTENT_HASH_MISMATCH",
      `Decoded candidate bytes do not match the descriptor hash: ${artifactId}`,
    );
  }
  return {
    artifact,
    features,
    lineage,
    stateViolations: candidateStateViolations(artifact, request, lineage),
  };
}

function parseExternalEvidenceBody(
  value: unknown,
  artifactId: ArtifactId,
): ExternalSelectionEvidenceInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CandidateSelectionError(
      "CANDIDATE_SELECTION_EXTERNAL_EVIDENCE_INVALID",
      `External evidence ${artifactId} must contain one JSON object.`,
    );
  }
  const body = value as Partial<ExternalSelectionEvidenceInput>;
  if (
    body.schemaVersion !== "1.0" ||
    body.protocolVersion !== SELECTION_PROTOCOL_VERSION ||
    typeof body.evidenceKind !== "string" ||
    typeof body.candidateArtifactId !== "string" ||
    typeof body.referenceArtifactId !== "string" ||
    typeof body.score !== "number" ||
    !Number.isFinite(body.score) ||
    body.score < 0 ||
    body.score > 1 ||
    typeof body.generatedAt !== "string" ||
    !body.model ||
    typeof body.model.name !== "string" ||
    typeof body.model.version !== "string" ||
    typeof body.model.sha256 !== "string" ||
    !SHA256.test(body.model.sha256) ||
    typeof body.model.preprocessingSha256 !== "string" ||
    !SHA256.test(body.model.preprocessingSha256)
  ) {
    throw new CandidateSelectionError(
      "CANDIDATE_SELECTION_EXTERNAL_EVIDENCE_INVALID",
      `External evidence ${artifactId} is missing required bound model evidence.`,
    );
  }
  if (!Number.isFinite(Date.parse(body.generatedAt))) {
    throw new CandidateSelectionError(
      "CANDIDATE_SELECTION_EXTERNAL_EVIDENCE_INVALID",
      `External evidence ${artifactId} has an invalid generatedAt timestamp.`,
    );
  }
  return body as ExternalSelectionEvidenceInput;
}

async function resolveExternalEvidence(
  artifacts: ArtifactStore,
  request: NormalizedCandidateSelectionRequest,
): Promise<readonly ParsedExternalEvidence[]> {
  const result: ParsedExternalEvidence[] = [];
  const keys = new Set<string>();
  for (const artifactId of request.externalEvidenceArtifactIds) {
    const artifact = await verifiedArtifact(
      artifacts,
      artifactId,
      "external selection evidence",
    );
    if (
      artifact.storageClass !== "evidence" ||
      artifact.mediaType !== "application/json" ||
      artifact.labels.artifactRole !== "selection-model-evidence"
    ) {
      throw new CandidateSelectionError(
        "CANDIDATE_SELECTION_EXTERNAL_EVIDENCE_STATE_INVALID",
        `External evidence ${artifactId} is not a selection-model-evidence JSON artifact.`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse((await artifacts.read(artifactId)).toString("utf8")) as unknown;
    } catch {
      throw new CandidateSelectionError(
        "CANDIDATE_SELECTION_EXTERNAL_EVIDENCE_INVALID",
        `External evidence ${artifactId} is not valid JSON.`,
      );
    }
    const value = parseExternalEvidenceBody(parsed, artifactId);
    if (!request.candidateArtifactIds.includes(value.candidateArtifactId)) {
      throw new CandidateSelectionError(
        "CANDIDATE_SELECTION_EXTERNAL_EVIDENCE_BINDING_INVALID",
        `External evidence ${artifactId} targets a candidate outside this selection.`,
      );
    }
    if (value.referenceArtifactId !== request.referenceArtifactId) {
      throw new CandidateSelectionError(
        "CANDIDATE_SELECTION_EXTERNAL_EVIDENCE_BINDING_INVALID",
        `External evidence ${artifactId} targets a different reference artifact.`,
      );
    }
    const key = `${value.candidateArtifactId}\0${value.evidenceKind}`;
    if (keys.has(key)) {
      throw new CandidateSelectionError(
        "CANDIDATE_SELECTION_EXTERNAL_EVIDENCE_DUPLICATE",
        `More than one ${value.evidenceKind} record targets ${value.candidateArtifactId}.`,
      );
    }
    keys.add(key);
    result.push({ artifactId, value });
  }
  return result;
}

function externalFor(
  evidence: readonly ParsedExternalEvidence[],
  candidateArtifactId: ArtifactId,
  kind: ExternalSelectionEvidenceKind,
): ParsedExternalEvidence | undefined {
  return evidence.find(
    (entry) =>
      entry.value.candidateArtifactId === candidateArtifactId &&
      entry.value.evidenceKind === kind,
  );
}

function rankingFor(
  candidate: ResolvedSelectionImage,
  reference: ResolvedSelectionImage,
  request: NormalizedCandidateSelectionRequest,
  externalEvidence: readonly ParsedExternalEvidence[],
): Omit<CandidateSelectionRankingEntry, "rank"> {
  const comparison = compareSelectionImages(candidate.features, reference.features, {
    maximumTranslationPixels: request.policy.maximumTranslationPixels,
    maximumEdgeDistancePixels: request.policy.maximumEdgeDistancePixels,
  });
  const totalWeight =
    request.policy.metrics.reduce((sum, entry) => sum + entry.weight, 0) +
    request.policy.externalEvidence.reduce((sum, entry) => sum + entry.weight, 0);
  const metricReadings: CandidateMetricReading[] = request.policy.metrics.map(
    (policy) => {
      const metric = comparison.metrics[policy.id];
      const passed = metric.score >= policy.minimum;
      return {
        id: policy.id,
        score: metric.score,
        weight: policy.weight,
        weightedScore: totalWeight ? (metric.score * policy.weight) / totalWeight : 0,
        minimum: policy.minimum,
        blocking: policy.blocking,
        passed,
        evidence: metric.evidence,
      };
    },
  );
  const externalReadings: CandidateExternalEvidenceReading[] =
    request.policy.externalEvidence.map((policy) => {
      const matched = externalFor(
        externalEvidence,
        candidate.artifact.artifactId,
        policy.kind,
      );
      const score = matched?.value.score ?? null;
      const passed = score === null ? !policy.required : score >= policy.minimum;
      return {
        kind: policy.kind,
        score,
        weight: policy.weight,
        weightedScore:
          score === null || !totalWeight ? 0 : (score * policy.weight) / totalWeight,
        minimum: policy.minimum,
        blocking: policy.blocking,
        required: policy.required,
        requiredForAutomatic: policy.requiredForAutomatic,
        passed,
        ...(matched ? { evidenceArtifactId: matched.artifactId } : {}),
        ...(matched ? { model: matched.value.model } : {}),
      };
    });

  const violations = [...candidate.stateViolations];
  if (
    candidate.features.width !== reference.features.width ||
    candidate.features.height !== reference.features.height
  ) {
    violations.push(
      `candidate dimensions ${candidate.features.width}x${candidate.features.height} do not match reference ${reference.features.width}x${reference.features.height}`,
    );
  }
  for (const reading of metricReadings) {
    if (reading.blocking && !reading.passed) {
      violations.push(
        `${reading.id} ${reading.score.toFixed(6)} is below ${reading.minimum.toFixed(6)}`,
      );
    }
  }
  for (const reading of externalReadings) {
    if (reading.required && reading.score === null) {
      violations.push(`required ${reading.kind} evidence is missing`);
    } else if (reading.blocking && reading.score !== null && !reading.passed) {
      violations.push(
        `${reading.kind} ${reading.score.toFixed(6)} is below ${reading.minimum.toFixed(6)}`,
      );
    }
  }

  const score = Math.max(
    0,
    Math.min(
      1,
      metricReadings.reduce((sum, entry) => sum + entry.weightedScore, 0) +
        externalReadings.reduce((sum, entry) => sum + entry.weightedScore, 0),
    ),
  );
  const automaticEvidenceComplete = externalReadings.every(
    (entry) =>
      !entry.requiredForAutomatic ||
      (entry.score !== null && entry.score >= entry.minimum),
  );

  return {
    candidateArtifactId: candidate.artifact.artifactId,
    descriptorSha256: candidate.artifact.descriptorSha256,
    contentSha256: candidate.artifact.contentSha256,
    artifactRole: candidate.artifact.labels.artifactRole ?? "",
    score,
    hardGatesPassed: violations.length === 0,
    automaticEvidenceComplete,
    alignment: comparison.alignment,
    metrics: metricReadings,
    externalEvidence: externalReadings,
    violations,
  };
}

function sortRanking(
  values: readonly Omit<CandidateSelectionRankingEntry, "rank">[],
): readonly CandidateSelectionRankingEntry[] {
  return [...values]
    .sort(
      (left, right) =>
        Number(right.hardGatesPassed) - Number(left.hardGatesPassed) ||
        right.score - left.score ||
        left.candidateArtifactId.localeCompare(right.candidateArtifactId),
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export async function executeCandidateSelection(
  input: unknown,
  options: CandidateSelectionOptions,
): Promise<CandidateSelectionRunResult> {
  const request = validateCandidateSelectionRequest(input);
  const maximumInputBytes = integer(
    options.maximumInputBytes,
    DEFAULT_MAXIMUM_INPUT_BYTES,
    1,
    512 * 1024 * 1024,
    "maximumInputBytes",
  );
  const maximumPixels = integer(
    options.maximumPixels,
    DEFAULT_MAXIMUM_PIXELS,
    1,
    67_108_864,
    "maximumPixels",
  );
  const maximumLineageDepth = integer(
    options.maximumLineageDepth,
    DEFAULT_MAXIMUM_LINEAGE_DEPTH,
    1,
    128,
    "maximumLineageDepth",
  );
  const decodeConcurrency = integer(
    options.decodeConcurrency,
    DEFAULT_DECODE_CONCURRENCY,
    1,
    16,
    "decodeConcurrency",
  );
  const now = options.now ?? (() => new Date());
  const referenceArtifact = await verifiedArtifact(
    options.artifacts,
    request.referenceArtifactId,
    request.referenceRole,
  );
  if (!IMAGE_MEDIA_TYPES.has(referenceArtifact.mediaType)) {
    throw new CandidateSelectionError(
      "CANDIDATE_SELECTION_REFERENCE_MEDIA_INVALID",
      "Selection reference must contain PNG, WebP or JPEG image bytes.",
    );
  }
  const referenceBytes = await options.artifacts.read(referenceArtifact.artifactId);
  const referenceFeatures = await decodeSelectionImage(referenceBytes, {
    alphaVisibleThreshold: request.policy.alphaVisibleThreshold,
    maximumInputBytes,
    maximumPixels,
  });
  if (referenceFeatures.encodedSha256 !== referenceArtifact.contentSha256) {
    throw new CandidateSelectionError(
      "CANDIDATE_SELECTION_CONTENT_HASH_MISMATCH",
      "Reference bytes do not match the immutable descriptor hash.",
    );
  }
  const reference: ResolvedSelectionImage = {
    artifact: referenceArtifact,
    features: referenceFeatures,
    lineage: new Set(),
    stateViolations: [],
  };
  const candidates = await mapLimit(
    request.candidateArtifactIds,
    decodeConcurrency,
    (artifactId) =>
      resolveSelectionImage(options.artifacts, artifactId, request, {
        maximumInputBytes,
        maximumPixels,
        maximumLineageDepth,
      }),
  );
  const externalEvidence = await resolveExternalEvidence(
    options.artifacts,
    request,
  );
  const ranking = sortRanking(
    candidates.map((candidate) =>
      rankingFor(candidate, reference, request, externalEvidence),
    ),
  );
  const eligible = ranking.filter((entry) => entry.hardGatesPassed);
  const recommended = eligible[0];
  const runnerUp = eligible[1];
  const winnerMargin = recommended
    ? Math.max(0, recommended.score - (runnerUp?.score ?? 0))
    : 0;
  const decision = !recommended
    ? ("rejected" as const)
    : request.policy.allowAutomaticSelection &&
        recommended.score >= request.policy.minimumOverallScore &&
        winnerMargin >= request.policy.minimumWinnerMargin &&
        recommended.automaticEvidenceComplete
      ? ("selected" as const)
      : ("review-required" as const);
  const completedAt = nowIso(now);
  const evidence: CandidateSelectionEvidence = {
    schemaVersion: "1.0",
    protocolVersion: SELECTION_PROTOCOL_VERSION,
    selectionId: request.selectionId,
    requestSha256: selectionRequestSha256(request),
    decision,
    ...(recommended
      ? { recommendedCandidateArtifactId: recommended.candidateArtifactId }
      : {}),
    ...(decision === "selected" && recommended
      ? { selectedCandidateArtifactId: recommended.candidateArtifactId }
      : {}),
    promotionEligible: decision === "selected",
    winnerMargin,
    completedAt,
    reference: {
      artifactId: referenceArtifact.artifactId,
      descriptorSha256: referenceArtifact.descriptorSha256,
      contentSha256: referenceArtifact.contentSha256,
      mediaType: referenceArtifact.mediaType,
      width: referenceFeatures.width,
      height: referenceFeatures.height,
    },
    policy: request.policy,
    ranking,
    externalEvidenceArtifactIds: request.externalEvidenceArtifactIds,
    ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
  };
  const sourceArtifacts = [
    request.referenceArtifactId,
    ...request.candidateArtifactIds,
    ...request.externalEvidenceArtifactIds,
  ].sort() as readonly ArtifactId[];
  const stored = await options.artifacts.put(
    `${JSON.stringify(normalizeJson(evidence), null, 2)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: `${request.selectionId}.selection.evidence.json`,
      sourceArtifacts,
      labels: {
        artifactRole: "candidate-selection-evidence",
        selectionId: request.selectionId,
        decision,
        promotionEligible: String(decision === "selected"),
        ...(recommended
          ? { recommendedCandidateArtifactId: recommended.candidateArtifactId }
          : {}),
      },
      metadata: normalizeJson({
        schemaVersion: "1.0",
        protocolVersion: SELECTION_PROTOCOL_VERSION,
        requestSha256: evidence.requestSha256,
        candidateCount: request.candidateArtifactIds.length,
        eligibleCandidateCount: eligible.length,
        winnerMargin,
      }),
    },
  );
  return { evidenceArtifactId: stored.artifactId, evidence };
}
