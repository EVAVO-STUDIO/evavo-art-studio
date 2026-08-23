#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE_PATH = path.join(ROOT, 'config', 'creative-media-fabric-v1.json');
const MAX_HANDOFF_BYTES = 4 * 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/;
const REQUIRED_FORBIDDEN = new Set([
  'generic-cinematic-haze-without-scene-cause',
  'unmotivated-rim-light',
  'automatic-camera-drift',
  'default-cyan-magenta-neon-palette',
  'uniform-detail-density',
  'one-pass-style-filter-substitution',
  'ai-text-or-glyph-artifacts',
  'independent-frame-regeneration-for-continuity-work',
  'unreferenced-provider-intent-rewrite',
  'perfect-symmetry-without-design-reason',
]);
const STUDIO_IDS = new Set([
  'particle-studio',
  'evavo-video-studio',
  'evavo-3d-studio',
  'evavo-art-studio',
  'atmosphere-studio',
]);

function fail(code, detail = '') {
  const suffix = detail ? `: ${detail}` : '';
  throw new Error(`${code}${suffix}`);
}

function readStableFile(file, maxBytes) {
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) fail('EVAVO_FABRIC_UNSAFE_FILE', file);
  if (before.size < 1 || before.size > maxBytes) fail('EVAVO_FABRIC_FILE_SIZE', `${file} (${before.size})`);
  const bytes = fs.readFileSync(file);
  const after = fs.lstatSync(file);
  if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) {
    fail('EVAVO_FABRIC_FILE_CHANGED_DURING_READ', file);
  }
  return bytes;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function loadJson(file, maxBytes = MAX_HANDOFF_BYTES) {
  const bytes = readStableFile(file, maxBytes);
  try {
    return { document: JSON.parse(bytes.toString('utf8')), bytes };
  } catch {
    fail('EVAVO_FABRIC_INVALID_JSON', file);
  }
}

function assert(condition, code, detail = '') {
  if (!condition) fail(code, detail);
}

function uniqueStrings(value, min, code) {
  assert(Array.isArray(value) && value.length >= min, code);
  assert(value.every((item) => typeof item === 'string' && item.trim().length >= 4), code);
  assert(new Set(value).size === value.length, code);
}

function validateProfile(profile, schemaBytes) {
  assert(profile?.schema === 'evavo_creative_media_fabric_profile_v1', 'EVAVO_FABRIC_PROFILE_SCHEMA');
  assert(STUDIO_IDS.has(profile.studioId), 'EVAVO_FABRIC_PROFILE_STUDIO');
  assert(profile.contract?.path === 'contracts/creative-media-handoff-v1.schema.json', 'EVAVO_FABRIC_PROFILE_CONTRACT_PATH');
  assert(SHA256.test(profile.contract?.sha256 ?? ''), 'EVAVO_FABRIC_PROFILE_CONTRACT_DIGEST');
  assert(sha256(schemaBytes) === profile.contract.sha256, 'EVAVO_FABRIC_CONTRACT_DRIFT');
  assert(profile.interchange?.receiverRevalidationRequired === true, 'EVAVO_FABRIC_REVALIDATION_REQUIRED');
  assert(profile.interchange?.nativeQualityRemainsAuthoritative === true, 'EVAVO_FABRIC_NATIVE_QUALITY_AUTHORITY');
  assert(profile.authority?.providerMayRewriteIntent === false, 'EVAVO_FABRIC_PROVIDER_REWRITE_DISABLED');
  assert(profile.authority?.autoApprove === false, 'EVAVO_FABRIC_AUTO_APPROVAL_DISABLED');
  assert(profile.authority?.publicationRequiresHuman === true, 'EVAVO_FABRIC_HUMAN_PUBLICATION_REQUIRED');
  assert(Array.isArray(profile.authority?.owns) && profile.authority.owns.length >= 3, 'EVAVO_FABRIC_DOMAIN_OWNERSHIP');
  assert(Array.isArray(profile.authority?.doesNotOwn) && profile.authority.doesNotOwn.length >= 3, 'EVAVO_FABRIC_DOMAIN_BOUNDARY');
  assert(profile.creativeRules?.genericAiPenaltyMax <= 0.15, 'EVAVO_FABRIC_GENERIC_AI_FLOOR');
  assert(profile.creativeRules?.maxRepairAttempts === 3, 'EVAVO_FABRIC_REPAIR_BOUND');
  assert(profile.creativeRules?.smallestScopeRepairOnly === true, 'EVAVO_FABRIC_SMALLEST_SCOPE_REPAIR');
  uniqueStrings(profile.creativeRules?.domainSignature, 4, 'EVAVO_FABRIC_DOMAIN_SIGNATURE');
  uniqueStrings(profile.creativeRules?.forbiddenShortcuts, 10, 'EVAVO_FABRIC_FORBIDDEN_SHORTCUTS');
  for (const rule of REQUIRED_FORBIDDEN) {
    assert(profile.creativeRules.forbiddenShortcuts.includes(rule), 'EVAVO_FABRIC_REQUIRED_SHORTCUT_MISSING', rule);
  }
  const accepted = new Set(profile.interchange?.acceptsFrom ?? []);
  const emitted = new Set(profile.interchange?.emitsTo ?? []);
  assert([...accepted].every((id) => STUDIO_IDS.has(id) && id !== profile.studioId), 'EVAVO_FABRIC_ACCEPTS_INVALID');
  assert([...emitted].every((id) => STUDIO_IDS.has(id) && id !== profile.studioId), 'EVAVO_FABRIC_EMITS_INVALID');
  assert(profile.automation?.networkRequired === false, 'EVAVO_FABRIC_NETWORKLESS_CHECK_REQUIRED');
  assert(profile.automation?.sourceMutation === false, 'EVAVO_FABRIC_SOURCE_MUTATION_DISABLED');
  assert(profile.automation?.gitMutation === false, 'EVAVO_FABRIC_GIT_MUTATION_DISABLED');
  return profile;
}

