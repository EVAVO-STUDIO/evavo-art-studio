import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { compileCouncilAvatarMediaReadiness } from './project-art/council-avatar-media-readiness.mjs';

const EXPECTED_TOP_HAT_SLOTS = [
  'blink-closed',
  'listening-attentive',
  'thinking-reflective',
  'speech-neutral',
  'presentation-open',
  'presentation-emphasis',
];

const EXPECTED_DENSE_ORDINALS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function byId(readiness, characterId) {
  const character = readiness.characters.find((entry) => entry.characterId === characterId);
  assert.ok(character, characterId);
  return character;
}

test('Council media readiness is four-seat, fail-closed and deterministic', () => {
  const first = compileCouncilAvatarMediaReadiness();
  const second = compileCouncilAvatarMediaReadiness();

  assert.equal(first.status, 'blocked-by-governed-media-evidence');
  assert.equal(first.seatCount, 4);
  assert.equal(first.characterCount, 4);
  assert.deepEqual(
    first.characters.map((character) => [character.seatId, character.characterId]),
    [
      ['architect', 'top-hat-man'],
      ['researcher', 'eva-female'],
      ['critic', 'council-critic'],
      ['open-reviewer', 'council-open-reviewer'],
    ],
  );
  assert.equal(new Set(first.characters.map((character) => character.characterId)).size, 4);
  assert.equal(first.identityReadyCount, 2);
  assert.equal(first.identityMasterGenerationCount, 2);
  assert.equal(first.productionReadyCount, 0);
  assert.equal(first.providerExecutionSurfaceAvailableCount, 3);
  assert.equal(first.providerExecutionEstablishedCount, 0);
  assert.equal(first.masteringExecutionSurfaceAvailableCount, 1);
  assert.equal(first.masteringExecutionEstablishedCount, 0);
  assert.equal(first.totalPlannedImagesPerCharacter, 749);
  assert.equal(first.release.websiteActivationAllowed, false);
  assert.equal(first.release.runtimeActivationAllowed, false);
  assert.equal(first.release.partialCharacterReleaseAllowed, false);
  assert.equal(first.release.generationEqualsApproval, false);
  assert.match(first.readinessSha256, /^[a-f0-9]{64}$/u);
  assert.equal(first.readinessSha256, second.readinessSha256);
  assert.ok(
    first.characters.every(
      (character) =>
        character.productionReady === false &&
        character.execution.providerExecutionEstablished === false &&
        Object.values(character.authority).every((value) => value === false),
    ),
  );
});

test('Top Hat readiness binds the real six-slot provider campaign without pretending it is authorized', () => {
  const topHat = byId(compileCouncilAvatarMediaReadiness(), 'top-hat-man');

  assert.equal(topHat.stage, 'identity-ready-pose-bank-blocked');
  assert.equal(topHat.identityReady, true);
  assert.equal(topHat.currentMedia.admittedBodyPoseCount, 3);
  assert.deepEqual(topHat.currentMedia.admittedBodyPoses, ['neutral', 'inhale', 'exhale']);
  assert.deepEqual(topHat.currentMedia.missingBodyPoses, EXPECTED_TOP_HAT_SLOTS);
  assert.equal(topHat.currentMedia.expandedPerformanceReady, false);
  assert.equal(topHat.execution.providerExecutionSurfaceAvailable, true);
  assert.equal(topHat.execution.providerExecutionEstablished, false);
  assert.equal(
    topHat.execution.runner,
    'scripts/run-project-art-top-hat-pose-bank-provider-campaign.mjs',
  );
  assert.deepEqual(topHat.execution.argvTemplate.slice(0, 2), [
    'node',
    'scripts/run-project-art-top-hat-pose-bank-provider-campaign.mjs',
  ]);
  assert.equal(topHat.execution.maximumProviderCallsPerSlot, 1);
  assert.equal(topHat.execution.authorizationMaximumHours, 24);
  assert.ok(topHat.requiredNextEvidence.some((entry) => /adapter-file SHA-256/u.test(entry)));
  assert.ok(topHat.requiredNextEvidence.some((entry) => /named-human authorization/u.test(entry)));
  assert.ok(topHat.downstreamGates.includes('Avatar Runtime publication'));
});

