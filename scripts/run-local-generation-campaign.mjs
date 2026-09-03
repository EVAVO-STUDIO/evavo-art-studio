#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LOCAL_GENERATION_CAMPAIGN_SCHEMA = 'evavo.local-generation-campaign.v1';
const ALLOWED_CONTENT = new Set(['general', 'mature-nonexplicit']);
const ASSET_KINDS = new Set(['sprite-frame', 'sprite-layer', 'environment', 'effect', 'ui', 'illustration', 'print']);
const PHASES = new Set(['identity-master', 'direction-master', 'key-pose', 'in-between', 'repair', 'independent']);
const TRANSPARENCY = new Set(['required', 'preferred', 'opaque']);
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
function optionalText(value, label, max = 32000) {
  return value === undefined || value === null ? null : text(value, label, max);
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
function defaultCatalogPath() {
  const configured = process.env.EVAVO_ART_COMFYUI_CATALOG?.trim();
  if (configured) return path.resolve(configured);
  if (process.platform === 'win32') return path.resolve('C:\\EVAVO\\comfyui\\catalog.json');
  return path.join(ROOT, '.art-studio', 'comfyui', 'catalog.json');
}
function defaultBaseUrl() {
  return process.env.EVAVO_ART_COMFYUI_BASE_URL?.trim() || 'http://127.0.0.1:8188';
}
function pnpmExecutable() { return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'; }
function requiredCapabilityProfile(scene) {
  const required = new Set(['generate', 'cancellation', 'seed', 'custom-size']);
  if (scene.candidateCount > 1) required.add('candidate-count');
  return Object.freeze([...required].sort());
}
async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const windowsCommandShim = process.platform === 'win32' && /\.cmd$/iu.test(command);
    const executable = windowsCommandShim ? (process.env.ComSpec?.trim() || 'cmd.exe') : command;
    const executableArgs = windowsCommandShim ? ['/d', '/s', '/c', command, ...args] : args;
    const child = spawn(executable, executableArgs, {
      cwd: ROOT,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
      windowsHide: true,
      shell: false,
    });
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
function assertLoopbackBaseUrl(value) {
  const baseUrl = new URL(value);
  if (baseUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(baseUrl.hostname)) {
    fail('local generation campaigns require a loopback HTTP ComfyUI endpoint');
  }
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) fail('provider.baseUrl may not contain credentials, query strings or fragments');
  return baseUrl.toString().replace(/\/$/u, '');
}

export function validateLocalGenerationCampaign(input, environment = process.env) {
  const manifest = object(input, 'manifest');
  if (manifest.schema !== LOCAL_GENERATION_CAMPAIGN_SCHEMA) fail(`manifest.schema must be ${LOCAL_GENERATION_CAMPAIGN_SCHEMA}`);
  const campaignId = safeId(manifest.campaignId, 'campaignId');
  const contentClass = text(manifest.contentClass, 'contentClass', 64);
  if (!ALLOWED_CONTENT.has(contentClass)) fail('contentClass must be general or mature-nonexplicit');
  const subject = object(manifest.subject ?? {}, 'subject');
  if (contentClass === 'mature-nonexplicit') {
    boundedInteger(subject.minimumAge, 'subject.minimumAge', 18, 130);
  }
  const provider = object(manifest.provider ?? {}, 'provider');
  const configuredBaseUrl = provider.baseUrl ?? environment.EVAVO_ART_COMFYUI_BASE_URL ?? defaultBaseUrl();
  const baseUrl = assertLoopbackBaseUrl(text(configuredBaseUrl, 'provider.baseUrl', 2048));
  const configuredCatalog = provider.catalogPath ?? environment.EVAVO_ART_COMFYUI_CATALOG ?? defaultCatalogPath();
  const catalogPath = path.resolve(text(configuredCatalog, 'provider.catalogPath', 4096));
  const requestedAdapterId = optionalText(provider.adapterId, 'provider.adapterId', 256);
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
    const transparency = target.transparency ?? 'opaque';
    if (!TRANSPARENCY.has(transparency)) fail(`scenes[${index}].target.transparency is unsupported`);
    const outputFormat = target.outputFormat ?? 'png';
    if (!FORMATS.has(outputFormat)) fail(`scenes[${index}].target.outputFormat is unsupported`);
    const candidateCount = boundedInteger(scene.candidateCount ?? defaults.candidateCount ?? 4, `scenes[${index}].candidateCount`, 1, 16);
    const seed = boundedInteger(scene.seed ?? defaults.seed ?? (100000 + index), `scenes[${index}].seed`, 0, 2147483647);
    const style = object(scene.style ?? manifest.style ?? {}, `scenes[${index}].style`);
    const adapterId = optionalText(scene.adapterId, `scenes[${index}].adapterId`, 256) ?? requestedAdapterId;
    if (adapterId && !adapterId.startsWith('comfyui:')) fail(`scenes[${index}].adapterId must be a comfyui: adapter`);
    return {
      id,
      adapterId,
      assetKind,
      continuityPhase,
      creativeIntent: text(scene.prompt, `scenes[${index}].prompt`),
      negativeIntent: optionalText(scene.negativePrompt, `scenes[${index}].negativePrompt`),
      candidateCount,
      seed,
      target: { width, height, transparency, outputFormat },
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
        subject: text(scene.subject ?? subject.description ?? 'Primary subject described by the creative intent.', `scenes[${index}].subject`, 4096),
        ...(scene.action === undefined ? {} : { action: text(scene.action, `scenes[${index}].action`, 4096) }),
        ...(scene.direction === undefined ? {} : { direction: text(scene.direction, `scenes[${index}].direction`, 2048) }),
        include: list(scene.include, `scenes[${index}].include`),
        exclude: list(scene.exclude, `scenes[${index}].exclude`),
        separateAssets: list(scene.separateAssets, `scenes[${index}].separateAssets`),
        framing: list(scene.framing, `scenes[${index}].framing`),
      },
    };
  });
  if (new Set(normalizedScenes.map((scene) => scene.id)).size !== normalizedScenes.length) fail('scene IDs must be unique');
  return Object.freeze({ campaignId, contentClass, provider: { baseUrl, catalogPath }, scenes: Object.freeze(normalizedScenes), source: manifest });
}

