import {
  normalizeJson,
  type ArtifactId,
  type ArtifactStore,
  type JsonValue,
  type StoredArtifact,
} from "@evavo/art-artifacts";
import {
  selectionRequestSha256,
  validateCandidateSelectionRequest,
  type NormalizedCandidateSelectionRequest,
} from "@evavo/art-selection";
import type { SpriteFamilyConsistencyEvidence } from "@evavo/art-sprite-family";

import {
  REPAIRED_FAMILY_REVISION_PROTOCOL_VERSION,
  type RepairedFamilyRevisionEvidence,
} from "./revision-types.js";
import {
  REPAIRED_FAMILY_SELECTION_PROTOCOL_VERSION,
  RepairedFamilySelectionError,
  type NormalizedRepairedFamilySelectionRequest,
  type RepairedFamilySelectionEvidence,
  type RepairedFamilySelectionOptions,
  type RepairedFamilySelectionRequestInput,
  type RepairedFamilySelectionResult,
} from "./revision-selection-types.js";
import {
  repairedFamilySelectionRequestSha256,
  validateRepairedFamilySelectionRequest,
} from "./revision-selection-validation.js";

const IMAGE_MEDIA_TYPES = new Set(["image/png", "image/webp", "image/jpeg"]);
const MAXIMUM_LINEAGE_DEPTH = 32;

