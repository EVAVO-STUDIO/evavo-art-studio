import {
  TOP_HAT_POSE_SLOT_PRODUCTION_PLAN_SCHEMA,
  canonicalTopHatPoseSlotProductionJson,
  compileProjectArtTopHatPoseSlotProduction,
  createProjectArtTopHatPoseSlotProductionRequest,
} from './top-hat-pose-slot-production.mjs';
import {
  ADAPTER_ID,
  ARTIFACT_ID,
  CHARACTER_ID,
  MAXIMUM_AUTHORIZATION_WINDOW_MS,
  MAXIMUM_BINDINGS_PER_JOB,
  TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_REQUEST_SCHEMA,
  assertPassive,
  boundedText,
  canonicalPath,
  digest,
  exactKeys,
  fail,
  falseAuthority,
  identifier,
  isRecord,
  timestamp,
} from './top-hat-pose-slot-provider-foundation.mjs';

export function currentPlan() {
  return compileProjectArtTopHatPoseSlotProduction(
    createProjectArtTopHatPoseSlotProductionRequest(),
  );
}

export function parsePlan(value) {
  if (!isRecord(value) || value.schema !== TOP_HAT_POSE_SLOT_PRODUCTION_PLAN_SCHEMA) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_PLAN_SCHEMA_INVALID');
  }
  const expected = currentPlan();
  if (
    value.planSha256 !== expected.planSha256 ||
    canonicalTopHatPoseSlotProductionJson(value) !==
      canonicalTopHatPoseSlotProductionJson(expected)
  ) {
    fail(
      'PROJECT_ART_TOP_HAT_PROVIDER_PLAN_MISMATCH',
      'The provider package must bind the exact current Runtime 0.34 pose-slot plan.',
    );
  }
  if (
    value.characterId !== CHARACTER_ID ||
    value.providerExecutionAllowed !== false ||
    value.productionReady !== false ||
    value.runtimeActivationAllowed !== false ||
    value.counts?.requiredPoseSlots !== 6 ||
    value.counts?.activationEligiblePoseSlots !== 0
  ) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_PLAN_STATE_INVALID');
  }
  for (const [key, entry] of Object.entries(value.authority ?? {})) {
    if (entry !== false) {
      fail(
        'PROJECT_ART_TOP_HAT_PROVIDER_UPSTREAM_AUTHORITY_ESCALATED',
        `plan.authority.${key} must remain false.`,
      );
    }
  }
  return expected;
}

export function parseAdapter(value, label) {
  if (value === null) return null;
  if (typeof value !== 'string' || !ADAPTER_ID.test(value)) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_ADAPTER_INVALID', `${label} is invalid.`);
  }
  return value;
}

export function parseSelection(value, label) {
  exactKeys(
    value,
    [
      'preferredAdapterId',
      'preferredModel',
      'allowedAdapterIds',
      'allowFallback',
      'requireSeed',
      'seed',
    ],
    label,
  );
  if (!Array.isArray(value.allowedAdapterIds) || value.allowedAdapterIds.length > 32) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_ALLOWED_ADAPTERS_INVALID');
  }
  const allowedAdapterIds = value.allowedAdapterIds.map((entry, index) =>
    parseAdapter(entry, `${label}.allowedAdapterIds[${index}]`),
  );
  if (new Set(allowedAdapterIds).size !== allowedAdapterIds.length) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_ALLOWED_ADAPTERS_DUPLICATE');
  }
  if (value.allowFallback !== false) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_FALLBACK_FORBIDDEN');
  }
  if (value.requireSeed !== true && value.requireSeed !== false) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_REQUIRE_SEED_INVALID');
  }
  if (
    value.seed !== null &&
    (!Number.isSafeInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff)
  ) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_SEED_INVALID');
  }
  const preferredAdapterId = parseAdapter(
    value.preferredAdapterId,
    `${label}.preferredAdapterId`,
  );
  if (
    preferredAdapterId !== null &&
    allowedAdapterIds.length > 0 &&
    !allowedAdapterIds.includes(preferredAdapterId)
  ) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_PREFERRED_ADAPTER_NOT_ALLOWED');
  }
  return Object.freeze({
    preferredAdapterId,
    preferredModel: parseAdapter(value.preferredModel, `${label}.preferredModel`),
    allowedAdapterIds: Object.freeze(allowedAdapterIds),
    allowFallback: false,
    requireSeed: value.requireSeed,
    seed: value.seed,
  });
}

