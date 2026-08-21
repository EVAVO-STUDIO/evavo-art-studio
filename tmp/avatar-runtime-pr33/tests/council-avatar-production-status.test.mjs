import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COUNCIL_AVATAR_AUTHORITATIVE_MEMBERS,
  COUNCIL_AVATAR_AUTHORITATIVE_PREFERENCES,
  COUNCIL_AVATAR_PRODUCTION_STANDARD,
  compileCouncilAvatarProductionStatus,
} from "../src/council-avatar-production-status.js";

const FALSE_AUTHORITY = Object.freeze({
  providerExecution: false,
  creativeApproval: false,
  identityApproval: false,
  candidatePromotion: false,
  productionAdmission: false,
  publication: false,
  runtimeActivation: false,
  websiteActivation: false,
  deployment: false,
});
const REVIEW_CLIPS = Object.freeze([
  ["top-hat-man", "idle-primary", 120, 337.5],
  ["eva-female", "idle-primary", 120, 334.25],
  ["council-critic", "idle-primary", 120, 342.5],
  ["council-open-reviewer", "idle-primary", 120, 335],
  ["nymm-guest-arbiter", "idle-primary", 120, 341.25],
  ["eva-female", "run-loop", 36, 334.25],
]);

function proceduralReviewManifest() {
  const clips = REVIEW_CLIPS.map(
    ([characterId, clipId, frameCount, pivotY]) => ({
      schema:
        "evavo.project-art-council-avatar-procedural-review-atlas-clip.v1",
      characterId,
      clipId,
      status: "procedural-review-atlas-not-production-approved",
      fps: 30,
      frameCount,
      loop: true,
      sourceCanvas: { width: 1024, height: 1536 },
      atlasFrameCanvas: { width: 256, height: 384 },
      pageSize: { width: 2048, height: 2048 },
      padding: 4,
      rotationAllowed: false,
      trimmed: true,
      stableBottomCentrePivot: true,
      pages: [
        {
          page: 0,
          path: `${characterId}/${clipId}/page-00.png`,
          width: 2048,
          height: 2048,
          sha256: "a".repeat(64),
        },
      ],
      frames: Array.from({ length: frameCount }, (_, frameIndex) => ({
        frameIndex,
        phase: frameIndex / frameCount,
        durationMs: 1000 / 30,
        sourceSize: { width: 256, height: 384 },
        sourceRect: { x: 20, y: 30, width: 1, height: 1 },
        drawOffset: { x: 20, y: 30 },
        pivot: { x: 128, y: pivotY },
        trimmedPixelSha256: "b".repeat(64),
        page: 0,
        atlasRect: {
          x: 4 + (frameIndex % 20) * 2,
          y: 4 + Math.floor(frameIndex / 20) * 2,
          width: 1,
          height: 1,
        },
      })),
      authority: { ...FALSE_AUTHORITY },
      metadataPath: `${characterId}/${clipId}/atlas.json`,
      metadataSha256: "c".repeat(64),
    }),
  );
  return {
    schema:
      "evavo.project-art-council-avatar-procedural-review-atlas-manifest.v1",
    status: "procedural-review-atlases-verified-not-production-approved",
    clips,
    summary: { clipCount: 6, frameCount: 636, pageCount: 6 },
    authority: { ...FALSE_AUTHORITY },
  };
}

test("Council avatar production truth matches the authoritative four-seat roster", () => {
  const status = compileCouncilAvatarProductionStatus();
  assert.equal(status.memberCount, 4);
  assert.deepEqual(
    COUNCIL_AVATAR_AUTHORITATIVE_MEMBERS.map((member) => member.id),
    ["architect", "critic", "researcher", "open-reviewer"],
  );
  assert.deepEqual(COUNCIL_AVATAR_AUTHORITATIVE_PREFERENCES, {
    architect: "top-hat-man",
    critic: "council-critic",
    researcher: "eva-female",
    "open-reviewer": "council-open-reviewer",
  });
  assert.equal(new Set(status.characters.map((item) => item.characterId)).size, 4);
  assert.equal(status.proceduralReview.available, false);
  assert.ok(
    status.characters.every(
      (character) => character.proceduralReview.available === false,
    ),
  );
});

test("current Runtime truth admits only EVA and Top Hat character packs", () => {
  const status = compileCouncilAvatarProductionStatus();
  assert.equal(status.assignmentPlan.assignedCount, 2);
  assert.equal(status.assignmentPlan.missingCharacterCount, 2);
  assert.deepEqual(status.identityMasterGenerationRequiredFor, [
    "council-critic",
    "council-open-reviewer",
  ]);
  assert.deepEqual(
    status.missingProductionRequests.map((request) => request.characterId),
    ["council-critic", "council-open-reviewer"],
  );
});

