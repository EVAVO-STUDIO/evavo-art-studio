#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = 'evavo.local-generation-campaign.v1';
const ALLOWED_CONTENT = new Set(['general', 'mature-nonexplicit']);
const ASSET_KINDS = new Set(['sprite-frame', 'sprite-layer', 'environment', 'effect', 'ui', 'illustration', 'print']);
const PHASES = new Set(['identity-master', 'direction-master', 'key-pose', 'in-between', 'repair', 'independent']);
const FORMATS = new Set(['png', 'webp', 'jpeg']);

function fail(message) { throw new Error(message); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}
function text(value, label, max = 32000) {
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value || value.length > max || value.includes('\0')) fail(`${label} is invalid`);
  return value;
}
function safeId(value, label) {
  const result = text(value, label, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(result)) fail(`${label} must be a safe identifier`);
  return result;
}
function boundedInteger(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${label} must be an integer between ${min} and ${max}`);
  return value;
}
function list(value, label, max = 64) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) fail(`${label} must be an array with at most ${max} items`);
  return value.map((entry, index) => text(entry, `${label}[${index}]`, 2048));
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 80) || 'scene';
}
function parseArgs(argv) {
  const result = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--') || result.has(key)) fail('arguments must be unique --name value pairs');
    result.set(key, value);
  }
  for (const key of result.keys()) if (!['--manifest', '--output-root', '--actor'].includes(key)) fail(`unsupported argument ${key}`);
  return result;
}
function defaultOutputRoot() {
  const base = process.env.LOCALAPPDATA?.trim();
  return base ? path.join(base, 'EVAVO', 'ArtStudio', 'campaigns') : path.join(ROOT, '.art-studio', 'local-campaigns');
}
function pnpmExecutable() { return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'; }
async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, env: options.env ?? process.env, stdio: options.stdio ?? 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited ${code}`)));
  });
}
async function readJson(file, label) {
  const raw = await readFile(path.resolve(file), 'utf8');
  let value;
  try { value = JSON.parse(raw); } catch { fail(`${label} is not valid JSON`); }
  return object(value, label);
}
async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}
function validateManifest(input) {
  const manifest = object(input, 'manifest');
  if (manifest.schema !== SCHEMA) fail(`manifest.schema must be ${SCHEMA}`);
  const campaignId = safeId(manifest.campaignId, 'campaignId');
  const contentClass = text(manifest.contentClass, 'contentClass', 64);
  if (!ALLOWED_CONTENT.has(contentClass)) fail('contentClass must be general or mature-nonexplicit');
  if (contentClass === 'mature-nonexplicit') {
    const subject = object(manifest.subject, 'subject');
    boundedInteger(subject.minimumAge, 'subject.minimumAge', 18, 130);
    if (subject.minimumAge < 18) fail('mature-nonexplicit campaigns require an unambiguously adult subject');
  }
  const provider = object(manifest.provider, 'provider');
  const baseUrl = new URL(text(provider.baseUrl ?? 'http://127.0.0.1:8188', 'provider.baseUrl', 2048));
  if (baseUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(baseUrl.hostname)) fail('local campaign provider.baseUrl must be loopback HTTP');
  const catalogPath = path.resolve(text(provider.catalogPath, 'provider.catalogPath', 4096));
  const requestedAdapterId = provider.adapterId === undefined ? null : text(provider.adapterId, 'provider.adapterId', 256);
  if (requestedAdapterId && !requestedAdapterId.startsWith('comfyui:')) fail('provider.adapterId must be a comfyui: adapter');
  const defaults = object(manifest.defaults ?? {}, 'defaults');
  const scenes = manifest.scenes;
  if (!Array.isArray(scenes) || scenes.length < 1 || scenes.length > 100) fail('scenes must contain 1 to 100 entries');
  const normalizedScenes = scenes.map((raw, index) => {
    const scene = object(raw, `scenes[${index}]`);
    const id = safeId(scene.id, `scenes[${index}].id`);
    const assetKind = scene.assetKind ?? defaults.assetKind ?? 'illustration';
    if (!ASSET_KINDS.has(assetKind)) fail(`scenes[${index}].assetKind is unsupported`);
    const continuityPhase = scene.continuityPhase ?? defaults.continuityPhase ?? 'independent';
    if (!PHASES.has(continuityPhase)) fail(`scenes[${index}].continuityPhase is unsupported`);
    const target = object(scene.target ?? defaults.target ?? {}, `scenes[${index}].target`);
    const width = boundedInteger(target.width ?? 1024, `scenes[${index}].target.width`, 64, 4096);
    const height = boundedInteger(target.height ?? 1024, `scenes[${index}].target.height`, 64, 4096);
    const outputFormat = target.outputFormat ?? 'png';
    if (!FORMATS.has(outputFormat)) fail(`scenes[${index}].target.outputFormat is unsupported`);
    const candidateCount = boundedInteger(scene.candidateCount ?? defaults.candidateCount ?? 4, `scenes[${index}].candidateCount`, 1, 16);
    const seed = boundedInteger(scene.seed ?? defaults.seed ?? (100000 + index), `scenes[${index}].seed`, 0, 2147483647);
    const style = object(scene.style ?? manifest.style ?? {}, `scenes[${index}].style`);
    return {
      id,
      assetKind,
      continuityPhase,
      creativeIntent: text(scene.prompt, `scenes[${index}].prompt`),
      negativeIntent: scene.negativePrompt === undefined ? undefined : text(scene.negativePrompt, `scenes[${index}].negativePrompt`),
      candidateCount,
      seed,
      target: { width, height, transparency: target.transparency ?? 'opaque', outputFormat },
      style: {
        styleName: text(style.styleName ?? 'Project art direction', `scenes[${index}].style.styleName`, 512),
        intent: text(style.intent ?? 'Follow the supplied project art direction consistently.', `scenes[${index}].style.intent`, 4096),
        mustHave: list(style.mustHave, `scenes[${index}].style.mustHave`),
        mustAvoid: list(style.mustAvoid, `scenes[${index}].style.mustAvoid`),
        identityLocks: list(style.identityLocks, `scenes[${index}].style.identityLocks`),
        palette: list(style.palette, `scenes[${index}].style.palette`),
        lineTreatment: list(style.lineTreatment, `scenes[${index}].style.lineTreatment`),
        materials: list(style.materials, `scenes[${index}].style.materials`),
        cameraRules: list(style.cameraRules, `scenes[${index}].style.cameraRules`),
        compositionRules: list(style.compositionRules, `scenes[${index}].style.compositionRules`),
        eraRules: list(style.eraRules, `scenes[${index}].style.eraRules`),
      },
      shot: {
        subject: text(scene.subject ?? manifest.subject?.description ?? 'Primary subject described by the creative intent.', `scenes[${index}].subject`, 4096),
        action: scene.action === undefined ? undefined : text(scene.action, `scenes[${index}].action`, 4096),
        direction: scene.direction === undefined ? undefined : text(scene.direction, `scenes[${index}].direction`, 2048),
        include: list(scene.include, `scenes[${index}].include`),
        exclude: list(scene.exclude, `scenes[${index}].exclude`),
        separateAssets: list(scene.separateAssets, `scenes[${index}].separateAssets`),
        framing: list(scene.framing, `scenes[${index}].framing`),
      },
    };
  });
  if (new Set(normalizedScenes.map((scene) => scene.id)).size !== normalizedScenes.length) fail('scene IDs must be unique');
  return { campaignId, contentClass, provider: { baseUrl: baseUrl.toString().replace(/\/$/u, ''), catalogPath, requestedAdapterId }, scenes: normalizedScenes, source: manifest };
}
function selectProfile(catalog, requestedAdapterId, scenes) {
  object(catalog, 'ComfyUI catalog');
  if (!Array.isArray(catalog.profiles) || !catalog.profiles.length) fail('ComfyUI catalog contains no profiles');
  const candidates = catalog.profiles.filter((profile) => {
    if (!profile || typeof profile !== 'object') return false;
    const adapterId = `comfyui:${profile.profileId}`;
    if (requestedAdapterId && adapterId !== requestedAdapterId) return false;
    if (!Array.isArray(profile.operations) || !profile.operations.includes('generate')) return false;
    if (!Array.isArray(profile.assetKinds)) return false;
    return scenes.every((scene) => profile.assetKinds.includes(scene.assetKind));
  }).sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0));
  if (!candidates.length) fail('no reviewed local ComfyUI profile supports every requested scene asset kind');
  const profile = candidates[0];
  return { profile, adapterId: `comfyui:${profile.profileId}`, modelId: text(profile.modelId, 'profile.modelId', 512) };
}
function runtimeJob(campaign, scene, adapterId, modelId, runId) {
  const request = {
    schemaVersion: '1.0', operation: 'generate', assetKind: scene.assetKind, continuityPhase: scene.continuityPhase,
    assetId: `${campaign.campaignId}-${scene.id}`, candidateFamilyId: `${campaign.campaignId}-${scene.id}`, frameId: scene.id,
    creativeIntent: scene.creativeIntent, ...(scene.negativeIntent ? { negativeIntent: scene.negativeIntent } : {}),
    style: scene.style, shot: scene.shot, target: scene.target, sourceCanvas: { width: scene.target.width, height: scene.target.height },
    background: { strategy: scene.target.transparency === 'opaque' ? 'provider-auto' : 'chroma-key', ...(scene.target.transparency === 'opaque' ? {} : { matteColour: '#00ff00' }) },
    quality: 'high', candidateCount: scene.candidateCount, seed: scene.seed, references: [],
    selection: { preferredAdapterId: adapterId, preferredModel: modelId, allowedAdapterIds: [adapterId], allowFallback: false, requireSeed: true },
    metadata: { campaignId: campaign.campaignId, sceneId: scene.id, contentClass: campaign.contentClass, localOnly: true, approvalRequired: true, runId },
  };
  return {
    queue: 'provider', kind: 'art.candidate.generate', idempotencyKey: `${campaign.campaignId}:${scene.id}:${runId}`,
    payload: request,
    requiredCapabilities: ['provider.generate', 'provider.candidate-store', 'evidence.bundle'], inputArtifacts: [], priority: 10,
    maximumAttempts: 2, retryPolicy: { baseDelayMs: 5000, maximumDelayMs: 60000, multiplier: 2, jitterFraction: 0.1 },
    leaseDurationMs: 300000, timeoutMs: 1800000,
    labels: { campaign: campaign.campaignId, scene: scene.id, provider: adapterId, contentClass: campaign.contentClass },
    requiredCapabilityProfile: ['candidate-count', 'custom-size', 'generate', 'seed'],
  };
}
async function probeComfy(baseUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${baseUrl}/system_stats`, { signal: controller.signal, redirect: 'error' });
    if (!response.ok) fail(`ComfyUI system_stats returned HTTP ${response.status}`);
  } catch (error) {
    fail(`local ComfyUI is not reachable at ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`);
  } finally { clearTimeout(timer); }
}
async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const manifestPath = path.resolve(args.get('--manifest') ?? path.join(ROOT, 'examples', 'local-generation-campaign.lorna.json'));
  const actor = args.get('--actor') ?? process.env.EVAVO_ART_ACTOR ?? 'local-generation-campaign';
  const campaign = validateManifest(await readJson(manifestPath, 'campaign manifest'));
  const catalog = await readJson(campaign.provider.catalogPath, 'ComfyUI catalog');
  const { profile, adapterId, modelId } = selectProfile(catalog, campaign.provider.requestedAdapterId, campaign.scenes);
  await probeComfy(campaign.provider.baseUrl);

  const runFingerprint = sha256(Buffer.from(canonical({ campaign: campaign.source, adapterId, modelId, at: new Date().toISOString() }), 'utf8'));
  const runId = `${new Date().toISOString().replace(/[:.]/gu, '-')}-${runFingerprint.slice(0, 12)}`;
  const outputRoot = path.resolve(args.get('--output-root') ?? defaultOutputRoot(), campaign.campaignId, runId);
  const jobsDir = path.join(outputRoot, 'jobs');
  const outputsDir = path.join(outputRoot, 'outputs');
  const runtimeRoot = path.join(outputRoot, 'runtime');
  const artifactRoot = path.join(outputRoot, 'artifacts');
  await mkdir(jobsDir, { recursive: true });
  await mkdir(outputsDir, { recursive: true });
  await copyFile(manifestPath, path.join(outputRoot, 'manifest.input.json'));

  const jobs = campaign.scenes.map((scene) => runtimeJob(campaign, scene, adapterId, modelId, runId));
  const jobsPath = path.join(jobsDir, 'runtime-jobs.json');
  await writeJson(jobsPath, jobs);
  const env = {
    ...process.env,
    EVAVO_ART_RUNTIME_ROOT: runtimeRoot,
    EVAVO_ART_ARTIFACT_ROOT: artifactRoot,
    EVAVO_ART_COMFYUI_CATALOG: campaign.provider.catalogPath,
    EVAVO_ART_COMFYUI_CATALOG_ROOT: path.dirname(campaign.provider.catalogPath),
    EVAVO_ART_COMFYUI_BASE_URL: campaign.provider.baseUrl,
    EVAVO_ART_COMFYUI_DEDICATED_INSTANCE: 'true',
    EVAVO_ART_COMFYUI_ALLOW_REMOTE: 'false',
    EVAVO_ART_WORKER_QUEUES: 'provider',
    EVAVO_ART_ACTOR: actor,
  };

  await run(pnpmExecutable(), ['run', 'build:domain'], { env });
  await run(pnpmExecutable(), ['--filter', '@evavo/art-studio-worker', 'build'], { env });
  await run(pnpmExecutable(), ['art', '--', 'runtime-submit', '--input', jobsPath, '--runtime-root', runtimeRoot, '--actor', actor], { env });
  await run(pnpmExecutable(), ['--filter', '@evavo/art-studio-worker', 'start', '--', 'until-idle'], { env });

  const [{ LocalRuntimeRepository }, { LocalArtifactStore }] = await Promise.all([
    import('../packages/runtime/dist/index.js'), import('../packages/artifacts/dist/index.js'),
  ]);
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
  const artifacts = new LocalArtifactStore({ root: artifactRoot });
  const records = await runtime.list({ queues: ['provider'], limit: 10000 });
  const materialized = [];
  for (const record of records) {
    const sceneId = record.spec?.labels?.scene ?? 'scene';
    let ordinal = 0;
    for (const artifactId of record.outputArtifacts ?? []) {
      const descriptor = await artifacts.get(artifactId);
      if (!descriptor || !descriptor.mediaType?.startsWith('image/') || descriptor.labels?.artifactRole !== 'provider-candidate') continue;
      ordinal += 1;
      const extension = descriptor.mediaType === 'image/jpeg' ? 'jpg' : descriptor.mediaType.split('/')[1];
      const fileName = `${slug(sceneId)}-candidate-${String(ordinal).padStart(2, '0')}.${extension}`;
      const target = path.join(outputsDir, fileName);
      await writeFile(target, await artifacts.read(artifactId), { flag: 'wx' });
      materialized.push({ sceneId, artifactId, fileName, contentHash: descriptor.contentHash, mediaType: descriptor.mediaType, approvalState: descriptor.labels?.approvalState ?? null });
    }
  }
  const failed = records.filter((record) => ['failed', 'dead-letter', 'blocked', 'cancelled'].includes(record.state));
  const receipt = {
    schema: 'evavo.local-generation-campaign-receipt.v1', status: failed.length ? 'failed' : 'succeeded', campaignId: campaign.campaignId,
    runId, completedAt: new Date().toISOString(), contentClass: campaign.contentClass,
    provider: { adapterId, modelId, profileId: profile.profileId, baseUrl: campaign.provider.baseUrl, catalogPath: campaign.provider.catalogPath, localOnly: true, fallbackAllowed: false },
    paths: { runRoot: outputRoot, outputs: outputsDir, runtime: runtimeRoot, artifacts: artifactRoot },
    counts: { requestedScenes: campaign.scenes.length, runtimeJobs: records.length, materializedCandidates: materialized.length, failedJobs: failed.length },
    candidates: materialized,
    failedJobs: failed.map((record) => ({ id: record.id, state: record.state, failure: record.failure ?? null })),
    authority: { candidateApproval: false, candidatePromotion: false, publication: false, targetRepositoryMutation: false },
  };
  await writeJson(path.join(outputRoot, 'receipt.json'), receipt);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  if (failed.length) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 2;
});
