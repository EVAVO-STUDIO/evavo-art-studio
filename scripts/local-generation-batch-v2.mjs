#!/usr/bin/env node
import { createHash } from 'node:crypto';

export const LOCAL_GENERATION_BATCH_SCHEMA = 'evavo.local-generation-batch.v2';
export const MAX_BATCH_SIZE = 2000;
export const LEGACY_CHUNK_SIZE = 100;

const MODES = new Set(['independent', 'sequential-anchor', 'paired', 'repair', 'variation', 'sprite']);
const CONSISTENCY = new Set(['strict', 'balanced', 'loose']);
const CONTENT = new Set(['general', 'mature-nonexplicit']);
const FORMATS = new Set(['png', 'jpeg', 'webp']);
const TRANSPARENCY = new Set(['opaque', 'preferred', 'required']);

export const QUALITY_PROFILES = Object.freeze({
  portrait_high_quality: Object.freeze({
    width: 1024, height: 1024, steps: 36, cfg: 6.0, sampler: 'dpmpp_2m', scheduler: 'karras',
    denoise: 1, hiresScale: 1, faceDetailPass: true, outputFormat: 'png',
    prompt: ['high-end character portrait', 'specific facial structure', 'natural skin texture', 'intentional lighting', 'clean anatomy'],
    negative: ['generic stock portrait', 'waxy skin', 'beauty-filter face', 'plastic texture', 'repetitive AI facial features'],
  }),
  sprite_sheet_clean: Object.freeze({
    width: 1024, height: 1024, steps: 30, cfg: 5.5, sampler: 'dpmpp_2m', scheduler: 'karras',
    denoise: 1, hiresScale: 1, faceDetailPass: false, outputFormat: 'png',
    prompt: ['game-ready sprite source', 'clean silhouette', 'repeatable proportions', 'stable framing', 'readable pose'],
    negative: ['cropped limbs', 'camera drift', 'pose ambiguity', 'inconsistent proportions', 'busy background'],
  }),
  concept_art_painterly: Object.freeze({
    width: 1344, height: 768, steps: 34, cfg: 5.8, sampler: 'dpmpp_2m', scheduler: 'karras',
    denoise: 1, hiresScale: 1, faceDetailPass: false, outputFormat: 'png',
    prompt: ['specific production concept art', 'intentional shape language', 'material separation', 'designed lighting', 'controlled painterly detail'],
    negative: ['generic fantasy concept art', 'random clutter', 'muddy values', 'AI texture soup', 'meaningless micro-detail'],
  }),
  comic_inked: Object.freeze({
    width: 1024, height: 1024, steps: 32, cfg: 6.0, sampler: 'dpmpp_2m', scheduler: 'karras',
    denoise: 1, hiresScale: 1, faceDetailPass: false, outputFormat: 'png',
    prompt: ['purposeful ink hierarchy', 'clean silhouettes', 'controlled line weight', 'specific panel composition', 'readable expression'],
    negative: ['random hatch noise', 'melted linework', 'generic manga face', 'illegible anatomy', 'visual clutter'],
  }),
  cinematic_stills: Object.freeze({
    width: 1344, height: 768, steps: 36, cfg: 5.5, sampler: 'dpmpp_2m', scheduler: 'karras',
    denoise: 1, hiresScale: 1, faceDetailPass: true, outputFormat: 'png',
    prompt: ['cinematic production still', 'motivated practical lighting', 'specific lens language', 'physical set detail', 'naturalistic texture'],
    negative: ['generic cinematic AI image', 'teal-orange preset', 'floating props', 'overprocessed HDR', 'plastic surfaces'],
  }),
  product_mockups: Object.freeze({
    width: 1024, height: 1024, steps: 32, cfg: 5.5, sampler: 'dpmpp_2m', scheduler: 'karras',
    denoise: 1, hiresScale: 1, faceDetailPass: false, outputFormat: 'png',
    prompt: ['production-ready product visualization', 'accurate object geometry', 'material realism', 'controlled studio lighting', 'clean presentation'],
    negative: ['warped branding', 'impossible geometry', 'random text', 'generic ecommerce render', 'floating object parts'],
  }),
});