function sourceSetDigest(sourceAssets) {
  const canonical = [...sourceAssets]
    .sort((a, b) => a.id.localeCompare(b.id, 'en'))
    .map((asset) => `${asset.id}\0${asset.sha256}\0${asset.uri}\n`)
    .join('');
  return sha256(Buffer.from(canonical, 'utf8'));
}

function validateDigestRef(value, code) {
  assert(value && typeof value.uri === 'string' && value.uri.length >= 3, code);
  assert(SHA256.test(value.sha256 ?? ''), code);
}

function validateHandoff(handoff, profile) {
  assert(handoff?.schema === 'evavo_creative_media_handoff_v1', 'EVAVO_FABRIC_HANDOFF_SCHEMA');
  assert(typeof handoff.handoffId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(handoff.handoffId), 'EVAVO_FABRIC_HANDOFF_ID');
  assert(STUDIO_IDS.has(handoff.producer?.studio), 'EVAVO_FABRIC_PRODUCER_STUDIO');
  assert(STUDIO_IDS.has(handoff.receiver?.studio), 'EVAVO_FABRIC_RECEIVER_STUDIO');
  assert(handoff.producer.studio !== handoff.receiver.studio, 'EVAVO_FABRIC_SELF_HANDOFF');
  assert(handoff.receiver?.revalidate === true, 'EVAVO_FABRIC_RECEIVER_REVALIDATE');
  assert(typeof handoff.receiver?.purpose === 'string' && handoff.receiver.purpose.trim().length >= 8, 'EVAVO_FABRIC_RECEIVER_PURPOSE');
  validateDigestRef(handoff.producer?.nativeReceipt, 'EVAVO_FABRIC_PRODUCER_RECEIPT');
  validateDigestRef(handoff.quality?.nativeReceipt, 'EVAVO_FABRIC_QUALITY_RECEIPT');

  const localIsProducer = handoff.producer.studio === profile.studioId;
  const localIsReceiver = handoff.receiver.studio === profile.studioId;
  assert(localIsProducer || localIsReceiver, 'EVAVO_FABRIC_LOCAL_STUDIO_NOT_PARTY');
  if (localIsProducer) assert(profile.interchange.emitsTo.includes(handoff.receiver.studio), 'EVAVO_FABRIC_RECEIVER_NOT_ALLOWED');
  if (localIsReceiver) assert(profile.interchange.acceptsFrom.includes(handoff.producer.studio), 'EVAVO_FABRIC_PRODUCER_NOT_ALLOWED');

  const assets = handoff.sourceAssets;
  assert(Array.isArray(assets) && assets.length >= 1 && assets.length <= 256, 'EVAVO_FABRIC_SOURCE_ASSETS');
  const assetIds = new Set();
  for (const asset of assets) {
    assert(typeof asset?.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(asset.id), 'EVAVO_FABRIC_SOURCE_ID');
    assert(!assetIds.has(asset.id), 'EVAVO_FABRIC_SOURCE_ID_DUPLICATE', asset.id);
    assetIds.add(asset.id);
    assert(typeof asset.role === 'string' && asset.role.trim().length >= 2, 'EVAVO_FABRIC_SOURCE_ROLE');
    assert(typeof asset.uri === 'string' && asset.uri.length >= 3, 'EVAVO_FABRIC_SOURCE_URI');
    assert(SHA256.test(asset.sha256 ?? ''), 'EVAVO_FABRIC_SOURCE_DIGEST');
    assert(typeof asset.mediaType === 'string' && asset.mediaType.length >= 3, 'EVAVO_FABRIC_SOURCE_MEDIA_TYPE');
  }

  const signature = handoff.creativeSignature;
  assert(typeof signature?.thesis === 'string' && signature.thesis.trim().length >= 24, 'EVAVO_FABRIC_CREATIVE_THESIS');
  uniqueStrings(signature.specificityAnchors, profile.creativeRules.specificityAnchorsMin, 'EVAVO_FABRIC_SPECIFICITY_ANCHORS');
  uniqueStrings(signature.continuityAnchors, profile.creativeRules.continuityAnchorsMin, 'EVAVO_FABRIC_CONTINUITY_ANCHORS');
  uniqueStrings(signature.materialLogic, profile.creativeRules.materialLogicMin, 'EVAVO_FABRIC_MATERIAL_LOGIC');
  uniqueStrings(signature.motionLogic, profile.creativeRules.motionLogicMin, 'EVAVO_FABRIC_MOTION_LOGIC');
  uniqueStrings(signature.authoredImperfections, profile.creativeRules.authoredImperfectionsMin, 'EVAVO_FABRIC_AUTHORED_IMPERFECTIONS');
  uniqueStrings(signature.forbiddenShortcuts, 6, 'EVAVO_FABRIC_HANDOFF_FORBIDDEN_SHORTCUTS');
  for (const rule of REQUIRED_FORBIDDEN) {
    assert(signature.forbiddenShortcuts.includes(rule), 'EVAVO_FABRIC_HANDOFF_REQUIRED_SHORTCUT_MISSING', rule);
  }

  assert(handoff.references?.mode === 'principles-only', 'EVAVO_FABRIC_REFERENCE_MODE');
  assert(handoff.references?.mayCloneComposition === false, 'EVAVO_FABRIC_REFERENCE_COMPOSITION_CLONE');
  assert(handoff.references?.mayCloneIdentity === false, 'EVAVO_FABRIC_REFERENCE_IDENTITY_CLONE');

  const timeline = handoff.intent?.timeline;
  assert(Number.isInteger(timeline?.fpsNumerator) && timeline.fpsNumerator > 0, 'EVAVO_FABRIC_TIMELINE_FPS_NUMERATOR');
  assert(Number.isInteger(timeline?.fpsDenominator) && timeline.fpsDenominator > 0, 'EVAVO_FABRIC_TIMELINE_FPS_DENOMINATOR');
  assert(Number.isInteger(timeline?.durationFrames) && timeline.durationFrames > 0, 'EVAVO_FABRIC_TIMELINE_DURATION');
  assert(['none', 'seamless', 'finite-repeat'].includes(timeline?.loop), 'EVAVO_FABRIC_TIMELINE_LOOP');
  assert(typeof handoff.intent?.colour?.workingSpace === 'string' && handoff.intent.colour.workingSpace.length >= 2, 'EVAVO_FABRIC_COLOUR_WORKING_SPACE');
  assert(typeof handoff.intent?.colour?.displayIntent === 'string' && handoff.intent.colour.displayIntent.length >= 2, 'EVAVO_FABRIC_COLOUR_DISPLAY_INTENT');

  const shared = handoff.quality?.shared;
  for (const key of ['specificity', 'temporalCoherence', 'continuity', 'signatureDistinctiveness']) {
    assert(typeof shared?.[key] === 'number' && Number.isFinite(shared[key]) && shared[key] >= 0 && shared[key] <= 1, `EVAVO_FABRIC_SHARED_${key.toUpperCase()}`);
  }
  assert(typeof shared?.genericAiPenalty === 'number' && shared.genericAiPenalty >= 0 && shared.genericAiPenalty <= profile.creativeRules.genericAiPenaltyMax, 'EVAVO_FABRIC_GENERIC_AI_PENALTY');

  const repair = handoff.quality?.repair;
  assert(Number.isInteger(repair?.attempt) && repair.attempt >= 0 && repair.attempt <= 3, 'EVAVO_FABRIC_REPAIR_ATTEMPT');
  assert(repair?.maxAttempts === 3, 'EVAVO_FABRIC_REPAIR_MAX');
  assert(repair?.smallestScopeOnly === true, 'EVAVO_FABRIC_REPAIR_SCOPE');
  assert(repair?.onExhaustion === 'human-review', 'EVAVO_FABRIC_REPAIR_EXHAUSTION');

  const authority = handoff.authority;
  assert(authority?.providerMayRewriteIntent === false, 'EVAVO_FABRIC_PROVIDER_INTENT_AUTHORITY');
  assert(authority?.autoApprove === false, 'EVAVO_FABRIC_AUTO_APPROVAL_AUTHORITY');
  assert(authority?.receiverMustRevalidate === true, 'EVAVO_FABRIC_RECEIVER_REVALIDATION_AUTHORITY');
  assert(authority?.publicationRequiresHuman === true, 'EVAVO_FABRIC_PUBLICATION_AUTHORITY');

  const provenance = handoff.provenance;
  assert(provenance?.sourceSetDigestAlgorithm === 'sha256-lines-v1', 'EVAVO_FABRIC_SOURCE_SET_ALGORITHM');
  assert(provenance?.handoffSha256Algorithm === 'sha256-bytes', 'EVAVO_FABRIC_HANDOFF_DIGEST_ALGORITHM');
  assert(provenance?.contentCredentials?.standard === 'C2PA 2.4', 'EVAVO_FABRIC_C2PA_VERSION');
  assert(['optional-final-export', 'required-final-export', 'not-applicable'].includes(provenance?.contentCredentials?.mode), 'EVAVO_FABRIC_C2PA_MODE');
  assert(SHA256.test(provenance?.sourceSetSha256 ?? ''), 'EVAVO_FABRIC_SOURCE_SET_DIGEST');
  assert(sourceSetDigest(assets) === provenance.sourceSetSha256, 'EVAVO_FABRIC_SOURCE_SET_MISMATCH');

  return {
    schema: 'evavo_creative_media_fabric_validation_v1',
    valid: true,
    localStudio: profile.studioId,
    handoffId: handoff.handoffId,
    direction: localIsProducer ? 'outbound' : 'inbound',
    producer: handoff.producer.studio,
    receiver: handoff.receiver.studio,
    sourceAssetCount: assets.length,
    sourceSetSha256: provenance.sourceSetSha256,
    authority: {
      providerMayRewriteIntent: false,
      autoApprove: false,
      publicationRequiresHuman: true,
    },
  };
}

