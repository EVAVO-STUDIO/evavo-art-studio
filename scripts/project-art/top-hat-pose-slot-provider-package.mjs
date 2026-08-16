import { createHash } from 'node:crypto';
import path from 'node:path';

import {
  TOP_HAT_POSE_SLOT_PRODUCTION_PLAN_SCHEMA,
  canonicalTopHatPoseSlotProductionJson,
  compileProjectArtTopHatPoseSlotProduction,
  createProjectArtTopHatPoseSlotProductionRequest,
} from './top-hat-pose-slot-production.mjs';

export const TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_REQUEST_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-provider-package-request.v1';
export const TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-provider-package.v1';
export const TOP_HAT_POSE_SLOT_PROVIDER_JOB_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-provider-job.v1';
export const TOP_HAT_POSE_SLOT_PROVIDER_METADATA_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-provider-metadata.v1';
export const TOP_HAT_POSE_SLOT_PROVIDER_CAPABILITIES_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-provider-capabilities.v1';

const IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,191}$/u;
const ADAPTER_ID = /^[a-z0-9][a-z0-9._-]{0,95}$/u;
const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const MAXIMUM_DOCUMENT_NODES = 32_768;
const MAXIMUM_DEPTH = 48;
const MAXIMUM_TEXT = 8_192;
const MAXIMUM_BINDINGS_PER_JOB = 16;
const MAXIMUM_AUTHORIZATION_WINDOW_MS = 24 * 60 * 60 * 1_000;
const CHARACTER_ID = 'top-hat-man';

const AUTHORITY_KEYS = Object.freeze([
  'sourceMutation',
  'automaticGenerationAuthorization',
  'providerExecution',
  'imageMutation',
  'creativeDecision',
  'candidateApproval',
  'candidatePromotion',
  'poseSlotFilling',
  'sequenceRelease',
  'repositoryMutation',
  'gitCommit',
  'gitPush',
  'deployment',
  'publication',
  'runtimeActivation',
  'forcePush',
]);

const MUST_AVOID = Object.freeze([
  'malformed hands or fingers',
  'broken wrists, duplicated limbs or missing digits',
  'face or character identity drift',
  'body-proportion or silhouette drift',
  'top-hat geometry drift',
  'wardrobe redesign',
  'camera, pivot, baseline or canvas-registration drift',
  'cropping or visible canvas-edge contact',
  'painted checkerboard, opaque matte or fake transparency',
  'green, magenta or other chroma spill',
  'dark or pale alpha fringe caused by association mismatch',
  'baked mouth visemes in the body master',
  'whole-body switching driven by speech visemes',
  'synthetic body in-betweening represented as authored pose art',
  'multiple candidates, contact sheets, labels or text in provider output',
]);

export class ProjectArtTopHatPoseSlotProviderPackageError extends Error {
  constructor(code, message = code) {
    super(message === code ? code : `${code}: ${message}`);
    this.name = 'ProjectArtTopHatPoseSlotProviderPackageError';
    this.code = code;
  }
}

function fail(code, message = code) {
  throw new ProjectArtTopHatPoseSlotProviderPackageError(code, message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys, label) {
  if (!isRecord(value)) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_OBJECT_INVALID', `${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(
      'PROJECT_ART_TOP_HAT_PROVIDER_KEYS_INVALID',
      `${label} has unexpected or missing fields.`,
    );
  }
}

function assertPassive(value) {
  const seen = new WeakSet();
  let nodes = 0;
  function visit(current, depth) {
    nodes += 1;
    if (nodes > MAXIMUM_DOCUMENT_NODES || depth > MAXIMUM_DEPTH) {
      fail('PROJECT_ART_TOP_HAT_PROVIDER_DOCUMENT_TOO_LARGE');
    }
    if (
      current === null ||
      typeof current === 'string' ||
      typeof current === 'boolean'
    ) {
      return;
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) {
        fail('PROJECT_ART_TOP_HAT_PROVIDER_NUMBER_INVALID');
      }
      return;
    }
    if (typeof current !== 'object' || ArrayBuffer.isView(current)) {
      fail('PROJECT_ART_TOP_HAT_PROVIDER_VALUE_INVALID');
    }
    if (seen.has(current)) {
      fail('PROJECT_ART_TOP_HAT_PROVIDER_DOCUMENT_CYCLIC');
    }
    seen.add(current);
    if (Object.getOwnPropertySymbols(current).length > 0) {
      fail('PROJECT_ART_TOP_HAT_PROVIDER_SYMBOL_FORBIDDEN');
    }
    for (const key of Reflect.ownKeys(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
        fail('PROJECT_ART_TOP_HAT_PROVIDER_ACCESSOR_FORBIDDEN');
      }
      visit(descriptor.value, depth + 1);
    }
    seen.delete(current);
  }
  visit(value, 0);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_CANONICAL_JSON_INVALID');
  }
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_CANONICAL_JSON_INVALID');
  }
  return value;
}

