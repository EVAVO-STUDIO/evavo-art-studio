import {
  canonicalBookJson,
  sha256BookText,
  type BookProviderId,
} from "./book-studio-project-contracts";

export const BOOK_STORY_SCHEMA_VERSION = 1 as const;
export const BOOK_STORY_CONTRACT = "evavo_docs_book_story_v1" as const;

export type BookWorldActorKind =
  | "character"
  | "faction"
  | "institution"
  | "household"
  | "crew"
  | "community";
export type BookKnowledgeState =
  | "knows"
  | "believes"
  | "suspects"
  | "misunderstands"
  | "does_not_know";
export type BookWorldEventState =
  | "planned"
  | "possible"
  | "in_progress"
  | "completed"
  | "prevented"
  | "unknown_to_reader";
export type BookResearchClaimStatus =
  | "verified"
  | "disputed"
  | "uncertain"
  | "authorial_invention"
  | "not_yet_researched";
export type BookCanonKind =
  | "fact"
  | "character_state"
  | "relationship"
  | "location"
  | "object"
  | "institution"
  | "historical_constraint"
  | "secret"
  | "promise";
export type BookArcKind =
  | "character"
  | "relationship"
  | "faction"
  | "mystery"
  | "political"
  | "historical"
  | "thematic"
  | "world_change";

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

const SAFE_ID = /^[a-z][a-z0-9._:@/-]{1,199}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const PROVIDERS = new Set<BookProviderId>(["chatgpt", "claude", "other_compatible_model"]);
const ACTOR_KINDS = new Set<BookWorldActorKind>(["character", "faction", "institution", "household", "crew", "community"]);
const KNOWLEDGE_STATES = new Set<BookKnowledgeState>(["knows", "believes", "suspects", "misunderstands", "does_not_know"]);
const EVENT_STATES = new Set<BookWorldEventState>(["planned", "possible", "in_progress", "completed", "prevented", "unknown_to_reader"]);
const CLAIM_STATUSES = new Set<BookResearchClaimStatus>(["verified", "disputed", "uncertain", "authorial_invention", "not_yet_researched"]);
const CANON_KINDS = new Set<BookCanonKind>(["fact", "character_state", "relationship", "location", "object", "institution", "historical_constraint", "secret", "promise"]);
const ARC_KINDS = new Set<BookArcKind>(["character", "relationship", "faction", "mystery", "political", "historical", "thematic", "world_change"]);
const MAX_RECORDS = 100_000;

type UnknownRecord = Record<string, unknown>;

