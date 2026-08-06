import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOK_AUTHORING_CONTRACT,
  BOOK_UNATTENDED_EDITORIAL_CONSENSUS_CONTRACT,
  BOOK_UNATTENDED_EDITORIAL_RUNTIME_EVIDENCE_CONTRACT,
  BOOK_WRITING_CANDIDATE_CONTRACT,
  BOOK_WRITING_HANDOFF_CONTRACT,
  canonicalBookJson,
  compileBookNarrativeCraftPacket,
  compileBookWritingCandidateRuntimeRequest,
  compileBookWritingHandoffRequest,
  evaluateBookUnattendedEditorialConsensusWithRuntimeEvidence,
  fingerprintBookNarrativeIndependentReviewReceipt,
  fingerprintBookUnattendedEditorialReviewerExecution,
  fingerprintBookUnattendedEditorialReviewerPayload,
  fingerprintBookUnattendedEditorialReviewerRuntimeEvidence,
  fingerprintBookWritingCandidateRuntimeResult,
  fingerprintBookWritingCandidateStorageReceipt,
  fingerprintBookWritingHandoffResponse,
  sha256BookText,
  validateAndNormalizeBookAuthoringPacket,
} from "../src/index.ts";
import {
  acceptedScan,
  criterionEvidence,
  validInput,
} from "./book-studio-narrative-craft-fixtures.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;
const candidateId = "candidate-editorial-one";
const candidateProducerId = "writer-one";
const candidateText =
  "Mara accepts the archive debt, protects the ally, and leaves with access that changes the next council vote.";
const voiceText =
  "Project-owned voice evidence: precise concrete observation, restrained emotion labels, and dialogue that changes leverage.";
const executionRequestedAt = "2026-08-04T09:05:00.000Z";
const payloadCompletedAt = "2026-08-04T09:06:00.000Z";
const runtimeCompletedAt = "2026-08-04T09:07:00.000Z";