interface ResolvedRevision {
  readonly artifact: StoredArtifact;
  readonly evidence: RepairedFamilyRevisionEvidence;
  readonly candidate: StoredArtifact;
  readonly familyEvidenceArtifact: StoredArtifact;
  readonly familyEvidence: SpriteFamilyConsistencyEvidence;
  readonly revisedManifestArtifact: StoredArtifact;
  readonly referenceArtifact: StoredArtifact;
  readonly referenceArtifactId: ArtifactId;
  readonly targetSignature: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function fail(code: string, message: string, details?: JsonValue): never {
  throw new RepairedFamilySelectionError(code, message, details);
}

function nowIso(now: () => Date): string {
  const value = now();
  if (!Number.isFinite(value.getTime())) {
    fail(
      "REPAIRED_FAMILY_SELECTION_CLOCK_INVALID",
      "Revision selection clock returned an invalid date.",
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
    fail(
      "REPAIRED_FAMILY_SELECTION_ARTIFACT_NOT_FOUND",
      `${role} artifact was not found: ${artifactId}`,
    );
  }
  if (!verification.descriptorValid || !verification.contentValid) {
    fail(
      "REPAIRED_FAMILY_SELECTION_ARTIFACT_VERIFICATION_FAILED",
      `${role} artifact failed immutable descriptor or content verification: ${artifactId}`,
    );
  }
  return artifact;
}

async function readJson(
  artifacts: ArtifactStore,
  artifact: StoredArtifact,
  role: string,
): Promise<unknown> {
  try {
    return JSON.parse((await artifacts.read(artifact.artifactId)).toString("utf8")) as unknown;
  } catch (error: unknown) {
    fail(
      "REPAIRED_FAMILY_SELECTION_JSON_INVALID",
      `${role} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function parseRevisionEvidence(
  value: unknown,
  artifactId: ArtifactId,
): RepairedFamilyRevisionEvidence {
  if (!isRecord(value)) {
    fail(
      "REPAIRED_FAMILY_SELECTION_REVISION_EVIDENCE_INVALID",
      `Revision evidence ${artifactId} must contain one JSON object.`,
    );
  }
  if (
    value.schemaVersion !== "1.0" ||
    value.protocolVersion !== REPAIRED_FAMILY_REVISION_PROTOCOL_VERSION ||
    typeof value.revisionId !== "string" ||
    typeof value.repairId !== "string" ||
    typeof value.familyId !== "string" ||
    typeof value.requestSha256 !== "string" ||
    typeof value.sourceManifestArtifactId !== "string" ||
    typeof value.sourceManifestSha256 !== "string" ||
    typeof value.repairPacketArtifactId !== "string" ||
    typeof value.repairExecutionEvidenceArtifactId !== "string" ||
    typeof value.restoredCandidateArtifactId !== "string" ||
    typeof value.qualityEvidenceArtifactId !== "string" ||
    typeof value.qualityCandidateArtifactId !== "string" ||
    !isRecord(value.quality) ||
    value.quality.passed !== true ||
    !Array.isArray(value.impactedFrameIds) ||
    !Array.isArray(value.replacements) ||
    value.replacements.length === 0 ||
    typeof value.revisedManifestArtifactId !== "string" ||
    typeof value.revisedManifestSha256 !== "string" ||
    typeof value.familyEvidenceArtifactId !== "string" ||
    typeof value.kernelFamilyEvidenceArtifactId !== "string" ||
    !Array.isArray(value.generatedCompositeArtifactIds) ||
    value.passed !== true ||
    typeof value.completedAt !== "string"
  ) {
    fail(
      "REPAIRED_FAMILY_SELECTION_REVISION_EVIDENCE_INVALID",
      `Revision evidence ${artifactId} is incomplete or did not pass all revision gates.`,
    );
  }
  return value as unknown as RepairedFamilyRevisionEvidence;
}

function parseFamilyEvidence(
  value: unknown,
  artifactId: ArtifactId,
): SpriteFamilyConsistencyEvidence {
  if (!isRecord(value)) {
    fail(
      "REPAIRED_FAMILY_SELECTION_FAMILY_EVIDENCE_INVALID",
      `Family evidence ${artifactId} must contain one JSON object.`,
    );
  }
  if (
    value.schemaVersion !== "1.0" ||
    typeof value.familyId !== "string" ||
    typeof value.manifestSha256 !== "string" ||
    typeof value.manifestArtifactId !== "string" ||
    typeof value.kernelEvidenceArtifactId !== "string" ||
    value.passed !== true ||
    !Array.isArray(value.frameEvidence) ||
    !Array.isArray(value.familyGates) ||
    !Array.isArray(value.generatedCompositeArtifactIds) ||
    !Array.isArray(value.sourceArtifactIds)
  ) {
    fail(
      "REPAIRED_FAMILY_SELECTION_FAMILY_EVIDENCE_INVALID",
      `Family evidence ${artifactId} is incomplete or contains blocking failures.`,
    );
  }
  return value as unknown as SpriteFamilyConsistencyEvidence;
}

async function collectLineage(
  artifacts: ArtifactStore,
  artifact: StoredArtifact,
): Promise<ReadonlySet<ArtifactId>> {
  const lineage = new Set<ArtifactId>();
  const queue = artifact.sourceArtifacts.map((artifactId) => ({
    artifactId,
    depth: 1,
  }));
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (lineage.has(next.artifactId)) continue;
    lineage.add(next.artifactId);
    if (next.depth >= MAXIMUM_LINEAGE_DEPTH) continue;
    const source = await verifiedArtifact(
      artifacts,
      next.artifactId,
      "revision candidate lineage",
    );
    for (const sourceArtifactId of source.sourceArtifacts) {
      queue.push({ artifactId: sourceArtifactId, depth: next.depth + 1 });
    }
  }
  return lineage;
}

function exactStrings(left: readonly string[], right: readonly string[]): boolean {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}

function targetSignature(evidence: RepairedFamilyRevisionEvidence): readonly string[] {
  return evidence.replacements
    .map(
      (entry) =>
        `${entry.frameId}\0${entry.layerId}\0${entry.layerRole}\0${entry.sourcePolicy}\0${entry.originalArtifactId}`,
    )
    .sort();
}

async function resolveRevision(
  artifacts: ArtifactStore,
  artifactId: ArtifactId,
): Promise<ResolvedRevision> {
  const artifact = await verifiedArtifact(artifacts, artifactId, "revision evidence");
  if (
    artifact.storageClass !== "evidence" ||
    artifact.mediaType !== "application/json" ||
    artifact.labels.artifactRole !== "repaired-family-revision-evidence" ||
    artifact.labels.approvalState !== "evidence-only" ||
    artifact.labels.qualityState !== "passed" ||
    artifact.labels.finalDeliverable !== "false"
  ) {
    fail(
      "REPAIRED_FAMILY_SELECTION_REVISION_ROLE_INVALID",
      `${artifactId} must be passed, evidence-only repaired-family-revision-evidence.`,
    );
  }
  const evidence = parseRevisionEvidence(
    await readJson(artifacts, artifact, "revision evidence"),
    artifactId,
  );
  if (
    artifact.labels.revisionId !== evidence.revisionId ||
    artifact.labels.repairId !== evidence.repairId ||
    artifact.labels.familyId !== evidence.familyId
  ) {
    fail(
      "REPAIRED_FAMILY_SELECTION_REVISION_LABEL_MISMATCH",
      `${artifactId} labels do not match its immutable revision evidence body.`,
    );
  }
  const requiredRevisionSources = [
    evidence.sourceManifestArtifactId,
    evidence.repairPacketArtifactId,
    evidence.repairExecutionEvidenceArtifactId,
    evidence.restoredCandidateArtifactId,
    evidence.qualityEvidenceArtifactId,
    evidence.qualityCandidateArtifactId,
    evidence.revisedManifestArtifactId,
    evidence.familyEvidenceArtifactId,
    evidence.kernelFamilyEvidenceArtifactId,
    ...evidence.generatedCompositeArtifactIds,
  ];
  const revisionSources = new Set(artifact.sourceArtifacts);
  const missingRevisionSources = requiredRevisionSources.filter(
    (sourceArtifactId) => !revisionSources.has(sourceArtifactId),
  );
  if (missingRevisionSources.length > 0) {
    fail(
      "REPAIRED_FAMILY_SELECTION_REVISION_LINEAGE_INCOMPLETE",
      `${artifactId} is missing required immutable revision sources.`,
      normalizeJson({ missingRevisionSources }),
    );
  }

  const candidate = await verifiedArtifact(
    artifacts,
    evidence.qualityCandidateArtifactId,
    "quality-passed revision candidate",
  );
  if (
    candidate.storageClass !== "intermediate" ||
    candidate.mediaType !== "image/png" ||
    candidate.labels.artifactRole !== "repaired-family-quality-candidate" ||
    candidate.labels.approvalState !== "unapproved" ||
    candidate.labels.qualityState !== "passed" ||
    candidate.labels.finalDeliverable !== "false" ||
    candidate.labels.revisionId !== evidence.revisionId ||
    candidate.labels.repairId !== evidence.repairId ||
    candidate.labels.familyId !== evidence.familyId
  ) {
    fail(
      "REPAIRED_FAMILY_SELECTION_CANDIDATE_STATE_INVALID",
      `${evidence.qualityCandidateArtifactId} is not the passed unapproved candidate declared by ${artifactId}.`,
    );
  }
  for (const replacement of evidence.replacements) {
    if (replacement.replacementArtifactId !== candidate.artifactId) {
      fail(
        "REPAIRED_FAMILY_SELECTION_REPLACEMENT_BINDING_INVALID",
        `${artifactId} contains a replacement that does not use its quality-passed candidate.`,
      );
    }
  }
  const referenceIds = [...new Set(evidence.replacements.map((entry) => entry.originalArtifactId))];
  if (referenceIds.length !== 1) {
    fail(
      "REPAIRED_FAMILY_SELECTION_REFERENCE_AMBIGUOUS",
      `${artifactId} must repair exactly one immutable source artifact.`,
      normalizeJson({ referenceIds }),
    );
  }
  const referenceArtifactId = referenceIds[0]!;
  const referenceArtifact = await verifiedArtifact(
    artifacts,
    referenceArtifactId,
    "approved repair reference",
  );
  if (
    !IMAGE_MEDIA_TYPES.has(referenceArtifact.mediaType) ||
    referenceArtifact.labels.qualityState !== "passed" ||
    !new Set(["approved", "selected"]).has(
      referenceArtifact.labels.approvalState ?? "",
    )
  ) {
    fail(
      "REPAIRED_FAMILY_SELECTION_REFERENCE_STATE_INVALID",
      `${referenceArtifactId} must be a quality-passed approved or selected image source.`,
    );
  }
  const candidateLineage = await collectLineage(artifacts, candidate);
  if (!candidateLineage.has(referenceArtifactId)) {
    fail(
      "REPAIRED_FAMILY_SELECTION_REFERENCE_LINEAGE_MISSING",
      `${candidate.artifactId} has no immutable lineage to ${referenceArtifactId}.`,
    );
  }

  const familyEvidenceArtifact = await verifiedArtifact(
    artifacts,
    evidence.familyEvidenceArtifactId,
    "reverified family evidence",
  );
  if (
    familyEvidenceArtifact.storageClass !== "evidence" ||
    familyEvidenceArtifact.mediaType !== "application/json" ||
    familyEvidenceArtifact.labels.artifactRole !==
      "sprite-family-consistency-evidence" ||
    familyEvidenceArtifact.labels.qualityState !== "passed" ||
    familyEvidenceArtifact.labels.approvalState !== "evidence-only"
  ) {
    fail(
      "REPAIRED_FAMILY_SELECTION_FAMILY_EVIDENCE_STATE_INVALID",
      `${evidence.familyEvidenceArtifactId} is not passed manifest-bound family evidence.`,
    );
  }
  const familyEvidence = parseFamilyEvidence(
    await readJson(artifacts, familyEvidenceArtifact, "reverified family evidence"),
    familyEvidenceArtifact.artifactId,
  );
  if (
    familyEvidence.familyId !== evidence.familyId ||
    familyEvidence.manifestArtifactId !== evidence.revisedManifestArtifactId ||
    familyEvidence.manifestSha256 !== evidence.revisedManifestSha256 ||
    familyEvidence.kernelEvidenceArtifactId !== evidence.kernelFamilyEvidenceArtifactId
  ) {
    fail(
      "REPAIRED_FAMILY_SELECTION_FAMILY_BINDING_INVALID",
      `${artifactId} is not bound to its declared passed family verification.`,
    );
  }

  const revisedManifestArtifact = await verifiedArtifact(
    artifacts,
    evidence.revisedManifestArtifactId,
    "revised family manifest",
  );
  if (
    revisedManifestArtifact.storageClass !== "manifest" ||
    revisedManifestArtifact.mediaType !== "application/json" ||
    revisedManifestArtifact.labels.artifactRole !==
      "sprite-family-normalized-manifest" ||
    revisedManifestArtifact.labels.manifestSha256 !== evidence.revisedManifestSha256
  ) {
    fail(
      "REPAIRED_FAMILY_SELECTION_MANIFEST_STATE_INVALID",
      `${evidence.revisedManifestArtifactId} does not match the revision manifest hash.`,
    );
  }

  return {
    artifact,
    evidence,
    candidate,
    familyEvidenceArtifact,
    familyEvidence,
    revisedManifestArtifact,
    referenceArtifact,
    referenceArtifactId,
    targetSignature: targetSignature(evidence),
  };
}

async function assertExternalEvidenceStates(
  artifacts: ArtifactStore,
  artifactIds: readonly ArtifactId[],
): Promise<void> {
  for (const artifactId of artifactIds) {
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
      fail(
        "REPAIRED_FAMILY_SELECTION_EXTERNAL_EVIDENCE_INVALID",
        `${artifactId} must reference selection-model-evidence JSON.`,
      );
    }
  }
}

function selectionJob(
  request: NormalizedCandidateSelectionRequest,
  requestSha256: string,
  bridge: NormalizedRepairedFamilySelectionRequest,
  revisions: readonly ResolvedRevision[],
): JsonValue {
  return normalizeJson({
    queue: "selection",
    kind: "art.candidate.select",
    idempotencyKey: `revision-selection:${bridge.bridgeId}:${requestSha256}`,
    payload: request,
    inputArtifacts: [
      request.referenceArtifactId,
      ...request.candidateArtifactIds,
      ...request.externalEvidenceArtifactIds,
      ...bridge.revisionEvidenceArtifactIds,
      ...revisions.map((entry) => entry.evidence.familyEvidenceArtifactId),
      ...revisions.map((entry) => entry.evidence.revisedManifestArtifactId),
    ].filter((value, index, values) => values.indexOf(value) === index).sort(),
    requiredCapabilities: ["selection.compare", "evidence.bundle"],
    maximumAttempts: 1,
    leaseDurationMs: 120_000,
    timeoutMs: 900_000,
    labels: {
      bridgeId: bridge.bridgeId,
      repairId: revisions[0]!.evidence.repairId,
      familyId: revisions[0]!.evidence.familyId,
      stage: "repaired-family-candidate-selection",
    },
  });
}

export async function prepareRepairedFamilySelection(
  input: RepairedFamilySelectionRequestInput | unknown,
  options: RepairedFamilySelectionOptions,
): Promise<RepairedFamilySelectionResult> {
  const request = validateRepairedFamilySelectionRequest(input);
  const now = options.now ?? (() => new Date());
  const completedAt = nowIso(now);
  const revisions = await Promise.all(
    request.revisionEvidenceArtifactIds.map((artifactId) =>
      resolveRevision(options.artifacts, artifactId),
    ),
  );
  await assertExternalEvidenceStates(
    options.artifacts,
    request.externalEvidenceArtifactIds,
  );

  const first = revisions[0]!;
  for (const revision of revisions.slice(1)) {
    if (
      revision.evidence.repairId !== first.evidence.repairId ||
      revision.evidence.familyId !== first.evidence.familyId ||
      revision.evidence.sourceManifestArtifactId !==
        first.evidence.sourceManifestArtifactId ||
      revision.evidence.sourceManifestSha256 !==
        first.evidence.sourceManifestSha256 ||
      revision.referenceArtifactId !== first.referenceArtifactId ||
      !exactStrings(
        revision.evidence.impactedFrameIds,
        first.evidence.impactedFrameIds,
      ) ||
      !exactStrings(revision.targetSignature, first.targetSignature)
    ) {
      fail(
        "REPAIRED_FAMILY_SELECTION_REVISION_SET_MISMATCH",
        "All revision candidates must describe the same repair, source manifest, source layer and impacted frame set.",
        normalizeJson({
          firstRevisionId: first.evidence.revisionId,
          conflictingRevisionId: revision.evidence.revisionId,
        }),
      );
    }
  }

  const candidateArtifactIds = revisions
    .map((entry) => entry.candidate.artifactId)
    .sort() as readonly ArtifactId[];
  if (new Set(candidateArtifactIds).size !== candidateArtifactIds.length) {
    fail(
      "REPAIRED_FAMILY_SELECTION_CANDIDATES_DUPLICATE",
      "Revision evidence must resolve to distinct candidate artifacts.",
    );
  }

  const selectionRequest = validateCandidateSelectionRequest({
    schemaVersion: "1.0",
    selectionId: `${request.bridgeId}:selection`,
    candidateArtifactIds,
    referenceArtifactId: first.referenceArtifactId,
    referenceRole: "repaired-layer-source",
    externalEvidenceArtifactIds: request.externalEvidenceArtifactIds,
    policy: {
      ...request.policy,
      requireReferenceLineage: true,
      requireQualityPassed: true,
      allowedCandidateRoles: ["repaired-family-quality-candidate"],
    },
    metadata: {
      bridgeProtocolVersion: REPAIRED_FAMILY_SELECTION_PROTOCOL_VERSION,
      bridgeId: request.bridgeId,
      repairId: first.evidence.repairId,
      familyId: first.evidence.familyId,
      sourceManifestArtifactId: first.evidence.sourceManifestArtifactId,
      revisionEvidenceArtifactIds: request.revisionEvidenceArtifactIds,
      revisionIds: revisions.map((entry) => entry.evidence.revisionId).sort(),
      ...(request.metadata === undefined ? {} : { requestMetadata: request.metadata }),
    },
  });
  const selectionRequestHash = selectionRequestSha256(selectionRequest);
  const compiledSelectionJob = selectionJob(
    selectionRequest,
    selectionRequestHash,
    request,
    revisions,
  );
  const requestSha256 = repairedFamilySelectionRequestSha256(request);
  const evidence: RepairedFamilySelectionEvidence = {
    schemaVersion: "1.0",
    protocolVersion: REPAIRED_FAMILY_SELECTION_PROTOCOL_VERSION,
    bridgeId: request.bridgeId,
    requestSha256,
    repairId: first.evidence.repairId,
    familyId: first.evidence.familyId,
    sourceManifestArtifactId: first.evidence.sourceManifestArtifactId,
    sourceManifestSha256: first.evidence.sourceManifestSha256,
    referenceArtifactId: first.referenceArtifactId,
    revisionEvidenceArtifactIds: request.revisionEvidenceArtifactIds,
    revisionIds: revisions.map((entry) => entry.evidence.revisionId).sort(),
    candidateArtifactIds,
    familyEvidenceArtifactIds: revisions
      .map((entry) => entry.familyEvidenceArtifact.artifactId)
      .sort(),
    revisedManifestArtifactIds: revisions
      .map((entry) => entry.revisedManifestArtifact.artifactId)
      .sort(),
    externalEvidenceArtifactIds: request.externalEvidenceArtifactIds,
    selectionRequest,
    selectionRequestSha256: selectionRequestHash,
    selectionJob: compiledSelectionJob,
    passed: true,
    completedAt,
    ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
  };
  const sourceArtifacts = [
    first.referenceArtifactId,
    ...request.revisionEvidenceArtifactIds,
    ...candidateArtifactIds,
    ...evidence.familyEvidenceArtifactIds,
    ...evidence.revisedManifestArtifactIds,
    ...request.externalEvidenceArtifactIds,
  ].filter((value, index, values) => values.indexOf(value) === index).sort() as readonly ArtifactId[];
  const stored = await options.artifacts.put(
    `${JSON.stringify(normalizeJson(evidence), null, 2)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: `${request.bridgeId}.repaired-family-selection.json`,
      sourceArtifacts,
      labels: {
        artifactRole: "repaired-family-selection-bridge-evidence",
        approvalState: "evidence-only",
        qualityState: "passed",
        finalDeliverable: "false",
        bridgeId: request.bridgeId,
        repairId: first.evidence.repairId,
        familyId: first.evidence.familyId,
      },
      metadata: normalizeJson({
        requestSha256,
        selectionRequestSha256: selectionRequestHash,
        revisionCount: revisions.length,
        candidateCount: candidateArtifactIds.length,
        externalEvidenceCount: request.externalEvidenceArtifactIds.length,
        automaticSelectionRequested:
          selectionRequest.policy.allowAutomaticSelection,
      }),
    },
  );
  return {
    evidenceArtifactId: stored.artifactId,
    evidence,
    selectionRequest,
    selectionJob: compiledSelectionJob,
  };
}
