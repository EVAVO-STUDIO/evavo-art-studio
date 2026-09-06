import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function text(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('governed local batch entry owns source-manifest provenance', async () => {
  const source = await text('scripts/run-local-art-batch-entry.mjs');
  assert.match(source, /jsonWithBytes\(sourcePath, 'batch manifest'\)/);
  assert.match(source, /evavoProvenance is reserved for the governed local entrypoint/);
  assert.match(source, /sourceManifestSha256: sourceInput\.sha256/);
  assert.match(source, /sourceManifestByteLength: sourceInput\.bytes\.length/);
  assert.match(source, /governedEntry: 'run-local-art-batch-entry-v2'/);
  assert.match(source, /executionManifestSha256/);
  assert.match(source, /await writeFile\(original, sourceBytes\)/);
});

test('batch receipt persists source and execution manifest content identity', async () => {
  const source = await text('scripts/run-local-generation-batch.mjs');
  assert.match(source, /const manifestInput = await readJsonWithBytes\(manifestPath, 'batch manifest'\)/);
  assert.match(source, /manifestProvenance: \{/);
  assert.match(source, /sourceManifestSha256,/);
  assert.match(source, /sourceManifestByteLength,/);
  assert.match(source, /executionManifestSha256: manifestInput\.sha256/);
  assert.match(source, /governedEntry: provenance\?\.governedEntry \?\? null/);
});

test('provenance fields remain evidence and do not grant promotion or publication authority', async () => {
  const source = await text('scripts/run-local-generation-batch.mjs');
  assert.match(source, /candidateApproval: false/);
  assert.match(source, /candidatePromotion: false/);
  assert.match(source, /publication: false/);
  assert.match(source, /targetRepositoryMutation: false/);
  assert.match(source, /localOnly: true/);
  assert.match(source, /hostedFallback: false/);
});
