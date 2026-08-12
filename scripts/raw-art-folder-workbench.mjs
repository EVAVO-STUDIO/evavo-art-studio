#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export * from './raw-art-folder/lib.mjs';
export * from './raw-art-folder/scan.mjs';
export * from './raw-art-folder/plan.mjs';
export * from './raw-art-folder/session.mjs';
export * from './avatar-frame-catalogue.mjs';

import { writeJsonCreateOnly } from './raw-art-folder/lib.mjs';
import { scanRawArtFolder } from './raw-art-folder/scan.mjs';
import { compileRawArtSessionPlan } from './raw-art-folder/plan.mjs';
import { materializeRawArtSession, verifyRawArtSession } from './raw-art-folder/session.mjs';
import {
  compileAvatarFrameSequencePlan,
  reviewAvatarFrameRoot,
  verifyAvatarFrameSequencePlan,
} from './avatar-frame-catalogue.mjs';
import { readJson } from './raw-art-folder/lib.mjs';

function args(argv) {
  const [command, ...rest] = argv;
  const out = { command };
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    if (!key?.startsWith('--')) throw new Error(`Invalid argument ${key}.`);
    out[key.slice(2)] = rest[index + 1];
  }
  return out;
}

export async function main(argv = process.argv.slice(2)) {
  const a = args(argv);
  if (a.command === 'scan') {
    const value = await scanRawArtFolder({ rawArtRoot: a['raw-art-root'], generatedAt: a['generated-at'], maximumFiles: a['maximum-files'], maximumBytes: a['maximum-bytes'] });
    await writeJsonCreateOnly(a.output, value);
    return { status: 'written', outputPath: path.resolve(a.output), inventorySha256: value.inventorySha256, totals: value.totals };
  }
  if (a.command === 'plan') {
    const value = await compileRawArtSessionPlan({ inventoryPath: a.inventory, decisionsPath: a.decisions, compiledAt: a['compiled-at'] });
    await writeJsonCreateOnly(a.output, value);
    return { status: 'planned', outputPath: path.resolve(a.output), planSha256: value.planSha256, operationCount: value.operations.length };
  }
  if (a.command === 'materialize') return materializeRawArtSession({ planPath: a.plan });
  if (a.command === 'verify') return verifyRawArtSession({ sessionRoot: a['session-root'] });
  if (a.command === 'avatar-review') {
    const value = await reviewAvatarFrameRoot({ rawArtRoot: a['raw-art-root'], characterId: a['character-id'], packetSize: a['packet-size'], generatedAt: a['generated-at'], maximumFiles: a['maximum-files'], maximumBytes: a['maximum-bytes'] });
    await writeJsonCreateOnly(a.output, value);
    return { status: 'written', outputPath: path.resolve(a.output), reviewPacketsSha256: value.reviewPacketsSha256, totals: value.totals };
  }
  if (a.command === 'avatar-plan') {
    const value = await compileAvatarFrameSequencePlan({ inventoryPath: a.inventory, decisionsPath: a.decisions, compiledAt: a['compiled-at'] });
    await writeJsonCreateOnly(a.output, value);
    return { status: 'planned', outputPath: path.resolve(a.output), planSha256: value.planSha256, sequenceCount: value.sequences.length };
  }
  if (a.command === 'avatar-verify-plan') {
    const { value } = await readJson(a.plan, 'planPath');
    const verified = verifyAvatarFrameSequencePlan(value);
    return { status: 'passed', planSha256: verified.planSha256, sequenceCount: verified.sequences.length };
  }
  throw new Error('Command must be scan, plan, materialize, verify, avatar-review, avatar-plan or avatar-verify-plan.');
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main().then((value) => process.stdout.write(`${JSON.stringify(value)}\n`)).catch((error) => {
  process.stderr.write(`${error.code ?? 'RAW_ART_FOLDER_ERROR'}: ${error.message}\n`);
  process.exitCode = 1;
});
