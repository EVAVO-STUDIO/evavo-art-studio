#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PLAN_SCHEMA = 'evavo.image-processing-plan.v2';
const RECEIPT_SCHEMA = 'evavo.image-processing-receipt.v1';
const PROCESSOR_ID = 'sharp-exact-canvas-runtime';
const PROCESSOR_VERSION = '1.0.0';
const MAXIMUM_INPUT_BYTES = 512 * 1024 * 1024;
const MAXIMUM_PIXELS = 220_000_000;
const SHA256 = /^[0-9a-f]{64}$/u;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
};
const fail = (message) => {
  throw new Error(message);
};
const inside = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};
const exists = (value) => lstat(value).then(() => true, () => false);

async function requireWorkspaceRoot(value) {
  const lexical = path.resolve(value);
  const details = await lstat(lexical).catch(() => null);
  if (!details || !details.isDirectory() || details.isSymbolicLink()) {
    fail(`workspace-root must be an existing non-symbolic directory: ${lexical}`);
  }
  return realpath(lexical);
}

async function securePath(root, value, label) {
  const lexical = path.resolve(root, value);
  if (!inside(root, lexical)) fail(`${label} escaped workspace-root`);
  let current = root;
  for (const segment of path.relative(root, lexical).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const details = await lstat(current).catch(() => null);
    if (!details) break;
    if (details.isSymbolicLink()) fail(`${label} contains a symbolic path component: ${current}`);
  }
  return lexical;
}

async function regularFile(value, label) {
  const details = await lstat(value).catch(() => null);
  if (!details || !details.isFile() || details.isSymbolicLink()) {
    fail(`${label} must be a regular file: ${value}`);
  }
}

function canonicalRelative(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\\') ||
    path.posix.isAbsolute(value)
  ) {
    fail(`${label} must be a forward-slash relative path`);
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value ||
    value === '.' ||
    value === '..' ||
    value.startsWith('../') ||
    value.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    fail(`${label} is not canonical`);
  }
  return value;
}

function parseOptions(argv) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) fail('arguments must be --name value pairs');
    if (result.has(key)) fail(`duplicate argument: ${key}`);
    result.set(key, value);
  }
  for (const required of ['--workspace-root', '--plan', '--input', '--output', '--receipt']) {
    if (!result.has(required)) fail(`missing required argument: ${required}`);
  }
  return result;
}

function parseColour(value, fallback) {
  const candidate = String(value || fallback).toLowerCase();
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/u.exec(candidate);
  if (!match) fail(`invalid #RRGGBB colour: ${candidate}`);
  return [
    Number.parseInt(match[1], 16),
    Number.parseInt(match[2], 16),
    Number.parseInt(match[3], 16),
  ];
}

function anchorOffsets(anchor, canvasWidth, canvasHeight, width, height) {
  const horizontal = anchor.includes('left')
    ? 0
    : anchor.includes('right')
      ? canvasWidth - width
      : Math.floor((canvasWidth - width) / 2);
  const vertical = anchor.includes('top')
    ? 0
    : anchor.includes('bottom')
      ? canvasHeight - height
      : Math.floor((canvasHeight - height) / 2);
  return { left: horizontal, top: vertical };
}

function alphaCounts(raw) {
  let transparentPixels = 0;
  let partialPixels = 0;
  let opaquePixels = 0;
  for (let offset = 3; offset < raw.length; offset += 4) {
    const alpha = raw[offset];
    if (alpha === 0) transparentPixels += 1;
    else if (alpha === 255) opaquePixels += 1;
    else partialPixels += 1;
  }
  return { transparentPixels, partialPixels, opaquePixels };
}

function composeCanvas(source, sourceWidth, sourceHeight, canvasWidth, canvasHeight, left, top, opaque, background) {
  const output = Buffer.alloc(canvasWidth * canvasHeight * 4);
  for (let offset = 0; offset < output.length; offset += 4) {
    output[offset] = background[0];
    output[offset + 1] = background[1];
    output[offset + 2] = background[2];
    output[offset + 3] = opaque ? 255 : 0;
  }
  for (let y = 0; y < sourceHeight; y += 1) {
    for (let x = 0; x < sourceWidth; x += 1) {
      const sourceOffset = (y * sourceWidth + x) * 4;
      const targetOffset = ((top + y) * canvasWidth + left + x) * 4;
      const alpha = source[sourceOffset + 3];
      if (!opaque) {
        source.copy(output, targetOffset, sourceOffset, sourceOffset + 4);
        continue;
      }
      const inverse = 255 - alpha;
      output[targetOffset] = Math.round((source[sourceOffset] * alpha + background[0] * inverse) / 255);
      output[targetOffset + 1] = Math.round((source[sourceOffset + 1] * alpha + background[1] * inverse) / 255);
      output[targetOffset + 2] = Math.round((source[sourceOffset + 2] * alpha + background[2] * inverse) / 255);
      output[targetOffset + 3] = 255;
    }
  }
  return output;
}

