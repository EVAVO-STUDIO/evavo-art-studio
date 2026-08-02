import assert from "node:assert/strict";
import test from "node:test";

import {
  fingerprintLegacyWebsiteBookStoryImportSource,
  importLegacyWebsiteBookStoryState,
  validateAndNormalizeBookStoryState,
} from "../src/index.ts";

const sha = (character) => `sha256:${character.repeat(64)}`;

function state(overrides = {}) {
  return {
    outputKind: "evavo_docs_book_story_state",
    schemaVersion: 1,
    contract: "evavo_docs_book_story_v1",
    authorityMode: "shadow_migration",
    storyStateId: "story:wren",
    projectId: "project:wren",
    programmeId: "programme:wren",
    projectFingerprint: sha("a"),
    providerIds: ["chatgpt", "claude", "other_compatible_model"],
    volumes: [
      {
        volumeId: "book-1", sequence: 1, manuscriptRevisionId: "revision:book-1:1",
        manuscriptSha256: sha("1"), canonicalUnitIds: ["unit:book-1:1", "unit:book-1:2"],
        startSequence: 0, endSequence: 100, status: "canonical",
      },
      {
        volumeId: "book-2", sequence: 2, manuscriptRevisionId: "revision:book-2:1",
        manuscriptSha256: sha("2"), canonicalUnitIds: ["unit:book-2:1", "unit:book-2:2"],
        startSequence: 101, endSequence: 200, status: "editing",
      },
    ],
    currentSequence: 150,
    locations: [
      {
        locationId: "location:harbour", name: "The harbour", travelConstraintIds: ["travel:tide"],
        accessRuleIds: [], activeConditionIds: ["condition:storm"], evidenceIds: ["evidence:location:harbour"],
      },
      {
        locationId: "location:archive", name: "The archive", parentLocationId: "location:harbour",
        historicalPlaceId: "place:archive", travelConstraintIds: [], accessRuleIds: ["access:keeper"],
        activeConditionIds: [], evidenceIds: ["evidence:location:archive"],
      },
    ],
    actors: [
      {
        actorId: "actor:wren", kind: "character", name: "Wren", currentLocationId: "location:archive",
        availableFromSequence: 0, publicGoalIds: ["goal:report"], privateGoalIds: ["goal:truth"],
        fearIds: ["fear:repetition"], obligationIds: ["obligation:record"], secretIds: [], resourceIds: ["resource:notebook"],
        relationshipStateIds: ["relationship:wren-rowan"], injuryOrFatigueIds: [], activePlanIds: ["plan:wren-record"],
        blockedPlanIds: [], nextLikelyActionIds: ["action:inspect"], historicalConstraintIds: ["history:procedure"],
        evidenceIds: ["evidence:actor:wren"],
      },
      {
        actorId: "actor:rowan", kind: "character", name: "Rowan", currentLocationId: "location:harbour",
        availableFromSequence: 0, publicGoalIds: ["goal:protect"], privateGoalIds: [], fearIds: [], obligationIds: [],
        secretIds: ["secret:copy"], resourceIds: [], relationshipStateIds: ["relationship:wren-rowan"],
        injuryOrFatigueIds: [], activePlanIds: ["plan:rowan-protect"], blockedPlanIds: [],
        nextLikelyActionIds: ["action:warn"], historicalConstraintIds: [], evidenceIds: ["evidence:actor:rowan"],
      },
    ],
    knowledge: [
      {
        knowledgeId: "knowledge:wren-ledger", actorId: "actor:wren", subjectId: "subject:ledger",
        state: "knows", acquiredAtSequence: 120, sourceActorId: "actor:rowan", sourceEventId: "event:archive-find",
        reliability: 0.9, visibleToReader: true, evidenceIds: ["evidence:knowledge:wren-ledger"],
      },
    ],
    plans: [
      {
        planId: "plan:wren-record", ownerActorId: "actor:wren", objective: "Establish the true record",
        currentStep: "Inspect the surviving ledger", requiredLocationIds: ["location:archive"],
        requiredResourceIds: ["resource:notebook"], dependencyPlanIds: [], oppositionActorIds: [],
        deadlineSequence: 180, successConsequenceIds: ["consequence:record-corrected"],
        failureConsequenceIds: ["consequence:false-record"], concealedFromActorIds: [], state: "active",
      },
      {
        planId: "plan:rowan-protect", ownerActorId: "actor:rowan", objective: "Protect Wren from the copied accusation",
        currentStep: "Warn Wren", requiredLocationIds: ["location:harbour"], requiredResourceIds: [],
        dependencyPlanIds: [], oppositionActorIds: [], successConsequenceIds: ["consequence:warning"],
        failureConsequenceIds: ["consequence:ambush"], concealedFromActorIds: ["actor:wren"], state: "active",
      },
    ],
    events: [
      {
        eventId: "event:archive-find", title: "The ledger is found", startSequence: 115, endSequence: 120,
        locationIds: ["location:archive"], participantActorIds: ["actor:wren", "actor:rowan"], causalEventIds: [],
        enablingPlanIds: ["plan:wren-record"], historicalEventIds: [], state: "completed",
        publicOutcome: "A damaged ledger is logged.", hiddenOutcome: "The copied page survives elsewhere.",
        consequenceIds: ["consequence:record-corrected"], evidenceIds: ["evidence:event:archive-find"],
      },
    ],
    researchClaims: [
      {
        claimId: "claim:procedure", subjectIds: ["subject:procedure"], claim: "The record follows the reviewed local procedure.",
        status: "verified", sourceEvidenceIds: ["source:procedure"], sourceAuthorityIds: ["authority:procedure"],
        affectedVolumeIds: ["book-1", "book-2"], affectedUnitIds: ["unit:book-1:2", "unit:book-2:1"],
        permissibleInference: "Characters may misunderstand the process.", uncertainty: "",
        lastVerifiedAt: "2026-08-02T00:00:00.000Z",
      },
    ],
    canon: [
      {
        canonId: "canon:ledger", kind: "object", subjectIds: ["subject:ledger"], value: "The ledger is damaged but legible.",
        establishedVolumeId: "book-1", establishedUnitId: "unit:book-1:2", establishedSequence: 120,
        sourceEvidenceIds: ["evidence:canon:ledger"], mutable: false, status: "active",
      },
    ],
    arcs: [
      {
        arcId: "arc:wren-responsibility", kind: "character", title: "Responsibility for the record",
        volumeIds: ["book-1", "book-2"], participantIds: ["actor:wren"], openingState: "Wren avoids public responsibility.",
        pressureStages: [
          { volumeId: "book-1", unitIds: ["unit:book-1:2"], pressure: "The omission becomes material.", choice: "Wren keeps the private copy.", consequence: "The public record remains incomplete.", evidenceIds: ["evidence:arc:1"] },
          { volumeId: "book-2", unitIds: ["unit:book-2:1"], pressure: "The bad copy travels.", choice: "Wren corrects the public record.", consequence: "Responsibility becomes public.", evidenceIds: ["evidence:arc:2"] },
        ],
        intendedEndState: "Wren signs a true but unclean account.", currentState: "Wren accepts public consequence.",
        irreversibleChangeIds: ["change:wren-public"], unresolvedQuestionIds: ["question:cost"], status: "active",
      },
    ],
    setupsAndPayoffs: [
      {
        setupId: "setup:copy", setupVolumeId: "book-1", setupUnitIds: ["unit:book-1:1"],
        setupDescription: "A copied page leaves the archive.", readerExpectation: "The copy will affect the record.",
        hiddenTruth: "The copy is incomplete.", eligiblePayoffVolumeIds: ["book-2"], payoffVolumeId: "book-2",
        payoffUnitIds: ["unit:book-2:1"], payoffKind: "consequence", causalBridgeIds: ["bridge:copy-travel"],
        evidenceIds: ["evidence:setup:copy"], status: "paid_off",
      },
    ],
    unresolvedActorLocationIds: [], unresolvedKnowledgeLeakIds: [], unresolvedTimelineConflictIds: [],
    unresolvedTravelConflictIds: [], unresolvedMotivationGapIds: [], unresolvedCoincidenceIds: [],
    unresolvedOffPageEventIds: [], continuityConflictIds: [], forgottenConsequenceIds: [], repeatedArcIds: [],
    genericSeriesPatternIds: [], requiredIndependentReviewIds: ["review:story"],
    completedIndependentReviewIds: ["review:story"], evidenceIds: ["evidence:story-state"],
    checkpointId: "checkpoint:story:1", canonicalAdmissionAllowed: false,
    canonicalManuscriptMutationPerformed: false, websiteCompatibilityRuntimeStillAuthoritative: true,
    dualAuthoritativeWritesAllowed: false, runtimeCutoverApproved: false, publicationPerformed: false,
    ...overrides,
  };
}

