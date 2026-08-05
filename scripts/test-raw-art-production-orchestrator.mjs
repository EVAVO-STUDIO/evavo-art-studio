#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(os.tmpdir(), 'evavo-raw-art-orchestrator-'));
const inventoryPath = path.join(temporary, 'inventory.json');
const decisionsPath = path.join(temporary, 'decisions.json');
const bridgePath = path.join(temporary, 'bridge.json');
const receiptsPath = path.join(temporary, 'receipts.json');
const queuePath = path.join(temporary, 'queue.json');
const stylePath = path.join(temporary, 'style.json');
const jobPath = path.join(temporary, 'workspace-job.json');
const digest = (letter) => letter.repeat(64);

function run(script, args, expected = 0) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== expected) {
    throw new Error(
      `${script} exited ${result.status}, expected ${expected}: ${result.stderr || result.stdout}`,
    );
  }
  return result;
}

try {
  const inventory = [
    {
      sourcePath: 'RAW_ART/people/dock_worker.png',
      sourceSha256: digest('a'),
      sourceBytes: 1200,
      width: 420,
      height: 500,
      role: 'standing-character',
    },
    {
      sourcePath: 'RAW_ART/ports/london_docks.png',
      sourceSha256: digest('b'),
      sourceBytes: 3200,
      width: 1280,
      height: 720,
      role: 'location-background',
    },
    {
      sourcePath: 'RAW_ART/people/recreate.png',
      sourceSha256: digest('c'),
      sourceBytes: 1300,
      width: 512,
      height: 512,
      role: 'standing-character',
    },
    {
      sourcePath: 'RAW_ART/reference/engraving.png',
      sourceSha256: digest('d'),
      sourceBytes: 1400,
      width: 900,
      height: 700,
      role: 'reference-unknown',
    },
    {
      sourcePath: 'RAW_ART/ui/map.png',
      sourceSha256: digest('e'),
      sourceBytes: 800,
      width: 256,
      height: 256,
      role: 'ui-icon',
    },
    {
      sourcePath: 'RAW_ART/unreviewed.png',
      sourceSha256: digest('f'),
      sourceBytes: 600,
      width: 128,
      height: 128,
      role: 'ui-icon',
    },
  ];
  const approvals = { creative: true, historical: true, provenance: true };
  const decisions = [
    {
      schema: 'evavo.image-reference-work-order.v2',
      sourcePath: inventory[0].sourcePath,
      sourceSha256: inventory[0].sourceSha256,
      decision: 'keep',
      semanticRole: 'standing-character',
      assignment: { portId: 'london', identityId: 'dock_worker_01', viewId: 'neutral' },
      preserve: ['strong readable silhouette', 'engraved line language'],
      removeOrFix: ['outer black matte'],
      negativeConstraints: ['no modern clothing'],
      operations: [],
      approvals,
      styleScope: { port: 'london', culture: 'british', medium: 'engraving' },
    },
    {
      schema: 'evavo.image-reference-work-order.v2',
      sourcePath: inventory[1].sourcePath,
      sourceSha256: inventory[1].sourceSha256,
      decision: 'keep',
      semanticRole: 'location-background',
      assignment: { portId: 'london', sceneId: 'docks' },
      preserve: ['front-on dock composition', 'period cargo detail'],
      removeOrFix: [],
      negativeConstraints: ['no modern containers'],
      operations: [],
      approvals,
      styleScope: { port: 'london', culture: 'british', medium: 'engraving' },
    },
    {
      schema: 'evavo.image-reference-work-order.v2',
      sourcePath: inventory[2].sourcePath,
      sourceSha256: inventory[2].sourceSha256,
      decision: 'recreate',
      semanticRole: 'standing-character',
      assignment: { portId: 'london', identityId: 'merchant_01', viewId: 'neutral' },
      preserve: ['coat silhouette'],
      removeOrFix: ['malformed hands'],
      negativeConstraints: ['no pseudo-text'],
      operations: [],
      approvals,
    },
    {
      schema: 'evavo.image-reference-work-order.v2',
      sourcePath: inventory[3].sourcePath,
      sourceSha256: inventory[3].sourceSha256,
      decision: 'reference-only',
      semanticRole: 'reference-unknown',
      preserve: ['crosshatch density'],
      removeOrFix: ['generic architecture'],
      negativeConstraints: ['do not copy subject identity'],
      operations: [],
      approvals,
      styleScope: { port: 'london', culture: 'british', medium: 'engraving' },
    },
    {
      schema: 'evavo.image-reference-work-order.v2',
      sourcePath: inventory[4].sourcePath,
      sourceSha256: inventory[4].sourceSha256,
      decision: 'keep',
      semanticRole: 'ui-icon',
      assignment: { identityId: 'map' },
      preserve: ['clear map silhouette'],
      removeOrFix: [],
      negativeConstraints: ['no gradients'],
      operations: [],
      approvals,
    },
  ];
  const bridge = {
    schema: 'evavo.brass-brine.art-studio-bridge.v1',
    roles: {
      'standing-character': {
        targetCanvas: { width: 512, height: 512 },
        alphaPolicy: 'meaningful-alpha-required',
        runtimeFormat: 'png',
        deliveryProfileId: 'godot-sprite-lossless',
        background: { mode: 'remove-border-matte', matteColour: '#000000' },
        defaultOperations: [
          'inspect',
          'connected-matte-to-alpha',
          'canvas-normalize',
          'alpha-analyze',
          'convert',
          'optimize',
        ],
        targetPathTemplate:
          'assets/art/ports/{port_id}/characters/named/{identity_id}/standing/{view_id}.png',
        exactCanvasRequired: true,
        processorOptions: { anchor: 'bottom-centre' },
      },
      'location-background': {
        targetCanvas: { width: 1280, height: 720 },
        alphaPolicy: 'opaque',
        runtimeFormat: 'png',
        deliveryProfileId: 'retro-scene-720p',
        background: { mode: 'preserve' },
        defaultOperations: [
          'inspect',
          'background-preserve',
          'alpha-analyze',
          'convert',
          'optimize',
        ],
        targetPathTemplate: 'assets/art/ports/{port_id}/locations/{scene_id}/base.png',
        exactCanvasRequired: true,
      },
      'ui-icon': {
        targetCanvas: { width: 256, height: 256 },
        alphaPolicy: 'meaningful-alpha-required',
        runtimeFormat: 'png',
        deliveryProfileId: 'retro-ui-icon-256',
        background: { mode: 'remove-border-matte', matteColour: '#000000' },
        defaultOperations: [
          'inspect',
          'connected-matte-to-alpha',
          'alpha-analyze',
          'convert',
          'optimize',
        ],
        targetPathTemplate: 'assets/art/ui/icons/{identity_id}.png',
        exactCanvasRequired: true,
      },
    },
  };
  const receipts = [
    {
      schema: 'evavo.art-delivery-optimization-receipt.v1',
      items: [
        {
          sourcePath: inventory[4].sourcePath,
          sourceSha256: inventory[4].sourceSha256,
          targetPath: 'assets/art/ui/icons/map.png',
          outputSha256: digest('9'),
          outputBytes: 400,
        },
      ],
    },
  ];
  await Promise.all([
    writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`),
    writeFile(decisionsPath, `${JSON.stringify(decisions, null, 2)}\n`),
    writeFile(bridgePath, `${JSON.stringify(bridge, null, 2)}\n`),
    writeFile(receiptsPath, `${JSON.stringify(receipts, null, 2)}\n`),
  ]);
  run('compile-raw-art-production-queue.mjs', [
    '--inventory',
    inventoryPath,
    '--decisions',
    decisionsPath,
    '--bridge',
    bridgePath,
    '--receipts',
    receiptsPath,
    '--source-root',
    'Brass_Brine',
    '--output',
    queuePath,
  ]);
  const queue = JSON.parse(await readFile(queuePath, 'utf8'));
  if (
    queue.schema !== 'evavo.raw-art-production-queue.v2' ||
    queue.counts['ready-deterministic'] !== 2 ||
    queue.counts['provider-required'] !== 1 ||
    queue.counts['reference-only'] !== 1 ||
    queue.counts.completed !== 1 ||
    queue.counts['blocked-missing-decision'] !== 1
  ) {
    throw new Error(`unexpected queue counts: ${JSON.stringify(queue.counts)}`);
  }
  const standing = queue.entries.find((entry) => entry.sourceSha256 === digest('a'));
  if (
    standing.targetPath !==
      'assets/art/ports/london/characters/named/dock_worker_01/standing/neutral.png' ||
    !standing.operations.includes('canvas-normalize')
  ) {
    throw new Error('standing character mapping or canvas normalization is incorrect');
  }
  const unreviewed = queue.entries.find((entry) => entry.sourceSha256 === digest('f'));
  if (unreviewed.state !== 'blocked-missing-decision') {
    throw new Error('receipt-free unreviewed source did not remain blocked');
  }

  run('build-approved-style-profile.mjs', [
    '--reviews',
    decisionsPath,
    '--output',
    stylePath,
    '--minimum-exemplars',
    '1',
  ]);
  const style = JSON.parse(await readFile(stylePath, 'utf8'));
  if (
    style.schema !== 'evavo.approved-style-reference-profile.v2' ||
    style.approvedProfiles < 2 ||
    style.modelTrainingPerformed !== false
  ) {
    throw new Error('approved metadata style profiles were not compiled correctly');
  }

  run('compile-raw-art-workspace-job.mjs', [
    '--queue',
    queuePath,
    '--workspace-root',
    path.join(temporary, 'workspace'),
    '--evidence-root',
    path.join(temporary, 'evidence'),
    '--art-studio-repo',
    'evavo-art-studio',
    '--source-root',
    'Brass_Brine',
    '--staging-root',
    '.evavo-art-staging',
    '--output',
    jobPath,
  ]);
  const job = JSON.parse(await readFile(jobPath, 'utf8'));
  const serialized = JSON.stringify(job);
  if (
    job.schema !== 'evavo.governed-workspace-job.v1' ||
    job.stagingOnly !== true ||
    !serialized.includes('run_art_delivery_optimizer.py') ||
    !serialized.includes('process_image_with_sharp.mjs') ||
    !serialized.includes('run-node') ||
    !serialized.includes('executableCandidates') ||
    !serialized.includes('"kind":"directory"')
  ) {
    throw new Error('workspace job did not bind batch and exact-canvas Sharp processor routes');
  }

  await mkdir(path.join(temporary, 'collision'), { recursive: true });
  const collisionDecisions = [...decisions, {
    ...decisions[4],
    sourcePath: inventory[5].sourcePath,
    sourceSha256: inventory[5].sourceSha256,
  }];
  const collisionPath = path.join(temporary, 'collision-decisions.json');
  await writeFile(collisionPath, `${JSON.stringify(collisionDecisions, null, 2)}\n`);
  const collisionOutput = path.join(temporary, 'collision', 'queue.json');
  run(
    'compile-raw-art-production-queue.mjs',
    [
      '--inventory',
      inventoryPath,
      '--decisions',
      collisionPath,
      '--bridge',
      bridgePath,
      '--source-root',
      'Brass_Brine',
      '--output',
      collisionOutput,
    ],
    1,
  );

  console.log(
    JSON.stringify({
      status: 'passed',
      contract: 'evavo_raw_art_production_orchestrator_fixture_v2',
      queueEntries: queue.entries.length,
      readyDeterministic: queue.counts['ready-deterministic'],
      providerRequired: queue.counts['provider-required'],
      approvedStyleProfiles: style.approvedProfiles,
      workspaceOperations: job.operations.length,
      sharpBatchAndExactCanvasRoutes: true,
      targetCollisionRejected: true,
    }),
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
