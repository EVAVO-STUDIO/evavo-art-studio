import { validateBookAuthorialVoiceProfile } from "./book-studio-authorial-voice-analyse";
import type { BookAuthorialVoiceProfileV1 } from "./book-studio-authorial-voice-types";
import {
  BOOK_IDEA_LAB_CONTRACT,
  type BookIdeaCandidateEvaluationV1,
  type BookIdeaCandidateV1,
  type BookIdeaCriterionEvidenceV1,
  type BookIdeaCriterionId,
  type BookIdeaCriterionV1,
  type BookIdeaDivergenceAxisId,
  type BookIdeaDomainId,
  type BookIdeaLabCompileResultV1,
  type BookIdeaLabEvaluationResultV1,
  type BookIdeaLabEvaluationV1,
  type BookIdeaLabPacketV1,
  type BookIdeaLabPolicyV1,
  type BookIdeaPairwiseDivergenceV1,
  type BookIdeaPortfolioSelectionV1,
} from "./book-studio-idea-lab-types";
import { validateBookNarrativeRegisterProfile } from "./book-studio-narrative-register";
import type { BookNarrativeRegisterProfileV1 } from "./book-studio-narrative-register-types";
import {
  canonicalReviewCraftJson,
  duplicateReviewCraftValues,
  rejectReviewCraftUnknown,
  reviewCraftArray,
  reviewCraftBool,
  reviewCraftEnum,
  reviewCraftFinite,
  reviewCraftId,
  reviewCraftIds,
  reviewCraftInteger,
  reviewCraftRecord,
  reviewCraftText,
  roundReviewCraft,
  sha256ReviewCraftText,
  uniqueReviewCraft,
} from "./book-studio-review-craft-shared";

const DOMAIN_IDS = new Set<BookIdeaDomainId>([
  "story_premise", "plot_turn", "scene_design", "character_design", "relationship_arc", "dialogue_strategy",
  "mystery_design", "worldbuilding", "set_piece", "theme_expression", "opening", "ending", "title_and_naming",
]);
const AXIS_IDS = new Set<BookIdeaDivergenceAxisId>([
  "causal_engine", "character_choice", "emotional_cost", "social_structure", "setting_use", "information_design",
  "moral_choice", "genre_payoff", "temporal_shape", "viewpoint_strategy", "image_motif", "risk_scale",
  "resolution_shape",
]);
const CRITERION_IDS = new Set<BookIdeaCriterionId>([
  "originality", "project_fit", "causal_leverage", "character_truth", "emotional_consequence", "genre_payoff",
  "thematic_resonance", "image_potential", "escalation_value", "feasibility",
]);
const COMPILE_KEYS = new Set([
  "outputKind", "schemaVersion", "programmeId", "projectId", "volumeId", "manuscriptRevisionId", "labId",
  "labVersion", "authorialVoiceProfile", "narrativeRegisterProfile", "domainId", "objective",
  "existingSolutionSummary", "hardConstraintIds", "canonEvidenceIds", "seedIds", "rejectedIdeaPatternIds",
  "requiredDivergenceAxisIds", "requestedCandidateCount", "evidenceIds", "policy",
]);
const POLICY_KEYS = new Set([
  "minimumCandidates", "maximumCandidates", "minimumRequiredAxes", "minimumPairwiseDivergence",
  "maximumSharedAxisRatio", "minimumIndependentReviewerIds", "minimumRecommendedScore", "maximumPortfolioSize",
]);
const EVALUATION_KEYS = new Set([
  "outputKind", "schemaVersion", "packet", "evaluationId", "candidates", "criterionEvidence",
  "independentReviewerIds", "unresolvedFindingIds", "evidenceIds",
]);
const CANDIDATE_KEYS = new Set([
  "ideaId", "premise", "causalMechanism", "characterChoice", "opposition", "emotionalCost", "materialCost",
  "immediateConsequence", "downstreamConsequence", "genrePayoff", "thematicPressure", "imageOrMotif",
  "surpriseMechanism", "axisValues", "constraintEvidenceIds", "canonEvidenceIds", "riskIds",
]);
const AXIS_VALUE_KEYS = new Set(["axisId", "valueId", "explanation"]);
const CRITERION_EVIDENCE_KEYS = new Set([
  "ideaId", "criterionId", "score", "reviewerId", "evidenceIds", "findingIds", "independentlyReviewed",
]);

const DEFAULT_POLICY: Required<BookIdeaLabPolicyV1> = {
  minimumCandidates: 6,
  maximumCandidates: 12,
  minimumRequiredAxes: 5,
  minimumPairwiseDivergence: 0.42,
  maximumSharedAxisRatio: 0.68,
  minimumIndependentReviewerIds: 2,
  minimumRecommendedScore: 82,
  maximumPortfolioSize: 4,
};

