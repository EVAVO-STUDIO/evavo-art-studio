#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  compileMobileIdentityProductionBrief,
  validateMobileIdentityRasterApproval,
} from './mobile-identity-production.mjs';

const brief = {
  app: {
    name: 'GODMODE',
    purpose: 'A premium EVAVO companion for Chronus M02S smart glasses, local assistant, vision, media, translation and governed direct control.',
    productFamily: 'EVAVO Glasses',
  },
  brand: {
    studio: 'EVAVO Studio',
    palette: ['#060608', '#F7F7F9', '#FF244E'],
    principles: ['crafted, restrained, premium', 'never generic AI-looking', 'strong silhouette'],
  },
  device: {
    family: 'Chronus M02S / M02SC251227A-YH',
    vendorCompanion: 'HeyCyan',
    usage: 'Phone companion icon must read instantly beside HeyCyan and survive small launcher sizes.',
  },
  delivery: {
    ios1024: 'apps/mobile/ios/Resources/Assets.xcassets/AppIcon.appiconset/GODMODE-1024.png',
    androidAdaptiveForeground: 'apps/mobile/android/app/src/main/res/drawable/ic_launcher_foreground.xml',
    androidNotification: 'apps/mobile/android/app/src/main/res/drawable/ic_notification_glasses.xml',
  },
  candidateCount: 6,
  providerPreference: ['gpt-image', 'comfyui'],
  creativeMasterType: 'raster-provider-generation',
};

const compiled = compileMobileIdentityProductionBrief(brief);
assert.equal(compiled.schema, 'evavo.mobile-identity-production.v1');
assert.equal(compiled.creativeMaster.type, 'raster-provider-generation');
assert.equal(compiled.creativeMaster.svgMayBeCreativeMaster, false);
assert.equal(compiled.creativeMaster.wordmarkMayBeCreativeMaster, false);
assert.equal(compiled.generation.width, 1024);
assert.equal(compiled.generation.height, 1024);
assert.equal(compiled.candidateCount, 6);
assert.match(compiled.generation.prompt, /not a wordmark/iu);
assert.match(compiled.generation.prompt, /generic AI emblem/iu);
assert.deepEqual(compiled.review.smallScalePixels, [16, 24, 32, 48, 64, 128]);
assert.equal(compiled.authority.forcePush, false);
assert.match(compiled.productionSha256, /^[a-f0-9]{64}$/u);

for (const forbidden of ['svg', 'wordmark', 'lettermark', 'hand-authored-vector', 'vector-concept']) {
  assert.throws(
    () => compileMobileIdentityProductionBrief({ ...brief, creativeMasterType: forbidden }),
    /creative master cannot be SVG, wordmark, lettermark or hand-authored vector/u,
  );
}

const approval = {
  schema: 'evavo.mobile-identity-raster-approval.v1',
  approved: true,
  sourceType: 'raster-provider-generation',
  providerFamily: 'gpt-image',
  candidateSha256: 'a'.repeat(64),
  contextSha256: compiled.contextSha256,
  promptSha256: compiled.generation.promptSha256,
  generationReceiptId: 'provider-receipt-godmode-001',
  review: {
    smallScale: true,
    circleMask: true,
    squircleMask: true,
    androidAdaptiveMask: true,
    noTextOrWordmark: true,
    nonGenericIdentity: true,
    strongSilhouette: true,
  },
  authority: {
    deviceAuthority: false,
    protocolAuthority: false,
    forcePush: false,
  },
};
assert.equal(validateMobileIdentityRasterApproval(approval), true);
assert.throws(
  () => validateMobileIdentityRasterApproval({ ...approval, sourceType: 'svg' }),
  /must originate from raster-provider-generation/u,
);
assert.throws(
  () => validateMobileIdentityRasterApproval({ ...approval, providerFamily: 'manual-svg' }),
  /allowed image-generation provider/u,
);
assert.throws(
  () => validateMobileIdentityRasterApproval({ ...approval, review: { ...approval.review, noTextOrWordmark: false } }),
  /noTextOrWordmark must be true/u,
);

console.log('Mobile identity raster production contract passed.');
