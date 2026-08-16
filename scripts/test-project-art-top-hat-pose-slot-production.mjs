#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  TOP_HAT_ADMITTED_BODY_ANCHORS,
  TOP_HAT_POSE_SLOT_ART_STUDIO_PIN,
  TOP_HAT_POSE_SLOT_PRODUCTION_PLAN_SCHEMA,
  TOP_HAT_POSE_SLOT_PRODUCTION_REQUEST_SCHEMA,
  TOP_HAT_POSE_SLOT_RUNTIME_PIN,
  compileProjectArtTopHatPoseSlotProduction,
  createProjectArtTopHatPoseSlotProductionRequest,
  projectArtTopHatPoseSlotProductionCapabilities,
} from './project-art/top-hat-pose-slot-production.mjs';

function mutableRequest() {
  return JSON.parse(
    JSON.stringify(createProjectArtTopHatPoseSlotProductionRequest()),
  );
}

const animationSuiteSource = readFileSync(
  new URL('./project-art/avatar-animation-suite.mjs', import.meta.url),
  'utf8',
);
const animationSuiteClipIds = new Set(
  [...animationSuiteSource.matchAll(/clip\('([^']+)'/gu)].map(
    (match) => match[1],
  ),
);

const expectedSlotIds = Object.freeze([
  'blink-closed',
  'listening-attentive',
  'thinking-reflective',
  'speech-neutral',
  'presentation-open',
  'presentation-emphasis',
]);

test('compiles all Runtime 0.34 Top Hat pose slots from existing Art Studio clips', () => {
  const plan = compileProjectArtTopHatPoseSlotProduction(
    createProjectArtTopHatPoseSlotProductionRequest(),
  );
  assert.equal(plan.schema, TOP_HAT_POSE_SLOT_PRODUCTION_PLAN_SCHEMA);
  assert.equal(
    plan.requestSchema,
    TOP_HAT_POSE_SLOT_PRODUCTION_REQUEST_SCHEMA,
  );
  assert.deepEqual(
    plan.productionSlots.map((slot) => slot.slotId),
    expectedSlotIds,
  );
  assert.equal(plan.runtime.packageVersion, '0.34.0');
  assert.equal(
    plan.runtime.commit,
    '524066fc95fee329e1a20f7c9aa7d805d94c8cc8',
  );
  assert.equal(
    plan.artStudio.commit,
    '5f2859286e7b9b2823b34019a7d383adeb86c923',
  );
  assert.equal(plan.counts.admittedBodyAnchors, 3);
  assert.equal(plan.counts.requiredPoseSlots, 6);
  assert.equal(plan.counts.plannedUnfilledPoseSlots, 6);
  assert.equal(plan.counts.activationEligiblePoseSlots, 0);
  assert.equal(plan.status, 'pose-slot-production-map-ready');
  assert.equal(plan.currentRuntimeSafe, true);
  assert.equal(plan.expandedPerformanceReady, false);
  assert.equal(plan.artGenerationRequired, true);
  assert.equal(plan.productionReady, false);
  assert.equal(plan.runtimeActivationAllowed, false);
  assert.match(plan.requestSha256, /^[a-f0-9]{64}$/u);
  assert.match(plan.identityReferenceSetSha256, /^[a-f0-9]{64}$/u);
  assert.match(plan.planSha256, /^[a-f0-9]{64}$/u);

  for (const slot of plan.productionSlots) {
    assert.equal(slot.status, 'planned-unfilled');
    assert.equal(slot.activationEligible, false);
    assert.ok(slot.sourceMapping.sourceClipIds.length >= 1);
    for (const clipId of slot.sourceMapping.sourceClipIds) {
      assert.ok(
        animationSuiteClipIds.has(clipId),
        `${slot.slotId} references missing animation clip ${clipId}`,
      );
    }
  }
});

