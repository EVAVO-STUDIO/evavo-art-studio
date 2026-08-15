import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AVATAR_ANIMATION_SUITE_PLAN_SCHEMA,
  AVATAR_ANIMATION_SUITE_REQUEST_SCHEMA,
  ProjectArtAvatarAnimationSuiteError,
  compileProjectArtAvatarAnimationSuite,
  compileProjectArtAvatarAnimationSuiteFile,
  projectArtAvatarAnimationSuiteCapabilities,
} from './project-art/avatar-animation-suite.mjs';

const FIXED_TIME = '2026-08-15T04:00:00.000Z';

function authority() {
  return {
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
  };
}

function request(characterId = 'top-hat-man') {
  const topHat = characterId === 'top-hat-man';
  return {
    schema: AVATAR_ANIMATION_SUITE_REQUEST_SCHEMA,
    sessionId: `${characterId}-animation-001`,
    requestedAt: '2026-08-15T03:00:00Z',
    characterId,
    source: topHat
      ? {
          provider: 'cloudinary',
          cloudName: 'dntogqtey',
          publicId: 'tophat_man_xm3',
          assetId: '5bf63a805135ac9aa7819a8eda8b33a5',
          version: 1742757324,
          format: 'png',
          width: 3030,
          height: 3264,
          bytes: 1631228,
          assetFolder: 'evavo/website/visual-support',
          secureUrl:
            'https://res.cloudinary.com/dntogqtey/image/upload/v1742757324/tophat_man_xm3.png',
        }
      : {
          provider: 'cloudinary',
          cloudName: 'dntogqtey',
          publicId: 'EVA_Fallback_mlk4',
          assetId: '389e19d429eb545a8e1c94b424038df7',
          version: 1785146100,
          format: 'png',
          width: 700,
          height: 678,
          bytes: 61135,
          assetFolder: 'evavo/website/fallbacks',
          secureUrl:
            'https://res.cloudinary.com/dntogqtey/image/upload/v1785146100/EVA_Fallback_mlk4.png',
        },
    targetCanvas: { width: 1024, height: 1536 },
    requirements: {
      multipleIdleVariants: 4,
      multipleTalkVariants: 6,
      separatedMouthLayer: true,
      separatedEyeLayer: true,
      exactAudioTiming: true,
      genuineTransparency: true,
      fakeTransparencyGridAllowed: false,
      professionalFrameAssurance: true,
    },
    authority: authority(),
  };
}

test('compiler creates the complete professional Top Hat production plan', () => {
  const plan = compileProjectArtAvatarAnimationSuite(request(), {
    compiledAt: FIXED_TIME,
  });
  const repeated = compileProjectArtAvatarAnimationSuite(request(), {
    compiledAt: FIXED_TIME,
  });
  assert.deepEqual(plan, repeated);
  assert.equal(plan.schema, AVATAR_ANIMATION_SUITE_PLAN_SCHEMA);
  assert.equal(plan.counts.idleVariants, 4);
  assert.equal(plan.counts.talkVariants, 6);
  assert.ok(plan.counts.fullCharacterFrames > 300);
  assert.ok(plan.clips.some((clip) => clip.id === 'hat-tip'));
  assert.ok(
    plan.identityLock.some((line) => line.includes('top-hat crown height')),
  );
  assert.equal(plan.qualityGates.topHatGeometryDriftBlocking, true);
  assert.equal(plan.productionReady, false);
  assert.ok(Object.values(plan.authority).every((value) => value === false));
});