function routeScene(catalog, scene) {
  object(catalog, 'ComfyUI catalog');
  if (!Array.isArray(catalog.profiles) || !catalog.profiles.length) fail('ComfyUI catalog contains no profiles');
  const requiredCapabilities = requiredCapabilityProfile(scene);
  const candidates = catalog.profiles.filter((profile) => {
    if (!profile || typeof profile !== 'object') return false;
    const adapterId = `comfyui:${profile.profileId}`;
    if (scene.adapterId && adapterId !== scene.adapterId) return false;
    if (!Array.isArray(profile.operations) || !profile.operations.includes('generate')) return false;
    if (!Array.isArray(profile.assetKinds) || !profile.assetKinds.includes(scene.assetKind)) return false;
    if (!Array.isArray(profile.continuityPhases) || !profile.continuityPhases.includes(scene.continuityPhase)) return false;
    if (!Array.isArray(profile.capabilities) || !requiredCapabilities.every((capability) => profile.capabilities.includes(capability))) return false;
    if (profile.limits?.maximumCandidates !== undefined && profile.limits.maximumCandidates < scene.candidateCount) return false;
    return true;
  }).sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0));
  if (!candidates.length) fail(`no reviewed local ComfyUI profile can execute scene ${scene.id} (${scene.assetKind}/${scene.continuityPhase}, ${scene.candidateCount} candidates, capabilities ${requiredCapabilities.join(',')})`);
  const profile = candidates[0];
  return Object.freeze({
    sceneId: scene.id,
    profileId: safeId(profile.profileId, `profile for ${scene.id}`),
    adapterId: `comfyui:${profile.profileId}`,
    modelId: text(profile.modelId, `modelId for ${scene.id}`, 512),
    profileSha256: optionalText(profile.profileSha256, `profileSha256 for ${scene.id}`, 128),
    requiredCapabilities,
  });
}