test('maps each semantic slot without allowing visemes to select body poses', () => {
  const plan = compileProjectArtTopHatPoseSlotProduction(
    createProjectArtTopHatPoseSlotProductionRequest(),
  );
  const byId = new Map(
    plan.productionSlots.map((slot) => [slot.slotId, slot]),
  );

  assert.deepEqual(byId.get('blink-closed').sourceMapping.sourceClipIds, [
    'blink-single',
    'blink-double',
  ]);
  assert.equal(byId.get('blink-closed').productionBrief.eyeLayerState, 'closed');
  assert.deepEqual(
    byId.get('listening-attentive').sourceMapping.sourceClipIds,
    ['attention', 'listening'],
  );
  assert.deepEqual(
    byId.get('speech-neutral').sourceMapping.sourceClipIds,
    ['talk-in', 'talk-neutral', 'talk-out'],
  );
  assert.equal(
    byId.get('speech-neutral').productionBrief.mouthLayerState,
    'registered-layer-owns-all-visemes',
  );
  assert.equal(
    byId.get('speech-neutral').productionBrief.bakedVisemeAllowed,
    false,
  );
  assert.deepEqual(
    byId.get('presentation-open').sourceMapping.sourceClipIds,
    ['talk-engaged', 'wave'],
  );
  assert.deepEqual(
    byId.get('presentation-emphasis').sourceMapping.sourceClipIds,
    ['talk-emphasis', 'nod'],
  );
  assert.equal(
    byId.get('presentation-open').review.handAndFingerReviewRequired,
    true,
  );
  assert.equal(
    byId.get('presentation-emphasis').review.handOrFingerDefectsBlocking,
    true,
  );
  assert.ok(
    plan.productionSlots.every(
      (slot) => slot.productionBrief.bodyCadenceIndependentOfVisemes,
    ),
  );
  assert.ok(
    plan.productionSlots.every(
      (slot) => !slot.productionBrief.syntheticBodyInbetweeningAllowed,
    ),
  );
});

test('requires real alpha, safe hidden RGB and exact non-compositing atlas writes', () => {
  const plan = compileProjectArtTopHatPoseSlotProduction(
    createProjectArtTopHatPoseSlotProductionRequest(),
  );
  const outputPaths = new Set();

  for (const slot of plan.productionSlots) {
    assert.equal(slot.mastering.nativeAlphaRequiredAtAdmission, true);
    assert.equal(slot.mastering.providerTransparencyTrusted, false);
    assert.equal(slot.mastering.paintedCheckerboardBlocking, true);
    assert.equal(slot.mastering.opaqueMatteBlocking, true);
    assert.equal(slot.mastering.chromaSpillBlocking, true);
    assert.equal(slot.mastering.hiddenRgbCleanupRequired, true);
    assert.equal(slot.mastering.transparentRgbBleedRequired, true);
    assert.equal(slot.mastering.transparentRgbBleedRadius, 8);
    assert.equal(slot.mastering.transparentRgbAlphaThreshold, 0);
    assert.equal(slot.mastering.alphaBytesPreserved, true);
    assert.equal(slot.mastering.strongerAlphaRgbPreserved, true);
    assert.equal(slot.mastering.exactRgbaAtlasPasteRequired, true);
    assert.equal(
      slot.mastering.atlasTransparentRgbSummarySchema,
      'evavo.project-art-atlas-transparent-rgb-summary.v1',
    );
    assert.equal(
      slot.mastering.transparentRgbBleedSchema,
      'evavo.project-art-transparent-rgb-bleed.v1',
    );
    assert.equal(slot.review.blackPlateRequired, true);
    assert.equal(slot.review.whitePlateRequired, true);
    assert.equal(slot.review.greenPlateRequired, true);
    assert.equal(slot.review.magentaPlateRequired, true);
    assert.equal(slot.review.visibleCanvasEdgePixelsBlocking, true);
    assert.equal(slot.review.croppedSilhouetteBlocking, true);
    assert.equal(slot.review.namedHumanApprovalRequired, true);
    assert.equal(slot.promotion.candidateOnly, true);
    assert.equal(slot.promotion.automaticApprovalAllowed, false);
    assert.equal(slot.promotion.automaticRuntimeActivationAllowed, false);

    for (const outputPath of Object.values(slot.candidateOutputs).filter(
      (value) => typeof value === 'string',
    )) {
      assert.ok(!outputPaths.has(outputPath), `duplicate output ${outputPath}`);
      outputPaths.add(outputPath);
    }
  }
});

test('binds exact approved body anchors and normalizes their request order', () => {
  const request = mutableRequest();
  request.identityAnchors.reverse();
  const plan = compileProjectArtTopHatPoseSlotProduction(request);
  assert.deepEqual(
    plan.identityAnchors.map((anchor) => anchor.id),
    ['neutral', 'inhale', 'exhale'],
  );
  assert.deepEqual(
    plan.identityAnchors.map((anchor) => anchor.sha256),
    TOP_HAT_ADMITTED_BODY_ANCHORS.map((anchor) => anchor.sha256),
  );
  assert.ok(plan.productionSlots.every(
    (slot) =>
      slot.productionBrief.identityReferenceSetSha256 ===
      plan.identityReferenceSetSha256,
  ));
});

