import {
  normalizeJson,
  sha256,
  stableStringify,
  type ArtifactId,
  type ArtifactStore,
  type StoredArtifact,
} from "@evavo/art-artifacts";
import {
  BOOK_ART_CANDIDATE_SET_CONTRACT,
  BOOK_ART_CANDIDATE_SET_MAXIMUM_CANDIDATES,
  BOOK_ART_CANDIDATE_SET_MINIMUM_CANDIDATES,
  evaluateBookArtCandidateSetConsensus,
  type BookArtCandidateSetConsensusInputV1,
  type BookArtCandidateSetConsensusResultV1,
  type BookArtIdentityV1,
} from "@evavo/art-contracts";
import {
  providerRequestSha256,
  validateProviderCandidateRequest,
} from "@evavo/art-providers";
import type { RuntimeJobRecord, RuntimeRepository } from "@evavo/art-runtime";

import {
  BOOK_ART_CANDIDATE_SET_RUNTIME_CONTRACT,
  type BookArtCandidateSetProviderJobPlanV1,
} from "./candidate-set.js";

export const BOOK_ART_CANDIDATE_SET_EXECUTION_SCHEMA_VERSION = 1 as const;
export const BOOK_ART_CANDIDATE_SET_EXECUTION_CONTRACT =
  "evavo_book_art_candidate_set_execution_evidence_v1" as const;

export interface BookArtCandidateSetProviderOutputProofV1 {
  candidateIndex: number;
  candidateId: ArtifactId;
  descriptorSha256: string;
  contentSha256: string;
  sizeBytes: number;
  mediaType: string;
}

export interface BookArtCandidateSetProviderRunReceiptV1 {
  outputKind: "evavo_book_art_candidate_set_provider_run_receipt";
  schemaVersion: typeof BOOK_ART_CANDIDATE_SET_EXECUTION_SCHEMA_VERSION;
  contract: typeof BOOK_ART_CANDIDATE_SET_EXECUTION_CONTRACT;
  productionContract: typeof BOOK_ART_CANDIDATE_SET_CONTRACT;
  runtimeContract: typeof BOOK_ART_CANDIDATE_SET_RUNTIME_CONTRACT;
  identity: BookArtIdentityV1;
  candidateSetId: string;
  candidateCount: number;
  workOrderFingerprintSha256: string;
  normalizedProviderRequestSha256: string;
  compiledPromptSha256: string;
  runtimeJobId: string;
  runtimeSpecHash: string;
  providerEvidence: {
    artifactId: ArtifactId;
    descriptorSha256: string;
    contentSha256: string;
    sizeBytes: number;
  };
  providerAttempt: {
    adapterId: string;
    model: string;
    startedAt: string;
    completedAt: string;
    outcome: "succeeded";
  };
  candidates: BookArtCandidateSetProviderOutputProofV1[];
  completedAt: string;
  oneProviderAttemptForEntireSet: true;
  providerFallbackAllowed: false;
  exactOutputSetVerified: true;
  immutableArtifactsVerified: true;
  shadowOnly: true;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  publicationPerformed: false;
  receiptFingerprintSha256: string;
}

export interface BookArtCandidateSetProviderRunReceiptCompilationResultV1 {
  outputKind: "evavo_book_art_candidate_set_provider_run_receipt_compilation_result";
  schemaVersion: typeof BOOK_ART_CANDIDATE_SET_EXECUTION_SCHEMA_VERSION;
  status: "blocked" | "ready";
  identity: BookArtIdentityV1;
  receipt?: BookArtCandidateSetProviderRunReceiptV1;
  blockers: string[];
  warnings: string[];
  providerCallPerformedByReceiptCompiler: false;
  candidateArtifactsWrittenByReceiptCompiler: false;
  inspectionReadOnly: true;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  publicationPerformed: false;
}

export interface BookArtCandidateSetExecutionConsensusResultV1 {
  outputKind: "evavo_book_art_candidate_set_execution_consensus_result";
  schemaVersion: typeof BOOK_ART_CANDIDATE_SET_EXECUTION_SCHEMA_VERSION;
  contract: typeof BOOK_ART_CANDIDATE_SET_EXECUTION_CONTRACT;
  status: "blocked" | "needs_work" | "ready_for_docs_quality_gate";
  providerRunReceipt?: BookArtCandidateSetProviderRunReceiptV1;
  consensusResult?: BookArtCandidateSetConsensusResultV1;
  blockers: string[];
  requiredActions: string[];
  executionConsensusFingerprintSha256: string;
  providerCallPerformed: false;
  inspectionReadOnly: true;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  publicationPerformed: false;
}

type EvidenceBody = Record<string, unknown> & { attempts: unknown[] };

