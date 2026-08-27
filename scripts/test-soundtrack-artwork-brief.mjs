#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const VALIDATOR = path.join(HERE, 'validate-soundtrack-artwork-brief.mjs');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function brief() {
  return {
    schema: 'evavo_soundtrack_artwork_brief_v1',
    handoff: {
      repository: 'EVAVO-STUDIO/evavo-art-studio',
      purpose: 'soundtrack_cover_art_direction_and_production',
      returnToAudioStudioForFinalMediaValidation: true,
    },
    release: {
      releaseId: 'example-game-ost',
      title: 'Example Game Original Soundtrack',
      artist: 'EVAVO',
      releaseType: 'soundtrack',
      primaryGenre: 'Soundtrack',
      releaseDate: '2026-08-27',
    },
    concept: 'Storm-lit harbour at night with restrained cinematic tension',
    visualNotes: ['Readable as a small streaming thumbnail'],
    referenceNotes: [],
    typography: {
      includeReleaseTitle: true,
      includeArtistName: false,
      keepCriticalTextInsideSafeArea: true,
      avoidTinyOrIllegibleText: true,
    },
    master: {
      aspectRatio: '1:1',
      preferredWorkingPixels: 3000,
      minimumAcceptedPixels: 640,
      maximumAcceptedPixels: 10000,
      colorSpace: 'sRGB',
      acceptedFormats: ['png', 'jpg', 'tiff'],
      noArtificialUpscaling: true,
      retainLayeredEditableSource: true,
    },
    deliverables: ['layered_editable_master', 'square_distribution_master', 'small_thumbnail_legibility_preview', 'artwork_review_contact_sheet_or_equivalent'],
    review: {
      fitWithMusicAndGameIdentity: true,
      thumbnailLegibility: true,
      platformSafeCrop: true,
      rightsAndLicensingCheck: true,
      humanCreativeApprovalRequired: true,
    },
    authority: {
      artworkGenerationAuthority: false,
      artworkMutationAuthority: false,
      finalArtworkApproval: false,
      publicationAuthority: false,
      handoffTarget: 'EVAVO-STUDIO/evavo-art-studio',
    },
  };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evavo-artwork-brief-'));
try {
  const validPath = path.join(root, 'valid.json');
  fs.writeFileSync(validPath, JSON.stringify(brief()));
  const valid = spawnSync(process.execPath, [VALIDATOR, '--brief', validPath], { encoding: 'utf8' });
  assert(valid.status === 0, valid.stderr || valid.stdout);
  const result = JSON.parse(valid.stdout);
  assert(result.valid === true, 'valid brief should pass');
  assert(result.receiverRepository === 'EVAVO-STUDIO/evavo-art-studio', 'receiver must be Art Studio');
  assert(result.publicationAuthority === false, 'brief must not grant publication authority');

  const invalid = brief();
  invalid.master.aspectRatio = '16:9';
  const invalidPath = path.join(root, 'invalid.json');
  fs.writeFileSync(invalidPath, JSON.stringify(invalid));
  const rejected = spawnSync(process.execPath, [VALIDATOR, '--brief', invalidPath], { encoding: 'utf8' });
  assert(rejected.status !== 0, 'non-square artwork brief must fail');
  assert((rejected.stderr + rejected.stdout).includes('ARTWORK_BRIEF_ASPECT'), 'failure should identify aspect rule');

  console.log('soundtrack artwork brief receiver tests: OK');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