async function encode(sharp, raw, width, height, runtimeFormat) {
  let pipeline = sharp(raw, {
    raw: { width, height, channels: 4 },
    failOn: 'error',
    limitInputPixels: MAXIMUM_PIXELS,
    sequentialRead: true,
  });
  const format = runtimeFormat.toLowerCase().replace(/^\./u, '');
  if (format === 'png') {
    pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10, palette: false });
  } else if (format === 'webp') {
    pipeline = pipeline.webp({ lossless: true, quality: 100, effort: 6 });
  } else if (format === 'jpg' || format === 'jpeg') {
    pipeline = pipeline.jpeg({ quality: 95, chromaSubsampling: '4:4:4', progressive: false });
  } else {
    fail(`unsupported runtime format: ${runtimeFormat}`);
  }
  return { bytes: await pipeline.toBuffer(), format: format === 'jpg' ? 'jpeg' : format };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const workspace = await requireWorkspaceRoot(options.get('--workspace-root'));
  const planPath = await securePath(workspace, options.get('--plan'), 'plan');
  const inputPath = await securePath(workspace, options.get('--input'), 'input');
  const outputPath = await securePath(workspace, options.get('--output'), 'output');
  const receiptPath = await securePath(workspace, options.get('--receipt'), 'receipt');
  await regularFile(planPath, 'plan');
  await regularFile(inputPath, 'input');
  if (outputPath === receiptPath) fail('output and receipt paths must differ');
  if (await exists(outputPath) || await exists(receiptPath)) fail('output and receipt paths must be create-only');

  const planBytes = await readFile(planPath);
  const plan = JSON.parse(planBytes.toString('utf8'));
  if (plan.schema !== PLAN_SCHEMA) fail(`plan must use ${PLAN_SCHEMA}`);
  const unhashed = { ...plan };
  delete unhashed.planSha256;
  if (!SHA256.test(plan.planSha256 || '') || plan.planSha256 !== sha256(canonical(unhashed))) {
    fail('plan self hash mismatch');
  }
  if (plan.selectedRoute?.processorId !== PROCESSOR_ID) {
    fail(`selected route must be ${PROCESSOR_ID}`);
  }
  if (!plan.deliveryProfileId || !plan.background) {
    fail('Sharp exact-canvas processing requires deliveryProfileId and background');
  }
  const providerOperations = Array.isArray(plan.providerOperations) ? plan.providerOperations : [];
  if (providerOperations.length > 0 || plan.providerExecution !== false) {
    fail('provider operations cannot enter deterministic Sharp processing');
  }
  const supported = new Set([
    'inspect',
    'background-preserve',
    'connected-matte-to-alpha',
    'luminance-to-alpha',
    'canvas-normalize',
    'resize',
    'convert',
    'optimize',
    'alpha-analyze',
    'edge-decontaminate',
    'hidden-rgb-rebuild',
    'palette-normalize',
  ]);
  const operations = Array.isArray(plan.deterministicOperations) ? plan.deterministicOperations : [];
  const unsupported = operations.filter((operation) => !supported.has(operation));
  if (unsupported.length > 0) fail(`Sharp exact-canvas processor does not support: ${unsupported.join(', ')}`);

  const sourceBytes = await readFile(inputPath);
  if (sourceBytes.length < 1 || sourceBytes.length > MAXIMUM_INPUT_BYTES) fail('source byte length is invalid');
  const sourceSha256 = sha256(sourceBytes);
  if (sourceSha256 !== plan.sourceSha256) fail('source SHA-256 does not match the plan');
  if (plan.sourceBytes !== undefined && plan.sourceBytes !== sourceBytes.length) fail('source byte length does not match the plan');
  canonicalRelative(plan.sourcePath, 'sourcePath');
  canonicalRelative(plan.targetPath, 'targetPath');

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const optimizerEntry = path.join(repoRoot, 'packages', 'delivery-optimizer', 'dist', 'index.js');
  await regularFile(optimizerEntry, 'built delivery optimizer entrypoint');
  const packageJson = path.join(repoRoot, 'packages', 'delivery-optimizer', 'package.json');
  await regularFile(packageJson, 'delivery optimizer package manifest');
  const requireFromOptimizer = createRequire(pathToFileURL(packageJson));
  const sharpModule = requireFromOptimizer('sharp');
  const sharp = sharpModule.default || sharpModule;
  const optimizer = await import(pathToFileURL(optimizerEntry).href);
  if (typeof optimizer.optimizeDeliveryImage !== 'function') fail('delivery optimizer export is unavailable');

  const sourceMetadata = await sharp(sourceBytes, {
    failOn: 'error',
    limitInputPixels: MAXIMUM_PIXELS,
    sequentialRead: true,
  }).metadata();
  const optimized = await optimizer.optimizeDeliveryImage(sourceBytes, {
    profileId: plan.deliveryProfileId,
    background: plan.background,
  });
  let decoded = await sharp(optimized.bytes, {
    failOn: 'error',
    limitInputPixels: MAXIMUM_PIXELS,
    sequentialRead: true,
  })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let width = decoded.info.width;
  let height = decoded.info.height;
  let raw = Buffer.from(decoded.data);
  const target = plan.targetCanvas || {};
  const targetWidth = Number(target.width);
  const targetHeight = Number(target.height);
  if (!Number.isSafeInteger(targetWidth) || !Number.isSafeInteger(targetHeight) || targetWidth < 1 || targetHeight < 1) {
    fail('targetCanvas must contain positive integer width and height');
  }
  const processorOptions = plan.processorOptions || {};
  const allowUpscale = processorOptions.allowUpscale === true;
  let resized = false;
  if (
    width > targetWidth ||
    height > targetHeight ||
    (allowUpscale && (width < targetWidth || height < targetHeight))
  ) {
    decoded = await sharp(raw, {
      raw: { width, height, channels: 4 },
      failOn: 'error',
      limitInputPixels: MAXIMUM_PIXELS,
      sequentialRead: true,
    })
      .resize({
        width: targetWidth,
        height: targetHeight,
        fit: 'inside',
        withoutEnlargement: !allowUpscale,
        kernel: sharp.kernel.lanczos3,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });
    width = decoded.info.width;
    height = decoded.info.height;
    raw = Buffer.from(decoded.data);
    resized = true;
  }
  if (width > targetWidth || height > targetHeight) fail('prepared source does not fit the target canvas');
  const alphaPolicy = String(plan.alphaPolicy || '').toLowerCase();
  const opaque = alphaPolicy.includes('opaque') || alphaPolicy.includes('black-stage');
  const background = parseColour(processorOptions.canvasColour, '#000000');
  const anchor = String(processorOptions.anchor || 'centre').toLowerCase();
  if (!['centre', 'bottom-centre', 'top-centre', 'centre-left', 'centre-right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(anchor)) {
    fail(`unsupported canvas anchor: ${anchor}`);
  }
  const offsets = anchorOffsets(anchor, targetWidth, targetHeight, width, height);
  const canvas = composeCanvas(raw, width, height, targetWidth, targetHeight, offsets.left, offsets.top, opaque, background);
  const outputAlpha = alphaCounts(canvas);
  if (
    alphaPolicy.includes('meaningful') &&
    outputAlpha.transparentPixels + outputAlpha.partialPixels === 0
  ) {
    fail('meaningful transparency is required but the exact-canvas output is opaque');
  }
  const encoded = await encode(sharp, canvas, targetWidth, targetHeight, plan.runtimeFormat);
  const expectedExtension = encoded.format === 'jpeg' ? new Set(['.jpg', '.jpeg']) : new Set([`.${encoded.format}`]);
  if (!expectedExtension.has(path.extname(outputPath).toLowerCase())) {
    fail('output path extension differs from runtimeFormat');
  }
  const finalMetadata = await sharp(encoded.bytes, {
    failOn: 'error',
    limitInputPixels: MAXIMUM_PIXELS,
    sequentialRead: true,
  }).metadata();
  if (finalMetadata.width !== targetWidth || finalMetadata.height !== targetHeight) {
    fail('encoded output lost the exact target canvas');
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, encoded.bytes, { flag: 'wx' });
  const outputDetails = await stat(outputPath);
  const receipt = {
    schema: RECEIPT_SCHEMA,
    processor: {
      id: PROCESSOR_ID,
      version: PROCESSOR_VERSION,
      node: process.version,
      sharp: sharp.versions?.sharp || null,
    },
    planSha256: plan.planSha256,
    source: {
      path: plan.sourcePath,
      sha256: sourceSha256,
      bytes: sourceBytes.length,
      dimensions: { width: sourceMetadata.width, height: sourceMetadata.height },
      format: sourceMetadata.format || null,
      hasAlpha: sourceMetadata.hasAlpha === true,
    },
    output: {
      path: outputPath,
      sha256: sha256(encoded.bytes),
      bytes: outputDetails.size,
      dimensions: { width: targetWidth, height: targetHeight },
      alpha: outputAlpha,
      format: encoded.format,
    },
    targetPath: plan.targetPath,
    operations,
    exactCanvasRequired: plan.exactCanvasRequired === true,
    canvas: {
      width: targetWidth,
      height: targetHeight,
      contentWidth: width,
      contentHeight: height,
      left: offsets.left,
      top: offsets.top,
      anchor,
      resized,
      allowUpscale,
      opaque,
    },
    optimizerEvidence: optimized.evidence,
    createOnlyOutput: true,
    sourceOverwrite: false,
    providerExecution: false,
    publication: false,
  };
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({
    status: 'passed',
    processor: PROCESSOR_ID,
    output: outputPath,
    receipt: receiptPath,
    outputSha256: receipt.output.sha256,
  }));
}

main().catch(async (error) => {
  const options = (() => {
    try {
      return parseOptions(process.argv.slice(2));
    } catch {
      return null;
    }
  })();
  if (options) {
    for (const key of ['--output', '--receipt']) {
      try {
        const workspace = await requireWorkspaceRoot(options.get('--workspace-root'));
        const target = await securePath(workspace, options.get(key), key);
        if (await exists(target)) await rm(target, { recursive: false, force: true });
      } catch {
        // Never broaden cleanup beyond an admitted workspace path.
      }
    }
  }
  console.error(`Sharp exact-canvas processing failed: ${error.message}`);
  process.exitCode = 2;
});