export async function compileBookArtCandidateSetProviderRunReceipt(
  value: unknown,
  options: Readonly<{
    runtime: RuntimeRepository;
    artifacts: ArtifactStore;
  }>,
): Promise<BookArtCandidateSetProviderRunReceiptCompilationResultV1> {
  const blockers: string[] = [];
  const input = object(value);
  if (
    !input ||
    input.outputKind !==
      "evavo_book_art_candidate_set_provider_run_receipt_compile_input" ||
    input.schemaVersion !== BOOK_ART_CANDIDATE_SET_EXECUTION_SCHEMA_VERSION ||
    Object.keys(input).some(
      (key) => !["outputKind", "schemaVersion", "plan"].includes(key),
    )
  ) {
    return blockedReceipt(emptyIdentity(), [
      "Candidate-set provider-run receipt input identity or fields are invalid.",
    ]);
  }
  const plan = input.plan as BookArtCandidateSetProviderJobPlanV1;
  const identity = identityFrom(object(plan?.identity));
  validatePlan(plan, blockers);
  if (blockers.length) return blockedReceipt(identity, blockers);

  let job: RuntimeJobRecord | null = null;
  try {
    job = await options.runtime.get(plan.runtimeJobId);
  } catch (error: unknown) {
    blockers.push(`Candidate-set runtime job could not be read: ${errorMessage(error)}`);
  }
  if (!job) {
    blockers.push(
      "Candidate-set provider-run receipt requires the exact durable runtime job.",
    );
    return blockedReceipt(identity, blockers);
  }
  validateJob(plan, job, blockers);
  if (blockers.length) return blockedReceipt(identity, blockers);

  const outputs = await readVerifiedOutputs(job, options.artifacts, blockers);
  const candidates = outputs.filter(
    (artifact) => artifact.labels.artifactRole === "provider-candidate",
  );
  const evidenceArtifacts = outputs.filter(
    (artifact) => artifact.labels.artifactRole === "provider-candidate-evidence",
  );
  if (candidates.length !== plan.candidateCount) {
    blockers.push(
      `Candidate-set execution requires exactly ${plan.candidateCount} verified candidates; found ${candidates.length}.`,
    );
  }
  if (evidenceArtifacts.length !== 1) {
    blockers.push(
      `Candidate-set execution requires exactly one provider evidence artifact; found ${evidenceArtifacts.length}.`,
    );
  }
  if (outputs.length !== plan.candidateCount + 1) {
    blockers.push("Candidate-set execution contains undeclared output artifacts.");
  }
  const orderedCandidates = validateAndOrderCandidates(plan, candidates, blockers);
  const evidence = evidenceArtifacts[0];
  const evidenceBody = evidence
    ? await validateEvidence(
        plan,
        job,
        orderedCandidates,
        evidence,
        options.artifacts,
        blockers,
      )
    : undefined;
  if (blockers.length || !evidence || !evidenceBody) {
    return blockedReceipt(identity, blockers);
  }

  const selection = object(evidenceBody.selection)!;
  const adapter = object(selection.adapter)!;
  const attempt = object(evidenceBody.attempts[0])!;
  const unsigned: Omit<
    BookArtCandidateSetProviderRunReceiptV1,
    "receiptFingerprintSha256"
  > = {
    outputKind: "evavo_book_art_candidate_set_provider_run_receipt",
    schemaVersion: BOOK_ART_CANDIDATE_SET_EXECUTION_SCHEMA_VERSION,
    contract: BOOK_ART_CANDIDATE_SET_EXECUTION_CONTRACT,
    productionContract: BOOK_ART_CANDIDATE_SET_CONTRACT,
    runtimeContract: BOOK_ART_CANDIDATE_SET_RUNTIME_CONTRACT,
    identity: structuredClone(plan.identity),
    candidateSetId: plan.candidateSetId,
    candidateCount: plan.candidateCount,
    workOrderFingerprintSha256: digest(plan.workOrderFingerprintSha256),
    normalizedProviderRequestSha256: digest(
      plan.normalizedProviderRequestSha256,
    ),
    compiledPromptSha256: digest(String(evidenceBody.compiledPromptSha256)),
    runtimeJobId: plan.runtimeJobId,
    runtimeSpecHash: digest(plan.runtimeSpecHash),
    providerEvidence: {
      artifactId: evidence.artifactId,
      descriptorSha256: digest(evidence.descriptorSha256),
      contentSha256: digest(evidence.contentSha256),
      sizeBytes: evidence.sizeBytes,
    },
    providerAttempt: {
      adapterId: String(adapter.id),
      model: String(selection.model),
      startedAt: String(attempt.startedAt),
      completedAt: String(attempt.completedAt),
      outcome: "succeeded",
    },
    candidates: orderedCandidates.map((candidate, index) => ({
      candidateIndex: index + 1,
      candidateId: candidate.artifactId,
      descriptorSha256: digest(candidate.descriptorSha256),
      contentSha256: digest(candidate.contentSha256),
      sizeBytes: candidate.sizeBytes,
      mediaType: candidate.mediaType,
    })),
    completedAt: job.finishedAt!,
    oneProviderAttemptForEntireSet: true,
    providerFallbackAllowed: false,
    exactOutputSetVerified: true,
    immutableArtifactsVerified: true,
    shadowOnly: true,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    publicationPerformed: false,
  };
  const receipt: BookArtCandidateSetProviderRunReceiptV1 = {
    ...unsigned,
    receiptFingerprintSha256: fingerprint(unsigned),
  };
  const issues = validateBookArtCandidateSetProviderRunReceipt(receipt);
  if (issues.length) return blockedReceipt(identity, issues);
  return {
    outputKind:
      "evavo_book_art_candidate_set_provider_run_receipt_compilation_result",
    schemaVersion: BOOK_ART_CANDIDATE_SET_EXECUTION_SCHEMA_VERSION,
    status: "ready",
    identity: structuredClone(plan.identity),
    receipt,
    blockers: [],
    warnings: [
      "The receipt proves exact provider execution and immutable outputs only; QA, independent consensus and pairwise review remain mandatory.",
    ],
    providerCallPerformedByReceiptCompiler: false,
    candidateArtifactsWrittenByReceiptCompiler: false,
    inspectionReadOnly: true,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    publicationPerformed: false,
  };
}

