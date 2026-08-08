#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashObject } from './compile-raw-art-provider-requests.mjs';
const COMPILER = path.join(
path.dirname(fileURLToPath(import.meta.url)),
'compile-raw-art-provider-requests.mjs',
);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const artifact = (character) => `artifact_${character.repeat(64)}`;
function writeJson(file, value) {
fs.mkdirSync(path.dirname(file), { recursive: true });
const text = `${JSON.stringify(value, null, 2)}\n`;
fs.writeFileSync(file, text, 'utf8');
return { file, text, sha256: sha256(Buffer.from(text, 'utf8')) };
}
function selfHash(value, key) {
const result = { ...value };
result[key] = hashObject(result);
result.runId = result[key].slice(0, 20);
return result;
}
function run(args, expected = 0) {
const result = spawnSync(process.execPath, [COMPILER, ...args], {
encoding: 'utf8',
windowsHide: true,
shell: false,
timeout: 30_000,
});
if (result.status !== expected) {
throw new Error(
`compiler exit ${result.status}, expected ${expected}: ${result.stdout}\n${result.stderr}`,
);
}
return result;
}
function fixture(root) {
const gameHead = 'a'.repeat(40);
const bridge = {
schema: 'evavo.brass-brine.art-studio-bridge.v1',
roles: {
'standing-character': {
targetCanvas: { width: 512, height: 512 },
alphaPolicy: 'meaningful-alpha-required',
},
'location-background': {
targetCanvas: { width: 1280, height: 720 },
alphaPolicy: 'opaque',
},
},
};
const bridgeRecord = writeJson(path.join(root, 'bridge.json'), bridge);
const providerMap = {
schema: 'evavo.brass-brine.raw-art-provider-role-map.v1',
bridgeSchema: 'evavo.brass-brine.art-studio-bridge.v1',
directionContract: 'evavo.brass-brine.art-direction-animation.v1',
requestBatchSchema: 'evavo.raw-art-provider-request-batch.v1',
artifactBindingsSchema: 'evavo.raw-art-provider-artifact-bindings.v1',
styleBankSchema: 'evavo.image-style-reference-bank.v1',
providerExecutionSeparate: true,
runtimeSubmissionSeparate: true,
roleMappings: {
'standing-character': {
assetKind: 'sprite-frame',
transparency: 'required',
backgroundStrategy: 'native-alpha',
continuityByOperation: {
generate: 'identity-master',
edit: 'repair',
inpaint: 'repair',
},
defaultQuality: 'high',
defaultCandidateCount: 4,
maximumStyleReferences: 4,
},
'location-background': {
assetKind: 'environment',
transparency: 'opaque',
backgroundStrategy: 'opaque-source',
continuityByOperation: {
generate: 'direction-master',
edit: 'repair',
inpaint: 'repair',
},
defaultQuality: 'high',
defaultCandidateCount: 4,
maximumStyleReferences: 4,
},
},
authority: {
providerExecution: false,
runtimeSubmission: false,
sourceMutation: false,
sourceDeletion: false,
targetRepositoryMutation: false,
creativeApproval: false,
historicalApproval: false,
provenanceApproval: false,
runtimeApproval: false,
publication: false,
forcePush: false,
},
};
const providerMapRecord = writeJson(path.join(root, 'provider-map.json'), providerMap);
const queueBase = {
schema: 'evavo.raw-art-production-queue.v2',
sourceRoot: 'C:/RAW_ART',
inputs: { bridgeSha256: bridgeRecord.sha256 },
entries: [
{
sourcePath: 'RAW_ART/characters/sailor.png',
sourceSha256: '1'.repeat(64),
sourceBytes: 1000,
dimensions: { width: 512, height: 512 },
semanticRole: 'standing-character',
decision: 'edit',
state: 'provider-required',
targetPath: 'assets/art/characters/sailor.png',
targetCanvas: { width: 512, height: 512 },
alphaPolicy: 'meaningful-alpha-required',
operations: ['retouch'],
assignment: { identityId: 'sailor' },
defects: ['repair malformed left hand'],
negativeConstraints: ['no modern clothing'],
},
{
sourcePath: 'RAW_ART/locations/port.png',
sourceSha256: '2'.repeat(64),
sourceBytes: 2000,
dimensions: { width: 1280, height: 720 },
semanticRole: 'location-background',
decision: 'recreate',
state: 'provider-required',
targetPath: 'assets/art/ports/london/locations/docks/base.png',
targetCanvas: { width: 1280, height: 720 },
alphaPolicy: 'opaque',
operations: [],
assignment: { portId: 'london', sceneId: 'docks' },
defects: ['remove generated pseudo-text'],
negativeConstraints: ['no electrical lighting'],
},
],
batches: [],
counts: { 'provider-required': 2 },
resumableBySourceSha256AndTargetPath: true,
receiptCannotBypassReviewDecision: true,
sourceMutation: false,
sourceDeletion: false,
providerExecution: false,
targetRepositoryMutation: false,
publication: false,
};
const queue = { ...queueBase, queueSha256: hashObject(queueBase) };
const queueRecord = writeJson(path.join(root, 'queue.json'), queue);
const direction = {
schemaVersion: '1.0',
contract: 'evavo.brass-brine.art-direction-animation.v1',
timeline: { defaultReferenceYear: 1871 },
visualPillars: [
{
id: 'readability',
rule: 'Every asset must remain readable at actual gameplay size.',
},
{
id: 'linework',
rule: 'Use controlled engraved linework, stipple and hatching.',
},
],
palette: { base: { nearBlackNavy: '#090c12', signalCherryRed: '#ff244e' } },
cameraAndComposition: {
allowedPrimaryCameras: ['front-on-stage', 'side-stage'],
sceneFloorLane: { required: true },
interactionSafety: { textSafeAreaRequired: true },
},
roleProfiles: {
standing_character: {
camera: 'front-on-stage-or-side-stage',
requiredIdentityAnchors: ['face', 'clothing', 'handedness'],
forbidden: ['cropped-feet', 'modern-pose-language'],
},
location_background: {
camera: 'front-on-stage-or-side-stage',
requiredBriefFields: ['portId', 'date', 'weather'],
requiredLayers: ['base', 'foreground_occlusion', 'interaction_mask'],
forbidden: ['generic-port', 'modern-street-furniture'],
},
},
forbidden: ['photorealism', 'generic-ai-sheen', 'pseudo-text'],
authority: {
providerExecution: false,
sourceOverwrite: false,
sourceDeletion: false,
targetRepositoryMutation: false,
creativeApproval: false,
historicalApproval: false,
runtimeApproval: false,
publication: false,
forcePush: false,
},
};
const directionRecord = writeJson(path.join(root, 'direction.json'), direction);
const bankBase = {
schema: 'evavo.image-style-reference-bank.v1',
contract: 'evavo.executable-image-pipeline.v1',
sourceRoot: 'C:/RAW_ART',
references: [
{
sourcePath: 'RAW_ART/style/standing.png',
sourceSha256: '3'.repeat(64),
sizeBytes: 3000,
semanticRole: 'standing-character',
approvedTraits: ['crisp engraved silhouette', 'period clothing'],
approvalAuthority: 'Greg Parker',
reviewSha256: '4'.repeat(64),
features: { featureVersion: 'evavo.image-style-features.v1' },
},
{
sourcePath: 'RAW_ART/style/location.png',
sourceSha256: '5'.repeat(64),
sizeBytes: 4000,
semanticRole: 'location-background',
approvedTraits: ['front-on stage composition', 'period port specificity'],
approvalAuthority: 'Greg Parker',
reviewSha256: '6'.repeat(64),
features: { featureVersion: 'evavo.image-style-features.v1' },
},
],
roleProfiles: {
'standing-character': {},
'location-background': {},
},
effects: {
providerExecution: false,
sourceOverwrite: false,
sourceDeletion: false,
targetRepositoryMutation: false,
publication: false,
},
};
const bank = selfHash(bankBase, 'bankSha256');
const bankRecord = writeJson(path.join(root, 'style-bank.json'), bank);
const bindings = {
schema: 'evavo.raw-art-provider-artifact-bindings.v1',
status: 'ready',
gameHead,
queueSha256: queue.queueSha256,
styleBankSha256: bank.bankSha256,
styleReferenceArtifacts: [
{
sourceSha256: '3'.repeat(64),
semanticRole: 'standing-character',
artifactId: artifact('3'),
providerRole: 'direction-master',
required: true,
},
{
sourceSha256: '5'.repeat(64),
semanticRole: 'location-background',
artifactId: artifact('5'),
providerRole: 'direction-master',
required: true,
},
],
bindings: [
{
sourcePath: 'RAW_ART/characters/sailor.png',
sourceSha256: '1'.repeat(64),
creativeIntent:
'Retouch the existing sailor while preserving identity, pose and period clothing; repair only the malformed left hand.',
subject: 'The established 1871 sailor identity, full body, standing.',
baseImageArtifactId: artifact('1'),
canonicalIdentityArtifactId: artifact('7'),
quality: 'high',
candidateCount: 4,
},
],
authority: {
providerExecution: false,
runtimeSubmission: false,
sourceMutation: false,
sourceDeletion: false,
targetRepositoryMutation: false,
creativeApproval: false,
historicalApproval: false,
provenanceApproval: false,
runtimeApproval: false,
publication: false,
forcePush: false,
},
};
const bindingsRecord = writeJson(path.join(root, 'bindings.json'), bindings);
return {
gameHead,
bridgeRecord,
queueRecord,
providerMapRecord,
directionRecord,
bankRecord,
bindingsRecord,
};
}
function main() {
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evavo-raw-art-provider-'));
try {
const state = fixture(root);
const templatePath = path.join(root, 'bindings-template.json');
run([
'template',
'--queue', state.queueRecord.file,
'--bridge', state.bridgeRecord.file,
'--provider-map', state.providerMapRecord.file,
'--direction', state.directionRecord.file,
'--style-bank', state.bankRecord.file,
'--game-head', state.gameHead,
'--output', templatePath,
]);
const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
if (
template.schema !== 'evavo.raw-art-provider-artifact-bindings-template.v1' ||
template.bindings.length !== 2 ||
template.authority.providerExecution !== false
) {
throw new Error('valid artifact-binding template was not produced');
}
const batchPath = path.join(root, 'provider-batch.json');
run([
'compile',
'--queue', state.queueRecord.file,
'--bridge', state.bridgeRecord.file,
'--provider-map', state.providerMapRecord.file,
'--direction', state.directionRecord.file,
'--style-bank', state.bankRecord.file,
'--artifact-bindings', state.bindingsRecord.file,
'--maximum-orders', '25',
'--output', batchPath,
]);
const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
if (
batch.schema !== 'evavo.raw-art-provider-request-batch.v1' ||
batch.status !== 'partially-ready' ||
batch.counts.ready !== 1 ||
batch.counts.blocked !== 1 ||
batch.requests[0]?.request.operation !== 'edit' ||
batch.requests[0]?.request.assetKind !== 'sprite-frame' ||
batch.requests[0]?.request.continuityPhase !== 'repair' ||
!batch.requests[0]?.request.references.some(
(entry) => entry.role === 'canonical-identity',
) ||
!batch.requests[0]?.request.references.some(
(entry) => entry.role === 'direction-master',
) ||
batch.authority.providerExecution !== false ||
batch.authority.runtimeSubmission !== false
) {
throw new Error('valid provider request batch did not retain governed evidence');
}
if (
batch.blocked[0]?.sourceSha256 !== '2'.repeat(64) ||
!batch.blocked[0]?.reasons.includes('source-artifact-binding-missing')
) {
throw new Error('missing binding did not remain isolated as a blocker');
}
const overwrite = run([
'compile',
'--queue', state.queueRecord.file,
'--bridge', state.bridgeRecord.file,
'--provider-map', state.providerMapRecord.file,
'--direction', state.directionRecord.file,
'--style-bank', state.bankRecord.file,
'--artifact-bindings', state.bindingsRecord.file,
'--output', batchPath,
], 2);
if (!overwrite.stderr.includes('output already exists')) {
throw new Error('create-only output was not enforced');
}
const stale = JSON.parse(fs.readFileSync(state.bindingsRecord.file, 'utf8'));
stale.queueSha256 = 'f'.repeat(64);
const stalePath = path.join(root, 'stale-bindings.json');
writeJson(stalePath, stale);
const staleResult = run([
'compile',
'--queue', state.queueRecord.file,
'--bridge', state.bridgeRecord.file,
'--provider-map', state.providerMapRecord.file,
'--direction', state.directionRecord.file,
'--style-bank', state.bankRecord.file,
'--artifact-bindings', stalePath,
'--output', path.join(root, 'stale-output.json'),
], 2);
if (!staleResult.stderr.includes('stale RAW_ART provider artifact bindings')) {
throw new Error('stale queue binding was not rejected');
}
process.stdout.write('EVAVO RAW_ART provider request bridge v1\n');
process.stdout.write('- game-owned role, canvas, alpha and provider mapping passed\n');
process.stdout.write('- exact approved style-bank artifacts and immutable source bindings passed\n');
process.stdout.write('- missing evidence remains isolated without blocking unrelated ready work\n');
process.stdout.write('- provider execution, runtime submission, mutation and publication remain false\n');
} finally {
fs.rmSync(root, { recursive: true, force: true });
}
}
main();
