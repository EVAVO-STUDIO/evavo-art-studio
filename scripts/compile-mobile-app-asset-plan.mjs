#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, posix, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MOBILE_PRODUCTION_PLAN_SCHEMA = 'evavo.mobile-app-production-plan.v1';
export const MOBILE_ASSET_PLAN_SCHEMA = 'evavo.mobile-app-asset-plan.v1';
const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const ICON_KINDS = new Set(['app-icon', 'adaptive-icon-foreground', 'adaptive-icon-background', 'notification-icon']);

export class MobileAssetPlanError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MobileAssetPlanError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new MobileAssetPlanError(code, message); };
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const object = (value, label) => isRecord(value) ? value : fail('invalid_object', `${label} must be an object.`);
function string(value, label, max = 600) {
  if (typeof value !== 'string') fail('invalid_string', `${label} must be a string.`);
  const result = value.trim();
  if (!result || result.length > max) fail('invalid_string', `${label} must contain 1 to ${max} characters.`);
  return result;
}
function strings(value, label, min = 0, max = 128) {
  if (!Array.isArray(value)) fail('invalid_array', `${label} must be an array.`);
  const result = [...new Set(value.map((item, index) => string(item, `${label}[${index}]`, 400)))];
  if (result.length < min || result.length > max) fail('invalid_array', `${label} must contain ${min} to ${max} unique values.`);
  return result;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}
