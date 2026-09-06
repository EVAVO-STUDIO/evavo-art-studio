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
import { prepareReferenceExecutionPlan, referenceAdapterId } from './local-generation-reference-execution-v2.mjs';
import { validateProviderReferenceInputs } from './local-generation-reference-graph-v2.mjs';

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
async function jsonWithBytes(file, label) {
  let bytes;
  try { bytes = await readFile(file); }
  catch (error) { fail(`${label} is unreadable: ${error instanceof Error ? error.message : String(error)}`); }
  try {
    return Object.freeze({
      value: JSON.parse(bytes.toString('utf8')),
      bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  } catch (error) { fail(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`); }
}
function providerProfile(catalog, adapterId) {
  if (!catalog || !Array.isArray(catalog.profiles)) fail('ComfyUI catalog has no profiles');
  const profileId = adapterId.startsWith('comfyui:') ? adapterId.slice('comfyui:'.length) : adapterId;
  const profile = catalog.profiles.find((candidate) => candidate?.profileId === profileId);
  if (!profile) fail(`reviewed provider profile ${profileId} is not present in the physical catalog`);
  return profile;
}
function validateReferencePlan(referencePlan, catalog, baseAdapterId) {
  let referenceInputCount = 0;
  const adapterIds = new Set([baseAdapterId]);
  for (const frame of referencePlan.frames) {
    const referenceInputs = frame.shot?.referenceInputs ?? [];
    referenceInputCount += referenceInputs.length;
    if (!referenceInputs.length) continue;
    const adapterId = referenceAdapterId(baseAdapterId, referenceInputs);
    adapterIds.add(adapterId);
    const profile = providerProfile(catalog, adapterId);
    const assetKind = frame.shot?.assetKind ?? (referencePlan.mode === 'sprite' ? 'sprite-frame' : 'illustration');
    validateProviderReferenceInputs(referenceInputs, profile, {
      label: `shot ${frame.id} reference_inputs`,
      operation: 'generate',
      assetKind,
      continuityPhase: frame.continuityPhase,
    });
  }
  return Object.freeze({
    referenceInputCount,
    stages: referencePlan.referenceGraph.stages,
    hasDependencies: referencePlan.referenceGraph.hasDependencies,
    adapterIds: Object.freeze([...adapterIds].sort()),
  });
}
async function prepareManifest(sourcePath, port) {
  const sourceInput = await jsonWithBytes(sourcePath, 'batch manifest');
  const source = sourceInput.value;
  if (source?.schema !== BATCH_SCHEMA) fail(`batch manifest must use ${BATCH_SCHEMA}`);
  if (Object.prototype.hasOwnProperty.call(source, 'evavoProvenance')) {
    fail('batch manifest evavoProvenance is reserved for the governed local entrypoint');
  }

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
  bound.evavoProvenance = {
    schema: 'evavo.local-generation-manifest-provenance.v1',
    sourceManifestSha256: sourceInput.sha256,
    sourceManifestByteLength: sourceInput.bytes.length,
    governedEntry: 'run-local-art-batch-entry-v2',
  };

  const catalog = await json(bound.provider.catalogPath, 'physical ComfyUI catalog');
  const baseProfile = providerProfile(catalog, bound.provider.adapterId);
  const modelPlan = normalizeModelPlan(bound.model_plan ?? bound.modelPlan ?? {});
  if (modelPlan.modelId || modelPlan.modelProfile || modelPlan.loras.length) {
    assertModelPlanExecutable(modelPlan, baseProfile);
  }

  const referencePlan = prepareReferenceExecutionPlan(plan);
  const referencePreflight = validateReferencePlan(referencePlan, catalog, bound.provider.adapterId);

  const sourceBytes = sourceInput.bytes;
  const boundBytes = Buffer.from(`${JSON.stringify(bound, null, 2)}\n`, 'utf8');
  const executionManifestSha256 = createHash('sha256').update(boundBytes).digest('hex');
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
    profileId: baseProfile.profileId,
    profileSha256: baseProfile.profileSha256 ?? null,
    workflowSha256: baseProfile.workflowSha256 ?? null,
    modelId: baseProfile.modelId ?? null,
    modelPlanSha256: modelPlan.sha256,
    catalogPath: bound.provider.catalogPath,
    catalogSha256: catalog.catalogSha256 ?? null,
    promptAuditScore: audit.score,
    referenceInputCount: referencePreflight.referenceInputCount,
    referenceStages: referencePreflight.stages,
    referenceDependencies: referencePreflight.hasDependencies,
    referenceAdapterIds: referencePreflight.adapterIds,
    referenceExecutionBridge: 'v2-staged-to-v1-runtime',
    sourceManifestSha256: sourceInput.sha256,
    executionManifestSha256,
  }, null, 2)}\n`, 'utf8');
  return Object.freeze({
    original, execution, auditPath, providerPath, fingerprint,
    adapterId: bound.provider.adapterId, catalogPath: bound.provider.catalogPath, baseUrl: bound.provider.baseUrl,
    auditScore: audit.score, auditWarnings: audit.counts.warnings, profileId: baseProfile.profileId,
    referenceInputCount: referencePreflight.referenceInputCount,
    referenceStages: referencePreflight.stages,
    referenceAdapterIds: referencePreflight.adapterIds,
    sourceManifestSha256: sourceInput.sha256,
    executionManifestSha256,
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
    sourceManifestSha256: manifest.sourceManifestSha256, executionManifestSha256: manifest.executionManifestSha256,
    promptAudit: manifest.auditPath, providerSelection: manifest.providerPath,
    auditScore: manifest.auditScore, auditWarnings: manifest.auditWarnings,
    adapterId: manifest.adapterId, profileId: manifest.profileId,
    catalogPath: manifest.catalogPath, baseUrl: manifest.baseUrl,
    referenceInputCount: manifest.referenceInputCount, referenceStages: manifest.referenceStages,
    referenceAdapterIds: manifest.referenceAdapterIds,
  })}\n`);
  await runManaged(args, manifest, port);
}

const directlyInvoked = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (directlyInvoked) runLocalArtBatchEntry().catch((error) => { process.stderr.write(`${JSON.stringify({ kind: 'evavo.local-art-batch-entry.v2', ok: false, error: error instanceof Error ? error.message : String(error) })}\n`); process.exitCode = 2; });
