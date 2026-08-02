import type { BookProviderId } from "./book-studio-project-contracts";

export const BOOK_STORY_SCHEMA_VERSION = 1 as const;
export const BOOK_STORY_CONTRACT = "evavo_docs_book_story_v1" as const;

export type BookWorldActorKind = "character" | "faction" | "institution" | "household" | "crew" | "community";
export type BookKnowledgeState = "knows" | "believes" | "suspects" | "misunderstands" | "does_not_know";
export type BookWorldEventState = "planned" | "possible" | "in_progress" | "completed" | "prevented" | "unknown_to_reader";
export type BookResearchClaimStatus = "verified" | "disputed" | "uncertain" | "authorial_invention" | "not_yet_researched";
export type BookCanonKind = "fact" | "character_state" | "relationship" | "location" | "object" | "institution" | "historical_constraint" | "secret" | "promise";
export type BookArcKind = "character" | "relationship" | "faction" | "mystery" | "political" | "historical" | "thematic" | "world_change";

export interface BookStoryVolumeIdentityV1 {
  volumeId: string;
  sequence: number;
  manuscriptRevisionId: string;
  manuscriptSha256: string;
  canonicalUnitIds: string[];
  startSequence: number;
  endSequence: number;
  status: "planned" | "drafting" | "editing" | "canonical";
}

export interface BookWorldLocationV1 {
  locationId: string;
  name: string;
  parentLocationId?: string;
  historicalPlaceId?: string;
  travelConstraintIds: string[];
  accessRuleIds: string[];
  activeConditionIds: string[];
  evidenceIds: string[];
}

export interface BookWorldActorV1 {
  actorId: string;
  kind: BookWorldActorKind;
  name: string;
  currentLocationId: string;
  availableFromSequence: number;
  unavailableUntilSequence?: number;
  publicGoalIds: string[];
  privateGoalIds: string[];
  fearIds: string[];
  obligationIds: string[];
  secretIds: string[];
  resourceIds: string[];
  relationshipStateIds: string[];
  injuryOrFatigueIds: string[];
  activePlanIds: string[];
  blockedPlanIds: string[];
  nextLikelyActionIds: string[];
  historicalConstraintIds: string[];
  evidenceIds: string[];
}

export interface BookWorldKnowledgeV1 {
  knowledgeId: string;
  actorId: string;
  subjectId: string;
  state: BookKnowledgeState;
  acquiredAtSequence: number;
  sourceActorId?: string;
  sourceEventId?: string;
  reliability: number;
  visibleToReader: boolean;
  evidenceIds: string[];
}

export interface BookWorldPlanV1 {
  planId: string;
  ownerActorId: string;
  objective: string;
  currentStep: string;
  requiredLocationIds: string[];
  requiredResourceIds: string[];
  dependencyPlanIds: string[];
  oppositionActorIds: string[];
  deadlineSequence?: number;
  successConsequenceIds: string[];
  failureConsequenceIds: string[];
  concealedFromActorIds: string[];
  state: "forming" | "active" | "blocked" | "abandoned" | "completed";
}

export interface BookWorldEventV1 {
  eventId: string;
  title: string;
  startSequence: number;
  endSequence: number;
  locationIds: string[];
  participantActorIds: string[];
  causalEventIds: string[];
  enablingPlanIds: string[];
  historicalEventIds: string[];
  state: BookWorldEventState;
  publicOutcome: string;
  hiddenOutcome: string;
  consequenceIds: string[];
  evidenceIds: string[];
}

export interface BookResearchClaimV1 {
  claimId: string;
  subjectIds: string[];
  claim: string;
  status: BookResearchClaimStatus;
  sourceEvidenceIds: string[];
  sourceAuthorityIds: string[];
  affectedVolumeIds: string[];
  affectedUnitIds: string[];
  permissibleInference: string;
  uncertainty: string;
  lastVerifiedAt?: string;
}