export function fingerprintBookArtCandidateSetProviderRunReceipt(
  value:
    | Omit<BookArtCandidateSetProviderRunReceiptV1, "receiptFingerprintSha256">
    | BookArtCandidateSetProviderRunReceiptV1,
): string {
  const { receiptFingerprintSha256: _ignored, ...unsigned } =
    value as BookArtCandidateSetProviderRunReceiptV1;
  return fingerprint(unsigned);
}

export function validateBookArtCandidateSetProviderRunReceipt(
  value: unknown,
): string[] {
  const issues: string[] = [];
  const receipt = object(value);
  if (!receipt) return ["Candidate-set provider-run receipt must be one object."];
  const requiredKeys = [
    "outputKind",
    "schemaVersion",
    "contract",
    "productionContract",
    "runtimeContract",
    "identity",
    "candidateSetId",
    "candidateCount",
    "workOrderFingerprintSha256",
    "normalizedProviderRequestSha256",
    "compiledPromptSha256",
    "runtimeJobId",
    "runtimeSpecHash",
    "providerEvidence",
    "providerAttempt",
    "candidates",
    "completedAt",
    "oneProviderAttemptForEntireSet",
    "providerFallbackAllowed",
    "exactOutputSetVerified",
    "immutableArtifactsVerified",
    "shadowOnly",
    "selectionPerformed",
    "promotionPerformed",
    "bookUseBindingCreated",
    "publicationPerformed",
    "receiptFingerprintSha256",
  ];
  if (
    receipt.outputKind !== "evavo_book_art_candidate_set_provider_run_receipt" ||
    receipt.schemaVersion !== BOOK_ART_CANDIDATE_SET_EXECUTION_SCHEMA_VERSION ||
    receipt.contract !== BOOK_ART_CANDIDATE_SET_EXECUTION_CONTRACT ||
    receipt.productionContract !== BOOK_ART_CANDIDATE_SET_CONTRACT ||
    receipt.runtimeContract !== BOOK_ART_CANDIDATE_SET_RUNTIME_CONTRACT ||
    !sameSet(Object.keys(receipt), requiredKeys)
  ) {
    issues.push("Candidate-set provider-run receipt identity or fields are invalid.");
  }
  validateIdentity(receipt.identity, issues);
  safeId(receipt.candidateSetId, "candidateSetId", issues);
  safeId(receipt.runtimeJobId, "runtimeJobId", issues);
  const count = boundedInteger(
    receipt.candidateCount,
    BOOK_ART_CANDIDATE_SET_MINIMUM_CANDIDATES,
    BOOK_ART_CANDIDATE_SET_MAXIMUM_CANDIDATES,
    "candidateCount",
    issues,
  );
  for (const [name, value] of [
    ["workOrderFingerprintSha256", receipt.workOrderFingerprintSha256],
    ["normalizedProviderRequestSha256", receipt.normalizedProviderRequestSha256],
    ["compiledPromptSha256", receipt.compiledPromptSha256],
    ["runtimeSpecHash", receipt.runtimeSpecHash],
    ["receiptFingerprintSha256", receipt.receiptFingerprintSha256],
  ] as const) canonicalDigest(value, name, issues);
  canonicalTimestamp(receipt.completedAt, "completedAt", issues);

  const evidence = object(receipt.providerEvidence);
  if (
    !evidence ||
    !sameSet(Object.keys(evidence), [
      "artifactId",
      "descriptorSha256",
      "contentSha256",
      "sizeBytes",
    ])
  ) {
    issues.push("Provider evidence proof is incomplete or contains unknown fields.");
  } else {
    canonicalArtifactId(evidence.artifactId, "providerEvidence.artifactId", issues);
    canonicalDigest(
      evidence.descriptorSha256,
      "providerEvidence.descriptorSha256",
      issues,
    );
    canonicalDigest(
      evidence.contentSha256,
      "providerEvidence.contentSha256",
      issues,
    );
    boundedInteger(
      evidence.sizeBytes,
      1,
      Number.MAX_SAFE_INTEGER,
      "providerEvidence.sizeBytes",
      issues,
    );
  }

  const attempt = object(receipt.providerAttempt);
  if (
    !attempt ||
    !sameSet(Object.keys(attempt), [
      "adapterId",
      "model",
      "startedAt",
      "completedAt",
      "outcome",
    ])
  ) {
    issues.push("Provider attempt proof is incomplete or contains unknown fields.");
  } else {
    providerId(attempt.adapterId, "providerAttempt.adapterId", issues);
    boundedString(attempt.model, "providerAttempt.model", issues, 300);
    const started = canonicalTimestamp(
      attempt.startedAt,
      "providerAttempt.startedAt",
      issues,
    );
    const completed = canonicalTimestamp(
      attempt.completedAt,
      "providerAttempt.completedAt",
      issues,
    );
    if (attempt.outcome !== "succeeded") {
      issues.push("Provider attempt proof must have succeeded.");
    }
    if (Date.parse(completed) < Date.parse(started)) {
      issues.push("Provider attempt completed before it started.");
    }
    if (
      isTimestamp(receipt.completedAt) &&
      Date.parse(completed) > Date.parse(receipt.completedAt)
    ) {
      issues.push("Provider attempt completed after the runtime receipt.");
    }
  }

  const candidates = Array.isArray(receipt.candidates) ? receipt.candidates : [];
  if (candidates.length !== count) {
    issues.push(`Provider-run receipt must contain exactly ${count} candidates.`);
  }
  const candidateIds: string[] = [];
  const descriptors: string[] = [];
  candidates.forEach((value, index) => {
    const candidate = object(value);
    if (
      !candidate ||
      !sameSet(Object.keys(candidate), [
        "candidateIndex",
        "candidateId",
        "descriptorSha256",
        "contentSha256",
        "sizeBytes",
        "mediaType",
      ])
    ) {
      issues.push(`candidates[${index}] is incomplete or contains unknown fields.`);
      return;
    }
    if (candidate.candidateIndex !== index + 1) {
      issues.push(`candidates[${index}] has a non-canonical candidate index.`);
    }
    candidateIds.push(
      canonicalArtifactId(
        candidate.candidateId,
        `candidates[${index}].candidateId`,
        issues,
      ),
    );
    descriptors.push(
      canonicalDigest(
        candidate.descriptorSha256,
        `candidates[${index}].descriptorSha256`,
        issues,
      ),
    );
    canonicalDigest(
      candidate.contentSha256,
      `candidates[${index}].contentSha256`,
      issues,
    );
    boundedInteger(
      candidate.sizeBytes,
      1,
      Number.MAX_SAFE_INTEGER,
      `candidates[${index}].sizeBytes`,
      issues,
    );
    if (
      typeof candidate.mediaType !== "string" ||
      !/^image\/[A-Za-z0-9.+-]+$/u.test(candidate.mediaType)
    ) {
      issues.push(`candidates[${index}].mediaType must be an image media type.`);
    }
  });
  if (duplicates(candidateIds).length || duplicates(descriptors).length) {
    issues.push("Provider-run receipt contains duplicated candidate identity evidence.");
  }
  if (
    receipt.oneProviderAttemptForEntireSet !== true ||
    receipt.providerFallbackAllowed !== false ||
    receipt.exactOutputSetVerified !== true ||
    receipt.immutableArtifactsVerified !== true ||
    receipt.shadowOnly !== true ||
    receipt.selectionPerformed !== false ||
    receipt.promotionPerformed !== false ||
    receipt.bookUseBindingCreated !== false ||
    receipt.publicationPerformed !== false
  ) {
    issues.push("Provider-run receipt lost its one-attempt, immutable or authority boundary.");
  }
  if (
    canonicalDigest(
      receipt.receiptFingerprintSha256,
      "receiptFingerprintSha256",
      [],
    ) !==
    fingerprintBookArtCandidateSetProviderRunReceipt(
      receipt as unknown as BookArtCandidateSetProviderRunReceiptV1,
    )
  ) {
    issues.push("Provider-run receipt fingerprint differs from exact contents.");
  }
  return unique(issues);
}

