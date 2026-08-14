import {
  exactKeys,
  fail,
  freeze,
  idValue,
  integerValue,
  record,
  sha256,
  stringValue,
} from "./layered-production-internal.js";
import type { CompiledLayeredProductionPlan } from "./layered-production-types.js";
import {
  ART_PRODUCTION_CANDIDATE_ADMISSION_RECEIPT_KIND,
  ART_PRODUCTION_CANDIDATE_ADMISSION_REQUEST_KIND,
  ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
} from "./art-production-contract.js";
import type {
  ArtProductionCandidateAdmissionReceipt,
  ArtProductionCandidateAdmissionRequestInput,
  ArtProductionCandidateEvidence,
  ArtProductionProviderEvidence,
} from "./art-production-candidate-admission-types.js";
import type {
  ArtProductionBatchJob,
  ArtProductionLoop,
} from "./art-production-loop-types.js";
import { verifyArtProductionLoop } from "./art-production-loop.js";
import {
  compileNextArtProductionBatchFromVerifiedLoop,
} from "./art-production-scheduler.js";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const ARTIFACT_ID_PATTERN = /^artifact_[0-9a-f]{64}$/u;
const MAXIMUM_SOURCE_BYTES = 256 * 1024 * 1024;
const ALPHA_POLICIES = new Set(["opaque", "transparent", "mixed"]);

function sha256Value(value: unknown, label: string): string {
  const output = stringValue(value, label, 64);
  if (!SHA256_PATTERN.test(output)) {
    fail(
      "ART_PRODUCTION_CANDIDATE_ADMISSION_INVALID",
      `${label} must be lowercase SHA-256.`,
    );
  }
  return output;
}

function artifactIdValue(
  value: unknown,
  label: string,
  expectedSha256: string,
): string {
  const output = stringValue(value, label, 73);
  if (
    !ARTIFACT_ID_PATTERN.test(output) ||
    output !== `artifact_${expectedSha256}`
  ) {
    fail(
      "ART_PRODUCTION_CANDIDATE_ADMISSION_INVALID",
      `${label} must identify the exact declared SHA-256.`,
    );
  }
  return output;
}

function canonicalUtc(value: unknown, label: string): string {
  const output = stringValue(value, label, 64);
  const parsed = new Date(output);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== output) {
    fail(
      "ART_PRODUCTION_CANDIDATE_ADMISSION_INVALID",
      `${label} must be canonical UTC ISO-8601.`,
    );
  }
  return output;
}

function normalizeProviderEvidence(
  value: unknown,
  label = "candidateAdmission.providerEvidence",
): ArtProductionProviderEvidence {
  const input = record(value, label);
  exactKeys(input, label, [
    "providerId",
    "model",
    "providerJobId",
    "requestArtifactId",
    "requestSha256",
    "responseArtifactId",
    "responseSha256",
  ]);
  const requestSha256 = sha256Value(
    input.requestSha256,
    `${label}.requestSha256`,
  );
  const responseSha256 = sha256Value(
    input.responseSha256,
    `${label}.responseSha256`,
  );
  const providerEvidence = freeze({
    providerId: stringValue(input.providerId, `${label}.providerId`, 200),
    model: stringValue(input.model, `${label}.model`, 300),
    providerJobId: stringValue(
      input.providerJobId,
      `${label}.providerJobId`,
      500,
    ),
    requestArtifactId: artifactIdValue(
      input.requestArtifactId,
      `${label}.requestArtifactId`,
      requestSha256,
    ),
    requestSha256,
    responseArtifactId: artifactIdValue(
      input.responseArtifactId,
      `${label}.responseArtifactId`,
      responseSha256,
    ),
    responseSha256,
  });
  if (
    providerEvidence.requestArtifactId === providerEvidence.responseArtifactId
  ) {
    fail(
      "ART_PRODUCTION_CANDIDATE_ADMISSION_INVALID",
      "Provider request and response evidence must be distinct artifacts.",
    );
  }
  return providerEvidence;
}