export interface BookCanonRecordV1 {
  canonId: string;
  kind: BookCanonKind;
  subjectIds: string[];
  value: string;
  establishedVolumeId: string;
  establishedUnitId: string;
  establishedSequence: number;
  sourceEvidenceIds: string[];
  supersedesCanonId?: string;
  mutable: boolean;
  status: "active" | "superseded" | "deliberately_ambiguous";
}

export interface BookArcPressureStageV1 {
  volumeId: string;
  unitIds: string[];
  pressure: string;
  choice: string;
  consequence: string;
  evidenceIds: string[];
}

export interface BookArcRecordV1 {
  arcId: string;
  kind: BookArcKind;
  title: string;
  volumeIds: string[];
  participantIds: string[];
  openingState: string;
  pressureStages: BookArcPressureStageV1[];
  intendedEndState: string;
  currentState: string;
  irreversibleChangeIds: string[];
  unresolvedQuestionIds: string[];
  status: "planned" | "active" | "transformed" | "resolved" | "deliberately_open";
}

export interface BookSetupPayoffV1 {
  setupId: string;
  setupVolumeId: string;
  setupUnitIds: string[];
  setupDescription: string;
  readerExpectation: string;
  hiddenTruth: string;
  eligiblePayoffVolumeIds: string[];
  payoffVolumeId?: string;
  payoffUnitIds: string[];
  payoffKind: "reveal" | "reversal" | "choice" | "consequence" | "echo" | "deliberate_nonresolution";
  causalBridgeIds: string[];
  evidenceIds: string[];
  status: "seeded" | "developing" | "paid_off" | "reframed" | "deliberately_open";
}

export interface BookStoryStateV1 {
  outputKind: "evavo_docs_book_story_state";
  schemaVersion: typeof BOOK_STORY_SCHEMA_VERSION;
  contract: typeof BOOK_STORY_CONTRACT;
  authorityMode: "shadow_migration";
  storyStateId: string;
  projectId: string;
  programmeId: string;
  projectFingerprint: string;
  providerIds: BookProviderId[];
  volumes: BookStoryVolumeIdentityV1[];
  currentSequence: number;
  locations: BookWorldLocationV1[];
  actors: BookWorldActorV1[];
  knowledge: BookWorldKnowledgeV1[];
  plans: BookWorldPlanV1[];
  events: BookWorldEventV1[];
  researchClaims: BookResearchClaimV1[];
  canon: BookCanonRecordV1[];
  arcs: BookArcRecordV1[];
  setupsAndPayoffs: BookSetupPayoffV1[];
  unresolvedActorLocationIds: string[];
  unresolvedKnowledgeLeakIds: string[];
  unresolvedTimelineConflictIds: string[];
  unresolvedTravelConflictIds: string[];
  unresolvedMotivationGapIds: string[];
  unresolvedCoincidenceIds: string[];
  unresolvedOffPageEventIds: string[];
  continuityConflictIds: string[];
  forgottenConsequenceIds: string[];
  repeatedArcIds: string[];
  genericSeriesPatternIds: string[];
  requiredIndependentReviewIds: string[];
  completedIndependentReviewIds: string[];
  evidenceIds: string[];
  checkpointId: string;
  storyStateFingerprint: string;
  canonicalAdmissionAllowed: false;
  canonicalManuscriptMutationPerformed: false;
  websiteCompatibilityRuntimeStillAuthoritative: true;
  dualAuthoritativeWritesAllowed: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export interface BookStoryValidationResultV1 {
  outputKind: "evavo_docs_book_story_validation";
  schemaVersion: 1;
  status: "ready" | "needs_work" | "blocked";
  storyState?: BookStoryStateV1;
  blockers: string[];
  requiredActions: string[];
  invalidLocationIds: string[];
  invalidActorIds: string[];
  invalidKnowledgeIds: string[];
  invalidPlanIds: string[];
  invalidEventIds: string[];
  invalidResearchClaimIds: string[];
  invalidCanonIds: string[];
  invalidArcIds: string[];
  danglingSetupIds: string[];
  storyStateFingerprint?: string;
  canonicalAdmissionAllowed: false;
  canonicalManuscriptMutationPerformed: false;
  publicationPerformed: false;
}
