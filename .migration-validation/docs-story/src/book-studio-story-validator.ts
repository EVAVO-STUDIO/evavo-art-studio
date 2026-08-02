import { canonicalBookJson, sha256BookText, type BookProviderId } from "./book-studio-project-contracts";
import {
  BOOK_STORY_CONTRACT,
  type BookArcKind,
  type BookArcRecordV1,
  type BookCanonKind,
  type BookCanonRecordV1,
  type BookKnowledgeState,
  type BookResearchClaimStatus,
  type BookResearchClaimV1,
  type BookSetupPayoffV1,
  type BookStoryStateV1,
  type BookStoryValidationResultV1,
  type BookStoryVolumeIdentityV1,
  type BookWorldActorKind,
  type BookWorldActorV1,
  type BookWorldEventState,
  type BookWorldEventV1,
  type BookWorldKnowledgeV1,
  type BookWorldLocationV1,
  type BookWorldPlanV1,
} from "./book-studio-story-types";

const SAFE_ID = /^[a-z][a-z0-9._:@/-]{1,199}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MAX_RECORDS = 100_000;
const PROVIDERS = new Set<BookProviderId>(["chatgpt", "claude", "other_compatible_model"]);
const ACTOR_KINDS = new Set<BookWorldActorKind>(["character", "faction", "institution", "household", "crew", "community"]);
const KNOWLEDGE_STATES = new Set<BookKnowledgeState>(["knows", "believes", "suspects", "misunderstands", "does_not_know"]);
const EVENT_STATES = new Set<BookWorldEventState>(["planned", "possible", "in_progress", "completed", "prevented", "unknown_to_reader"]);
const CLAIM_STATUSES = new Set<BookResearchClaimStatus>(["verified", "disputed", "uncertain", "authorial_invention", "not_yet_researched"]);
const CANON_KINDS = new Set<BookCanonKind>(["fact", "character_state", "relationship", "location", "object", "institution", "historical_constraint", "secret", "promise"]);
const ARC_KINDS = new Set<BookArcKind>(["character", "relationship", "faction", "mystery", "political", "historical", "thematic", "world_change"]);
const TOP_LEVEL_KEYS = new Set([
  "outputKind", "schemaVersion", "contract", "authorityMode", "storyStateId", "projectId", "programmeId",
  "projectFingerprint", "providerIds", "volumes", "currentSequence", "locations", "actors", "knowledge",
  "plans", "events", "researchClaims", "canon", "arcs", "setupsAndPayoffs", "unresolvedActorLocationIds",
  "unresolvedKnowledgeLeakIds", "unresolvedTimelineConflictIds", "unresolvedTravelConflictIds",
  "unresolvedMotivationGapIds", "unresolvedCoincidenceIds", "unresolvedOffPageEventIds", "continuityConflictIds",
  "forgottenConsequenceIds", "repeatedArcIds", "genericSeriesPatternIds", "requiredIndependentReviewIds",
  "completedIndependentReviewIds", "evidenceIds", "checkpointId", "storyStateFingerprint",
  "canonicalAdmissionAllowed", "canonicalManuscriptMutationPerformed", "websiteCompatibilityRuntimeStillAuthoritative",
  "dualAuthoritativeWritesAllowed", "runtimeCutoverApproved", "publicationPerformed",
]);
const UNRESOLVED_FIELDS = [
  "unresolvedActorLocationIds", "unresolvedKnowledgeLeakIds", "unresolvedTimelineConflictIds",
  "unresolvedTravelConflictIds", "unresolvedMotivationGapIds", "unresolvedCoincidenceIds",
  "unresolvedOffPageEventIds", "continuityConflictIds", "forgottenConsequenceIds",
  "repeatedArcIds", "genericSeriesPatternIds",
] as const;

type RecordValue = Record<string, unknown>;
type InvalidIds = Pick<BookStoryValidationResultV1,
  "invalidLocationIds" | "invalidActorIds" | "invalidKnowledgeIds" | "invalidPlanIds" |
  "invalidEventIds" | "invalidResearchClaimIds" | "invalidCanonIds" | "invalidArcIds" | "danglingSetupIds">;

