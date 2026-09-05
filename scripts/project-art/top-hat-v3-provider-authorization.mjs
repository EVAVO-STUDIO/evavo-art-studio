import { createHash } from 'node:crypto';

export const TOP_HAT_V3_PROVIDER_AUTHORIZATION_SCHEMA =
  'evavo.project-art-top-hat-v3-provider-authorization.v1';
export const TOP_HAT_V3_PROVIDER_AUTHORIZATION_ACTION =
  'top-hat-v3-provider-campaign';

const freeze = Object.freeze;
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[a-z0-9][a-z0-9._:@-]{0,255}$/u;

function fail(code, detail = code) {
  const error = new Error(`${code}:${detail}`);
  error.code = code;
  throw error;
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('TOP_HAT_V3_AUTH_RECORD_INVALID', label);
  }
  return value;
}

function identifier(value, label) {
  const text = String(value ?? '');
  if (!SAFE_ID.test(text)) fail('TOP_HAT_V3_AUTH_ID_INVALID', label);
  return text;
}

function timestamp(value, label) {
  const text = String(value ?? '');
  const time = Date.parse(text);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== text) {
    fail('TOP_HAT_V3_AUTH_TIMESTAMP_INVALID', label);
  }
  return text;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function sha256Document(value) {
  return createHash('sha256')
    .update(`${JSON.stringify(canonical(value))}\n`, 'utf8')
    .digest('hex');
}

function adapterIds(value) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 8 ||
    value.some((entry) => typeof entry !== 'string' || !SAFE_ID.test(entry))
  ) {
    fail('TOP_HAT_V3_AUTH_ADAPTERS_INVALID');
  }
  return freeze([...new Set(value)].sort());
}

export function compileTopHatV3ProviderAuthorization(input = {}) {
  const body = freeze({
    schema: TOP_HAT_V3_PROVIDER_AUTHORIZATION_SCHEMA,
    action: TOP_HAT_V3_PROVIDER_AUTHORIZATION_ACTION,
    characterId: 'top-hat-man',
    generationPlanSha256: String(input.generationPlanSha256 ?? ''),
    actorClass: 'human',
    actorId: identifier(input.actorId, 'actorId'),
    occurredAt: timestamp(input.occurredAt, 'occurredAt'),
    expiresAt: timestamp(input.expiresAt, 'expiresAt'),
    allowedAdapterIds: adapterIds(input.allowedAdapterIds),
    maximumProviderCalls: input.maximumProviderCalls ?? 755,
    maximumConcurrentCalls: input.maximumConcurrentCalls ?? 4,
    scope: freeze({
      foundationPoses: input.foundationPoses !== false,
      registeredLayers: input.registeredLayers !== false,
      bodyFrames: input.bodyFrames !== false,
      deterministicQa: input.deterministicQa !== false,
      candidateMaterialization: true,
      creativeApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      publication: false,
      runtimeActivation: false,
      deployment: false,
    }),
    localFirst: true,
    providerFallbackAllowed: false,
    stopOnAuthorizationExpiry: true,
    stopOnCallBudgetExhaustion: true,
    stopOnReferenceOrContinuityFailure: true,
  });

  if (!SHA256.test(body.generationPlanSha256)) {
    fail('TOP_HAT_V3_AUTH_GENERATION_PLAN_SHA256_INVALID');
  }
  if (
    !Number.isSafeInteger(body.maximumProviderCalls) ||
    body.maximumProviderCalls < 1 ||
    body.maximumProviderCalls > 755
  ) {
    fail('TOP_HAT_V3_AUTH_CALL_BUDGET_INVALID');
  }
  if (
    !Number.isSafeInteger(body.maximumConcurrentCalls) ||
    body.maximumConcurrentCalls < 1 ||
    body.maximumConcurrentCalls > 16
  ) {
    fail('TOP_HAT_V3_AUTH_CONCURRENCY_INVALID');
  }
  if (Date.parse(body.expiresAt) <= Date.parse(body.occurredAt)) {
    fail('TOP_HAT_V3_AUTH_WINDOW_INVALID');
  }
  if (
    body.scope.creativeApproval !== false ||
    body.scope.candidatePromotion !== false ||
    body.scope.targetRepositoryMutation !== false ||
    body.scope.gitMutation !== false ||
    body.scope.publication !== false ||
    body.scope.runtimeActivation !== false ||
    body.scope.deployment !== false ||
    body.providerFallbackAllowed !== false
  ) {
    fail('TOP_HAT_V3_AUTH_SCOPE_ESCALATED');
  }

  return freeze({ ...body, authorizationSha256: sha256Document(body) });
}

export function inspectTopHatV3ProviderAuthorization(value, options = {}) {
  const auth = record(value, 'authorization');
  if (
    auth.schema !== TOP_HAT_V3_PROVIDER_AUTHORIZATION_SCHEMA ||
    auth.action !== TOP_HAT_V3_PROVIDER_AUTHORIZATION_ACTION ||
    auth.characterId !== 'top-hat-man' ||
    auth.actorClass !== 'human' ||
    auth.localFirst !== true ||
    auth.providerFallbackAllowed !== false ||
    auth.scope?.creativeApproval !== false ||
    auth.scope?.candidatePromotion !== false ||
    auth.scope?.gitMutation !== false ||
    auth.scope?.publication !== false ||
    auth.scope?.runtimeActivation !== false ||
    !SHA256.test(auth.authorizationSha256 ?? '')
  ) {
    fail('TOP_HAT_V3_AUTH_INVALID');
  }
  const { authorizationSha256, ...body } = auth;
  if (sha256Document(body) !== authorizationSha256) {
    fail('TOP_HAT_V3_AUTH_HASH_INVALID');
  }
  const now = options.now ? new Date(options.now) : new Date();
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) fail('TOP_HAT_V3_AUTH_NOW_INVALID');
  const active = nowMs >= Date.parse(auth.occurredAt) && nowMs < Date.parse(auth.expiresAt);
  const usedProviderCalls = options.usedProviderCalls ?? 0;
  if (
    !Number.isSafeInteger(usedProviderCalls) ||
    usedProviderCalls < 0 ||
    usedProviderCalls > auth.maximumProviderCalls
  ) {
    fail('TOP_HAT_V3_AUTH_USAGE_INVALID');
  }
  return freeze({
    schema: 'evavo.project-art-top-hat-v3-provider-authorization-readiness.v1',
    characterId: 'top-hat-man',
    actorId: auth.actorId,
    generationPlanSha256: auth.generationPlanSha256,
    authorizationSha256,
    active,
    allowedAdapterIds: auth.allowedAdapterIds,
    maximumProviderCalls: auth.maximumProviderCalls,
    usedProviderCalls,
    remainingProviderCalls: auth.maximumProviderCalls - usedProviderCalls,
    maximumConcurrentCalls: auth.maximumConcurrentCalls,
    localFirst: true,
    providerFallbackAllowed: false,
    creativeApprovalAuthorized: false,
    candidatePromotionAuthorized: false,
    runtimeActivationAuthorized: false,
  });
}