const CONSISTENCY_PROFILES = Object.freeze({
  strict: Object.freeze({
    seedStride: 1,
    continuityPhase: 'key-pose',
    prompt: ['same identity and proportions as the campaign anchor', 'preserve locked design details exactly', 'only vary attributes explicitly changed by this shot'],
  }),
  balanced: Object.freeze({
    seedStride: 17,
    continuityPhase: 'key-pose',
    prompt: ['preserve recognizable identity and principal design language', 'allow natural pose and camera variation without redesigning the subject'],
  }),
  loose: Object.freeze({
    seedStride: 97,
    continuityPhase: 'independent',
    prompt: ['preserve the campaign concept while allowing exploratory variation'],
  }),
});

function fail(message) { throw new Error(message); }
function obj(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}
function str(value, label, max = 12000) {
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value || value.length > max || value.includes('\0')) fail(`${label} is invalid`);
  return value;
}
function optionalStr(value, label, max = 12000) { return value == null ? null : str(value, label, max); }
function id(value, label) {
  const result = str(value, label, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(result)) fail(`${label} must be a safe identifier`);
  return result;
}
function integer(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${label} must be an integer between ${min} and ${max}`);
  return value;
}
function number(value, label, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${label} must be between ${min} and ${max}`);
  return value;
}
function strings(value, label, max = 128) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > max) fail(`${label} must be an array with at most ${max} items`);
  return value.map((entry, index) => str(entry, `${label}[${index}]`, 2048));
}
function unique(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function sha256Text(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 80) || 'shot'; }

function normalizeQuality(name, overrides = {}) {
  const base = QUALITY_PROFILES[name];
  if (!base) fail(`unknown quality_profile ${name}`);
  const width = integer(overrides.width ?? base.width, 'quality.width', 64, 4096);
  const height = integer(overrides.height ?? base.height, 'quality.height', 64, 4096);
  const steps = integer(overrides.steps ?? base.steps, 'quality.steps', 1, 150);
  const cfg = number(overrides.cfg ?? base.cfg, 'quality.cfg', 0, 30);
  const denoise = number(overrides.denoise ?? base.denoise, 'quality.denoise', 0, 1);
  const hiresScale = number(overrides.hiresScale ?? base.hiresScale, 'quality.hiresScale', 1, 4);
  const outputFormat = overrides.outputFormat ?? base.outputFormat;
  if (!FORMATS.has(outputFormat)) fail('quality.outputFormat is unsupported');
  return Object.freeze({ ...base, ...overrides, width, height, steps, cfg, denoise, hiresScale, outputFormat });
}

function identityBlock(character) {
  const parts = [character.description];
  if (character.face) parts.push(`face: ${character.face}`);
  if (character.hair) parts.push(`hair: ${character.hair}`);
  if (character.build) parts.push(`build and proportions: ${character.build}`);
  if (character.costume) parts.push(`default costume: ${character.costume}`);
  if (character.palette?.length) parts.push(`identity palette: ${character.palette.join(', ')}`);
  if (character.signatureDetails?.length) parts.push(`signature details: ${character.signatureDetails.join(', ')}`);
  return parts.join('. ');
}

function styleBlock(style) {
  const parts = [style.description];
  if (style.medium) parts.push(`medium: ${style.medium}`);
  if (style.period) parts.push(`period/art direction: ${style.period}`);
  if (style.lighting) parts.push(`lighting language: ${style.lighting}`);
  if (style.palette?.length) parts.push(`palette: ${style.palette.join(', ')}`);
  if (style.materials?.length) parts.push(`materials: ${style.materials.join(', ')}`);
  if (style.lineTreatment?.length) parts.push(`line/edge treatment: ${style.lineTreatment.join(', ')}`);
  return parts.join('. ');
}