export async function evaluateBookArtCandidateSetExecutionConsensus(
  value: unknown,
  options: Readonly<{
    runtime: RuntimeRepository;
    artifacts: ArtifactStore;
  }>,
): Promise<BookArtCandidateSetExecutionConsensusResultV1> {
  const input = object(value);
  if (
    !input ||
    input.outputKind !==
      "evavo_book_art_candidate_set_execution_consensus_input" ||
    input.schemaVersion !== BOOK_ART_CANDIDATE_SET_EXECUTION_SCHEMA_VERSION ||
    input.contract !== BOOK_ART_CANDIDATE_SET_EXECUTION_CONTRACT ||
    !sameSet(Object.keys(input), [
      "outputKind",
      "schemaVersion",
      "contract",
      "plan",
      "consensusInput",
    ])
  ) {
    return blockedConsensus([
      "Candidate-set execution consensus input identity or fields are invalid.",
    ]);
  }
  const consensus = object(input.consensusInput);
  if (!consensus) {
    return blockedConsensus([
      "Execution consensus requires one consensus input.",
    ]);
  }
  const receiptResult = await compileBookArtCandidateSetProviderRunReceipt(
    {
      outputKind:
        "evavo_book_art_candidate_set_provider_run_receipt_compile_input",
      schemaVersion: BOOK_ART_CANDIDATE_SET_EXECUTION_SCHEMA_VERSION,
      plan: input.plan,
    },
    options,
  );
  if (receiptResult.status !== "ready" || !receiptResult.receipt) {
    return blockedConsensus(receiptResult.blockers);
  }
  const receipt = receiptResult.receipt;
  const consensusInput =
    consensus as unknown as BookArtCandidateSetConsensusInputV1;
  const blockers = bindConsensus(receipt, consensusInput);
  if (blockers.length) return blockedConsensus(blockers);
  const consensusResult = evaluateBookArtCandidateSetConsensus(consensusInput);
  return finishConsensus(
    consensusResult.status,
    receipt,
    consensusResult,
    consensusResult.blockers,
    consensusResult.requiredActions,
  );
}