test("normalizes deterministic story, world, research, canon and series state", async () => {
  const first = await validateAndNormalizeBookStoryState(state());
  const reversed = state({
    locations: [...state().locations].reverse(), actors: [...state().actors].reverse(),
    plans: [...state().plans].reverse(), volumes: [...state().volumes].reverse(),
  });
  const second = await validateAndNormalizeBookStoryState(reversed);
  assert.equal(first.status, "ready", first.blockers.join("\n"));
  assert.equal(first.storyStateFingerprint, second.storyStateFingerprint);
  assert.deepEqual(first.storyState.volumes.map((item) => item.volumeId), ["book-1", "book-2"]);
  assert.deepEqual(first.storyState.providerIds, ["chatgpt", "claude", "other_compatible_model"]);
  assert.equal(first.storyState.canonicalAdmissionAllowed, false);
  assert.equal(first.storyState.canonicalManuscriptMutationPerformed, false);
  assert.equal(first.storyState.publicationPerformed, false);
});

test("blocks impossible actor locations and impossible knowledge", async () => {
  const value = state();
  value.actors[0].currentLocationId = "location:missing";
  value.knowledge[0].acquiredAtSequence = 999;
  const result = await validateAndNormalizeBookStoryState(value);
  assert.equal(result.status, "needs_work");
  assert.deepEqual(result.invalidActorIds, ["actor:wren"]);
  assert.deepEqual(result.invalidKnowledgeIds, ["knowledge:wren-ledger"]);
});