test('EVA readiness exposes governed ten-frame mastering without pretending execution evidence or media exists', () => {
  const eva = byId(compileCouncilAvatarMediaReadiness(), 'eva-female');

  assert.equal(eva.stage, 'identity-ready-ten-master-execution-ready-for-evidence');
  assert.equal(eva.identityReady, true);
  assert.equal(eva.currentMedia.denseBootstrapTargetCount, 10);
  assert.deepEqual(eva.currentMedia.temporaryFallbackOrdinals, [4, 5, 6]);
  assert.deepEqual(eva.currentMedia.pendingMasteringOrdinals, [1, 2, 3, 7, 8, 9, 10]);
  assert.deepEqual(eva.currentMedia.finalRequiredNewDenseMasterOrdinals, EXPECTED_DENSE_ORDINALS);
  assert.equal(eva.currentMedia.tenMasterProductionProgramAvailable, true);
  assert.equal(eva.currentMedia.tenMasterRequiredNewMasterCount, 10);
  assert.deepEqual(eva.currentMedia.fallbackRemasterOrdinals, [4, 5, 6]);
  assert.equal(eva.currentMedia.masteredDenseMasterCount, 0);
  assert.equal(eva.currentMedia.realMasteringCampaignReceiptCount, 0);
  assert.equal(eva.currentMedia.technicalInspectionCount, 0);
  assert.equal(eva.currentMedia.creativeApprovalCount, 0);
  assert.equal(eva.currentMedia.cloudinaryPublishedDenseMasterCount, 0);
  assert.equal(eva.currentMedia.runtimeDenseMasterEvidenceCount, 0);
  assert.equal(eva.currentMedia.legacyPoseReuseAllowedForFinalRelease, false);
  assert.equal(eva.currentMedia.syntheticBodyTransformsAllowed, false);
  assert.equal(eva.execution.providerExecutionSurfaceAvailable, false);
  assert.equal(eva.execution.providerExecutionEstablished, false);
  assert.equal(eva.execution.masteringPlanningSurfaceAvailable, true);
  assert.equal(eva.execution.masteringExecutionSurfaceAvailable, true);
  assert.equal(eva.execution.masteringExecutionEstablished, false);
  assert.equal(
    eva.execution.localValidationEntry,
    'scripts/check-project-art-eva-dense-motion-work-order.mjs',
  );
  assert.equal(
    eva.execution.tenMasterProgram,
    'scripts/project-art/eva-dense-motion-ten-master-program.mjs',
  );
  assert.equal(
    eva.execution.tenMasterCompiler,
    'scripts/compile-project-art-eva-dense-motion-ten-master.mjs',
  );
  assert.deepEqual(eva.execution.tenMasterPlanningCommand.slice(0, 2), [
    'node',
    'scripts/compile-project-art-eva-dense-motion-ten-master.mjs',
  ]);
  assert.equal(
    eva.execution.masteringCampaign,
    'scripts/project-art/eva-dense-motion-mastering-campaign.mjs',
  );
  assert.equal(eva.execution.masteringCampaignMode, 'workspace-local-deterministic');
  assert.equal(eva.execution.allPendingFramesAlphaPreflightBeforeFirstWrite, true);
  assert.equal(eva.execution.completedFrameBoundaryResumeSupported, true);
  assert.equal(eva.execution.midFramePartialStateRejected, true);
  assert.equal(eva.execution.minimumIndependentInspectorsPerCandidate, 2);
  assert.equal(eva.execution.minimumInspectorConfidence, 0.95);
  assert.equal(eva.execution.reviewedAlphaMatteRequiredPerFrame, true);
  assert.equal(eva.execution.oneShotAlphaMasteringAuthorizationRequiredPerFrame, true);
  assert.equal(eva.execution.authorizationMaximumHours, 24);
  assert.equal(
    eva.execution.workstationTask,
    'config/eva-dense-motion-workstation-task-v1.json',
  );
  assert.equal(eva.execution.namedWorkerTask, 'eva-avatar-worker-stack');
  assert.equal(eva.execution.atomicTenMasterActivationRequired, true);
  assert.equal(eva.execution.legacyFallbackMaySatisfyFinalMasterGate, false);
  assert.ok(eva.blockers.some((entry) => /no real mastering campaign receipt/u.test(entry)));
  assert.ok(eva.blockers.some((entry) => /confidence 0.95/u.test(entry)));
  assert.ok(eva.blockers.some((entry) => /10 to frame 1/u.test(entry)));
  assert.ok(eva.requiredNextEvidence.some((entry) => /ordinals 1 through 10/u.test(entry)));
  assert.ok(eva.requiredNextEvidence.some((entry) => /ten-frame mastering campaign receipt/u.test(entry)));
  assert.ok(eva.requiredNextEvidence.some((entry) => /legacy fallback assets/u.test(entry)));
  assert.match(
    eva.nextGate,
    /grants no technical approval, creative approval, upload, sequence release or Runtime activation authority/u,
  );
});