function validatePlan(
  plan: BookArtCandidateSetProviderJobPlanV1,
  blockers: string[],
): void {
  if (
    !plan ||
    plan.outputKind !== "evavo_book_art_candidate_set_provider_job_plan" ||
    plan.schemaVersion !== 1 ||
    plan.contract !== BOOK_ART_CANDIDATE_SET_RUNTIME_CONTRACT ||
    plan.productionContract !== BOOK_ART_CANDIDATE_SET_CONTRACT
  ) {
    blockers.push("Candidate-set provider job plan identity is invalid.");
    return;
  }
  validateIdentity(plan.identity, blockers);
  safeId(plan.candidateSetId, "candidateSetId", blockers);
  boundedInteger(
    plan.candidateCount,
    BOOK_ART_CANDIDATE_SET_MINIMUM_CANDIDATES,
    BOOK_ART_CANDIDATE_SET_MAXIMUM_CANDIDATES,
    "candidateCount",
    blockers,
  );
  try {
    const request = validateProviderCandidateRequest(plan.normalizedProviderRequest);
    if (
      providerRequestSha256(request) !== plan.normalizedProviderRequestSha256 ||
      request.candidateCount !== plan.candidateCount ||
      request.selection.allowFallback !== false ||
      request.references.length !== 0
    ) {
      blockers.push("Candidate-set provider job plan request boundary is invalid.");
    }
  } catch (error: unknown) {
    blockers.push(
      `Candidate-set provider job plan request is invalid: ${errorMessage(error)}`,
    );
  }
  const { planFingerprintSha256: _ignored, ...unsigned } = plan;
  if (plan.planFingerprintSha256 !== rawFingerprint(unsigned)) {
    blockers.push("Candidate-set provider job plan fingerprint differs from exact contents.");
  }
  if (
    plan.oneProviderAttemptForEntireSet !== true ||
    plan.providerFallbackAllowed !== false ||
    plan.shadowOnly !== true ||
    plan.providerCallPerformed !== false ||
    plan.candidateArtifactsWritten !== false ||
    plan.selectionPerformed !== false ||
    plan.promotionPerformed !== false ||
    plan.bookUseBindingCreated !== false ||
    plan.runtimeCutoverApproved !== false ||
    plan.publicationPerformed !== false
  ) {
    blockers.push("Candidate-set provider job plan lost its authority boundary.");
  }
}

function validateJob(
  plan: BookArtCandidateSetProviderJobPlanV1,
  job: RuntimeJobRecord,
  blockers: string[],
): void {
  if (job.id !== plan.runtimeJobId || job.specHash !== plan.runtimeSpecHash) {
    blockers.push("Candidate-set runtime job identity differs from the exact plan.");
  }
  if (
    job.state !== "succeeded" ||
    job.attemptLimit !== 1 ||
    job.spec.maximumAttempts !== 1 ||
    job.spec.queue !== "provider" ||
    job.spec.kind !== "art.candidate.generate" ||
    job.redriveCount !== 0 ||
    job.attempts.length !== 1 ||
    job.attempts[0]?.outcome !== "succeeded"
  ) {
    blockers.push("Candidate-set runtime job lost its one-attempt successful boundary.");
  }
  if (!isTimestamp(job.finishedAt)) {
    blockers.push("Candidate-set runtime job has no canonical finishedAt timestamp.");
  }
  if (
    job.outputArtifacts.length !== plan.candidateCount + 1 ||
    canonical([...job.outputArtifacts].sort()) !==
      canonical([...(job.attempts[0]?.outputArtifacts ?? [])].sort())
  ) {
    blockers.push("Candidate-set runtime output set differs from the terminal attempt.");
  }
  try {
    if (
      providerRequestSha256(validateProviderCandidateRequest(job.spec.payload)) !==
      plan.normalizedProviderRequestSha256
    ) {
      blockers.push("Candidate-set runtime payload differs from the exact request.");
    }
  } catch (error: unknown) {
    blockers.push(`Candidate-set runtime payload is invalid: ${errorMessage(error)}`);
  }
  for (const [key, expected] of [
    ["migrationMode", "book-art-candidate-set"],
    ["workspaceId", plan.identity.workspaceId],
    ["projectId", plan.identity.projectId],
    ["bookId", plan.identity.bookId],
    ["requestId", plan.identity.requestId],
    ["purpose", plan.purpose],
    ["candidateSetId", plan.candidateSetId],
    ["candidateCount", String(plan.candidateCount)],
    ["workOrderFingerprint", plan.workOrderFingerprintSha256],
    ["sourceBriefFingerprint", plan.sourceBriefFingerprint],
  ] as const) {
    if (job.spec.labels[key] !== expected) {
      blockers.push(`Candidate-set runtime label ${key} differs from the plan.`);
    }
  }
}

