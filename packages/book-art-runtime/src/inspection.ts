import {
  normalizeJson,
  sha256,
  stableStringify,
  type ArtifactId,
  type ArtifactStore,
  type StoredArtifact,
} from "@evavo/art-artifacts";
import type { BookArtIdentityV1 } from "@evavo/art-contracts";
import {
  providerRequestSha256,
  validateProviderCandidateRequest,
} from "@evavo/art-providers";
import type {
  RuntimeFailure,
  RuntimeJobRecord,
  RuntimeJobState,
  RuntimeRepository,
} from "@evavo/art-runtime";

import type {
  BookArtProviderShadowJobCompilationResultV1,
  BookArtProviderShadowJobPlanV1,
} from "./index.js";

export type BookArtProviderShadowInspectionStatus =
  | "blocked"
  | "not-submitted"
  | "pending"
  | "failed"
  | "succeeded";

export interface BookArtProviderRuntimeProofV1 {
  readonly jobId: string;
  readonly specHash: string;
  readonly state: RuntimeJobState;
  readonly attemptLimit: number;
  readonly attemptCount: number;
  readonly outputArtifactIds: readonly ArtifactId[];
  readonly failure?: Readonly<{
    classification: RuntimeFailure["classification"];
    code: string;
    message: string;
  }>;
}

export interface BookArtProviderArtifactProofV1 {
  readonly artifactId: ArtifactId;
  readonly descriptorSha256: string;
  readonly contentSha256: string;
  readonly sizeBytes: number;
  readonly mediaType: string;
  readonly storageClass: StoredArtifact["storageClass"];
  readonly artifactRole: string | null;
  readonly approvalState: string | null;
  readonly qualityState: string | null;
}

export interface BookArtProviderShadowJobInspectionResultV1 {
  readonly outputKind: "evavo_book_art_provider_shadow_job_inspection_result";
  readonly schemaVersion: 1;
  readonly status: BookArtProviderShadowInspectionStatus;
  readonly identity: BookArtIdentityV1;
  readonly planFingerprintSha256?: string;
  readonly runtimeJob?: BookArtProviderRuntimeProofV1;
  readonly candidate?: BookArtProviderArtifactProofV1;
  readonly providerEvidence?: BookArtProviderArtifactProofV1;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly inspectionFingerprintSha256: string;
  readonly shadowOnly: true;
  readonly inspectionReadOnly: true;
  readonly providerCallPerformedByInspection: false;
  readonly candidateArtifactsWrittenByInspection: false;
  readonly providerExecutionObserved: boolean;
  readonly candidateArtifactObserved: boolean;
  readonly providerEvidenceObserved: boolean;
  readonly authoritativeBookWritesPerformed: false;
  readonly selectionPerformed: false;
  readonly promotionPerformed: false;
  readonly bookUseBindingCreated: false;
  readonly runtimeCutoverApproved: false;
  readonly publicationPerformed: false;
}

export interface InspectBookArtProviderShadowJobOptions {
  readonly runtime: RuntimeRepository;
  readonly artifacts: ArtifactStore;
}

const ACTIVE_STATES = new Set<RuntimeJobState>([
  "waiting",
  "queued",
  "leased",
  "running",
  "retry-wait",
  "paused",
]);
const FAILED_STATES = new Set<RuntimeJobState>([
  "failed",
  "cancelled",
  "blocked",
  "dead-letter",
]);
const FORBIDDEN_ARTIFACT_ROLES = new Set([
  "selected-art-master",
  "candidate-promotion-authorization",
  "book-art-use-binding",
  "publication-package",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((entry) => entry.trim()).filter(Boolean))];
}

function fingerprint(value: unknown): string {
  return sha256(stableStringify(normalizeJson(value)));
}

function artifactProof(artifact: StoredArtifact): BookArtProviderArtifactProofV1 {
  return {
    artifactId: artifact.artifactId,
    descriptorSha256: artifact.descriptorSha256,
    contentSha256: artifact.contentSha256,
    sizeBytes: artifact.sizeBytes,
    mediaType: artifact.mediaType,
    storageClass: artifact.storageClass,
    artifactRole: artifact.labels.artifactRole ?? null,
    approvalState: artifact.labels.approvalState ?? null,
    qualityState: artifact.labels.qualityState ?? null,
  };
}

