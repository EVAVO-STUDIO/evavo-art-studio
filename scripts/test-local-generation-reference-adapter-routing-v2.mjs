#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  attachProviderReferencesToLegacyManifest,
  referenceAdapterId,
} from './local-generation-reference-execution-v2.mjs';

const artifact = `artifact_${'a'.repeat(64)}`;
const base = 'comfyui:sdxl-base-local-cinematic_stills';

assert.equal(referenceAdapterId(base, []), base);
assert.equal(
  referenceAdapterId(base, [{ role: 'canonical-identity' }]),
  `${base}-reference-canonical-identity`,
);
assert.equal(
  referenceAdapterId(`${base}-reference-base-image`, [{ role: 'base-image' }]),
  `${base}-reference-base-image`,
);
assert.throws(
  () => referenceAdapterId(base, [{ role: 'previous-key-pose' }, { role: 'next-key-pose' }]),
  /exactly one resolved reference/u,
);

const manifest = {
  provider: { adapterId: base },
  scenes: [
    { id: 'anchor', prompt: 'anchor' },
    { id: 'dependent', prompt: 'dependent' },
  ],
};
const routed = attachProviderReferencesToLegacyManifest(manifest, [
  { id: 'anchor', providerReferences: [] },
  {
    id: 'dependent',
    providerReferences: [{
      artifactId: artifact,
      role: 'canonical-identity',
      strength: 1,
      required: true,
    }],
  },
]);
assert.equal(routed.scenes[0].adapterId, undefined);
assert.equal(routed.scenes[1].adapterId, `${base}-reference-canonical-identity`);
assert.equal(routed.scenes[1].references[0].artifactId, artifact);

console.log('Staged reference adapter routing tests passed.');
