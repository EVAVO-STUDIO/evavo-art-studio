import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  parseTopHatPoseSlotProviderExecutionArguments,
} from './run-project-art-top-hat-pose-slot-provider.mjs';

const engine = readFileSync(
  new URL('./project-art/top-hat-pose-slot-provider-execution.mjs', import.meta.url),
  'utf8',
);

const SHA = 'a'.repeat(64);
const validArgs = [
  '--adapter', 'evidence/top-hat/runtime-adapter.json',
  '--expected-adapter-file-sha256', SHA,
  '--slot-id', 'presentation-open',
  '--runtime-root', '.runtime/top-hat',
  '--artifact-root', '.artifacts/top-hat',
  '--worker-id', 'top-hat-worker',
  '--output', 'evidence/top-hat/presentation-open.execution.json',
];

test('runner accepts only the complete bounded execution argument set', () => {
  const parsed = parseTopHatPoseSlotProviderExecutionArguments(validArgs);
  assert.equal(parsed.slotId, 'presentation-open');
  assert.equal(parsed.expectedAdapterFileSha256, SHA);
  assert.throws(
    () => parseTopHatPoseSlotProviderExecutionArguments(validArgs.slice(0, -2)),
    /expected exactly|missing/u,
  );
  const duplicate = [...validArgs];
  duplicate[2] = '--adapter';
  assert.throws(
    () => parseTopHatPoseSlotProviderExecutionArguments(duplicate),
    /unique supported/u,
  );
});

test('execution engine hard-codes a one-attempt, no-fallback provider lane', () => {
  assert.match(engine, /maximumAttempts:\s*1/u);
  assert.match(engine, /restrictProviderRegistry/u);
  assert.match(engine, /allowFallback\s*===\s*false/u);
  assert.match(engine, /handlerInvocations\s*===\s*0/u);
  assert.match(engine, /providerCallCount:\s*1/u);
  assert.match(engine, /TOP_HAT_PROVIDER_EXECUTION_MULTIPLE_PROVIDER_CALLS/u);
});

test('execution reuses the existing guarded dispatch, binding and outcome chain', () => {
  assert.match(engine, /compileProjectArtTopHatPoseSlotProviderRuntimeDispatch/u);
  assert.match(engine, /validateAvatarFinalPassCompiledProviderRuntimeContract/u);
  assert.match(engine, /compileAvatarFinalPassProviderRuntimeOutcome/u);
  assert.match(engine, /candidate-materialization-required/u);
  assert.match(engine, /materializationRequest\.createOnly\s*===\s*true/u);
});

test('execution receipt cannot approve, publish, fill slots or activate runtime', () => {
  for (const phrase of [
    'candidateApproval: false',
    'candidatePromotion: false',
    'poseSlotFilling: false',
    'sequenceRelease: false',
    'repositoryMutation: false',
    'publication: false',
    'deployment: false',
    'runtimeActivation: false',
    'forcePush: false',
  ]) assert.ok(engine.includes(phrase), `missing closed authority: ${phrase}`);
});