test('is deterministic and keeps all production authority closed', () => {
  const request = createProjectArtTopHatPoseSlotProductionRequest();
  const left = compileProjectArtTopHatPoseSlotProduction(request);
  const right = compileProjectArtTopHatPoseSlotProduction(request);
  assert.equal(left.requestSha256, right.requestSha256);
  assert.equal(left.identityReferenceSetSha256, right.identityReferenceSetSha256);
  assert.equal(left.planSha256, right.planSha256);
  assert.ok(Object.values(left.authority).every((value) => value === false));
  assert.equal(left.providerExecutionAllowed, false);
  assert.equal(left.runtimeActivationAllowed, false);
});

test('rejects stale provenance, altered anchors, widened authority and unknown keys', () => {
  const staleRuntime = mutableRequest();
  staleRuntime.runtime.packageVersion = '0.33.0';
  assert.throws(
    () => compileProjectArtTopHatPoseSlotProduction(staleRuntime),
    /PROJECT_ART_TOP_HAT_POSE_SLOT_RUNTIME_PIN_INVALID/u,
  );

  const staleArt = mutableRequest();
  staleArt.artStudio.exactRgbaAtlasPaste = false;
  assert.throws(
    () => compileProjectArtTopHatPoseSlotProduction(staleArt),
    /PROJECT_ART_TOP_HAT_POSE_SLOT_ART_STUDIO_PIN_INVALID/u,
  );

  const alteredAnchor = mutableRequest();
  alteredAnchor.identityAnchors[0].sha256 = '0'.repeat(64);
  assert.throws(
    () => compileProjectArtTopHatPoseSlotProduction(alteredAnchor),
    /PROJECT_ART_TOP_HAT_POSE_SLOT_ANCHOR_INVALID/u,
  );

  const duplicateAnchor = mutableRequest();
  duplicateAnchor.identityAnchors[1] = {
    ...duplicateAnchor.identityAnchors[0],
  };
  assert.throws(
    () => compileProjectArtTopHatPoseSlotProduction(duplicateAnchor),
    /PROJECT_ART_TOP_HAT_POSE_SLOT_ANCHORS_INVALID/u,
  );

  const widened = mutableRequest();
  widened.authority.runtimeActivation = true;
  assert.throws(
    () => compileProjectArtTopHatPoseSlotProduction(widened),
    /PROJECT_ART_TOP_HAT_POSE_SLOT_AUTHORITY_INVALID/u,
  );

  const unknown = mutableRequest();
  unknown.automaticApproval = true;
  assert.throws(
    () => compileProjectArtTopHatPoseSlotProduction(unknown),
    /PROJECT_ART_TOP_HAT_POSE_SLOT_KEYS_INVALID/u,
  );
});

test('capabilities expose planning and assurance without claiming art completion', () => {
  const capabilities = projectArtTopHatPoseSlotProductionCapabilities();
  assert.equal(capabilities.requiredPoseSlots, 6);
  assert.equal(capabilities.admittedBodyAnchors, 3);
  assert.equal(
    capabilities.runtimePoseBankSchema,
    TOP_HAT_POSE_SLOT_RUNTIME_PIN.poseBankSchema,
  );
  assert.equal(
    capabilities.artStudioAnimationSuitePlanSchema,
    TOP_HAT_POSE_SLOT_ART_STUDIO_PIN.animationSuitePlanSchema,
  );
  assert.equal(capabilities.explicitAnimationSuiteClipMapping, true);
  assert.equal(capabilities.fakeTransparencyGridAllowed, false);
  assert.equal(capabilities.hiddenRgbCleanupRequired, true);
  assert.equal(capabilities.exactRgbaAtlasPasteRequired, true);
  assert.equal(capabilities.bodyCadenceIndependentOfVisemes, true);
  assert.equal(capabilities.syntheticBodyInbetweeningAllowed, false);
  assert.equal(capabilities.namedHumanApprovalRequired, true);
  assert.equal(capabilities.automaticPoseSlotFillingAllowed, false);
  assert.equal(capabilities.providerExecution, false);
  assert.equal(capabilities.candidateApproval, false);
  assert.equal(capabilities.candidatePromotion, false);
  assert.equal(capabilities.repositoryMutation, false);
  assert.equal(capabilities.runtimeActivation, false);
  assert.equal(capabilities.publication, false);
});