export const BOOK_IDEA_QUALITY_RUBRIC: readonly BookIdeaCriterionV1[] = Object.freeze([
  { criterionId: "originality", weight: 12, mandatory: true, passCondition: "The idea creates a non-obvious combination, causal engine or consequence specific to this project.", failureSignals: ["genre default", "existing answer restated", "surface novelty only"] },
  { criterionId: "project_fit", weight: 14, mandatory: true, passCondition: "The idea fits canon, project voice, audience, register and established promises without merely repeating them.", failureSignals: ["voice replacement", "canon conflict", "generic transplant"] },
  { criterionId: "causal_leverage", weight: 13, mandatory: true, passCondition: "The idea changes several later possibilities through a clear decision, mechanism or institutional consequence.", failureSignals: ["isolated beat", "coincidence", "no downstream pressure"] },
  { criterionId: "character_truth", weight: 13, mandatory: true, passCondition: "The central choice follows specific values, beliefs, wounds, loyalties, capabilities and self-deception.", failureSignals: ["plot puppet", "generic motive", "unearned reversal"] },
  { criterionId: "emotional_consequence", weight: 11, mandatory: true, passCondition: "The idea creates mixed, durable and relationship-specific emotional consequence rather than a single labelled feeling.", failureSignals: ["emotion label only", "instant reset", "costless disclosure"] },
  { criterionId: "genre_payoff", weight: 9, mandatory: false, passCondition: "The idea fulfils or productively revises the selected genre and scene promises.", failureSignals: ["cliche delivery", "register mismatch", "promise without payoff"] },
  { criterionId: "thematic_resonance", weight: 8, mandatory: false, passCondition: "Theme is pressured through incompatible values and material consequences, not a stated message.", failureSignals: ["theme speech", "symbol without action", "single correct answer"] },
  { criterionId: "image_potential", weight: 6, mandatory: false, passCondition: "The idea generates a project-specific physical image, motif or spatial relation with narrative function.", failureSignals: ["generic cinematic image", "decorative motif", "abstract summary"] },
  { criterionId: "escalation_value", weight: 8, mandatory: false, passCondition: "The idea creates meaningful next pressures, choices or revelations rather than only a bigger event.", failureSignals: ["scale inflation", "question pile-up", "closed consequence"] },
  { criterionId: "feasibility", weight: 6, mandatory: false, passCondition: "The idea can be executed within established viewpoint, timeline, resources, research and scope.", failureSignals: ["requires missing canon", "impossible logistics", "unbounded rewrite"] },
]);

