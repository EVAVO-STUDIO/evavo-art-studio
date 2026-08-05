import { validateAndNormalizeBookAuthoringPacket } from "./book-studio-authoring-packet";
import type { BookAuthoringPacketV1 } from "./book-studio-authoring-types";
import {
  evaluateBookUnattendedEditorialConsensus as evaluateBaseConsensus,
  validateBookUnattendedEditorialConsensusProgramme as validateBaseProgramme,
} from "./book-studio-unattended-editorial-consensus";
import type {
  BookUnattendedEditorialConsensusEvaluationResultV1,
  BookUnattendedEditorialConsensusProgrammeV1,
  BookUnattendedEditorialReviewerAssignmentV1,
} from "./book-studio-unattended-editorial-consensus";
import { validateBookNarrativeCraftPacket } from "./book-studio-narrative-craft-packet";
import { validateBookPhraseOverlapScanIntegrity } from "./book-studio-phrase-overlap-integrity";
import {
  canonicalBookJson,
  sha256BookText,
} from "./book-studio-project-contracts";
import {
  compileBookWritingCandidateRuntimeRequest,
} from "./book-studio-writing-candidate-contracts";

const REVIEW_RESPONSE_CONTRACT =
  "evavo_docs_book_unattended_editorial_reviewer_payload";
const REVIEW_OPERATIONS = new Set([
  "critique_candidate",
  "evaluate_voice",
  "fact_check_candidate",
  "continuity_review",
  "custom",
]);

export async function validateBookUnattendedEditorialConsensusProgrammeIntegrity(
  value: unknown,
): Promise<string[]> {
  const blockers = [
    ...await validateBaseProgramme(value),
  ];
  if (blockers.length) return unique(blockers).sort();

  const programme = value as BookUnattendedEditorialConsensusProgrammeV1;
  const packetBlockers = await validateBookNarrativeCraftPacket(
    programme.narrativeCraftPacket,
  );
  blockers.push(...packetBlockers.map((item) => `Narrative packet: ${item}`));
  const phraseBlockers = await validateBookPhraseOverlapScanIntegrity(
    programme.phraseOverlapScan,
  );
  blockers.push(...phraseBlockers.map((item) => `Phrase overlap: ${item}`));

  if (programme.stagePlan.stageId !== programme.stageId) {
    blockers.push("Editorial stage identity differs from the programme stageId.");
  }
  if (
    programme.stagePlan.volumeId !== programme.volumeId
    || programme.stagePlan.kind !== "editorial_review"
    || programme.stagePlan.mode !== "machine_consensus"
    || programme.stagePlan.dispatchTarget !== "docs_suite"
    || programme.stagePlan.dispatchOperation !== "review.evaluate_admission"
    || programme.stagePlan.unattendedExecutionAllowed !== true
    || programme.stagePlan.requiresIndependentConsensus !== true
  ) {
    blockers.push("Editorial stage semantics differ from the governed machine-consensus boundary.");
  }
  if (
    programme.minimumIndependentReviewers
      !== programme.stagePlan.minimumIndependentReviewers
    || programme.minimumConsensusBasisPoints
      !== programme.stagePlan.minimumConsensusBasisPoints
  ) {
    blockers.push("Editorial consensus thresholds differ from the exact stage plan.");
  }
  const expectedDependencies = [...programme.stagePlan.dependencyStageIds].sort();
  const observedDependencies = programme.dependencyReceipts
    .map((item) => item.stageId)
    .sort();
  if (!sameSet(expectedDependencies, observedDependencies)) {
    blockers.push("Editorial dependency receipts differ from the exact stage dependency set.");
  }
  if (
    duplicate(programme.dependencyReceipts.map((item) => item.stageId)).length
    || duplicate(
      programme.dependencyReceipts.map((item) => item.receiptFingerprint),
    ).length
  ) {
    blockers.push("Editorial dependency receipts repeat a stage or receipt identity.");
  }
  if (programme.dependencyReceipts.some(
    (item) => Date.parse(item.completedAt) > Date.parse(programme.executionRequestedAt),
  )) {
    blockers.push("An editorial dependency receipt completes after executionRequestedAt.");
  }

  if (
    programme.narrativeCraftPacket.projectId !== programme.projectId
    || programme.narrativeCraftPacket.programmeId !== programme.programmeId
    || programme.narrativeCraftPacket.volumeId !== programme.volumeId
  ) {
    blockers.push("Narrative packet identity differs from the editorial programme.");
  }
  if (
    programme.phraseOverlapScan.candidateId !== programme.candidateId
    || programme.phraseOverlapScan.candidateTextSha256
      !== programme.candidateTextSha256
  ) {
    blockers.push("Phrase-overlap evidence differs from the exact editorial candidate bytes.");
  }

  const criterionIds = programme.narrativeCraftPacket.qualityRubric
    .map((item) => item.criterionId)
    .sort();
  const requiredEvidenceIds = unique([
    programme.unattendedRequestFingerprint,
    programme.unattendedReadinessFingerprint,
    programme.unattendedResultFingerprint,
    programme.volumePlanFingerprint,
    programme.stageId,
    programme.candidateStorageReceiptFingerprint,
    ...programme.candidateEvidenceIds,
    ...programme.stagePlan.sourceGateIds,
    ...programme.stagePlan.gateIds,
    ...programme.dependencyReceipts.map((item) => item.receiptFingerprint),
  ]).sort();

  if (
    programme.reviewerAssignments.length
      < programme.minimumIndependentReviewers
    || programme.reviewerAssignments.length > 8
  ) {
    blockers.push("Editorial reviewer assignment count is outside the exact governed boundary.");
  }
  if (duplicate(
    programme.reviewerAssignments.map((item) => item.assignmentId),
  ).length) {
    blockers.push("Editorial reviewer assignment identities are duplicated.");
  }
  if (duplicate(
    programme.reviewerAssignments.map((item) => item.reviewerProducerId),
  ).length) {
    blockers.push("Editorial reviewer producer identities are duplicated.");
  }
  if (duplicate(
    programme.reviewerAssignments.map(
      (item) => item.runtimeRequest.runtimeRequestFingerprint,
    ),
  ).length) {
    blockers.push("Editorial reviewer runtime request fingerprints are duplicated.");
  }

  const recompiledAssignments: BookUnattendedEditorialReviewerAssignmentV1[] = [];
  for (const assignment of programme.reviewerAssignments) {
    const recompiled = await recompileAssignment(
      assignment,
      programme,
      criterionIds,
      requiredEvidenceIds,
      blockers,
    );
    if (recompiled) recompiledAssignments.push(recompiled);
  }
  recompiledAssignments.sort((left, right) =>
    left.reviewerProducerId.localeCompare(right.reviewerProducerId)
      || left.assignmentId.localeCompare(right.assignmentId),
  );
  if (
    canonicalBookJson(recompiledAssignments)
      !== canonicalBookJson(programme.reviewerAssignments)
  ) {
    blockers.push("Stored reviewer assignments differ from their exact semantic recompilation.");
  }

  return unique(blockers).sort();
}