export function canonicalTopHatPoseSlotProviderPackageJson(value) {
  return JSON.stringify(canonical(value));
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256Document(value) {
  return sha256Bytes(
    Buffer.from(canonicalTopHatPoseSlotProviderPackageJson(value), 'utf8'),
  );
}

function freezeClone(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeClone));
  if (isRecord(value)) {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, freezeClone(entry)]),
      ),
    );
  }
  return value;
}

function boundedText(value, label, { minimum = 0, maximum = MAXIMUM_TEXT } = {}) {
  if (
    typeof value !== 'string' ||
    value.length < minimum ||
    value.length > maximum ||
    value.includes('\0')
  ) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_TEXT_INVALID', `${label} is invalid.`);
  }
  return value;
}

function identifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_IDENTIFIER_INVALID', `${label} is invalid.`);
  }
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_SHA256_INVALID', `${label} is invalid.`);
  }
  return value;
}

function timestamp(value, label) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_TIMESTAMP_INVALID', `${label} is invalid.`);
  }
  return value;
}

function canonicalPath(value, label) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 1024 ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.startsWith('/') ||
    value.startsWith('../') ||
    value.includes('/../') ||
    value.includes('//') ||
    /^[A-Za-z]:/u.test(value)
  ) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_PATH_INVALID', `${label} is invalid.`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === '.' || normalized === '..') {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_PATH_INVALID', `${label} is not canonical.`);
  }
  return value;
}

function falseAuthority(value, label = 'authority') {
  exactKeys(value, AUTHORITY_KEYS, label);
  for (const key of AUTHORITY_KEYS) {
    if (value[key] !== false) {
      fail(
        'PROJECT_ART_TOP_HAT_PROVIDER_FALSE_AUTHORITY_REQUIRED',
        `${label}.${key} must remain false.`,
      );
    }
  }
  return Object.freeze(
    Object.fromEntries(AUTHORITY_KEYS.map((key) => [key, false])),
  );
}

export function createProjectArtTopHatPoseSlotProviderAuthority() {
  return falseAuthority(
    Object.fromEntries(AUTHORITY_KEYS.map((key) => [key, false])),
  );
}

function currentPlan() {
  return compileProjectArtTopHatPoseSlotProduction(
    createProjectArtTopHatPoseSlotProductionRequest(),
  );
}

function parsePlan(value) {
  if (!isRecord(value) || ivalue.schema !== TOP_HAT_POSE_SLOT_PRODUCTION_PLAN_SCHEMA) {
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
       `${key} must remain false.`,
      );
    }
  }
  return expected;
}

function parseAdapter(value, label) {
  if (value === null) return null;
  if (typeof value !== 'string' || !ADAPTER_ID.test(value)) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_ADAPTER_INVALID', `${label} is invalid.`);
  }
  return value;
}