export async function compileBookIdeaLab(input: unknown): Promise<BookIdeaLabCompileResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const source = reviewCraftRecord(input, "Book idea lab compile input", blockers);
  rejectReviewCraftUnknown(source, COMPILE_KEYS, "Book idea lab compile input", blockers);
  if (source.outputKind !== "evavo_docs_book_idea_lab_compile_input") blockers.push("Book idea lab compile input outputKind is invalid.");
  if (source.schemaVersion !== 1) blockers.push("Book idea lab compile input schemaVersion is invalid.");
  const programmeId = reviewCraftId(source.programmeId, "programmeId", blockers);
  const projectId = reviewCraftId(source.projectId, "projectId", blockers);
  const volumeId = reviewCraftId(source.volumeId, "volumeId", blockers);
  const manuscriptRevisionId = reviewCraftId(source.manuscriptRevisionId, "manuscriptRevisionId", blockers);
  const labId = reviewCraftId(source.labId, "labId", blockers);
  const labVersion = reviewCraftInteger(source.labVersion, "labVersion", blockers, 1, 1_000_000);
  const policy = parsePolicy(source.policy, blockers);

  const voiceBlockers = await validateBookAuthorialVoiceProfile(source.authorialVoiceProfile);
  const registerBlockers = await validateBookNarrativeRegisterProfile(source.narrativeRegisterProfile);
  blockers.push(...voiceBlockers.map((item) => `Authorial voice profile: ${item}`));
  blockers.push(...registerBlockers.map((item) => `Narrative register profile: ${item}`));
  const voiceProfile = source.authorialVoiceProfile as BookAuthorialVoiceProfileV1;
  const registerProfile = source.narrativeRegisterProfile as BookNarrativeRegisterProfileV1;
  if (!voiceBlockers.length) {
    if (voiceProfile.programmeId !== programmeId || voiceProfile.projectId !== projectId) blockers.push("Idea lab identity differs from the authorial voice profile.");
  }
  if (!registerBlockers.length) {
    if (registerProfile.programmeId !== programmeId || registerProfile.projectId !== projectId || registerProfile.volumeId !== volumeId) blockers.push("Idea lab identity differs from the narrative register profile.");
    if (registerProfile.authorialVoiceProfileFingerprint !== voiceProfile.profileFingerprint) blockers.push("Narrative register is not bound to the supplied authorial voice profile.");
  }

  const domainId = reviewCraftEnum(source.domainId, DOMAIN_IDS, "domainId", blockers, "scene_design");
  const objective = reviewCraftText(source.objective, "objective", blockers, 20_000);
  const existingSolutionSummary = source.existingSolutionSummary === undefined
    ? undefined
    : reviewCraftText(source.existingSolutionSummary, "existingSolutionSummary", blockers, 20_000);
  const hardConstraintIds = reviewCraftIds(source.hardConstraintIds, "hardConstraintIds", blockers, 1_024, true);
  const canonEvidenceIds = reviewCraftIds(source.canonEvidenceIds, "canonEvidenceIds", blockers, 4_096, true);
  const seedIds = reviewCraftIds(source.seedIds, "seedIds", blockers, 1_024, false);
  const rejectedIdeaPatternIds = reviewCraftIds(source.rejectedIdeaPatternIds, "rejectedIdeaPatternIds", blockers, 1_024, true);
  const requiredDivergenceAxisIds = parseAxisIds(source.requiredDivergenceAxisIds, blockers, policy.minimumRequiredAxes);
  const requestedCandidateCount = reviewCraftInteger(source.requestedCandidateCount, "requestedCandidateCount", blockers, policy.minimumCandidates, policy.maximumCandidates);
  const evidenceIds = reviewCraftIds(source.evidenceIds, "evidenceIds", blockers, 4_096, true);
  if (existingSolutionSummary) warnings.push("An existing solution was supplied; the idea lab requires genuine alternate causal engines rather than cosmetic rewrites of that solution.");
  const finalBlockers = uniqueReviewCraft(blockers);
  if (finalBlockers.length) return compileBlocked(finalBlockers, warnings);

  const providerInstruction = buildIdeaProviderInstruction({
    labId,
    labVersion,
    domainId,
    objective,
    existingSolutionSummary,
    requestedCandidateCount,
    requiredDivergenceAxisIds,
    hardConstraintIds,
    canonEvidenceIds,
    seedIds,
    rejectedIdeaPatternIds,
    voiceProfile,
    registerProfile,
  });
  const unsigned: Omit<BookIdeaLabPacketV1, "packetFingerprint"> = {
    outputKind: "evavo_docs_book_idea_lab_packet",
    schemaVersion: 1,
    contract: BOOK_IDEA_LAB_CONTRACT,
    status: "ready",
    programmeId,
    projectId,
    volumeId,
    manuscriptRevisionId,
    labId,
    labVersion,
    authorialVoiceProfileFingerprint: voiceProfile.profileFingerprint,
    narrativeRegisterProfileFingerprint: registerProfile.profileFingerprint,
    domainId,
    objective,
    ...(existingSolutionSummary === undefined ? {} : { existingSolutionSummary }),
    hardConstraintIds,
    canonEvidenceIds,
    seedIds,
    rejectedIdeaPatternIds,
    requiredDivergenceAxisIds,
    requestedCandidateCount,
    minimumPairwiseDivergence: policy.minimumPairwiseDivergence,
    maximumSharedAxisRatio: policy.maximumSharedAxisRatio,
    minimumIndependentReviewerIds: policy.minimumIndependentReviewerIds,
    minimumRecommendedScore: policy.minimumRecommendedScore,
    maximumPortfolioSize: policy.maximumPortfolioSize,
    qualityRubric: [...BOOK_IDEA_QUALITY_RUBRIC],
    providerInstruction,
    evidenceIds,
    providerCallPerformed: false,
    singleAnswerConvergencePermitted: false,
    namedCreatorInstructionPermitted: false,
    projectVoiceRemainsAuthoritative: true,
    automaticCanonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
  const packetFingerprint = await sha256ReviewCraftText(canonicalReviewCraftJson(unsigned));
  const packet: BookIdeaLabPacketV1 = { ...unsigned, packetFingerprint };
  return {
    outputKind: "evavo_docs_book_idea_lab_compile_result",
    schemaVersion: 1,
    status: "ready",
    packet,
    packetFingerprint,
    blockers: [],
    warnings: uniqueReviewCraft(warnings),
    providerCallPerformed: false,
    automaticCanonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
}

export async function evaluateBookIdeaLabCandidates(input: unknown): Promise<BookIdeaLabEvaluationResultV1> {
  const blockers: string[] = [];
  const requiredActions: string[] = [];
  const source = reviewCraftRecord(input, "Book idea lab evaluation input", blockers);
  rejectReviewCraftUnknown(source, EVALUATION_KEYS, "Book idea lab evaluation input", blockers);
  if (source.outputKind !== "evavo_docs_book_idea_lab_evaluation_input") blockers.push("Book idea lab evaluation input outputKind is invalid.");
  if (source.schemaVersion !== 1) blockers.push("Book idea lab evaluation input schemaVersion is invalid.");
  const packetBlockers = await validateBookIdeaLabPacket(source.packet);
  blockers.push(...packetBlockers.map((item) => `Idea lab packet: ${item}`));
  if (blockers.length) return evaluationBlocked(blockers);
  const packet = source.packet as BookIdeaLabPacketV1;
  const evaluationId = reviewCraftId(source.evaluationId, "evaluationId", blockers);
  const candidates = parseCandidates(source.candidates, packet, blockers);
  const criterionEvidence = parseCriterionEvidence(source.criterionEvidence, candidates, blockers);
  const independentReviewerIds = reviewCraftIds(source.independentReviewerIds, "independentReviewerIds", blockers, 64, false);
  const unresolvedFindingIds = reviewCraftIds(source.unresolvedFindingIds, "unresolvedFindingIds", blockers, 4_096, false);
  const evidenceIds = reviewCraftIds(source.evidenceIds, "evidenceIds", blockers, 8_192, true);
  if (blockers.length) return evaluationBlocked(blockers);

  const pairwiseDivergence = compilePairwiseDivergence(candidates, packet.requiredDivergenceAxisIds);
  const minimumObservedPairwiseDivergence = roundReviewCraft(pairwiseDivergence.length ? Math.min(...pairwiseDivergence.map((item) => item.compositeDivergence)) : 0, 4);
  const maximumObservedSharedAxisRatio = roundReviewCraft(pairwiseDivergence.length ? Math.max(...pairwiseDivergence.map((item) => item.sharedAxisRatio)) : 1, 4);
  if (minimumObservedPairwiseDivergence < packet.minimumPairwiseDivergence) requiredActions.push(`Increase the weakest pairwise idea divergence from ${minimumObservedPairwiseDivergence} to at least ${packet.minimumPairwiseDivergence}.`);
  if (maximumObservedSharedAxisRatio > packet.maximumSharedAxisRatio) requiredActions.push(`Reduce the highest shared-axis ratio from ${maximumObservedSharedAxisRatio} to at most ${packet.maximumSharedAxisRatio}.`);
  if (independentReviewerIds.length < packet.minimumIndependentReviewerIds) requiredActions.push(`Complete at least ${packet.minimumIndependentReviewerIds} independent idea reviews.`);
  if (unresolvedFindingIds.length) requiredActions.push(`Resolve idea findings: ${unresolvedFindingIds.join(", ")}.`);

  const evidenceByIdea = groupCriterionEvidence(criterionEvidence);
  const candidateEvaluations: BookIdeaCandidateEvaluationV1[] = candidates.map((candidate) => {
    const evidence = evidenceByIdea.get(candidate.ideaId) ?? [];
    const evidenceByCriterion = new Map<BookIdeaCriterionId, BookIdeaCriterionEvidenceV1[]>();
    for (const item of evidence) evidenceByCriterion.set(item.criterionId, [...(evidenceByCriterion.get(item.criterionId) ?? []), item]);
    const missingCriterionIds = packet.qualityRubric.map((item) => item.criterionId).filter((criterionId) => !evidenceByCriterion.has(criterionId));
    const mandatoryCriterionFailures = packet.qualityRubric.filter((criterion) => {
      if (!criterion.mandatory) return false;
      const values = evidenceByCriterion.get(criterion.criterionId) ?? [];
      return values.length > 0 && average(values.map((item) => item.score)) < 75;
    }).map((item) => item.criterionId);
    const totalWeight = packet.qualityRubric.reduce((sum, item) => sum + item.weight, 0);
    const weightedScore = roundReviewCraft(packet.qualityRubric.reduce((sum, criterion) => {
      const values = evidenceByCriterion.get(criterion.criterionId) ?? [];
      return sum + (values.length ? average(values.map((item) => item.score)) : 0) * criterion.weight;
    }, 0) / Math.max(totalWeight, 1), 2);
    const candidatePairs = pairwiseDivergence.filter((pair) => pair.leftIdeaId === candidate.ideaId || pair.rightIdeaId === candidate.ideaId);
    const minimumDivergenceFromOtherCandidate = roundReviewCraft(candidatePairs.length ? Math.min(...candidatePairs.map((item) => item.compositeDivergence)) : 0, 4);
    const deterministicDiversityContribution = roundReviewCraft(candidatePairs.length ? average(candidatePairs.map((item) => item.compositeDivergence)) : 0, 4);
    const candidateFindingIds = uniqueReviewCraft(evidence.flatMap((item) => item.findingIds).filter((findingId) => unresolvedFindingIds.includes(findingId)));
    const independentlyReviewed = packet.qualityRubric.filter((item) => item.mandatory).every((criterion) => {
      const values = evidenceByCriterion.get(criterion.criterionId) ?? [];
      return values.some((item) => item.independentlyReviewed && independentReviewerIds.includes(item.reviewerId));
    });
    const eligibleForPortfolio = !missingCriterionIds.length
      && !mandatoryCriterionFailures.length
      && !candidateFindingIds.length
      && independentlyReviewed
      && weightedScore >= packet.minimumRecommendedScore
      && minimumDivergenceFromOtherCandidate >= packet.minimumPairwiseDivergence;
    return {
      ideaId: candidate.ideaId,
      weightedScore,
      deterministicDiversityContribution,
      minimumDivergenceFromOtherCandidate,
      mandatoryCriterionFailures,
      missingCriterionIds,
      unresolvedFindingIds: candidateFindingIds,
      independentlyReviewed,
      eligibleForPortfolio,
    };
  }).sort((left, right) => right.weightedScore - left.weightedScore || right.deterministicDiversityContribution - left.deterministicDiversityContribution || left.ideaId.localeCompare(right.ideaId));

  for (const item of candidateEvaluations) {
    if (item.missingCriterionIds.length) requiredActions.push(`Supply complete quality evidence for ${item.ideaId}: ${item.missingCriterionIds.join(", ")}.`);
    if (item.mandatoryCriterionFailures.length) requiredActions.push(`Revise ${item.ideaId} on mandatory criteria: ${item.mandatoryCriterionFailures.join(", ")}.`);
    if (!item.independentlyReviewed) requiredActions.push(`Complete independent mandatory-criterion review for ${item.ideaId}.`);
  }
  const portfolio = selectPortfolio(candidateEvaluations, packet.maximumPortfolioSize);
  const recommendedIdeaId = portfolio[0]?.ideaId;
  const enoughEligible = portfolio.length >= Math.min(3, packet.maximumPortfolioSize);
  if (!enoughEligible) requiredActions.push(`Produce at least ${Math.min(3, packet.maximumPortfolioSize)} independently reviewed, high-scoring and materially divergent ideas.`);
  const status: BookIdeaLabEvaluationV1["status"] = enoughEligible
    && minimumObservedPairwiseDivergence >= packet.minimumPairwiseDivergence
    && maximumObservedSharedAxisRatio <= packet.maximumSharedAxisRatio
    && independentReviewerIds.length >= packet.minimumIndependentReviewerIds
    && unresolvedFindingIds.length === 0
    ? "ready_for_human_choice"
    : "needs_work";
  const unsigned: Omit<BookIdeaLabEvaluationV1, "evaluationFingerprint"> = {
    outputKind: "evavo_docs_book_idea_lab_evaluation",
    schemaVersion: 1,
    contract: BOOK_IDEA_LAB_CONTRACT,
    status,
    packetFingerprint: packet.packetFingerprint,
    evaluationId,
    candidateEvaluations,
    pairwiseDivergence,
    portfolio,
    ...(recommendedIdeaId === undefined ? {} : { recommendedIdeaId }),
    minimumObservedPairwiseDivergence,
    maximumObservedSharedAxisRatio,
    independentReviewerIds,
    unresolvedFindingIds,
    requiredActions: uniqueReviewCraft(requiredActions),
    evidenceIds,
    humanChoiceRequired: true,
    automaticCanonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
  const evaluationFingerprint = await sha256ReviewCraftText(canonicalReviewCraftJson(unsigned));
  const evaluation: BookIdeaLabEvaluationV1 = { ...unsigned, evaluationFingerprint };
  return {
    outputKind: "evavo_docs_book_idea_lab_evaluation_result",
    schemaVersion: 1,
    status,
    evaluation,
    blockers: [],
    requiredActions: evaluation.requiredActions,
    humanChoiceRequired: true,
    automaticCanonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
}

export async function validateBookIdeaLabPacket(value: unknown): Promise<string[]> {
  const blockers: string[] = [];
  const source = reviewCraftRecord(value, "Book idea lab packet", blockers);
  if (source.outputKind !== "evavo_docs_book_idea_lab_packet" || source.schemaVersion !== 1 || source.contract !== BOOK_IDEA_LAB_CONTRACT || source.status !== "ready") blockers.push("Book idea lab packet identity is invalid.");
  if (source.projectVoiceRemainsAuthoritative !== true) blockers.push("Idea lab must preserve project voice authority.");
  for (const key of ["providerCallPerformed", "singleAnswerConvergencePermitted", "namedCreatorInstructionPermitted", "automaticCanonicalAdmissionAllowed", "publicationPerformed"]) {
    if (source[key] !== false) blockers.push(`Book idea lab packet ${key} must remain false.`);
  }
  const fingerprint = typeof source.packetFingerprint === "string" ? source.packetFingerprint : "";
  if (!/^sha256:[a-f0-9]{64}$/u.test(fingerprint)) blockers.push("Book idea lab packet fingerprint is invalid.");
  const { packetFingerprint: _discarded, ...unsigned } = source;
  if (fingerprint && fingerprint !== await sha256ReviewCraftText(canonicalReviewCraftJson(unsigned))) blockers.push("Book idea lab packet fingerprint does not match its exact contents.");
  return uniqueReviewCraft(blockers);
}

export async function validateBookIdeaLabEvaluation(value: unknown): Promise<string[]> {
  const blockers: string[] = [];
  const source = reviewCraftRecord(value, "Book idea lab evaluation", blockers);
  if (source.outputKind !== "evavo_docs_book_idea_lab_evaluation" || source.schemaVersion !== 1 || source.contract !== BOOK_IDEA_LAB_CONTRACT) blockers.push("Book idea lab evaluation identity is invalid.");
  if (source.humanChoiceRequired !== true || source.automaticCanonicalAdmissionAllowed !== false || source.publicationPerformed !== false) blockers.push("Book idea lab evaluation authority is invalid.");
  const fingerprint = typeof source.evaluationFingerprint === "string" ? source.evaluationFingerprint : "";
  if (!/^sha256:[a-f0-9]{64}$/u.test(fingerprint)) blockers.push("Book idea lab evaluation fingerprint is invalid.");
  const { evaluationFingerprint: _discarded, ...unsigned } = source;
  if (fingerprint && fingerprint !== await sha256ReviewCraftText(canonicalReviewCraftJson(unsigned))) blockers.push("Book idea lab evaluation fingerprint does not match its exact contents.");
  return uniqueReviewCraft(blockers);
}

export function listBookIdeaLabCapabilities() {
  return Object.freeze({
    outputKind: "evavo_docs_book_idea_lab_capabilities",
    schemaVersion: 1,
    contract: BOOK_IDEA_LAB_CONTRACT,
    domains: [...DOMAIN_IDS].sort(),
    divergenceAxes: [...AXIS_IDS].sort(),
    qualityCriteria: BOOK_IDEA_QUALITY_RUBRIC.map((item) => item.criterionId),
    minimumCandidates: DEFAULT_POLICY.minimumCandidates,
    maximumCandidates: DEFAULT_POLICY.maximumCandidates,
    multipleDivergentCandidatesRequired: true,
    deterministicDiversityEvaluation: true,
    independentReviewRequired: true,
    humanChoiceRequired: true,
    providerCallPerformed: false,
    automaticCanonicalAdmissionAllowed: false,
    publicationPerformed: false,
  });
}

function parsePolicy(value: unknown, blockers: string[]): Required<BookIdeaLabPolicyV1> {
  if (value === undefined) return { ...DEFAULT_POLICY };
  const source = reviewCraftRecord(value, "Book idea lab policy", blockers);
  rejectReviewCraftUnknown(source, POLICY_KEYS, "Book idea lab policy", blockers);
  const result: Required<BookIdeaLabPolicyV1> = {
    minimumCandidates: source.minimumCandidates === undefined ? DEFAULT_POLICY.minimumCandidates : reviewCraftInteger(source.minimumCandidates, "minimumCandidates", blockers, 4, 12),
    maximumCandidates: source.maximumCandidates === undefined ? DEFAULT_POLICY.maximumCandidates : reviewCraftInteger(source.maximumCandidates, "maximumCandidates", blockers, 4, 20),
    minimumRequiredAxes: source.minimumRequiredAxes === undefined ? DEFAULT_POLICY.minimumRequiredAxes : reviewCraftInteger(source.minimumRequiredAxes, "minimumRequiredAxes", blockers, 3, AXIS_IDS.size),
    minimumPairwiseDivergence: source.minimumPairwiseDivergence === undefined ? DEFAULT_POLICY.minimumPairwiseDivergence : reviewCraftFinite(source.minimumPairwiseDivergence, "minimumPairwiseDivergence", blockers, 0.1, 1),
    maximumSharedAxisRatio: source.maximumSharedAxisRatio === undefined ? DEFAULT_POLICY.maximumSharedAxisRatio : reviewCraftFinite(source.maximumSharedAxisRatio, "maximumSharedAxisRatio", blockers, 0, 0.9),
    minimumIndependentReviewerIds: source.minimumIndependentReviewerIds === undefined ? DEFAULT_POLICY.minimumIndependentReviewerIds : reviewCraftInteger(source.minimumIndependentReviewerIds, "minimumIndependentReviewerIds", blockers, 1, 8),
    minimumRecommendedScore: source.minimumRecommendedScore === undefined ? DEFAULT_POLICY.minimumRecommendedScore : reviewCraftFinite(source.minimumRecommendedScore, "minimumRecommendedScore", blockers, 60, 100),
    maximumPortfolioSize: source.maximumPortfolioSize === undefined ? DEFAULT_POLICY.maximumPortfolioSize : reviewCraftInteger(source.maximumPortfolioSize, "maximumPortfolioSize", blockers, 2, 8),
  };
  if (result.maximumCandidates < result.minimumCandidates) blockers.push("maximumCandidates cannot be below minimumCandidates.");
  if (result.maximumPortfolioSize > result.maximumCandidates) blockers.push("maximumPortfolioSize cannot exceed maximumCandidates.");
  return result;
}

function parseAxisIds(value: unknown, blockers: string[], minimum: number): BookIdeaDivergenceAxisId[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > AXIS_IDS.size) {
    blockers.push(`requiredDivergenceAxisIds must contain ${minimum}-${AXIS_IDS.size} axes.`);
    return [];
  }
  const result = value.map((item) => reviewCraftEnum(item, AXIS_IDS, "requiredDivergenceAxisIds", blockers, "causal_engine"));
  const duplicates = duplicateReviewCraftValues(result);
  if (duplicates.length) blockers.push(`requiredDivergenceAxisIds contains duplicates: ${duplicates.join(", ")}.`);
  return uniqueReviewCraft(result).sort();
}

function parseCandidates(value: unknown, packet: BookIdeaLabPacketV1, blockers: string[]): BookIdeaCandidateV1[] {
  const records = reviewCraftArray(value, "candidates", blockers, packet.requestedCandidateCount, packet.requestedCandidateCount);
  const result = records.map((item, index) => {
    const source = reviewCraftRecord(item, `idea candidate ${index + 1}`, blockers);
    rejectReviewCraftUnknown(source, CANDIDATE_KEYS, `idea candidate ${index + 1}`, blockers);
    const ideaId = reviewCraftId(source.ideaId, `idea candidate ${index + 1} ideaId`, blockers);
    const axisRecords = reviewCraftArray(source.axisValues, `idea ${ideaId} axisValues`, blockers, packet.requiredDivergenceAxisIds.length, AXIS_IDS.size);
    const axisValues = axisRecords.map((axisItem, axisIndex) => {
      const axis = reviewCraftRecord(axisItem, `idea ${ideaId} axis ${axisIndex + 1}`, blockers);
      rejectReviewCraftUnknown(axis, AXIS_VALUE_KEYS, `idea ${ideaId} axis ${axisIndex + 1}`, blockers);
      return {
        axisId: reviewCraftEnum(axis.axisId, AXIS_IDS, `idea ${ideaId} axis ${axisIndex + 1} axisId`, blockers, "causal_engine"),
        valueId: reviewCraftId(axis.valueId, `idea ${ideaId} axis ${axisIndex + 1} valueId`, blockers),
        explanation: reviewCraftText(axis.explanation, `idea ${ideaId} axis ${axisIndex + 1} explanation`, blockers, 2_000),
      };
    }).sort((left, right) => left.axisId.localeCompare(right.axisId));
    const duplicateAxes = duplicateReviewCraftValues(axisValues.map((axis) => axis.axisId));
    if (duplicateAxes.length) blockers.push(`Idea ${ideaId} duplicates axes: ${duplicateAxes.join(", ")}.`);
    const missingAxes = packet.requiredDivergenceAxisIds.filter((axisId) => !axisValues.some((axis) => axis.axisId === axisId));
    if (missingAxes.length) blockers.push(`Idea ${ideaId} is missing required axes: ${missingAxes.join(", ")}.`);
    return {
      ideaId,
      premise: reviewCraftText(source.premise, `idea ${ideaId} premise`, blockers, 4_000),
      causalMechanism: reviewCraftText(source.causalMechanism, `idea ${ideaId} causalMechanism`, blockers, 4_000),
      characterChoice: reviewCraftText(source.characterChoice, `idea ${ideaId} characterChoice`, blockers, 4_000),
      opposition: reviewCraftText(source.opposition, `idea ${ideaId} opposition`, blockers, 4_000),
      emotionalCost: reviewCraftText(source.emotionalCost, `idea ${ideaId} emotionalCost`, blockers, 4_000),
      materialCost: reviewCraftText(source.materialCost, `idea ${ideaId} materialCost`, blockers, 4_000),
      immediateConsequence: reviewCraftText(source.immediateConsequence, `idea ${ideaId} immediateConsequence`, blockers, 4_000),
      downstreamConsequence: reviewCraftText(source.downstreamConsequence, `idea ${ideaId} downstreamConsequence`, blockers, 4_000),
      genrePayoff: reviewCraftText(source.genrePayoff, `idea ${ideaId} genrePayoff`, blockers, 4_000),
      thematicPressure: reviewCraftText(source.thematicPressure, `idea ${ideaId} thematicPressure`, blockers, 4_000),
      imageOrMotif: reviewCraftText(source.imageOrMotif, `idea ${ideaId} imageOrMotif`, blockers, 4_000),
      surpriseMechanism: reviewCraftText(source.surpriseMechanism, `idea ${ideaId} surpriseMechanism`, blockers, 4_000),
      axisValues,
      constraintEvidenceIds: reviewCraftIds(source.constraintEvidenceIds, `idea ${ideaId} constraintEvidenceIds`, blockers, 1_024, true),
      canonEvidenceIds: reviewCraftIds(source.canonEvidenceIds, `idea ${ideaId} canonEvidenceIds`, blockers, 4_096, true),
      riskIds: reviewCraftIds(source.riskIds, `idea ${ideaId} riskIds`, blockers, 1_024, false),
    };
  }).sort((left, right) => left.ideaId.localeCompare(right.ideaId));
  const duplicateIds = duplicateReviewCraftValues(result.map((item) => item.ideaId));
  if (duplicateIds.length) blockers.push(`Idea candidate IDs are duplicated: ${duplicateIds.join(", ")}.`);
  return result;
}

function parseCriterionEvidence(value: unknown, candidates: BookIdeaCandidateV1[], blockers: string[]): BookIdeaCriterionEvidenceV1[] {
  const records = reviewCraftArray(value, "criterionEvidence", blockers, candidates.length, candidates.length * CRITERION_IDS.size * 8);
  const candidateIds = new Set(candidates.map((item) => item.ideaId));
  const result = records.map((item, index) => {
    const source = reviewCraftRecord(item, `idea criterion evidence ${index + 1}`, blockers);
    rejectReviewCraftUnknown(source, CRITERION_EVIDENCE_KEYS, `idea criterion evidence ${index + 1}`, blockers);
    const ideaId = reviewCraftId(source.ideaId, `criterion evidence ${index + 1} ideaId`, blockers);
    if (!candidateIds.has(ideaId)) blockers.push(`Criterion evidence references unknown idea ${ideaId}.`);
    return {
      ideaId,
      criterionId: reviewCraftEnum(source.criterionId, CRITERION_IDS, `criterion evidence ${index + 1} criterionId`, blockers, "originality"),
      score: reviewCraftFinite(source.score, `criterion evidence ${index + 1} score`, blockers, 0, 100),
      reviewerId: reviewCraftId(source.reviewerId, `criterion evidence ${index + 1} reviewerId`, blockers),
      evidenceIds: reviewCraftIds(source.evidenceIds, `criterion evidence ${index + 1} evidenceIds`, blockers, 512, true),
      findingIds: reviewCraftIds(source.findingIds, `criterion evidence ${index + 1} findingIds`, blockers, 512, false),
      independentlyReviewed: reviewCraftBool(source.independentlyReviewed, `criterion evidence ${index + 1} independentlyReviewed`, blockers),
    };
  }).sort((left, right) => left.ideaId.localeCompare(right.ideaId) || left.criterionId.localeCompare(right.criterionId) || left.reviewerId.localeCompare(right.reviewerId));
  const duplicateKeys = duplicateReviewCraftValues(result.map((item) => `${item.ideaId}:${item.criterionId}:${item.reviewerId}`));
  if (duplicateKeys.length) blockers.push(`Idea criterion evidence contains duplicate reviewer assignments: ${duplicateKeys.join(", ")}.`);
  return result;
}

function compilePairwiseDivergence(candidates: BookIdeaCandidateV1[], requiredAxes: BookIdeaDivergenceAxisId[]): BookIdeaPairwiseDivergenceV1[] {
  const result: BookIdeaPairwiseDivergenceV1[] = [];
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex]!;
      const right = candidates[rightIndex]!;
      const leftAxes = new Map(left.axisValues.map((item) => [item.axisId, item.valueId]));
      const rightAxes = new Map(right.axisValues.map((item) => [item.axisId, item.valueId]));
      const shared = requiredAxes.filter((axisId) => leftAxes.get(axisId) === rightAxes.get(axisId)).length;
      const sharedAxisRatio = requiredAxes.length ? shared / requiredAxes.length : 1;
      const axisDivergence = 1 - sharedAxisRatio;
      const lexicalDivergence = 1 - jaccard(candidateTokens(left), candidateTokens(right));
      const compositeDivergence = axisDivergence * 0.72 + lexicalDivergence * 0.28;
      result.push({
        leftIdeaId: left.ideaId,
        rightIdeaId: right.ideaId,
        axisDivergence: roundReviewCraft(axisDivergence, 4),
        lexicalDivergence: roundReviewCraft(lexicalDivergence, 4),
        compositeDivergence: roundReviewCraft(compositeDivergence, 4),
        sharedAxisRatio: roundReviewCraft(sharedAxisRatio, 4),
      });
    }
  }
  return result.sort((left, right) => left.leftIdeaId.localeCompare(right.leftIdeaId) || left.rightIdeaId.localeCompare(right.rightIdeaId));
}