test('every frame job carries continuity, real-alpha and assurance controls', () => {
  const plan = compileProjectArtAvatarAnimationSuite(request('eva-female'), {
    compiledAt: FIXED_TIME,
  });
  assert.ok(
    plan.frameJobs.every(
      (job) =>
        job.referenceRoles.includes('canonical-identity') &&
        job.alphaMastering.operation === 'media.background-recovery' &&
        job.alphaMastering.paintedGridNeverAcceptedAsAlpha &&
        job.alphaMastering.edgeColourUnmixingRequired &&
        job.review.minimumIndependentInspectors === 2 &&
        job.review.minimumConfidence === 0.95,
    ),
  );
  assert.ok(
    plan.frameJobs
      .filter((job) => job.clipId.startsWith('talk-'))
      .every((job) => job.promptContract.separatedMouthUnderlay),
  );
  assert.ok(
    plan.poseJobs.every(
      (job) =>
        job.registration === 'full-canvas-pixel-exact' &&
        job.transparentRgbaRequired,
    ),
  );
});

test('fake transparency, authority escalation and incomplete animation coverage fail closed', () => {
  for (const mutate of [
    (value) => {
      value.requirements.fakeTransparencyGridAllowed = true;
    },
    (value) => {
      value.authority.providerExecution = true;
    },
    (value) => {
      value.requirements.multipleTalkVariants = 1;
    },
  ]) {
    const value = request();
    mutate(value);
    assert.throws(
      () => compileProjectArtAvatarAnimationSuite(value, { compiledAt: FIXED_TIME }),
      (error) => error instanceof ProjectArtAvatarAnimationSuiteError,
    );
  }
});

test('file compiler writes one private create-only plan', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-avatar-animation-'));
  try {
    const requestPath = path.join(root, 'request.json');
    const outputPath = path.join(root, 'plan.json');
    await writeFile(requestPath, `${JSON.stringify(request(), null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    const plan = compileProjectArtAvatarAnimationSuiteFile({
      requestPath,
      outputPath,
      compiledAt: FIXED_TIME,
    });
    const stored = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(stored.planSha256, plan.planSha256);
    assert.throws(() =>
      compileProjectArtAvatarAnimationSuiteFile({
        requestPath,
        outputPath,
        compiledAt: FIXED_TIME,
      }),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('capabilities expose animation quality without claiming execution', () => {
  const capabilities = projectArtAvatarAnimationSuiteCapabilities();
  assert.equal(capabilities.completeClipMatrix, true);
  assert.equal(capabilities.multipleIdleVariants, 4);
  assert.equal(capabilities.multipleTalkVariants, 6);
  assert.equal(capabilities.smartBackgroundRecovery, true);
  assert.equal(capabilities.fakeTransparencyGridAllowed, false);
  assert.equal(capabilities.providerExecution, false);
});

test('MCP exposes and executes the bounded create-only compiler tool', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-avatar-animation-mcp-'));
  try {
    const requestPath = path.join(root, 'request.json');
    const outputPath = path.join(root, 'plan.json');
    await writeFile(requestPath, `${JSON.stringify(request(), null, 2)}\n`, 'utf8');
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
        params: {
          name: 'evavo_art_compile_avatar_animation_suite',
          arguments: { requestPath, outputPath, compiledAt: FIXED_TIME },
        },
      },
    ];
    const result = spawnSync(
      process.execPath,
      [path.resolve('tools/project_art_avatar_animation_suite_mcp.mjs')],
      {
        cwd: path.resolve('.'),
        env: {
          ...process.env,
          EVAVO_ART_AVATAR_ANIMATION_ROOTS: root,
          EVAVO_ART_AVATAR_ANIMATION_MCP_ALLOW_WRITE: 'true',
        },
        input: `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`,
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const responses = result.stdout.trim().split('\n').map((line) => JSON.parse(line));
    assert.ok(
      responses[1].result.tools.some(
        (tool) => tool.name === 'evavo_art_compile_avatar_animation_suite',
      ),
    );
    const summary = JSON.parse(responses[2].result.content[0].text);
    assert.equal(summary.talkVariants, 6);
    assert.equal(summary.productionReady, false);
    assert.equal(JSON.parse(await readFile(outputPath, 'utf8')).planSha256, summary.planSha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
