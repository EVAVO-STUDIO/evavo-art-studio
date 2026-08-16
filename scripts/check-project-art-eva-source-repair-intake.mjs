#!/usr/bin/env node
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = Object.freeze({
  catalogue: 'scripts/project-art/eva-source-repair-catalogue.mjs',
  intake: 'scripts/project-art/eva-source-repair-intake.mjs',
  cli: 'scripts/compile-project-art-eva-source-repair-intake.mjs',
  providerPackage: 'scripts/project-art/eva-source-repair-provider-package.mjs',
  providerPackageCli: 'scripts/compile-project-art-eva-source-repair-provider-package.mjs',
  providerReferences: 'scripts/project-art/avatar-final-pass-provider-references.mjs',
  providerProtocol: 'scripts/project-art/avatar-final-pass-provider-protocol.mjs',
  providerRuntimeConstants: 'scripts/project-art/avatar-final-pass-provider-runtime-constants.mjs',
  providerRuntimeCli: 'scripts/avatar-final-pass-provider-runtime-cli.mjs',
  candidateAssurance: 'scripts/project-art/eva-source-repair-candidate-assurance.mjs',
  candidateAssuranceConstants: 'scripts/project-art/eva-source-repair-assurance-constants.mjs',
  candidateAssuranceCli: 'scripts/compile-project-art-eva-source-repair-candidate-assurance.mjs',
  candidateAssuranceTests: 'scripts/test-project-art-eva-source-repair-candidate-assurance.mjs',
  alphaMasteringCore: 'scripts/project-art/eva-source-repair-alpha-mastering-core.mjs',
  alphaMastering: 'scripts/project-art/eva-source-repair-alpha-mastering.mjs',
  alphaMasteringCli: 'scripts/compile-project-art-eva-source-repair-alpha-mastering.mjs',
  alphaMasteringTests: 'scripts/test-project-art-eva-source-repair-alpha-mastering-mainline.mjs',
  tests: 'scripts/test-project-art-eva-source-repair-intake.mjs',
  finalPass: 'scripts/project-art/avatar-final-pass.mjs',
  docs: 'docs/PROJECT_ART_EVA_SOURCE_REPAIR_INTAKE.md',
  candidateAssuranceDocs: 'docs/PROJECT_ART_EVA_SOURCE_REPAIR_CANDIDATE_ASSURANCE.md',
  alphaMasteringDocs: 'docs/PROJECT_ART_EVA_SOURCE_REPAIR_ALPHA_MASTERING.md',
  package: 'package.json',
});

const source = {};
for (const [label, relative] of Object.entries(files)) {
  const absolute = path.join(root, relative);
  const stat = lstatSync(absolute);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, relative);
  source[label] = readFileSync(absolute, 'utf8');
  assert.ok(source[label].length > 0 && !source[label].includes('\r'), relative);
}

function includes(label, tokens) {
  for (const token of tokens) {
    assert.ok(source[label].includes(token), `${label} missing ${token}`);
  }
}