function selectPortfolio(evaluations: BookIdeaCandidateEvaluationV1[], maximum: number): BookIdeaPortfolioSelectionV1[] {
  const eligible = evaluations.filter((item) => item.eligibleForPortfolio);
  if (!eligible.length) return [];
  const selected: BookIdeaPortfolioSelectionV1[] = [];
  const grounded = [...eligible].sort((left, right) => right.weightedScore - left.weightedScore || left.ideaId.localeCompare(right.ideaId))[0]!;
  selected.push({ ideaId: grounded.ideaId, role: "grounded", rationaleIds: ["highest_quality_score", "mandatory_gates_passed"] });
  const remainingAfterGrounded = eligible.filter((item) => item.ideaId !== grounded.ideaId);
  if (remainingAfterGrounded.length && selected.length < maximum) {
    const bold = [...remainingAfterGrounded].sort((left, right) => right.minimumDivergenceFromOtherCandidate - left.minimumDivergenceFromOtherCandidate || right.deterministicDiversityContribution - left.deterministicDiversityContribution || left.ideaId.localeCompare(right.ideaId))[0]!;
    selected.push({ ideaId: bold.ideaId, role: "bold", rationaleIds: ["highest_minimum_divergence", "portfolio_expansion"] });
  }
  const selectedIds = new Set(selected.map((item) => item.ideaId));
  const remaining = eligible.filter((item) => !selectedIds.has(item.ideaId));
  if (remaining.length && selected.length < maximum) {
    const hybrid = [...remaining].sort((left, right) => combinedRank(right) - combinedRank(left) || left.ideaId.localeCompare(right.ideaId))[0]!;
    selected.push({ ideaId: hybrid.ideaId, role: "hybrid", rationaleIds: ["quality_diversity_balance", "project_fit"] });
  }
  const finalSelected = new Set(selected.map((item) => item.ideaId));
  const reserves = eligible.filter((item) => !finalSelected.has(item.ideaId)).sort((left, right) => combinedRank(right) - combinedRank(left) || left.ideaId.localeCompare(right.ideaId));
  for (const reserve of reserves) {
    if (selected.length >= maximum) break;
    selected.push({ ideaId: reserve.ideaId, role: "reserve", rationaleIds: ["alternative_strength", "contingency_value"] });
  }
  return selected;
}