export async function validateAndNormalizeBookStoryState(input: unknown): Promise<BookStoryValidationResultV1> {
  const blockers: string[] = [];
  const requiredActions: string[] = [];
  const invalid: InvalidIds = {
    invalidLocationIds: [], invalidActorIds: [], invalidKnowledgeIds: [], invalidPlanIds: [],
    invalidEventIds: [], invalidResearchClaimIds: [], invalidCanonIds: [], invalidArcIds: [], danglingSetupIds: [],
  };
  const source = object(input, "Book story state", blockers);
  const unknown = Object.keys(source).filter((key) => !TOP_LEVEL_KEYS.has(key)).sort();
  if (unknown.length) blockers.push(`Book story state contains unsupported fields: ${unknown.join(", ")}.`);
  checkIdentityAndAuthority(source, blockers);

  const volumes = array(source.volumes, "volumes", blockers, 1, 256).map((item, index) => parseVolume(item, index, blockers));
  const locations = array(source.locations, "locations", blockers, 1, MAX_RECORDS).map((item, index) => parseLocation(item, index, blockers));
  const actors = array(source.actors, "actors", blockers, 1, MAX_RECORDS).map((item, index) => parseActor(item, index, blockers));
  const knowledge = array(source.knowledge, "knowledge", blockers, 0, MAX_RECORDS).map((item, index) => parseKnowledge(item, index, blockers));
  const plans = array(source.plans, "plans", blockers, 0, MAX_RECORDS).map((item, index) => parsePlan(item, index, blockers));
  const events = array(source.events, "events", blockers, 1, MAX_RECORDS).map((item, index) => parseEvent(item, index, blockers));
  const researchClaims = array(source.researchClaims, "researchClaims", blockers, 0, MAX_RECORDS).map((item, index) => parseResearch(item, index, blockers));
  const canon = array(source.canon, "canon", blockers, 0, MAX_RECORDS).map((item, index) => parseCanon(item, index, blockers));
  const arcs = array(source.arcs, "arcs", blockers, 0, MAX_RECORDS).map((item, index) => parseArc(item, index, blockers));
  const setupsAndPayoffs = array(source.setupsAndPayoffs, "setupsAndPayoffs", blockers, 0, MAX_RECORDS).map((item, index) => parseSetup(item, index, blockers));

  const volumeSet = uniqueSet(volumes.map((item) => item.volumeId), "volume IDs", blockers);
  uniqueSet(volumes.map((item) => String(item.sequence)), "volume sequences", blockers);
  const unitSet = new Set(volumes.flatMap((item) => item.canonicalUnitIds));
  const locationSet = uniqueSet(locations.map((item) => item.locationId), "location IDs", blockers);
  const actorSet = uniqueSet(actors.map((item) => item.actorId), "actor IDs", blockers);
  const planSet = uniqueSet(plans.map((item) => item.planId), "plan IDs", blockers);
  const eventSet = uniqueSet(events.map((item) => item.eventId), "event IDs", blockers);
  uniqueSet(knowledge.map((item) => item.knowledgeId), "knowledge IDs", blockers);
  uniqueSet(researchClaims.map((item) => item.claimId), "research claim IDs", blockers);
  const canonSet = uniqueSet(canon.map((item) => item.canonId), "canon IDs", blockers);
  uniqueSet(arcs.map((item) => item.arcId), "arc IDs", blockers);
  uniqueSet(setupsAndPayoffs.map((item) => item.setupId), "setup IDs", blockers);
  const currentSequence = integer(source.currentSequence, "currentSequence", blockers, 0, Number.MAX_SAFE_INTEGER);

  for (const location of locations) {
    if ((location.parentLocationId && !locationSet.has(location.parentLocationId)) || !location.evidenceIds.length) invalid.invalidLocationIds.push(location.locationId);
  }
  for (const actor of actors) {
    if (!locationSet.has(actor.currentLocationId) || !actor.evidenceIds.length ||
        actor.activePlanIds.some((planId) => !planSet.has(planId)) || actor.blockedPlanIds.some((planId) => !planSet.has(planId))) {
      invalid.invalidActorIds.push(actor.actorId);
    }
    if (!actor.publicGoalIds.length && !actor.privateGoalIds.length) requiredActions.push(`Actor ${actor.actorId} needs a grounded public or private goal.`);
    if (!actor.activePlanIds.length && !actor.nextLikelyActionIds.length) requiredActions.push(`Actor ${actor.actorId} needs an active plan or likely next action.`);
  }
  for (const item of knowledge) {
    if (!actorSet.has(item.actorId) || (item.sourceActorId && !actorSet.has(item.sourceActorId)) ||
        (item.sourceEventId && !eventSet.has(item.sourceEventId)) ||
        (item.acquiredAtSequence > currentSequence && item.state !== "does_not_know")) invalid.invalidKnowledgeIds.push(item.knowledgeId);
  }
  for (const plan of plans) {
    if (!actorSet.has(plan.ownerActorId) || plan.requiredLocationIds.some((id) => !locationSet.has(id)) ||
        plan.dependencyPlanIds.some((id) => !planSet.has(id)) || plan.oppositionActorIds.some((id) => !actorSet.has(id))) invalid.invalidPlanIds.push(plan.planId);
    if (!plan.successConsequenceIds.length || !plan.failureConsequenceIds.length) requiredActions.push(`Plan ${plan.planId} needs success and failure consequences.`);
  }
  for (const event of events) {
    if (event.endSequence < event.startSequence || event.locationIds.some((id) => !locationSet.has(id)) ||
        event.participantActorIds.some((id) => !actorSet.has(id)) || event.causalEventIds.some((id) => !eventSet.has(id)) ||
        event.enablingPlanIds.some((id) => !planSet.has(id)) || !event.evidenceIds.length) invalid.invalidEventIds.push(event.eventId);
  }
  for (const claim of researchClaims) {
    if (claim.affectedVolumeIds.some((id) => !volumeSet.has(id)) || claim.affectedUnitIds.some((id) => !unitSet.has(id)) ||
        (claim.status === "verified" && (!claim.sourceEvidenceIds.length || !claim.sourceAuthorityIds.length || !claim.lastVerifiedAt))) {
      invalid.invalidResearchClaimIds.push(claim.claimId);
    }
    if (["uncertain", "disputed", "not_yet_researched"].includes(claim.status) && !claim.uncertainty) requiredActions.push(`Research claim ${claim.claimId} needs an explicit uncertainty or dispute statement.`);
  }
  for (const item of canon) {
    if (!volumeSet.has(item.establishedVolumeId) || !unitSet.has(item.establishedUnitId) || !item.sourceEvidenceIds.length ||
        (item.supersedesCanonId && !canonSet.has(item.supersedesCanonId)) ||
        (item.status === "superseded" && !canon.some((candidate) => candidate.supersedesCanonId === item.canonId))) invalid.invalidCanonIds.push(item.canonId);
  }
  for (const arc of arcs) {
    if (arc.volumeIds.some((id) => !volumeSet.has(id)) || !arc.participantIds.length || !arc.openingState || !arc.currentState || !arc.intendedEndState ||
        arc.pressureStages.some((stage) => !volumeSet.has(stage.volumeId) || stage.unitIds.some((id) => !unitSet.has(id)) || !stage.evidenceIds.length) ||
        (arc.volumeIds.length > 1 && arc.pressureStages.length < arc.volumeIds.length)) invalid.invalidArcIds.push(arc.arcId);
  }
  for (const setup of setupsAndPayoffs) {
    const baseInvalid = !volumeSet.has(setup.setupVolumeId) || setup.setupUnitIds.some((id) => !unitSet.has(id)) ||
      setup.eligiblePayoffVolumeIds.some((id) => !volumeSet.has(id)) || !setup.evidenceIds.length;
    const payoffInvalid = ["paid_off", "reframed"].includes(setup.status) &&
      (!setup.payoffVolumeId || !volumeSet.has(setup.payoffVolumeId) || !setup.payoffUnitIds.length ||
       setup.payoffUnitIds.some((id) => !unitSet.has(id)) || !setup.causalBridgeIds.length);
    if (baseInvalid || payoffInvalid) invalid.danglingSetupIds.push(setup.setupId);
  }

  addInvalidActions(invalid, requiredActions);
  for (const field of UNRESOLVED_FIELDS) {
    const values = ids(source[field], field, blockers, MAX_RECORDS, false);
    if (values.length) requiredActions.push(`Resolve ${field}: ${values.join(", ")}.`);
  }
  const requiredIndependentReviewIds = ids(source.requiredIndependentReviewIds, "requiredIndependentReviewIds", blockers, 1_000, true);
  const completedIndependentReviewIds = ids(source.completedIndependentReviewIds, "completedIndependentReviewIds", blockers, 1_000, false);
  const incompleteReviews = requiredIndependentReviewIds.filter((id) => !completedIndependentReviewIds.includes(id));
  if (incompleteReviews.length) requiredActions.push(`Complete independent story and continuity reviews: ${incompleteReviews.join(", ")}.`);

  const uniqueBlockers = unique(blockers);
  if (uniqueBlockers.length) return result("blocked", undefined, uniqueBlockers, requiredActions, invalid);
  const unsigned: Omit<BookStoryStateV1, "storyStateFingerprint"> = {
    outputKind: "evavo_docs_book_story_state", schemaVersion: 1, contract: BOOK_STORY_CONTRACT,
    authorityMode: "shadow_migration",
    storyStateId: id(source.storyStateId, "storyStateId", blockers),
    projectId: id(source.projectId, "projectId", blockers),
    programmeId: id(source.programmeId, "programmeId", blockers),
    projectFingerprint: digest(source.projectFingerprint, "projectFingerprint", blockers),
    providerIds: enumIds(source.providerIds, PROVIDERS, "providerIds", blockers, true),
    volumes: [...volumes].sort((a, b) => a.sequence - b.sequence), currentSequence,
    locations: sort(locations, "locationId"), actors: sort(actors, "actorId"),
    knowledge: sort(knowledge, "knowledgeId"), plans: sort(plans, "planId"),
    events: [...events].sort((a, b) => a.startSequence - b.startSequence || a.eventId.localeCompare(b.eventId)),
    researchClaims: sort(researchClaims, "claimId"),
    canon: [...canon].sort((a, b) => a.establishedSequence - b.establishedSequence || a.canonId.localeCompare(b.canonId)),
    arcs: sort(arcs, "arcId"), setupsAndPayoffs: sort(setupsAndPayoffs, "setupId"),
    unresolvedActorLocationIds: ids(source.unresolvedActorLocationIds, "unresolvedActorLocationIds", [], MAX_RECORDS, false),
    unresolvedKnowledgeLeakIds: ids(source.unresolvedKnowledgeLeakIds, "unresolvedKnowledgeLeakIds", [], MAX_RECORDS, false),
    unresolvedTimelineConflictIds: ids(source.unresolvedTimelineConflictIds, "unresolvedTimelineConflictIds", [], MAX_RECORDS, false),
    unresolvedTravelConflictIds: ids(source.unresolvedTravelConflictIds, "unresolvedTravelConflictIds", [], MAX_RECORDS, false),
    unresolvedMotivationGapIds: ids(source.unresolvedMotivationGapIds, "unresolvedMotivationGapIds", [], MAX_RECORDS, false),
    unresolvedCoincidenceIds: ids(source.unresolvedCoincidenceIds, "unresolvedCoincidenceIds", [], MAX_RECORDS, false),
    unresolvedOffPageEventIds: ids(source.unresolvedOffPageEventIds, "unresolvedOffPageEventIds", [], MAX_RECORDS, false),
    continuityConflictIds: ids(source.continuityConflictIds, "continuityConflictIds", [], MAX_RECORDS, false),
    forgottenConsequenceIds: ids(source.forgottenConsequenceIds, "forgottenConsequenceIds", [], MAX_RECORDS, false),
    repeatedArcIds: ids(source.repeatedArcIds, "repeatedArcIds", [], MAX_RECORDS, false),
    genericSeriesPatternIds: ids(source.genericSeriesPatternIds, "genericSeriesPatternIds", [], MAX_RECORDS, false),
    requiredIndependentReviewIds, completedIndependentReviewIds,
    evidenceIds: ids(source.evidenceIds, "evidenceIds", blockers, MAX_RECORDS, true),
    checkpointId: id(source.checkpointId, "checkpointId", blockers),
    canonicalAdmissionAllowed: false, canonicalManuscriptMutationPerformed: false,
    websiteCompatibilityRuntimeStillAuthoritative: true, dualAuthoritativeWritesAllowed: false,
    runtimeCutoverApproved: false, publicationPerformed: false,
  };
  const storyState = { ...unsigned, storyStateFingerprint: await fingerprintBookStoryState(unsigned) };
  return result(requiredActions.length ? "needs_work" : "ready", storyState, [], requiredActions, invalid);
}

