import assert from "node:assert/strict";
import test from "node:test";

import { validateAndNormalizeBookStoryState } from "../src/index.ts";

const sha = (character) => `sha256:${character.repeat(64)}`;

function minimal(overrides = {}) {
  return {
    outputKind: "evavo_docs_book_story_state",
    schemaVersion: 1,
    contract: "evavo_docs_book_story_v1",
    authorityMode: "shadow_migration",
    storyStateId: "story:minimal",
    projectId: "project:minimal",
    programmeId: "programme:minimal",
    projectFingerprint: sha("a"),
    providerIds: ["chatgpt", "claude"],
    volumes: [{
      volumeId: "book-1", sequence: 1, manuscriptRevisionId: "revision:book-1:1",
      manuscriptSha256: sha("b"), canonicalUnitIds: ["unit:book-1:1"],
      startSequence: 0, endSequence: 1, status: "canonical",
    }],
    currentSequence: 1,
    locations: [{
      locationId: "location:one", name: "One location", travelConstraintIds: [],
      accessRuleIds: [], activeConditionIds: [], evidenceIds: ["evidence:location"],
    }],
    actors: [{
      actorId: "actor:one", kind: "character", name: "One actor", currentLocationId: "location:one",
      availableFromSequence: 0, publicGoalIds: ["goal:one"], privateGoalIds: [], fearIds: [],
      obligationIds: [], secretIds: [], resourceIds: [], relationshipStateIds: [], injuryOrFatigueIds: [],
      activePlanIds: ["plan:one"], blockedPlanIds: [], nextLikelyActionIds: ["action:one"],
      historicalConstraintIds: [], evidenceIds: ["evidence:actor"],
    }],
    knowledge: [],
    plans: [{
      planId: "plan:one", ownerActorId: "actor:one", objective: "Act", currentStep: "Begin",
      requiredLocationIds: ["location:one"], requiredResourceIds: [], dependencyPlanIds: [],
      oppositionActorIds: [], successConsequenceIds: ["consequence:success"],
      failureConsequenceIds: ["consequence:failure"], concealedFromActorIds: [], state: "active",
    }],
    events: [{
      eventId: "event:one", title: "One event", startSequence: 0, endSequence: 1,
      locationIds: ["location:one"], participantActorIds: ["actor:one"], causalEventIds: [],
      enablingPlanIds: ["plan:one"], historicalEventIds: [], state: "completed",
      publicOutcome: "Done", hiddenOutcome: "", consequenceIds: ["consequence:success"],
      evidenceIds: ["evidence:event"],
    }],
    researchClaims: [],
    canon: [{
      canonId: "canon:one", kind: "fact", subjectIds: ["subject:one"], value: "One fact",
      establishedVolumeId: "book-1", establishedUnitId: "unit:book-1:1", establishedSequence: 1,
      sourceEvidenceIds: ["evidence:canon"], mutable: false, status: "active",
    }],
    arcs: [], setupsAndPayoffs: [], unresolvedActorLocationIds: [], unresolvedKnowledgeLeakIds: [],
    unresolvedTimelineConflictIds: [], unresolvedTravelConflictIds: [], unresolvedMotivationGapIds: [],
    unresolvedCoincidenceIds: [], unresolvedOffPageEventIds: [], continuityConflictIds: [],
    forgottenConsequenceIds: [], repeatedArcIds: [], genericSeriesPatternIds: [],
    requiredIndependentReviewIds: ["review:one"], completedIndependentReviewIds: ["review:one"],
    evidenceIds: ["evidence:story"], checkpointId: "checkpoint:one",
    canonicalAdmissionAllowed: false, canonicalManuscriptMutationPerformed: false,
    websiteCompatibilityRuntimeStillAuthoritative: true, dualAuthoritativeWritesAllowed: false,
    runtimeCutoverApproved: false, publicationPerformed: false, ...overrides,
  };
}

test("blocks malformed project and programme identity before normalization", async () => {
  const result = await validateAndNormalizeBookStoryState(minimal({
    projectId: "../unsafe", programmeId: "constructor", projectFingerprint: "not-a-sha",
  }));
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((item) => item.includes("projectId is invalid")));
  assert.ok(result.blockers.some((item) => item.includes("programmeId is invalid")));
  assert.ok(result.blockers.some((item) => item.includes("projectFingerprint")));
  assert.equal(result.storyState, undefined);
});

test("blocks duplicate or unsupported providers before normalization", async () => {
  const duplicate = await validateAndNormalizeBookStoryState(minimal({ providerIds: ["chatgpt", "chatgpt"] }));
  assert.equal(duplicate.status, "blocked");
  assert.ok(duplicate.blockers.some((item) => item.includes("providerIds must not contain duplicates")));
  const unsupported = await validateAndNormalizeBookStoryState(minimal({ providerIds: ["unknown-provider"] }));
  assert.equal(unsupported.status, "blocked");
  assert.ok(unsupported.blockers.some((item) => item.includes("unsupported provider")));
});

test("blocks malformed checkpoint and evidence authority before normalization", async () => {
  const result = await validateAndNormalizeBookStoryState(minimal({
    checkpointId: "__proto__", evidenceIds: ["evidence:story", "evidence:story"],
  }));
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((item) => item.includes("checkpointId is invalid")));
  assert.ok(result.blockers.some((item) => item.includes("evidenceIds must not contain duplicates")));
});