function buildIdeaProviderInstruction(input: {
  labId: string;
  labVersion: number;
  domainId: BookIdeaDomainId;
  objective: string;
  existingSolutionSummary: string | undefined;
  requestedCandidateCount: number;
  requiredDivergenceAxisIds: BookIdeaDivergenceAxisId[];
  hardConstraintIds: string[];
  canonEvidenceIds: string[];
  seedIds: string[];
  rejectedIdeaPatternIds: string[];
  voiceProfile: BookAuthorialVoiceProfileV1;
  registerProfile: BookNarrativeRegisterProfileV1;
}): string {
  return [
    `EVAVO DIVERGENT IDEA LAB: ${input.labId} v${input.labVersion}`,
    `Domain: ${input.domainId}.`,
    `Objective: ${input.objective}`,
    input.existingSolutionSummary ? `Existing solution to challenge rather than merely polish: ${input.existingSolutionSummary}` : "No existing solution is privileged.",
    `Generate exactly ${input.requestedCandidateCount} complete candidates before recommending anything. Do not converge early on the first fluent answer.`,
    "Develop candidates independently. Change causal machinery, character choice and consequence before changing surface decoration.",
    `Required divergence axes: ${input.requiredDivergenceAxisIds.join(", ")}.`,
    "Each candidate must declare one concrete value for every required axis and explain how it changes the story.",
    "At least half the candidates must use a different causal engine from any supplied existing solution. At least two candidates must take a bold but canon-compatible risk. At least one must solve the objective through relationship or institution rather than spectacle.",
    input.voiceProfile.providerInstruction,
    input.registerProfile.providerInstruction,
    `Hard constraints: ${input.hardConstraintIds.join(", ")}.`,
    `Canon evidence: ${input.canonEvidenceIds.join(", ")}.`,
    `Optional seeds: ${input.seedIds.join(", ") || "none"}.`,
    `Rejected idea patterns: ${input.rejectedIdeaPatternIds.join(", ")}.`,
    "For every candidate provide: premise, causal mechanism, central character choice, opposition, emotional and material costs, immediate and downstream consequences, genre payoff, thematic pressure, image or motif, surprise mechanism, evidence and risks.",
    "Do not blend all candidates into one compromise. Preserve a genuinely divergent portfolio for later independent evaluation and human choice.",
    "Do not invoke named creators or reconstruct signature plots, prose, phrases, characters, worlds or trade dress.",
  ].join("\n");
}