function shotBlock(shot) {
  const parts = [shot.description];
  if (shot.pose) parts.push(`pose/action: ${shot.pose}`);
  if (shot.camera) parts.push(`camera: ${shot.camera}`);
  if (shot.expression) parts.push(`expression: ${shot.expression}`);
  if (shot.outfitState) parts.push(`outfit state: ${shot.outfitState}`);
  if (shot.background) parts.push(`background: ${shot.background}`);
  if (shot.framing) parts.push(`framing: ${shot.framing}`);
  if (shot.mustInclude?.length) parts.push(`must include: ${shot.mustInclude.join(', ')}`);
  return parts.join('. ');
}

function assemblePrompt({ character, style, quality, consistency, shot, campaign }) {
  const positiveLayers = Object.freeze({
    identity: identityBlock(character),
    style: styleBlock(style),
    quality: unique([...(quality.prompt ?? []), ...(campaign.qualityPrompt ?? [])]).join(', '),
    continuity: unique([...(consistency.prompt ?? []), ...(campaign.continuityLocks ?? []), ...(shot.continuityLocks ?? [])]).join(', '),
    shot: shotBlock(shot),
  });
  const negativeLayers = Object.freeze({
    global: unique([...(campaign.negative ?? []), ...(style.mustAvoid ?? [])]).join(', '),
    quality: unique(quality.negative ?? []).join(', '),
    shot: unique(shot.mustAvoid ?? []).join(', '),
  });
  const positive = Object.values(positiveLayers).filter(Boolean).join('. ');
  const negative = Object.values(negativeLayers).filter(Boolean).join(', ');
  return Object.freeze({ positive, negative, positiveLayers, negativeLayers, promptSha256: sha256Text(positive), negativePromptSha256: sha256Text(negative) });
}

function normalizeShot(raw, index) {
  const shot = obj(raw, `shots[${index}]`);
  return Object.freeze({
    id: id(shot.id ?? `shot-${String(index + 1).padStart(3, '0')}`, `shots[${index}].id`),
    description: str(shot.description ?? shot.prompt, `shots[${index}].description`),
    pose: optionalStr(shot.pose, `shots[${index}].pose`, 4096),
    camera: optionalStr(shot.camera, `shots[${index}].camera`, 2048),
    expression: optionalStr(shot.expression, `shots[${index}].expression`, 2048),
    outfitState: optionalStr(shot.outfitState, `shots[${index}].outfitState`, 4096),
    background: optionalStr(shot.background, `shots[${index}].background`, 4096),
    framing: optionalStr(shot.framing, `shots[${index}].framing`, 2048),
    mustInclude: strings(shot.mustInclude, `shots[${index}].mustInclude`),
    mustAvoid: strings(shot.mustAvoid, `shots[${index}].mustAvoid`),
    continuityLocks: strings(shot.continuityLocks, `shots[${index}].continuityLocks`),
    references: strings(shot.references, `shots[${index}].references`, 32),
    seed: shot.seed == null ? null : integer(shot.seed, `shots[${index}].seed`, 0, 2147483647),
    candidateCount: shot.candidateCount == null ? null : integer(shot.candidateCount, `shots[${index}].candidateCount`, 1, 16),
    assetKind: optionalStr(shot.assetKind, `shots[${index}].assetKind`, 64),
    continuityPhase: optionalStr(shot.continuityPhase, `shots[${index}].continuityPhase`, 64),
    target: shot.target == null ? null : obj(shot.target, `shots[${index}].target`),
    tags: strings(shot.tags, `shots[${index}].tags`, 32),
  });
}