export const sha256Object = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function assertNoSecrets(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) {
    if (typeof value === 'string' && /(?:\bgh[pousr]_[A-Za-z0-9]{20,}\b|\bsk-[A-Za-z0-9_-]{16,}\b|PRIVATE KEY-----)/u.test(value)) {
      fail('secret_value_rejected', `Secret-looking value rejected at ${path}.`);
    }
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.replace(/([a-z0-9])([A-Z])/gu, '$1_$2').toLowerCase();
    if (/(?:^|[_-])(token|secret|password|credential|api_key|private_key)(?:$|[_-])/u.test(normalized)) {
      fail('secret_key_rejected', `Secret-bearing field rejected at ${path}.${key}.`);
    }
    assertNoSecrets(item, `${path}.${key}`);
  }
}
function repositoryTarget(value, label) {
  const result = string(value, label, 300).replaceAll('\\', '/');
  if (result.startsWith('/') || /^[A-Za-z]:\//u.test(result) || result.split('/').includes('..') || result.includes('\0')) {
    fail('unsafe_runtime_target', `${label} must be repository-relative and traversal-free.`);
  }
  return result;
}
function slug(value, label) {
  const result = string(value, label, 96).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,95}$/u.test(result)) fail('invalid_slug', `${label} is invalid.`);
  return result;
}
function logicalUri(requestId, assetId) {
  return `workspace://mobile-apps/${encodeURIComponent(requestId)}/${encodeURIComponent(assetId)}`;
}
function outputProfiles(kind, platforms) {
  const profiles = [];
  if (kind === 'app-icon') {
    profiles.push({ id: 'master-square', width: 1024, height: 1024, format: 'png', alpha: 'forbidden', role: 'immutable reviewed master candidate' });
    if (platforms.includes('android')) profiles.push({ id: 'android-adaptive-preview', width: 1080, height: 1080, format: 'png', alpha: 'allowed', role: 'adaptive safe-zone preview only' });
  } else if (kind === 'adaptive-icon-foreground') {
    profiles.push({ id: 'android-adaptive-foreground', width: 1080, height: 1080, format: 'png', alpha: 'required', role: 'foreground candidate with 66 percent safe zone' });
  } else if (kind === 'adaptive-icon-background') {
    profiles.push({ id: 'android-adaptive-background', width: 1080, height: 1080, format: 'png', alpha: 'forbidden', role: 'opaque adaptive background candidate' });
  } else if (kind === 'notification-icon') {
    profiles.push({ id: 'android-notification-mask', width: 96, height: 96, format: 'png', alpha: 'required', role: 'single-colour white alpha mask candidate' });
  } else if (kind === 'store-feature-graphic') {
    profiles.push({ id: 'google-play-feature', width: 1024, height: 500, format: 'png', alpha: 'forbidden', role: 'store feature candidate' });
  } else if (kind === 'store-screenshot-frame') {
    profiles.push({ id: 'store-screenshot-frame', width: 1320, height: 2868, format: 'png', alpha: 'forbidden', role: 'device-independent store framing candidate' });
  } else if (kind === 'launch-art') {
    profiles.push({ id: 'launch-master', width: 2048, height: 2048, format: 'png', alpha: 'allowed', role: 'layout-flexible launch art candidate' });
  } else {
    profiles.push({ id: 'illustration-master', width: 2048, height: 2048, format: 'png', alpha: 'allowed', role: 'high-resolution in-app candidate' });
  }
  return profiles;
}
function proofMatrix(kind, backgroundPolicy) {
  const proofs = [
    'full-resolution-original-opened',
    'runtime-target-paths-reviewed',
    'palette-and-brand-signature-compared',
    'no-baked-checkerboard',
    'source-and-candidate-sha256-retained',
    'candidate-reviewed-by-a-human-or-governed-reviewer',
  ];
  if (ICON_KINDS.has(kind)) proofs.push('16-24-32-48-64-128-pixel-legibility-strip');
  if (backgroundPolicy === 'transparent' || backgroundPolicy === 'adaptive') {
    proofs.push('alpha-mask-proof', 'black-white-grey-green-magenta-hostile-backgrounds');
  }
  return proofs;
}
function normaliseAsset(raw, index, declaredPlatforms) {
  const source = object(raw, `assetRequests[${index}]`);
  const id = slug(source.id, `assetRequests[${index}].id`);
  const platforms = strings(source.platforms, `assetRequests[${index}].platforms`, 1, 2).map((item) => item.toLowerCase()).sort();
  if (platforms.some((platform) => !declaredPlatforms.includes(platform))) fail('asset_platform_mismatch', `Asset ${id} uses an undeclared platform.`);
  const rawTargets = object(source.runtimeTargets, `assetRequests[${index}].runtimeTargets`);
  const runtimeTargets = Object.fromEntries(platforms.map((platform) => [
    platform,
    strings(rawTargets[platform], `assetRequests[${index}].runtimeTargets.${platform}`, 1, 32)
      .map((item, targetIndex) => repositoryTarget(item, `assetRequests[${index}].runtimeTargets.${platform}[${targetIndex}]`)),
  ]));
  return {
    id,
    kind: string(source.kind, `assetRequests[${index}].kind`, 80),
    purpose: string(source.purpose, `assetRequests[${index}].purpose`, 800),
    platforms,
    runtimeTargets,
    backgroundPolicy: string(source.backgroundPolicy, `assetRequests[${index}].backgroundPolicy`, 32),
    visualConstraints: strings(source.visualConstraints ?? [], `assetRequests[${index}].visualConstraints`, 0, 64),
  };
}
function normaliseProductionPlan(input) {
  assertNoSecrets(input);
  const root = object(input, 'production plan');
  if (root.schema !== MOBILE_PRODUCTION_PLAN_SCHEMA) fail('unsupported_schema', `schema must be ${MOBILE_PRODUCTION_PLAN_SCHEMA}.`);
  const requestId = slug(root.requestId, 'requestId');
  const source = object(root.source, 'source');
  const sourceSha256 = string(source.sha256, 'source.sha256', 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(sourceSha256)) fail('invalid_source_digest', 'source.sha256 must be a 64-character SHA-256.');
  const runtimeRepository = string(root.runtimeRepository, 'runtimeRepository', 180);
  if (!/^EVAVO-STUDIO\/[A-Za-z0-9._-]+$/u.test(runtimeRepository)) fail('invalid_runtime_repository', 'runtimeRepository must name EVAVO-STUDIO/<repo>.');
  const cooperation = object(root.cooperation, 'cooperation');
  if (cooperation.creativeProduction !== 'EVAVO-STUDIO/evavo-art-studio') fail('wrong_creative_owner', 'Art Studio must own the creative production lane.');
  if (cooperation.runtimeOwner !== runtimeRepository) fail('runtime_owner_mismatch', 'Runtime owner must equal runtimeRepository.');
  const authority = object(root.authority, 'authority');
  if (
    authority.artStudioMayGenerateCandidates !== true ||
    authority.artStudioMayPublishRuntimeMain !== false ||
    authority.localStorageMayPublishRuntimeMain !== false ||
    authority.successfulGenerationEqualsApproval !== false ||
    authority.humanApprovalRequired !== true
  ) {
    fail('authority_boundary_rejected', 'The production plan weakens the candidate, approval or publication boundary.');
  }
  const delivery = object(root.delivery, 'delivery');
  if (delivery.candidateOnly !== true || delivery.humanApprovalRequired !== true) fail('delivery_boundary_rejected', 'Candidate-only human-approved delivery is required.');
  const app = object(root.app, 'app');
  const context = object(root.context, 'context');
  const brand = object(context.brand, 'context.brand');
  const device = object(context.device, 'context.device');
  const experience = object(context.experience, 'context.experience');
  const platforms = strings(root.platforms, 'platforms', 1, 2).map((item) => item.toLowerCase()).sort();
  if (platforms.some((item) => !['android', 'ios'].includes(item))) fail('unsupported_platform', 'Only android and ios are supported.');
  if (!Array.isArray(root.assetRequests) || root.assetRequests.length < 1 || root.assetRequests.length > 64) fail('invalid_assets', 'assetRequests must contain 1 to 64 items.');
  const assets = root.assetRequests.map((asset, index) => normaliseAsset(asset, index, platforms));
  if (new Set(assets.map((asset) => asset.id)).size !== assets.length) fail('duplicate_asset_id', 'Asset IDs must be unique.');
  return {
    requestId,
    source: { schema: string(source.schema, 'source.schema', 120), sha256: sourceSha256 },
    runtimeRepository,
    app: {
      id: string(app.id, 'app.id', 180),
      name: string(app.name, 'app.name', 100),
      summary: string(app.summary, 'app.summary', 1000),
    },
    platforms,
    context: {
      brand: canonical(brand),
      device: canonical(device),
      experience: canonical(experience),
    },
    assets,
    delivery: canonical(delivery),
  };
}

