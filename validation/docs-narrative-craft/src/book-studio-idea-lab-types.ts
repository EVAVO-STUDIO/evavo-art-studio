export const BOOK_IDEA_LAB_CONTRACT = "evavo_docs_book_idea_lab_v1" as const;
export const BOOK_IDEA_LAB_SCHEMA_VERSION = 1 as const;

export type BookIdeaDomainId =
  | "story_premise"
  | "plot_turn"
  | "scene_design"
  | "character_design"
  | "relationship_arc"
  | "dialogue_strategy"
  | "mystery_design"
  | "worldbuilding"
  | "set_piece"
  | "theme_expression"
  | "opening"
  | "ending"
  | "title_and_naming";

export type BookIdeaDivergenceAxisId =
  | "causal_engine"
  | "character_choice"
  | "emotional_cost"
  | "social_structure"
  | "setting_use"
  | "information_design"
  | "moral_choice"
  | "genre_payoff"
  | "temporal_shape"
  | "viewpoint_strategy"
  | "image_motif"
  | "risk_scale"
  | "resolution_shape";

export type BookIdeaCriterionId =
  | "originality"
  | "project_fit"
  | "causal_leverage"
  | "character_truth"
  | "emotional_consequence"
  | "genre_payoff"
  | "thematic_resonance"
  | "image_potential"
  | "escalation_value"
  | "feasibility";

export type BookIdeaPortfolioRole = "grounded" | "bold" | "hybrid" | "reserve";

export interface BookIdeaLabPolicyV1 {
  minimumCandidates?: number;
  maximumCandidates?: number;
  minimumRequiredAxes?: number;
  minimumPairwiseDivergence?: number;
  maximumSharedAxisRatio?: number;
  minimumIndependentReviewerIds?: number;
  minimumRecommendedScore?: number;
  maximumPortfolioSize?: number;
}

export interface BookIdeaLabCompileInputV1 {
  outputKind: "evavo_docs_book_idea_lab_compile_input";
  schemaVersion: 1;
  programmeId: string;
  projectId: string;
  volumeId: string;
  manuscriptRevisionId: string;
  labId: string;
  labVersion: number;
  authorialVoiceProfile: unknown;
  narrativeRegisterProfile: unknown;
  domainId: BookIdeaDomainId;
  objective: string;
  existingSolutionSummary?: string;
  hardConstraintIds: string[];
  canonEvidenceIds: string[];
  seedIds: string[];
  rejectedIdeaPatternIds: string[];
  requiredDivergenceAxisIds: BookIdeaDivergenceAxisId[];
  requestedCandidateCount: number;
  evidenceIds: string[];
  policy?: BookIdeaLabPolicyV1;
}

export interface BookIdeaCriterionV1 {
  criterionId: BookIdeaCriterionId;
  weight: number;
  mandatory: boolean;
  passCondition: string;
  failureSignals: string[];
}

export interface BookIdeaLabPacketV1 {
  outputKind: "evavo_docs_book_idea_lab_packet";
  schemaVersion: 1;
  contract: typeof BOOK_IDEA_LAB_CONTRACT;
  status: "ready";
  programmeId: string;
  projectId: string;
  volumeId: string;
  manuscriptRevisionId: string;
  labId: string;
  labVersion: number;
  authorialVoiceProfileFingerprint: string;
  narrativeRegisterProfileFingerprint: string;
  domainId: BookIdeaDomainId;
  objective: string;
  existingSolutionSummary?: string;
  hardConstraintIds: string[];
  canonEvidenceIds: string[];
  seedIds: string[];
  rejectedIdeaPatternIds: string[];
  requiredDivergenceAxisIds: BookIdeaDivergenceAxisId[];
  requestedCandidateCount: number;
  minimumPairwiseDivergence: number;
  maximumSharedAxisRatio: number;
  minimumIndependentReviewerIds: number;
  minimumRecommendedScore: number;
  maximumPortfolioSize: number;
  qualityRubric: BookIdeaCriterionV1[];
  providerInstruction: string;
  evidenceIds: string[];
  packetFingerprint: string;
  providerCallPerformed: false;
  singleAnswerConvergencePermitted: false;
  namedCreatorInstructionPermitted: false;
  projectVoiceRemainsAuthoritative: true;
  automaticCanonicalAdmissionAllowed: false;
  publicationPerformed: false;
}