export function validateLocalGenerationBatch(input) {
  const manifest = obj(input, 'manifest');
  if (manifest.schema !== LOCAL_GENERATION_BATCH_SCHEMA) fail(`manifest.schema must be ${LOCAL_GENERATION_BATCH_SCHEMA}`);
  const campaignId = id(manifest.campaignId, 'campaignId');
  const contentClass = manifest.contentClass ?? 'general';
  if (!CONTENT.has(contentClass)) fail('contentClass must be general or mature-nonexplicit');
  const characterRaw = obj(manifest.character, 'character');
  const character = Object.freeze({
    id: id(characterRaw.id, 'character.id'),
    minimumAge: contentClass === 'mature-nonexplicit' ? integer(characterRaw.minimumAge, 'character.minimumAge', 18, 130) : (characterRaw.minimumAge ?? null),
    description: str(characterRaw.description, 'character.description'),
    face: optionalStr(characterRaw.face, 'character.face'),
    hair: optionalStr(characterRaw.hair, 'character.hair'),
    build: optionalStr(characterRaw.build, 'character.build'),
    costume: optionalStr(characterRaw.costume, 'character.costume'),
    palette: strings(characterRaw.palette, 'character.palette', 32),
    signatureDetails: strings(characterRaw.signatureDetails, 'character.signatureDetails', 32),
  });
  const styleRaw = obj(manifest.style, 'style');
  const style = Object.freeze({
    name: str(styleRaw.name ?? 'campaign-style', 'style.name', 256),
    description: str(styleRaw.description, 'style.description'),
    medium: optionalStr(styleRaw.medium, 'style.medium'),
    period: optionalStr(styleRaw.period, 'style.period'),
    lighting: optionalStr(styleRaw.lighting, 'style.lighting'),
    palette: strings(styleRaw.palette, 'style.palette', 32),
    materials: strings(styleRaw.materials, 'style.materials', 32),
    lineTreatment: strings(styleRaw.lineTreatment, 'style.lineTreatment', 32),
    mustHave: strings(styleRaw.mustHave, 'style.mustHave', 64),
    mustAvoid: strings(styleRaw.mustAvoid, 'style.mustAvoid', 64),
  });
  const mode = manifest.generation_mode ?? 'independent';
  if (!MODES.has(mode)) fail(`unsupported generation_mode ${mode}`);
  const consistencyMode = manifest.consistency_mode ?? 'balanced';
  if (!CONSISTENCY.has(consistencyMode)) fail(`unsupported consistency_mode ${consistencyMode}`);
  const consistency = CONSISTENCY_PROFILES[consistencyMode];
  const qualityProfile = manifest.quality_profile ?? 'cinematic_stills';
  const quality = normalizeQuality(qualityProfile, manifest.quality_overrides ?? {});
  const shots = (manifest.shots ?? []).map(normalizeShot);
  const batchSize = integer(manifest.batch_size ?? shots.length, 'batch_size', 1, MAX_BATCH_SIZE);
  if (shots.length !== batchSize) fail(`shots length (${shots.length}) must equal batch_size (${batchSize})`);
  if (new Set(shots.map((shot) => shot.id)).size !== shots.length) fail('shot IDs must be unique');
  const seedRaw = obj(manifest.seed_strategy ?? {}, 'seed_strategy');
  const seedStrategy = Object.freeze({
    base: integer(seedRaw.base ?? 100000, 'seed_strategy.base', 0, 2147483647),
    stride: integer(seedRaw.stride ?? consistency.seedStride, 'seed_strategy.stride', 1, 1000000),
  });
  const outputRaw = obj(manifest.output_rules ?? {}, 'output_rules');
  const outputRules = Object.freeze({
    exactCount: outputRaw.exactCount !== false,
    requireUniqueHashes: outputRaw.requireUniqueHashes !== false,
    requireNonZeroBytes: outputRaw.requireNonZeroBytes !== false,
    requireDimensions: outputRaw.requireDimensions !== false,
    writeImageMetadata: outputRaw.writeImageMetadata !== false,
    preserveAttempts: outputRaw.preserveAttempts === true,
  });
  const retryRaw = obj(manifest.retry_rules ?? {}, 'retry_rules');
  const retryRules = Object.freeze({
    maxShotAttempts: integer(retryRaw.maxShotAttempts ?? 3, 'retry_rules.maxShotAttempts', 1, 8),
    retryMissing: retryRaw.retryMissing !== false,
    retryInvalidFile: retryRaw.retryInvalidFile !== false,
    retryDimensionMismatch: retryRaw.retryDimensionMismatch !== false,
    retryDuplicate: retryRaw.retryDuplicate !== false,
    seedBump: integer(retryRaw.seedBump ?? 1009, 'retry_rules.seedBump', 1, 10000000),
  });
  const providerRaw = obj(manifest.provider ?? {}, 'provider');
  const provider = Object.freeze({
    baseUrl: providerRaw.baseUrl ?? null,
    catalogPath: providerRaw.catalogPath ?? null,
    adapterId: providerRaw.adapterId ?? null,
  });
  return Object.freeze({
    schema: LOCAL_GENERATION_BATCH_SCHEMA,
    campaignId, contentClass, character, style, mode, consistencyMode, consistency, qualityProfile, quality,
    batchSize, shots: Object.freeze(shots), seedStrategy, outputRules, retryRules, provider,
    continuityLocks: strings(manifest.continuity_locks, 'continuity_locks', 128),
    qualityPrompt: strings(manifest.quality_prompt, 'quality_prompt', 64),
    negative: strings(manifest.negative, 'negative', 128),
    source: manifest,
  });
}

