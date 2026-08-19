#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const EVIDENCE_KIND = 'evavo-character-identity-candidate-evidence';
export const REVIEW_PLAN_SCHEMA = 'evavo.character-identity-candidate-review-plan.v1';
export const PROTOCOL_VERSION = '2026-08-19.1';
export const REQUIRED_CHECKS = Object.freeze([
  'identityStableAcrossViews',
  'independentDirectionalAuthorship',
  'handednessStable',
  'distinctiveMotifsPresent',
  'prohibitedGenericMotifsRejected',
  'protectedReconstructionRejected',
  'materialLanguageConsistent',
  'silhouetteReadable',
  'baselineSuitable',
  'pivotPolicySuitable',
  'watermarksRejected',
]);

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

function validateEvidence(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('candidate evidence must be an object');
  if (input.kind !== EVIDENCE_KIND) throw new Error(`candidate evidence kind must equal ${EVIDENCE_KIND}`);
  const projectId = text(input.projectId, 'projectId', 160);
  const characterId = text(input.characterId, 'characterId', 160);
  const identityContract = text(input.identityContract, 'identityContract', 1000);
  const candidateOrigin = text(input.candidateOrigin, 'candidateOrigin', 100);
  if (!['provider-generated', 'project-owned', 'newly-authored-local'].includes(candidateOrigin)) throw new Error('candidateOrigin is unsupported');
  if (!Array.isArray(input.candidateSets) || input.candidateSets.length < 1 || input.candidateSets.length > 8) throw new Error('candidateSets must contain between one and eight sets');
  const setIds = new Set();
  const sets = input.candidateSets.map((candidateSet, setIndex) => {
    if (!candidateSet || typeof candidateSet !== 'object' || Array.isArray(candidateSet)) throw new Error(`candidateSets[${setIndex}] must be an object`);
    const setId = text(candidateSet.setId, `candidateSets[${setIndex}].setId`, 160);
    if (setIds.has(setId)) throw new Error(`duplicate candidate set id ${setId}`);
    setIds.add(setId);
    const continuityKey = text(candidateSet.continuityKey, `candidateSets[${setIndex}].continuityKey`, 300);
    if (!Array.isArray(candidateSet.views) || candidateSet.views.length !== 3) throw new Error(`candidate set ${setId} must contain exactly three views`);
    const expected = ['full-body-right', 'full-body-left', 'neutral-bust'];
    const views = candidateSet.views.map((view, index) => {
      if (!view || typeof view !== 'object' || Array.isArray(view)) throw new Error(`candidate set ${setId} view ${index} is invalid`);
      if (view.viewId !== expected[index]) throw new Error(`candidate set ${setId} view order drifted`);
      if (view.width !== 512 || view.height !== 512 || view.alpha !== 'transparent') throw new Error(`candidate set ${setId} view dimensions/alpha drifted`);
      return Object.freeze({
        viewId: view.viewId,
        artifactRef: text(view.artifactRef, `${setId}.${view.viewId}.artifactRef`, 2000),
        sha256: hex64(view.sha256, `${setId}.${view.viewId}.sha256`),
      });
    });
    return Object.freeze({ setId, continuityKey, views: Object.freeze(views) });
  });
  const authority = input.authority;
  if (!authority || typeof authority !== 'object' || authority.candidateEvidenceOnly !== true || authority.identityApproved !== false || authority.runtimeAsset !== false || authority.animationFamily !== false || authority.promotion !== false) {
    throw new Error('candidate evidence authority must remain review-only and unapproved');
  }
  return Object.freeze({ projectId, characterId, identityContract, candidateOrigin, sets: Object.freeze(sets) });
}

export function compileIdentityCandidateReviewPlan(input) {
  const evidence = validateEvidence(input);
  const evidenceSha256 = sha256(canonical(input));
  const reviewSets = evidence.sets.map((candidateSet) => Object.freeze({
    setId: candidateSet.setId,
    continuityKey: candidateSet.continuityKey,
    views: candidateSet.views,
    checks: Object.freeze(REQUIRED_CHECKS.map((id) => Object.freeze({ id, status: 'pending', evidence: null, notes: '' }))),
    allowedDecisions: Object.freeze(['rejected', 'shortlisted', 'selected']),
    decision: null,
  }));
  const base = {
    schema: REVIEW_PLAN_SCHEMA,
    protocolVersion: PROTOCOL_VERSION,
    projectId: evidence.projectId,
    characterId: evidence.characterId,
    identityContract: evidence.identityContract,
    candidateOrigin: evidence.candidateOrigin,
    sourceCandidateEvidenceSha256: evidenceSha256,
    setCount: reviewSets.length,
    reviewSets: Object.freeze(reviewSets),
    selectionPolicy: Object.freeze({
      exactlyOneSelectedSetRequiredForCompletion: true,
      allChecksMustPassForSelectedSet: true,
      selectionGrantsIdentityApproval: false,
      separateIdentityApprovalReceiptRequired: true,
    }),
    authority: Object.freeze({
      providerExecution: false,
      candidateMutation: false,
      selectionPerformed: false,
      identityApproved: false,
      runtimeAsset: false,
      animationFamily: false,
      promotion: false,
      publication: false,
      gitMutation: false,
    }),
    nextGate: 'complete bounded visual review evidence, select exactly one fully passing set if appropriate, then author a separate identity approval receipt; review planning never approves identity',
  };
  return Object.freeze({ ...base, reviewPlanSha256: sha256(canonical(base)) });
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
    throw new Error('usage: character-identity-candidate-review-plan.mjs <validate|compile|summary> --input <candidate-evidence.json> [--output <review-plan.json>]');
  }
  const bytes = await readFile(path.resolve(inputPath));
  const input = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, ''));
  const plan = compileIdentityCandidateReviewPlan(input);
  if (command === 'validate') {
    process.stdout.write(`${JSON.stringify({ status: 'passed', reviewPlanSha256: plan.reviewPlanSha256, setCount: plan.setCount, identityApproved: false })}\n`);
    return;
  }
  if (command === 'summary') {
    process.stdout.write(`${JSON.stringify({ status: 'passed', characterId: plan.characterId, candidateOrigin: plan.candidateOrigin, setCount: plan.setCount, selectionPerformed: false, identityApproved: false })}\n`);
    return;
  }
  const output = values.get('--output');
  if (!output) throw new Error('compile requires --output <review-plan.json>');
  await writeFile(path.resolve(output), `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ status: 'passed', output: path.resolve(output), reviewPlanSha256: plan.reviewPlanSha256, providerExecution: false, identityApproved: false })}\n`);
}

const directlyInvoked = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (directlyInvoked) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 2;
  });
}