test('Critic and Open Reviewer derive their 12-job bootstrap and expose candidate-only provider execution', () => {
  const readiness = compileCouncilAvatarMediaReadiness();
  const expected = new Map([
    [
      'council-critic',
      'config/council-avatar-identities/council-critic.identity-request.json',
    ],
    [
      'council-open-reviewer',
      'config/council-avatar-identities/council-open-reviewer.identity-request.json',
    ],
  ]);

  for (const [characterId, requestPath] of expected) {
    const character = byId(readiness, characterId);
    assert.equal(character.stage, 'identity-master-provider-execution-ready-for-evidence');
    assert.equal(character.identityReady, false);
    assert.equal(character.currentMedia.requestPath, requestPath);
    assert.equal(character.currentMedia.candidateSetCount, 4);
    assert.equal(character.currentMedia.viewsPerCandidateSet, 3);
    assert.equal(character.currentMedia.providerGenerationJobCount, 12);
    assert.equal(character.currentMedia.approvedIdentityMasterCount, 0);
    assert.equal(character.execution.providerExecutionSurfaceAvailable, true);
    assert.equal(character.execution.providerExecutionEstablished, false);
    assert.equal(character.execution.providerSelectionEstablished, false);
    assert.equal(character.execution.providerAuthorizationEstablished, false);
    assert.equal(
      character.execution.providerCompiler,
      'scripts/compile-project-art-character-identity-provider-runtime.mjs',
    );
    assert.equal(
      character.execution.providerRunner,
      'scripts/run-project-art-character-identity-provider.mjs',
    );
    assert.equal(character.execution.setAnchorViewId, 'full-body-right');
    assert.deepEqual(character.execution.dependentViewIds, [
      'full-body-left',
      'neutral-bust',
    ]);
    assert.equal(character.execution.sameSetAnchorArtifactRequiredForDependentViews, true);
    assert.equal(character.execution.maximumProviderCallsPerJob, 1);
    assert.equal(character.execution.maximumRuntimeAttempts, 1);
    assert.equal(character.execution.authorizationMaximumHours, 24);
    assert.equal(character.execution.providerFallbackAllowed, false);
    assert.deepEqual(character.execution.planningCommands[0].slice(0, 3), [
      'node',
      'scripts/character-identity-master-plan.mjs',
      'compile',
    ]);
    assert.deepEqual(character.execution.planningCommands[1].slice(0, 3), [
      'node',
      'scripts/character-identity-bootstrap-admission.mjs',
      'compile',
    ]);
    assert.ok(
      character.requiredNextEvidence.includes(
        'provider runtime profile and adapter selection',
      ),
    );
    assert.ok(
      character.requiredNextEvidence.includes(
        'time-bounded provider execution authorization',
      ),
    );
    assert.ok(
      character.requiredNextEvidence.includes(
        'candidate generation receipts and exact artifact hashes',
      ),
    );
    assert.ok(
      character.requiredNextEvidence.some((entry) =>
        /separate identity continuity review and approval receipt/u.test(entry),
      ),
    );
    assert.match(character.nextEngineeringGate, /full-body-right first/u);
    assert.match(character.nextGate, /generation remains separate from identity approval/u);
  }
});

test('source contract exposes EVA ten-master planning, mastering campaign and governed character-identity executor', () => {
  const readiness = compileCouncilAvatarMediaReadiness();
  assert.equal(readiness.sourceContract.councilWorkerTaskName, 'council-avatar-worker-stack');
  assert.equal(readiness.sourceContract.evaWorkerTaskName, 'eva-avatar-worker-stack');
  assert.equal(
    readiness.sourceContract.evaDenseMotionTenMasterProgram,
    'scripts/project-art/eva-dense-motion-ten-master-program.mjs',
  );
  assert.equal(
    readiness.sourceContract.evaDenseMotionTenMasterCompiler,
    'scripts/compile-project-art-eva-dense-motion-ten-master.mjs',
  );
  assert.equal(
    readiness.sourceContract.evaDenseMotionMasteringCampaign,
    'scripts/project-art/eva-dense-motion-mastering-campaign.mjs',
  );
  assert.equal(
    readiness.sourceContract.evaDenseMotionWorkstationTask,
    'config/eva-dense-motion-workstation-task-v1.json',
  );
  assert.equal(
    readiness.sourceContract.characterIdentityProviderCompiler,
    'scripts/compile-project-art-character-identity-provider-runtime.mjs',
  );
  assert.equal(
    readiness.sourceContract.characterIdentityProviderExecutionSurface,
    'scripts/run-project-art-character-identity-provider.mjs',
  );
  assert.equal(readiness.sourceContract.unrelatedMobileIdentityProviderRuntimeMayBeReused, false);
});

test('Council production MCP exposes the same media readiness result', () => {
  const messages = [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'evavo_art_council_avatar_media_readiness', arguments: {} },
    },
  ];
  const result = spawnSync(
    process.execPath,
    ['tools/project_art_council_avatar_production_mcp.mjs'],
    {
      input: `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`,
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const responses = result.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(responses[0].result.serverInfo.version, '1.1.0');
  assert.ok(
    responses[1].result.tools.some(
      (tool) => tool.name === 'evavo_art_council_avatar_media_readiness',
    ),
  );
  const viaMcp = JSON.parse(responses[2].result.content[0].text);
  const direct = compileCouncilAvatarMediaReadiness();
  assert.equal(viaMcp.readinessSha256, direct.readinessSha256);
  assert.equal(viaMcp.productionReadyCount, 0);
  assert.equal(viaMcp.providerExecutionSurfaceAvailableCount, 3);
  assert.equal(viaMcp.providerExecutionEstablishedCount, 0);
  assert.equal(viaMcp.masteringExecutionSurfaceAvailableCount, 1);
  assert.equal(viaMcp.masteringExecutionEstablishedCount, 0);
  const eva = byId(viaMcp, 'eva-female');
  assert.equal(eva.execution.masteringPlanningSurfaceAvailable, true);
  assert.equal(eva.execution.masteringExecutionSurfaceAvailable, true);
  assert.equal(eva.execution.masteringExecutionEstablished, false);
});
