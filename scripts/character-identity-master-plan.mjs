#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REQUEST_SCHEMA = 'evavo.character-identity-master-request.v1';
export const PLAN_SCHEMA = 'evavo.character-identity-master-plan.v1';
export const PROTOCOL_VERSION = '2026-08-19.1';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
};
const text = (value, label, maximum = 4000) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  const result = value.trim().replace(/\s+/gu, ' ');
  if (result.length > maximum) throw new Error(`${label} exceeds ${maximum} characters`);
  return result;
};
const slug = (value, label) => {
  const result = text(value, label, 160).toLocaleLowerCase('en-US');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(result)) throw new Error(`${label} must be a lowercase kebab-case id`);
  return result;
};
const stringArray = (value, label, minimum = 1, maximum = 32) => {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${label} must contain between ${minimum} and ${maximum} entries`);
  }
  const result = value.map((entry, index) => text(entry, `${label}[${index}]`, 700));
  if (new Set(result.map((entry) => entry.toLocaleLowerCase('en-US'))).size !== result.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
  return Object.freeze(result);
};
const relative = (value, label) => {
  const result = text(value, label, 800);
  if (result.includes('\\') || path.posix.isAbsolute(result)) throw new Error(`${label} must be a forward-slash relative path`);
  const normalized = path.posix.normalize(result);
  if (normalized !== result || result === '.' || result === '..' || result.startsWith('../')) {
    throw new Error(`${label} must be canonical and stay inside its root`);
  }
  return result;
};
const positiveInteger = (value, label, minimum, maximum) => {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
};

export function normalizeIdentityMasterRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('request must be an object');
  if (input.schema !== REQUEST_SCHEMA) throw new Error(`request.schema must equal ${REQUEST_SCHEMA}`);
  const project = input.project;
  const character = input.character;
  const canvas = input.canvas;
  const style = input.style;
  const policy = input.policy;
  if (![project, character, canvas, style, policy].every((value) => value && typeof value === 'object' && !Array.isArray(value))) {
    throw new Error('project, character, canvas, style and policy must be objects');
  }
  const views = Array.isArray(input.views) ? input.views : null;
  if (!views || views.length < 2 || views.length > 8) throw new Error('views must contain between 2 and 8 entries');
  const normalizedViews = views.map((view, index) => {
    if (!view || typeof view !== 'object' || Array.isArray(view)) throw new Error(`views[${index}] must be an object`);
    return Object.freeze({
      id: slug(view.id, `views[${index}].id`),
      label: text(view.label, `views[${index}].label`, 200),
      prompt: text(view.prompt, `views[${index}].prompt`, 1600),
    });
  });
  if (new Set(normalizedViews.map((view) => view.id)).size !== normalizedViews.length) throw new Error('view ids must be unique');

  const result = Object.freeze({
    schema: REQUEST_SCHEMA,
    requestId: slug(input.requestId, 'requestId'),
    project: Object.freeze({
      id: slug(project.id, 'project.id'),
      title: text(project.title, 'project.title', 240),
    }),
    character: Object.freeze({
      id: slug(character.id, 'character.id'),
      label: text(character.label, 'character.label', 240),
      role: slug(character.role, 'character.role'),
      identityContract: relative(character.identityContract, 'character.identityContract'),
    }),
    purpose: text(input.purpose, 'purpose', 600),
    candidateSets: positiveInteger(input.candidateSets, 'candidateSets', 1, 8),
    canvas: Object.freeze({
      width: positiveInteger(canvas.width, 'canvas.width', 64, 2048),
      height: positiveInteger(canvas.height, 'canvas.height', 64, 2048),
      alpha: text(canvas.alpha, 'canvas.alpha', 32),
    }),
    views: Object.freeze(normalizedViews),
    style: Object.freeze({
      lock: text(style.lock, 'style.lock', 6000),
      continuity: text(style.continuity, 'style.continuity', 4000),
      mustHave: stringArray(style.mustHave, 'style.mustHave'),
      mustAvoid: stringArray(style.mustAvoid, 'style.mustAvoid'),
      originality: text(style.originality, 'style.originality', 2400),
    }),
    outputRoot: relative(input.outputRoot, 'outputRoot'),
    policy: Object.freeze({
      protectedReconstructionAllowed: policy.protectedReconstructionAllowed === true,
      runtimeAsset: policy.runtimeAsset === true,
      animationFamily: policy.animationFamily === true,
      providerExecution: policy.providerExecution === true,
      providerAuthorizationRequired: policy.providerAuthorizationRequired === true,
      promotion: policy.promotion === true,
      separateFiles: policy.separateFiles === true,
      reviewRequired: policy.reviewRequired === true,
    }),
  });
  if (result.canvas.alpha !== 'transparent') throw new Error('identity master candidates must use transparent alpha');
  if (result.policy.protectedReconstructionAllowed) throw new Error('protected-character reconstruction is forbidden');
  if (result.policy.runtimeAsset || result.policy.animationFamily || result.policy.providerExecution || result.policy.promotion) {
    throw new Error('identity master planning may not claim runtime, animation-family, provider-execution or promotion authority');
  }
  if (!result.policy.providerAuthorizationRequired || !result.policy.separateFiles || !result.policy.reviewRequired) {
    throw new Error('identity master planning requires separate files, review and a later provider authorization');
  }
  return result;
}

function targetPath(outputRoot, setNumber, viewId) {
  return path.posix.join(outputRoot, `candidate-set-${String(setNumber).padStart(2, '0')}`, `${viewId}.png`);
}

function candidatePrompt(request, view, continuityKey) {
  return [
    `Original character identity candidate for ${request.project.title}.`,
    `Character: ${request.character.label} (${request.character.role}).`,
    `View: ${view.label}. ${view.prompt}`,
    `Style lock: ${request.style.lock}`,
    `Continuity: ${request.style.continuity}`,
    `Required: ${request.style.mustHave.join('; ')}.`,
    `Avoid: ${request.style.mustAvoid.join('; ')}.`,
    `Originality: ${request.style.originality}`,
    `Continuity key: ${continuityKey}. Preserve the same identity across every view in this candidate set.`,
    'Transparent background. Separate single-view image only. No contact sheet, labels, watermark or readable text.',
  ].join(' ');
}

export function compileIdentityMasterPlan(input) {
  const request = normalizeIdentityMasterRequest(input);
  const requestSha256 = sha256(canonical(request));
  const candidateSets = [];
  for (let setNumber = 1; setNumber <= request.candidateSets; setNumber += 1) {
    const setId = `candidate-set-${String(setNumber).padStart(2, '0')}`;
    const continuityKey = `${request.project.id}:${request.character.id}:${setId}`;
    const jobs = request.views.map((view) => Object.freeze({
      jobId: `${setId}-${view.id}`,
      setId,
      continuityKey,
      characterId: request.character.id,
      viewId: view.id,
      operation: 'generate',
      dimensions: request.canvas,
      targetPath: targetPath(request.outputRoot, setNumber, view.id),
      prompt: candidatePrompt(request, view, continuityKey),
      providerExecution: false,
      providerAuthorizationRequired: true,
      runtimeAsset: false,
      promotion: false,
    }));
    candidateSets.push(Object.freeze({ setId, continuityKey, jobs: Object.freeze(jobs) }));
  }
  const base = {
    schema: PLAN_SCHEMA,
    protocolVersion: PROTOCOL_VERSION,
    requestId: request.requestId,
    requestSha256,
    project: request.project,
    character: request.character,
    purpose: request.purpose,
    candidateSetCount: request.candidateSets,
    viewCount: request.views.length,
    totalJobs: request.candidateSets * request.views.length,
    outputRoot: request.outputRoot,
    candidateSets: Object.freeze(candidateSets),
    authority: Object.freeze({
      planning: true,
      providerExecution: false,
      providerAuthorizationRequired: true,
      runtimeAsset: false,
      animationFamily: false,
      approval: false,
      promotion: false,
      publication: false,
      gitMutation: false,
    }),
    nextGate: 'explicit identity-bootstrap provider admission/authorization before candidate generation; separate identity approval before downstream sprite production',
  };
  const planSha256 = sha256(canonical(base));
  return Object.freeze({ ...base, planSha256 });
}

function parseArgs(argv) {
  const command = argv[0];
  const values = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--') || values.has(name)) {
      throw new Error('arguments must be unique --name value pairs');
    }
    values.set(name, value);
  }
  return { command, values };
}

export async function main(argv = process.argv.slice(2)) {
  const { command, values } = parseArgs(argv);
  const inputPath = values.get('--input');
  if (!command || !inputPath || !['validate', 'compile', 'summary'].includes(command)) {
    throw new Error('usage: character-identity-master-plan.mjs <validate|compile|summary> --input <request.json> [--output <plan.json>]');
  }
  const bytes = await readFile(path.resolve(inputPath));
  const input = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, ''));
  const plan = compileIdentityMasterPlan(input);
  if (command === 'validate') {
    process.stdout.write(`${JSON.stringify({ status: 'passed', requestId: plan.requestId, requestSha256: plan.requestSha256, providerExecution: false })}\n`);
    return;
  }
  if (command === 'summary') {
    process.stdout.write(`${JSON.stringify({ status: 'passed', requestId: plan.requestId, planSha256: plan.planSha256, candidateSetCount: plan.candidateSetCount, viewCount: plan.viewCount, totalJobs: plan.totalJobs, providerExecution: false })}\n`);
    return;
  }
  const outputPath = values.get('--output');
  if (!outputPath) throw new Error('compile requires --output <plan.json>');
  await writeFile(path.resolve(outputPath), `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ status: 'passed', requestId: plan.requestId, planSha256: plan.planSha256, output: path.resolve(outputPath), providerExecution: false, promotion: false })}\n`);
}

const directlyInvoked = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (directlyInvoked) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 2;
  });
}