async function assignment(
  reviewerProducerId,
  criterionIds,
  character,
  requiredEvidenceIds,
  candidateTextSha256,
) {
  const responseContractFingerprint = digest(
    character === "a" ? "c" : "d",
  );
  const candidateContextId = `candidate-context-${reviewerProducerId}`;
  const voiceContextId = `voice-context-${reviewerProducerId}`;
  const candidateContextFingerprint = digest(
    character === "a" ? "e" : "f",
  );
  const voiceContextFingerprint = digest(
    character === "a" ? "a" : "b",
  );
  const packetInput = {
    outputKind: "evavo_docs_book_authoring_packet",
    schemaVersion: 1,
    contract: BOOK_AUTHORING_CONTRACT,
    authorityMode: "shadow_migration",
    packetId: `packet-${reviewerProducerId}`,
    projectId: "project-alpha",
    programmeId: "programme-alpha",
    volumeId: "volume-one",
    manuscriptRevisionId: "revision-editorial-one",
    manuscriptSha256: candidateTextSha256,
    projectFingerprint: digest("1"),
    storyStateFingerprint: digest("2"),
    executionTaskId: `task-${reviewerProducerId}`,
    taskFingerprint: digest(character === "a" ? "3" : "4"),
    provider: "other_compatible_model",
    modelName: `review-model-${reviewerProducerId}`,
    operation: "critique_candidate",
    responseMode: "adapter_structured_output",
    responseContractFingerprint,
    targetUnitIds: ["candidate-unit-one"],
    readOnlyUnitIds: [],
    expectedChangedUnitIds: [],
    allowedActionIds: ["review-candidate"],
    prohibitedActionIds: [
      "change-candidate",
      "admit-canon",
      "call-art-studio",
      "publish-book",
    ],
    requiredOutputStateIds: ["editorial-review-receipts"],
    contextEvidenceIds: ["candidate-context-evidence"],
    projectVoiceAnchorIds: ["project-voice-anchor"],
    factClaimIds: [],
    researchClaimIds: [],
    narrativeConstraintIds: ["narrative-craft-packet"],
    acceptedPatternIds: [],
    rejectedPatternIds: ["generic-review-assertion"],
    unresolvedIssueIds: [],
    unresolvedResearchIds: [],
    checkpointId: `checkpoint-${reviewerProducerId}`,
    checkpointFingerprint: digest(character === "a" ? "5" : "6"),
    idempotencyKey: `editorial-review-${reviewerProducerId}`,
    maximumOutputCharacters: 400_000,
    createdAt: "2026-08-04T09:00:00.000Z",
    expiresAt: "2026-08-04T10:00:00.000Z",
    remainingUnitIds: [],
    providerMayMutateCanonicalState: false,
    automaticCanonicalAdmissionAllowed: false,
    websiteCompatibilityRuntimeStillAuthoritative: true,
    dualAuthoritativeWritesAllowed: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
  const packetValidation =
    await validateAndNormalizeBookAuthoringPacket(packetInput);
  assert.equal(
    packetValidation.status,
    "ready",
    packetValidation.blockers.join("\n"),
  );
  const packet = packetValidation.packet;
  assert.ok(packet);

  const handoffResult = await compileBookWritingHandoffRequest(
    packet,
    {
      requestId: `writing-request-${reviewerProducerId}`,
      allowedProviderIds: ["other_compatible_model"],
      providerPolicyFingerprint: digest("7"),
      voiceProfileId: "voice-profile-project-alpha",
      voiceProfileFingerprint: digest("8"),
      factSetFingerprint: digest("9"),
      contextObjectIds: [candidateContextId, voiceContextId],
      contextObjectFingerprints: [
        candidateContextFingerprint,
        voiceContextFingerprint,
      ],
      requiredEvidenceIds,
      outputContractFingerprint: responseContractFingerprint,
      requestedAt: executionRequestedAt,
      expiresAt: "2026-08-04T10:00:00.000Z",
    },
  );
  assert.equal(
    handoffResult.status,
    "ready",
    handoffResult.blockers.join("\n"),
  );
  assert.ok(handoffResult.request);

  const candidateCompileInput = {
    outputKind: "evavo_docs_book_writing_candidate_compile_input",
    schemaVersion: 1,
    packet,
    handoffRequest: handoffResult.request,
    requestedProvider: "other_compatible_model",
    modelName: `review-model-${reviewerProducerId}`,
    prompt: {
      systemInstruction:
        "Review independently. Do not imitate a named creator, change the candidate, admit canon or publish.",
      taskInstruction:
        `Evaluate every assigned criterion exactly once: ${criterionIds.join(", ")}.`,
      responseInstruction:
        "Return only one strict evavo_docs_book_unattended_editorial_reviewer_payload JSON object.",
    },
    contextBlocks: [
      {
        objectId: candidateContextId,
        objectFingerprint: candidateContextFingerprint,
        role: "target_manuscript",
        text: candidateText,
      },
      {
        objectId: voiceContextId,
        objectFingerprint: voiceContextFingerprint,
        role: "voice",
        text: voiceText,
      },
    ],
    maximumOutputCharacters: 400_000,
    maximumOutputTokens: 60_000,
    timeoutMilliseconds: 240_000,
    requestedAt: executionRequestedAt,
    providerCallAllowed: true,
    providerRetryAllowed: false,
    writingStudioMayMutateManuscript: false,
    canonicalAdmissionAllowed: false,
    remoteBookStateWriteAllowed: false,
    artStudioCallAllowed: false,
    publicationPerformed: false,
  };
  const runtimeCompilation =
    await compileBookWritingCandidateRuntimeRequest(candidateCompileInput);
  assert.equal(
    runtimeCompilation.status,
    "ready",
    runtimeCompilation.blockers.join("\n"),
  );
  assert.ok(runtimeCompilation.runtimeRequest);
  const runtimeRequest = runtimeCompilation.runtimeRequest;
  const assignmentId = `assignment-${reviewerProducerId}`;
  const assignmentIdentity = {
    outputKind:
      "evavo_docs_book_unattended_editorial_reviewer_assignment_identity",
    schemaVersion: 1,
    contract: BOOK_UNATTENDED_EDITORIAL_CONSENSUS_CONTRACT,
    assignmentId,
    reviewerProducerId,
    reviewerProvider: packet.provider,
    reviewerModel: packet.modelName,
    criterionIds,
    packetFingerprint: packet.packetFingerprint,
    runtimeRequestFingerprint: runtimeRequest.runtimeRequestFingerprint,
    candidateId,
    candidateTextSha256,
  };
  return {
    assignmentId,
    assignmentFingerprint:
      await sha256BookText(canonicalBookJson(assignmentIdentity)),
    reviewerProducerId,
    reviewerProvider: packet.provider,
    reviewerModel: packet.modelName,
    criterionIds,
    authoringPacket: packet,
    runtimeRequest,
    candidateCompileInput,
    providerAttemptLimit: 1,
    providerFallbackAllowed: false,
    reviewerWasCandidateProducer: false,
  };
}

async function programmeFixture() {
  const compiled = await compileBookNarrativeCraftPacket(await validInput());
  assert.equal(compiled.status, "ready", JSON.stringify(compiled.blockers));
  assert.ok(compiled.packet);
  const narrativeCraftPacket = compiled.packet;
  const candidateTextSha256 = await sha256BookText(candidateText);
  const phraseOverlapScan = await acceptedScan(candidateId, candidateText);
  const evidence = await criterionEvidence(
    narrativeCraftPacket,
    candidateId,
    candidateTextSha256,
  );
  const criterionIds = narrativeCraftPacket.qualityRubric
    .map((item) => item.criterionId)
    .sort();
  const stagePlan = {
    stageId: "volume-one:editorial_review",
    volumeId: "volume-one",
    kind: "editorial_review",
    owner: "docs_suite",
    sourceAutomaticExecutionAllowed: false,
    mode: "machine_consensus",
    dispatchTarget: "docs_suite",
    dispatchOperation: "review.evaluate_admission",
    unattendedExecutionAllowed: true,
    requiresIndependentConsensus: true,
    minimumIndependentReviewers: 2,
    minimumConsensusBasisPoints: 9000,
    revisionCycleLimit: 8,
    selectionAuthority: "not_applicable",
    requiresGovernedAdmissionReceipt: false,
    requiresExternalEvidence: false,
    dependencyStageIds: ["volume-one:writing_candidate"],
    sourceGateIds: ["independent_review"],
    gateIds: [
      "independent_review",
      "independent_text_review_consensus",
      "minimum_independent_text_reviewers:2",
      "minimum_text_consensus_basis_points:9000",
    ],
  };
  const dependencyReceipts = [{
    stageId: "volume-one:writing_candidate",
    receiptFingerprint: digest("6"),
    completedAt: "2026-08-04T08:55:00.000Z",
  }];
  const identity = {
    unattendedRequestFingerprint: digest("1"),
    unattendedReadinessFingerprint: digest("2"),
    unattendedResultFingerprint: digest("3"),
    volumePlanFingerprint: digest("4"),
    candidateStorageReceiptFingerprint: digest("5"),
    candidateEvidenceIds: ["candidate-evidence-one"],
  };
  const requiredEvidenceIds = [...new Set([
    identity.unattendedRequestFingerprint,
    identity.unattendedReadinessFingerprint,
    identity.unattendedResultFingerprint,
    identity.volumePlanFingerprint,
    stagePlan.stageId,
    identity.candidateStorageReceiptFingerprint,
    ...identity.candidateEvidenceIds,
    ...stagePlan.sourceGateIds,
    ...stagePlan.gateIds,
    ...dependencyReceipts.map((item) => item.receiptFingerprint),
  ])].sort();
  const reviewerAssignments = [
    await assignment(
      "reviewer-alpha",
      criterionIds,
      "a",
      requiredEvidenceIds,
      candidateTextSha256,
    ),
    await assignment(
      "reviewer-beta",
      criterionIds,
      "b",
      requiredEvidenceIds,
      candidateTextSha256,
    ),
  ].sort((left, right) =>
    left.reviewerProducerId.localeCompare(right.reviewerProducerId)
      || left.assignmentId.localeCompare(right.assignmentId),
  );
  const unsigned = {
    outputKind:
      "evavo_docs_book_unattended_editorial_consensus_programme",
    schemaVersion: 1,
    contract: BOOK_UNATTENDED_EDITORIAL_CONSENSUS_CONTRACT,
    status: "ready",
    projectId: "project-alpha",
    programmeId: "programme-alpha",
    volumeId: "volume-one",
    stageId: stagePlan.stageId,
    stagePlan,
    ...identity,
    candidateId,
    candidateProducerId,
    candidateTextSha256,
    narrativeCraftPacket,
    phraseOverlapScan,
    dependencyReceipts,
    reviewerAssignments,
    unresolvedFindingIds: [],
    evaluationEvidenceIds: ["editorial-evaluation-evidence"],
    executionRequestedAt,
    executionRequestedBy: "book-production-supervisor",
    minimumIndependentReviewers: 2,
    minimumConsensusBasisPoints: 9000,
    providerCallAllowed: true,
    providerCallPerformed: false,
    oneProviderAttemptPerReviewerRequired: true,
    providerFallbackAllowed: false,
    blindIndependentReviewRequired: true,
    dissentPreservationRequired: true,
    authoritativeBookStateWritePerformed: false,
    canonicalManuscriptMutationPerformed: false,
    automaticCanonicalAdmissionAllowed: false,
    artStudioCalled: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
  return {
    programme: {
      ...unsigned,
      programmeFingerprint:
        await sha256BookText(canonicalBookJson(unsigned)),
    },
    evidence,
  };
}

async function reviewerResult(programme, reviewerProducerId, evidence) {
  const assignment = programme.reviewerAssignments.find(
    (item) => item.reviewerProducerId === reviewerProducerId,
  );
  assert.ok(assignment);
  const receipts = evidence.map((item) =>
    item.independentReviews.find(
      (review) => review.reviewerProducerId === reviewerProducerId,
    ),
  );
  assert.ok(receipts.every(Boolean));
  const payloadUnsigned = {
    outputKind:
      "evavo_docs_book_unattended_editorial_reviewer_payload",
    schemaVersion: 1,
    contract: BOOK_UNATTENDED_EDITORIAL_CONSENSUS_CONTRACT,
    assignmentId: assignment.assignmentId,
    assignmentFingerprint: assignment.assignmentFingerprint,
    candidateId: programme.candidateId,
    candidateTextSha256: programme.candidateTextSha256,
    reviewerProducerId,
    reviewerProvider: assignment.reviewerProvider,
    reviewerModel: assignment.reviewerModel,
    receipts,
    minorityFindingIds: [],
    completedAt: payloadCompletedAt,
    reviewerWasCandidateProducer: false,
    canonicalAdmissionAllowed: false,
    canonicalManuscriptMutationPerformed: false,
    publicationPerformed: false,
  };
  const payload = {
    ...payloadUnsigned,
    payloadFingerprint:
      await fingerprintBookUnattendedEditorialReviewerPayload(payloadUnsigned),
  };
  const payloadText = canonicalBookJson(payload);
  const payloadSha256 = await sha256BookText(payloadText);
  const payloadByteLength = utf8ByteLength(payloadText);
  const suffix = reviewerProducerId === "reviewer-alpha" ? "alpha" : "beta";
  const storageUnsigned = {
    disposition: "written",
    objectId: `editorial-review-payload-${suffix}`,
    candidateSha256: payloadSha256,
    candidateByteLength: payloadByteLength,
    storedAt: runtimeCompletedAt,
  };
  const storageReceipt = {
    ...storageUnsigned,
    storageReceiptFingerprint:
      await fingerprintBookWritingCandidateStorageReceipt(storageUnsigned),
  };
  const responseUnsigned = {
    outputKind: "evavo_docs_writing_handoff_response",
    schemaVersion: 1,
    contract: BOOK_WRITING_HANDOFF_CONTRACT,
    requestId: assignment.runtimeRequest.handoffRequest.requestId,
    requestFingerprint:
      assignment.runtimeRequest.handoffRequest.requestFingerprint,
    packetId: assignment.runtimeRequest.handoffRequest.packetId,
    packetFingerprint:
      assignment.runtimeRequest.handoffRequest.packetFingerprint,
    provider: assignment.reviewerProvider,
    modelName: assignment.reviewerModel,
    status: "complete",
    candidateObjectId: storageReceipt.objectId,
    candidateSha256: storageReceipt.candidateSha256,
    candidateByteLength: storageReceipt.candidateByteLength,
    voiceEvidenceIds: ["project-voice-anchor"],
    factEvidenceIds: ["candidate-context-evidence"],
    qualityReceiptIds: [
      payload.payloadFingerprint,
      ...receipts.map((item) => item.reviewFingerprint),
    ].sort(),
    unresolvedRiskIds: [],
    continuationRequired: false,
    completedAt: runtimeCompletedAt,
    writingStudioMayMutateManuscript: false,
    canonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
  const handoffResponse = {
    ...responseUnsigned,
    responseFingerprint:
      await fingerprintBookWritingHandoffResponse(responseUnsigned),
  };
  const runtimeUnsigned = {
    outputKind: "evavo_docs_book_candidate_runtime_result",
    schemaVersion: 1,
    contract: BOOK_WRITING_CANDIDATE_CONTRACT,
    status: "completed",
    runtimeRequestFingerprint:
      assignment.runtimeRequest.runtimeRequestFingerprint,
    handoffResponse,
    candidateText: null,
    storageReceipt,
    providerRequestId: `provider-request-${suffix}`,
    providerStopReason: "completed",
    providerAttemptCount: 1,
    providerCalled: true,
    blockers: [],
    warnings: [],
    completedAt: runtimeCompletedAt,
    candidateEvidenceStored: true,
    authoritativeBookStateWritePerformed: false,
    canonicalManuscriptMutationPerformed: false,
    artStudioCalled: false,
    publicationPerformed: false,
  };
  const runtimeResult = {
    ...runtimeUnsigned,
    resultFingerprint:
      await fingerprintBookWritingCandidateRuntimeResult(runtimeUnsigned),
  };
  const executionUnsigned = {
    assignmentId: assignment.assignmentId,
    assignmentFingerprint: assignment.assignmentFingerprint,
    runtimeRequestFingerprint:
      assignment.runtimeRequest.runtimeRequestFingerprint,
    runtimeResultFingerprint: runtimeResult.resultFingerprint,
    providerRequestId: runtimeResult.providerRequestId,
    providerAttemptCount: 1,
    providerCalled: true,
    providerFallbackAllowed: false,
    payload,
  };
  const execution = {
    ...executionUnsigned,
    executionFingerprint:
      await fingerprintBookUnattendedEditorialReviewerExecution(
        executionUnsigned,
      ),
  };
  const evidenceUnsigned = {
    outputKind:
      "evavo_docs_book_unattended_editorial_reviewer_runtime_evidence",
    schemaVersion: 1,
    contract: BOOK_UNATTENDED_EDITORIAL_RUNTIME_EVIDENCE_CONTRACT,
    assignmentId: assignment.assignmentId,
    runtimeResult,
  };
  const runtimeEvidence = {
    ...evidenceUnsigned,
    evidenceFingerprint:
      await fingerprintBookUnattendedEditorialReviewerRuntimeEvidence(
        evidenceUnsigned,
      ),
  };
  return { execution, runtimeEvidence };
}

async function validInputFixture() {
  const { programme, evidence } = await programmeFixture();
  const reviewerResults = [];
  for (const reviewer of ["reviewer-alpha", "reviewer-beta"]) {
    reviewerResults.push(await reviewerResult(programme, reviewer, evidence));
  }
  return {
    outputKind:
      "evavo_docs_book_unattended_editorial_runtime_evidence_input",
    schemaVersion: 1,
    contract: BOOK_UNATTENDED_EDITORIAL_RUNTIME_EVIDENCE_CONTRACT,
    programme,
    reviewerExecutions: reviewerResults.map((item) => item.execution),
    reviewerRuntimeEvidence:
      reviewerResults.map((item) => item.runtimeEvidence),
  };
}

test(
  "admits editorial consensus only after exact runtime-result and immutable payload binding",
  async () => {
    const input = await validInputFixture();
    const result =
      await evaluateBookUnattendedEditorialConsensusWithRuntimeEvidence(input);
    assert.equal(
      result.status,
      "ready_for_governed_admission",
      JSON.stringify(result.blockers),
    );
    assert.equal(result.providerCallsPerformed, 2);
    assert.equal(result.automaticCanonicalAdmissionAllowed, false);
    assert.equal(result.canonicalManuscriptMutationPerformed, false);
    assert.equal(result.publicationPerformed, false);
  },
);

test(
  "blocks duplicate assignment executions even when the legacy set comparison would preserve coverage",
  async () => {
    const input = await validInputFixture();
    input.reviewerExecutions.push(
      structuredClone(input.reviewerExecutions[0]),
    );
    const result =
      await evaluateBookUnattendedEditorialConsensusWithRuntimeEvidence(input);
    assert.equal(result.status, "blocked");
    assert.ok(
      result.blockers.some((item) =>
        /exactly once|assignment IDs|fingerprints/i.test(item),
      ),
      JSON.stringify(result.blockers),
    );
  },
);

test(
  "blocks self-consistent execution fingerprints when stored runtime bytes differ from the reviewer payload",
  async () => {
    const input = await validInputFixture();
    const evidence = input.reviewerRuntimeEvidence[0];
    evidence.runtimeResult.storageReceipt.candidateSha256 = digest("f");
    evidence.runtimeResult.handoffResponse.candidateSha256 = digest("f");
    const responseUnsigned = { ...evidence.runtimeResult.handoffResponse };
    delete responseUnsigned.responseFingerprint;
    evidence.runtimeResult.handoffResponse.responseFingerprint =
      await fingerprintBookWritingHandoffResponse(responseUnsigned);
    const runtimeUnsigned = { ...evidence.runtimeResult };
    delete runtimeUnsigned.resultFingerprint;
    evidence.runtimeResult.resultFingerprint =
      await fingerprintBookWritingCandidateRuntimeResult(runtimeUnsigned);
    const evidenceUnsigned = { ...evidence };
    delete evidenceUnsigned.evidenceFingerprint;
    evidence.evidenceFingerprint =
      await fingerprintBookUnattendedEditorialReviewerRuntimeEvidence(
        evidenceUnsigned,
      );
    input.reviewerExecutions[0].runtimeResultFingerprint =
      evidence.runtimeResult.resultFingerprint;
    const executionUnsigned = { ...input.reviewerExecutions[0] };
    delete executionUnsigned.executionFingerprint;
    input.reviewerExecutions[0].executionFingerprint =
      await fingerprintBookUnattendedEditorialReviewerExecution(
        executionUnsigned,
      );

    const result =
      await evaluateBookUnattendedEditorialConsensusWithRuntimeEvidence(input);
    assert.equal(result.status, "blocked");
    assert.ok(
      result.blockers.some((item) =>
        /storage receipt fingerprint|immutable runtime candidate bytes/i.test(item),
      ),
      JSON.stringify(result.blockers),
    );
  },
);

function utf8ByteLength(value) {
  let length = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) length += 1;
    else if (codePoint <= 0x7ff) length += 2;
    else if (codePoint <= 0xffff) length += 3;
    else length += 4;
  }
  return length;
}