export async function fingerprintBookStoryState(value: Omit<BookStoryStateV1, "storyStateFingerprint"> | BookStoryStateV1): Promise<string> {
  const { storyStateFingerprint: _discarded, ...unsigned } = value as BookStoryStateV1;
  return sha256BookText(canonicalBookJson(unsigned));
}

function checkIdentityAndAuthority(source: RecordValue, blockers: string[]): void {
  if (source.outputKind !== undefined && source.outputKind !== "evavo_docs_book_story_state") blockers.push("Book story outputKind is invalid.");
  if (source.schemaVersion !== undefined && source.schemaVersion !== 1) blockers.push("Book story schemaVersion is invalid.");
  if (source.contract !== undefined && source.contract !== BOOK_STORY_CONTRACT) blockers.push("Book story contract is invalid.");
  if (source.authorityMode !== undefined && source.authorityMode !== "shadow_migration") blockers.push("Book story authorityMode must remain shadow_migration.");
  const flags: Record<string, boolean> = {
    canonicalAdmissionAllowed: false, canonicalManuscriptMutationPerformed: false,
    websiteCompatibilityRuntimeStillAuthoritative: true, dualAuthoritativeWritesAllowed: false,
    runtimeCutoverApproved: false, publicationPerformed: false,
  };
  for (const [key, expected] of Object.entries(flags)) if (source[key] !== undefined && source[key] !== expected) blockers.push(`Book story ${key} authority flag is invalid.`);
  if (source.storyStateFingerprint !== undefined && (typeof source.storyStateFingerprint !== "string" || !SHA256.test(source.storyStateFingerprint))) blockers.push("Book story state fingerprint is invalid.");
}