export async function evaluateBookUnattendedEditorialConsensusIntegrity(
  input: unknown,
): Promise<BookUnattendedEditorialConsensusEvaluationResultV1> {
  const programme =
    input
    && typeof input === "object"
    && !Array.isArray(input)
    && (input as Record<string, unknown>).programme
      ? (input as Record<string, unknown>).programme
      : undefined;
  const blockers =
    await validateBookUnattendedEditorialConsensusProgrammeIntegrity(
      programme,
    );
  if (blockers.length) {
    return {
      outputKind:
        "evavo_docs_book_unattended_editorial_consensus_evaluation_result",
      schemaVersion: 1,
      status: "blocked",
      blockers,
      requiredActions: [
        "Recompile the exact editorial consensus programme before evaluating reviewer receipts.",
      ],
      providerCallsPerformed: 0,
      providerFallbackAllowed: false,
      canonicalManuscriptMutationPerformed: false,
      automaticCanonicalAdmissionAllowed: false,
      publicationPerformed: false,
    };
  }
  return evaluateBaseConsensus(input);
}

async function recompileAssignment(
  assignment: BookUnattendedEditorialReviewerAssignmentV1,
  programme: BookUnattendedEditorialConsensusProgrammeV1,
  criterionIds: string[],
  requiredEvidenceIds: string[],
  blockers: string[],
): Promise<BookUnattendedEditorialReviewerAssignmentV1 | undefined> {
  if (
    assignment.reviewerProducerId === programme.candidateProducerId
    || assignment.reviewerWasCandidateProducer !== false
  ) {
    blockers.push(
      `Reviewer assignment ${assignment.assignmentId} is not independent from the candidate producer.`,
    );
  }
  if (!sameSet(assignment.criterionIds, criterionIds)) {
    blockers.push(
      `Reviewer assignment ${assignment.assignmentId} does not cover every applicable criterion exactly once.`,
    );
  }
  if (
    assignment.providerAttemptLimit !== 1
    || assignment.providerFallbackAllowed !== false
  ) {
    blockers.push(
      `Reviewer assignment ${assignment.assignmentId} transport authority is invalid.`,
    );
  }

  const candidateInput = assignment.candidateCompileInput;
  const packetValidation = await validateAndNormalizeBookAuthoringPacket(
    candidateInput?.packet,
  );
  if (packetValidation.status !== "ready" || !packetValidation.packet) {
    blockers.push(
      `Reviewer assignment ${assignment.assignmentId} authoring packet is invalid.`,
      ...packetValidation.blockers.map(
        (item) => `Reviewer assignment ${assignment.assignmentId}: ${item}`,
      ),
    );
    return undefined;
  }
  const packet = packetValidation.packet;
  validateReviewPacket(packet, assignment, programme, blockers);

  const compilation = await compileBookWritingCandidateRuntimeRequest(
    candidateInput,
  );
  if (compilation.status !== "ready" || !compilation.runtimeRequest) {
    blockers.push(
      `Reviewer assignment ${assignment.assignmentId} runtime request does not recompile.`,
      ...compilation.blockers.map(
        (item) => `Reviewer assignment ${assignment.assignmentId}: ${item}`,
      ),
    );
    return undefined;
  }
  const runtimeRequest = compilation.runtimeRequest;
  if (
    runtimeRequest.requestedAt !== programme.executionRequestedAt
    || !runtimeRequest.prompt.responseInstruction.includes(
      REVIEW_RESPONSE_CONTRACT,
    )
  ) {
    blockers.push(
      `Reviewer assignment ${assignment.assignmentId} runtime timing or response contract differs from the programme.`,
    );
  }
  const targetContexts = runtimeRequest.contextBlocks.filter(
    (item) =>
      item.role === "target_manuscript"
      && item.textSha256 === programme.candidateTextSha256,
  );
  if (targetContexts.length !== 1) {
    blockers.push(
      `Reviewer assignment ${assignment.assignmentId} must contain one exact candidate-bound target context.`,
    );
  }
  for (const evidenceId of requiredEvidenceIds) {
    if (!runtimeRequest.handoffRequest.requiredEvidenceIds.includes(evidenceId)) {
      blockers.push(
        `Reviewer assignment ${assignment.assignmentId} is missing required evidence ${evidenceId}.`,
      );
    }
  }

  const assignmentIdentity = {
    outputKind:
      "evavo_docs_book_unattended_editorial_reviewer_assignment_identity",
    schemaVersion: 1,
    contract: programme.contract,
    assignmentId: assignment.assignmentId,
    reviewerProducerId: assignment.reviewerProducerId,
    reviewerProvider: packet.provider,
    reviewerModel: packet.modelName,
    criterionIds: [...assignment.criterionIds].sort(),
    packetFingerprint: packet.packetFingerprint,
    runtimeRequestFingerprint: runtimeRequest.runtimeRequestFingerprint,
    candidateId: programme.candidateId,
    candidateTextSha256: programme.candidateTextSha256,
  };
  const assignmentFingerprint =
    await sha256BookText(canonicalBookJson(assignmentIdentity));
  return {
    assignmentId: assignment.assignmentId,
    assignmentFingerprint,
    reviewerProducerId: assignment.reviewerProducerId,
    reviewerProvider: packet.provider,
    reviewerModel: packet.modelName,
    criterionIds: [...assignment.criterionIds].sort(),
    authoringPacket: packet,
    runtimeRequest,
    candidateCompileInput: candidateInput,
    providerAttemptLimit: 1,
    providerFallbackAllowed: false,
    reviewerWasCandidateProducer: false,
  };
}