function normalizeCandidate(
  value: unknown,
  job: ArtProductionBatchJob,
  label = "candidateAdmission.candidate",
): ArtProductionCandidateEvidence {
  const input = record(value, label);
  exactKeys(input, label, [
    "artifactId",
    "sha256",
    "bytes",
    "width",
    "height",
    "alphaPolicy",
  ]);
  const candidateSha256 = sha256Value(input.sha256, `${label}.sha256`);
  const alphaPolicy = stringValue(
    input.alphaPolicy,
    `${label}.alphaPolicy`,
    32,
  );
  if (!ALPHA_POLICIES.has(alphaPolicy)) {
    fail(
      "ART_PRODUCTION_CANDIDATE_ADMISSION_INVALID",
      `${label}.alphaPolicy is unsupported.`,
    );
  }
  const candidate = freeze({
    artifactId: artifactIdValue(
      input.artifactId,
      `${label}.artifactId`,
      candidateSha256,
    ),
    sha256: candidateSha256,
    bytes: integerValue(
      input.bytes,
      `${label}.bytes`,
      1,
      MAXIMUM_SOURCE_BYTES,
    ),
    width: integerValue(input.width, `${label}.width`, 1, 8192),
    height: integerValue(input.height, `${label}.height`, 1, 8192),
    alphaPolicy:
      alphaPolicy as ArtProductionCandidateEvidence["alphaPolicy"],
  });
  if (
    candidate.width !== job.expectedOutput.width ||
    candidate.height !== job.expectedOutput.height ||
    candidate.alphaPolicy !== job.expectedOutput.alphaPolicy
  ) {
    fail(
      "ART_PRODUCTION_CANDIDATE_MISMATCH",
      `Candidate geometry or alpha policy does not match scheduled job ${job.jobSha256}.`,
    );
  }
  return candidate;
}

function ensureDistinctEvidence(
  providerEvidence: ArtProductionProviderEvidence,
  candidate: ArtProductionCandidateEvidence,
  inspectionEvidenceArtifactId: string,
): void {
  const artifacts = [
    providerEvidence.requestArtifactId,
    providerEvidence.responseArtifactId,
    candidate.artifactId,
    inspectionEvidenceArtifactId,
  ];
  if (new Set(artifacts).size !== artifacts.length) {
    fail(
      "ART_PRODUCTION_CANDIDATE_ADMISSION_INVALID",
      "Provider request, provider response, candidate PNG and inspection evidence must be distinct artifacts.",
    );
  }
}

function jobBasisSha256(
  loop: ArtProductionLoop,
  batchSha256: string,
  job: ArtProductionBatchJob,
): string {
  return sha256({
    loopSha256: loop.loopSha256,
    batchSha256,
    job,
  });
}

function requestFromReceipt(
  receipt: ArtProductionCandidateAdmissionReceipt,
): ArtProductionCandidateAdmissionRequestInput {
  return {
    schemaVersion: "1.0",
    kind: ART_PRODUCTION_CANDIDATE_ADMISSION_REQUEST_KIND,
    planId: receipt.planId,
    planSha256: receipt.planSha256,
    loopSha256: receipt.loopSha256,
    profileSha256: receipt.profileSha256,
    batchSha256: receipt.scheduledJob.batchSha256,
    jobSha256: receipt.scheduledJob.jobSha256,
    unitId: receipt.unitId,
    attemptNumber: receipt.scheduledJob.attemptNumber,
    providerEvidence: receipt.providerEvidence,
    candidate: receipt.candidate,
    inspectionEvidenceArtifactId: receipt.inspectionEvidenceArtifactId,
    inspectionEvidenceSha256: receipt.inspectionEvidenceSha256,
    admittedBy: receipt.admittedBy,
    admittedAt: receipt.admittedAt,
  };
}