function parseVolume(value: unknown, index: number, blockers: string[]): BookStoryVolumeIdentityV1 {
  const source = object(value, `Story volume ${index + 1}`, blockers);
  const startSequence = integer(source.startSequence, `Story volume ${index + 1} startSequence`, blockers, 0, Number.MAX_SAFE_INTEGER);
  const endSequence = integer(source.endSequence, `Story volume ${index + 1} endSequence`, blockers, 0, Number.MAX_SAFE_INTEGER);
  if (endSequence < startSequence) blockers.push(`Story volume ${String(source.volumeId)} has an invalid sequence range.`);
  return {
    volumeId: id(source.volumeId, `Story volume ${index + 1} volumeId`, blockers),
    sequence: integer(source.sequence, `Story volume ${index + 1} sequence`, blockers, 1, 256),
    manuscriptRevisionId: id(source.manuscriptRevisionId, `Story volume ${index + 1} manuscriptRevisionId`, blockers),
    manuscriptSha256: digest(source.manuscriptSha256, `Story volume ${index + 1} manuscriptSha256`, blockers),
    canonicalUnitIds: ids(source.canonicalUnitIds, `Story volume ${index + 1} canonicalUnitIds`, blockers, MAX_RECORDS, true),
    startSequence, endSequence,
    status: enumValue(source.status, new Set(["planned", "drafting", "editing", "canonical"]), `Story volume ${index + 1} status`, blockers, "planned"),
  };
}
function parseLocation(value: unknown, index: number, blockers: string[]): BookWorldLocationV1 {
  const source = object(value, `Location ${index + 1}`, blockers);
  const parentLocationId = optionalId(source.parentLocationId, `Location ${index + 1} parentLocationId`, blockers);
  const historicalPlaceId = optionalId(source.historicalPlaceId, `Location ${index + 1} historicalPlaceId`, blockers);
  return {
    locationId: id(source.locationId, `Location ${index + 1} locationId`, blockers),
    name: text(source.name, `Location ${index + 1} name`, blockers, 500),
    ...(parentLocationId === undefined ? {} : { parentLocationId }),
    ...(historicalPlaceId === undefined ? {} : { historicalPlaceId }),
    travelConstraintIds: ids(source.travelConstraintIds, `Location ${index + 1} travelConstraintIds`, blockers, 1_000, false),
    accessRuleIds: ids(source.accessRuleIds, `Location ${index + 1} accessRuleIds`, blockers, 1_000, false),
    activeConditionIds: ids(source.activeConditionIds, `Location ${index + 1} activeConditionIds`, blockers, 1_000, false),
    evidenceIds: ids(source.evidenceIds, `Location ${index + 1} evidenceIds`, blockers, 1_000, true),
  };
}
function parseActor(value: unknown, index: number, blockers: string[]): BookWorldActorV1 {
  const source = object(value, `Actor ${index + 1}`, blockers);
  const unavailable = optionalInteger(source.unavailableUntilSequence, `Actor ${index + 1} unavailableUntilSequence`, blockers);
  return {
    actorId: id(source.actorId, `Actor ${index + 1} actorId`, blockers),
    kind: enumValue(source.kind, ACTOR_KINDS, `Actor ${index + 1} kind`, blockers, "character"),
    name: text(source.name, `Actor ${index + 1} name`, blockers, 500),
    currentLocationId: id(source.currentLocationId, `Actor ${index + 1} currentLocationId`, blockers),
    availableFromSequence: integer(source.availableFromSequence, `Actor ${index + 1} availableFromSequence`, blockers, 0, Number.MAX_SAFE_INTEGER),
    ...(unavailable === undefined ? {} : { unavailableUntilSequence: unavailable }),
    publicGoalIds: ids(source.publicGoalIds, `Actor ${index + 1} publicGoalIds`, blockers, 1_000, false),
    privateGoalIds: ids(source.privateGoalIds, `Actor ${index + 1} privateGoalIds`, blockers, 1_000, false),
    fearIds: ids(source.fearIds, `Actor ${index + 1} fearIds`, blockers, 1_000, false),
    obligationIds: ids(source.obligationIds, `Actor ${index + 1} obligationIds`, blockers, 1_000, false),
    secretIds: ids(source.secretIds, `Actor ${index + 1} secretIds`, blockers, 1_000, false),
    resourceIds: ids(source.resourceIds, `Actor ${index + 1} resourceIds`, blockers, 1_000, false),
    relationshipStateIds: ids(source.relationshipStateIds, `Actor ${index + 1} relationshipStateIds`, blockers, 1_000, false),
    injuryOrFatigueIds: ids(source.injuryOrFatigueIds, `Actor ${index + 1} injuryOrFatigueIds`, blockers, 1_000, false),
    activePlanIds: ids(source.activePlanIds, `Actor ${index + 1} activePlanIds`, blockers, 1_000, false),
    blockedPlanIds: ids(source.blockedPlanIds, `Actor ${index + 1} blockedPlanIds`, blockers, 1_000, false),
    nextLikelyActionIds: ids(source.nextLikelyActionIds, `Actor ${index + 1} nextLikelyActionIds`, blockers, 1_000, false),
    historicalConstraintIds: ids(source.historicalConstraintIds, `Actor ${index + 1} historicalConstraintIds`, blockers, 1_000, false),
    evidenceIds: ids(source.evidenceIds, `Actor ${index + 1} evidenceIds`, blockers, 1_000, true),
  };
}
function parseKnowledge(value: unknown, index: number, blockers: string[]): BookWorldKnowledgeV1 {
  const source = object(value, `Knowledge ${index + 1}`, blockers);
  const sourceActorId = optionalId(source.sourceActorId, `Knowledge ${index + 1} sourceActorId`, blockers);
  const sourceEventId = optionalId(source.sourceEventId, `Knowledge ${index + 1} sourceEventId`, blockers);
  return {
    knowledgeId: id(source.knowledgeId, `Knowledge ${index + 1} knowledgeId`, blockers),
    actorId: id(source.actorId, `Knowledge ${index + 1} actorId`, blockers),
    subjectId: id(source.subjectId, `Knowledge ${index + 1} subjectId`, blockers),
    state: enumValue(source.state, KNOWLEDGE_STATES, `Knowledge ${index + 1} state`, blockers, "does_not_know"),
    acquiredAtSequence: integer(source.acquiredAtSequence, `Knowledge ${index + 1} acquiredAtSequence`, blockers, 0, Number.MAX_SAFE_INTEGER),
    ...(sourceActorId === undefined ? {} : { sourceActorId }),
    ...(sourceEventId === undefined ? {} : { sourceEventId }),
    reliability: finite(source.reliability, `Knowledge ${index + 1} reliability`, blockers, 0, 1),
    visibleToReader: bool(source.visibleToReader, `Knowledge ${index + 1} visibleToReader`, blockers),
    evidenceIds: ids(source.evidenceIds, `Knowledge ${index + 1} evidenceIds`, blockers, 1_000, true),
  };
}
function parsePlan(value: unknown, index: number, blockers: string[]): BookWorldPlanV1 {
  const source = object(value, `Plan ${index + 1}`, blockers);
  const deadline = optionalInteger(source.deadlineSequence, `Plan ${index + 1} deadlineSequence`, blockers);
  return {
    planId: id(source.planId, `Plan ${index + 1} planId`, blockers), ownerActorId: id(source.ownerActorId, `Plan ${index + 1} ownerActorId`, blockers),
    objective: text(source.objective, `Plan ${index + 1} objective`, blockers, 2_000), currentStep: text(source.currentStep, `Plan ${index + 1} currentStep`, blockers, 2_000),
    requiredLocationIds: ids(source.requiredLocationIds, `Plan ${index + 1} requiredLocationIds`, blockers, 1_000, false),
    requiredResourceIds: ids(source.requiredResourceIds, `Plan ${index + 1} requiredResourceIds`, blockers, 1_000, false),
    dependencyPlanIds: ids(source.dependencyPlanIds, `Plan ${index + 1} dependencyPlanIds`, blockers, 1_000, false),
    oppositionActorIds: ids(source.oppositionActorIds, `Plan ${index + 1} oppositionActorIds`, blockers, 1_000, false),
    ...(deadline === undefined ? {} : { deadlineSequence: deadline }),
    successConsequenceIds: ids(source.successConsequenceIds, `Plan ${index + 1} successConsequenceIds`, blockers, 1_000, false),
    failureConsequenceIds: ids(source.failureConsequenceIds, `Plan ${index + 1} failureConsequenceIds`, blockers, 1_000, false),
    concealedFromActorIds: ids(source.concealedFromActorIds, `Plan ${index + 1} concealedFromActorIds`, blockers, 1_000, false),
    state: enumValue(source.state, new Set(["forming", "active", "blocked", "abandoned", "completed"]), `Plan ${index + 1} state`, blockers, "forming"),
  };
}
function parseEvent(value: unknown, index: number, blockers: string[]): BookWorldEventV1 {
  const source = object(value, `Event ${index + 1}`, blockers);
  return {
    eventId: id(source.eventId, `Event ${index + 1} eventId`, blockers), title: text(source.title, `Event ${index + 1} title`, blockers, 500),
    startSequence: integer(source.startSequence, `Event ${index + 1} startSequence`, blockers, 0, Number.MAX_SAFE_INTEGER),
    endSequence: integer(source.endSequence, `Event ${index + 1} endSequence`, blockers, 0, Number.MAX_SAFE_INTEGER),
    locationIds: ids(source.locationIds, `Event ${index + 1} locationIds`, blockers, 1_000, true),
    participantActorIds: ids(source.participantActorIds, `Event ${index + 1} participantActorIds`, blockers, 1_000, false),
    causalEventIds: ids(source.causalEventIds, `Event ${index + 1} causalEventIds`, blockers, 1_000, false),
    enablingPlanIds: ids(source.enablingPlanIds, `Event ${index + 1} enablingPlanIds`, blockers, 1_000, false),
    historicalEventIds: ids(source.historicalEventIds, `Event ${index + 1} historicalEventIds`, blockers, 1_000, false),
    state: enumValue(source.state, EVENT_STATES, `Event ${index + 1} state`, blockers, "planned"),
    publicOutcome: text(source.publicOutcome, `Event ${index + 1} publicOutcome`, blockers, 4_000, true),
    hiddenOutcome: text(source.hiddenOutcome, `Event ${index + 1} hiddenOutcome`, blockers, 4_000, true),
    consequenceIds: ids(source.consequenceIds, `Event ${index + 1} consequenceIds`, blockers, 1_000, false),
    evidenceIds: ids(source.evidenceIds, `Event ${index + 1} evidenceIds`, blockers, 1_000, true),
  };
}
function parseResearch(value: unknown, index: number, blockers: string[]): BookResearchClaimV1 {
  const source = object(value, `Research claim ${index + 1}`, blockers);
  const verified = optionalTimestamp(source.lastVerifiedAt, `Research claim ${index + 1} lastVerifiedAt`, blockers);
  return {
    claimId: id(source.claimId, `Research claim ${index + 1} claimId`, blockers), subjectIds: ids(source.subjectIds, `Research claim ${index + 1} subjectIds`, blockers, 1_000, true),
    claim: text(source.claim, `Research claim ${index + 1} claim`, blockers, 8_000), status: enumValue(source.status, CLAIM_STATUSES, `Research claim ${index + 1} status`, blockers, "not_yet_researched"),
    sourceEvidenceIds: ids(source.sourceEvidenceIds, `Research claim ${index + 1} sourceEvidenceIds`, blockers, 1_000, false),
    sourceAuthorityIds: ids(source.sourceAuthorityIds, `Research claim ${index + 1} sourceAuthorityIds`, blockers, 1_000, false),
    affectedVolumeIds: ids(source.affectedVolumeIds, `Research claim ${index + 1} affectedVolumeIds`, blockers, 256, false),
    affectedUnitIds: ids(source.affectedUnitIds, `Research claim ${index + 1} affectedUnitIds`, blockers, MAX_RECORDS, false),
    permissibleInference: text(source.permissibleInference, `Research claim ${index + 1} permissibleInference`, blockers, 4_000, true),
    uncertainty: text(source.uncertainty, `Research claim ${index + 1} uncertainty`, blockers, 4_000, true),
    ...(verified === undefined ? {} : { lastVerifiedAt: verified }),
  };
}
function parseCanon(value: unknown, index: number, blockers: string[]): BookCanonRecordV1 {
  const source = object(value, `Canon ${index + 1}`, blockers);
  const supersedes = optionalId(source.supersedesCanonId, `Canon ${index + 1} supersedesCanonId`, blockers);
  return {
    canonId: id(source.canonId, `Canon ${index + 1} canonId`, blockers), kind: enumValue(source.kind, CANON_KINDS, `Canon ${index + 1} kind`, blockers, "fact"),
    subjectIds: ids(source.subjectIds, `Canon ${index + 1} subjectIds`, blockers, 1_000, true), value: text(source.value, `Canon ${index + 1} value`, blockers, 8_000),
    establishedVolumeId: id(source.establishedVolumeId, `Canon ${index + 1} establishedVolumeId`, blockers), establishedUnitId: id(source.establishedUnitId, `Canon ${index + 1} establishedUnitId`, blockers),
    establishedSequence: integer(source.establishedSequence, `Canon ${index + 1} establishedSequence`, blockers, 0, Number.MAX_SAFE_INTEGER),
    sourceEvidenceIds: ids(source.sourceEvidenceIds, `Canon ${index + 1} sourceEvidenceIds`, blockers, 1_000, true),
    ...(supersedes === undefined ? {} : { supersedesCanonId: supersedes }), mutable: bool(source.mutable, `Canon ${index + 1} mutable`, blockers),
    status: enumValue(source.status, new Set(["active", "superseded", "deliberately_ambiguous"]), `Canon ${index + 1} status`, blockers, "active"),
  };
}
function parseArc(value: unknown, index: number, blockers: string[]): BookArcRecordV1 {
  const source = object(value, `Arc ${index + 1}`, blockers);
  const pressureStages = array(source.pressureStages, `Arc ${index + 1} pressureStages`, blockers, 0, 1_000).map((value, stageIndex) => {
    const stage = object(value, `Arc ${index + 1} stage ${stageIndex + 1}`, blockers);
    return {
      volumeId: id(stage.volumeId, `Arc ${index + 1} stage ${stageIndex + 1} volumeId`, blockers),
      unitIds: ids(stage.unitIds, `Arc ${index + 1} stage ${stageIndex + 1} unitIds`, blockers, MAX_RECORDS, true),
      pressure: text(stage.pressure, `Arc ${index + 1} stage ${stageIndex + 1} pressure`, blockers, 4_000),
      choice: text(stage.choice, `Arc ${index + 1} stage ${stageIndex + 1} choice`, blockers, 4_000),
      consequence: text(stage.consequence, `Arc ${index + 1} stage ${stageIndex + 1} consequence`, blockers, 4_000),
      evidenceIds: ids(stage.evidenceIds, `Arc ${index + 1} stage ${stageIndex + 1} evidenceIds`, blockers, 1_000, true),
    };
  });
  return {
    arcId: id(source.arcId, `Arc ${index + 1} arcId`, blockers), kind: enumValue(source.kind, ARC_KINDS, `Arc ${index + 1} kind`, blockers, "character"),
    title: text(source.title, `Arc ${index + 1} title`, blockers, 500), volumeIds: ids(source.volumeIds, `Arc ${index + 1} volumeIds`, blockers, 256, true),
    participantIds: ids(source.participantIds, `Arc ${index + 1} participantIds`, blockers, 1_000, true), openingState: text(source.openingState, `Arc ${index + 1} openingState`, blockers, 4_000),
    pressureStages, intendedEndState: text(source.intendedEndState, `Arc ${index + 1} intendedEndState`, blockers, 4_000), currentState: text(source.currentState, `Arc ${index + 1} currentState`, blockers, 4_000),
    irreversibleChangeIds: ids(source.irreversibleChangeIds, `Arc ${index + 1} irreversibleChangeIds`, blockers, 1_000, false),
    unresolvedQuestionIds: ids(source.unresolvedQuestionIds, `Arc ${index + 1} unresolvedQuestionIds`, blockers, 1_000, false),
    status: enumValue(source.status, new Set(["planned", "active", "transformed", "resolved", "deliberately_open"]), `Arc ${index + 1} status`, blockers, "planned"),
  };
}
function parseSetup(value: unknown, index: number, blockers: string[]): BookSetupPayoffV1 {
  const source = object(value, `Setup ${index + 1}`, blockers);
  const payoffVolumeId = optionalId(source.payoffVolumeId, `Setup ${index + 1} payoffVolumeId`, blockers);
  return {
    setupId: id(source.setupId, `Setup ${index + 1} setupId`, blockers), setupVolumeId: id(source.setupVolumeId, `Setup ${index + 1} setupVolumeId`, blockers),
    setupUnitIds: ids(source.setupUnitIds, `Setup ${index + 1} setupUnitIds`, blockers, MAX_RECORDS, true), setupDescription: text(source.setupDescription, `Setup ${index + 1} setupDescription`, blockers, 4_000),
    readerExpectation: text(source.readerExpectation, `Setup ${index + 1} readerExpectation`, blockers, 4_000), hiddenTruth: text(source.hiddenTruth, `Setup ${index + 1} hiddenTruth`, blockers, 4_000, true),
    eligiblePayoffVolumeIds: ids(source.eligiblePayoffVolumeIds, `Setup ${index + 1} eligiblePayoffVolumeIds`, blockers, 256, true),
    ...(payoffVolumeId === undefined ? {} : { payoffVolumeId }), payoffUnitIds: ids(source.payoffUnitIds, `Setup ${index + 1} payoffUnitIds`, blockers, MAX_RECORDS, false),
    payoffKind: enumValue(source.payoffKind, new Set(["reveal", "reversal", "choice", "consequence", "echo", "deliberate_nonresolution"]), `Setup ${index + 1} payoffKind`, blockers, "reveal"),
    causalBridgeIds: ids(source.causalBridgeIds, `Setup ${index + 1} causalBridgeIds`, blockers, 1_000, false), evidenceIds: ids(source.evidenceIds, `Setup ${index + 1} evidenceIds`, blockers, 1_000, true),
    status: enumValue(source.status, new Set(["seeded", "developing", "paid_off", "reframed", "deliberately_open"]), `Setup ${index + 1} status`, blockers, "seeded"),
  };
}