includes('catalogue', [
  'fd96197701ad5878518d4c70dec0cfea4df06ab480cdebd7083881a8f010d831',
  'repair-eva-153620-05',
  'repair-eva-154857-04',
  'repair-eva-161524-05',
  'regenerate-wave-between-04-01',
  "scope: 'hands-only-defect-mask'",
  'preserveOutsideMask: true',
  'actualRgbaAlphaRequired: true',
]);
includes('intake', [
  'evavo.avatar.eva-source-repair-art-studio-handoff.v1',
  'evavo.project-art-eva-source-repair-intake.v1',
  'evavo.avatar.art-materialization-manifest.v2',
  'EXPECTED_FRAME_COUNT = 191',
  'media?.colourType === 2 && media.hasAlphaChannel === false',
  'media?.colourType === 6 && media.hasAlphaChannel === true',
  "media.mimeType !== 'image/png'",
  'media.bitDepth !== 8',
  'media.interlace !== 0',
  'EVA_SOURCE_REPAIR_INTAKE_JOB_FRAME_PROFILE_INVALID',
  'frame.gitBlobSha1 !== task.sourceGitBlobSha1',
  'human-provider-authorization-required',
  'admit-exact-reference-artifacts',
  'record-separate-creative-approval',
  'topHatProductionMayStart: false',
  "openSync(output, 'wx', 0o600)",
]);
includes('cli', [
  '--handoff', '--manifest', '--output',
  'compileProjectArtEvaSourceRepairIntakeFile',
  'providerExecution: false', 'candidateApproval: false',
]);
includes('tests', [
  'exact six-task handoff compiles into the existing provider boundary',
  'mixed source encodings and non-job outliers compile while invalid job media fails closed',
  '{ rgb: 152, rgba: 39 }',
  'Git-blob, plan, manifest and authority drift fail closed',
  'file compilation is bounded and create-only',
  'human-provider-authorization-required',
  'named authorization and exact mask admissions seal one six-job provider package',
  'expired authorization, missing masks and package tampering fail closed',
  'bilateralHandEnvelopePassed',
  'EVA_SOURCE_REPAIR_PROVIDER_MASK_ASSURANCE_INVALID',
]);
includes('providerPackage', [
  'evavo.project-art-eva-source-repair-provider-admissions-template.v1',
  'evavo.project-art-eva-source-repair-provider-admissions.v1',
  'evavo.project-art-eva-source-repair-provider-package.v1',
  'defect-mask', 'maskAssurance', 'sealed-eva-source-repair-intake',
  'EVA_SOURCE_REPAIR_PROVIDER_MASK_ASSURANCE_INVALID',
  'MAXIMUM_AUTHORIZATION_WINDOW_MS',
  'maximumProviderCalls !== EXPECTED_TOTAL_JOBS',
  'EVA_SOURCE_REPAIR_PROVIDER_DISPATCH_AUTHORIZATION_EXPIRED',
  'EVA_SOURCE_REPAIR_PROVIDER_ARTIFACT_IDENTITY_CONFLICT',
  'compileProjectArtAvatarFinalPassProviderBatch',
  'compile-one-runtime-dispatch-per-job',
  "openSync(absolute, 'wx', 0o600)",
]);
includes('providerPackageCli', [
  "command === 'template'", "command === 'compile'", '--admissions',
  'explicitProviderSubmissionRequired: true', 'providerExecution: false',
]);
includes('providerReferences', [
  "binding.bindingKey === 'defect-mask'",
  "prerequisiteBlockers.push('defect-mask-artifact-required')",
  "'edit-mask'",
  'The defect-mask reference is the only authorized edit region',
  "plan.sessionId === 'eva-source-repair-v1'",
  'production alpha mastering is a separate downstream gate',
]);
includes('providerProtocol', [
  "admitted.role === 'edit-mask' ? 'mask'",
  "transparency: sourceSpaceRepair ? 'opaque' : 'required'",
  "strategy: sourceSpaceRepair ? 'opaque-source' : 'native-alpha'",
]);
includes('providerRuntimeConstants', ["'edit-mask': 'defect-mask'", "mask: 'mask'"]);
includes('providerRuntimeCli', [
  'dispatch-package',
  'parseProjectArtEvaSourceRepairProviderPackageForDispatch',
  'sourcePackageSha256',
]);
includes('finalPass', [
  'evavo.avatar.art-materialization-manifest.v1',
  'evavo.avatar.art-materialization-manifest.v2',
  'MATERIALIZATION_SCHEMAS.has(value.schema)',
]);
includes('docs', [
  '# Project Art EVA source-repair intake',
  'Git-blob SHA-1',
  'five `provider-redraw` jobs',
  'one `provider-generated-inbetween` job',
  'mixed RGB and RGBA source encodings',
  'five known non-job dimension outliers',
  'true 8-bit RGBA source-space candidates',
  'public `mask` role',
  'zero changed RGBA pixels outside it',
  'two independent inspectors',
  'Top Hat Man production stays blocked',
]);
includes('candidateAssurance', [
  'evavo.project-art-eva-source-repair-mask-assurance.v1',
  'evavo.project-art-eva-source-repair-candidate-assurance.v1',
  'EVA_SOURCE_REPAIR_HAND_ENVELOPES',
  'transparent-black-protected__opaque-white-editable',
  'EVA_SOURCE_REPAIR_ASSURANCE_MASK_COMPONENT_COUNT_INVALID',
  'EVA_SOURCE_REPAIR_ASSURANCE_MASK_ENVELOPE_INVALID',
  'EVA_SOURCE_REPAIR_ASSURANCE_PROTECTED_PIXEL_CHANGED',
  'changedProtectedPixels', 'alphaMasteringRequired', 'productionAlphaReady',
  'sealed-eva-source-repair-intake',
  'inspectEvaSourceRepairCandidateUnboundFileForTesting',
  "openSync(absolute, 'wx', 0o600)",
]);
includes('candidateAssuranceConstants', [
  'EVA_SOURCE_REPAIR_HAND_ENVELOPES',
  'eva-20260809-153620-frame-05',
  'eva-20260809-154001-frame-05',
  'eva-20260809-154325-frame-05',
  'eva-20260809-154857-frame-04',
  'eva-20260809-161524-frame-05',
]);
includes('candidateAssuranceCli', [
  "['mask', 'candidate']", '--intake', '--mask-sha256', '--candidate-sha256',
  'candidateApproval: false', 'runtimeActivationAllowed: false',
]);
includes('candidateAssuranceTests', [
  'one changed protected pixel fails closed',
  'mask components outside the reviewed hand envelopes fail closed',
  'partial-alpha, grey and hidden-RGB mask pixels fail closed',
  'permission-restricted and create-only without dispatch authority',
]);
includes('candidateAssuranceDocs', [
  '# Project Art EVA source-repair candidate assurance',
  'exact invariance outside the mask',
  '`target.transparency: opaque`',
  '`background.strategy: opaque-source`',
  'cannot substitute an arbitrary source',
  'Agent-sized control surface',
]);
includes('alphaMasteringCore', [
  'evavo.project-art-eva-source-repair-alpha-mastering.v1',
  'source-space-to-production-alpha',
  'apply-production-alpha-once',
  'EVA_SOURCE_REPAIR_ALPHA_SOURCE_SPACE_CANDIDATE_INVALID',
  'EVA_SOURCE_REPAIR_ALPHA_MATTE_RGB_INVALID',
  'EVA_SOURCE_REPAIR_ALPHA_MATTE_PROFILE_INVALID',
  'EVA_SOURCE_REPAIR_ALPHA_VISIBLE_RGB_DRIFT',
  'visibleRgbMismatches',
  'alphaPlaneMatchesMatte',
  'transparentRgbCleanPassed',
  'frameFinisherCompatibleHandoff',
  'createOnlyTransactionalBundle',
]);
includes('alphaMastering', [
  'strictProviderDocuments',
  'MATERIALIZATION_TRUE_KEYS',
  'inputSnapshotsBeforeExecution: true',
  'providerReceiptShapeValidated: true',
  'providerAuthorityValidated: true',
  'providerChronologyValidated: true',
  'providerByteCountsValidated: true',
  'rehashedTopLevelAndAuthorityDriftRejected: true',
  "alphaAssociation: 'straight'",
  'premultiplied: false',
]);
includes('alphaMasteringCli', [
  '--candidate-assurance', '--provider-materialization',
  '--provider-finisher-request', '--alpha-matte-sha256',
  'apply-production-alpha-once', 'candidateApproval: false',
  'sequenceReleaseAllowed: false', 'runtimeActivationAllowed: false',
]);
includes('alphaMasteringTests', [
  'strict mainline boundary compiles one source-space candidate into production alpha',
  'rehashed provider authority, byte-count, commit and chronology drift fail closed',
  'freshly rehashed report authority and unknown top-level fields fail closed',
  'inspectAvatarProviderCandidatePng',
]);
includes('alphaMasteringDocs', [
  '# Project Art EVA source-repair alpha mastering',
  'fully opaque RGBA source-space candidates',
  'alpha 0:   RGB must be 0,0,0',
  'alpha > 0: RGB must be 255,255,255',
  'visible RGB mismatches',
  'Technical alpha readiness is not creative approval.',
]);