async function readVerifiedOutputs(
  job: RuntimeJobRecord,
  artifacts: ArtifactStore,
  blockers: string[],
): Promise<StoredArtifact[]> {
  const output: StoredArtifact[] = [];
  for (const id of job.outputArtifacts) {
    try {
      const [artifact, verification] = await Promise.all([
        artifacts.get(id),
        artifacts.verify(id),
      ]);
      if (
        !artifact ||
        !verification.exists ||
        !verification.descriptorValid ||
        !verification.contentValid
      ) {
        blockers.push(`Candidate-set output failed immutable verification: ${id}.`);
      } else {
        output.push(artifact);
      }
    } catch (error: unknown) {
      blockers.push(
        `Candidate-set output could not be verified: ${id}: ${errorMessage(error)}`,
      );
    }
  }
  return output;
}

function validateAndOrderCandidates(
  plan: BookArtCandidateSetProviderJobPlanV1,
  candidates: StoredArtifact[],
  blockers: string[],
): StoredArtifact[] {
  const indexed = candidates.map((candidate) => {
    const index = Number(candidate.labels.candidateIndex);
    const metadata = object(candidate.metadata);
    if (
      !Number.isInteger(index) ||
      index < 1 ||
      index > plan.candidateCount ||
      candidate.storageClass !== "intermediate" ||
      candidate.labels.approvalState !== "unapproved" ||
      !candidate.mediaType.startsWith("image/") ||
      candidate.labels.providerRequestId !==
        plan.normalizedProviderRequest.requestId ||
      candidate.labels.candidateFamilyId !==
        plan.normalizedProviderRequest.candidateFamilyId ||
      candidate.labels.assetId !== plan.normalizedProviderRequest.assetId ||
      metadata?.finalDeliverable !== false ||
      metadata.requiresMastering !== true ||
      metadata.requiresBlockingQa !== true ||
      metadata.requestSha256 !== plan.normalizedProviderRequestSha256 ||
      candidate.sourceArtifacts.length !== 0
    ) {
      blockers.push(
        `Candidate artifact ${candidate.artifactId} lost its exact request or QA boundary.`,
      );
    }
    return { candidate, index };
  });
  if (duplicates(indexed.map((entry) => String(entry.index))).length) {
    blockers.push("Candidate-set output contains duplicated candidate indices.");
  }
  return indexed
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.candidate);
}