function result(status: BookStoryValidationResultV1["status"], storyState: BookStoryStateV1 | undefined, blockers: string[], actions: string[], invalid: InvalidIds): BookStoryValidationResultV1 {
  return {
    outputKind: "evavo_docs_book_story_validation", schemaVersion: 1, status,
    ...(storyState === undefined ? {} : { storyState, storyStateFingerprint: storyState.storyStateFingerprint }),
    blockers: unique(blockers), requiredActions: unique(actions),
    invalidLocationIds: unique(invalid.invalidLocationIds), invalidActorIds: unique(invalid.invalidActorIds),
    invalidKnowledgeIds: unique(invalid.invalidKnowledgeIds), invalidPlanIds: unique(invalid.invalidPlanIds),
    invalidEventIds: unique(invalid.invalidEventIds), invalidResearchClaimIds: unique(invalid.invalidResearchClaimIds),
    invalidCanonIds: unique(invalid.invalidCanonIds), invalidArcIds: unique(invalid.invalidArcIds), danglingSetupIds: unique(invalid.danglingSetupIds),
    canonicalAdmissionAllowed: false, canonicalManuscriptMutationPerformed: false, publicationPerformed: false,
  };
}
function addInvalidActions(invalid: InvalidIds, actions: string[]): void {
  const labels: Array<[keyof InvalidIds, string]> = [
    ["invalidLocationIds", "invalid locations"], ["invalidActorIds", "invalid actors"], ["invalidKnowledgeIds", "impossible knowledge"],
    ["invalidPlanIds", "invalid plans"], ["invalidEventIds", "timeline, causality or event references"],
    ["invalidResearchClaimIds", "unsupported research claims"], ["invalidCanonIds", "unsupported or contradictory canon"],
    ["invalidArcIds", "incomplete cross-volume arcs"], ["danglingSetupIds", "dangling setups or payoffs"],
  ];
  for (const [key, label] of labels) if (invalid[key].length) actions.push(`Repair ${label}: ${unique(invalid[key]).join(", ")}.`);
}
function object(value: unknown, label: string, blockers: string[]): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) { blockers.push(`${label} must be an object.`); return {}; }
  return value as RecordValue;
}
function array(value: unknown, label: string, blockers: string[], minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) { blockers.push(`${label} must contain ${minimum}-${maximum} records.`); return []; }
  return value;
}
function id(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !SAFE_ID.test(value) || ["__proto__", "constructor", "prototype"].includes(value)) { blockers.push(`${label} is invalid.`); return "invalid-id"; }
  return value;
}
function optionalId(value: unknown, label: string, blockers: string[]): string | undefined { return value === undefined || value === null || value === "" ? undefined : id(value, label, blockers); }
function ids(value: unknown, label: string, blockers: string[], maximum: number, required: boolean): string[] {
  if (!Array.isArray(value) || value.length > maximum || (required && value.length < 1)) { blockers.push(`${label} is invalid or unbounded.`); return []; }
  const result = value.map((item) => id(item, label, blockers));
  uniqueSet(result, label, blockers);
  return unique(result).sort();
}
function enumIds<T extends string>(value: unknown, allowed: Set<T>, label: string, blockers: string[], required: boolean): T[] {
  if (!Array.isArray(value) || value.length > 32 || (required && value.length < 1)) { blockers.push(`${label} is invalid.`); return []; }
  const result = value.map((item) => enumValue(item, allowed, label, blockers, [...allowed][0] as T));
  uniqueSet(result, label, blockers);
  return unique(result).sort();
}
function enumValue<T extends string>(value: unknown, allowed: Set<T>, label: string, blockers: string[], fallback: T): T {
  if (typeof value !== "string" || !allowed.has(value as T)) { blockers.push(`${label} is unsupported.`); return fallback; }
  return value as T;
}
function text(value: unknown, label: string, blockers: string[], maximum: number, allowEmpty = false): string {
  if (typeof value !== "string" || value !== value.trim() || value.length > maximum || (!allowEmpty && !value.length) || /[\u0000-\u001f\u007f]/.test(value)) { blockers.push(`${label} is invalid.`); return allowEmpty ? "" : "invalid"; }
  return value;
}
function digest(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !SHA256.test(value)) { blockers.push(`${label} must be an exact sha256 digest.`); return `sha256:${"0".repeat(64)}`; }
  return value;
}
function integer(value: unknown, label: string, blockers: string[], minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) { blockers.push(`${label} is invalid.`); return minimum; }
  return Number(value);
}
function optionalInteger(value: unknown, label: string, blockers: string[]): number | undefined { return value === undefined ? undefined : integer(value, label, blockers, 0, Number.MAX_SAFE_INTEGER); }
function finite(value: unknown, label: string, blockers: string[], minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) { blockers.push(`${label} is invalid.`); return minimum; }
  return value;
}
function bool(value: unknown, label: string, blockers: string[]): boolean { if (value !== true && value !== false) { blockers.push(`${label} must be boolean.`); return false; } return value; }
function optionalTimestamp(value: unknown, label: string, blockers: string[]): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value) || Number.isNaN(Date.parse(value))) { blockers.push(`${label} must be canonical UTC ISO-8601.`); return undefined; }
  return value;
}
function uniqueSet(values: string[], label: string, blockers: string[]): Set<string> {
  const result = new Set<string>(); const duplicates = new Set<string>();
  for (const value of values) result.has(value) ? duplicates.add(value) : result.add(value);
  if (duplicates.size) blockers.push(`${label} contain duplicates: ${[...duplicates].sort().join(", ")}.`);
  return result;
}
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function sort<T>(values: T[], key: keyof T): T[] { return [...values].sort((a, b) => String(a[key]).localeCompare(String(b[key]))); }
