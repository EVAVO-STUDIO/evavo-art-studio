#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(
  await readFile(
    new URL('../config/image-processing-recipes.v1.json', import.meta.url),
    'utf8',
  ),
);
const compiler = await readFile(
  new URL('./compile-image-processing-plan.mjs', import.meta.url),
  'utf8',
);
const sharpWrapper = await readFile(
  new URL('../tools/run_art_delivery_optimizer.py', import.meta.url),
  'utf8',
);
const sharpExact = await readFile(
  new URL('../tools/process_image_with_sharp.mjs', import.meta.url),
  'utf8',
);
const pillow = await readFile(
  new URL('../tools/process_image_with_pillow.py', import.meta.url),
  'utf8',
);
const errors = [];
if (registry.schema !== 'evavo.image-processing-recipes.v2') {
  errors.push('registry identity changed');
}
for (const required of [
  'sharp-delivery-optimizer',
  'sharp-exact-canvas-runtime',
  'python-pillow-fallback',
]) {
  if (!registry.processors.some((item) => item.id === required)) {
    errors.push(`missing processor ${required}`);
  }
}
for (const capability of [
  'inspect',
  'background-preserve',
  'connected-matte-to-alpha',
  'luminance-to-alpha',
  'canvas-normalize',
  'resize',
  'convert',
  'optimize',
  'alpha-analyze',
]) {
  if (!registry.processors.some((item) => item.capabilities.includes(capability))) {
    errors.push(`missing capability ${capability}`);
  }
}
for (const token of [
  'evavo.image-processing-plan.v2',
  'selectedRoute',
  'productionDecision',
  'providerOperations',
  'deliveryProfileId',
  'background',
  'planSha256',
  'createOnlyOutput: true',
  'lossyIntermediateAllowed: false',
  'providerExecution: false',
]) {
  if (!compiler.includes(token)) errors.push(`compiler lost ${token}`);
}
for (const [label, source, tokens] of [
  [
    'Sharp wrapper',
    sharpWrapper,
    [
      'evavo.art-delivery-optimizer-wrapper-receipt.v2',
      '--workspace-root',
      'shell=False',
      'exactOutputPaths',
      'treeSha256',
      'output-root must not already exist',
      'built delivery optimizer CLI',
    ],
  ],
  [
    'Sharp exact-canvas runtime',
    sharpExact,
    [
      'evavo.image-processing-receipt.v1',
      'sharp-exact-canvas-runtime',
      'optimizeDeliveryImage',
      'canvas-normalize',
      'composeCanvas',
      'plan self hash mismatch',
      'meaningful transparency is required',
      'createOnlyOutput: true',
    ],
  ],
  [
    'Pillow fallback',
    pillow,
    [
      'evavo.image-processing-receipt.v1',
      '--workspace-root',
      'connected_matte_to_alpha',
      'luminance_to_alpha',
      'canvas_normalize',
      'exact canvas requirement was not satisfied',
      'meaningful transparency is required',
    ],
  ],
]) {
  for (const token of tokens) {
    if (!source.includes(token)) errors.push(`${label} lost ${token}`);
  }
}
for (const source of [compiler, sharpWrapper, sharpExact, pillow]) {
  for (const forbidden of ['git push', '--force-push', 'shell=True']) {
    if (source.includes(forbidden)) errors.push(`processor contains forbidden ${forbidden}`);
  }
}
if (
  registry.rules.sourceOverwriteAllowed !== false ||
  registry.rules.fallbackMustSupportEntireDeterministicOperationSet !== true ||
  registry.rules.lossyIntermediateAllowed !== false ||
  registry.rules.providerGenerationIsSeparate !== true ||
  registry.rules.humanCreativeApprovalIsSeparate !== true ||
  registry.rules.exactCanvasUsesRepositoryOwnedSharpRuntime !== true ||
  registry.rules.pythonFallbackRemainsSecondary !== true
) {
  errors.push('authority or fallback boundary changed');
}
const pythonCandidates = process.platform === 'win32'
  ? [
      ['py', ['-3']],
      ['python', []],
      ['python3', []],
    ]
  : [
      ['python3', []],
      ['python', []],
      ['py', ['-3']],
    ];
let compiled = false;
for (const [executable, prefix] of pythonCandidates) {
  const result = spawnSync(
    executable,
    [
      ...prefix,
      '-m',
      'py_compile',
      'tools/run_art_delivery_optimizer.py',
      'tools/process_image_with_pillow.py',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
    },
  );
  if (result.status === 0) {
    compiled = true;
    break;
  }
  if (result.error?.code !== 'ENOENT') {
    errors.push(`Python syntax validation failed: ${result.stderr || result.stdout}`);
    break;
  }
}
if (!compiled && !errors.some((error) => error.startsWith('Python syntax'))) {
  errors.push('No approved Python 3 executable was available for syntax validation');
}
const nodeSyntax = spawnSync(process.execPath, ['--check', 'tools/process_image_with_sharp.mjs'], {
  cwd: root,
  encoding: 'utf8',
  shell: false,
  windowsHide: true,
});
if (nodeSyntax.status !== 0) {
  errors.push(`Sharp exact-canvas syntax validation failed: ${nodeSyntax.stderr || nodeSyntax.stdout}`);
}
for (const error of errors) console.log(`  - ${error}`);
if (errors.length) process.exit(1);
console.log('EVAVO image processing recipes passed');