export function parseAuthorization(value, slotId, label) {
  if (value === null) return null;
  exactKeys(
    value,
    [
      'action',
      'actorClass',
      'actorId',
      'slotId',
      'occurredAt',
      'expiresAt',
      'evidenceSha256',
      'maximumProviderCalls',
    ],
    label,
  );
  if (value.action !== 'run-top-hat-pose-provider-once') {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_AUTHORIZATION_ACTION_INVALID');
  }
  if (value.actorClass !== 'human') {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_HUMAN_AUTHORIZATION_REQUIRED');
  }
  if (value.slotId !== slotId) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_AUTHORIZATION_SLOT_MISMATCH');
  }
  if (value.maximumProviderCalls !== 1) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_ONE_CALL_AUTHORIZATION_REQUIRED');
  }
  const occurredAt = timestamp(value.occurredAt, `${label}.occurredAt`);
  const expiresAt = timestamp(value.expiresAt, `${label}.expiresAt`);
  const duration = Date.parse(expiresAt) - Date.parse(occurredAt);
  if (duration <= 0 || duration > MAXIMUM_AUTHORIZATION_WINDOW_MS) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_AUTHORIZATION_WINDOW_INVALID');
  }
  return Object.freeze({
    action: 'run-top-hat-pose-provider-once',
    actorClass: 'human',
    actorId: boundedText(value.actorId, `${label}.actorId`, {
      minimum: 1,
      maximum: 256,
    }),
    slotId,
    occurredAt,
    expiresAt,
    evidenceSha256: digest(value.evidenceSha256, `${label}.evidenceSha256`),
    maximumProviderCalls: 1,
  });
}

export function parseBinding(value, label) {
  exactKeys(
    value,
    [
      'bindingKey',
      'role',
      'sourcePath',
      'sourceSha256',
      'artifactId',
      'evidenceSha256',
      'actorClass',
      'actorId',
      'occurredAt',
    ],
    label,
  );
  const bindingKey = identifier(value.bindingKey, `${label}.bindingKey`);
  if (typeof value.artifactId !== 'string' || !ARTIFACT_ID.test(value.artifactId)) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_ARTIFACT_ID_INVALID');
  }
  if (value.actorClass !== 'human') {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_HUMAN_ARTIFACT_ADMISSION_REQUIRED');
  }
  return Object.freeze({
    bindingKey,
    role: identifier(value.role, `${label}.role`),
    sourcePath: canonicalPath(value.sourcePath, `${label}.sourcePath`),
    sourceSha256: digest(value.sourceSha256, `${label}.sourceSha256`),
    artifactId: value.artifactId,
    evidenceSha256: digest(value.evidenceSha256, `${label}.evidenceSha256`),
    actorClass: 'human',
    actorId: boundedText(value.actorId, `${label}.actorId`, {
      minimum: 1,
      maximum: 256,
    }),
    occurredAt: timestamp(value.occurredAt, `${label}.occurredAt`),
  });
}

export function requiredReferences(slot, plan) {
  return Object.freeze([
    ...plan.identityAnchors.map((anchor) =>
      Object.freeze({
        bindingKey: `anchor:${anchor.id}`,
        role: anchor.id === 'neutral' ? 'edit-source' : 'identity-anchor',
        sourcePath: anchor.path,
        sourceSha256: anchor.sha256,
        sourceClipId: null,
        exactSourceIdentityRequired: true,
      }),
    ),
    ...slot.sourceMapping.sourceClipIds.map((sourceClipId) =>
      Object.freeze({
        bindingKey: `clip:${sourceClipId}`,
        role: 'animation-clip-reference',
        sourcePath: null,
        sourceSha256: null,
        sourceClipId,
        exactSourceIdentityRequired: false,
      }),
    ),
  ]);
}

