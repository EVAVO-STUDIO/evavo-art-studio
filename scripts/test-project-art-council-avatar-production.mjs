import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  compileCouncilAvatarProductionProgram,
  councilAvatarProductionCapabilities,
} from './project-art/council-avatar-production-program.mjs';

test('Council production program binds the authoritative four-seat roster', () => {
  const program = compileCouncilAvatarProductionProgram();
  assert.equal(program.seatCount, 4);
  assert.equal(program.characterCount, 4);
  assert.deepEqual(
    program.characters.map((character) => [character.seatId, character.characterId]),
    [
      ['architect', 'top-hat-man'],
      ['researcher', 'eva-female'],
      ['critic', 'council-critic'],
      ['open-reviewer', 'council-open-reviewer'],
    ],
  );
  assert.equal(program.identityMasterGenerationCount, 2);
  assert.equal(new Set(program.characters.map((character) => character.characterId)).size, 4);
});

test('every Council character inherits the professional authored animation standard', () => {
  const program = compileCouncilAvatarProductionProgram();
  assert.equal(program.animationStandard.clipCount, 25);
  assert.equal(program.animationStandard.fullCharacterFrameCount, 732);
  assert.equal(program.animationStandard.registeredPoseLayerCount, 17);
  assert.equal(program.animationStandard.totalPlannedImagesPerCharacter, 749);
  assert.equal(program.animationStandard.idleVariants, 4);
  assert.equal(program.animationStandard.talkVariants, 6);
  assert.equal(program.animationStandard.minimumAuthoredFps, 24);
  assert.equal(program.animationStandard.preferredAuthoredFps, 30);
  assert.equal(program.animationStandard.displayTargetFps, 60);
  assert.ok(
    program.characters.every(
      (character) =>
        character.animationStandard === program.animationStandard &&
        character.productionReady === false &&
        Object.values(character.authority).every((value) => value === false),
    ),
  );
});

test('new Council identities are original role-specific transparent production briefs', () => {
  const program = compileCouncilAvatarProductionProgram();
  const newCharacters = program.characters.filter(
    (character) => character.identityStatus === 'identity-master-required',
  );
  assert.deepEqual(
    newCharacters.map((character) => character.characterId),
    ['council-critic', 'council-open-reviewer'],
  );
  for (const character of newCharacters) {
    const brief = character.identityBrief;
    assert.equal(brief.targetCanvas.width, 1024);
    assert.equal(brief.targetCanvas.height, 1536);
    assert.equal(brief.output.alpha, 'rgba8-straight');
    assert.equal(brief.output.fullBodyRequired, true);
    assert.equal(brief.output.transparentBackgroundRequired, true);
    assert.match(brief.briefSha256, /^[a-f0-9]{64}$/u);
    assert.match(brief.providerPrompt, /no holograms/u);
    assert.match(brief.providerPrompt, /one complete character only/u);
    assert.ok(Object.values(brief.authority).every((value) => value === false));
  }
  assert.notEqual(
    newCharacters[0].identityBrief.briefSha256,
    newCharacters[1].identityBrief.briefSha256,
  );
});

test('Council presentation states map to authored clips without creating CSS motion authority', () => {
  const program = compileCouncilAvatarProductionProgram();
  for (const state of [
    'idle',
    'listening',
    'thinking',
    'speaking',
    'dissent',
    'synthesising',
    'complete',
    'error',
  ]) {
    assert.ok(program.councilStateMapping[state]?.length > 0, state);
  }
  assert.equal(program.releasePolicy.partialCharacterReleaseAllowed, false);
  assert.equal(
    program.releasePolicy.sparsePoseApproximationMayClaimProductionAnimation,
    false,
  );
  assert.equal(program.releasePolicy.websiteMayActivateBeforeReviewedMediaComplete, false);
});

test('MCP exposes the same deterministic Council production program', () => {
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
      params: { name: 'evavo_art_council_avatar_production_program', arguments: {} },
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
  assert.ok(
    responses[1].result.tools.some(
      (tool) => tool.name === 'evavo_art_council_avatar_production_program',
    ),
  );
  const program = JSON.parse(responses[2].result.content[0].text);
  assert.equal(program.characterCount, 4);
  assert.equal(program.identityMasterGenerationCount, 2);
  assert.equal(program.animationStandard.totalPlannedImagesPerCharacter, 749);
});

test('capabilities are plan-only and reusable by ChatGPT, Claude and agents', () => {
  const capabilities = councilAvatarProductionCapabilities();
  assert.deepEqual(capabilities.supportedCharacterIds, [
    'top-hat-man',
    'eva-female',
    'council-critic',
    'council-open-reviewer',
  ]);
  assert.equal(capabilities.totalPlannedImagesPerCharacter, 749);
  assert.equal(capabilities.minimumAuthoredFps, 24);
  assert.equal(capabilities.preferredAuthoredFps, 30);
  assert.equal(capabilities.displayTargetFps, 60);
  assert.equal(capabilities.providerExecution, false);
  assert.equal(capabilities.runtimeActivation, false);
});