function runtimeProof(job: RuntimeJobRecord): BookArtProviderRuntimeProofV1 {
  return {
    jobId: job.id,
    specHash: job.specHash,
    state: job.state,
    attemptLimit: job.attemptLimit,
    attemptCount: job.attempts.length,
    outputArtifactIds: job.outputArtifacts,
    ...(job.failure === undefined
      ? {}
      : {
          failure: {
            classification: job.failure.classification,
            code: job.failure.code,
            message: job.failure.message,
          },
        }),
  };
}

function finish(
  input: Readonly<{
    status: BookArtProviderShadowInspectionStatus;
    identity: BookArtIdentityV1;
    planFingerprintSha256?: string;
    runtimeJob?: BookArtProviderRuntimeProofV1;
    candidate?: BookArtProviderArtifactProofV1;
    providerEvidence?: BookArtProviderArtifactProofV1;
    blockers: readonly string[];
    warnings: readonly string[];
    providerExecutionObserved: boolean;
    candidateArtifactObserved: boolean;
    providerEvidenceObserved: boolean;
  }>,
): BookArtProviderShadowJobInspectionResultV1 {
  const withoutFingerprint = {
    outputKind: "evavo_book_art_provider_shadow_job_inspection_result" as const,
    schemaVersion: 1 as const,
    status: input.status,
    identity: input.identity,
    ...(input.planFingerprintSha256 === undefined
      ? {}
      : { planFingerprintSha256: input.planFingerprintSha256 }),
    ...(input.runtimeJob === undefined ? {} : { runtimeJob: input.runtimeJob }),
    ...(input.candidate === undefined ? {} : { candidate: input.candidate }),
    ...(input.providerEvidence === undefined
      ? {}
      : { providerEvidence: input.providerEvidence }),
    blockers: unique(input.blockers),
    warnings: unique(input.warnings),
    shadowOnly: true as const,
    inspectionReadOnly: true as const,
    providerCallPerformedByInspection: false as const,
    candidateArtifactsWrittenByInspection: false as const,
    providerExecutionObserved: input.providerExecutionObserved,
    candidateArtifactObserved: input.candidateArtifactObserved,
    providerEvidenceObserved: input.providerEvidenceObserved,
    authoritativeBookWritesPerformed: false as const,
    selectionPerformed: false as const,
    promotionPerformed: false as const,
    bookUseBindingCreated: false as const,
    runtimeCutoverApproved: false as const,
    publicationPerformed: false as const,
  };
  return {
    ...withoutFingerprint,
    inspectionFingerprintSha256: fingerprint(withoutFingerprint),
  };
}

function validateRuntimeJob(
  plan: BookArtProviderShadowJobPlanV1,
  job: RuntimeJobRecord,
  blockers: string[],
): void {
  if (job.id !== plan.runtimeJobId) {
    blockers.push("Book Art provider runtime job ID differs from the compiled plan.");
  }
  if (job.specHash !== plan.runtimeSpecHash) {
    blockers.push("Book Art provider runtime job spec hash differs from the compiled plan.");
  }
  if (
    job.spec.queue !== "provider" ||
    job.spec.kind !== "art.candidate.generate" ||
    job.spec.maximumAttempts !== 1 ||
    job.attemptLimit !== 1
  ) {
    blockers.push(
      "Book Art provider runtime job lost its one-attempt provider boundary.",
    );
  }
  if (job.attempts.length > 1) {
    blockers.push("Book Art provider runtime job contains more than one attempt.");
  }
  const labels = job.spec.labels;
  for (const [key, expected] of [
    ["migrationMode", "book-art-shadow-candidate"],
    ["workspaceId", plan.identity.workspaceId],
    ["projectId", plan.identity.projectId],
    ["bookId", plan.identity.bookId],
    ["requestId", plan.identity.requestId],
    ["purpose", plan.purpose],
    ["workOrderFingerprint", plan.workOrderFingerprintSha256],
    ["sourceBriefFingerprint", plan.sourceBriefFingerprint],
  ] as const) {
    if (labels[key] !== expected) {
      blockers.push(`Book Art provider runtime label ${key} differs from the compiled plan.`);
    }
  }
  if (
    plan.identity.editionId !== undefined &&
    labels.editionId !== plan.identity.editionId
  ) {
    blockers.push("Book Art provider runtime edition label differs from the compiled plan.");
  }
}