function validateReviewPacket(
  packet: BookAuthoringPacketV1,
  assignment: BookUnattendedEditorialReviewerAssignmentV1,
  programme: BookUnattendedEditorialConsensusProgrammeV1,
  blockers: string[],
): void {
  if (
    !REVIEW_OPERATIONS.has(packet.operation)
    || (
      packet.operation === "custom"
      && packet.customOperation !== "independent_editorial_review"
    )
  ) {
    blockers.push(
      `Reviewer assignment ${assignment.assignmentId} does not use an authorised review-only operation.`,
    );
  }
  if (
    packet.projectId !== programme.projectId
    || packet.programmeId !== programme.programmeId
    || packet.volumeId !== programme.volumeId
    || packet.manuscriptSha256 !== programme.candidateTextSha256
  ) {
    blockers.push(
      `Reviewer assignment ${assignment.assignmentId} packet identity differs from the exact editorial candidate.`,
    );
  }
  if (
    packet.expectedChangedUnitIds.length
    || packet.remainingUnitIds.length
    || packet.providerMayMutateCanonicalState !== false
    || packet.automaticCanonicalAdmissionAllowed !== false
    || packet.runtimeCutoverApproved !== false
    || packet.publicationPerformed !== false
  ) {
    blockers.push(
      `Reviewer assignment ${assignment.assignmentId} packet requests mutation, continuation or release authority.`,
    );
  }
  if (
    assignment.reviewerProvider !== packet.provider
    || assignment.reviewerModel !== packet.modelName
    || canonicalBookJson(assignment.authoringPacket)
      !== canonicalBookJson(packet)
  ) {
    blockers.push(
      `Reviewer assignment ${assignment.assignmentId} stored packet or reviewer identity differs from normalization.`,
    );
  }
}

function duplicate(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

function sameSet(left: string[], right: string[]): boolean {
  return canonicalBookJson([...new Set(left)].sort())
    === canonicalBookJson([...new Set(right)].sort());
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