function candidateCountFor(batch, shot) {
  if (shot.candidateCount != null) return shot.candidateCount;
  if (batch.mode === 'paired') return 2;
  if (batch.mode === 'variation') return 4;
  return 1;
}

function continuityPhaseFor(batch, shot, index) {
  if (shot.continuityPhase) return shot.continuityPhase;
  if (batch.mode === 'independent' || batch.consistencyMode === 'loose') return 'independent';
  if (batch.mode === 'sequential-anchor' && index === 0) return 'identity-master';
  if (batch.mode === 'sprite') return index === 0 ? 'direction-master' : 'key-pose';
  if (batch.mode === 'repair') return 'repair';
  return batch.consistency.continuityPhase;
}

function seedFor(batch, shot, index, attempt = 1) {
  const initial = shot.seed ?? ((batch.seedStrategy.base + (index * batch.seedStrategy.stride)) % 2147483647);
  return (initial + ((attempt - 1) * batch.retryRules.seedBump)) % 2147483647;
}

export function compileBatchPlan(input) {
  const batch = input?.schema === LOCAL_GENERATION_BATCH_SCHEMA && input?.shots?.[0]?.description ? validateLocalGenerationBatch(input) : input;
  const frames = batch.shots.map((shot, index) => {
    const prompt = assemblePrompt({ character: batch.character, style: batch.style, quality: batch.quality, consistency: batch.consistency, shot, campaign: batch });
    return Object.freeze({
      ordinal: index + 1,
      id: shot.id,
      slug: slug(shot.id),
      shot,
      prompt,
      seed: seedFor(batch, shot, index),
      candidateCount: candidateCountFor(batch, shot),
      continuityPhase: continuityPhaseFor(batch, shot, index),
      quality: batch.quality,
      references: shot.references,
    });
  });
  return Object.freeze({ ...batch, frames: Object.freeze(frames) });
}

