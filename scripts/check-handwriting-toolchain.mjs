import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fragmentPaths = [
  path.join(root, 'evavo.tasks.d', 'document-ink-finishing.json'),
  path.join(root, 'evavo.tasks.d', 'handwriting-coverage.json'),
  path.join(root, 'evavo.tasks.d', 'handwriting-capture-spec.json'),
  path.join(root, 'evavo.tasks.d', 'handwriting-capture-gap.json'),
  path.join(root, 'evavo.tasks.d', 'handwriting-capture-sheet.json'),
  path.join(root, 'evavo.tasks.d', 'handwriting-capture-register.json'),
  path.join(root, 'evavo.tasks.d', 'handwriting-fiducial-detect.json'),
  path.join(root, 'evavo.tasks.d', 'handwriting-registration-review.json'),
  path.join(root, 'evavo.tasks.d', 'handwriting-multiline.json'),
];
const requiredFiles = [
  'tools/document_ink_finisher.py',
  'tools/handwriting_atlas.py',
  'tools/handwriting_multiline.py',
  'tools/handwriting_whole_mark.py',
  'tools/handwriting_document_bridge.py',
  'tools/handwriting_coverage.py',
  'tools/handwriting_capture_spec.py',
  'tools/handwriting_capture_gap.py',
  'tools/handwriting_capture_sheet.py',
  'tools/handwriting_capture_register.py',
  'tools/handwriting_fiducial_detect.py',
  'tools/handwriting_registration_review.py',
  'contracts/handwriting-document-export.v1.schema.json',
  'contracts/handwriting-photo-registration.v1.schema.json',
  'contracts/handwriting-registration-review.v1.schema.json',
  'scripts/check-handwriting-all.mjs',
  'scripts/test_document_ink_finisher.py',
  'scripts/test_handwriting_atlas.py',
  'scripts/test_handwriting_multiline.py',
  'scripts/test_handwriting_whole_mark.py',
  'scripts/test_handwriting_document_bridge.py',
  'scripts/test_handwriting_coverage.py',
  'scripts/test_handwriting_capture_spec.py',
  'scripts/test_handwriting_capture_gap.py',
  'scripts/test_handwriting_capture_sheet.py',
  'scripts/test_handwriting_capture_register.py',
  'scripts/test_handwriting_fiducial_detect.py',
  'scripts/test_handwriting_registration_review.py',
  'scripts/test_handwriting_export_contract.py',
  'docs/DOCUMENT_INK_FINISHING.md',
];
for (const relative of requiredFiles) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`missing handwriting toolchain file: ${relative}`);
}
const exportContract = JSON.parse(fs.readFileSync(path.join(root, 'contracts', 'handwriting-document-export.v1.schema.json'), 'utf8'));
if (exportContract?.properties?.schema?.const !== 'evavo.art-studio.document-personal-marks-export.v1') throw new Error('handwriting export contract schema identity is invalid');
const truth = exportContract?.properties?.truthBoundary?.properties;
if (!truth || truth.signatureSynthesizedFromGlyphs?.const !== false || truth.requiresDocumentStudioApprovalForPdfExecution?.const !== true) throw new Error('handwriting export contract weakened signature/document approval boundary');
const registrationContract = JSON.parse(fs.readFileSync(path.join(root, 'contracts', 'handwriting-photo-registration.v1.schema.json'), 'utf8'));
if (registrationContract?.properties?.schema?.const !== 'evavo.art-studio.handwriting-photo-registration.v1') throw new Error('handwriting registration contract schema identity is invalid');
for (const corner of ['topLeft', 'topRight', 'bottomRight', 'bottomLeft']) {
  if (!registrationContract?.properties?.cornersPx?.properties?.[corner]) throw new Error(`handwriting registration contract is missing ${corner}`);
}
const detectionEvidence = registrationContract?.properties?.detectionEvidence?.properties;
if (!detectionEvidence || detectionEvidence.method?.const !== 'solid-square-fiducials-v1' || detectionEvidence.manualReviewRequired?.const !== true) throw new Error('handwriting registration contract weakened fiducial review evidence');
const reviewEvidenceSchema = registrationContract?.properties?.reviewEvidence;
const reviewEvidence = reviewEvidenceSchema?.properties;
if (!reviewEvidence || reviewEvidence.decision?.const !== 'accept' || reviewEvidence.manualReviewCompleted?.const !== true) throw new Error('handwriting registration contract weakened completed-review evidence');
if (!Array.isArray(reviewEvidenceSchema?.required) || !reviewEvidenceSchema.required.includes('proposalSha256') || !reviewEvidenceSchema.required.includes('reviewArtifactSha256')) throw new Error('handwriting registration contract must bind proposal and review artifact digests');
const reviewContract = JSON.parse(fs.readFileSync(path.join(root, 'contracts', 'handwriting-registration-review.v1.schema.json'), 'utf8'));
if (reviewContract?.properties?.schema?.const !== 'evavo.art-studio.handwriting-registration-review.v1' || reviewContract?.properties?.decision?.const !== 'accept') throw new Error('handwriting registration review contract identity/decision is invalid');
const allTasks = {};
for (const fragmentPath of fragmentPaths) {
  if (!fs.existsSync(fragmentPath)) throw new Error(`missing handwriting task fragment: ${path.relative(root, fragmentPath)}`);
  const fragment = JSON.parse(fs.readFileSync(fragmentPath, 'utf8'));
  if (fragment.kind !== 'evavo-repository-task-manifest-fragment' || fragment.repository !== 'evavo-art-studio') throw new Error(`handwriting task fragment identity is invalid: ${path.relative(root, fragmentPath)}`);
  if (!fragment.tasks || typeof fragment.tasks !== 'object' || Array.isArray(fragment.tasks)) throw new Error(`handwriting task fragment tasks must be an object: ${path.relative(root, fragmentPath)}`);
  for (const [name, task] of Object.entries(fragment.tasks)) {
    if (allTasks[name]) throw new Error(`duplicate handwriting task across fragments: ${name}`);
    allTasks[name] = task;
  }
}
const requiredTasks = new Map([
  ['document-ink-extract-photo', ['tools/document_ink_finisher.py', true]],
  ['document-ink-master', ['tools/document_ink_finisher.py', true]],
  ['document-ink-integrate', ['tools/document_ink_finisher.py', true]],
  ['handwriting-atlas-build', ['tools/handwriting_atlas.py', true]],
  ['handwriting-atlas-render', ['tools/handwriting_atlas.py', true]],
  ['handwriting-multiline-render', ['tools/handwriting_multiline.py', true]],
  ['handwriting-atlas-coverage', ['tools/handwriting_coverage.py', false]],
  ['handwriting-capture-spec', ['tools/handwriting_capture_spec.py', true]],
  ['handwriting-capture-gap', ['tools/handwriting_capture_gap.py', true]],
  ['handwriting-capture-sheet', ['tools/handwriting_capture_sheet.py', true]],
  ['handwriting-capture-register', ['tools/handwriting_capture_register.py', true]],
  ['handwriting-fiducial-detect', ['tools/handwriting_fiducial_detect.py', true]],
  ['handwriting-registration-review', ['tools/handwriting_registration_review.py', true]],
  ['handwriting-whole-mark-select', ['tools/handwriting_atlas.py', false]],
  ['handwriting-whole-mark-render', ['tools/handwriting_whole_mark.py', true]],
  ['handwriting-document-export', ['tools/handwriting_document_bridge.py', true]],
]);
for (const [name, [entry, mustCreateOutput]] of requiredTasks) {
  const task = allTasks[name];
  if (!task) throw new Error(`missing handwriting task: ${name}`);
  if (task.runtime !== 'python-script' || task.pythonEnvironment !== 'image-finishing' || task.entry !== entry) throw new Error(`unsafe handwriting task binding: ${name}`);
  if (task.network !== 'disabled') throw new Error(`network must be disabled for ${name}`);
  const schema = task.parameterSchema;
  if (!schema || schema.schemaVersion !== 1 || schema.additionalProperties !== false) throw new Error(`strict parameter schema required for ${name}`);
  const args = Array.isArray(task.arguments) ? task.arguments.map((value) => String(value).toLowerCase()) : [];
  if (args.some((value) => ['--approve', '--approved', 'approved=true'].includes(value))) throw new Error(`task ${name} must not grant approval authority`);
  const outputs = task.parameterOutputs;
  if (!Array.isArray(outputs)) throw new Error(`parameterOutputs must be an array for ${name}`);
  if (mustCreateOutput && outputs.length < 1) throw new Error(`create-only task ${name} requires explicit outputs`);
  if (!mustCreateOutput && outputs.length !== 0) throw new Error(`read-only task ${name} must not claim file outputs`);
}
const descriptions = Object.values(allTasks).map((task) => String(task.description ?? '').toLowerCase()).join('\n');
if (!descriptions.includes('never synthesizes signatures') && !descriptions.includes('never synthesizes signatures from glyphs')) throw new Error('handwriting task descriptions must preserve the whole-signature boundary');
const fiducialDescription = String(allTasks['handwriting-fiducial-detect']?.description ?? '').toLowerCase();
if (!fiducialDescription.includes('review-required') || !fiducialDescription.includes('fails closed')) throw new Error('fiducial detector must preserve review/fail-closed boundary');
const registrationReviewDescription = String(allTasks['handwriting-registration-review']?.description ?? '').toLowerCase();
if (!registrationReviewDescription.includes('proposal sha-256') || !registrationReviewDescription.includes('review')) throw new Error('registration review task must remain proposal-digest bound');
const multilineDescription = String(allTasks['handwriting-multiline-render']?.description ?? '').toLowerCase();
if (!multilineDescription.includes('genuine') || !multilineDescription.includes('fail closed') || !multilineDescription.includes('no font fallback')) throw new Error('multiline handwriting task must preserve genuine/fail-closed rendering boundary');
console.log(JSON.stringify({
  ok: true,
  fragments: fragmentPaths.map((item) => path.relative(root, item).replaceAll('\\', '/')),
  exportContract: 'contracts/handwriting-document-export.v1.schema.json',
  registrationContract: 'contracts/handwriting-photo-registration.v1.schema.json',
  registrationReviewContract: 'contracts/handwriting-registration-review.v1.schema.json',
  requiredTasks: [...requiredTasks.keys()],
  requiredFiles,
  networkUsed: false,
  signingApprovalAuthority: false,
}, null, 2));