function runtimeJob(campaign, scene, route, runId) {
  const request = {
    schemaVersion: '1.0', operation: 'generate', assetKind: scene.assetKind, continuityPhase: scene.continuityPhase,
    assetId: `${campaign.campaignId}-${scene.id}`, candidateFamilyId: `${campaign.campaignId}-${scene.id}`, frameId: scene.id,
    creativeIntent: scene.creativeIntent, ...(scene.negativeIntent ? { negativeIntent: scene.negativeIntent } : {}),
    style: scene.style, shot: scene.shot, target: scene.target, sourceCanvas: { width: scene.target.width, height: scene.target.height },
    background: scene.target.transparency === 'opaque' ? { strategy: 'provider-auto' } : { strategy: 'chroma-key', matteColour: '#00ff00' },
    quality: 'high', candidateCount: scene.candidateCount, seed: scene.seed, references: [],
    selection: { preferredAdapterId: route.adapterId, preferredModel: route.modelId, allowedAdapterIds: [route.adapterId], allowFallback: false, requireSeed: true },
    metadata: { campaignId: campaign.campaignId, sceneId: scene.id, contentClass: campaign.contentClass, localOnly: true, approvalRequired: true, runId },
  };
  return {
    queue: 'provider', kind: 'art.candidate.generate', idempotencyKey: `${campaign.campaignId}:${scene.id}:${runId}`,
    payload: request,
    requiredCapabilities: ['provider.generate', 'provider.candidate-store', 'evidence.bundle'], inputArtifacts: [], priority: 10,
    maximumAttempts: 2, retryPolicy: { baseDelayMs: 5000, maximumDelayMs: 60000, multiplier: 2, jitterFraction: 0.1 },
    leaseDurationMs: 300000, timeoutMs: 1800000,
    labels: { campaign: campaign.campaignId, scene: scene.id, provider: route.adapterId, contentClass: campaign.contentClass },
    requiredCapabilityProfile: route.requiredCapabilities,
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

export async function runLocalGenerationCampaign(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const manifestPath = path.resolve(args.get('--manifest') ?? path.join(ROOT, 'examples', 'local-generation-campaign.lorna.json'));
  const actor = args.get('--actor') ?? process.env.EVAVO_ART_ACTOR ?? 'local-generation-campaign';
  const campaign = validateLocalGenerationCampaign(await readJson(manifestPath, 'campaign manifest'));
  const catalog = await readJson(campaign.provider.catalogPath, 'ComfyUI catalog');
  const routes = campaign.scenes.map((scene) => routeScene(catalog, scene));
  await probeComfy(campaign.provider.baseUrl);

  const now = new Date().toISOString();
  const runFingerprint = sha256(Buffer.from(canonical({ campaign: campaign.source, routes, at: now }), 'utf8'));
  const runId = `${now.replace(/[:.]/gu, '-')}-${runFingerprint.slice(0, 12)}`;
  const outputRoot = path.resolve(args.get('--output-root') ?? defaultOutputRoot(), campaign.campaignId, runId);
  const jobsDir = path.join(outputRoot, 'jobs');
  const outputsDir = path.join(outputRoot, 'outputs');
  const runtimeRoot = path.join(outputRoot, 'runtime');
  const artifactRoot = path.join(outputRoot, 'artifacts');
  await mkdir(jobsDir, { recursive: true });
  await mkdir(outputsDir, { recursive: true });
  await copyFile(manifestPath, path.join(outputRoot, 'manifest.input.json'));
  await writeJson(path.join(outputRoot, 'routes.json'), routes);

  const routeByScene = new Map(routes.map((route) => [route.sceneId, route]));
  const jobs = campaign.scenes.map((scene) => runtimeJob(campaign, scene, routeByScene.get(scene.id), runId));
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
  const missingScenes = campaign.scenes.filter((scene) => !materialized.some((candidate) => candidate.sceneId === scene.id)).map((scene) => scene.id);
  const receipt = {
    schema: 'evavo.local-generation-campaign-receipt.v1',
    status: failed.length || missingScenes.length ? 'failed' : 'succeeded',
    campaignId: campaign.campaignId,
    runId,
    completedAt: new Date().toISOString(),
    contentClass: campaign.contentClass,
    provider: { baseUrl: campaign.provider.baseUrl, catalogPath: campaign.provider.catalogPath, localOnly: true, fallbackAllowed: false, routes },
    paths: { runRoot: outputRoot, outputs: outputsDir, runtime: runtimeRoot, artifacts: artifactRoot },
    counts: { requestedScenes: campaign.scenes.length, runtimeJobs: records.length, materializedCandidates: materialized.length, failedJobs: failed.length, missingScenes: missingScenes.length },
    candidates: materialized,
    missingScenes,
    failedJobs: failed.map((record) => ({ id: record.id, state: record.state, failure: record.failure ?? null })),
    authority: { candidateApproval: false, candidatePromotion: false, publication: false, targetRepositoryMutation: false },
  };
  await writeJson(path.join(outputRoot, 'receipt.json'), receipt);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  if (receipt.status !== 'succeeded') process.exitCode = 2;
  return receipt;
}

const directlyInvoked = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (directlyInvoked) {
  runLocalGenerationCampaign().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 2;
  });
}