test("blocks invalid event, plan and research references", async () => {
  const value = state();
  value.events[0].participantActorIds = ["actor:missing"];
  value.plans[0].requiredLocationIds = ["location:missing"];
  value.researchClaims[0].affectedUnitIds = ["unit:missing"];
  const result = await validateAndNormalizeBookStoryState(value);
  assert.equal(result.status, "needs_work");
  assert.deepEqual(result.invalidEventIds, ["event:archive-find"]);
  assert.deepEqual(result.invalidPlanIds, ["plan:wren-record"]);
  assert.deepEqual(result.invalidResearchClaimIds, ["claim:procedure"]);
});

test("blocks invalid canon, incomplete arc progression and dangling payoff", async () => {
  const value = state();
  value.canon[0].establishedUnitId = "unit:missing";
  value.arcs[0].pressureStages = value.arcs[0].pressureStages.slice(0, 1);
  value.setupsAndPayoffs[0].payoffUnitIds = [];
  const result = await validateAndNormalizeBookStoryState(value);
  assert.equal(result.status, "needs_work");
  assert.deepEqual(result.invalidCanonIds, ["canon:ledger"]);
  assert.deepEqual(result.invalidArcIds, ["arc:wren-responsibility"]);
  assert.deepEqual(result.danglingSetupIds, ["setup:copy"]);
});

test("retains unresolved continuity and review work as needs-work rather than approved canon", async () => {
  const result = await validateAndNormalizeBookStoryState(state({
    continuityConflictIds: ["conflict:timeline"],
    completedIndependentReviewIds: [],
  }));
  assert.equal(result.status, "needs_work");
  assert.ok(result.requiredActions.some((item) => item.includes("continuityConflictIds")));
  assert.ok(result.requiredActions.some((item) => item.includes("independent story and continuity reviews")));
  assert.equal(result.canonicalAdmissionAllowed, false);
});

test("rejects duplicate identities and unsafe authority flags", async () => {
  const value = state();
  value.locations.push(structuredClone(value.locations[0]));
  value.runtimeCutoverApproved = true;
  const result = await validateAndNormalizeBookStoryState(value);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((item) => item.includes("location IDs contain duplicates")));
  assert.ok(result.blockers.some((item) => item.includes("runtimeCutoverApproved")));
});

test("imports exact Website story state without persistence or canonical mutation", async () => {
  const input = {
    outputKind: "evavo_legacy_website_book_story_import_input", schemaVersion: 1,
    sourceRepository: "EVAVO-STUDIO/Website", sourceCommit: "a".repeat(40),
    sourcePath: "tools/evavo-doc-studio/storage/book-story/wren.json", sourceGitBlobSha1: "b".repeat(40),
    sourceRecordFingerprint: sha("0"), legacyStoryState: state(),
    importedAt: "2026-08-02T07:00:00.000Z", importedBy: "Docs Suite migration worker",
  };
  input.sourceRecordFingerprint = await fingerprintLegacyWebsiteBookStoryImportSource(input);
  const result = await importLegacyWebsiteBookStoryState(input);
  assert.equal(result.status, "ready_for_shadow_import", result.blockers.join("\n"));
  assert.equal(result.storyStatePersisted, false);
  assert.equal(result.importedStoryState.authorityMode, "shadow_migration");
  assert.equal(result.canonicalManuscriptMutationPerformed, false);
  assert.equal(result.publicationPerformed, false);
});

test("retains unresolved Website story state for resolution and rejects tampered source evidence", async () => {
  const input = {
    outputKind: "evavo_legacy_website_book_story_import_input", schemaVersion: 1,
    sourceRepository: "EVAVO-STUDIO/Website", sourceCommit: "a".repeat(40),
    sourcePath: "tools/evavo-doc-studio/storage/book-story/wren.json", sourceGitBlobSha1: "b".repeat(40),
    sourceRecordFingerprint: sha("0"), legacyStoryState: state({ continuityConflictIds: ["conflict:one"] }),
    importedAt: "2026-08-02T07:00:00.000Z", importedBy: "Docs Suite migration worker",
  };
  input.sourceRecordFingerprint = await fingerprintLegacyWebsiteBookStoryImportSource(input);
  const unresolved = await importLegacyWebsiteBookStoryState(input);
  assert.equal(unresolved.status, "needs_resolution");
  assert.ok(unresolved.requiredActions.length > 0);
  const tampered = structuredClone(input);
  tampered.importedBy = "Different actor";
  const blocked = await importLegacyWebsiteBookStoryState(tampered);
  assert.equal(blocked.status, "blocked");
  assert.ok(blocked.blockers.some((item) => item.includes("source fingerprint differs")));
});
