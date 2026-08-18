#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const SCHEMA = 'evavo.mobile-identity-provider-execution-plan.v1';
function fail(message) { throw new Error(message); }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`); return value; }
function text(value, label, max = 512) { if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label} must be non-empty text`); return value.trim(); }
function sha(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function safePath(value, label) { const result = text(value, label).replaceAll('\\', '/'); if (result.startsWith('/') || /^[A-Za-z]:\//u.test(result) || result.split('/').includes('..')) fail(`${label} must be repository-relative`); return result; }
function readJson(file) { const target = resolve(file); const stat = lstatSync(target); if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > 1024 * 1024) fail('input must be a regular JSON file <= 1 MiB'); return JSON.parse(readFileSync(target, 'utf8')); }
function executionStep(id, argv, creates, authority) { return Object.freeze({ id, argv: Object.freeze(argv), command: argv.join(' '), creates, authority }); }

export function compileMobileIdentityExecutionPlan(input) {
  const root = object(input, 'input');
  const request = object(root.providerRequest, 'providerRequest');
  if (request.schema !== 'evavo.mobile-identity-provider-request.v1') fail('providerRequest must use evavo.mobile-identity-provider-request.v1');
  if (request.status !== 'provider-request-ready') fail('providerRequest must be ready');
  const nativeRequest = object(request.providerRequest, 'providerRequest.providerRequest');
  if (nativeRequest.assetKind !== 'ui' || nativeRequest.continuityPhase !== 'identity-master' || nativeRequest.operation !== 'generate') fail('provider request is not a mobile identity-master generation request');
  const preferredAdapterId = text(nativeRequest.selection?.preferredAdapterId, 'preferredAdapterId', 160);
  const allowedAdapterIds = Array.isArray(nativeRequest.selection?.allowedAdapterIds) ? nativeRequest.selection.allowedAdapterIds.map((entry) => text(entry, 'allowedAdapterId', 160)) : [];
  if (!allowedAdapterIds.includes(preferredAdapterId)) fail('preferred adapter must be explicitly allowed');
  if (allowedAdapterIds.some((id) => id === 'gpt-image' || id === 'openai-image' || id === 'comfyui')) fail('execution plan cannot contain generic provider aliases');

  const paths = object(root.paths, 'paths');
  const runtimeBatch = safePath(paths.runtimeBatch, 'paths.runtimeBatch');
  const selection = safePath(paths.selection, 'paths.selection');
  const admissionReceipt = safePath(paths.admissionReceipt, 'paths.admissionReceipt');
  const authorization = safePath(paths.authorization, 'paths.authorization');
  const executionReceipt = safePath(paths.executionReceipt, 'paths.executionReceipt');
  const runtimeRoot = safePath(paths.runtimeRoot, 'paths.runtimeRoot');
  const artifactRoot = safePath(paths.artifactRoot, 'paths.artifactRoot');
  const workOrderId = text(root.workOrderId, 'workOrderId', 160);

  const actor = text(root.actor ?? 'evavo-mobile-identity-orchestrator', 'actor', 160);
  const selectedAt = text(root.selectedAt, 'selectedAt', 64);
  const admittedAt = text(root.admittedAt ?? selectedAt, 'admittedAt', 64);
  const authorizedAt = text(root.authorizedAt ?? admittedAt, 'authorizedAt', 64);
  const expiresAt = text(root.expiresAt, 'expiresAt', 64);
  if (Date.parse(expiresAt) <= Date.parse(authorizedAt)) fail('expiresAt must be after authorizedAt');

  const steps = [
    executionStep('select', ['node', 'scripts/select-raw-art-provider-runtime-jobs.mjs', '--runtime-batch', runtimeBatch, '--work-orders', workOrderId, '--selected-at', selectedAt, '--selected-by', actor, '--reason', 'mobile-identity-provider-generation', '--output', selection], selection, 'selection-only'),
    executionStep('admit', ['node', 'scripts/admit-raw-art-provider-runtime-batch.mjs', '--runtime-batch', runtimeBatch, '--selection', selection, '--runtime-root', runtimeRoot, '--actor', actor, '--admitted-at', admittedAt, '--receipt', admissionReceipt], admissionReceipt, 'runtime-admission-only'),
    executionStep('authorize', ['node', 'scripts/authorize-raw-art-provider-runtime-execution.mjs', '--runtime-batch', runtimeBatch, '--selection', selection, '--admission-receipt', admissionReceipt, '--runtime-root', runtimeRoot, '--artifact-root', artifactRoot, '--authorized-at', authorizedAt, '--expires-at', expiresAt, '--authorized-by', actor, '--reason', 'approved-mobile-identity-provider-generation', '--allowed-adapters', allowedAdapterIds.join(','), '--output', authorization], authorization, 'time-bounded-adapter-scoped-provider-execution'),
    executionStep('execute', ['node', 'scripts/mobile-identity-production.mjs', 'execute-authorized', '--authorization', authorization, '--worker-id', 'mobile-identity-worker', '--worker-command', 'until-idle', '--receipt', executionReceipt], executionReceipt, 'unapproved-candidate-and-evidence-creation-only'),
  ];

  const plan = {
    schema: SCHEMA,
    status: 'governed-execution-ready',
    sourceProviderRequestSha256: request.providerRequestSha256,
    workOrderId,
    provider: {
      preferredAdapterId,
      preferredModel: nativeRequest.selection?.preferredModel ?? null,
      allowedAdapterIds,
    },
    prerequisites: [
      'runtime batch has already been compiled through the existing RAW_ART provider request/batch path',
      'workOrderId belongs to the mobile identity request in that runtime batch',
      'provider credentials remain environment/runtime concerns and are never written into this plan',
    ],
    steps,
    postconditions: [
      'provider outputs remain unapproved Art Studio candidates',
      'candidate review and raster approval are still required before Vector Studio or runtime integration',
      'no step grants repository publication, device authority, protocol authority or force-push authority',
    ],
    authority: {
      bypassSelection: false,
      bypassAdmission: false,
      bypassAuthorization: false,
      generationEqualsApproval: false,
      runtimePublication: false,
      deviceAuthority: false,
      protocolAuthority: false,
      forcePush: false,
    },
  };
  return Object.freeze({ ...plan, executionPlanSha256: sha(plan) });
}

function parse(argv) { const values = new Map(); for (let i = 0; i < argv.length; i += 2) { const name = argv[i]; const value = argv[i + 1]; if (!name?.startsWith('--') || !value || value.startsWith('--') || values.has(name)) fail('arguments must be unique --name value pairs'); values.set(name, value); } return values; }
function main(argv = process.argv.slice(2)) { const values = parse(argv); const result = compileMobileIdentityExecutionPlan(readJson(values.get('--input'))); const output = values.get('--output'); if (!output) { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); return; } const target = resolve(output); if (!existsSync(dirname(target)) || existsSync(target)) fail('output parent must exist and output must be create-only'); writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 }); }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { try { main(); } catch (error) { process.stderr.write(`${JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) })}\n`); process.exitCode = 2; } }