export function compileLegacyManifest(plan, frames = plan.frames, attempt = 1) {
  return {
    schema: 'evavo.local-generation-campaign.v1',
    campaignId: plan.campaignId,
    contentClass: plan.contentClass,
    subject: {
      ...(plan.character.minimumAge == null ? {} : { minimumAge: plan.character.minimumAge }),
      description: plan.character.description,
    },
    provider: {
      ...(plan.provider.baseUrl ? { baseUrl: plan.provider.baseUrl } : {}),
      ...(plan.provider.catalogPath ? { catalogPath: plan.provider.catalogPath } : {}),
      ...(plan.provider.adapterId ? { adapterId: plan.provider.adapterId } : {}),
    },
    defaults: { candidateCount: 1 },
    style: {
      styleName: plan.style.name,
      intent: plan.style.description,
      mustHave: unique([...(plan.style.mustHave ?? []), ...(plan.quality.prompt ?? [])]),
      mustAvoid: unique([...(plan.style.mustAvoid ?? []), ...(plan.quality.negative ?? []), ...(plan.negative ?? [])]),
      identityLocks: unique([plan.character.description, ...(plan.character.signatureDetails ?? []), ...(plan.continuityLocks ?? [])]),
      palette: unique([...(plan.character.palette ?? []), ...(plan.style.palette ?? [])]),
      lineTreatment: plan.style.lineTreatment,
      materials: plan.style.materials,
      cameraRules: [],
      compositionRules: [],
      eraRules: plan.style.period ? [plan.style.period] : [],
    },
    scenes: frames.map((frame) => {
      const index = frame.ordinal - 1;
      const target = frame.shot.target ?? {};
      const transparency = target.transparency ?? 'opaque';
      if (!TRANSPARENCY.has(transparency)) fail(`shot ${frame.id} target transparency is unsupported`);
      const outputFormat = target.outputFormat ?? plan.quality.outputFormat;
      if (!FORMATS.has(outputFormat)) fail(`shot ${frame.id} output format is unsupported`);
      return {
        id: frame.id,
        prompt: frame.prompt.positive,
        ...(frame.prompt.negative ? { negativePrompt: frame.prompt.negative } : {}),
        subject: plan.character.description,
        action: frame.shot.pose ?? frame.shot.description,
        direction: frame.shot.camera ?? 'Follow the shot definition exactly.',
        include: unique([...(frame.shot.mustInclude ?? []), ...(frame.references.length ? [`source references: ${frame.references.join(', ')}`] : [])]),
        exclude: frame.shot.mustAvoid,
        framing: frame.shot.framing ? [frame.shot.framing] : [],
        assetKind: frame.shot.assetKind ?? (plan.mode === 'sprite' ? 'sprite-frame' : 'illustration'),
        continuityPhase: frame.continuityPhase,
        candidateCount: frame.candidateCount,
        seed: seedFor(plan, frame.shot, index, attempt),
        target: {
          width: target.width ?? plan.quality.width,
          height: target.height ?? plan.quality.height,
          transparency,
          outputFormat,
        },
      };
    }),
  };
}

export function chunkFrames(frames, size = LEGACY_CHUNK_SIZE) {
  const chunks = [];
  for (let index = 0; index < frames.length; index += size) chunks.push(frames.slice(index, index + size));
  return Object.freeze(chunks.map((chunk) => Object.freeze(chunk)));
}

export function imageMetadata(plan, frame, { attempt, route = null, candidate = null, qa = null } = {}) {
  return Object.freeze({
    schema: 'evavo.local-generation-image-metadata.v2',
    campaignId: plan.campaignId,
    shotId: frame.id,
    ordinal: frame.ordinal,
    generationMode: plan.mode,
    consistencyMode: plan.consistencyMode,
    qualityProfile: plan.qualityProfile,
    prompt: frame.prompt.positive,
    negativePrompt: frame.prompt.negative,
    promptLayers: frame.prompt.positiveLayers,
    negativePromptLayers: frame.prompt.negativeLayers,
    promptSha256: frame.prompt.promptSha256,
    negativePromptSha256: frame.prompt.negativePromptSha256,
    seed: seedFor(plan, frame.shot, frame.ordinal - 1, attempt ?? 1),
    settings: {
      width: frame.shot.target?.width ?? plan.quality.width,
      height: frame.shot.target?.height ?? plan.quality.height,
      steps: plan.quality.steps,
      cfg: plan.quality.cfg,
      sampler: plan.quality.sampler,
      scheduler: plan.quality.scheduler,
      denoise: plan.quality.denoise,
      hiresScale: plan.quality.hiresScale,
      faceDetailPass: plan.quality.faceDetailPass,
      outputFormat: frame.shot.target?.outputFormat ?? plan.quality.outputFormat,
      candidateCount: frame.candidateCount,
    },
    sourceReferences: frame.references,
    retryAttempt: attempt ?? 1,
    route,
    candidate,
    qa,
  });
}
