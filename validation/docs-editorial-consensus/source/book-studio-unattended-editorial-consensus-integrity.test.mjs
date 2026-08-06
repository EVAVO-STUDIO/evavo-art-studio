import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOK_AUTHORING_CONTRACT,
} from "../src/book-studio-authoring-types.ts";
import {
  validateAndNormalizeBookAuthoringPacket,
} from "../src/book-studio-authoring-packet.ts";
import {
  compileBookWritingCandidateRuntimeRequest,
} from "../src/book-studio-writing-candidate-contracts.ts";
import {
  compileBookWritingHandoffRequest,
} from "../src/book-studio-writing-handoff-request.ts";
import {
  BOOK_UNATTENDED_EDITORIAL_CONSENSUS_CONTRACT,
} from "../src/book-studio-unattended-editorial-consensus.ts";
import {
  evaluateBookUnattendedEditorialConsensusIntegrity,
  validateBookUnattendedEditorialConsensusProgrammeIntegrity,
} from "../src/book-studio-unattended-editorial-consensus-integrity.ts";
import {
  compileBookNarrativeCraftPacket,
} from "../src/book-studio-narrative-craft.ts";
import {
  canonicalBookJson,
  sha256BookText,
} from "../src/book-studio-project-contracts.ts";
import {
  acceptedScan,
  validInput,
} from "./book-studio-narrative-craft-fixtures.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;
const candidateId = "candidate-editorial-one";
const candidateProducerId = "writer-one";
const candidateText =
  "Mara accepts the archive debt, protects the ally, and leaves with access that changes the next council vote.";
const voiceText =
  "Project-owned voice evidence: precise concrete observation, restrained emotion labels, and dialogue that changes leverage.";
const candidateTextSha256 = await sha256BookText(candidateText);
const executionRequestedAt = "2026-08-04T09:05:00.000Z";

async function assignment(
  reviewerProducerId,
  criterionIds,
  character,
  requiredEvidenceIds,
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
    checkpointFingerprint: digest(
      character === "a" ? "5" : "6",
    ),
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

  const contextObjectIds = [candidateContextId, voiceContextId];
  const contextObjectFingerprints = [
    candidateContextFingerprint,
    voiceContextFingerprint,
  ];
  const handoffResult = await compileBookWritingHandoffRequest(
    packet,
    {
      requestId: `writing-request-${reviewerProducerId}`,
      allowedProviderIds: ["other_compatible_model"],
      providerPolicyFingerprint: digest("7"),
      voiceProfileId: "voice-profile-project-alpha",
      voiceProfileFingerprint: digest("8"),
      factSetFingerprint: digest("9"),
      contextObjectIds,
      contextObjectFingerprints,
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
  const narrativeCraftPacket = compiled.packet;
  const phraseOverlapScan = await acceptedScan(candidateId, candidateText);
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
    ),
    await assignment(
      "reviewer-beta",
      criterionIds,
      "b",
      requiredEvidenceIds,
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
    ...unsigned,
    programmeFingerprint:
      await sha256BookText(canonicalBookJson(unsigned)),
  };
}

test(
  "strict integrity recompiles reviewer assignments and blocks forged self-review despite a fresh outer fingerprint",
  async () => {
    const programme = await programmeFixture();
    const validBlockers =
      await validateBookUnattendedEditorialConsensusProgrammeIntegrity(
        programme,
      );
    assert.deepEqual(validBlockers, []);

    const tampered = structuredClone(programme);
    tampered.reviewerAssignments[0].reviewerProducerId =
      candidateProducerId;
    tampered.reviewerAssignments[0].reviewerModel =
      "forged-self-review-model";
    const { programmeFingerprint: _discarded, ...unsigned } = tampered;
    tampered.programmeFingerprint =
      await sha256BookText(canonicalBookJson(unsigned));

    const blockers =
      await validateBookUnattendedEditorialConsensusProgrammeIntegrity(
        tampered,
      );
    assert.ok(
      blockers.some((item) =>
        /not independent from the candidate producer|semantic recompilation/i
          .test(item),
      ),
      JSON.stringify(blockers),
    );

    const result =
      await evaluateBookUnattendedEditorialConsensusIntegrity({
        outputKind:
          "evavo_docs_book_unattended_editorial_consensus_evaluation_input",
        schemaVersion: 1,
        contract: BOOK_UNATTENDED_EDITORIAL_CONSENSUS_CONTRACT,
        programme: tampered,
        reviewerExecutions: [],
      });
    assert.equal(result.status, "blocked");
    assert.equal(result.providerCallsPerformed, 0);
    assert.equal(result.providerFallbackAllowed, false);
    assert.equal(result.canonicalManuscriptMutationPerformed, false);
    assert.equal(result.automaticCanonicalAdmissionAllowed, false);
    assert.equal(result.publicationPerformed, false);
  },
);
