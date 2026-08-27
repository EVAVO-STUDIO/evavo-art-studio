#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 1024 * 1024;
const SCHEMA = 'evavo_soundtrack_artwork_brief_v1';
const AUDIO_REPO = 'EVAVO-STUDIO/evavo-audio-studio';
const ART_REPO = 'EVAVO-STUDIO/evavo-art-studio';

function fail(code, detail = '') {
  throw new Error(detail ? `${code}: ${detail}` : code);
}

function assert(condition, code, detail = '') {
  if (!condition) fail(code, detail);
}

function readJson(file) {
  const before = fs.lstatSync(file);
  assert(before.isFile() && !before.isSymbolicLink() && before.nlink === 1, 'ARTWORK_BRIEF_UNSAFE_FILE');
  assert(before.size > 1 && before.size <= MAX_BYTES, 'ARTWORK_BRIEF_SIZE');
  const bytes = fs.readFileSync(file);
  const after = fs.lstatSync(file);
  assert(before.size === after.size && before.mtimeMs === after.mtimeMs, 'ARTWORK_BRIEF_CHANGED_DURING_READ');
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { fail('ARTWORK_BRIEF_INVALID_JSON'); }
}

function cleanString(value, min = 1, max = 2000) {
  return typeof value === 'string' && value.trim() === value && value.length >= min && value.length <= max;
}

function validate(document) {
  assert(document?.schema === SCHEMA, 'ARTWORK_BRIEF_SCHEMA');
  assert(document?.handoff?.repository === ART_REPO, 'ARTWORK_BRIEF_RECEIVER');
  assert(document?.handoff?.purpose === 'soundtrack_cover_art_direction_and_production', 'ARTWORK_BRIEF_PURPOSE');
  assert(document?.handoff?.returnToAudioStudioForFinalMediaValidation === true, 'ARTWORK_BRIEF_RETURN_VALIDATION');
  assert(cleanString(document?.release?.title, 1, 200), 'ARTWORK_BRIEF_RELEASE_TITLE');
  assert(cleanString(document?.release?.artist, 1, 200), 'ARTWORK_BRIEF_ARTIST');
  assert(cleanString(document?.concept, 8, 2000), 'ARTWORK_BRIEF_CONCEPT');
  assert(document?.master?.aspectRatio === '1:1', 'ARTWORK_BRIEF_ASPECT');
  assert(Number.isInteger(document?.master?.preferredWorkingPixels) && document.master.preferredWorkingPixels >= 640 && document.master.preferredWorkingPixels <= 10000, 'ARTWORK_BRIEF_WORKING_SIZE');
  assert(document?.master?.minimumAcceptedPixels === 640, 'ARTWORK_BRIEF_MIN_SIZE');
  assert(document?.master?.maximumAcceptedPixels === 10000, 'ARTWORK_BRIEF_MAX_SIZE');
  assert(document?.master?.colorSpace === 'sRGB', 'ARTWORK_BRIEF_COLOR_SPACE');
  assert(Array.isArray(document?.master?.acceptedFormats) && ['png', 'jpg', 'tiff'].every((item) => document.master.acceptedFormats.includes(item)), 'ARTWORK_BRIEF_FORMATS');
  assert(document?.master?.noArtificialUpscaling === true, 'ARTWORK_BRIEF_NO_UPSCALING');
  assert(document?.master?.retainLayeredEditableSource === true, 'ARTWORK_BRIEF_LAYERED_MASTER');
  assert(document?.review?.thumbnailLegibility === true, 'ARTWORK_BRIEF_THUMBNAIL_REVIEW');
  assert(document?.review?.rightsAndLicensingCheck === true, 'ARTWORK_BRIEF_RIGHTS_REVIEW');
  assert(document?.review?.humanCreativeApprovalRequired === true, 'ARTWORK_BRIEF_HUMAN_APPROVAL');
  assert(document?.authority?.artworkGenerationAuthority === false, 'ARTWORK_BRIEF_GENERATION_AUTHORITY');
  assert(document?.authority?.artworkMutationAuthority === false, 'ARTWORK_BRIEF_MUTATION_AUTHORITY');
  assert(document?.authority?.finalArtworkApproval === false, 'ARTWORK_BRIEF_FINAL_APPROVAL');
  assert(document?.authority?.publicationAuthority === false, 'ARTWORK_BRIEF_PUBLICATION_AUTHORITY');
  assert(document?.authority?.handoffTarget === ART_REPO, 'ARTWORK_BRIEF_HANDOFF_TARGET');
  return {
    schema: 'evavo_soundtrack_artwork_brief_validation_v1',
    valid: true,
    producerRepository: AUDIO_REPO,
    receiverRepository: ART_REPO,
    releaseTitle: document.release.title,
    preferredWorkingPixels: document.master.preferredWorkingPixels,
    finalArtworkApproval: false,
    publicationAuthority: false,
  };
}

const args = process.argv.slice(2);
const index = args.indexOf('--brief');
if (index < 0 || !args[index + 1] || args.length !== 2) fail('ARTWORK_BRIEF_USAGE', 'use --brief <file>');
const file = path.resolve(args[index + 1]);
console.log(JSON.stringify(validate(readJson(file)), null, 2));