async function validateEvidence(
  plan: BookArtCandidateSetProviderJobPlanV1,
  job: RuntimeJobRecord,
  candidates: StoredArtifact[],
  evidence: StoredArtifact,
  artifacts: ArtifactStore,
  blockers: string[],
): Promise<EvidenceBody | undefined> {
  const candidateIds = candidates.map((candidate) => candidate.artifactId);
  if (
    evidence.storageClass !== "evidence" ||
    evidence.mediaType !== "application/json" ||
    evidence.labels.artifactRole !== "provider-candidate-evidence" ||
    evidence.labels.outcome !== "candidate-produced" ||
    evidence.labels.providerRequestId !==
      plan.normalizedProviderRequest.requestId ||
    evidence.labels.candidateFamilyId !==
      plan.normalizedProviderRequest.candidateFamilyId ||
    evidence.labels.assetId !== plan.normalizedProviderRequest.assetId ||
    canonical([...evidence.sourceArtifacts].sort()) !==
      canonical([...candidateIds].sort())
  ) {
    blockers.push("Candidate-set provider evidence descriptor or sources are invalid.");
  }
  let body: Record<string, unknown> | undefined;
  try {
    body = object(
      JSON.parse((await artifacts.read(evidence.artifactId)).toString("utf8")),
    );
  } catch (error: unknown) {
    blockers.push(
      `Candidate-set provider evidence JSON is unreadable: ${errorMessage(error)}`,
    );
  }
  if (!body) return undefined;
  const bodyCandidates = Array.isArray(body.candidateArtifacts)
    ? body.candidateArtifacts
    : [];
  if (
    body.outcome !== "candidate-produced" ||
    body.requestSha256 !== plan.normalizedProviderRequestSha256 ||
    !isDigest(body.compiledPromptSha256) ||
    !isTimestamp(body.completedAt) ||
    canonical(bodyCandidates) !== canonical(candidateIds)
  ) {
    blockers.push("Candidate-set provider evidence body differs from the exact output set.");
  }
  try {
    const request = validateProviderCandidateRequest(body.request);
    if (
      providerRequestSha256(request) !== plan.normalizedProviderRequestSha256 ||
      request.candidateCount !== plan.candidateCount ||
      request.selection.allowFallback !== false ||
      request.references.length !== 0
    ) {
      blockers.push("Candidate-set provider evidence request differs from the plan.");
    }
  } catch (error: unknown) {
    blockers.push(
      `Candidate-set provider evidence request is invalid: ${errorMessage(error)}`,
    );
  }
  const selection = object(body.selection);
  const adapter = object(selection?.adapter);
  const attempts = Array.isArray(body.attempts) ? body.attempts : [];
  const attempt = attempts.length === 1 ? object(attempts[0]) : undefined;
  const adapterId = adapter?.id;
  const model = selection?.model;
  if (
    typeof adapterId !== "string" ||
    !plan.normalizedProviderRequest.selection.allowedAdapterIds.includes(adapterId) ||
    typeof model !== "string" ||
    !attempt ||
    attempt.outcome !== "succeeded" ||
    attempt.adapterId !== adapterId ||
    attempt.model !== model ||
    !isTimestamp(attempt.startedAt) ||
    !isTimestamp(attempt.completedAt)
  ) {
    blockers.push("Candidate-set provider evidence lacks one matching successful attempt.");
  }
  for (const candidate of candidates) {
    const metadata = object(candidate.metadata);
    if (
      candidate.labels.providerAdapter !== adapterId ||
      candidate.labels.providerModel !== model ||
      metadata?.compiledPromptSha256 !== body.compiledPromptSha256
    ) {
      blockers.push(
        `Candidate artifact ${candidate.artifactId} differs from provider evidence.`,
      );
    }
  }
  if (
    job.finishedAt &&
    Date.parse(String(body.completedAt)) > Date.parse(job.finishedAt)
  ) {
    blockers.push("Candidate-set provider evidence completed after the runtime job.");
  }
  return { ...body, attempts } as EvidenceBody;
}

function bindConsensus(
  receipt: BookArtCandidateSetProviderRunReceiptV1,
  consensus: BookArtCandidateSetConsensusInputV1,
): string[] {
  const blockers: string[] = [];
  if (
    consensus.candidateSetId !== receipt.candidateSetId ||
    digest(consensus.workOrderFingerprintSha256) !==
      receipt.workOrderFingerprintSha256 ||
    consensus.expectedCandidateCount !== receipt.candidateCount ||
    digest(consensus.providerRunFingerprint) !==
      receipt.receiptFingerprintSha256
  ) {
    blockers.push(
      "Candidate-set consensus identity, count or provider-run fingerprint differs from the execution receipt.",
    );
  }
  const candidates = Array.isArray(consensus.candidates)
    ? consensus.candidates
    : [];
  const byId = new Map(
    receipt.candidates.map(
      (candidate) => [candidate.candidateId, candidate] as const,
    ),
  );
  if (candidates.length !== receipt.candidates.length) {
    blockers.push("Candidate-set consensus omits outputs from the exact provider run.");
  }
  for (const candidate of candidates) {
    const proof = byId.get(candidate.candidateId as ArtifactId);
    if (
      !proof ||
      digest(candidate.candidateContentSha256) !== proof.contentSha256 ||
      digest(candidate.candidateArtifactFingerprint) !==
        proof.descriptorSha256 ||
      candidate.candidateProducerId !== receipt.providerAttempt.adapterId
    ) {
      blockers.push(
        `Candidate ${candidate.candidateId} is omitted, substituted or bound to different provider evidence.`,
      );
    }
  }
  if (
    new Set(candidates.map((candidate) => candidate.candidateId)).size !==
    receipt.candidates.length
  ) {
    blockers.push("Candidate-set consensus duplicates or omits provider outputs.");
  }
  return unique(blockers);
}

function finishConsensus(
  status: BookArtCandidateSetExecutionConsensusResultV1["status"],
  receipt: BookArtCandidateSetProviderRunReceiptV1 | undefined,
  consensusResult: BookArtCandidateSetConsensusResultV1 | undefined,
  blockers: string[],
  requiredActions: string[],
): BookArtCandidateSetExecutionConsensusResultV1 {
  const unsigned = {
    outputKind: "evavo_book_art_candidate_set_execution_consensus_result" as const,
    schemaVersion: BOOK_ART_CANDIDATE_SET_EXECUTION_SCHEMA_VERSION,
    contract: BOOK_ART_CANDIDATE_SET_EXECUTION_CONTRACT,
    status,
    ...(receipt ? { providerRunReceipt: receipt } : {}),
    ...(consensusResult ? { consensusResult } : {}),
    blockers: unique(blockers),
    requiredActions: unique(requiredActions).sort(),
    providerCallPerformed: false as const,
    inspectionReadOnly: true as const,
    selectionPerformed: false as const,
    promotionPerformed: false as const,
    bookUseBindingCreated: false as const,
    publicationPerformed: false as const,
  };
  return {
    ...unsigned,
    executionConsensusFingerprintSha256: fingerprint(unsigned),
  };
}