async function verifiedOutputs(
  job: RuntimeJobRecord,
  artifacts: ArtifactStore,
  blockers: string[],
): Promise<readonly StoredArtifact[]> {
  const output: StoredArtifact[] = [];
  for (const artifactId of job.outputArtifacts) {
    try {
      const [artifact, verification] = await Promise.all([
        artifacts.get(artifactId),
        artifacts.verify(artifactId),
      ]);
      if (!artifact || !verification.exists) {
        blockers.push(`Book Art provider output artifact is missing: ${artifactId}`);
        continue;
      }
      if (!verification.descriptorValid || !verification.contentValid) {
        blockers.push(
          `Book Art provider output artifact failed immutable verification: ${artifactId}`,
        );
        continue;
      }
      output.push(artifact);
    } catch (error: unknown) {
      blockers.push(
        `Book Art provider output artifact could not be verified: ${artifactId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return output;
}

function validateCandidate(
  plan: BookArtProviderShadowJobPlanV1,
  candidate: StoredArtifact,
  blockers: string[],
): void {
  if (
    candidate.storageClass !== "intermediate" ||
    candidate.labels.artifactRole !== "provider-candidate" ||
    candidate.labels.approvalState !== "unapproved" ||
    !candidate.mediaType.startsWith("image/")
  ) {
    blockers.push(
      "Book Art provider candidate is not an unapproved intermediate image.",
    );
  }
  if (
    candidate.labels.providerRequestId !==
      plan.normalizedProviderRequest.requestId ||
    candidate.labels.candidateFamilyId !==
      plan.normalizedProviderRequest.candidateFamilyId ||
    candidate.labels.assetId !== plan.normalizedProviderRequest.assetId
  ) {
    blockers.push("Book Art provider candidate labels differ from the compiled request.");
  }
  const metadata = isRecord(candidate.metadata) ? candidate.metadata : {};
  if (
    metadata.finalDeliverable !== false ||
    metadata.requiresMastering !== true ||
    metadata.requiresBlockingQa !== true ||
    metadata.requestSha256 !== plan.normalizedProviderRequestSha256
  ) {
    blockers.push(
      "Book Art provider candidate metadata lost its mastering, QA or request-hash boundary.",
    );
  }
  if (candidate.sourceArtifacts.length !== 0) {
    blockers.push(
      "Initial Book Art shadow candidates must not claim undeclared source artifacts.",
    );
  }
}

async function validateProviderEvidence(
  plan: BookArtProviderShadowJobPlanV1,
  candidate: StoredArtifact,
  evidence: StoredArtifact,
  artifacts: ArtifactStore,
  blockers: string[],
): Promise<void> {
  if (
    evidence.storageClass !== "evidence" ||
    evidence.mediaType !== "application/json" ||
    evidence.labels.artifactRole !== "provider-candidate-evidence" ||
    evidence.labels.outcome !== "candidate-produced"
  ) {
    blockers.push("Book Art provider evidence descriptor is invalid.");
  }
  if (
    evidence.labels.providerRequestId !==
      plan.normalizedProviderRequest.requestId ||
    evidence.labels.candidateFamilyId !==
      plan.normalizedProviderRequest.candidateFamilyId
  ) {
    blockers.push("Book Art provider evidence labels differ from the compiled request.");
  }
  if (
    evidence.sourceArtifacts.length !== 1 ||
    evidence.sourceArtifacts[0] !== candidate.artifactId
  ) {
    blockers.push(
      "Book Art provider evidence does not bind the exact candidate artifact.",
    );
  }

  let body: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(
      (await artifacts.read(evidence.artifactId)).toString("utf8"),
    ) as unknown;
    body = isRecord(parsed) ? parsed : null;
  } catch (error: unknown) {
    blockers.push(
      `Book Art provider evidence JSON could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!body) {
    blockers.push("Book Art provider evidence body must be one JSON object.");
    return;
  }
  if (
    body.outcome !== "candidate-produced" ||
    body.requestSha256 !== plan.normalizedProviderRequestSha256
  ) {
    blockers.push("Book Art provider evidence outcome or request hash is invalid.");
  }
  const candidateArtifacts = Array.isArray(body.candidateArtifacts)
    ? body.candidateArtifacts
    : [];
  if (
    candidateArtifacts.length !== 1 ||
    candidateArtifacts[0] !== candidate.artifactId
  ) {
    blockers.push("Book Art provider evidence does not name exactly one matching candidate.");
  }

  try {
    const request = validateProviderCandidateRequest(body.request);
    if (
      providerRequestSha256(request) !== plan.normalizedProviderRequestSha256 ||
      request.candidateCount !== 1 ||
      request.selection.allowFallback !== false ||
      request.references.length !== 0
    ) {
      blockers.push(
        "Book Art provider evidence request differs from the compiled no-fallback request.",
      );
    }
    const metadata = isRecord(request.metadata) ? request.metadata : {};
    if (
      metadata.bookId !== plan.identity.bookId ||
      metadata.providerCandidateMayBeFinal !== false ||
      metadata.publicationPerformed !== false
    ) {
      blockers.push("Book Art provider evidence contains invalid Book authority metadata.");
    }
  } catch (error: unknown) {
    blockers.push(
      `Book Art provider evidence request is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const selection = isRecord(body.selection) ? body.selection : {};
  const adapter = isRecord(selection.adapter) ? selection.adapter : {};
  if (
    typeof adapter.id !== "string" ||
    !plan.normalizedProviderRequest.selection.allowedAdapterIds.includes(adapter.id)
  ) {
    blockers.push("Book Art provider evidence selected an adapter outside host policy.");
  }
  const attempts = Array.isArray(body.attempts) ? body.attempts : [];
  const attempt = attempts.length === 1 && isRecord(attempts[0]) ? attempts[0] : null;
  if (
    !attempt ||
    attempt.outcome !== "succeeded" ||
    attempt.adapterId !== adapter.id
  ) {
    blockers.push("Book Art provider evidence must contain one matching successful attempt.");
  }
}

export async function inspectBookArtProviderShadowJob(
  compilation: BookArtProviderShadowJobCompilationResultV1,
  options: InspectBookArtProviderShadowJobOptions,
): Promise<BookArtProviderShadowJobInspectionResultV1> {
  if (compilation.status !== "ready" || !compilation.plan) {
    return finish({
      status: "blocked",
      identity: compilation.identity,
      blockers:
        compilation.blockers.length > 0
          ? compilation.blockers
          : ["Book Art provider inspection requires a ready compiled plan."],
      warnings: compilation.warnings,
      providerExecutionObserved: false,
      candidateArtifactObserved: false,
      providerEvidenceObserved: false,
    });
  }
  const plan = compilation.plan;
  let job: RuntimeJobRecord | null;
  try {
    job = await options.runtime.get(plan.runtimeJobId);
  } catch (error: unknown) {
    return finish({
      status: "blocked",
      identity: compilation.identity,
      planFingerprintSha256: plan.planFingerprintSha256,
      blockers: [
        `Book Art provider runtime job could not be read: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
      warnings: compilation.warnings,
      providerExecutionObserved: false,
      candidateArtifactObserved: false,
      providerEvidenceObserved: false,
    });
  }
  if (!job) {
    return finish({
      status: "not-submitted",
      identity: compilation.identity,
      planFingerprintSha256: plan.planFingerprintSha256,
      blockers: [],
      warnings: [
        ...compilation.warnings,
        "No durable runtime job exists for the exact compiled Book Art request.",
      ],
      providerExecutionObserved: false,
      candidateArtifactObserved: false,
      providerEvidenceObserved: false,
    });
  }

  const blockers: string[] = [];
  validateRuntimeJob(plan, job, blockers);
  const runtimeJob = runtimeProof(job);
  const providerExecutionObserved = job.attempts.length > 0;
  if (blockers.length) {
    return finish({
      status: "blocked",
      identity: compilation.identity,
      planFingerprintSha256: plan.planFingerprintSha256,
      runtimeJob,
      blockers,
      warnings: compilation.warnings,
      providerExecutionObserved,
      candidateArtifactObserved: false,
      providerEvidenceObserved: false,
    });
  }
  if (ACTIVE_STATES.has(job.state)) {
    return finish({
      status: "pending",
      identity: compilation.identity,
      planFingerprintSha256: plan.planFingerprintSha256,
      runtimeJob,
      blockers: [],
      warnings: [
        ...compilation.warnings,
        `Book Art provider runtime job remains ${job.state}.`,
      ],
      providerExecutionObserved,
      candidateArtifactObserved: false,
      providerEvidenceObserved: false,
    });
  }
  if (FAILED_STATES.has(job.state)) {
    return finish({
      status: "failed",
      identity: compilation.identity,
      planFingerprintSha256: plan.planFingerprintSha256,
      runtimeJob,
      blockers: [],
      warnings: [
        ...compilation.warnings,
        `Book Art provider runtime job reached terminal state ${job.state}.`,
      ],
      providerExecutionObserved,
      candidateArtifactObserved: false,
      providerEvidenceObserved: false,
    });
  }
  if (job.state !== "succeeded") {
    return finish({
      status: "blocked",
      identity: compilation.identity,
      planFingerprintSha256: plan.planFingerprintSha256,
      runtimeJob,
      blockers: [`Unsupported Book Art provider runtime state: ${job.state}`],
      warnings: compilation.warnings,
      providerExecutionObserved,
      candidateArtifactObserved: false,
      providerEvidenceObserved: false,
    });
  }
  if (
    job.attempts.length !== 1 ||
    job.attempts[0]?.outcome !== "succeeded"
  ) {
    blockers.push(
      "Succeeded Book Art provider job must contain exactly one successful attempt.",
    );
  }

  const outputs = await verifiedOutputs(job, options.artifacts, blockers);
  for (const artifact of outputs) {
    const role = artifact.labels.artifactRole;
    if (role && FORBIDDEN_ARTIFACT_ROLES.has(role)) {
      blockers.push(`Book Art shadow job emitted forbidden artifact role ${role}.`);
    }
  }
  const candidates = outputs.filter(
    (entry) => entry.labels.artifactRole === "provider-candidate",
  );
  const evidenceArtifacts = outputs.filter(
    (entry) => entry.labels.artifactRole === "provider-candidate-evidence",
  );
  if (candidates.length !== 1) {
    blockers.push(
      `Book Art provider job must emit exactly one provider candidate; found ${candidates.length}.`,
    );
  }
  if (evidenceArtifacts.length !== 1) {
    blockers.push(
      `Book Art provider job must emit exactly one provider evidence artifact; found ${evidenceArtifacts.length}.`,
    );
  }

  const candidate = candidates[0];
  const providerEvidence = evidenceArtifacts[0];
  if (candidate) validateCandidate(plan, candidate, blockers);
  if (candidate && providerEvidence) {
    await validateProviderEvidence(
      plan,
      candidate,
      providerEvidence,
      options.artifacts,
      blockers,
    );
  }

  return finish({
    status: blockers.length ? "blocked" : "succeeded",
    identity: compilation.identity,
    planFingerprintSha256: plan.planFingerprintSha256,
    runtimeJob,
    ...(candidate === undefined ? {} : { candidate: artifactProof(candidate) }),
    ...(providerEvidence === undefined
      ? {}
      : { providerEvidence: artifactProof(providerEvidence) }),
    blockers,
    warnings: compilation.warnings,
    providerExecutionObserved,
    candidateArtifactObserved: candidate !== undefined,
    providerEvidenceObserved: providerEvidence !== undefined,
  });
}
