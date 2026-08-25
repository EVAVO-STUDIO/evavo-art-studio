import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fragmentPath = path.join(root, 'evavo.tasks.d', 'handwriting-realistic-render.json');
const requiredFiles = [
  'tools/handwriting_realistic_render.py',
  'tools/handwriting_balanced_multiline.py',
  'tools/handwriting_balanced_paragraph.py',
  'scripts/test_handwriting_realistic_render.py',
  'scripts/test_handwriting_balanced_wrappers.py',
  'evavo.tasks.d/handwriting-realistic-render.json',
];
for (const relative of requiredFiles) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`missing realistic handwriting file: ${relative}`);
}
const fragment = JSON.parse(fs.readFileSync(fragmentPath, 'utf8'));
if (fragment.kind !== 'evavo-repository-task-manifest-fragment' || fragment.repository !== 'evavo-art-studio') {
  throw new Error('realistic handwriting task fragment identity is invalid');
}
const expected = new Map([
  ['handwriting-realistic-render', 'tools/handwriting_realistic_render.py'],
  ['handwriting-realistic-multiline-render', 'tools/handwriting_balanced_multiline.py'],
  ['handwriting-realistic-paragraph-render', 'tools/handwriting_balanced_paragraph.py'],
]);
for (const [name, entry] of expected) {
  const task = fragment.tasks?.[name];
  if (!task) throw new Error(`missing preferred realistic handwriting task: ${name}`);
  if (task.runtime !== 'python-script' || task.pythonEnvironment !== 'image-finishing' || task.entry !== entry) {
    throw new Error(`unsafe preferred realistic handwriting binding: ${name}`);
  }
  if (task.network !== 'disabled') throw new Error(`network must be disabled for ${name}`);
  if (!Array.isArray(task.parameterOutputs) || task.parameterOutputs.length !== 3) {
    throw new Error(`${name} must explicitly create output, proof and receipt`);
  }
  const schema = task.parameterSchema;
  if (!schema || schema.schemaVersion !== 1 || schema.additionalProperties !== false) {
    throw new Error(`strict parameter schema required for ${name}`);
  }
  const description = String(task.description ?? '').toLowerCase();
  if (!description.includes('genuine') || (!description.includes('no computer-font fallback') && !description.includes('no font fallback'))) {
    throw new Error(`${name} must preserve genuine/no-font-fallback policy`);
  }
}
const single = String(fragment.tasks['handwriting-realistic-render']?.description ?? '').toLowerCase();
if (!single.includes('shuffled bags') || !single.includes('every available variant is used before refill')) {
  throw new Error('preferred single-line renderer must preserve balanced genuine variant bags');
}
const paragraph = String(fragment.tasks['handwriting-realistic-paragraph-render']?.description ?? '').toLowerCase();
if (!paragraph.includes('refuses arbitrary word splitting')) {
  throw new Error('preferred paragraph renderer must preserve safe word boundaries');
}
console.log(JSON.stringify({
  ok: true,
  fragment: 'evavo.tasks.d/handwriting-realistic-render.json',
  requiredTasks: [...expected.keys()],
  requiredFiles,
  networkUsed: false,
  fontFallbackUsed: false,
  syntheticHandwritingGenerated: false,
}, null, 2));