export interface BookIdeaLabCompileResultV1 {
  outputKind: "evavo_docs_book_idea_lab_compile_result";
  schemaVersion: 1;
  status: "ready" | "blocked";
  packet?: BookIdeaLabPacketV1;
  packetFingerprint?: string;
  blockers: string[];
  warnings: string[];
  providerCallPerformed: false;
  automaticCanonicalAdmissionAllowed: false;
  publicationPerformed: false;
}

export interface BookIdeaAxisValueV1 {
  axisId: BookIdeaDivergenceAxisId;
  valueId: string;
  explanation: string;
}

export interface BookIdeaCandidateV1 {
  ideaId: string;
  premise: string;
  causalMechanism: string;
  characterChoice: string;
  opposition: string;
  emotionalCost: string;
  materialCost: string;
  immediateConsequence: string;
  downstreamConsequence: string;
  genrePayoff: string;
  thematicPressure: string;
  imageOrMotif: string;
  surpriseMechanism: string;
  axisValues: BookIdeaAxisValueV1[];
  constraintEvidenceIds: string[];
  canonEvidenceIds: string[];
  riskIds: string[];
}

export interface BookIdeaCriterionEvidenceV1 {
  ideaId: string;
  criterionId: BookIdeaCriterionId;
  score: number;
  reviewerId: string;
  evidenceIds: string[];
  findingIds: string[];
  independentlyReviewed: boolean;
}

export interface BookIdeaLabEvaluationInputV1 {
  outputKind: "evavo_docs_book_idea_lab_evaluation_input";
  schemaVersion: 1;
  packet: BookIdeaLabPacketV1;
  evaluationId: string;
  candidates: BookIdeaCandidateV1[];
  criterionEvidence: BookIdeaCriterionEvidenceV1[];
  independentReviewerIds: string[];
  unresolvedFindingIds: string[];
  evidenceIds: string[];
}

export interface BookIdeaPairwiseDivergenceV1 {
  leftIdeaId: string;
  rightIdeaId: string;
  axisDivergence: number;
  lexicalDivergence: number;
  compositeDivergence: number;
  sharedAxisRatio: number;
}

export interface BookIdeaCandidateEvaluationV1 {
  ideaId: string;
  weightedScore: number;
  deterministicDiversityContribution: number;
  minimumDivergenceFromOtherCandidate: number;
  mandatoryCriterionFailures: BookIdeaCriterionId[];
  missingCriterionIds: BookIdeaCriterionId[];
  unresolvedFindingIds: string[];
  independentlyReviewed: boolean;
  eligibleForPortfolio: boolean;
}

export interface BookIdeaPortfolioSelectionV1 {
  ideaId: string;
  role: BookIdeaPortfolioRole;
  rationaleIds: string[];
}

export interface BookIdeaLabEvaluationV1 {
  outputKind: "evavo_docs_book_idea_lab_evaluation";
  schemaVersion: 1;
  contract: typeof BOOK_IDEA_LAB_CONTRACT;
  status: "ready_for_human_choice" | "needs_work" | "blocked";
  packetFingerprint: string;
  evaluationId: string;
  candidateEvaluations: BookIdeaCandidateEvaluationV1[];
  pairwiseDivergence: BookIdeaPairwiseDivergenceV1[];
  portfolio: BookIdeaPortfolioSelectionV1[];
  recommendedIdeaId?: string;
  minimumObservedPairwiseDivergence: number;
  maximumObservedSharedAxisRatio: number;
  independentReviewerIds: string[];
  unresolvedFindingIds: string[];
  requiredActions: string[];
  evidenceIds: string[];
  evaluationFingerprint: string;
  humanChoiceRequired: true;
  automaticCanonicalAdmissionAllowed: false;
  publicationPerformed: false;
}

export interface BookIdeaLabEvaluationResultV1 {
  outputKind: "evavo_docs_book_idea_lab_evaluation_result";
  schemaVersion: 1;
  status: "ready_for_human_choice" | "needs_work" | "blocked";
  evaluation?: BookIdeaLabEvaluationV1;
  blockers: string[];
  requiredActions: string[];
  humanChoiceRequired: true;
  automaticCanonicalAdmissionAllowed: false;
  publicationPerformed: false;
}