export function compileMobileAppAssetPlan(input) {
  const production = normaliseProductionPlan(input);
  const tasks = production.assets.map((asset) => {
    const workspace = logicalUri(production.requestId, asset.id);
    return {
      id: `mobile-asset:${production.requestId}:${asset.id}`,
      assetId: asset.id,
      kind: asset.kind,
      purpose: asset.purpose,
      platforms: asset.platforms,
      workspace: {
        root: workspace,
        immutableSource: `${workspace}/source`,
        candidates: `${workspace}/candidates`,
        reviewEvidence: `${workspace}/review`,
        approvedHandoff: `${workspace}/approved-handoff`,
      },
      context: {
        app: production.app,
        brand: production.context.brand,
        device: production.context.device,
        experience: production.context.experience,
        visualConstraints: asset.visualConstraints,
      },
      production: {
        provider: {
          selection: 'unselected',
          providerExecutionAuthorized: false,
          credentialsIncluded: false,
          requiresCapabilityAndExecutionAdmission: true,
        },
        backgroundPolicy: asset.backgroundPolicy,
        outputProfiles: outputProfiles(asset.kind, asset.platforms),
        sourcePolicy: {
          originalsImmutable: true,
          suppliedAssetRefs: production.context.brand.suppliedAssetRefs ?? [],
          fullResolutionReferencesRequired: true,
          generatedResultIsUnapprovedSource: true,
        },
        proofMatrix: proofMatrix(asset.kind, asset.backgroundPolicy),
      },
      runtimeHandoff: {
        repository: production.runtimeRepository,
        targets: asset.runtimeTargets,
        directWriteAllowed: false,
        integrationOwner: 'EVAVO-STUDIO/evavo-development-studio',
        requiresExactCandidateDigest: true,
        requiresApprovalReference: true,
      },
    };
  });

  const output = {
    schema: MOBILE_ASSET_PLAN_SCHEMA,
    requestId: production.requestId,
    source: {
      productionPlanSchema: MOBILE_PRODUCTION_PLAN_SCHEMA,
      briefSchema: production.source.schema,
      briefSha256: production.source.sha256,
      productionPlanSha256: sha256Object(input),
    },
    app: production.app,
    runtimeRepository: production.runtimeRepository,
    platforms: production.platforms,
    tasks,
    review: {
      fullResolutionRequired: true,
      runtimeScaleRequired: true,
      accessibilityRequired: true,
      alphaEvidenceRequiredWhenApplicable: true,
      humanApprovalRequired: true,
      automaticApprovalAllowed: false,
    },
    storage: {
      localStagingOwner: 'EVAVO-STUDIO/evavo-local-storage',
      durableEvidenceOwner: 'EVAVO-STUDIO/evavo-storage',
      bytesInControlPlaneJsonAllowed: false,
      logicalUrisRequired: true,
      immutableVersionsRequired: true,
    },
    prohibitedOperations: [
      'write-runtime-repository',
      'commit-or-push-runtime-main',
      'force-push',
      'overwrite-originals',
      'embed-provider-credentials',
      'bake-checkerboard-transparency',
      'auto-approve-provider-output',
      'infer-device-write-authority-from-vendor-handoff',
    ],
    authority: {
      mayCompileCandidateTasks: true,
      mayGenerateOrEditAfterSeparateAdmission: true,
      mayApproveAssets: false,
      mayWriteRuntimeTargets: false,
      mayCommitOrPushRuntimeRepository: false,
      maySelectProviderWithoutCapabilityEvidence: false,
      mayTreatGenerationAsApproval: false,
    },
  };
  return { ...output, planSha256: sha256Object(output) };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) fail('unexpected_argument', `Unexpected argument: ${token}.`);
    const key = token.slice(2);
    if (!['input', 'output', 'compact'].includes(key) || Object.hasOwn(result, key)) fail('unsupported_option', `Unsupported or duplicate option: --${key}.`);
    if (key === 'compact') {
      result[key] = true;
      continue;
    }
    const next = argv[++index];
    if (!next || next.startsWith('--')) fail('missing_option_value', `--${key} requires a value.`);
    result[key] = next;
  }
  if (!result.input) fail('input_required', 'Use --input <production-plan.json>.');
  return result;
}
function readJson(pathValue) {
  const path = resolve(pathValue);
  if (!existsSync(path)) fail('input_missing', 'Input file does not exist.');
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size <= 0 || stats.size > MAX_INPUT_BYTES) fail('unsafe_input', 'Input must be a regular non-symbolic JSON file no larger than 2 MiB.');
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail('invalid_json', `Invalid input JSON: ${error.message}`);
  }
}
function writeCreateOnly(pathValue, content) {
  const path = resolve(pathValue);
  if (!existsSync(dirname(path)) || existsSync(path)) fail('unsafe_output', 'Output parent must exist and output must not already exist.');
  writeFileSync(path, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
}
function comparableExecutionPath(value, platform = process.platform) {
  const pathTools = platform === 'win32' ? win32 : posix;
  const normalized = pathTools.resolve(value);
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}
export function isDirectExecution(
  entry = process.argv[1],
  modulePath = fileURLToPath(import.meta.url),
  platform = process.platform,
) {
  if (!entry) return false;
  return comparableExecutionPath(entry, platform) === comparableExecutionPath(modulePath, platform);
}
export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const plan = compileMobileAppAssetPlan(readJson(options.input));
  const content = `${JSON.stringify(plan, null, options.compact ? 0 : 2)}\n`;
  if (options.output) writeCreateOnly(options.output, content);
  else process.stdout.write(content);
  return plan;
}
if (isDirectExecution()) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      schema: 'evavo.mobile-app-asset-plan-error.v1',
      ok: false,
      code: error instanceof MobileAssetPlanError ? error.code : 'unexpected_error',
      message: error instanceof Error ? error.message : String(error),
    }, null, 2)}\n`);
    process.exitCode = error instanceof MobileAssetPlanError ? 2 : 1;
  }
}