function admissionBasisSha256(
  receipt: Pick<
    ArtProductionCandidateAdmissionReceipt,
    | "planId"
    | "planSha256"
    | "loopSha256"
    | "profileSha256"
    | "unitId"
    | "scheduledJob"
    | "providerEvidence"
    | "candidate"
    | "inspectionEvidenceArtifactId"
    | "inspectionEvidenceSha256"
    | "admittedBy"
    | "admittedAt"
  >,
): string {
  return sha256({
    planId: receipt.planId,
    planSha256: receipt.planSha256,
    loopSha256: receipt.loopSha256,
    profileSha256: receipt.profileSha256,
    unitId: receipt.unitId,
    scheduledJob: receipt.scheduledJob,
    providerEvidence: receipt.providerEvidence,
    candidate: receipt.candidate,
    inspectionEvidenceArtifactId: receipt.inspectionEvidenceArtifactId,
    inspectionEvidenceSha256: receipt.inspectionEvidenceSha256,
    admittedBy: receipt.admittedBy,
    admittedAt: receipt.admittedAt,
  });
}

function validateReceiptEnvelope(
  input: unknown,
): ArtProductionCandidateAdmissionReceipt {
  const value = record(input, "candidateAdmissionReceipt");
  exactKeys(value, "candidateAdmissionReceipt", [
    "schemaVersion",
    "kind",
    "protocolVersion",
    "planId",
    "planSha256",
    "loopSha256",
    "profileSha256",
    "unitId",
    "scheduledJob",
    "providerEvidence",
    "candidate",
    "inspectionEvidenceArtifactId",
    "inspectionEvidenceSha256",
    "admittedBy",
    "admittedAt",
    "requestSha256",
    "admissionBasisSha256",
    "authority",
    "admissionReceiptSha256",
  ]);
  const receipt = value as unknown as ArtProductionCandidateAdmissionReceipt;
  if (
    receipt.schemaVersion !== "1.0" ||
    receipt.kind !== ART_PRODUCTION_CANDIDATE_ADMISSION_RECEIPT_KIND ||
    receipt.protocolVersion !== ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION
  ) {
    fail(
      "ART_PRODUCTION_CANDIDATE_ADMISSION_RECEIPT_INVALID",
      "Candidate admission receipt protocol identity is invalid.",
    );
  }

  idValue(receipt.planId, "candidateAdmissionReceipt.planId");
  idValue(receipt.unitId, "candidateAdmissionReceipt.unitId");
  sha256Value(receipt.planSha256, "candidateAdmissionReceipt.planSha256");
  sha256Value(receipt.loopSha256, "candidateAdmissionReceipt.loopSha256");
  sha256Value(
    receipt.profileSha256,
    "candidateAdmissionReceipt.profileSha256",
  );

  const scheduledJob = record(
    receipt.scheduledJob,
    "candidateAdmissionReceipt.scheduledJob",
  );
  exactKeys(scheduledJob, "candidateAdmissionReceipt.scheduledJob", [
    "batchSha256",
    "jobSha256",
    "attemptNumber",
    "mode",
    "jobBasisSha256",
  ]);
  sha256Value(
    receipt.scheduledJob.batchSha256,
    "candidateAdmissionReceipt.scheduledJob.batchSha256",
  );
  sha256Value(
    receipt.scheduledJob.jobSha256,
    "candidateAdmissionReceipt.scheduledJob.jobSha256",
  );
  integerValue(
    receipt.scheduledJob.attemptNumber,
    "candidateAdmissionReceipt.scheduledJob.attemptNumber",
    1,
    1000,
  );
  if (
    receipt.scheduledJob.mode !== "generate" &&
    receipt.scheduledJob.mode !== "repair"
  ) {
    fail(
      "ART_PRODUCTION_CANDIDATE_ADMISSION_RECEIPT_INVALID",
      "Candidate admission scheduled job mode is invalid.",
    );
  }
  sha256Value(
    receipt.scheduledJob.jobBasisSha256,
    "candidateAdmissionReceipt.scheduledJob.jobBasisSha256",
  );

  const providerEvidence = normalizeProviderEvidence(
    receipt.providerEvidence,
    "candidateAdmissionReceipt.providerEvidence",
  );
  const candidate = (() => {
    const inputCandidate = record(
      receipt.candidate,
      "candidateAdmissionReceipt.candidate",
    );
    exactKeys(inputCandidate, "candidateAdmissionReceipt.candidate", [
      "artifactId",
      "sha256",
      "bytes",
      "width",
      "height",
      "alphaPolicy",
    ]);
    const digest = sha256Value(
      receipt.candidate.sha256,
      "candidateAdmissionReceipt.candidate.sha256",
    );
    const alphaPolicy = stringValue(
      receipt.candidate.alphaPolicy,
      "candidateAdmissionReceipt.candidate.alphaPolicy",
      32,
    );
    if (!ALPHA_POLICIES.has(alphaPolicy)) {
      fail(
        "ART_PRODUCTION_CANDIDATE_ADMISSION_RECEIPT_INVALID",
        "Candidate admission receipt alpha policy is invalid.",
      );
    }
    return freeze({
      artifactId: artifactIdValue(
        receipt.candidate.artifactId,
        "candidateAdmissionReceipt.candidate.artifactId",
        digest,
      ),
      sha256: digest,
      bytes: integerValue(
        receipt.candidate.bytes,
        "candidateAdmissionReceipt.candidate.bytes",
        1,
        MAXIMUM_SOURCE_BYTES,
      ),
      width: integerValue(
        receipt.candidate.width,
        "candidateAdmissionReceipt.candidate.width",
        1,
        8192,
      ),
      height: integerValue(
        receipt.candidate.height,
        "candidateAdmissionReceipt.candidate.height",
        1,
        8192,
      ),
      alphaPolicy:
        alphaPolicy as ArtProductionCandidateEvidence["alphaPolicy"],
    });
  })();

  const inspectionEvidenceSha256 = sha256Value(
    receipt.inspectionEvidenceSha256,
    "candidateAdmissionReceipt.inspectionEvidenceSha256",
  );
  const inspectionEvidenceArtifactId = artifactIdValue(
    receipt.inspectionEvidenceArtifactId,
    "candidateAdmissionReceipt.inspectionEvidenceArtifactId",
    inspectionEvidenceSha256,
  );
  ensureDistinctEvidence(
    providerEvidence,
    candidate,
    inspectionEvidenceArtifactId,
  );

  stringValue(
    receipt.admittedBy,
    "candidateAdmissionReceipt.admittedBy",
    300,
  );
  canonicalUtc(
    receipt.admittedAt,
    "candidateAdmissionReceipt.admittedAt",
  );
  sha256Value(
    receipt.requestSha256,
    "candidateAdmissionReceipt.requestSha256",
  );
  sha256Value(
    receipt.admissionBasisSha256,
    "candidateAdmissionReceipt.admissionBasisSha256",
  );
  sha256Value(
    receipt.admissionReceiptSha256,
    "candidateAdmissionReceipt.admissionReceiptSha256",
  );

  const authority = record(
    receipt.authority,
    "candidateAdmissionReceipt.authority",
  );
  exactKeys(authority, "candidateAdmissionReceipt.authority", [
    "providerExecution",
    "imageInspection",
    "automaticCandidateAdmission",
    "creativeDecision",
    "imageMutation",
    "packagingExecution",
    "targetRepositoryMutation",
    "gitCommit",
    "gitPush",
    "publication",
    "forcePush",
  ]);
  if (Object.values(authority).some((entry) => entry !== false)) {
    fail(
      "ART_PRODUCTION_CANDIDATE_ADMISSION_RECEIPT_INVALID",
      "Candidate admission receipt authority must remain entirely false.",
    );
  }

  if (receipt.requestSha256 !== sha256(requestFromReceipt(receipt))) {
    fail(
      "ART_PRODUCTION_CANDIDATE_ADMISSION_RECEIPT_INVALID",
      "Candidate admission receipt requestSha256 does not match its normalized request.",
    );
  }
  if (receipt.admissionBasisSha256 !== admissionBasisSha256(receipt)) {
    fail(
      "ART_PRODUCTION_CANDIDATE_ADMISSION_RECEIPT_INVALID",
      "Candidate admission receipt admissionBasisSha256 does not match its governed basis.",
    );
  }
  const { admissionReceiptSha256, ...withoutReceiptSha256 } = receipt;
  if (sha256(withoutReceiptSha256) !== admissionReceiptSha256) {
    fail(
      "ART_PRODUCTION_CANDIDATE_ADMISSION_RECEIPT_INVALID",
      "Candidate admission receipt SHA-256 does not match its submitted payload.",
    );
  }
  return receipt;
}