export function admitBindings(bindings, requirements) {
  const byKey = new Map();
  for (const binding of bindings) {
    if (byKey.has(binding.bindingKey)) {
      fail('PROJECT_ART_TOP_HAT_PROVIDER_BINDING_DUPLICATE');
    }
    byKey.set(binding.bindingKey, binding);
  }
  const requirementKeys = new Set(requirements.map((entry) => entry.bindingKey));
  for (const key of byKey.keys()) {
    if (!requirementKeys.has(key)) {
      fail('PROJECT_ART_TOP_HAT_PROVIDER_BINDING_UNEXPECTED', key);
    }
  }
  const admitted = [];
  const missing = [];
  for (const requirement of requirements) {
    const binding = byKey.get(requirement.bindingKey);
    if (!binding) {
      missing.push(requirement.bindingKey);
      continue;
    }
    if (binding.role !== requirement.role) {
      fail('PROJECT_ART_TOP_HAT_PROVIDER_BINDING_ROLE_MISMATCH');
    }
    if (
      requirement.exactSourceIdentityRequired &&
      (binding.sourcePath !== requirement.sourcePath ||
        binding.sourceSha256 !== requirement.sourceSha256)
    ) {
      fail('PROJECT_ART_TOP_HAT_PROVIDER_BINDING_SOURCE_MISMATCH');
    }
    admitted.push(
      Object.freeze({
        ...binding,
        sourceClipId: requirement.sourceClipId,
        exactSourceIdentityRequired: requirement.exactSourceIdentityRequired,
      }),
    );
  }
  return Object.freeze({
    admitted: Object.freeze(admitted),
    missing: Object.freeze(missing),
  });
}

export function parseRequest(value) {
  assertPassive(value);
  exactKeys(value, ['schema', 'requestId', 'plan', 'jobs', 'authority'], 'request');
  if (value.schema !== TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_REQUEST_SCHEMA) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_REQUEST_SCHEMA_INVALID');
  }
  const requestId = identifier(value.requestId, 'request.requestId');
  const plan = parsePlan(value.plan);
  const authority = falseAuthority(value.authority);
  if (!Array.isArray(value.jobs) || value.jobs.length !== plan.productionSlots.length) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_REQUEST_JOBS_INVALID');
  }
  const slotsById = new Map(plan.productionSlots.map((slot) => [slot.slotId, slot]));
  const seen = new Set();
  const jobs = value.jobs.map((entry, index) => {
    const label = `request.jobs[${index}]`;
    exactKeys(
      entry,
      [
        'slotId',
        'candidateOutputPath',
        'selection',
        'authorization',
        'artifactBindings',
        'notes',
      ],
      label,
    );
    const slotId = identifier(entry.slotId, `${label}.slotId`);
    if (seen.has(slotId)) fail('PROJECT_ART_TOP_HAT_PROVIDER_REQUEST_JOB_DUPLICATE');
    seen.add(slotId);
    const slot = slotsById.get(slotId);
    if (!slot) fail('PROJECT_ART_TOP_HAT_PROVIDER_REQUEST_SLOT_UNKNOWN');
    const candidateOutputPath = canonicalPath(
      entry.candidateOutputPath,
      `${label}.candidateOutputPath`,
    );
    if (candidateOutputPath !== slot.candidateOutputs.rgbaMasterPath) {
      fail('PROJECT_ART_TOP_HAT_PROVIDER_CANDIDATE_PATH_INVALID');
    }
    if (
      !Array.isArray(entry.artifactBindings) ||
      entry.artifactBindings.length > MAXIMUM_BINDINGS_PER_JOB
    ) {
      fail('PROJECT_ART_TOP_HAT_PROVIDER_BINDINGS_INVALID');
    }
    return Object.freeze({
      slot,
      slotId,
      candidateOutputPath,
      selection: parseSelection(entry.selection, `${label}.selection`),
      authorization: parseAuthorization(
        entry.authorization,
        slotId,
        `${label}.authorization`,
      ),
      artifactBindings: Object.freeze(
        entry.artifactBindings.map((binding, bindingIndex) =>
          parseBinding(binding, `${label}.artifactBindings[${bindingIndex}]`),
        ),
      ),
      notes: boundedText(entry.notes, `${label}.notes`, { maximum: 4096 }),
    });
  });
  for (const slot of plan.productionSlots) {
    if (!seen.has(slot.slotId)) {
      fail('PROJECT_ART_TOP_HAT_PROVIDER_REQUEST_SLOT_MISSING', slot.slotId);
    }
  }
  return Object.freeze({ requestId, plan, jobs: Object.freeze(jobs), authority });
}
