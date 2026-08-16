#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AVATAR_DISPLAY_BRIDGE_CONSTANTS,
  AVATAR_DISPLAY_BRIDGE_REQUEST_SCHEMA,
  AVATAR_DISPLAY_CADENCE_SCHEMA,
  compileProjectArtAvatarDisplayBridge,
  projectArtAvatarDisplayBridgeCapabilities,
} from './project-art/avatar-display-bridge.mjs';

const authority = Object.freeze({
  providerExecution: false,
  candidateApproval: false,
  candidatePromotion: false,
  sourceMutation: false,
  repositoryMutation: false,
  gitCommit: false,
  gitPush: false,
  publication: false,
  runtimeActivation: false,
  deployment: false,
  forcePush: false,
});

function request(overrides = {}) {
  return {
    schema: AVATAR_DISPLAY_BRIDGE_REQUEST_SCHEMA,
    characterId: 'top-hat-man',
    clipId: 'talk-neutral',
    loopMode: 'loop',
    authoredFps: 30,
    frames: [
      { frameId: 'talk-0001', durationMs: 1_000 / 30, approved: true },
      { frameId: 'talk-0002', durationMs: 1_000 / 30, approved: true },
      { frameId: 'talk-0003', durationMs: 1_000 / 30, approved: true },
    ],
    registeredMouthLayer: {
      enabled: true,
      registration: 'full-canvas-pixel-exact',
      audioTimingRequired: true,
      minimumVisibleMs: 64,
    },
    authority,
    ...overrides,
  };
}

test('compiles a 30 fps authored clip for continuous 60 fps presentation', () => {
  const plan = compileProjectArtAvatarDisplayBridge(request());
  assert.equal(plan.cadence.schema, AVATAR_DISPLAY_CADENCE_SCHEMA);
  assert.equal(plan.cadence.displayTargetFps, 60);
  assert.equal(plan.cadence.interpolationEasing, 'smootherstep');
  assert.equal(plan.cadence.continuousPoseInterpolation, true);
  assert.equal(plan.cadence.wholeBodyVisemeCrossfadeForbidden, true);
  assert.equal(
    plan.cadence.registeredMouthLayerKeepsBodyCadenceIndependent,
    true,
  );
  assert.equal(plan.transitionWindows.length, 3);
  assert.ok(
    plan.transitionWindows.every(
      (transition) => transition.continuousTransitionCoverage === 1,
    ),
  );
  assert.equal(plan.runtimeActivationAllowed, false);
  assert.equal(plan.productionReady, false);
});

test('retains a long continuous transition for sparse approved anchors', () => {
  const plan = compileProjectArtAvatarDisplayBridge(
    request({
      clipId: 'idle-breathe-approved-anchor-bridge',
      authoredFps: 24,
      frames: [
        { frameId: 'neutral', durationMs: 720, approved: true },
        { frameId: 'inhale', durationMs: 720, approved: true },
        { frameId: 'exhale', durationMs: 720, approved: true },
      ],
    }),
  );
  assert.equal(plan.transitionWindows[0].blendWindowMs, 560);
  assert.ok(
    Math.abs(
      plan.transitionWindows[0].continuousTransitionCoverage - 560 / 720,
    ) < 1e-12,
  );
});

test('requires genuine approved frames and exact registered mouth geometry', () => {
  assert.throws(
    () =>
      compileProjectArtAvatarDisplayBridge(
        request({
          frames: [
            { frameId: 'a', durationMs: 40, approved: true },
            { frameId: 'b', durationMs: 40, approved: false },
          ],
        }),
      ),
    /PROJECT_ART_AVATAR_DISPLAY_FRAME_UNAPPROVED/u,
  );
  assert.throws(
    () =>
      compileProjectArtAvatarDisplayBridge(
        request({
          registeredMouthLayer: {
            enabled: true,
            registration: 'face-crop-approximate',
            audioTimingRequired: true,
            minimumVisibleMs: 64,
          },
        }),
      ),
    /PROJECT_ART_AVATAR_DISPLAY_MOUTH_LAYER_INVALID/u,
  );
});

test('rejects duplicate frame identities and widened authority', () => {
  assert.throws(
    () =>
      compileProjectArtAvatarDisplayBridge(
        request({
          frames: [
            { frameId: 'same', durationMs: 40, approved: true },
            { frameId: 'same', durationMs: 40, approved: true },
          ],
        }),
      ),
    /PROJECT_ART_AVATAR_DISPLAY_FRAME_ID_DUPLICATE/u,
  );
  assert.throws(
    () =>
      compileProjectArtAvatarDisplayBridge(
        request({ authority: { ...authority, runtimeActivation: true } }),
      ),
    /PROJECT_ART_AVATAR_DISPLAY_AUTHORITY_INVALID/u,
  );
});

test('capabilities match the runtime cadence without claiming art execution', () => {
  const capabilities = projectArtAvatarDisplayBridgeCapabilities();
  assert.equal(capabilities.cadenceSchema, 'evavo_avatar_display_cadence_v2');
  assert.deepEqual(
    {
      minimumBlendWindowMs: capabilities.minimumBlendWindowMs,
      maximumBlendWindowMs: capabilities.maximumBlendWindowMs,
      blendWindowRatio: capabilities.blendWindowRatio,
    },
    {
      minimumBlendWindowMs:
        AVATAR_DISPLAY_BRIDGE_CONSTANTS.minimumBlendWindowMs,
      maximumBlendWindowMs:
        AVATAR_DISPLAY_BRIDGE_CONSTANTS.maximumBlendWindowMs,
      blendWindowRatio: AVATAR_DISPLAY_BRIDGE_CONSTANTS.blendWindowRatio,
    },
  );
  assert.equal(capabilities.fakeTransparencyGridAllowed, false);
  assert.equal(capabilities.providerExecution, false);
  assert.equal(capabilities.repositoryMutation, false);
  assert.equal(capabilities.runtimeActivation, false);
  assert.equal(capabilities.publication, false);
});
