#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  authority,
  fail,
  id,
  integer,
  readJson,
  relative,
  selfHash,
  timestamp,
  verifySelfHash,
  writeJsonCreateOnly,
} from './raw-art-folder/lib.mjs';
import { scanRawArtFolder, verifyInventory } from './raw-art-folder/scan.mjs';

export const AVATAR_REVIEW_SCHEMA = 'evavo.avatar-frame-review-packets.v1';
export const AVATAR_DECISIONS_SCHEMA = 'evavo.avatar-frame-sequence-decisions.v1';
export const AVATAR_PLAN_SCHEMA = 'evavo.avatar-frame-sequence-plan.v1';
const HASH = /^[a-f0-9]{64}$/u;
const LOOP_MODES = new Set(['loop', 'once', 'ping-pong']);
const MAX_SEQUENCES = 256;
const MAX_FRAMES_PER_SEQUENCE = 4096;

function hash(value, label) {
  if (typeof value !== 'string' || !HASH.test(value)) fail('AVATAR_FRAME_HASH_INVALID', `${label} must be a lowercase SHA-256.`);
  return value;
}

function bool(value, label, fallback = false) {
  if (value == null) return fallback;
  if (typeof value !== 'boolean') fail('AVATAR_FRAME_BOOLEAN_INVALID', `${label} must be boolean.`);
  return value;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('AVATAR_FRAME_OBJECT_INVALID', `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('AVATAR_FRAME_FIELDS_INVALID', `${label} field set differs.`);
  }
}

function imageFiles(inventory) {
  verifyInventory(inventory);
  return inventory.files.filter((file) => file.technicalKind === 'image' && file.image?.format);
}

function frameRef(file) {
  return Object.freeze({
    relativePath: file.relativePath,
    sha256: file.sha256,
    bytes: file.bytes,
    format: file.image.format,
    width: file.image.width,
    height: file.image.height,
    alpha: file.image.alpha,
    sequenceHint: file.sequenceHint ?? null,
    semanticInferenceAuthoritative: false,
  });
}

export function buildAvatarFrameReviewPackets(inventory, options = {}) {
  verifyInventory(inventory);
  const characterId = id(options.characterId ?? 'unassigned-avatar', 'characterId');
  const packetSize = integer(options.packetSize ?? 10, 'packetSize', 2, 50);
  const images = imageFiles(inventory);
  const byPath = new Map(images.map((file) => [file.relativePath, file]));
  const grouped = [];
  const claimed = new Set();

  for (const candidate of inventory.sequenceCandidates ?? []) {
    const files = candidate.paths.map((relativePath) => byPath.get(relativePath)).filter(Boolean);
    if (files.length < 2) continue;
    files.sort((a, b) => {
      const left = a.sequenceHint?.index ?? Number.MAX_SAFE_INTEGER;
      const right = b.sequenceHint?.index ?? Number.MAX_SAFE_INTEGER;
      return left - right || a.relativePath.localeCompare(b.relativePath, 'en');
    });
    for (let offset = 0; offset < files.length; offset += packetSize) {
      const slice = files.slice(offset, offset + packetSize);
      grouped.push(Object.freeze({
        packetId: `${characterId}-candidate-${String(grouped.length + 1).padStart(3, '0')}`,
        candidateKey: candidate.key,
        candidateOrdinal: Math.floor(offset / packetSize) + 1,
        semanticLabel: null,
        semanticReviewRequired: true,
        orderSource: 'filename-numeric-hint-only',
        orderAuthoritative: false,
        frames: Object.freeze(slice.map(frameRef)),
      }));
      for (const file of slice) claimed.add(file.relativePath);
    }
  }

  const ungrouped = images.filter((file) => !claimed.has(file.relativePath));
  for (let offset = 0; offset < ungrouped.length; offset += packetSize) {
    const slice = ungrouped.slice(offset, offset + packetSize);
    grouped.push(Object.freeze({
      packetId: `${characterId}-unassigned-${String(Math.floor(offset / packetSize) + 1).padStart(3, '0')}`,
      candidateKey: null,
      candidateOrdinal: Math.floor(offset / packetSize) + 1,
      semanticLabel: null,
      semanticReviewRequired: true,
      orderSource: 'stable-relative-path-only',
      orderAuthoritative: false,
      frames: Object.freeze(slice.map(frameRef)),
    }));
  }

  const dimensions = new Map();
  for (const file of images) {
    const key = `${file.image.width ?? 'unknown'}x${file.image.height ?? 'unknown'}`;
    dimensions.set(key, (dimensions.get(key) ?? 0) + 1);
  }
  const doc = {
    schema: AVATAR_REVIEW_SCHEMA,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    characterId,
    inventorySha256: inventory.inventorySha256,
    sourceRoot: inventory.rawArtRoot,
    packetSize,
    totals: Object.freeze({
      images: images.length,
      packets: grouped.length,
      exactDuplicateGroups: inventory.exactDuplicates?.length ?? 0,
      caseCollisions: inventory.caseCollisions?.length ?? 0,
      dimensionProfiles: dimensions.size,
    }),
    dimensionProfiles: Object.freeze([...dimensions].map(([dimensionsKey, count]) => ({ dimensions: dimensionsKey, count })).sort((a, b) => a.dimensions.localeCompare(b.dimensions, 'en'))),
    packets: Object.freeze(grouped),
    semanticPolicy: Object.freeze({
      filenameOrderIsMeaning: false,
      timestampOrderIsMeaning: false,
      generationOrderIsMeaning: false,
      semanticLabelsRequireExplicitReview: true,
      activationAuthorityGranted: false,
    }),
    authority,
  };
  return Object.freeze({ ...doc, reviewPacketsSha256: selfHash(doc, 'reviewPacketsSha256') });
}

export function verifyAvatarFrameReviewPackets(value) {
  if (value?.schema !== AVATAR_REVIEW_SCHEMA || !Array.isArray(value.packets)) {
    fail('AVATAR_FRAME_REVIEW_INVALID', 'Avatar frame review packet document is invalid.');
  }
  return verifySelfHash(value, 'reviewPacketsSha256', 'AVATAR_FRAME_REVIEW_HASH_MISMATCH');
}

function normaliseFrameDecision(value, label) {
  exactKeys(value, ['relativePath', 'expectedSha256', 'hold'], label);
  return Object.freeze({
    relativePath: relative(value.relativePath, `${label}.relativePath`),
    expectedSha256: hash(value.expectedSha256, `${label}.expectedSha256`),
    hold: integer(value.hold, `${label}.hold`, 1, 120),
  });
}

function sequenceTarget(characterId, sequenceId, index, extension) {
  return `characters/${characterId}/sequences/${sequenceId}/frame-${String(index + 1).padStart(4, '0')}${extension}`;
}

export function compileAvatarFrameSequencePlanFromValues(inventory, decisions, options = {}) {
  verifyInventory(inventory);
  exactKeys(decisions, ['schema', 'characterId', 'sequenceSetId', 'inventorySha256', 'repositoryTargetPrefix', 'storageLogicalPathPrefix', 'sequences'], 'decisions');
  if (decisions.schema !== AVATAR_DECISIONS_SCHEMA) fail('AVATAR_FRAME_DECISIONS_SCHEMA_INVALID', 'Avatar sequence decisions schema differs.');
  const characterId = id(decisions.characterId, 'characterId');
  const sequenceSetId = id(decisions.sequenceSetId, 'sequenceSetId');
  if (hash(decisions.inventorySha256, 'inventorySha256') !== inventory.inventorySha256) fail('AVATAR_FRAME_INVENTORY_MISMATCH', 'Decisions were not made against this inventory.');
  if (!Array.isArray(decisions.sequences) || !decisions.sequences.length || decisions.sequences.length > MAX_SEQUENCES) {
    fail('AVATAR_FRAME_SEQUENCE_COUNT_INVALID', `sequences must contain 1..${MAX_SEQUENCES} entries.`);
  }
  const repositoryTargetPrefix = decisions.repositoryTargetPrefix == null ? null : relative(decisions.repositoryTargetPrefix, 'repositoryTargetPrefix');
  const storageLogicalPathPrefix = decisions.storageLogicalPathPrefix == null ? null : relative(decisions.storageLogicalPathPrefix, 'storageLogicalPathPrefix');
  const files = new Map(inventory.files.map((file) => [file.relativePath, file]));
  const seenSequenceIds = new Set();
  const sequences = [];
  const allTargets = new Set();

  for (let sequenceIndex = 0; sequenceIndex < decisions.sequences.length; sequenceIndex += 1) {
    const source = decisions.sequences[sequenceIndex];
    exactKeys(source, ['sequenceId', 'loopMode', 'fps', 'allowVariableCanvas', 'allowDuplicateBytes', 'frames'], `sequences[${sequenceIndex}]`);
    const sequenceId = id(source.sequenceId, `sequences[${sequenceIndex}].sequenceId`);
    if (seenSequenceIds.has(sequenceId)) fail('AVATAR_FRAME_SEQUENCE_DUPLICATE', `Duplicate sequenceId ${sequenceId}.`);
    seenSequenceIds.add(sequenceId);
    if (!LOOP_MODES.has(source.loopMode)) fail('AVATAR_FRAME_LOOP_MODE_INVALID', `${sequenceId} loopMode is invalid.`);
    const fps = integer(source.fps, `${sequenceId}.fps`, 1, 60);
    const allowVariableCanvas = bool(source.allowVariableCanvas, `${sequenceId}.allowVariableCanvas`);
    const allowDuplicateBytes = bool(source.allowDuplicateBytes, `${sequenceId}.allowDuplicateBytes`);
    if (!Array.isArray(source.frames) || !source.frames.length || source.frames.length > MAX_FRAMES_PER_SEQUENCE) {
      fail('AVATAR_FRAME_COUNT_INVALID', `${sequenceId} frames must contain 1..${MAX_FRAMES_PER_SEQUENCE} entries.`);
    }
    const frameDecisions = source.frames.map((frame, frameIndex) => normaliseFrameDecision(frame, `${sequenceId}.frames[${frameIndex}]`));
    const resolved = [];
    const seenPaths = new Set();
    const seenHashes = new Map();
    let dimensions = null;
    let format = null;
    for (let frameIndex = 0; frameIndex < frameDecisions.length; frameIndex += 1) {
      const decision = frameDecisions[frameIndex];
      if (seenPaths.has(decision.relativePath)) fail('AVATAR_FRAME_PATH_REPEATED', `${sequenceId} repeats source path ${decision.relativePath}; use hold instead.`);
      seenPaths.add(decision.relativePath);
      const file = files.get(decision.relativePath);
      if (!file || file.technicalKind !== 'image' || !file.image?.format) fail('AVATAR_FRAME_SOURCE_INVALID', `${sequenceId} frame is not one inventoried image: ${decision.relativePath}.`);
      if (file.sha256 !== decision.expectedSha256) fail('AVATAR_FRAME_SOURCE_DRIFT', `${sequenceId} SHA-256 differs for ${decision.relativePath}.`);
      const existingHashPath = seenHashes.get(file.sha256);
      if (existingHashPath && !allowDuplicateBytes) fail('AVATAR_FRAME_DUPLICATE_BYTES', `${sequenceId} contains duplicate bytes at ${existingHashPath} and ${decision.relativePath}.`);
      seenHashes.set(file.sha256, decision.relativePath);
      const currentDimensions = `${file.image.width ?? 'unknown'}x${file.image.height ?? 'unknown'}`;
      if (dimensions == null) dimensions = currentDimensions;
      else if (!allowVariableCanvas && currentDimensions !== dimensions) fail('AVATAR_FRAME_CANVAS_DRIFT', `${sequenceId} changes canvas from ${dimensions} to ${currentDimensions}.`);
      if (format == null) format = file.image.format;
      else if (file.image.format !== format) fail('AVATAR_FRAME_FORMAT_DRIFT', `${sequenceId} mixes ${format} and ${file.image.format}.`);
      const extension = file.extension || `.${file.image.format}`;
      const relativeTarget = sequenceTarget(characterId, sequenceId, frameIndex, extension);
      const repositoryTarget = repositoryTargetPrefix ? path.posix.join(repositoryTargetPrefix, relativeTarget) : null;
      const storageLogicalPath = storageLogicalPathPrefix ? path.posix.join(storageLogicalPathPrefix, relativeTarget) : null;
      for (const target of [repositoryTarget, storageLogicalPath].filter(Boolean)) {
        const key = target.toLocaleLowerCase('en-US');
        if (allTargets.has(key)) fail('AVATAR_FRAME_TARGET_COLLISION', `Avatar sequence target collides at ${target}.`);
        allTargets.add(key);
      }
      resolved.push(Object.freeze({
        index: frameIndex,
        hold: decision.hold,
        relativePath: file.relativePath,
        sha256: file.sha256,
        bytes: file.bytes,
        image: file.image,
        destination: relativeTarget,
        repositoryTarget,
        storageLogicalPath,
      }));
    }
    const ticks = resolved.reduce((sum, frame) => sum + frame.hold, 0);
    sequences.push(Object.freeze({
      sequenceId,
      loopMode: source.loopMode,
      fps,
      allowVariableCanvas,
      allowDuplicateBytes,
      frameCount: resolved.length,
      playbackTicks: ticks,
      durationMs: Math.round((ticks / fps) * 1000),
      sourceOrderAuthority: 'explicit-owner-reviewed-order',
      semanticInferenceFromFilename: false,
      semanticInferenceFromTimestamp: false,
      format,
      dimensions,
      frames: Object.freeze(resolved),
    }));
  }

  const doc = {
    schema: AVATAR_PLAN_SCHEMA,
    compiledAt: options.compiledAt ?? new Date().toISOString(),
    characterId,
    sequenceSetId,
    inventorySha256: inventory.inventorySha256,
    sourceRoot: inventory.rawArtRoot,
    repositoryTargetPrefix,
    storageLogicalPathPrefix,
    sequences: Object.freeze(sequences),
    review: Object.freeze({
      explicitSequenceMeaningRequired: true,
      automaticSemanticInferenceAccepted: false,
      creativeApprovalRequiredBeforeBundle: true,
      runtimeActivationSeparate: true,
    }),
    downstream: Object.freeze({
      rawArtSessionActions: Object.freeze(['sequence-frame']),
      artStudioAvatarBundleContract: 'evavo.project-art-avatar-sequence-bundle.v1',
      storageRepositoryTransferSupported: repositoryTargetPrefix !== null,
      storageArchiveSupported: storageLogicalPathPrefix !== null,
      normalNonForcePublicationOnly: true,
    }),
    authority,
  };
  return Object.freeze({ ...doc, planSha256: selfHash(doc, 'planSha256') });
}

export function verifyAvatarFrameSequencePlan(value) {
  if (value?.schema !== AVATAR_PLAN_SCHEMA || !Array.isArray(value.sequences)) fail('AVATAR_FRAME_PLAN_INVALID', 'Avatar frame sequence plan is invalid.');
  verifySelfHash(value, 'planSha256', 'AVATAR_FRAME_PLAN_HASH_MISMATCH');
  if (value.authority?.creativeApproval !== false || value.authority?.sourceMutation !== false || value.authority?.storageWrite !== false || value.authority?.repositoryMutation !== false || value.authority?.gitCommit !== false || value.authority?.gitPush !== false || value.authority?.forcePush !== false || value.authority?.deployment !== false || value.authority?.publication !== false) {
    fail('AVATAR_FRAME_AUTHORITY_ESCALATION', 'Avatar frame plan authority escalated.');
  }
  return value;
}

export async function compileAvatarFrameSequencePlan(options) {
  const { value: inventory } = await readJson(options.inventoryPath, 'inventoryPath');
  const { value: decisions } = await readJson(options.decisionsPath, 'decisionsPath');
  const plan = compileAvatarFrameSequencePlanFromValues(inventory, decisions, { compiledAt: options.compiledAt });
  return verifyAvatarFrameSequencePlan(plan);
}

export async function reviewAvatarFrameRoot(options) {
  const inventory = await scanRawArtFolder({
    rawArtRoot: options.rawArtRoot,
    generatedAt: options.generatedAt,
    maximumFiles: options.maximumFiles,
    maximumBytes: options.maximumBytes,
  });
  return buildAvatarFrameReviewPackets(inventory, {
    characterId: options.characterId,
    packetSize: options.packetSize,
    generatedAt: options.generatedAt,
  });
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const out = { command };
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    if (!key?.startsWith('--') || rest[index + 1] == null) fail('AVATAR_FRAME_ARGUMENT_INVALID', `Invalid argument ${key ?? '<missing>'}.`);
    out[key.slice(2)] = rest[index + 1];
  }
  return out;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.command === 'review') {
    const packets = await reviewAvatarFrameRoot({
      rawArtRoot: args['raw-art-root'],
      characterId: args['character-id'],
      packetSize: args['packet-size'],
      generatedAt: args['generated-at'],
      maximumFiles: args['maximum-files'],
      maximumBytes: args['maximum-bytes'],
    });
    if (args.output) await writeJsonCreateOnly(args.output, packets);
    return { schema: packets.schema, reviewPacketsSha256: packets.reviewPacketsSha256, totals: packets.totals, outputPath: args.output ? path.resolve(args.output) : null };
  }
  if (args.command === 'plan') {
    const plan = await compileAvatarFrameSequencePlan({
      inventoryPath: args.inventory,
      decisionsPath: args.decisions,
      compiledAt: args['compiled-at'],
    });
    if (!args.output) fail('AVATAR_FRAME_OUTPUT_REQUIRED', 'plan requires --output.');
    await writeJsonCreateOnly(args.output, plan);
    return { schema: plan.schema, planSha256: plan.planSha256, sequenceCount: plan.sequences.length, outputPath: path.resolve(args.output) };
  }
  if (args.command === 'verify-plan') {
    const { value } = await readJson(args.plan, 'planPath');
    const plan = verifyAvatarFrameSequencePlan(value);
    return { status: 'passed', schema: plan.schema, planSha256: plan.planSha256, sequenceCount: plan.sequences.length };
  }
  fail('AVATAR_FRAME_COMMAND_INVALID', 'Command must be review, plan or verify-plan.');
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main().then((value) => process.stdout.write(`${JSON.stringify(value)}\n`)).catch((error) => {
  process.stderr.write(`${error.code ?? 'AVATAR_FRAME_ERROR'}: ${error.message}\n`);
  process.exitCode = 1;
});
