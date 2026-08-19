#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const INPUT_SCHEMA = 'evavo.character-identity-master-plan.v1';
export const ADMISSION_SCHEMA = 'evavo.character-identity-bootstrap-admission-plan.v1';
export const PROTOCOL_VERSION = '2026-08-19.1';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
};
const text = (value, label, maximum = 4000) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  const result = value.trim();
  if (result.length > maximum) throw new Error(`${label} exceeds ${maximum} characters`);
  return result;
};
const hex64 = (value, label) => {
  const result = text(value, label, 64).toLocaleLowerCase('en-US');
  if (!/^[0-9a-f]{64}$/u.test(result)) throw new Error(`${label} must be a lowercase SHA-256`);
  return result;
};
const relative = (value, label) => {
  const result = text(value, label, 1000);
  if (result.includes('\\') || path.posix.isAbsolute(result)) throw new Error(`${label} must be a forward-slash relative path`);
  const normalized = path.posix.normalize(result);
  if (normalized !== result || result === '.' || result === '..' || result.startsWith('../')) throw new Error(`${label} must be canonical and bounded`);
  return result;
};

function verifyMasterPlan(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('identity-master plan must be an object');
  if (input.schema !== INPUT_SCHEMA || input.protocolVersion !== PROTOCOL_VERSION) throw new Error('unexpected identity-master plan schema/protocol');
  const declared = hex64(input.planSha256, 'plan.planSha256');
  const body = { ...input };
  delete body.planSha256;
  if (sha256(canonical(body)) !== declared) throw new Error('identity-master plan self hash mismatch');
  if (input.authority?.providerExecution !== false || input.authority?.providerAuthorizationRequired !== true) {
    throw new Error('identity-master plan authority must remain provider-free and require later authorization');
  }
  if (input.authority?.runtimeAsset !== false || input.authority?.animationFamily !== false || input.authority?.approval !== false || input.authority?.promotion !== false) {
    throw new Error('identity-master plan may not grant runtime, animation, approval or promotion authority');
  }
  if (!Array.isArray(input.candidateSets) || input.candidateSets.length < 1 || input.candidateSets.length > 8) {
    throw new Error('identity-master plan candidateSets are invalid');
  }
  return input;
}

export function compileIdentityBootstrapAdmission(input) {
  const masterPlan = verifyMasterPlan(input);
  const sourcePlanSha256 = masterPlan.planSha256;
  const requests = [];
  const targets = new Set();
  for (const candidateSet of masterPlan.candidateSets) {
    if (!candidateSet || typeof candidateSet !== 'object' || !Array.isArray(candidateSet.jobs)) throw new Error('candidate set jobs are invalid');
    for (const job of candidateSet.jobs) {
      if (!job || typeof job !== 'object') throw new Error('identity candidate job must be an object');
      if (job.operation !== 'generate' || job.providerExecution !== false || job.providerAuthorizationRequired !== true) {
        throw new Error('identity candidate job crossed provider authorization boundary');
      }
      if (job.runtimeAsset !== false || job.promotion !== false) throw new Error('identity candidate job may not be runtime/promoted art');
      const targetPath = relative(job.targetPath, 'job.targetPath');
      if (targets.has(targetPath.toLocaleLowerCase('en-US'))) throw new Error(`duplicate identity candidate target: ${targetPath}`);
      targets.add(targetPath.toLocaleLowerCase('en-US'));
      requests.push(Object.freeze({
        admissionItemId: sha256(`${sourcePlanSha256}:${job.jobId}`).slice(0, 24),
        sourcePlanSha256,
        characterId: text(job.characterId, 'job.characterId', 160),
        setId: text(job.setId, 'job.setId', 160),
        continuityKey: text(job.continuityKey, 'job.continuityKey', 300),
        jobId: text(job.jobId, 'job.jobId', 200),
        viewId: text(job.viewId, 'job.viewId', 160),
        operation: 'generate',
        dimensions: job.dimensions,
        targetPath,
        prompt: text(job.prompt, 'job.prompt', 10000),
        identityBootstrapOnly: true,
        providerSelectionDeferred: true,
        providerRuntimeProfileRequired: true,
        providerExecution: false,
        providerAuthorizationRequired: true,
        runtimeAsset: false,
        animationFamily: false,
        approvalByGeneration: false,
        promotion: false,
        publication: false,
        gitMutation: false,
      }));
    }
  }
  if (requests.length !== masterPlan.totalJobs) throw new Error('identity bootstrap admission request count differs from source plan');
  const base = {
    schema: ADMISSION_SCHEMA,
    protocolVersion: PROTOCOL_VERSION,
    project: masterPlan.project,
    character: masterPlan.character,
    sourceIdentityMasterPlanSha256: sourcePlanSha256,
    sourceRequestSha256: masterPlan.requestSha256,
    scope: 'identity-master-candidates-only',
    requestCount: requests.length,
    requests: Object.freeze(requests),
    authority: Object.freeze({
      admissionPlanning: true,
      providerSelection: false,
      providerExecution: false,
      providerAuthorizationRequired: true,
      runtimeAsset: false,
      animationFamily: false,
      approval: false,
      promotion: false,
      publication: false,
      gitMutation: false,
    }),
    requiredNextEvidence: Object.freeze([
      'provider runtime profile and adapter selection',
      'provider admission receipt binding this admission plan',
      'time-bounded provider execution authorization',
      'candidate generation receipts and exact artifact hashes',
      'separate identity continuity review and approval receipt before downstream production',
    ]),
    nextGate: 'explicit Art Studio provider selection, admission and time-bounded authorization for identity-master-candidates-only generation; generation itself never approves identity',
  };
  return Object.freeze({ ...base, admissionPlanSha256: sha256(canonical(base)) });
}

function parseArgs(argv) {
  const command = argv[0];
  const values = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--') || values.has(name)) throw new Error('arguments must be unique --name value pairs');
    values.set(name, value);
  }
  return { command, values };
}

export async function main(argv = process.argv.slice(2)) {
  const { command, values } = parseArgs(argv);
  const inputPath = values.get('--input');
  if (!command || !inputPath || !['validate', 'compile', 'summary'].includes(command)) {
    throw new Error('usage: character-identity-bootstrap-admission.mjs <validate|compile|summary> --input <identity-master-plan.json> [--output <admission.json>]');
  }
  const bytes = await readFile(path.resolve(inputPath));
  const input = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, ''));
  const plan = compileIdentityBootstrapAdmission(input);
  if (command === 'validate') {
    process.stdout.write(`${JSON.stringify({ status: 'passed', admissionPlanSha256: plan.admissionPlanSha256, requestCount: plan.requestCount, providerExecution: false })}\n`);
    return;
  }
  if (command === 'summary') {
    process.stdout.write(`${JSON.stringify({ status: 'passed', characterId: plan.character.id, scope: plan.scope, requestCount: plan.requestCount, providerExecution: false, providerAuthorizationRequired: true })}\n`);
    return;
  }
  const outputPath = values.get('--output');
  if (!outputPath) throw new Error('compile requires --output <admission.json>');
  await writeFile(path.resolve(outputPath), `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ status: 'passed', output: path.resolve(outputPath), admissionPlanSha256: plan.admissionPlanSha256, providerExecution: false, providerAuthorizationRequired: true })}\n`);
}

const directlyInvoked = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (directlyInvoked) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 2;
  });
}
