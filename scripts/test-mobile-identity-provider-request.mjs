#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileMobileIdentityProductionBrief } from './mobile-identity-contract.mjs';
import { compileMobileIdentityProviderRequest } from './compile-mobile-identity-provider-request.mjs';

const production = compileMobileIdentityProductionBrief({
  app: {
    name: 'GODMODE',
    purpose: 'Premium EVAVO companion for Chronus M02S smart glasses.',
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
    usage: 'Primary companion identity beside HeyCyan at launcher scale.',
  },
  delivery: {
    ios1024: 'apps/mobile/ios/Resources/Assets.xcassets/AppIcon.appiconset/GODMODE-1024.png',
    androidAdaptiveForeground: 'apps/mobile/android/app/src/main/res/drawable/ic_launcher_foreground.xml',
    androidNotification: 'apps/mobile/android/app/src/main/res/drawable/ic_notification_glasses.xml',
  },
  candidateCount: 6,
  providerPreference: ['openai-gpt-image', 'comfyui'],
  creativeMasterType: 'raster-provider-generation',
});

const compiled = compileMobileIdentityProviderRequest(production);
assert.equal(compiled.schema, 'evavo.mobile-identity-provider-request.v1');
assert.equal(compiled.status, 'provider-request-ready');
assert.equal(compiled.providerRequest.operation, 'generate');
assert.equal(compiled.providerRequest.assetKind, 'ui');
assert.equal(compiled.providerRequest.continuityPhase, 'identity-master');
assert.equal(compiled.providerRequest.target.width, 1024);
assert.equal(compiled.providerRequest.target.height, 1024);
assert.equal(compiled.providerRequest.target.transparency, 'opaque');
assert.equal(compiled.providerRequest.candidateCount, 6);
assert.equal(compiled.providerRequest.selection.preferredAdapterId, 'openai-gpt-image');
assert.equal(compiled.providerRequest.selection.preferredModel, 'gpt-image-2');
assert.deepEqual(compiled.providerRequest.selection.allowedAdapterIds, ['openai-gpt-image']);
assert.equal(compiled.providerRequest.selection.allowFallback, false);
assert.match(compiled.providerRequest.negativeIntent, /No readable text, wordmarks, monograms or lettermarks/u);
assert.match(compiled.providerRequestSha256, /^[a-f0-9]{64}$/u);
assert.equal(compiled.authority.generationEqualsApproval, false);
assert.equal(compiled.authority.forcePush, false);

const withComfy = compileMobileIdentityProviderRequest(production, { comfyUiProfileId: 'godmode-icon' });
assert.deepEqual(withComfy.providerRequest.selection.allowedAdapterIds, ['openai-gpt-image', 'comfyui:godmode-icon']);
assert.equal(withComfy.providerRequest.selection.allowFallback, true);

const comfyPrimary = compileMobileIdentityProviderRequest(production, {
  preferredAdapterId: 'comfyui:godmode-icon',
  preferredModel: 'flux-dev-identity',
});
assert.equal(comfyPrimary.providerRequest.selection.preferredAdapterId, 'comfyui:godmode-icon');
assert.equal(comfyPrimary.providerRequest.selection.preferredModel, 'flux-dev-identity');

assert.throws(
  () => compileMobileIdentityProviderRequest(production, { preferredAdapterId: 'gpt-image' }),
  /generic image-provider aliases/u,
);
assert.throws(
  () => compileMobileIdentityProviderRequest(production, { preferredAdapterId: 'comfyui' }),
  /generic comfyui/u,
);
assert.throws(
  () => compileMobileIdentityProviderRequest(production, { preferredModel: 'gpt-image-1' }),
  /admitted gpt-image-2 model/u,
);

console.log('Mobile identity native provider request contract passed.');