export async function validateAndNormalizeBookStoryState(input: unknown): Promise<BookStoryValidationResultV1> {
  const blockers: string[] = [];
  const requiredActions: string[] = [];
  const invalidLocationIds: string[] = [];
  const invalidActorIds: string[] = [];
  const invalidKnowledgeIds: string[] = [];
  const invalidPlanIds: string[] = [];
  const invalidEventIds: string[] = [];
  const invalidResearchClaimIds: string[] = [];
  const invalidCanonIds: string[] = [];
  const invalidArcIds: string[] = [];
  const danglingSetupIds: string[] = [];
  const source = record(input, "Book story state", blockers);
  rejectUnknown(source, new Set([
    "outputKind", "schemaVersion", "contract", "authorityMode", "storyStateId", "projectId", "programmeId",
    "projectFingerprint", "providerIds", "volumes", "currentSequence", "locations", "actors", "knowledge",
    "plans", "events", "researchClaims", "canon", "arcs", "setupsAndPayoffs", "unresolvedActorLocationIds",
    "unresolvedKnowledgeLeakIds", "unresolvedTimelineConflictIds", "unresolvedTravelConflictIds",
    "unresolvedMotivationGapIds", "unresolvedCoincidenceIds", "unresolvedOffPageEventIds", "continuityConflictIds",
    "forgottenConsequenceIds", "repeatedArcIds", "genericSeriesPatternIds", "requiredIndependentReviewIds",
    "completedIndependentReviewIds", "evidenceIds", "checkpointId", "storyStateFingerprint",
    "canonicalAdmissionAllowed", "canonicalManuscriptMutationPerformed", "websiteCompatibilityRuntimeStillAuthoritative",
    "dualAuthoritativeWritesAllowed", "runtimeCutoverApproved", "publicationPerformed",
  ]), "Book story state", blockers);

  const storyStateId = id(source.storyStateId, "storyStateId", blockers);
  const projectId = id(source.projectId, "projectId", blockers);
  const programmeId = id(source.programmeId, "programmeId", blockers);
  const projectFingerprint = sha(source.projectFingerprint, "projectFingerprint", blockers);
  const providerIds = enumArray(source.providerIds, PROVIDERS, "providerIds", blockers, true);
  const currentSequence = integer(source.currentSequence, "currentSequence", blockers, 0, Number.MAX_SAFE_INTEGER);
  const volumes = boundedArray(source.volumes, "volumes", blockers, 1, 256).map((value, index) => parseVolume(value, index, blockers));
  const locations = boundedArray(source.locations, "locations", blockers, 1, MAX_RECORDS).map((value, index) => parseLocation(value, index, blockers));
  const actors = boundedArray(source.actors, "actors", blockers, 1, MAX_RECORDS).map((value, index) => parseActor(value, index, blockers));
  const knowledge = boundedArray(source.knowledge, "knowledge", blockers, 0, MAX_RECORDS).map((value, index) => parseKnowledge(value, index, blockers));
  const plans = boundedArray(source.plans, "plans", blockers, 0, MAX_RECORDS).map((value, index) => parsePlan(value, index, blockers));
  const events = boundedArray(source.events, "events", blockers, 1, MAX_RECORDS).map((value, index) => parseEvent(value, index, blockers));
  const researchClaims = boundedArray(source.researchClaims, "researchClaims", blockers, 0, MAX_RECORDS).map((value, index) => parseResearchClaim(value, index, blockers));
  const canon = boundedArray(source.canon, "canon", blockers, 0, MAX_RECORDS).map((value, index) => parseCanon(value, index, blockers));
  const arcs = boundedArray(source.arcs, "arcs", blockers, 0, MAX_RECORDS).map((value, index) => parseArc(value, index, blockers));
  const setupsAndPayoffs = boundedArray(source.setupsAndPayoffs, "setupsAndPayoffs", blockers, 0, MAX_RECORDS).map((value, index) => parseSetup(value, index, blockers));

  const volumeIds = volumes.map((item) => item.volumeId);
  const volumeSet = new Set(volumeIds);
  const unitSet = new Set(volumes.flatMap((item) => item.canonicalUnitIds));
  const locationIds = locations.map((item) => item.locationId);
  const locationSet = new Set(locationIds);
  const actorIds = actors.map((item) => item.actorId);
  const actorSet = new Set(actorIds);
  const planIds = plans.map((item) => item.planId);
  const planSet = new Set(planIds);
  const eventIds = events.map((item) => item.eventId);
  const eventSet = new Set(eventIds);
  duplicate(volumeIds, "volume IDs", blockers);
  duplicate(volumes.map((item) => String(item.sequence)), "volume sequences", blockers);
  duplicate(locationIds, "location IDs", blockers);
  duplicate(actorIds, "actor IDs", blockers);
  duplicate(knowledge.map((item) => item.knowledgeId), "knowledge IDs", blockers);
  duplicate(planIds, "plan IDs", blockers);
  duplicate(eventIds, "event IDs", blockers);
  duplicate(researchClaims.map((item) => item.claimId), "research claim IDs", blockers);
  duplicate(canon.map((item) => item.canonId), "canon IDs", blockers);
  duplicate(arcs.map((item) => item.arcId), "arc IDs", blockers);
  duplicate(setupsAndPayoffs.map((item) => item.setupId), "setup IDs", blockers);

  for (const location of locations) {
    if (location.parentLocationId && !locationSet.has(location.parentLocationId)) invalidLocationIds.push(location.locationId);
    if (!location.evidenceIds.length) invalidLocationIds.push(location.locationId);
  }
  for (const actor of actors) {
    if (!locationSet.has(actor.currentLocationId) || !actor.evidenceIds.length) invalidActorIds.push(actor.actorId);
    if (!actor.publicGoalIds.length && !actor.privateGoalIds.length) requiredActions.push(`Actor ${actor.actorId} needs a grounded public or private goal.`);
    if (!actor.activePlanIds.length && !actor.nextLikelyActionIds.length) requiredActions.push(`Actor ${actor.actorId} needs an active plan or likely next action.`);
    if (actor.activePlanIds.some((planId) => !planSet.has(planId)) || actor.blockedPlanIds.some((planId) => !planSet.has(planId))) invalidActorIds.push(actor.actorId);
  }
  for (const item of knowledge) {
    if (!actorSet.has(item.actorId) || (item.sourceActorId && !actorSet.has(item.sourceActorId)) || (item.sourceEventId && !eventSet.has(item.sourceEventId))) invalidKnowledgeIds.push(item.knowledgeId);
    if (item.acquiredAtSequence > currentSequence && item.state !== "does_not_know") invalidKnowledgeIds.push(item.knowledgeId);
  }
  for (const plan of plans) {
    if (!actorSet.has(plan.ownerActorId) || plan.requiredLocationIds.some((locationId) => !locationSet.has(locationId)) || plan.dependencyPlanIds.some((planId) => !planSet.has(planId)) || plan.oppositionActorIds.some((actorId) => !actorSet.has(actorId))) invalidPlanIds.push(plan.planId);
    if (!plan.successConsequenceIds.length || !plan.failureConsequenceIds.length) requiredActions.push(`Plan ${plan.planId} needs success and failure consequences.`);
  }
  for (const event of events) {
    if (event.endSequence < event.startSequence || event.locationIds.some((locationId) => !locationSet.has(locationId)) || event.participantActorIds.some((actorId) => !actorSet.has(actorId)) || event.causalEventIds.some((eventId) => !eventSet.has(eventId)) || event.enablingPlanIds.some((planId) => !planSet.has(planId)) || !event.evidenceIds.length) invalidEventIds.push(event.eventId);
  }
  for (const claim of researchClaims) {
    if (claim.affectedVolumeIds.some((volumeId) => !volumeSet.has(volumeId)) || claim.affectedUnitIds.some((unitId) => !unitSet.has(unitId))) invalidResearchClaimIds.push(claim.claimId);
    if (claim.status === "verified" && (!claim.sourceEvidenceIds.length || !claim.sourceAuthorityIds.length || !claim.lastVerifiedAt)) invalidResearchClaimIds.push(claim.claimId);
    if (["uncertain", "disputed", "not_yet_researched"].includes(claim.status) && !claim.uncertainty) requiredActions.push(`Research claim ${claim.claimId} needs an explicit uncertainty or dispute statement.`);
  }
  const canonSet = new Set(canon.map((item) => item.canonId));
  for (const item of canon) {
    if (!volumeSet.has(item.establishedVolumeId) || !unitSet.has(item.establishedUnitId) || !item.sourceEvidenceIds.length || (item.supersedesCanonId && !canonSet.has(item.supersedesCanonId))) invalidCanonIds.push(item.canonId);
    if (item.status === "superseded" && !canon.some((candidate) => candidate.supersedesCanonId === item.canonId)) invalidCanonIds.push(item.canonId);
  }
  for (const arc of arcs) {
    if (arc.volumeIds.some((volumeId) => !volumeSet.has(volumeId)) || !arc.participantIds.length || !arc.openingState || !arc.currentState || !arc.intendedEndState) invalidArcIds.push(arc.arcId);
    for (const stage of arc.pressureStages) if (!volumeSet.has(stage.volumeId) || stage.unitIds.some((unitId) => !unitSet.has(unitId)) || !stage.evidenceIds.length) invalidArcIds.push(arc.arcId);
    if (arc.volumeIds.length > 1 && arc.pressureStages.length < arc.volumeIds.length) invalidArcIds.push(arc.arcId);
  }
  for (const setup of setupsAndPayoffs) {
    if (!volumeSet.has(setup.setupVolumeId) || setup.setupUnitIds.some((unitId) => !unitSet.has(unitId)) || setup.eligiblePayoffVolumeIds.some((volumeId) => !volumeSet.has(volumeId)) || !setup.evidenceIds.length) danglingSetupIds.push(setup.setupId);
    if (["paid_off", "reframed"].includes(setup.status) && (!setup.payoffVolumeId || !volumeSet.has(setup.payoffVolumeId) || !setup.payoffUnitIds.length || setup.payoffUnitIds.some((unitId) => !unitSet.has(unitId)) || !setup.causalBridgeIds.length)) danglingSetupIds.push(setup.setupId);
  }

  if (source.outputKind !== undefined && source.outputKind !== "evavo_docs_book_story_state") blockers.push("Book story outputKind is invalid.");
  if (source.schemaVersion !== undefined && source.schemaVersion !== 1) blockers.push("Book story schemaVersion is invalid.");
  if (source.contract !== undefined && source.contract !== BOOK_STORY_CONTRACT) blockers.push("Book story contract is invalid.");
  if (source.authorityMode !== undefined && source.authorityMode !== "shadow_migration") blockers.push("Book story authorityMode must remain shadow_migration.");
  for (const [key, expected] of Object.entries({ canonicalAdmissionAllowed: false, canonicalManuscriptMutationPerformed: false, websiteCompatibilityRuntimeStillAuthoritative: true, dualAuthoritativeWritesAllowed: false, runtimeCutoverApproved: false, publicationPerformed: false })) {
    if (source[key] !== undefined && source[key] !== expected) blockers.push(`Book story ${key} authority flag is invalid.`);
  }
  if (source.storyStateFingerprint !== undefined && !SHA256.test(String(source.storyStateFingerprint))) blockers.push("Book story state fingerprint is invalid.");

  if (invalidLocationIds.length) requiredActions.push(`Repair invalid locations: ${unique(invalidLocationIds).join(", ")}.`);
  if (invalidActorIds.length) requiredActions.push(`Repair invalid actors: ${unique(invalidActorIds).join(", ")}.`);
  if (invalidKnowledgeIds.length) requiredActions.push(`Repair impossible knowledge: ${unique(invalidKnowledgeIds).join(", ")}.`);
  if (invalidPlanIds.length) requiredActions.push(`Repair invalid plans: ${unique(invalidPlanIds).join(", ")}.`);
  if (invalidEventIds.length) requiredActions.push(`Repair timeline, causality or event references: ${unique(invalidEventIds).join(", ")}.`);
  if (invalidResearchClaimIds.length) requiredActions.push(`Repair unsupported research claims: ${unique(invalidResearchClaimIds).join(", ")}.`);
  if (invalidCanonIds.length) requiredActions.push(`Repair unsupported or contradictory canon: ${unique(invalidCanonIds).join(", ")}.`);
  if (invalidArcIds.length) requiredActions.push(`Repair incomplete cross-volume arcs: ${unique(invalidArcIds).join(", ")}.`);
  if (danglingSetupIds.length) requiredActions.push(`Repair dangling setups or payoffs: ${unique(danglingSetupIds).join(", ")}.`);

  const unresolvedFields = [
    "unresolvedActorLocationIds", "unresolvedKnowledgeLeakIds", "unresolvedTimelineConflictIds",
    "unresolvedTravelConflictIds", "unresolvedMotivationGapIds", "unresolvedCoincidenceIds",
    "unresolvedOffPageEventIds", "continuityConflictIds", "forgottenConsequenceIds",
    "repeatedArcIds", "genericSeriesPatternIds",
  ] as const;
  for (const field of unresolvedFields) {
    const values = idArray(source[field], field, blockers, MAX_RECORDS, false);
    if (values.length) requiredActions.push(`Resolve ${field}: ${values.join(", ")}.`);
  }
  const requiredIndependentReviewIds = idArray(source.requiredIndependentReviewIds, "requiredIndependentReviewIds", blockers, 1_000, true);
  const completedIndependentReviewIds = idArray(source.completedIndependentReviewIds, "completedIndependentReviewIds", blockers, 1_000, false);
  const incompleteReviews = requiredIndependentReviewIds.filter((reviewId) => !completedIndependentReviewIds.includes(reviewId));
  if (incompleteReviews.length) requiredActions.push(`Complete independent story and continuity reviews: ${incompleteReviews.join(", ")}.`);
  const evidenceIds = idArray(source.evidenceIds, "evidenceIds", blockers, MAX_RECORDS, true);
  const checkpointId = id(source.checkpointId, "checkpointId", blockers);

  const uniqueBlockers = unique(blockers);
  if (uniqueBlockers.length) return validationResult("blocked", undefined, uniqueBlockers, requiredActions, { invalidLocationIds, invalidActorIds, invalidKnowledgeIds, invalidPlanIds, invalidEventIds, invalidResearchClaimIds, invalidCanonIds, invalidArcIds, danglingSetupIds });

  const unsigned: Omit<BookStoryStateV1, "storyStateFingerprint"> = {
    outputKind: "evavo_docs_book_story_state",
    schemaVersion: 1,
    contract: BOOK_STORY_CONTRACT,
    authorityMode: "shadow_migration",
    storyStateId,
    projectId,
    programmeId,
    projectFingerprint,
    providerIds,
    volumes: [...volumes].sort((a, b) => a.sequence - b.sequence),
    currentSequence,
    locations: sortBy(locations, "locationId"),
    actors: sortBy(actors, "actorId"),
    knowledge: sortBy(knowledge, "knowledgeId"),
    plans: sortBy(plans, "planId"),
    events: [...events].sort((a, b) => a.startSequence - b.startSequence || a.eventId.localeCompare(b.eventId)),
    researchClaims: sortBy(researchClaims, "claimId"),
    canon: [...canon].sort((a, b) => a.establishedSequence - b.establishedSequence || a.canonId.localeCompare(b.canonId)),
    arcs: sortBy(arcs, "arcId"),
    setupsAndPayoffs: sortBy(setupsAndPayoffs, "setupId"),
    unresolvedActorLocationIds: idArray(source.unresolvedActorLocationIds, "unresolvedActorLocationIds", [], MAX_RECORDS, false),
    unresolvedKnowledgeLeakIds: idArray(source.unresolvedKnowledgeLeakIds, "unresolvedKnowledgeLeakIds", [], MAX_RECORDS, false),
    unresolvedTimelineConflictIds: idArray(source.unresolvedTimelineConflictIds, "unresolvedTimelineConflictIds", [], MAX_RECORDS, false),
    unresolvedTravelConflictIds: idArray(source.unresolvedTravelConflictIds, "unresolvedTravelConflictIds", [], MAX_RECORDS, false),
    unresolvedMotivationGapIds: idArray(source.unresolvedMotivationGapIds, "unresolvedMotivationGapIds", [], MAX_RECORDS, false),
    unresolvedCoincidenceIds: idArray(source.unresolvedCoincidenceIds, "unresolvedCoincidenceIds", [], MAX_RECORDS, false),
    unresolvedOffPageEventIds: idArray(source.unresolvedOffPageEventIds, "unresolvedOffPageEventIds", [], MAX_RECORDS, false),
    continuityConflictIds: idArray(source.continuityConflictIds, "continuityConflictIds", [], MAX_RECORDS, false),
    forgottenConsequenceIds: idArray(source.forgottenConsequenceIds, "forgottenConsequenceIds", [], MAX_RECORDS, false),
    repeatedArcIds: idArray(source.repeatedArcIds, "repeatedArcIds", [], MAX_RECORDS, false),
    genericSeriesPatternIds: idArray(source.genericSeriesPatternIds, "genericSeriesPatternIds", [], MAX_RECORDS, false),
    requiredIndependentReviewIds,
    completedIndependentReviewIds,
    evidenceIds,
    checkpointId,
    canonicalAdmissionAllowed: false,
    canonicalManuscriptMutationPerformed: false,
    websiteCompatibilityRuntimeStillAuthoritative: true,
    dualAuthoritativeWritesAllowed: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
  const storyState = { ...unsigned, storyStateFingerprint: await fingerprintBookStoryState(unsigned) };
  const status = requiredActions.length ? "needs_work" : "ready";
  return validationResult(status, storyState, [], requiredActions, { invalidLocationIds, invalidActorIds, invalidKnowledgeIds, invalidPlanIds, invalidEventIds, invalidResearchClaimIds, invalidCanonIds, invalidArcIds, danglingSetupIds });
}

export async function fingerprintBookStoryState(value: Omit<BookStoryStateV1, "storyStateFingerprint"> | BookStoryStateV1): Promise<string> {
  const { storyStateFingerprint: _discarded, ...unsigned } = value as BookStoryStateV1;
  return sha256BookText(canonicalBookJson(unsigned));
}

function parseVolume(value: unknown, index: number, blockers: string[]): BookStoryVolumeIdentityV1 {
  const source = record(value, `Story volume ${index + 1}`, blockers);
  const result: BookStoryVolumeIdentityV1 = {
    volumeId: id(source.volumeId, `Story volume ${index + 1} volumeId`, blockers),
    sequence: integer(source.sequence, `Story volume ${index + 1} sequence`, blockers, 1, 256),
    manuscriptRevisionId: id(source.manuscriptRevisionId, `Story volume ${index + 1} manuscriptRevisionId`, blockers),
    manuscriptSha256: sha(source.manuscriptSha256, `Story volume ${index + 1} manuscriptSha256`, blockers),
    canonicalUnitIds: idArray(source.canonicalUnitIds, `Story volume ${index + 1} canonicalUnitIds`, blockers, MAX_RECORDS, true),
    startSequence: integer(source.startSequence, `Story volume ${index + 1} startSequence`, blockers, 0, Number.MAX_SAFE_INTEGER),
    endSequence: integer(source.endSequence, `Story volume ${index + 1} endSequence`, blockers, 0, Number.MAX_SAFE_INTEGER),
    status: enumValue(source.status, new Set(["planned", "drafting", "editing", "canonical"]), `Story volume ${index + 1} status`, blockers, "planned"),
  };
  if (result.endSequence < result.startSequence) blockers.push(`Story volume ${result.volumeId} has an invalid sequence range.`);
  return result;
}
function parseLocation(value: unknown, index: number, blockers: string[]): BookWorldLocationV1 {
  const source = record(value, `Location ${index + 1}`, blockers);
  return {
    locationId: id(source.locationId, `Location ${index + 1} locationId`, blockers),
    name: text(source.name, `Location ${index + 1} name`, blockers, 500),
    ...(optionalId(source.parentLocationId, `Location ${index + 1} parentLocationId`, blockers) ? { parentLocationId: optionalId(source.parentLocationId, `Location ${index + 1} parentLocationId`, blockers) } : {}),
    ...(optionalId(source.historicalPlaceId, `Location ${index + 1} historicalPlaceId`, blockers) ? { historicalPlaceId: optionalId(source.historicalPlaceId, `Location ${index + 1} historicalPlaceId`, blockers) } : {}),
    travelConstraintIds: idArray(source.travelConstraintIds, `Location ${index + 1} travelConstraintIds`, blockers, 1_000, false),
    accessRuleIds: idArray(source.accessRuleIds, `Location ${index + 1} accessRuleIds`, blockers, 1_000, false),
    activeConditionIds: idArray(source.activeConditionIds, `Location ${index + 1} activeConditionIds`, blockers, 1_000, false),
    evidenceIds: idArray(source.evidenceIds, `Location ${index + 1} evidenceIds`, blockers, 1_000, true),
  };
}
function parseActor(value: unknown, index: number, blockers: string[]): BookWorldActorV1 {
  const source = record(value, `Actor ${index + 1}`, blockers);
  return {
    actorId: id(source.actorId, `Actor ${index + 1} actorId`, blockers),
    kind: enumValue(source.kind, ACTOR_KINDS, `Actor ${index + 1} kind`, blockers, "character"),
    name: text(source.name, `Actor ${index + 1} name`, blockers, 500),
    currentLocationId: id(source.currentLocationId, `Actor ${index + 1} currentLocationId`, blockers),
    availableFromSequence: integer(source.availableFromSequence, `Actor ${index + 1} availableFromSequence`, blockers, 0, Number.MAX_SAFE_INTEGER),
    ...(source.unavailableUntilSequence === undefined ? {} : { unavailableUntilSequence: integer(source.unavailableUntilSequence, `Actor ${index + 1} unavailableUntilSequence`, blockers, 0, Number.MAX_SAFE_INTEGER) }),
    publicGoalIds: idArray(source.publicGoalIds, `Actor ${index + 1} publicGoalIds`, blockers, 1_000, false),
    privateGoalIds: idArray(source.privateGoalIds, `Actor ${index + 1} privateGoalIds`, blockers, 1_000, false),
    fearIds: idArray(source.fearIds, `Actor ${index + 1} fearIds`, blockers, 1_000, false),
    obligationIds: idArray(source.obligationIds, `Actor ${index + 1} obligationIds`, blockers, 1_000, false),
    secretIds: idArray(source.secretIds, `Actor ${index + 1} secretIds`, blockers, 1_000, false),
    resourceIds: idArray(source.resourceIds, `Actor ${index + 1} resourceIds`, blockers, 1_000, false),
    relationshipStateIds: idArray(source.relationshipStateIds, `Actor ${index + 1} relationshipStateIds`, blockers, 1_000, false),
    injuryOrFatigueIds: idArray(source.injuryOrFatigueIds, `Actor ${index + 1} injuryOrFatigueIds`, blockers, 1_000, false),
    activePlanIds: idArray(source.activePlanIds, `Actor ${index + 1} activePlanIds`, blockers, 1_000, false),
    blockedPlanIds: idArray(source.blockedPlanIds, `Actor ${index + 1} blockedPlanIds`, blockers, 1_000, false),
    nextLikelyActionIds: idArray(source.nextLikelyActionIds, `Actor ${index + 1} nextLikelyActionIds`, blockers, 1_000, false),
    historicalConstraintIds: idArray(source.historicalConstraintIds, `Actor ${index + 1} historicalConstraintIds`, blockers, 1_000, false),
    evidenceIds: idArray(source.evidenceIds, `Actor ${index + 1} evidenceIds`, blockers, 1_000, true),
  };
}
function parseKnowledge(value: unknown, index: number, blockers: string[]): BookWorldKnowledgeV1 {
  const source = record(value, `Knowledge ${index + 1}`, blockers);
  return {
    knowledgeId: id(source.knowledgeId, `Knowledge ${index + 1} knowledgeId`, blockers),
    actorId: id(source.actorId, `Knowledge ${index + 1} actorId`, blockers),
    subjectId: id(source.subjectId, `Knowledge ${index + 1} subjectId`, blockers),
    state: enumValue(source.state, KNOWLEDGE_STATES, `Knowledge ${index + 1} state`, blockers, "does_not_know"),
    acquiredAtSequence: integer(source.acquiredAtSequence, `Knowledge ${index + 1} acquiredAtSequence`, blockers, 0, Number.MAX_SAFE_INTEGER),
    ...(optionalId(source.sourceActorId, `Knowledge ${index + 1} sourceActorId`, blockers) ? { sourceActorId: optionalId(source.sourceActorId, `Knowledge ${index + 1} sourceActorId`, blockers) } : {}),
    ...(optionalId(source.sourceEventId, `Knowledge ${index + 1} sourceEventId`, blockers) ? { sourceEventId: optionalId(source.sourceEventId, `Knowledge ${index + 1} sourceEventId`, blockers) } : {}),
    reliability: numberValue(source.reliability, `Knowledge ${index + 1} reliability`, blockers, 0, 1),
    visibleToReader: booleanValue(source.visibleToReader, `Knowledge ${index + 1} visibleToReader`, blockers),
    evidenceIds: idArray(source.evidenceIds, `Knowledge ${index + 1} evidenceIds`, blockers, 1_000, true),
  };
}
function parsePlan(value: unknown, index: number, blockers: string[]): BookWorldPlanV1 {
  const source = record(value, `Plan ${index + 1}`, blockers);
  return {
    planId: id(source.planId, `Plan ${index + 1} planId`, blockers),
    ownerActorId: id(source.ownerActorId, `Plan ${index + 1} ownerActorId`, blockers),
    objective: text(source.objective, `Plan ${index + 1} objective`, blockers, 2_000),
    currentStep: text(source.currentStep, `Plan ${index + 1} currentStep`, blockers, 2_000),
    requiredLocationIds: idArray(source.requiredLocationIds, `Plan ${index + 1} requiredLocationIds`, blockers, 1_000, false),
    requiredResourceIds: idArray(source.requiredResourceIds, `Plan ${index + 1} requiredResourceIds`, blockers, 1_000, false),
    dependencyPlanIds: idArray(source.dependencyPlanIds, `Plan ${index + 1} dependencyPlanIds`, blockers, 1_000, false),
    oppositionActorIds: idArray(source.oppositionActorIds, `Plan ${index + 1} oppositionActorIds`, blockers, 1_000, false),
    ...(source.deadlineSequence === undefined ? {} : { deadlineSequence: integer(source.deadlineSequence, `Plan ${index + 1} deadlineSequence`, blockers, 0, Number.MAX_SAFE_INTEGER) }),
    successConsequenceIds: idArray(source.successConsequenceIds, `Plan ${index + 1} successConsequenceIds`, blockers, 1_000, false),
    failureConsequenceIds: idArray(source.failureConsequenceIds, `Plan ${index + 1} failureConsequenceIds`, blockers, 1_000, false),
    concealedFromActorIds: idArray(source.concealedFromActorIds, `Plan ${index + 1} concealedFromActorIds`, blockers, 1_000, false),
    state: enumValue(source.state, new Set(["forming", "active", "blocked", "abandoned", "completed"]), `Plan ${index + 1} state`, blockers, "forming"),
  };
}
function parseEvent(value: unknown, index: number, blockers: string[]): BookWorldEventV1 {
  const source = record(value, `Event ${index + 1}`, blockers);
  return {
    eventId: id(source.eventId, `Event ${index + 1} eventId`, blockers),
    title: text(source.title, `Event ${index + 1} title`, blockers, 500),
    startSequence: integer(source.startSequence, `Event ${index + 1} startSequence`, blockers, 0, Number.MAX_SAFE_INTEGER),
    endSequence: integer(source.endSequence, `Event ${index + 1} endSequence`, blockers, 0, Number.MAX_SAFE_INTEGER),
    locationIds: idArray(source.locationIds, `Event ${index + 1} locationIds`, blockers, 1_000, true),
    participantActorIds: idArray(source.participantActorIds, `Event ${index + 1} participantActorIds`, blockers, 1_000, false),
    causalEventIds: idArray(source.causalEventIds, `Event ${index + 1} causalEventIds`, blockers, 1_000, false),
    enablingPlanIds: idArray(source.enablingPlanIds, `Event ${index + 1} enablingPlanIds`, blockers, 1_000, false),
    historicalEventIds: idArray(source.historicalEventIds, `Event ${index + 1} historicalEventIds`, blockers, 1_000, false),
    state: enumValue(source.state, EVENT_STATES, `Event ${index + 1} state`, blockers, "planned"),
    publicOutcome: text(source.publicOutcome, `Event ${index + 1} publicOutcome`, blockers, 4_000, true),
    hiddenOutcome: text(source.hiddenOutcome, `Event ${index + 1} hiddenOutcome`, blockers, 4_000, true),
    consequenceIds: idArray(source.consequenceIds, `Event ${index + 1} consequenceIds`, blockers, 1_000, false),
    evidenceIds: idArray(source.evidenceIds, `Event ${index + 1} evidenceIds`, blockers, 1_000, true),
  };
}
function parseResearchClaim(value: unknown, index: number, blockers: string[]): BookResearchClaimV1 {
  const source = record(value, `Research claim ${index + 1}`, blockers);
  const lastVerifiedAt = optionalTimestamp(source.lastVerifiedAt, `Research claim ${index + 1} lastVerifiedAt`, blockers);
  return {
    claimId: id(source.claimId, `Research claim ${index + 1} claimId`, blockers),
    subjectIds: idArray(source.subjectIds, `Research claim ${index + 1} subjectIds`, blockers, 1_000, true),
    claim: text(source.claim, `Research claim ${index + 1} claim`, blockers, 8_000),
    status: enumValue(source.status, CLAIM_STATUSES, `Research claim ${index + 1} status`, blockers, "not_yet_researched"),
    sourceEvidenceIds: idArray(source.sourceEvidenceIds, `Research claim ${index + 1} sourceEvidenceIds`, blockers, 1_000, false),
    sourceAuthorityIds: idArray(source.sourceAuthorityIds, `Research claim ${index + 1} sourceAuthorityIds`, blockers, 1_000, false),
    affectedVolumeIds: idArray(source.affectedVolumeIds, `Research claim ${index + 1} affectedVolumeIds`, blockers, 256, false),
    affectedUnitIds: idArray(source.affectedUnitIds, `Research claim ${index + 1} affectedUnitIds`, blockers, MAX_RECORDS, false),
    permissibleInference: text(source.permissibleInference, `Research claim ${index + 1} permissibleInference`, blockers, 4_000, true),
    uncertainty: text(source.uncertainty, `Research claim ${index + 1} uncertainty`, blockers, 4_000, true),
    ...(lastVerifiedAt === undefined ? {} : { lastVerifiedAt }),
  };
}
function parseCanon(value: unknown, index: number, blockers: string[]): BookCanonRecordV1 {
  const source = record(value, `Canon ${index + 1}`, blockers);
  const supersedesCanonId = optionalId(source.supersedesCanonId, `Canon ${index + 1} supersedesCanonId`, blockers);
  return {
    canonId: id(source.canonId, `Canon ${index + 1} canonId`, blockers),
    kind: enumValue(source.kind, CANON_KINDS, `Canon ${index + 1} kind`, blockers, "fact"),
    subjectIds: idArray(source.subjectIds, `Canon ${index + 1} subjectIds`, blockers, 1_000, true),
    value: text(source.value, `Canon ${index + 1} value`, blockers, 8_000),
    establishedVolumeId: id(source.establishedVolumeId, `Canon ${index + 1} establishedVolumeId`, blockers),
    establishedUnitId: id(source.establishedUnitId, `Canon ${index + 1} establishedUnitId`, blockers),
    establishedSequence: integer(source.establishedSequence, `Canon ${index + 1} establishedSequence`, blockers, 0, Number.MAX_SAFE_INTEGER),
    sourceEvidenceIds: idArray(source.sourceEvidenceIds, `Canon ${index + 1} sourceEvidenceIds`, blockers, 1_000, true),
    ...(supersedesCanonId === undefined ? {} : { supersedesCanonId }),
    mutable: booleanValue(source.mutable, `Canon ${index + 1} mutable`, blockers),
    status: enumValue(source.status, new Set(["active", "superseded", "deliberately_ambiguous"]), `Canon ${index + 1} status`, blockers, "active"),
  };
}
function parseArc(value: unknown, index: number, blockers: string[]): BookArcRecordV1 {
  const source = record(value, `Arc ${index + 1}`, blockers);
  const pressureStages = boundedArray(source.pressureStages, `Arc ${index + 1} pressureStages`, blockers, 0, 1_000).map((stageValue, stageIndex) => {
    const stage = record(stageValue, `Arc ${index + 1} stage ${stageIndex + 1}`, blockers);
    return {
      volumeId: id(stage.volumeId, `Arc ${index + 1} stage ${stageIndex + 1} volumeId`, blockers),
      unitIds: idArray(stage.unitIds, `Arc ${index + 1} stage ${stageIndex + 1} unitIds`, blockers, MAX_RECORDS, true),
      pressure: text(stage.pressure, `Arc ${index + 1} stage ${stageIndex + 1} pressure`, blockers, 4_000),
      choice: text(stage.choice, `Arc ${index + 1} stage ${stageIndex + 1} choice`, blockers, 4_000),
      consequence: text(stage.consequence, `Arc ${index + 1} stage ${stageIndex + 1} consequence`, blockers, 4_000),
      evidenceIds: idArray(stage.evidenceIds, `Arc ${index + 1} stage ${stageIndex + 1} evidenceIds`, blockers, 1_000, true),
    };
  });
  return {
    arcId: id(source.arcId, `Arc ${index + 1} arcId`, blockers),
    kind: enumValue(source.kind, ARC_KINDS, `Arc ${index + 1} kind`, blockers, "character"),
    title: text(source.title, `Arc ${index + 1} title`, blockers, 500),
    volumeIds: idArray(source.volumeIds, `Arc ${index + 1} volumeIds`, blockers, 256, true),
    participantIds: idArray(source.participantIds, `Arc ${index + 1} participantIds`, blockers, 1_000, true),
    openingState: text(source.openingState, `Arc ${index + 1} openingState`, blockers, 4_000),
    pressureStages,
    intendedEndState: text(source.intendedEndState, `Arc ${index + 1} intendedEndState`, blockers, 4_000),
    currentState: text(source.currentState, `Arc ${index + 1} currentState`, blockers, 4_000),
    irreversibleChangeIds: idArray(source.irreversibleChangeIds, `Arc ${index + 1} irreversibleChangeIds`, blockers, 1_000, false),
    unresolvedQuestionIds: idArray(source.unresolvedQuestionIds, `Arc ${index + 1} unresolvedQuestionIds`, blockers, 1_000, false),
    status: enumValue(source.status, new Set(["planned", "active", "transformed", "resolved", "deliberately_open"]), `Arc ${index + 1} status`, blockers, "planned"),
  };
}
function parseSetup(value: unknown, index: number, blockers: string[]): BookSetupPayoffV1 {
  const source = record(value, `Setup ${index + 1}`, blockers);
  const payoffVolumeId = optionalId(source.payoffVolumeId, `Setup ${index + 1} payoffVolumeId`, blockers);
  return {
    setupId: id(source.setupId, `Setup ${index + 1} setupId`, blockers),
    setupVolumeId: id(source.setupVolumeId, `Setup ${index + 1} setupVolumeId`, blockers),
    setupUnitIds: idArray(source.setupUnitIds, `Setup ${index + 1} setupUnitIds`, blockers, MAX_RECORDS, true),
    setupDescription: text(source.setupDescription, `Setup ${index + 1} setupDescription`, blockers, 4_000),
    readerExpectation: text(source.readerExpectation, `Setup ${index + 1} readerExpectation`, blockers, 4_000),
    hiddenTruth: text(source.hiddenTruth, `Setup ${index + 1} hiddenTruth`, blockers, 4_000, true),
    eligiblePayoffVolumeIds: idArray(source.eligiblePayoffVolumeIds, `Setup ${index + 1} eligiblePayoffVolumeIds`, blockers, 256, true),
    ...(payoffVolumeId === undefined ? {} : { payoffVolumeId }),
    payoffUnitIds: idArray(source.payoffUnitIds, `Setup ${index + 1} payoffUnitIds`, blockers, MAX_RECORDS, false),
    payoffKind: enumValue(source.payoffKind, new Set(["reveal", "reversal", "choice", "consequence", "echo", "deliberate_nonresolution"]), `Setup ${index + 1} payoffKind`, blockers, "reveal"),
    causalBridgeIds: idArray(source.causalBridgeIds, `Setup ${index + 1} causalBridgeIds`, blockers, 1_000, false),
    evidenceIds: idArray(source.evidenceIds, `Setup ${index + 1} evidenceIds`, blockers, 1_000, true),
    status: enumValue(source.status, new Set(["seeded", "developing", "paid_off", "reframed", "deliberately_open"]), `Setup ${index + 1} status`, blockers, "seeded"),
  };
}

function validationResult(
  status: BookStoryValidationResultV1["status"],
  storyState: BookStoryStateV1 | undefined,
  blockers: string[],
  requiredActions: string[],
  ids: Omit<BookStoryValidationResultV1, "outputKind" | "schemaVersion" | "status" | "storyState" | "blockers" | "requiredActions" | "storyStateFingerprint" | "canonicalAdmissionAllowed" | "canonicalManuscriptMutationPerformed" | "publicationPerformed">,
): BookStoryValidationResultV1 {
  return {
    outputKind: "evavo_docs_book_story_validation",
    schemaVersion: 1,
    status,
    ...(storyState === undefined ? {} : { storyState, storyStateFingerprint: storyState.storyStateFingerprint }),
    blockers: unique(blockers),
    requiredActions: unique(requiredActions),
    invalidLocationIds: unique(ids.invalidLocationIds),
    invalidActorIds: unique(ids.invalidActorIds),
    invalidKnowledgeIds: unique(ids.invalidKnowledgeIds),
    invalidPlanIds: unique(ids.invalidPlanIds),
    invalidEventIds: unique(ids.invalidEventIds),
    invalidResearchClaimIds: unique(ids.invalidResearchClaimIds),
    invalidCanonIds: unique(ids.invalidCanonIds),
    invalidArcIds: unique(ids.invalidArcIds),
    danglingSetupIds: unique(ids.danglingSetupIds),
    canonicalAdmissionAllowed: false,
    canonicalManuscriptMutationPerformed: false,
    publicationPerformed: false,
  };
}

function record(value: unknown, label: string, blockers: string[]): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) { blockers.push(`${label} must be an object.`); return {}; }
  return value as UnknownRecord;
}
function rejectUnknown(value: UnknownRecord, allowed: Set<string>, label: string, blockers: string[]): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (unknown.length) blockers.push(`${label} contains unsupported fields: ${unknown.join(", ")}.`);
}
function boundedArray(value: unknown, label: string, blockers: string[], minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) { blockers.push(`${label} must contain ${minimum}-${maximum} records.`); return []; }
  return value;
}
function id(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !SAFE_ID.test(value) || ["__proto__", "constructor", "prototype"].includes(value)) { blockers.push(`${label} is invalid.`); return "invalid-id"; }
  return value;
}
function optionalId(value: unknown, label: string, blockers: string[]): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return id(value, label, blockers);
}
function idArray(value: unknown, label: string, blockers: string[], maximum: number, required: boolean): string[] {
  if (!Array.isArray(value) || value.length > maximum || (required && value.length < 1)) { blockers.push(`${label} is invalid or unbounded.`); return []; }
  const result = value.map((item) => id(item, label, blockers));
  duplicate(result, label, blockers);
  return unique(result).sort();
}
function enumArray<T extends string>(value: unknown, allowed: Set<T>, label: string, blockers: string[], required: boolean): T[] {
  if (!Array.isArray(value) || (required && value.length < 1) || value.length > 32) { blockers.push(`${label} is invalid.`); return []; }
  const result = value.map((item) => enumValue(item, allowed, label, blockers, [...allowed][0] as T));
  duplicate(result, label, blockers);
  return unique(result).sort();
}
function enumValue<T extends string>(value: unknown, allowed: Set<T>, label: string, blockers: string[], fallback: T): T {
  if (typeof value !== "string" || !allowed.has(value as T)) { blockers.push(`${label} is unsupported.`); return fallback; }
  return value as T;
}
function text(value: unknown, label: string, blockers: string[], maximum: number, allowEmpty = false): string {
  if (typeof value !== "string" || value !== value.trim() || value.length > maximum || (!allowEmpty && value.length < 1) || /[\u0000-\u001f\u007f]/.test(value)) { blockers.push(`${label} is invalid.`); return allowEmpty ? "" : "invalid"; }
  return value;
}
function sha(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !SHA256.test(value)) { blockers.push(`${label} must be an exact sha256 digest.`); return `sha256:${"0".repeat(64)}`; }
  return value;
}
function integer(value: unknown, label: string, blockers: string[], minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) { blockers.push(`${label} is invalid.`); return minimum; }
  return Number(value);
}
function numberValue(value: unknown, label: string, blockers: string[], minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) { blockers.push(`${label} is invalid.`); return minimum; }
  return value;
}
function booleanValue(value: unknown, label: string, blockers: string[]): boolean {
  if (value !== true && value !== false) { blockers.push(`${label} must be boolean.`); return false; }
  return value;
}
function optionalTimestamp(value: unknown, label: string, blockers: string[]): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value) || Number.isNaN(Date.parse(value))) { blockers.push(`${label} must be canonical UTC ISO-8601.`); return undefined; }
  return value;
}
function duplicate(values: string[], label: string, blockers: string[]): void {
  const seen = new Set<string>(); const duplicates = new Set<string>();
  for (const value of values) seen.has(value) ? duplicates.add(value) : seen.add(value);
  if (duplicates.size) blockers.push(`${label} contain duplicates: ${[...duplicates].sort().join(", ")}.`);
}
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function sortBy<T extends Record<K, string>, K extends keyof T>(values: T[], key: K): T[] { return [...values].sort((a, b) => a[key].localeCompare(b[key])); }