test("EVA and Top Hat cannot claim complete authored animation yet", () => {
  const status = compileCouncilAvatarProductionStatus();
  const eva = status.characters.find((item) => item.characterId === "eva-female");
  const topHat = status.characters.find((item) => item.characterId === "top-hat-man");
  assert.equal(eva.production.phase, "dense-bootstrap-incomplete");
  assert.equal(eva.production.requiredDenseFrameCount, 10);
  assert.equal(eva.production.completeAuthoredAnimationReady, false);
  assert.equal(topHat.production.phase, "pose-bank-incomplete");
  assert.equal(topHat.production.missingPoseSlotIds.length, 6);
  assert.equal(topHat.production.completeAuthoredAnimationReady, false);
  assert.equal(status.websiteMayClaimAllCouncilAvatarsProductionReady, false);
});

test("all four seats share the professional 749-image production standard", () => {
  const standard = COUNCIL_AVATAR_PRODUCTION_STANDARD;
  assert.deepEqual(standard.canvas, {
    width: 1024,
    height: 1536,
    alpha: "rgba8-straight",
  });
  assert.equal(standard.completeClipCount, 25);
  assert.equal(standard.fullCharacterFrameCount, 732);
  assert.equal(standard.registeredPoseLayerCount, 17);
  assert.equal(standard.totalPlannedImagesPerCharacter, 749);
  assert.equal(standard.minimumAuthoredFps, 24);
  assert.equal(standard.preferredAuthoredFps, 30);
  assert.equal(standard.displayTargetFps, 60);
  assert.equal(standard.sparsePoseApproximationMayClaimProductionAnimation, false);
  assert.equal(standard.cssBodyAnimationMayClaimProductionAnimation, false);
  assert.equal(standard.syntheticMouthMayClaimProductionLipSync, false);
});

test("procedural review evidence is visible without satisfying identity or production gates", () => {
  const status = compileCouncilAvatarProductionStatus({
    proceduralReviewAtlasManifest: proceduralReviewManifest(),
  });
  assert.deepEqual(status.proceduralReview, {
    available: true,
    characterCount: 5,
    canonicalSeatReviewCount: 4,
    previewOnlyCharacterCount: 1,
    clipCount: 6,
    frameCount: 636,
    productionEligible: false,
    runtimeActivationAllowed: false,
    websiteActivationAllowed: false,
  });
  const critic = status.characters.find(
    (character) => character.characterId === "council-critic",
  );
  const reviewer = status.characters.find(
    (character) => character.characterId === "council-open-reviewer",
  );
  const eva = status.characters.find(
    (character) => character.characterId === "eva-female",
  );
  assert.equal(critic.proceduralReview.displayName, "Veyra");
  assert.equal(critic.proceduralReview.frameCount, 120);
  assert.equal(critic.proceduralReview.identityMasterCandidate, false);
  assert.equal(critic.proceduralReview.productionEligible, false);
  assert.equal(reviewer.proceduralReview.displayName, "Moro Pell");
  assert.equal(reviewer.proceduralReview.frameCount, 120);
  assert.deepEqual(eva.proceduralReview.clipIds, ["idle-primary", "run-loop"]);
  assert.equal(eva.proceduralReview.frameCount, 156);
  assert.equal(
    status.characters.some(
      (character) => character.characterId === "nymm-guest-arbiter",
    ),
    false,
  );
  assert.deepEqual(status.identityMasterGenerationRequiredFor, [
    "council-critic",
    "council-open-reviewer",
  ]);
  assert.equal(status.assignmentPlan.assignedCount, 2);
  assert.equal(status.complete, false);
  assert.equal(status.websiteMayClaimAllCouncilAvatarsProductionReady, false);
});

test("future admitted unique packs still require completed authored media", () => {
  const packs = [
    { characterId: "top-hat-man" },
    { characterId: "eva-female" },
    { characterId: "council-critic" },
    { characterId: "council-open-reviewer" },
  ];
  const status = compileCouncilAvatarProductionStatus({ assetPacks: packs });
  assert.equal(status.assignmentPlan.complete, true);
  assert.equal(status.assignmentPlan.assignedCount, 4);
  assert.equal(status.complete, false);
  assert.equal(status.websiteMayClaimAllCouncilAvatarsProductionReady, false);
  assert.deepEqual(status.authoredAnimationCompletionRequiredFor, [
    "top-hat-man",
    "council-critic",
    "eva-female",
    "council-open-reviewer",
  ]);
});