function parseArgs(argv) {
  const result = { selfTest: false, handoff: null, sha256: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--self-test') result.selfTest = true;
    else if (arg === '--handoff') result.handoff = argv[++i];
    else if (arg === '--sha256') result.sha256 = argv[++i];
    else fail('EVAVO_FABRIC_UNKNOWN_ARGUMENT', arg);
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const { document: profile } = loadJson(PROFILE_PATH, 256 * 1024);
const schemaPath = path.join(ROOT, ...profile.contract.path.split('/'));
const { bytes: schemaBytes } = loadJson(schemaPath, 512 * 1024);
validateProfile(profile, schemaBytes);

if (args.selfTest) {
  const counterpart = profile.interchange.emitsTo[0];
  const sourceAssets = [{
    id: 'self-test-source',
    role: 'contract-fixture',
    uri: 'bee://sha256/' + 'a'.repeat(64),
    sha256: 'a'.repeat(64),
    mediaType: 'application/octet-stream',
  }];
  const fixture = {
    schema: 'evavo_creative_media_handoff_v1',
    handoffId: `${profile.studioId}:self-test`,
    producer: {
      studio: profile.studioId,
      nativeContract: 'evavo_self_test_native_v1',
      nativeReceipt: { uri: 'bee://sha256/' + 'b'.repeat(64), sha256: 'b'.repeat(64) },
    },
    receiver: { studio: counterpart, purpose: 'Validate the shared creative-media contract.', revalidate: true },
    sourceAssets,
    creativeSignature: {
      thesis: 'A deterministic authored fixture proving cross-studio creative intent survives handoff.',
      specificityAnchors: ['specific place anchor', 'specific material anchor', 'specific narrative anchor'],
      continuityAnchors: ['locked identity anchor', 'locked spatial anchor', 'locked colour anchor'],
      materialLogic: ['surface response follows substrate', 'wear follows use and exposure'],
      motionLogic: ['motion follows an observable cause', 'stillness remains available as an authored choice'],
      authoredImperfections: ['controlled asymmetry remains visible', 'surface variation follows use rather than noise'],
      forbiddenShortcuts: profile.creativeRules.forbiddenShortcuts,
    },
    references: { mode: 'principles-only', mayCloneComposition: false, mayCloneIdentity: false },
    intent: {
      colour: { workingSpace: 'scene-linear', displayIntent: 'review-display', acesVersion: 'not-used' },
      timeline: { fpsNumerator: 24, fpsDenominator: 1, durationFrames: 48, loop: 'none', otioVersion: 'not-used' },
    },
    quality: {
      nativeReceipt: { uri: 'bee://sha256/' + 'c'.repeat(64), sha256: 'c'.repeat(64) },
      shared: { specificity: 1, temporalCoherence: 1, continuity: 1, signatureDistinctiveness: 1, genericAiPenalty: 0 },
      repair: { attempt: 0, maxAttempts: 3, smallestScopeOnly: true, onExhaustion: 'human-review' },
    },
    authority: {
      providerMayRewriteIntent: false,
      autoApprove: false,
      receiverMustRevalidate: true,
      publicationRequiresHuman: true,
    },
    provenance: {
      sourceSetSha256: sourceSetDigest(sourceAssets),
      sourceSetDigestAlgorithm: 'sha256-lines-v1',
      handoffSha256Algorithm: 'sha256-bytes',
      contentCredentials: { standard: 'C2PA 2.4', mode: 'optional-final-export' },
    },
  };
  const validation = validateHandoff(fixture, profile);
  console.log(JSON.stringify({
    schema: 'evavo_creative_media_fabric_self_test_v1',
    valid: validation.valid,
    studioId: profile.studioId,
    contractSha256: profile.contract.sha256,
    forbiddenShortcutCount: profile.creativeRules.forbiddenShortcuts.length,
    domainSignatureRuleCount: profile.creativeRules.domainSignature.length,
    networkRequired: false,
    sourceMutation: false,
    gitMutation: false,
  }));
  process.exit(0);
}

assert(typeof args.handoff === 'string' && args.handoff.length > 0, 'EVAVO_FABRIC_HANDOFF_ARGUMENT_REQUIRED');
assert(SHA256.test(args.sha256 ?? ''), 'EVAVO_FABRIC_HANDOFF_SHA256_REQUIRED');
const handoffPath = path.resolve(args.handoff);
const { document: handoff, bytes: handoffBytes } = loadJson(handoffPath);
assert(sha256(handoffBytes) === args.sha256, 'EVAVO_FABRIC_HANDOFF_SHA256_MISMATCH');
console.log(JSON.stringify(validateHandoff(handoff, profile)));
