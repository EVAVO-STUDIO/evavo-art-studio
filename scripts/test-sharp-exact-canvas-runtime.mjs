#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const processor = path.join(root, 'tools', 'process_image_with_sharp.mjs');
const packageJson = path.join(root, 'packages', 'delivery-optimizer', 'package.json');
const requireFromOptimizer = createRequire(pathToFileURL(packageJson));
const sharpModule = requireFromOptimizer('sharp');
const sharp = sharpModule.default || sharpModule;
const temporary = await mkdtemp(path.join(os.tmpdir(), 'evavo-sharp-exact-runtime-'));
const workspace = path.join(temporary, 'workspace');
await mkdir(path.join(workspace, 'source'), { recursive: true });
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
};
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
try {
  const raw = Buffer.alloc(16 * 32 * 4);
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const offset = (y * 16 + x) * 4;
      const subject = x >= 4 && x <= 11 && y >= 4 && y <= 31;
      raw[offset] = subject ? 220 : 0;
      raw[offset + 1] = subject ? 220 : 0;
      raw[offset + 2] = subject ? 220 : 0;
      raw[offset + 3] = subject ? 255 : 0;
    }
  }
  const source = await sharp(raw, { raw: { width: 16, height: 32, channels: 4 } }).png().toBuffer();
  const sourcePath = path.join(workspace, 'source', 'character.png');
  await writeFile(sourcePath, source);
  const plan = {
    schema: 'evavo.image-processing-plan.v2',
    sourcePath: 'source/character.png',
    sourceSha256: sha256(source),
    sourceBytes: source.length,
    targetPath: 'assets/art/character.png',
    decision: 'keep',
    productionDecision: 'deterministic-processing',
    semanticRole: 'standing-character',
    targetCanvas: { width: 64, height: 64 },
    alphaPolicy: 'meaningful-alpha-required',
    runtimeFormat: 'png',
    exactCanvasRequired: true,
    deliveryProfileId: 'godot-sprite-lossless',
    background: { mode: 'preserve' },
    operations: ['inspect', 'background-preserve', 'canvas-normalize', 'alpha-analyze', 'convert', 'optimize'],
    deterministicOperations: ['inspect', 'background-preserve', 'canvas-normalize', 'alpha-analyze', 'convert', 'optimize'],
    providerOperations: [],
    routes: [{ processorId: 'sharp-exact-canvas-runtime' }],
    selectedRoute: { processorId: 'sharp-exact-canvas-runtime' },
    processorOptions: { anchor: 'bottom-centre', allowUpscale: false, canvasColour: '#000000' },
    sourceOverwrite: false,
    sourceDeletion: false,
    createOnlyOutput: true,
    lossyIntermediateAllowed: false,
    providerExecution: false,
    publication: false,
  };
  plan.planSha256 = sha256(canonical(plan));
  const planPath = path.join(workspace, 'plan.json');
  const outputPath = path.join(workspace, 'output', 'character.png');
  const receiptPath = path.join(workspace, 'receipts', 'character.json');
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  const result = spawnSync(process.execPath, [
    processor,
    '--workspace-root', workspace,
    '--plan', planPath,
    '--input', sourcePath,
    '--output', outputPath,
    '--receipt', receiptPath,
  ], { cwd: root, encoding: 'utf8', shell: false, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const metadata = await sharp(await readFile(outputPath)).metadata();
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  if (
    metadata.width !== 64 ||
    metadata.height !== 64 ||
    receipt.schema !== 'evavo.image-processing-receipt.v1' ||
    receipt.processor.id !== 'sharp-exact-canvas-runtime' ||
    receipt.canvas.top !== 32 ||
    receipt.output.alpha.transparentPixels < 1
  ) {
    throw new Error('Sharp exact-canvas receipt or output is invalid');
  }
  console.log(JSON.stringify({
    status: 'passed',
    contract: 'evavo_sharp_exact_canvas_runtime_fixture_v1',
    width: metadata.width,
    height: metadata.height,
    transparentPixels: receipt.output.alpha.transparentPixels,
    bottomAnchored: true,
  }));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
