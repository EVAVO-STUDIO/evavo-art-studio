#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

import { auditBatchPlan } from './local-generation-batch-audit-v2.mjs';
import { compileBatchPlan } from './local-generation-batch-v2.mjs';
import { assertModelPlanExecutable, normalizeModelPlan } from './local-generation-model-plan-v2.mjs';
import { buildReferenceGraph, normalizeReferenceInputs } from './local-generation-reference-graph-v2.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BATCH_SCHEMA = 'evavo.local-generation-batch.v2';
const DEFAULT_PORT = 8192;

function fail(message) { throw new Error(message); }
function parseArgs(argv) {
  const result = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]; const value = argv[i + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--') || result.has(key)) fail('arguments must be unique --name value pairs');
    result.set(key, value);
  }
  for (const key of result.keys()) if (!['--manifest', '--output-root', '--actor', '--port'].includes(key)) fail(`unsupported argument ${key}`);
  return result;
}
function localAppData() {
  const configured = process.env.LOCALAPPDATA?.trim();
  if (configured) return path.resolve(configured);
  if (process.platform === 'win32' && process.env.USERPROFILE) return path.join(process.env.USERPROFILE, 'AppData', 'Local');
  return path.join(ROOT, '.art-studio');
}
function defaultCatalog() {
  return process.env.EVAVO_ART_COMFYUI_CATALOG?.trim() || path.join(localAppData(), 'EVAVO', 'AI', 'ComfyUI', 'catalog.json');
}
function qualityAdapter(document) {
  const explicit = document.provider?.adapterId;
  if (explicit) return explicit;
  const modelProfile = document.model_plan?.modelProfile ?? document.modelPlan?.modelProfile ?? 'sdxl-base-local';
  const quality = document.quality_profile ?? 'cinematic_stills';
  return `comfyui:${modelProfile}-${quality}`;
}
async function json(file, label) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { fail(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`); }
}
function explicitReferenceInputs(source) {
  const frames = (source.shots ?? []).map((shot, index) => ({
    id: shot.id ?? `shot-${index + 1}`,
    shot: { referenceInputs: normalizeReferenceInputs(shot.reference_inputs ?? shot.referenceInputs, `shots[${index}].reference_inputs`) },
  }));
  const count = frames.reduce((sum, frame) => sum + frame.shot.referenceInputs.length, 0);
  if (count) buildReferenceGraph(frames);
  return Object.freeze({ count, frames: Object.freeze(frames) });
}
function providerProfile(catalog, adapterId) {
  if (!catalog || !Array.isArray(catalog.profiles)) fail('ComfyUI catalog has no profiles');
  const profileId = adapterId.startsWith('comfyui:') ? adapterId.slice('comfyui:'.length) : adapterId;
  const profile = catalog.profiles.find((candidate) => candidate?.profileId === profileId);
  if (!profile) fail(`reviewed provider profile ${profileId} is not present in the physical catalog`);
  return profile;
}
async function prepareManifest(sourcePath, port) {
  const source = await json(sourcePath, 'batch manifest');
  if (source?.schema !== BATCH_SCHEMA) fail(`batch manifest must use ${BATCH_SCHEMA}`);

  const plan = compileBatchPlan(source);
  const audit = auditBatchPlan(plan);
  if (!audit.ok) {
    const errors = audit.issues.filter((item) => item.severity === 'error').map((item) => `${item.code}${item.shotId ? `:${item.shotId}` : ''}`);
    fail(`batch prompt/plan audit failed (${audit.score}/100): ${errors.join(', ')}`);
  }

  const bound = JSON.parse(JSON.stringify(source));
  bound.provider = {
    ...(bound.provider ?? {}),
    baseUrl: `http://127.0.0.1:${port}`,
    catalogPath: defaultCatalog(),
    adapterId: qualityAdapter(bound),
  };

  const catalog = await json(bound.provider.catalogPath, 'physical ComfyUI catalog');
  const profile = providerProfile(catalog, bound.provider.adapterId);
  const modelPlan = normalizeModelPlan(bound.model_plan ?? bound.modelPlan ?? {});
  if (modelPlan.modelId || modelPlan.modelProfile || modelPlan.loras.length) {
    assertModelPlanExecutable(modelPlan, profile);
  }

  const references = explicitReferenceInputs(bound);
  if (references.count) {
    const capabilities = new Set(profile.capabilities ?? []);
    if (!capabilities.has('reference-images')) {
      fail(`campaign contains ${references.count} explicit artifact-conditioned reference input(s), but reviewed adapter ${bound.provider.adapterId} does not advertise reference-images capability`);
    }
    fail('artifact-conditioned reference inputs validated successfully, but the V2-to-runtime reference execution bridge is not enabled yet; refusing to silently drop references');
  }

  const sourceBytes = Buffer.from(`${JSON.stringify(source, null, 2)}\n`, 'utf8');
  const boundBytes = Buffer.from(`${JSON.stringify(bound, null, 2)}\n`, 'utf8');
  const fingerprint = createHash('sha256').update(sourceBytes).update(boundBytes).digest('hex');
  const requestRoot = path.join(localAppData(), 'EVAVO', 'ArtStudio', 'agent-requests', 'managed-batch-v2', fingerprint);
  await mkdir(requestRoot, { recursive: true });
  const original = path.join(requestRoot, 'manifest.source.json');
  const execution = path.join(requestRoot, 'manifest.execution.json');
  const auditPath = path.join(requestRoot, 'prompt-plan-audit.json');
  const providerPath = path.join(requestRoot, 'provider-selection.json');
  await writeFile(original, sourceBytes);
  await writeFile(execution, boundBytes);
  await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  await writeFile(providerPath, `${JSON.stringify({
    schema: 'evavo.local-generation-provider-selection.v2',
    adapterId: bound.provider.adapterId,
    profileId: profile.profileId,
    profileSha256: profile.profileSha256 ?? null,
    workflowSha256: profile.workflowSha256 ?? null,
    modelId: profile.modelId ?? null,
    modelPlanSha256: modelPlan.sha256,
    catalogPath: bound.provider.catalogPath,
    catalogSha256: catalog.catalogSha256 ?? null,
    promptAuditScore: audit.score,
    referenceInputCount: references.count,
  }, null, 2)}\n`, 'utf8');
  return Object.freeze({
    original, execution, auditPath, providerPath, fingerprint,
    adapterId: bound.provider.adapterId, catalogPath: bound.provider.catalogPath, baseUrl: bound.provider.baseUrl,
    auditScore: audit.score, auditWarnings: audit.counts.warnings, profileId: profile.profileId,
  });
}
async function runManaged(args, manifest, port) {
  const managed = path.join(ROOT, 'scripts', 'run-local-art-batch-managed.mjs');
  const childArgs = [managed, '--manifest', manifest.execution, '--port', String(port)];
  if (args.get('--output-root')) childArgs.push('--output-root', args.get('--output-root'));
  if (args.get('--actor')) childArgs.push('--actor', args.get('--actor'));
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, childArgs, {
      cwd: ROOT,
      env: {
        ...process.env,
        EVAVO_ART_COMFYUI_CATALOG: manifest.catalogPath,
        EVAVO_ART_COMFYUI_BASE_URL: manifest.baseUrl,
        EVAVO_ART_COMFYUI_ALLOW_REMOTE: 'false',
        EVAVO_ART_COMFYUI_DEDICATED_INSTANCE: 'true',
      },
      stdio: 'inherit',
      windowsHide: true,
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`managed local batch exited ${code}`)));
  });
}

export async function runLocalArtBatchEntry(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const source = path.resolve(args.get('--manifest') ?? path.join(ROOT, 'examples', 'local-generation-batch.template.json'));
  const port = Number(args.get('--port') ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) fail('--port must be an integer between 1024 and 65535');
  const manifest = await prepareManifest(source, port);
  process.stderr.write(`${JSON.stringify({
    kind: 'evavo.local-art-batch-entry.v2', status: 'prepared',
    sourceManifest: manifest.original, executionManifest: manifest.execution,
    promptAudit: manifest.auditPath, providerSelection: manifest.providerPath,
    auditScore: manifest.auditScore, auditWarnings: manifest.auditWarnings,
    adapterId: manifest.adapterId, profileId: manifest.profileId,
    catalogPath: manifest.catalogPath, baseUrl: manifest.baseUrl,
  })}\n`);
  await runManaged(args, manifest, port);
}

const directlyInvoked = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (directlyInvoked) runLocalArtBatchEntry().catch((error) => { process.stderr.write(`${JSON.stringify({ kind: 'evavo.local-art-batch-entry.v2', ok: false, error: error instanceof Error ? error.message : String(error) })}\n`); process.exitCode = 2; });