function parseSelection(value, label) {
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
  if (value.requireSeed && value.seed === null) {
    // Keep the request parseable so the compiled job can report a precise blocker.
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

function parseAuthorization(value, slotId, label) {
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

function parseBinding(value, label) {
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

function requiredReferences(slot, plan) {
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

function admitBindings(bindings, requirements) {
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

function composedPrompt(slot) {
  const handReview = slot.review.handAndFingerReviewRequired
    ? ' Hands, wrists and every visible finger must remain anatomically correct.'
    : '';
  return [
    `Create exactly one ${CHARACTER_ID} full-body registered key pose for Runtime slot ${slot.slotId}.`,
    slot.productionBrief.performance,
     'Match the three admitted identity and breathing anchors exactly.',
    'Preserve the 1024 x 1536 full canvas, pivot, baseline, silhouette, face, hat, coat, body proportions and lighting.',
    'The body master must be straight RGBA with real native alpha and no baked speech mouth shape.',
   'Registered mouth layers retain exclusive viseme and audio-timing ownership.',
    `ÛÛ[Z]HÛÛ^ˆ	ÜÛİœÛİ\˜ÙSX\[™Ë˜ÛÛ[Z]PÛÛ^K˜ˆ[™™]šY]ËˆBˆš›Ú[Š	È	ÊBˆœ™\XÙJ×ÊËÙİK	È	ÊBˆš[J
NÂŸB‚™[˜İ[Ûˆ›İšY\”™\]Y\İ[œ]
[K[‹YZ\ÜÚ[ÛœË›Û\
HÂˆ™]\›ˆØš™Xİ™œ™Y^™JÂˆØÚ[XU™\œÚ[Ûˆ	ÌKŒ	ËˆÜ\˜][Ûˆ	ÙY]	Ëˆ\ÜÙ]Ú[™ˆ	ÜÜš]KYœ˜[YIËˆÛÛ[Z]T\ÙNˆ	ÜÙ[X[XËZÙ^K\ÜÙIËˆ\ÜÙ]Yˆ	ĞÒTPÕT—ÒQN‰Ù[KœÛİYXˆØ[™Y]Q˜[Z[RY‚ˆÜZ]\ÜÙK\Ûİ‰Ü[‹œ[”ÚLMŸN‰Ù[KœÛİYXˆÜ™X]]™R[[ˆ›Û\ˆ™YØ]]™R[[ˆ™Z™XİØ[™Y]\ÈÚ]ˆ	ÓUTÕĞU“ÒQš›Ú[Š	ÎÈ	Ê_K˜ˆİ[NˆØš™Xİ™œ™Y^™JÂˆİ[S˜[YNˆ	ĞÒTPÕT—ÒQHØ[›ÛšXØ[]˜]\ˆ›ÙXİ[Ûˆİ[Xˆ[[‚ˆ	ÓX]ÚHYZ]Y[\™\ÛÛ][ÛˆY[]H[˜ÚÜœÈ[™Ûİ™\›™Y[š[X][Û‹\İZ]HÛÛ[Z]H^XİK‰Ëˆ]\İ]™NˆØš™Xİ™œ™Y^™JÂˆ	ÛÛ™HÛÚ\™[[X›ÙH™YÚ\İ\™YÚ\˜Xİ\ˆÜÙIËˆ	ÜİX›H˜XÙH[™Ú\˜Xİ\ˆY[]IËˆ	ÜİX›H[˜]Û^KÚ[İY]K]›İ[™˜\Ù[[™IËˆ	ÜİX›HÜZ][™Ø\™›Ø™HÙ[ÛY]IËˆ	Û˜]]™Hİ˜ZYÚX[H˜[œÜ\™[˜ŞIËˆ	Û›È˜ZÙY[İ]š\Ù[YIËˆ‹‹Š[KœÛİœ™]šY]Ëš[™[™š[™Ù\”™]šY]Ô™\]Z\™YˆÈÉØÛÜœ™XİÜš\İË[™È[™]™\Hš\ÚX›Hš[™Ù\‰×Bˆˆ×JKˆJKˆ]\İ]›ÚYˆUTÕĞU“ÒQˆY[]SØÚÜÎˆØš™Xİ™œ™Y^™Jˆ[‹šY[]P[˜ÚÜœË›X\

[˜ÚÜŠHO‚ˆ	Ø[˜ÚÜ‹šYN‰Ø[˜ÚÜ‹œÚLMŸXˆ
Kˆ
Kˆ[]NˆØš™Xİ™œ™Y^™J×JKˆ[™U™X]Y[ˆØš™Xİ™œ™Y^™JÂˆ	ÓX]ÚHØ[›ÛšXØ[™Y™\™[˜ÙHÚ]İ]™\Z[[™ÈÜˆİ[HšY‰ËˆJKˆX]\šX[ÎˆØš™Xİ™œ™Y^™J×JKˆØ[Y\˜T[\ÎˆØš™Xİ™œ™Y^™JÂˆ	Ô™\Ù\™HH^Xİ^\İ[™ÈØ[Y\˜K[XØ[˜\Èœ˜[Z[™È[™\œÜXİ]™K‰ËˆJKˆÛÛ\ÜÚ][Û”[\ÎˆØš™Xİ™œ™Y^™JÂˆ	ÒÙY\H[\™HÚ[İY]H[œÚYHH^XİLMLÍˆ™YÚ\İ\™YØ[˜\Ë‰ËˆJKˆ\˜T[\ÎˆØš™Xİ™œ™Y^™J×JKˆJKˆÚİˆØš™Xİ™œ™Y^™JÂˆİXš™Xİˆ	ĞÒTPÕT—ÒQH	Ù[KœÛİYHÜÙXˆXİ[Ûˆ[KœÛİœ›ÙXİ[ÛœšYY‹œ\™›Ü›X[˜ÙKˆ\™Xİ[Ûˆ	ÓX]ÚYZ]Y[˜ÚÜœÈ[™ÛÛ[Z]H™Y™\™[˜Ù\È^XİK‰Ëˆ[˜ÛYNˆØš™Xİ™œ™Y^™JÂˆÙ^HÙ[XİÜˆ	Ù[KœÛİœÛİ\˜ÙSX\[™ËšÙ^TÜÙTÙ[XİÜŸXˆÛÛ[Z]H	Ù[KœÛİœÛİ\˜ÙSX\[™Ë˜ÛÛ[Z]PÛÛ^Xˆ	Ü™X[İ˜ZYÚX[Hİ]]	Ëˆ	ÜİX›H[X›ÙH™YÚ\İ˜][Û‰ËˆJKˆ^ÛYNˆUTÕĞU“ÒQˆÙ\\˜]P\ÜÙ]ÎˆØš™Xİ™œ™Y^™J×JKˆœ˜[Z[™ÎˆØš™Xİ™œ™Y^™JÂˆ	ÓÛ™H^Xİ™YÚ\İ\™Y[X›ÙHÚ\˜Xİ\ˆÜÙHÛˆ˜[œÜ\™[[K‰ËˆJKˆJKˆ\™Ù]ˆØš™Xİ™œ™Y^™JÂˆÚYˆLˆZYÚˆMLÍ‹ˆ˜[œÜ\™[˜ŞNˆ	Ü™\]Z\™Y	Ëˆİ]]›Ü›X]ˆ	Ü™ÉËˆ^[›Ü›X]ˆ	Ü™Ø˜N\İ˜ZYÚ	Ëˆ[P\ÜÛØÚX][Ûˆ	Üİ˜ZYÚ	ËˆÛÛİ\”ÜXÙNˆ	ÜÜ™Ø‰Ëˆš[U˜[œÜ\™[›Ü™\œÎˆ˜[ÙKˆ›İ]P]\Ô™YÚ[ÛœÎˆ˜[ÙKˆJKˆÛİ\˜ÙPØ[˜\ÎˆØš™Xİ™œ™Y^™JÂˆÚYˆLˆZYÚˆMLÍ‹ˆ^[›Ü›X]ˆ	Ü™Ø˜N\İ˜ZYÚ	ËˆJKˆ˜XÚÙÜ›İ[™ˆØš™Xİ™œ™Y^™JÂˆİ˜]YŞNˆ	Û˜]]™KX[IËˆZ[YÚXÚÙ\˜›Ø\™[İÙYˆ˜[ÙKˆÜ\]YSX]P[İÙYˆ˜[ÙKˆÚ›ÛXTÜ[[İÙYˆ˜[ÙKˆJKˆ]X[]Nˆ	ÚYÚ	ËˆØ[™Y]PÛİ[ˆKˆ‹‹Š[KœÙ[Xİ[Û‹œÙYYOOH[ÈßHˆÈÙYYˆ[KœÙ[Xİ[Û‹œÙYYJKˆ™Y™\™[˜Ù\ÎˆØš™Xİ™œ™Y^™JˆYZ\ÜÚ[ÛœË˜YZ]Y›X\

š[™[™ÊHO‚ˆØš™Xİ™œ™Y^™JÂˆ\Y˜XİYˆš[™[™Ë˜\Y˜XİYˆ›ÛNˆš[™[™Ëœ›ÛKˆİ™[™İˆKˆ™\]Z\™YˆYKˆ›İN‚ˆš[™[™ËœÛİ\˜ÙPÛ\YOOH[ˆÈ	Øš[™[™Ë˜š[™[™ÒÙ^_H^Xİ\›İ™Y›ÙH[˜ÚÜ˜ˆˆ	Øš[™[™Ë˜š[™[™ÒÙ^_HÛÛ[Z]HÛİ\˜ÙHœ›ÛHH[›™Y[š[X][ÛˆİZ]XˆJKˆ
Kˆ
KˆÙ[Xİ[ÛˆØš™Xİ™œ™Y^™JÂˆ‹‹Š[KœÙ[Xİ[Û‹œ™Y™\œ™YY\\’YˆÈÈ™Y™\œ™YY\\’Yˆ[KœÙ[Xİ[Û‹œ™Y™\œ™YY\\’YBˆˆßJKˆ‹‹Š[KœÙ[Xİ[Û‹œ™Y™\œ™Y[Ù[ˆÈÈ™Y™\œ™Y[Ù[ˆ[KœÙ[Xİ[Û‹œ™Y™\œ™Y[Ù[BˆˆßJKˆ[İÙYY\\’YÎˆ[KœÙ[Xİ[Û‹˜[İÙYY\\’YËˆ[İÑ˜[˜XÚÎˆ˜[ÙKˆ™\]Z\™TÙYYˆ[KœÙ[Xİ[Û‹œ™\]Z\™TÙYYˆJKˆY]Y]NˆØš™Xİ™œ™Y^™JÂˆØÚ[XNˆÔÒUÔÔÑWÔÓÕÔ“Õ’QT—ÓQUQUWÔĞÒSPKˆ›ÙXİ[Û”[”ØÚ[XNˆ[‹œØÚ[XKˆ›ÙXİ[Û”[”ÚLMˆ[‹œ[”ÚLM‹ˆ[[YPÛÛ[Z]ˆ[‹œ[[YK˜ÛÛ[Z]ˆ[[YU™YNˆ[‹œ[[YK™YKˆ[[YTXÚØYÙU™\œÚ[Ûˆ[‹œ[[YKœXÚØYÙU™\œÚ[Û‹ˆÜÙP˜[šÔØÚ[XNˆ[‹œ[[YKœÜÙP˜[šÔØÚ[XKˆÜÙP˜[šÕ™\œÚ[Ûˆ[‹œ[[YKœÜÙP˜[šÕ™\œÚ[Û‹ˆ\İY[ÔÛİ\˜ÙPÛÛ[Z]ˆ[‹˜\İY[Ë˜ÛÛ[Z]ˆ\İY[ÔÛİ\˜ÙU™YNˆ[‹˜\İY[Ë™YKˆÚ\˜Xİ\’YˆÒTPÕT—ÒQˆÛİYˆ[KœÛİYˆ™\]Z\™Y›Üˆ[KœÛİœ™\]Z\™Y›Ü‹ˆ\™Ù]]ˆ[KœÛİ˜Ø[™Y]Sİ]]Ëœ™Ø˜SX\İ\”]ˆØ[™Y]Q]šY[˜ÙT]ˆ[KœÛİ˜Ø[™Y]Sİ]]Ë™]šY[˜ÙT]ˆØ[™Y]SX[šY™\İ]ˆ[KœÛİ˜Ø[™Y]Sİ]]Ë˜Ø[™Y]SX[šY™\İ]ˆ™]šY]ĞÛÛXİÚY]]ˆ[KœÛİ˜Ø[™Y]Sİ]]Ëœ™]šY]ĞÛÛXİÚY]]ˆY[]T™Y™\™[˜ÙTÙ]ÚLMˆ[‹šY[]T™Y™\™[˜ÙTÙ]ÚLM‹ˆ]]Üš^˜][Û‘]šY[˜ÙTÚLMˆ[K˜]]Üš^˜][Û‹™]šY[˜ÙTÚLM‹ˆ›ÙPØY[˜ÙR[™\[™[Ù•š\Ù[Y\ÎˆYKˆ™YÚ\İ\™Y[İ]^Y\“İÛœÕš\Ù[Y\ÎˆYKˆ[Q[˜ÛÙ[™ÎˆØš™Xİ™œ™Y^™JÂˆØÚ[XNˆ	Ù]˜]›Ëœ›Ú™XİX\X[KY[˜ÛÙ[™ËŒIËˆ\ÜÛØÚX][Ûˆ	Üİ˜ZYÚ	Ëˆ™[][\YYˆ˜[ÙKˆÛÛİ\”ÜXÙNˆ	ÜÜ™Ø‰Ëˆ˜[œÜ\™[™Ø”ÛXŞNˆ	Ø›İ[™Y]š\ÚX›K\™Ø‹X›YY	ËˆJKˆ\›İ˜[ÎˆØš™Xİ™œ™Y^™JÂˆÜ™X]]™Nˆ˜[ÙKˆ[˜]Û^Nˆ˜[ÙKˆY[]Nˆ˜[ÙKˆÛÛ[Z]Nˆ˜[ÙKˆ[Nˆ˜[ÙKˆ[[YNˆ˜[ÙKˆ™[X\ÙNˆ˜[ÙKˆX›XØ][Ûˆ˜[ÙKˆJKˆJKˆJNÂŸB‚™[˜İ[ÛˆÛÛ\[R›ØŠ[K[ŠHÂˆÛÛœİ™\]Z\™[Y[ÈH™\]Z\™Y™Y™\™[˜Ù\Ê[KœÛİ[ŠNÂˆÛÛœİYZ\ÜÚ[ÛœÈHYZ]š[™[™ÜÊ[K˜\Y˜Xİš[™[™ÜË™\]Z\™[Y[ÊNÂˆÛÛœİ›ØÚÙ\œÈH×NÂˆYˆ
[K˜]]Üš^˜][ÛˆOOH[
HÂˆ›ØÚÙ\œËœ\Ú
	Ú[X[‹\›İšY\‹X]]Üš^˜][Û‹\™\]Z\™Y	ÊNÂˆBˆYˆ
[KœÙ[Xİ[Û‹˜[İÙYY\\’YË›[™İOOH
HÂˆ›ØÚÙ\œËœ\Ú
	Ø[İÙY\›İšY\‹XY\\‹\™\]Z\™Y	ÊNÂˆBˆYˆ
[KœÙ[Xİ[Û‹œ™\]Z\™TÙYY	‰ˆ[KœÙ[Xİ[Û‹œÙYYOOH[
HÂˆ›ØÚÙ\œËœ\Ú
	Ù]\›Z[š\İXË\ÙYY\™\]Z\™Y	ÊNÂˆBˆ›Üˆ
ÛÛœİZ\ÜÚ[™ÈÙˆYZ\ÜÚ[ÛœË›Z\ÜÚ[™ÊHÂˆ›ØÚÙ\œËœ\Ú
™Y™\™[˜ÙKX\Y˜Xİ\™\]Z\™Y‰ÛZ\ÜÚ[™ßX
NÂˆBˆÛÛœİ›Û\HÛÛ\ÜÙY›Û\
[KœÛİ
NÂˆÛÛœİ›Û\ÚLMˆHÚLM]\ÊY™™\‹™œ›ÛJ›Û\	İ]	ÊJNÂˆÛÛœİ™XYHH›ØÚÙ\œË›[™İOOHÂˆÛÛœİ™\]Y\İ[œ]H™XYBˆÈ›İšY\”™\]Y\İ[œ]
[K[‹YZ\ÜÚ[ÛœË›Û\
Bˆˆ[ÂˆÛÛœİ›ÙHHØš™Xİ™œ™Y^™JÂˆØÚ[XNˆÔÒUÔÔÑWÔÓÕÔ“Õ’QT—Ò“Ğ—ÔĞÒSPKˆ›Ø’YˆÜZ]\ÜÙN‰Ù[KœÛİYXˆÚ\˜Xİ\’YˆÒTPÕT—ÒQˆÛİYˆ[KœÛİYˆ\œÜÙNˆ[KœÛİœ\œÜÙKˆ™\]Z\™Y›Üˆ[KœÛİœ™\]Z\™Y›Ü‹ˆİ]\Îˆ™XYHÈ	Ü™XYKY›Ü‹Y^XÚ]\›İšY\‹\İX›Z\ÜÚ[Û‰Èˆ	Ø›ØÚÙY	Ëˆ›ØÚÙ\œÎˆØš™Xİ™œ™Y^™J›ØÚÙ\œÊKˆÛİ\˜ÙSX\[™Îˆ[KœÛİœÛİ\˜ÙSX\[™ËˆØ[™Y]Sİ]]]ˆ[K˜Ø[™Y]Sİ]]]ˆØ[™Y]Q]šY[˜ÙT]ˆ[KœÛİ˜Ø[™Y]Sİ]]Ë™]šY[˜ÙT]ˆØ[™Y]SX[šY™\İ]ˆ[KœÛİ˜Ø[™Y]Sİ]]Ë˜Ø[™Y]SX[šY™\İ]ˆ™]šY]ĞÛÛXİÚY]]ˆ[KœÛİ˜Ø[™Y]Sİ]]Ëœ™]šY]ĞÛÛXİÚY]]ˆÜ™X]SÛ›NˆYKˆİ™\Üš]Q^\İ[™ĞØ[™Y]Nˆ˜[ÙKˆ™\]Z\™Y™Y™\™[˜Ù\Îˆ™\]Z\™[Y[ËˆYZ]Y™Y™\™[˜Ù\ÎˆYZ\ÜÚ[ÛœË˜YZ]Yˆ]]Üš^˜][Ûˆ[K˜]]Üš^˜][Û‹ˆÙ[Xİ[Ûˆ[KœÙ[Xİ[Û‹ˆ›İ\Îˆ[K››İ\ËˆÛÛ\ÜÙY›Û\ˆ›Û\ˆ›Û\ÚLM‹ˆ›İšY\”™\]Y\İ[œ]ˆ™\]Y\İ[œ]ˆ›İšY\”™\]Y\İÚLMˆ™\]Y\İ[œ]ÈÚLM‘Øİ[Y[
™\]Y\İ[œ]
Hˆ[ˆØ[™Y]PÛİ[ˆKˆ›İšY\‘^Xİ][Ûˆ˜[ÙKˆ[XYÙS]]][Ûˆ˜[ÙKˆØ[™Y]P\›İ˜[ˆ˜[ÙKˆØ[™Y]T›Û[İ[Ûˆ˜[ÙKˆÜÙTÛİš[[™Îˆ˜[ÙKˆ[[YPXİ]˜][Ûˆ˜[ÙKˆX›XØ][Ûˆ˜[ÙKˆJNÂˆ™]\›ˆØš™Xİ™œ™Y^™JÂˆ‹‹˜›ÙKˆ›Ø‘[™[ÜTÚLMˆÚLM‘Øİ[Y[
›ÙJKˆJNÂŸB‚™^Ü[˜İ[ÛˆÜ™X]T›Ú™Xİ\Ü]ÜÙTÛİ›İšY\”XÚØYÙT™\]Y\İ
ˆÜ[ÛœÈHßKŠHÂˆÛÛœİ[ˆHÜ[ÛœËœ[ˆÏÈİ\œ™[[Š
NÂˆÛÛœİÙ[Xİ[ÛTÛİH\Ô™XÛÜ™
Ü[ÛœËœÙ[Xİ[ÛTÛİ
BˆÈÜ[ÛœËœÙ[Xİ[ÛTÛİˆˆßNÂˆÛÛœİ]]Üš^˜][ÛTÛİH\Ô™XÛÜ™
Ü[ÛœË˜]]Üš^˜][ÛTÛİ
BˆÈÜ[ÛœË˜]]Üš^˜][ÛTÛİˆˆßNÂˆÛÛœİ\Y˜Xİš[™[™ÜĞTÛİH\Ô™XÛÜ™
Ü[ÛœË˜\Y˜Xİš[™[™ÜĞTÛİ
BˆÈÜ[ÛœË˜\Y˜Xİš[™[™ÜĞTÛİˆˆßNÂˆÛÛœİ›İ\ĞTÛİH\Ô™XÛÜ™
Ü[ÛœË››İ\ĞTÛİ
HÈÜ[ÛœË››İ\ĞTÛİˆßNÂˆ™]\›ˆœ™Y^™PÛÛ™JÂˆØÚ[XNˆÔÒUÔÔÑWÔÓÕÔ“Õ’QT—ÔPÒĞQÑWÔ‘TUQTÕÔĞÒSPKˆ™\]Y\İY‚ˆÜ[ÛœËœ™\]Y\İYÏÈ	İÜZ]\ÜÙK\Ûİ\›İšY\‹\XÚØYÙK]ŒIËˆ[‹ˆ›ØœÎˆ[‹œ›ÙXİ[Û”ÛİË›X\

Ûİ
HOˆ
ÂˆÛİYˆÛİœÛİYˆØ[™Y]Sİ]]]ˆÛİ˜Ø[™Y]Sİ]]Ëœ™Ø˜SX\İ\”]ˆÙ[Xİ[Û‚ˆÙ[Xİ[ÛTÛİÜÛİœÛİYHÏÂˆÂˆ™Y™\œ™YY\\’Yˆ[ˆ™Y™\œ™Y[Ù[ˆ[ˆ[İÙYY\\’YÎˆ×Kˆ[İÑ˜[˜XÚÎˆ˜[ÙKˆ™\]Z\™TÙYYˆYKˆÙYYˆ[ˆKˆ]]Üš^˜][Ûˆ]]Üš^˜][ÛTÛİÜÛİœÛİYHÏÈ[ˆ\Y˜Xİš[™[™ÜÎˆ\Y˜Xİš[™[™ÜĞTÛİÜÛİœÛİYHÏÈ×Kˆ›İ\Îˆ›İ\ĞTÛİÜÛİœÛİYHÏÈ	ÉËˆJJKˆ]]Üš]NˆÜ™X]T›Ú™Xİ\Ü]ÜÙTÛİ›İšY\]]Üš]J
KˆJNÂŸB‚™^Ü[˜İ[ÛˆÛÛ\[T›Ú™Xİ\Ü]ÜÙTÛİ›İšY\”XÚØYÙJ˜[YJHÂˆÛÛœİ™\]Y\İH\œÙT™\]Y\İ
˜[YJNÂˆÛÛœİ™\]Y\İÚLMˆHÚLM‘Øİ[Y[
™\]Y\İ
NÂˆÛÛœİ›ØœÈHØš™Xİ™œ™Y^™Jˆ™\]Y\İš›ØœË›X\

[JHOˆÛÛ\[R›ØŠ[K™\]Y\İœ[ŠJKˆ
NÂˆÛÛœİ™XYR›ØœÈH›ØœË™š[\Šˆ
›ØŠHOˆ›Ø‹œİ]\ÈOOH	Ü™XYKY›Ü‹Y^XÚ]\›İšY\‹\İX›Z\ÜÚ[Û‰Ëˆ
NÂˆÛÛœİ›ØÚÙY›ØœÈH›ØœË™š[\Š
›ØŠHOˆ›Ø‹œİ]\ÈOOH	Ø›ØÚÙY	ÊNÂˆÛÛœİ›ÙHHØš™Xİ™œ™Y^™JÂˆØÚ[XNˆÔÒUÔÔÑWÔÓÕÔ“Õ’QT—ÔPÒĞQÑWÔĞÒSPKˆ™\]Y\İØÚ[XNˆÔÒUÔÔÑWÔÓÕÔ“Õ’QT—ÔPÒĞQÑWÔ‘TUQTÕÔĞÒSPKˆ™\]Y\İYˆ™\]Y\İœ™\]Y\İYˆ™\]Y\İÚLM‹ˆ›ÙXİ[Û”[”ØÚ[XNˆ™\]Y\İœ[‹œØÚ[XKˆ›ÙXİ[Û”[”ÚLMˆ™\]Y\İœ[‹œ[”ÚLM‹ˆÚ\˜Xİ\’YˆÒTPÕT—ÒQˆ[[YNˆ™\]Y\İœ[‹œ[[YKˆ\İY[Îˆ™\]Y\İœ[‹˜\İY[ËˆY[]T™Y™\™[˜ÙTÙ]ÚLMˆ™\]Y\İœ[‹šY[]T™Y™\™[˜ÙTÙ]ÚLM‹ˆİ]\Î‚ˆ›ØÚÙY›ØœË›[™İOOHˆÈ	Ü™XYKY›Ü‹Y^XÚ]\›İšY\‹\İX›Z\ÜÚ[Û‰Âˆˆ	Ø›ØÚÙY	Ëˆ›ØœËˆÛİ[ÎˆØš™Xİ™œ™Y^™JÂˆ›ØœÎˆ›ØœË›[™İˆ™XYR›ØœÎˆ™XYR›ØœË›[™İˆ›ØÚÙY›ØœÎˆ›ØÚÙY›ØœË›[™İˆX^[][T›İšY\Ø[Îˆ›ØœË›[™İˆØ[™Y]\Ô\’›ØˆKˆX^[][PØ[™Y]\Îˆ›ØœË›[™İˆ™\]Z\™YÜÙTÛİÎˆ™\]Y\İœ[‹˜Ûİ[Ëœ™\]Z\™YÜÙTÛİËˆXİ]˜][Û‘[YÚX›TÜÙTÛİÎ‚ˆ™\]Y\İœ[‹˜Ûİ[Ë˜Xİ]˜][Û‘[YÚX›TÜÙTÛİËˆJKˆİ\œ™[[[YTØY™Nˆ™\]Y\İœ[‹˜İ\œ™[[[YTØY™Kˆ^[™Y\™›Ü›X[˜ÙT™XYNˆ˜[ÙKˆ\Ù[™\˜][Û”™\]Z\™YˆYKˆ^XÚ][X[]]Üš^˜][Û”™\]Z\™YˆYKˆ^XÚ]›İšY\”İX›Z\ÜÚ[Û”™\]Z\™YˆYKˆ›İšY\‘^Xİ][Û”\™›Ü›YYˆ˜[ÙKˆØ[™Y]P]\ÓX]\šX[^™Yˆ˜[ÙKˆØ[™Y]P\›İ˜[\™›Ü›YYˆ˜[ÙKˆÜÙTÛİÑš[Yˆ˜[ÙKˆ[[YPXİ]˜][Û”\™›Ü›YYˆ˜[ÙKˆX›XØ][Û”\™›Ü›YYˆ˜[ÙKˆ]]Üš]Nˆ™\]Y\İ˜]]Üš]KˆJNÂˆ™]\›ˆØš™Xİ™œ™Y^™JÂˆ‹‹˜›ÙKˆXÚØYÙTÚLMˆÚLM‘Øİ[Y[
›ÙJKˆJNÂŸB‚™^Ü[˜İ[Ûˆ›Ú™Xİ\Ü]ÜÙTÛİ›İšY\”XÚØYÙPØ\Xš[]Y\Ê
HÂˆ™]\›ˆØš™Xİ™œ™Y^™JÂˆØÚ[XNˆÔÒUÔÔÑWÔÓÕÔ“Õ’QT—ĞĞTP’SUQT×ÔĞÒSPKˆ™\]Y\İØÚ[XNˆÔÒUÔÔÑWÔÓÕÔ“Õ’QT—ÔPÒĞQÑWÔ‘TUQTÕÔĞÒSPKˆXÚØYÙTØÚ[XNˆÔÒUÔÔÑWÔÓÕÔ“Õ’QT—ÔPÒĞQÑWÔĞÒSPKˆ›Ø”ØÚ[XNˆÔÒUÔÔÑWÔÓÕÔ“Õ’QT—Ò“Ğ—ÔĞÒSPKˆ›İšY\“Y]Y]TØÚ[XNˆÔÒUÔÔÑWÔÓÕÔ“Õ’QT—ÓQUQUWÔĞÒSPKˆ›ÙXİ[Û”[”ØÚ[XNˆÔÒUÔÔÑWÔÓÕÔ“ÑPÕSÓ—ÔS—ÔĞÒSPKˆÚ\˜Xİ\’YˆÒTPÕT—ÒQˆ™\]Z\™YÜÙTÛİÎˆ‹ˆX^[][T›İšY\Ø[Îˆ‹ˆØ[™Y]\Ô\’›ØˆKˆ^XÚ][X[]]Üš^˜][Û”™\]Z\™YˆYKˆ]]Üš^˜][Û•Ú[™İÒİ\œÓX^[][Nˆˆ^Xİ™Y™\™[˜ÙPYZ\ÜÚ[Û”™\]Z\™YˆYKˆ]\›Z[š\İXÔÙYYİ\ÜYˆYKˆ›İšY\‘˜[˜XÚĞ[İÙYˆ˜[ÙKˆ˜]]™Tİ˜ZYÚ[T™\]Z\™YˆYKˆ[P\ÜÛØÚX][Û‘XÛ\™YˆYKˆ˜ZÙU˜[œÜ\™[˜ŞQÜšY[İÙYˆ˜[ÙKˆÜ\]YSX]P[İÙYˆ˜[ÙKˆÚ›ÛXTÜ[[İÙYˆ˜[ÙKˆ™YÚ\İ\™Y[İ]^Y\“İÛœÕš\Ù[Y\ÎˆYKˆ›ÙPØY[˜ÙR[™\[™[Ù•š\Ù[Y\ÎˆYKˆŞ[]XĞ›ÙR[˜™]ÙY[š[™Ğ[İÙYˆ˜[ÙKˆÜ™X]SÛ›PØ[™Y]T]ÎˆYKˆ›İšY\‘^Xİ][Ûˆ˜[ÙKˆ[XYÙS]]][Ûˆ˜[ÙKˆØ[™Y]P\›İ˜[ˆ˜[ÙKˆØ[™Y]T›Û[İ[Ûˆ˜[ÙKˆÜÙTÛİš[[™Îˆ˜[ÙKˆÙ\]Y[˜ÙT™[X\ÙNˆ˜[ÙKˆ™\ÜÚ]ÜS]]][Ûˆ˜[ÙKˆÚ]ÛÛ[Z]ˆ˜[ÙKˆÚ]\Úˆ˜[ÙKˆ\Ş[Y[ˆ˜[ÙKˆX›XØ][Ûˆ˜[ÙKˆ[[YPXİ]˜][Ûˆ˜[ÙKˆ›Ü˜ÙT\Úˆ˜[ÙKˆJNÂŸB