function compileForVerifiedLoop(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  input: unknown,
): ArtProductionCandidateAdmissionReceipt {
  const admission = record(input, "candidateAdmission");
  exactKeys(admission, "candidateAdmission", [
    "schemaVersion",
    "kind",
    "planId",
    "planSha256",
    "loopSha256",
    "profileSha256",
    "batchSha256",
    "jobSha256",
    "unitId",
    "attemptNumber",
    "providerEvidence",
    "candidate",
    "inspectionEvidenceArtifactId",
    "inspectionEvidenceSha256",
    "admittedBy",
    "admittedAt",
  ]);
  if (
    admission.schemaVersion !== "1.0" ||
    admission.kind !== ART_PRODUCTION_CANDIDATE_ADMISSION_REQUEST_KIND
  ) {
    fail(
      "ART_PRODUCTION_CANDIDATE_ADMISSION_INVALID",
      `Candidate admission request must use schema 1.0 and kind ${ART_PRODUCTION_CANDIDATE_ADMISSION_REQUEST_KIND}.`,
    );
  }

  const planId = idValue(admission.planId, "candidateAdmission.planId");
  const planSha256 = sha256Value(
    admission.planSha256,
    "candidateAdmission.planSha256",
  );
  const loopSha256 = sha256Value(
    admission.loopSha256,
    "candidateAdmission.loopSha256",
  );
  const profileSha256 = sha256Value(
    admission.profileSha256,
    "candidateAdmission.profileSha256",
  );
  if (
    planId !== plan.planId ||
    planSha256 !== plan.planSha256 ||
    loopSha256 !== loop.loopSha256 ||
    profileSha256 !== loop.profileSha256
  ) {
    fail(
      "ART_PRODUCTION_CANDIDATE_ADMISSION_INVALID",
      "Candidate admission request is not bound to the exact plan, loop and profile.",
    );
  }

  const unitId = idValue(admission.unitId, "candidateAdmission.unitId");
  const attemptNumber = integerValue(
    admission.attemptNumber,
    "candidateAdmission.attemptNumber",
    1,
    1000,
  );
  const batch = compileNextArtProductionBatchFromVerifiedLoop(plan, loop);
  const batchSha256 = sha256Value(
    admission.batchSha256,
    "candidateAdmission.batchSha256",
  );
  if (batch.status !== "jobs-ready" || batchSha256 !== batch.batchSha256) {
    fail(
      "ART_PRODUCTION_CANDIDATE_ADMISSION_INVALID",
      "Candidate admission request is not bound to the exact current scheduled batch.",
    );
  }
  const jobSha256 = sha256Value(
    admission.jobSha256,
    "candidateAdmission.jobSha256",
  );
  const job = batch.jobs.find(
    (candidateJob) =>
      candidateJob.unitId === unitId &&
      candidateJob.attemptNumber === attemptNumber,
  );
  if (!job || job.jobSha256 !== jobSha256) {
    fail(
      "ART_PRODUCTION_CANDIDATE_ADMISSION_INVALID",
      `Candidate admission does not identify the exact current job for ${unitId}.`,
    );
  }

  const providerEvidence = normalizeProviderEvidence(
    admission.providerEvidence,
  );
  const candidate = normalizeCandidate(admission.candidate, job);
  const inspectionEvidenceSha256 = sha256Value(
    admission.inspectionEvidenceSha256,
    "candidateAdmission.inspectionEvidenceSha256",
  );
  const inspectionEvidenceArtifactId = artifactIdValue(
    admission.inspectionEvidenceArtifactId,
    "candidateAdmission.inspectionEvidenceArtifactId",
    inspectionEvidenceSha256,
  );
  ensureDistinctEvidence(
    providerEvidence,
    candidate,
    inspectionEvidenceArtifactId,
  );

  const normalizedRequest = freeze({
    schemaVersion: "1.0" as const,
    kind: ART_PRODUCTION_CANDIDATE_ADMISSION_REQUEST_KIND,
    planId,
    planSha256,
    loopSha256,
    profileSha256,
    batchSha256,
    jobSha256,
    unitId,
    attemptNumber,
    providerEvidence,
    candidate,
    inspectionEvidenceArtifactId,
    inspectionEvidenceSha256,
    admittedBy: stringValue(
      admission.admittedBy,
      "candidateAdmission.admittedBy",
      300,
    ),
    admittedAt: canonicalUtc(
      admission.admittedAt,
      "candidateAdmission.admittedAt",
    ),
  });
  const scheduledJob = freeze({
    batchSha256,
    jobSha256,
    attemptNumber,
    mode: job.mode,
    jobBasisSha256: jobBasisSha256(loop, batchSha256, job),
  });
  const basis = {
    planId,
    planSha256,
    loopSha256,
    profileSha256,
    unitId,
    scheduledJob,
    providerEvidence,
    candidate,
    inspectionEvidenceArtifactId,
    inspectionEvidenceSha256,
    admittedBy: normalizedRequest.admittedBy,
    admittedAt: normalizedRequest.admittedAt,
  };
  const partial = {
    schemaVersion: "1.0" as const,
    kind: ART_PRODUCTION_CANDIDATE_ADMISSION_RECEIPT_KIND,
    protocolVersion: ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
    ...basis,
    requestSha256: sha256(normalizedRequest),
    admissionBasisSha256: admissionBasisSha256(basis),
    authority: freeze({
      providerExecution: false as const,
      imageInspection: false as const,
      automaticCandidateAdmission: false as const,
      creativeDecision: false as const,
      imageMutation: false as const,
      packagingExecution: false as const,
      targetRepositoryMutation: false as const,
      gitCommit: false as const,
      gitPush: false as const,
      publication: false as const,
      forcePush: false as const,
    }),
  };
  return freeze({
    ...partial,
    admissionReceiptSha256: sha256(partial),
  });
}

