#!/usr/bin/env node
import { open, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compileCouncilAvatarIdentityLockApproval,
  validateCouncilAvatarIdentityLockApproval,
} from './project-art/council-avatar-identity-lock-approval.mjs';

function usage() {
  return [
    'Project Art Council avatar identity-lock approval',
    '',
    'Usage:',
    '  node scripts/approve-project-art-council-avatar-identity-lock.mjs --handoff <handoff.json> --plan <review-plan.json> --decisions <review-decisions.json> --receipt <review-receipt.json> --approved-by <identity> --approved-at <canonical-UTC> --reason <reason> --output <new-approval.json>',
    '',
    'This command performs no provider call, promotion, repository mutation, runtime activation, website activation, publication or deployment.',
    'It accepts only a finalized human/hybrid review with exactly one fully-passed kept candidate per reviewed Council identity.',
  ].join('\n');
}

const NAMES = [
  '--handoff',
  '--plan',
  '--decisions',
  '--receipt',
  '--approved-by',
  '--approved-at',
  '--reason',
  '--output',
];
const SUPPORTED = new Set(NAMES);

function parse(argv) {
  if (argv.length % 2 !== 0) throw new Error(usage());
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!SUPPORTED.has(name) || !value?.trim() || values.has(name)) {
      throw new Error(usage());
    }
    values.set(name, value.trim());
  }
  for (const name of NAMES) {
    if (!values.has(name)) throw new Error(`Missing ${name}.\n\n${usage()}`);
  }
  return values;
}

async function readJson(filePath, label) {
  let value;
  try {
    value = JSON.parse(await readFile(path.resolve(filePath), 'utf8'));
  } catch (error) {
    throw new Error(`${label} could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
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

export async function runCouncilAvatarIdentityLockApprovalCli(argv = process.argv.slice(2)) {
  const values = parse(argv);
  const approval = compileCouncilAvatarIdentityLockApproval({
    handoff: await readJson(values.get('--handoff'), 'Council review handoff'),
    plan: await readJson(values.get('--plan'), 'Project Art review plan'),
    decisions: await readJson(values.get('--decisions'), 'Project Art review decisions'),
    receipt: await readJson(values.get('--receipt'), 'Project Art review receipt'),
    approvedBy: values.get('--approved-by'),
    approvedAt: values.get('--approved-at'),
    reason: values.get('--reason'),
  });
  validateCouncilAvatarIdentityLockApproval(approval);
  const output = await writeCreateOnly(values.get('--output'), approval);
  return Object.freeze({
    status: approval.status,
    schema: approval.schema,
    approvalSha256: approval.approvalSha256,
    approvedCharacterIds: Object.freeze(approval.locks.map((lock) => lock.characterId)),
    output,
    providerExecutionPerformed: false,
    candidatePromotionPerformed: false,
    runtimeActivationPerformed: false,
    websiteActivationPerformed: false,
    repositoryMutationPerformed: false,
    publicationPerformed: false,
    deploymentPerformed: false,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(await runCouncilAvatarIdentityLockApprovalCli())}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      status: 'failed',
      code: 'COUNCIL_AVATAR_IDENTITY_LOCK_APPROVAL_FAILED',
      error: error instanceof Error ? error.message : String(error),
    })}\n`);
    process.exitCode = 1;
  }
}