function groupCriterionEvidence(values: BookIdeaCriterionEvidenceV1[]): Map<string, BookIdeaCriterionEvidenceV1[]> {
  const result = new Map<string, BookIdeaCriterionEvidenceV1[]>();
  for (const item of values) result.set(item.ideaId, [...(result.get(item.ideaId) ?? []), item]);
  return result;
}

function candidateTokens(candidate: BookIdeaCandidateV1): Set<string> {
  const text = [
    candidate.premise, candidate.causalMechanism, candidate.characterChoice, candidate.opposition, candidate.emotionalCost,
    candidate.materialCost, candidate.immediateConsequence, candidate.downstreamConsequence, candidate.genrePayoff,
    candidate.thematicPressure, candidate.imageOrMotif, candidate.surpriseMechanism,
  ].join(" ").normalize("NFKC").toLocaleLowerCase("en-AU");
  const stop = new Set(["a", "an", "and", "are", "as", "at", "be", "because", "but", "by", "for", "from", "he", "her", "his", "in", "is", "it", "of", "on", "or", "she", "that", "the", "their", "they", "this", "to", "was", "were", "with"]);
  return new Set((text.match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => token.length >= 3 && !stop.has(token)));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  const union = new Set([...left, ...right]);
  if (!union.size) return 1;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / union.size;
}

function combinedRank(value: BookIdeaCandidateEvaluationV1): number {
  return value.weightedScore * 0.72 + value.deterministicDiversityContribution * 100 * 0.28;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function compileBlocked(blockers: string[], warnings: string[]): BookIdeaLabCompileResultV1 {
  return {
    outputKind: "evavo_docs_book_idea_lab_compile_result",
    schemaVersion: 1,
    status: "blocked",
    blockers: uniqueReviewCraft(blockers),
    warnings: uniqueReviewCraft(warnings),
    providerCallPerformed: false,
    automaticCanonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
}

function evaluationBlocked(blockers: string[]): BookIdeaLabEvaluationResultV1 {
  return {
    outputKind: "evavo_docs_book_idea_lab_evaluation_result",
    schemaVersion: 1,
    status: "blocked",
    blockers: uniqueReviewCraft(blockers),
    requiredActions: ["Correct the malformed, incomplete or unauthorised idea-lab evaluation input."],
    humanChoiceRequired: true,
    automaticCanonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
}