export function compileArtProductionCandidateAdmissionReceipt(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  input: unknown,
): ArtProductionCandidateAdmissionReceipt {
  verifyArtProductionLoop(plan, loop);
  return compileForVerifiedLoop(plan, loop, input);
}

export function verifyArtProductionCandidateAdmissionReceiptForVerifiedLoop(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  input: unknown,
): ArtProductionCandidateAdmissionReceipt {
  const receipt = validateReceiptEnvelope(input);
  const expected = compileForVerifiedLoop(
    plan,
    loop,
    requestFromReceipt(receipt),
  );
  if (expected.admissionReceiptSha256 !== receipt.admissionReceiptSha256) {
    fail(
      "ART_PRODUCTION_CANDIDATE_ADMISSION_RECEIPT_INVALID",
      "Candidate admission receipt is not the deterministic compilation of the exact plan, loop, scheduled job and submitted evidence request.",
      {
        expectedAdmissionReceiptSha256: expected.admissionReceiptSha256,
        actualAdmissionReceiptSha256: receipt.admissionReceiptSha256,
      },
    );
  }
  return receipt;
}

export function verifyArtProductionCandidateAdmissionReceipt(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  input: unknown,
): true {
  verifyArtProductionLoop(plan, loop);
  verifyArtProductionCandidateAdmissionReceiptForVerifiedLoop(
    plan,
    loop,
    input,
  );
  return true;
}

export function verifyArtProductionCandidateAdmissionReceiptAgainstRequest(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  request: unknown,
  input: unknown,
): true {
  verifyArtProductionLoop(plan, loop);
  const receipt =
    verifyArtProductionCandidateAdmissionReceiptForVerifiedLoop(
      plan,
      loop,
      input,
    );
  const expected = compileForVerifiedLoop(plan, loop, request);
  if (
    expected.requestSha256 !== receipt.requestSha256 ||
    expected.admissionReceiptSha256 !== receipt.admissionReceiptSha256
  ) {
    fail(
      "ART_PRODUCTION_CANDIDATE_ADMISSION_RECEIPT_INVALID",
      "Candidate admission receipt is not bound to the exact submitted admission request.",
    );
  }
  return true;
}
