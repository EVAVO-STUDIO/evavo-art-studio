import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fragmentPaths = [
  path.join(root, 'evavo.tasks.d', 'document-ink-finishing.json'),
  path.join(root, 'evavo.tasks.d', 'handwriting-coverage.json'),
];
const requiredFiles = [
  'tools/document_ink_finisher.py',
  'tools/handwriting_atlas.py',
  'tools/handwriting_whole_mark.py',
  'tools/handwriting_document_bridge.py',
  'tools/handwriting_coverage.py',
  'scripts/test_document_ink_finisher.py',
  'scripts/test_handwriting_atlas.py',
  'scripts/test_handwriting_whole_mark.py',
  'scripts/test_handwriting_document_bridge.py',
  'scripts/test_handwriting_coverage.py',
  'docs/DOCUMENT_INK_FINISHING.md',
];
for (const relative of requiredFiles) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`missing handwriting toolchain file: ${relative}`);
}
const allTasks = {};
for (const fragmentPath of fragmentPaths) {
  if (!fs.existsSync(fragmentPath)) throw new Error(`missing handwriting task fragment: ${path.relative(root, fragmentPath)}`);
  const fragment = JSON.parse(fs.readFileSync(fragmentPath, 'utf8'));
  if (fragment.kind !== 'evavo-repository-task-manifest-fragment' || fragment.repository !== 'evavo-art-studio') {
    throw new Error(`handwriting task fragment identity is invalid: ${path.relative(root, fragmentPath)}`);
  }
  if (!fragment.tasks || typeof fragment.tasks !== 'object' || Array.isArray(fragment.tasks)) {
    throw new Error(`handwriting task fragment tasks must be an object: ${path.relative(root, fragmentPath)}`);
  }
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
  ['handwriting-atlas-coverage', ['tools/handwriting_coverage.py', false]],
  ['handwriting-whole-mark-select', ['tools/handwriting_atlas.py', false]],
  ['handwriting-whole-mark-render', ['tools/handwriting_whole_mark.py', true]],
  ['handwriting-document-export', ['tools/handwriting_document_bridge.py', true]],
]);
for (const [name, [entry, mustCreateOutput]] of requiredTasks) {
  const task = allTasks[name];
  if (!task) throw new Error(`missing handwriting task: ${name}`);
  if (task.runtime !== 'python-script' || task.pythonEnvironment !== 'image-finishing' || task.entry !== entry) {
    throw new Error(`unsafe handwriting task binding: ${name}`);
  }
  if (task.network !== 'disabled') throw new Error(`network must be disabled for ${name}`);
  const schema = task.parameterSchema;
  if (!schema || schema.schemaVersion !== 1 || schema.additionalProperties !== false) {
    throw new Error(`strict parameter schema required for ${name}`);
  }
  const args = Array.isArray(task.arguments) ? task.arguments.map((value) => String(value).toLowerCase()) : [];
  if (args.some((value) => ['--approve', '--approved', 'approved=true'].includes(value))) {
    throw new Error(`task ${name} must not grant approval authority`);
  }
  const outputs = task.parameterOutputs;
  if (!Array.isArray(outputs)) throw new Error(`parameterOutputs must be an array for ${name}`);
  if (mustCreateOutput && outputs.length < 1) throw new Error(`create-only task ${name} requires explicit outputs`);
  if (!mustCreateOutput && outputs.length !== 0) throw new Error(`read-only task ${name} must not claim file outputs`);
}
const descriptions = Object.values(allTasks).map((task) => String(task.description ?? '').toLowerCase()).join('\n');
if (!descriptions.includes('never synthesizes signatures') && !descriptions.includes('never synthesizes signatures from glyphs')) {
  throw new Error('handwriting task descriptions must preserve the whole-signature boundary');
}
console.log(JSON.stringify({
  ok: true,
  fragments: fragmentPaths.map((item) => path.relative(root, item).replaceAll('\\', '/')),
  requiredTasks: [...requiredTasks.keys()],
  requiredFiles,
  networkUsed: false,
  signingApprovalAuthority: false,
}, null, 2));