const packageJson = JSON.parse(source.package);
assert.equal(
  packageJson.scripts['project-art:eva-source-repair:check'],
  'node scripts/check-project-art-eva-source-repair-intake.mjs && node --test scripts/test-project-art-eva-source-repair-intake.mjs scripts/test-project-art-eva-source-repair-candidate-assurance.mjs',
);
assert.equal(
  packageJson.scripts['project-art:eva-source-repair:provider'],
  'node scripts/compile-project-art-eva-source-repair-provider-package.mjs',
);
assert.equal(
  packageJson.scripts['project-art:eva-source-repair:assurance'],
  'node scripts/compile-project-art-eva-source-repair-candidate-assurance.mjs',
);
assert.ok(packageJson.scripts['project-art:check'].includes('pnpm run project-art:eva-source-repair:check'));

for (const forbidden of [
  'providerExecution: true', 'candidateApproval: true', 'candidatePromotion: true',
  'runtimeActivationAllowed: true', 'topHatProductionMayStart: true',
  'force: true', 'git push',
]) {
  assert.ok(!source.intake.includes(forbidden), `intake contains ${forbidden}`);
}
for (const label of ['alphaMastering', 'alphaMasteringCore']) {
  for (const forbidden of [
    'candidateApproval: true', 'candidatePromotion: true',
    'sequenceReleaseAllowed: true', 'runtimeActivationAllowed: true',
    'publicationAllowed: true', 'forcePush: true', 'git push',
  ]) {
    assert.ok(!source[label].includes(forbidden), `${label} contains ${forbidden}`);
  }
}

const alphaTest = spawnSync(
  process.execPath,
  ['--test', path.join(root, files.alphaMasteringTests)],
  { cwd: root, encoding: 'utf8' },
);
assert.equal(
  alphaTest.status,
  0,
  `alpha mastering mainline regressions failed\n${alphaTest.stdout}\n${alphaTest.stderr}`,
);

console.log('Project Art EVA source-repair intake guard passed.');
console.log('- exact Runtime tasks bind both Git SHA-1 and materialized SHA-256 identities');
console.log('- five masked edits and one endpoint-only in-between feed the existing provider chain');
console.log('- source-space redraws cross exact provider-authority and immutable-input snapshots before alpha mastering');
console.log('- provider authorization, candidate review, publication and activation remain separate');
