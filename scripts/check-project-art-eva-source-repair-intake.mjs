#!/usr/bin/env node
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = Object.freeze({
  catalogue: 'scripts/project-art/eva-source-repair-catalogue.mjs',
  intake: 'scripts/project-art/eva-source-repair-intake.mjs',
  cli: 'scripts/compile-project-art-eva-source-repair-intake.mjs',
  providerPackage:
    'scripts/project-art/eva-source-repair-provider-package.mjs',
  providerPackageCli:
    'scripts/compile-project-art-eva-source-repair-provider-package.mjs',
  providerReferences:
    'scripts/project-art/avatar-final-pass-provider-references.mjs',
  providerRuntimeConstants:
    'scripts/project-art/avatar-final-pass-provider-runtime-constants.mjs',
  providerRuntimeCli:
    'scripts/avatar-final-pass-provider-runtime-cli.mjs',
  tests: 'scripts/test-project-art-eva-source-repair-intake.mjs',
  finalPass: 'scripts/project-art/avatar-final-pass.mjs',
  docs: 'docs/PROJECT_ART_EVA_SOURCE_REPAIR_INTAKE.md',
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
  'frame.gitBlobSha1 !== task.sourceGitBlobSha1',
  'human-provider-authorization-required',
  'admit-exact-reference-artifacts',
  'record-separate-creative-approval',
  'topHatProductionMayStart: false',
  "openSync(output, 'wx', 0o600)",
]);
includes('cli', [
  '--handoff',
  '--manifest',
  '--output',
  'compileProjectArtEvaSourceRepairIntakeFile',
  'providerExecution: false',
  'candidateApproval: false',
]);
includes('tests', [
  'exact six-task handoff compiles into the existing provider boundary',
  'Git-blob, plan, manifest and authority drift fail closed',
  'file compilation is bounded and create-only',
  'human-provider-authorization-required',
  'named authorization and exact mask admissions seal one six-job provider package',
  'expired authorization, missing masks and package tampering fail closed',
]);
includes('providerPackage', [
  'evavo.project-art-eva-source-repair-provider-admissions-template.v1',
  'evavo.project-art-eva-source-repair-provider-admissions.v1',
  'evavo.project-art-eva-source-repair-provider-package.v1',
  'defect-mask',
  'MAXIMUM_AUTHORIZATION_WINDOW_MS',
  'maximumProviderCalls !== EXPECTED_TOTAL_JOBS',
  'EVA_SOURCE_REPAIR_PROVIDER_DISPATCH_AUTHORIZATION_EXPIRED',
  'EVA_SOURCE_REPAIR_PROVIDER_ARTIFACT_IDENTITY_CONFLICT',
  'compileProjectArtAvatarFinalPassProviderBatch',
  'compile-one-runtime-dispatch-per-job',
  "openSync(absolute, 'wx', 0o600)",
]);
includes('providerPackageCli', [
  "command === 'template'",
  "command === 'compile'",
  '--admissions',
  'explicitProviderSubmissionRequired: true',
  'providerExecution: false',
]);
includes('providerReferences', [
  "binding.bindingKey === 'defect-mask'",
  "prerequisiteBlockers.push('defect-mask-artifact-required')",
  "'edit-mask'",
  'The defect-mask reference is the only authorized edit region',
]);
includes('providerRuntimeConstants', [
  "'edit-mask': 'defect-mask'",
]);
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
  'two independent inspectors',
  'Top Hat Man production stays blocked',
]);

const packageJson = JSON.parse(source.package);
assert.equal(
  packageJson.scripts['project-art:eva-source-repair:check'],
  'node scripts/check-project-art-eva-source-repair-intake.mjs && node --test scripts/test-project-art-eva-source-repair-intake.mjs',
);
assert.equal(
  packageJson.scripts['project-art:eva-source-repair:provider'],
  'node scripts/compile-project-art-eva-source-repair-provider-package.mjs',
);
assert.ok(
  packageJson.scripts['project-art:check'].includes(
    'pnpm run project-art:eva-source-repair:check',
  ),
);

for (const forbidden of [
  'providerExecution: true',
  'candidateApproval: true',
  'candidatePromotion: true',
  'runtimeActivationAllowed: true',
  'topHatProductionMayStart: true',
  'force: true',
  'git push',
]) {
  assert.ok(!source.intake.includes(forbidden), `intake contains ${forbidden}`);
}

console.log('Project Art EVA source-repair intake guard passed.');
console.log('- exact Runtime tasks bind both Git SHA-1 and materialized SHA-256 identities');
console.log('- five masked edits and one endpoint-only in-between feed the existing provider chain');
console.log('- provider authorization, candidate review, publication and activation remain separate');