function blockedConsensus(
  blockers: string[],
): BookArtCandidateSetExecutionConsensusResultV1 {
  return finishConsensus(
    "blocked",
    undefined,
    undefined,
    blockers,
    [
      "Rebuild the provider-run receipt from the exact successful runtime job and immutable output artifacts.",
    ],
  );
}

function blockedReceipt(
  identity: BookArtIdentityV1,
  blockers: string[],
): BookArtCandidateSetProviderRunReceiptCompilationResultV1 {
  return {
    outputKind:
      "evavo_book_art_candidate_set_provider_run_receipt_compilation_result",
    schemaVersion: BOOK_ART_CANDIDATE_SET_EXECUTION_SCHEMA_VERSION,
    status: "blocked",
    identity,
    blockers: unique(blockers),
    warnings: [],
    providerCallPerformedByReceiptCompiler: false,
    candidateArtifactsWrittenByReceiptCompiler: false,
    inspectionReadOnly: true,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    publicationPerformed: false,
  };
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/u;
const PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/u;
const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/u;
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function identityFrom(
  value: Record<string, unknown> | undefined,
): BookArtIdentityV1 {
  return {
    workspaceId: typeof value?.workspaceId === "string" ? value.workspaceId : "",
    projectId: typeof value?.projectId === "string" ? value.projectId : "",
    bookId: typeof value?.bookId === "string" ? value.bookId : "",
    ...(value?.editionId === undefined
      ? {}
      : {
          editionId:
            typeof value.editionId === "string" ? value.editionId : "",
        }),
    requestId: typeof value?.requestId === "string" ? value.requestId : "",
  };
}

function validateIdentity(value: unknown, issues: string[]): void {
  const identity = object(value);
  if (
    !identity ||
    !sameSet(Object.keys(identity), [
      "workspaceId",
      "projectId",
      "bookId",
      "requestId",
      ...(identity?.editionId === undefined ? [] : ["editionId"]),
    ])
  ) {
    issues.push("Provider-run receipt identity is invalid.");
    return;
  }
  for (const key of [
    "workspaceId",
    "projectId",
    "bookId",
    "requestId",
  ] as const) {
    safeId(identity[key], `identity.${key}`, issues);
  }
  if (identity.editionId !== undefined) {
    safeId(identity.editionId, "identity.editionId", issues);
  }
}

function emptyIdentity(): BookArtIdentityV1 {
  return { workspaceId: "", projectId: "", bookId: "", requestId: "" };
}

function safeId(value: unknown, label: string, issues: string[]): string {
  if (
    typeof value !== "string" ||
    !SAFE_ID.test(value) ||
    ["__proto__", "constructor", "prototype"].includes(value)
  ) {
    issues.push(`${label} is invalid.`);
    return "invalid-id";
  }
  return value;
}

function providerId(value: unknown, label: string, issues: string[]): string {
  if (typeof value !== "string" || !PROVIDER_ID.test(value)) {
    issues.push(`${label} is invalid.`);
    return "invalid-provider";
  }
  return value;
}

function canonicalArtifactId(
  value: unknown,
  label: string,
  issues: string[],
): string {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) {
    issues.push(`${label} must be a canonical artifact ID.`);
    return `artifact_${"0".repeat(64)}`;
  }
  return value;
}

function canonicalDigest(
  value: unknown,
  label: string,
  issues: string[],
): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    issues.push(`${label} must be a SHA-256 digest.`);
    return `sha256:${"0".repeat(64)}`;
  }
  const canonicalValue = digest(value);
  if (value !== canonicalValue) {
    issues.push(`${label} must use canonical sha256: prefixing.`);
  }
  return canonicalValue;
}

function digest(value: string): string {
  return value.startsWith("sha256:") ? value : `sha256:${value}`;
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

function canonicalTimestamp(
  value: unknown,
  label: string,
  issues: string[],
): string {
  if (!isTimestamp(value)) {
    issues.push(
      `${label} must be a real canonical UTC timestamp with milliseconds.`,
    );
    return "1970-01-01T00:00:00.000Z";
  }
  return value;
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
  issues: string[],
): number {
  if (
    !Number.isInteger(value) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    issues.push(`${label} must be an integer from ${minimum} to ${maximum}.`);
    return minimum;
  }
  return Number(value);
}

function boundedString(
  value: unknown,
  label: string,
  issues: string[],
  maximum: number,
): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < 1 ||
    value.length > maximum ||
    value.includes("\0")
  ) {
    issues.push(`${label} must be one bounded string.`);
    return "invalid";
  }
  return value;
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return canonical([...left].sort()) === canonical([...right].sort());
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function fingerprint(value: unknown): string {
  return digest(rawFingerprint(value));
}

function rawFingerprint(value: unknown): string {
  return sha256(stableStringify(normalizeJson(value)));
}

function canonical(value: unknown): string {
  return stableStringify(normalizeJson(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}
