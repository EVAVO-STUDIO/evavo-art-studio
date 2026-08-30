#!/usr/bin/env node
import { open, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compileCouncilAvatarDirectionMasterApproval,
  validateCouncilAvatarDirectionMasterApproval,
} from './project-art/council-avatar-direction-master-approval.mjs';

function usage() {
  return [
    'Project Art Council avatar direction-master approval',
    '',
    'Usage:',
    '  node scripts/approve-project-art-council-avatar-direction-masters.mjs --handoff <handoff.json> --plan <review-plan.json> --decisions <review-decisions.json> --receipt <review-receipt.json> --approved-by <identity> --approved-at <canonical-UTC> --reason <reason> --output <new-approval.json>',
    '',
    'The finalized review must be human or hybrid, cover all twelve candidates, and keep exactly one fully-passed candidate for each of six required character/view pairs.',
    'This command grants direction-master approval only. It does not grant animation execution, candidate promotion, runtime activation, website activation, publication or deployment authority.',
  ].join('\n');
}

const REQUIRED = new Set([
  '--handoff',
  '--plan',
  '--decisions',
  '--receipt',
  '--approved-by',
  '--approved-at',
  '--reason',
  '--output',
]);

function parse(argv) {
  if (argv.length % 2 !== 0) throw new Error(usage());
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!REQUIRED.has(name) || !value?.trim() || values.has(name)) throw new Error(usage());
    values.set(name, value.trim());
  }
  for (const name of REQUIRED) {
    if (!values.has(name)) throw new Error(`Missing ${name}.\n\n${usage()}`);
  }
  return values;
}

async function readJson(filePath, label) {
  const value = JSON.parse(await readFile(path.resolve(filePath), 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

async function writeCreateOnly(filePath, value) {
  const absolute = path.resolve(filePath);
  const handle = await open(absolute, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } finally {
    await handle.close();
  }
  return absolute;
}

export async function runCouncilAvatarDirectionApprovalCli(argv = process.argv.slice(2)) {
  const values = parse(argv);
  const [handoff, plan, decisions, receipt] = await Promise.all([
    readJson(values.get('--handoff'), 'direction review handoff'),
    readJson(values.get('--plan'), 'review plan'),
    readJson(values.get('--decisions'), 'review decisions'),
    readJson(values.get('--receipt'), 'review receipt'),
  ]);
  const approval = compileCouncilAvatarDirectionMasterApproval({
    handoff,
    plan,
    decisions,
    receipt,
    approvedBy: values.get('--approved-by'),
    approvedAt: values.get('--approved-at'),
    reason: values.get('--reason'),
  });
  validateCouncilAvatarDirectionMasterApproval(approval);
  const output = await writeCreateOnly(values.get('--output'), approval);
  return Object.freeze({
    status: approval.status,
    schema: approval.schema,
    approvalSha256: approval.approvalSha256,
    lockCount: approval.locks.length,
    output,
    directionMasterApprovalPerformed: true,
    animationProductionAuthorized: false,
    candidatePromotionPerformed: false,
    runtimeActivationPerformed: false,
    websiteActivationPerformed: false,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(await runCouncilAvatarDirectionApprovalCli())}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      status: 'failed',
      code: 'COUNCIL_AVATAR_DIRECTION_MASTER_APPROVAL_FAILED',
      error: error instanceof Error ? error.message : String(error),
    })}\n`);
    process.exitCode = 1;
  }
}
