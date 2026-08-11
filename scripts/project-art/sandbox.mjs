import path from 'node:path';

import {
  boundedInteger,
  boundedNumber,
  boundedString,
  canonicalRelativePath,
  fail,
  hashFileBounded,
  inspectImageFile,
  isRecord,
  mediaTypeFromPath,
  requireDirectoryNoSymlink,
  resolveExistingWithinRoot,
  safeId,
  sha256,
  timestamp,
  verifyDocumentHash,
  withDocumentHash,
} from './common.mjs';

export const PROJECT_ART_SANDBOX_REQUEST_SCHEMA = 'evavo.project-art-sandbox-request.v1';
export const PROJECT_ART_SANDBOX_PLAN_SCHEMA = 'evavo.project-art-sandbox-plan.v1';
export const PROJECT_ART_OPERATIONS_SCHEMA = 'evavo.project-art-operations.v1';

const MAXIMUM_DECODED_PIXELS = 220_000_000;
const MAXIMUM_IMAGE_DIMENSION = 65_536;
const REVIEW_LABEL_HEIGHT = 18;

const OUTPUT_EXTENSIONS = Object.freeze({
  png: new Set(['.png']),
  webp: new Set(['.webp']),
  jpeg: new Set(['.jpg', '.jpeg']),
  gif: new Set(['.gif']),
  json: new Set(['.json']),
});

function extensionFormat(targetPath) {
  const extension = path.posix.extname(targetPath).toLowerCase();
  for (const [format, extensions] of Object.entries(OUTPUT_EXTENSIONS)) {
    if (extensions.has(extension)) return format;
  }
  return null;
}

function assertAuthority(input) {
  if (input === undefined) return;
  if (!isRecord(input)) fail('PROJECT_ART_SANDBOX_AUTHORITY_INVALID', 'authority must be an object.');
  const allowed = [
    'sandboxCompilation',
    'sandboxExecution',
    'sourceMutation',
    'sourceDeletion',
    'providerExecution',
    'runtimeSubmission',
    'candidateApproval',
    'candidatePromotion',
    'targetRepositoryMutation',
    'publication',
    'deployment',
    'forcePush',
  ];
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      fail('PROJECT_ART_SANDBOX_AUTHORITY_INVALID', `Unsupported authority key: ${key}.`);
    }
    if (input[key] !== false) {
      fail('PROJECT_ART_SANDBOX_AUTHORITY_INVALID', `Request authority.${key} must be false.`);
    }
  }
}

function validateRegistry(value) {
  if (!isRecord(value) || value.schema !== PROJECT_ART_OPERATIONS_SCHEMA) {
    fail('PROJECT_ART_SANDBOX_REGISTRY_INVALID', `Operation registry must use ${PROJECT_ART_OPERATIONS_SCHEMA}.`);
  }
  if (!Array.isArray(value.operations) || !Array.isArray(value.taskKinds)) {
    fail('PROJECT_ART_SANDBOX_REGISTRY_INVALID', 'Operation registry is missing operations or taskKinds.');
  }
  const operations = new Map();
  for (const entry of value.operations) {
    if (!isRecord(entry)) fail('PROJECT_ART_SANDBOX_REGISTRY_INVALID', 'Operation entries must be objects.');
    const id = safeId(entry.id, 'operation id');
    if (operations.has(id)) fail('PROJECT_ART_SANDBOX_REGISTRY_INVALID', `Duplicate operation: ${id}.`);
    operations.set(id, {
      id,
      required: Array.isArray(entry.required)
        ? entry.required.map((item, index) => safeId(item, `${id}.required[${index}]`))
        : [],
    });
  }
  return {
    operations,
    taskKinds: new Set(value.taskKinds.map((item, index) => safeId(item, `taskKinds[${index}]`))),
    maximumTasks: boundedInteger(value.maximumTasks, 'registry.maximumTasks', 1, 100_000),
    maximumExternalSources: boundedInteger(value.maximumExternalSources, 'registry.maximumExternalSources', 1, 1_000_000),
    maximumSourceBytes: boundedInteger(value.maximumSourceBytes, 'registry.maximumSourceBytes', 1, Number.MAX_SAFE_INTEGER),
    maximumDecodedPixels: boundedInteger(
      value.maximumDecodedPixels,
      'registry.maximumDecodedPixels',
      1,
      MAXIMUM_DECODED_PIXELS,
    ),
  };
}

function assertDecodedPixelLimit(width, height, label, maximumDecodedPixels) {
  if (
    width < 1 ||
    height < 1 ||
    width > MAXIMUM_IMAGE_DIMENSION ||
    height > MAXIMUM_IMAGE_DIMENSION ||
    width * height > maximumDecodedPixels
  ) {
    fail(
      'PROJECT_ART_SANDBOX_PIXEL_LIMIT',
      `${label} exceeds the ${maximumDecodedPixels}-pixel decoded-image boundary.`,
    );
  }
}

function assertActiveDecodedPixelLimit(pixelCounts, label, maximumDecodedPixels) {
  let total = 0;
  for (const [index, value] of pixelCounts.entries()) {
    const pixels = boundedInteger(
      value,
      `${label}.pixelCounts[${index}]`,
      0,
      Number.MAX_SAFE_INTEGER,
    );
    total += pixels;
    if (total > maximumDecodedPixels) {
      fail(
        'PROJECT_ART_SANDBOX_AGGREGATE_PIXEL_LIMIT',
        `${label} exceeds the ${maximumDecodedPixels}-pixel active decoded-image boundary.`,
      );
    }
  }
  return total;
}

function normalizedOperation(value, index, registry) {
  const input = typeof value === 'string' ? { op: value } : value;
  if (!isRecord(input)) {
    fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', `operations[${index}] must be a string or object.`);
  }
  const op = safeId(input.op, `operations[${index}].op`);
  const definition = registry.operations.get(op);
  if (!definition) fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', `Unsupported operation: ${op}.`);
  const parameters = {};
  for (const [key, parameter] of Object.entries(input)) {
    if (key === 'op') continue;
    if (
      parameter === undefined ||
      typeof parameter === 'function' ||
      typeof parameter === 'symbol' ||
      typeof parameter === 'bigint'
    ) {
      fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', `${op}.${key} is not JSON-compatible.`);
    }
    parameters[key] = parameter;
  }
  for (const required of definition.required) {
    if (parameters[required] === undefined) {
      fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', `${op} requires parameter ${required}.`);
    }
  }
  if (['crop', 'pad-canvas', 'resize', 'pixel-resize'].includes(op)) {
    for (const key of ['width', 'height']) {
      if (parameters[key] !== undefined) boundedInteger(parameters[key], `${op}.${key}`, 1, 65_536);
    }
    if (parameters.width !== undefined && parameters.height !== undefined) {
      assertDecodedPixelLimit(
        parameters.width,
        parameters.height,
        op,
        registry.maximumDecodedPixels,
      );
    }
  }
  if (op === 'crop') {
    boundedInteger(parameters.x, 'crop.x', 0, 65_535);
    boundedInteger(parameters.y, 'crop.y', 0, 65_535);
  }
  if (op === 'alpha-threshold' && parameters.threshold !== undefined) {
    boundedInteger(parameters.threshold, 'alpha-threshold.threshold', 0, 255);
  }
  if (op === 'quantize' && parameters.colours !== undefined) {
    boundedInteger(parameters.colours, 'quantize.colours', 2, 256);
  }
  if (op === 'outline' && parameters.width !== undefined) {
    boundedInteger(parameters.width, 'outline.width', 1, 32);
  }
  if (op === 'levels') {
    if (parameters.blackPoint !== undefined) boundedNumber(parameters.blackPoint, 'levels.blackPoint', 0, 254);
    if (parameters.whitePoint !== undefined) boundedNumber(parameters.whitePoint, 'levels.whitePoint', 1, 255);
    if (parameters.gamma !== undefined) boundedNumber(parameters.gamma, 'levels.gamma', 0.05, 10);
  }
  if (op === 'translate') {
    if (parameters.x !== undefined) boundedInteger(parameters.x, 'translate.x', -65_536, 65_536);
    if (parameters.y !== undefined) boundedInteger(parameters.y, 'translate.y', -65_536, 65_536);
  }
  if (op === 'colour-replace') {
    if (parameters.distance !== undefined) boundedNumber(parameters.distance, 'colour-replace.distance', 0, 441);
  }
  if (['brightness', 'contrast', 'saturation', 'sharpness'].includes(op) && parameters.factor !== undefined) {
    boundedNumber(parameters.factor, `${op}.factor`, 0, 16);
  }
  if (op === 'gaussian-blur' && parameters.radius !== undefined) {
    boundedNumber(parameters.radius, 'gaussian-blur.radius', 0, 256);
  }
  if (op === 'unsharp-mask') {
    if (parameters.radius !== undefined) boundedNumber(parameters.radius, 'unsharp-mask.radius', 0, 256);
    if (parameters.percent !== undefined) boundedInteger(parameters.percent, 'unsharp-mask.percent', 0, 1000);
    if (parameters.threshold !== undefined) boundedInteger(parameters.threshold, 'unsharp-mask.threshold', 0, 255);
  }
  if (['alpha-erode', 'alpha-dilate'].includes(op) && parameters.width !== undefined) {
    boundedInteger(parameters.width, `${op}.width`, 1, 32);
  }
  return Object.freeze({ op, ...parameters });
}

function normalizedSourceDescriptor(value, label) {
  if (typeof value === 'string') {
    return { kind: 'external', path: canonicalRelativePath(value, label) };
  }
  if (!isRecord(value)) fail('PROJECT_ART_SANDBOX_SOURCE_INVALID', `${label} must be a path or source object.`);
  if (value.path !== undefined && value.taskId !== undefined) {
    fail('PROJECT_ART_SANDBOX_SOURCE_INVALID', `${label} cannot contain both path and taskId.`);
  }
  if (value.path !== undefined) {
    return {
      kind: 'external',
      path: canonicalRelativePath(value.path, `${label}.path`),
      ...(value.expectedSha256 === undefined
        ? {}
        : { expectedSha256: boundedString(value.expectedSha256, `${label}.expectedSha256`, 64) }),
    };
  }
  if (value.taskId !== undefined) {
    return {
      kind: 'task-output',
      taskId: safeId(value.taskId, `${label}.taskId`),
      ...(value.outputIndex === undefined
        ? {}
        : { outputIndex: boundedInteger(value.outputIndex, `${label}.outputIndex`, 0, 100_000) }),
    };
  }
  fail('PROJECT_ART_SANDBOX_SOURCE_INVALID', `${label} must contain path or taskId.`);
}

function normalizeTargetPath(value, label, targetClaims) {
  const target = canonicalRelativePath(value, label);
  if (target.startsWith('_evavo/')) {
    fail('PROJECT_ART_SANDBOX_TARGET_INVALID', `${label} uses the reserved _evavo namespace.`);
  }
  for (const claim of targetClaims) {
    if (claim === target || claim.startsWith(`${target}/`) || target.startsWith(`${claim}/`)) {
      fail('PROJECT_ART_SANDBOX_TARGET_DUPLICATE', `Target path overlaps another task output: ${target}.`);
    }
  }
  targetClaims.add(target);
  return target;
}

function normalizeImageTask(task, taskIndex, registry, targetClaims) {
  const targetPath = normalizeTargetPath(task.targetPath, `tasks[${taskIndex}].targetPath`, targetClaims);
  const outputFormat = task.outputFormat || extensionFormat(targetPath);
  if (!OUTPUT_EXTENSIONS[outputFormat] || !OUTPUT_EXTENSIONS[outputFormat].has(path.posix.extname(targetPath).toLowerCase())) {
    fail('PROJECT_ART_SANDBOX_TARGET_INVALID', `Image target extension does not match outputFormat: ${targetPath}.`);
  }
  if (!Array.isArray(task.operations) || task.operations.length < 1 || task.operations.length > 100) {
    fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', `tasks[${taskIndex}].operations must contain 1-100 entries.`);
  }
  const operations = task.operations.map((operation, index) => normalizedOperation(operation, index, registry));
  return {
    id: safeId(task.id, `tasks[${taskIndex}].id`),
    kind: 'image',
    source: normalizedSourceDescriptor(task.source, `tasks[${taskIndex}].source`),
    targetPath,
    outputFormat,
    operations,
    ...(task.expected === undefined ? {} : { expected: task.expected }),
  };
}

function normalizeSliceTask(task, taskIndex, registry, targetClaims) {
  const targetDirectory = normalizeTargetPath(task.targetDirectory, `tasks[${taskIndex}].targetDirectory`, targetClaims);
  const fileNamePattern = task.fileNamePattern ?? 'frame-{index}.png';
  boundedString(fileNamePattern, `tasks[${taskIndex}].fileNamePattern`, 512);
  if (!fileNamePattern.includes('{index}') || fileNamePattern.includes('/') || !fileNamePattern.endsWith('.png')) {
    fail('PROJECT_ART_SANDBOX_TASK_INVALID', 'slice-sheet fileNamePattern must contain {index}, contain no slash, and end in .png.');
  }
  const frameWidth = boundedInteger(task.frameWidth, `tasks[${taskIndex}].frameWidth`, 1, 65_536);
  const frameHeight = boundedInteger(task.frameHeight, `tasks[${taskIndex}].frameHeight`, 1, 65_536);
  assertDecodedPixelLimit(
    frameWidth,
    frameHeight,
    `tasks[${taskIndex}] frame`,
    registry.maximumDecodedPixels,
  );
  return {
    id: safeId(task.id, `tasks[${taskIndex}].id`),
    kind: 'slice-sheet',
    source: normalizedSourceDescriptor(task.source, `tasks[${taskIndex}].source`),
    targetDirectory,
    fileNamePattern,
    frameWidth,
    frameHeight,
    margin: boundedInteger(task.margin ?? 0, `tasks[${taskIndex}].margin`, 0, 65_536),
    spacing: boundedInteger(task.spacing ?? 0, `tasks[${taskIndex}].spacing`, 0, 65_536),
    ...(task.count === undefined
      ? {}
      : { count: boundedInteger(task.count, `tasks[${taskIndex}].count`, 1, 100_000) }),
    startIndex: boundedInteger(task.startIndex ?? 0, `tasks[${taskIndex}].startIndex`, 0, 1_000_000),
    rejectBlankFrames: task.rejectBlankFrames !== false,
  };
}

function normalizeSources(values, label) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 10_000) {
    fail('PROJECT_ART_SANDBOX_SOURCE_INVALID', `${label} must contain 1-10,000 sources.`);
  }
  return values.map((source, index) => normalizedSourceDescriptor(source, `${label}[${index}]`));
}

function normalizeAssembleTask(task, taskIndex, registry, targetClaims) {
  const targetPath = normalizeTargetPath(task.targetPath, `tasks[${taskIndex}].targetPath`, targetClaims);
  if (path.posix.extname(targetPath).toLowerCase() !== '.png') {
    fail('PROJECT_ART_SANDBOX_TARGET_INVALID', 'assemble-sheet targetPath must end in .png.');
  }
  const cell = task.cell === undefined ? null : task.cell;
  if (cell !== null && !isRecord(cell)) fail('PROJECT_ART_SANDBOX_TASK_INVALID', 'assemble-sheet cell must be an object.');
  const sources = normalizeSources(task.sources, `tasks[${taskIndex}].sources`);
  const columns = boundedInteger(task.columns, `tasks[${taskIndex}].columns`, 1, 10_000);
  const padding = boundedInteger(task.padding ?? 0, `tasks[${taskIndex}].padding`, 0, 4096);
  let normalizedCell;
  if (cell) {
    const width = boundedInteger(cell.width, `tasks[${taskIndex}].cell.width`, 1, 65_536);
    const height = boundedInteger(cell.height, `tasks[${taskIndex}].cell.height`, 1, 65_536);
    assertDecodedPixelLimit(
      width,
      height,
      `tasks[${taskIndex}].cell`,
      registry.maximumDecodedPixels,
    );
    normalizedCell = {
      width,
      height,
      fit: ['strict', 'contain', 'cover'].includes(cell.fit) ? cell.fit : 'strict',
      sampling: ['nearest', 'lanczos'].includes(cell.sampling) ? cell.sampling : 'nearest',
    };
    const rows = Math.ceil(sources.length / columns);
    const outputWidth = padding * 2 + columns * width;
    const outputHeight = padding * 2 + rows * height;
    assertDecodedPixelLimit(
      outputWidth,
      outputHeight,
      `tasks[${taskIndex}] assembled sheet`,
      registry.maximumDecodedPixels,
    );
  }
  return {
    id: safeId(task.id, `tasks[${taskIndex}].id`),
    kind: 'assemble-sheet',
    sources,
    targetPath,
    columns,
    ...(normalizedCell ? { cell: normalizedCell } : {}),
    padding,
    background: task.background ?? '#00000000',
  };
}


function normalizeCompositeTask(task, taskIndex, targetClaims, registry) {
  const targetPath = normalizeTargetPath(task.targetPath, `tasks[${taskIndex}].targetPath`, targetClaims);
  const outputFormat = task.outputFormat || extensionFormat(targetPath);
  if (!['png', 'webp', 'jpeg'].includes(outputFormat) || !OUTPUT_EXTENSIONS[outputFormat]?.has(path.posix.extname(targetPath).toLowerCase())) {
    fail('PROJECT_ART_SANDBOX_TARGET_INVALID', `Composite target extension does not match outputFormat: ${targetPath}.`);
  }
  const sources = normalizeSources(task.sources, `tasks[${taskIndex}].sources`);
  if (sources.length > 128) {
    fail('PROJECT_ART_SANDBOX_SOURCE_INVALID', `tasks[${taskIndex}].sources must contain at most 128 images.`);
  }
  if (!Array.isArray(task.layers) || task.layers.length < 1 || task.layers.length > 128) {
    fail('PROJECT_ART_SANDBOX_TASK_INVALID', `tasks[${taskIndex}].layers must contain 1-128 entries.`);
  }
  const layers = task.layers.map((layer, layerIndex) => {
    if (!isRecord(layer)) fail('PROJECT_ART_SANDBOX_TASK_INVALID', `tasks[${taskIndex}].layers[${layerIndex}] must be an object.`);
    const sourceIndex = boundedInteger(layer.sourceIndex, `tasks[${taskIndex}].layers[${layerIndex}].sourceIndex`, 0, sources.length - 1);
    const maskSourceIndex = layer.maskSourceIndex === undefined
      ? null
      : boundedInteger(layer.maskSourceIndex, `tasks[${taskIndex}].layers[${layerIndex}].maskSourceIndex`, 0, sources.length - 1);
    const width = layer.width === undefined ? null : boundedInteger(layer.width, `tasks[${taskIndex}].layers[${layerIndex}].width`, 1, 65_536);
    const height = layer.height === undefined ? null : boundedInteger(layer.height, `tasks[${taskIndex}].layers[${layerIndex}].height`, 1, 65_536);
    if ((width === null) !== (height === null)) {
      fail('PROJECT_ART_SANDBOX_TASK_INVALID', `tasks[${taskIndex}].layers[${layerIndex}] must provide width and height together.`);
    }
    if (width !== null) {
      assertDecodedPixelLimit(
        width,
        height,
        `tasks[${taskIndex}].layers[${layerIndex}]`,
        registry.maximumDecodedPixels,
      );
    }
    const blendMode = layer.blendMode ?? 'normal';
    if (!['normal', 'multiply', 'screen', 'add', 'subtract', 'darken', 'lighten'].includes(blendMode)) {
      fail('PROJECT_ART_SANDBOX_TASK_INVALID', `Unsupported composite blend mode: ${blendMode}.`);
    }
    const maskChannel = layer.maskChannel ?? 'alpha';
    if (!['alpha', 'luminance'].includes(maskChannel)) {
      fail('PROJECT_ART_SANDBOX_TASK_INVALID', `Unsupported composite mask channel: ${maskChannel}.`);
    }
    const sampling = layer.sampling ?? 'nearest';
    if (!['nearest', 'lanczos'].includes(sampling)) {
      fail('PROJECT_ART_SANDBOX_TASK_INVALID', `Unsupported composite sampling mode: ${sampling}.`);
    }
    return {
      sourceIndex,
      maskSourceIndex,
      x: boundedInteger(layer.x ?? 0, `tasks[${taskIndex}].layers[${layerIndex}].x`, -65_536, 65_536),
      y: boundedInteger(layer.y ?? 0, `tasks[${taskIndex}].layers[${layerIndex}].y`, -65_536, 65_536),
      opacity: boundedNumber(layer.opacity ?? 1, `tasks[${taskIndex}].layers[${layerIndex}].opacity`, 0, 1),
      blendMode,
      maskChannel,
      invertMask: layer.invertMask === true,
      sampling,
      ...(width === null ? {} : { width, height }),
    };
  });
  const canvasWidth = boundedInteger(task.canvas?.width, `tasks[${taskIndex}].canvas.width`, 1, 65_536);
  const canvasHeight = boundedInteger(task.canvas?.height, `tasks[${taskIndex}].canvas.height`, 1, 65_536);
  assertDecodedPixelLimit(
    canvasWidth,
    canvasHeight,
    `tasks[${taskIndex}].canvas`,
    registry.maximumDecodedPixels,
  );
  return {
    id: safeId(task.id, `tasks[${taskIndex}].id`),
    kind: 'image-composite',
    sources,
    targetPath,
    outputFormat,
    canvas: {
      width: canvasWidth,
      height: canvasHeight,
      background: task.canvas?.background ?? '#00000000',
    },
    layers,
  };
}

function normalizeReviewTask(task, taskIndex, registry, targetClaims) {
  const targetDirectory = normalizeTargetPath(task.targetDirectory, `tasks[${taskIndex}].targetDirectory`, targetClaims);
  const thresholds = isRecord(task.thresholds) ? task.thresholds : {};
  const sources = normalizeSources(task.sources, `tasks[${taskIndex}].sources`);
  const expectedWidth =
    task.expectedWidth === undefined
      ? null
      : boundedInteger(task.expectedWidth, `tasks[${taskIndex}].expectedWidth`, 1, 65_536);
  const expectedHeight =
    task.expectedHeight === undefined
      ? null
      : boundedInteger(task.expectedHeight, `tasks[${taskIndex}].expectedHeight`, 1, 65_536);
  const preview = {
    contactSheet: task.preview?.contactSheet !== false,
    animatedGif: task.preview?.animatedGif !== false,
    onionSkins: task.preview?.onionSkins === true,
    frameDurationMs: boundedInteger(
      task.preview?.frameDurationMs ?? 100,
      `tasks[${taskIndex}].preview.frameDurationMs`,
      20,
      10_000,
    ),
    columns: boundedInteger(task.preview?.columns ?? 8, `tasks[${taskIndex}].preview.columns`, 1, 100),
  };
  if (expectedWidth !== null && expectedHeight !== null) {
    const framePixels = expectedWidth * expectedHeight;
    assertDecodedPixelLimit(
      expectedWidth,
      expectedHeight,
      `tasks[${taskIndex}] expected frame`,
      registry.maximumDecodedPixels,
    );
    assertActiveDecodedPixelLimit(
      Array.from({ length: sources.length }, () => framePixels),
      `tasks[${taskIndex}] expected frame set`,
      registry.maximumDecodedPixels,
    );
    if (preview.contactSheet) {
      const columns = Math.min(preview.columns, sources.length);
      const rows = Math.ceil(sources.length / columns);
      const sheetWidth = columns * expectedWidth;
      const sheetHeight = rows * (expectedHeight + REVIEW_LABEL_HEIGHT);
      assertDecodedPixelLimit(
        sheetWidth,
        sheetHeight,
        `tasks[${taskIndex}] contact sheet`,
        registry.maximumDecodedPixels,
      );
      assertActiveDecodedPixelLimit(
        [sources.length * framePixels, sheetWidth * sheetHeight],
        `tasks[${taskIndex}] contact-sheet working set`,
        registry.maximumDecodedPixels,
      );
    }
  }
  return {
    id: safeId(task.id, `tasks[${taskIndex}].id`),
    kind: 'sequence-review',
    sources,
    targetDirectory,
    expectedWidth,
    expectedHeight,
    requireAlpha: task.requireAlpha === true,
    rejectBlankFrames: task.rejectBlankFrames !== false,
    rejectIdenticalAdjacentFrames: task.rejectIdenticalAdjacentFrames !== false,
    thresholds: {
      minimumChangedFraction: boundedNumber(
        thresholds.minimumChangedFraction ?? 0.0001,
        `tasks[${taskIndex}].thresholds.minimumChangedFraction`,
        0,
        1,
      ),
      maximumChangedFraction: boundedNumber(
        thresholds.maximumChangedFraction ?? 1,
        `tasks[${taskIndex}].thresholds.maximumChangedFraction`,
        0,
        1,
      ),
      maximumCentroidShiftPixels: boundedNumber(
        thresholds.maximumCentroidShiftPixels ?? 1_000_000,
        `tasks[${taskIndex}].thresholds.maximumCentroidShiftPixels`,
        0,
        1_000_000,
      ),
    },
    preview,
  };
}

function normalizeCompareTask(task, taskIndex, targetClaims) {
  const targetDirectory = normalizeTargetPath(task.targetDirectory, `tasks[${taskIndex}].targetDirectory`, targetClaims);
  const sources = normalizeSources(task.sources, `tasks[${taskIndex}].sources`);
  if (sources.length !== 2) {
    fail('PROJECT_ART_SANDBOX_TASK_INVALID', `tasks[${taskIndex}].sources must contain exactly two images.`);
  }
  const thresholds = isRecord(task.thresholds) ? task.thresholds : {};
  return {
    id: safeId(task.id, `tasks[${taskIndex}].id`),
    kind: 'image-compare',
    sources,
    targetDirectory,
    requireSameDimensions: task.requireSameDimensions !== false,
    thresholds: {
      maximumChangedFraction: boundedNumber(
        thresholds.maximumChangedFraction ?? 1,
        `tasks[${taskIndex}].thresholds.maximumChangedFraction`,
        0,
        1,
      ),
      maximumMeanChannelDelta: boundedNumber(
        thresholds.maximumMeanChannelDelta ?? 255,
        `tasks[${taskIndex}].thresholds.maximumMeanChannelDelta`,
        0,
        255,
      ),
      maximumAlphaChangedFraction: boundedNumber(
        thresholds.maximumAlphaChangedFraction ?? 1,
        `tasks[${taskIndex}].thresholds.maximumAlphaChangedFraction`,
        0,
        1,
      ),
    },
    preview: {
      difference: task.preview?.difference !== false,
      overlay: task.preview?.overlay !== false,
    },
  };
}

async function bindExternalSource(workspaceRoot, descriptor, sourceMap, registry) {
  if (descriptor.kind !== 'external') return descriptor;
  if (sourceMap.has(descriptor.path)) {
    const existing = sourceMap.get(descriptor.path);
    if (descriptor.expectedSha256 && descriptor.expectedSha256 !== existing.sha256) {
      fail('PROJECT_ART_SANDBOX_SOURCE_HASH_MISMATCH', `Expected SHA-256 changed for ${descriptor.path}.`);
    }
    return { kind: 'external', sourceId: existing.sourceId };
  }
  const resolved = await resolveExistingWithinRoot(workspaceRoot, descriptor.path, 'sandbox source');
  const identity = await hashFileBounded(resolved.absolutePath, registry.maximumSourceBytes);
  if (descriptor.expectedSha256 && descriptor.expectedSha256 !== identity.sha256) {
    fail('PROJECT_ART_SANDBOX_SOURCE_HASH_MISMATCH', `Source SHA-256 mismatch: ${descriptor.path}.`);
  }
  const image = await inspectImageFile(resolved.absolutePath);
  if (!image) {
    fail('PROJECT_ART_SANDBOX_SOURCE_INVALID', `Sandbox sources must be supported images: ${descriptor.path}.`);
  }
  assertDecodedPixelLimit(
    image.width,
    image.height,
    `Sandbox source ${descriptor.path}`,
    registry.maximumDecodedPixels,
  );
  const source = {
    sourceId: `source_${sha256(`${descriptor.path}\0${identity.sha256}`).slice(0, 32)}`,
    path: descriptor.path,
    sha256: identity.sha256,
    bytes: identity.bytes,
    mediaType: mediaTypeFromPath(descriptor.path),
    image,
  };
  sourceMap.set(descriptor.path, source);
  if (sourceMap.size > registry.maximumExternalSources) {
    fail('PROJECT_ART_SANDBOX_SOURCE_LIMIT', 'Sandbox exceeded the external-source limit.');
  }
  return { kind: 'external', sourceId: source.sourceId };
}

function externalTaskDimensions(task, externalById) {
  const descriptors = task.source ? [task.source] : task.sources || [];
  if (descriptors.length === 0 || descriptors.some((source) => source.kind !== 'external')) {
    return null;
  }
  return descriptors.map((source, index) => {
    const external = externalById.get(source.sourceId);
    if (!external) {
      fail(
        'PROJECT_ART_SANDBOX_SOURCE_INVALID',
        `tasks.${task.id}.sources[${index}] refers to an unknown external source.`,
      );
    }
    return {
      width: external.image.width,
      height: external.image.height,
      pixels: external.image.width * external.image.height,
    };
  });
}

function assertBoundTaskPixelBudgets(task, externalById, maximumDecodedPixels) {
  const dimensions = externalTaskDimensions(task, externalById);
  if (!dimensions) return;

  if (task.kind === 'image-composite') {
    const canvasPixels = task.canvas.width * task.canvas.height;
    for (const [index, layer] of task.layers.entries()) {
      const source = dimensions[layer.sourceIndex];
      const layerWidth = layer.width ?? source.width;
      const layerHeight = layer.height ?? source.height;
      const mask = layer.maskSourceIndex === null ? null : dimensions[layer.maskSourceIndex];
      const canvasMultiplier = layer.blendMode === 'normal' ? 3 : 9;
      const layerMultiplier = mask ? 6 : 4;
      assertActiveDecodedPixelLimit(
        [
          canvasPixels * canvasMultiplier,
          layerWidth * layerHeight * layerMultiplier,
          mask?.pixels ?? 0,
        ],
        `Task ${task.id} layer ${index} working set`,
        maximumDecodedPixels,
      );
    }
    return;
  }

  if (task.kind === 'assemble-sheet') {
    const cellWidth = task.cell?.width ?? dimensions[0].width;
    const cellHeight = task.cell?.height ?? dimensions[0].height;
    const rows = Math.ceil(dimensions.length / task.columns);
    const sheetWidth = task.padding * 2 + task.columns * cellWidth;
    const sheetHeight = task.padding * 2 + rows * cellHeight;
    assertDecodedPixelLimit(
      sheetWidth,
      sheetHeight,
      `Task ${task.id} assembled sheet`,
      maximumDecodedPixels,
    );
    const maximumSourcePixels = Math.max(...dimensions.map((value) => value.pixels));
    const preparedPixels = task.cell && task.cell.fit !== 'strict' ? cellWidth * cellHeight * 2 : 0;
    assertActiveDecodedPixelLimit(
      [sheetWidth * sheetHeight, maximumSourcePixels, preparedPixels],
      `Task ${task.id} assembly working set`,
      maximumDecodedPixels,
    );
    return;
  }

  if (task.kind === 'sequence-review') {
    const sourcePixels = dimensions.map((value) => value.pixels);
    const sourceTotal = assertActiveDecodedPixelLimit(
      sourcePixels,
      `Task ${task.id} frame set`,
      maximumDecodedPixels,
    );
    const maximumFramePixels = Math.max(...sourcePixels);
    if (dimensions.length > 1) {
      assertActiveDecodedPixelLimit(
        [sourceTotal, maximumFramePixels],
        `Task ${task.id} transition working set`,
        maximumDecodedPixels,
      );
    }
    if (task.preview.contactSheet) {
      const columns = Math.min(task.preview.columns, dimensions.length);
      const rows = Math.ceil(dimensions.length / columns);
      const cellWidth = Math.max(...dimensions.map((value) => value.width));
      const cellHeight = Math.max(...dimensions.map((value) => value.height));
      const sheetWidth = columns * cellWidth;
      const sheetHeight = rows * (cellHeight + REVIEW_LABEL_HEIGHT);
      assertDecodedPixelLimit(
        sheetWidth,
        sheetHeight,
        `Task ${task.id} contact sheet`,
        maximumDecodedPixels,
      );
      assertActiveDecodedPixelLimit(
        [sourceTotal, sheetWidth * sheetHeight * 2],
        `Task ${task.id} contact-sheet working set`,
        maximumDecodedPixels,
      );
    }
    if (task.preview.animatedGif) {
      assertActiveDecodedPixelLimit(
        [sourceTotal, maximumFramePixels * 2],
        `Task ${task.id} animation-preview working set`,
        maximumDecodedPixels,
      );
    }
    if (task.preview.onionSkins && dimensions.length > 1) {
      assertActiveDecodedPixelLimit(
        [sourceTotal, maximumFramePixels * 5],
        `Task ${task.id} onion-skin working set`,
        maximumDecodedPixels,
      );
    }
    return;
  }

  if (task.kind === 'image-compare') {
    const sourcePixels = dimensions.map((value) => value.pixels);
    const sourceTotal = assertActiveDecodedPixelLimit(
      sourcePixels,
      `Task ${task.id} comparison sources`,
      maximumDecodedPixels,
    );
    if (
      dimensions[0].width === dimensions[1].width &&
      dimensions[0].height === dimensions[1].height
    ) {
      assertActiveDecodedPixelLimit(
        [sourceTotal, dimensions[0].pixels * 2],
        `Task ${task.id} comparison working set`,
        maximumDecodedPixels,
      );
    }
  }
}

function validateTaskDependency(source, taskIndexById, currentIndex, label) {
  if (source.kind !== 'task-output') return;
  const dependencyIndex = taskIndexById.get(source.taskId);
  if (dependencyIndex === undefined) {
    fail('PROJECT_ART_SANDBOX_DEPENDENCY_INVALID', `${label} refers to an unknown task: ${source.taskId}.`);
  }
  if (dependencyIndex >= currentIndex) {
    fail('PROJECT_ART_SANDBOX_DEPENDENCY_INVALID', `${label} must refer to an earlier task.`);
  }
}

export async function compileProjectArtSandbox({
  workspaceRoot,
  request,
  requestBytes,
  registry: rawRegistry,
  registryBytes,
  compiledAt = new Date().toISOString(),
}) {
  const root = await requireDirectoryNoSymlink(workspaceRoot, 'workspace-root');
  const registry = validateRegistry(rawRegistry);
  timestamp(compiledAt, 'compiledAt');
  if (!isRecord(request) || request.schema !== PROJECT_ART_SANDBOX_REQUEST_SCHEMA) {
    fail('PROJECT_ART_SANDBOX_REQUEST_INVALID', `Sandbox request must use ${PROJECT_ART_SANDBOX_REQUEST_SCHEMA}.`);
  }
  assertAuthority(request.authority);
  const sandboxId = safeId(request.sandboxId, 'sandboxId');
  const projectId = safeId(request.projectId, 'projectId');
  if (!Array.isArray(request.tasks) || request.tasks.length < 1 || request.tasks.length > registry.maximumTasks) {
    fail('PROJECT_ART_SANDBOX_TASK_INVALID', `tasks must contain 1-${registry.maximumTasks} entries.`);
  }
  const targetClaims = new Set();
  const taskIds = new Set();
  const normalizedTasks = request.tasks.map((task, index) => {
    if (!isRecord(task)) fail('PROJECT_ART_SANDBOX_TASK_INVALID', `tasks[${index}] must be an object.`);
    const kind = task.kind;
    if (!registry.taskKinds.has(kind)) fail('PROJECT_ART_SANDBOX_TASK_INVALID', `Unsupported task kind: ${kind}.`);
    let normalized;
    if (kind === 'image') normalized = normalizeImageTask(task, index, registry, targetClaims);
    else if (kind === 'slice-sheet') normalized = normalizeSliceTask(task, index, registry, targetClaims);
    else if (kind === 'assemble-sheet') normalized = normalizeAssembleTask(task, index, registry, targetClaims);
    else if (kind === 'sequence-review') normalized = normalizeReviewTask(task, index, registry, targetClaims);
    else if (kind === 'image-composite') normalized = normalizeCompositeTask(task, index, targetClaims, registry);
    else normalized = normalizeCompareTask(task, index, targetClaims);
    if (taskIds.has(normalized.id)) fail('PROJECT_ART_SANDBOX_TASK_DUPLICATE', `Duplicate task id: ${normalized.id}.`);
    taskIds.add(normalized.id);
    return normalized;
  });
  const taskIndexById = new Map(normalizedTasks.map((task, index) => [task.id, index]));
  for (const [index, task] of normalizedTasks.entries()) {
    const sources = task.source ? [task.source] : task.sources || [];
    for (const [sourceIndex, source] of sources.entries()) {
      validateTaskDependency(source, taskIndexById, index, `tasks[${index}].source[${sourceIndex}]`);
    }
  }

  const sourceMap = new Map();
  const boundTasks = [];
  for (const task of normalizedTasks) {
    if (task.source) {
      boundTasks.push({
        ...task,
        source: await bindExternalSource(root, task.source, sourceMap, registry),
      });
    } else {
      const sources = [];
      for (const source of task.sources) {
        sources.push(await bindExternalSource(root, source, sourceMap, registry));
      }
      boundTasks.push({ ...task, sources });
    }
  }
  const externalSources = [...sourceMap.values()].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const externalById = new Map(externalSources.map((source) => [source.sourceId, source]));
  for (const task of boundTasks) {
    assertBoundTaskPixelBudgets(task, externalById, registry.maximumDecodedPixels);
  }
  const plan = withDocumentHash({
    schema: PROJECT_ART_SANDBOX_PLAN_SCHEMA,
    sandboxId,
    projectId,
    purpose: boundedString(request.purpose ?? 'Sandboxed project-art transformation and review.', 'purpose', 8192),
    compiledAt,
    runId: `project-art-sandbox:${sha256(`${sandboxId}\0${projectId}\0${sha256(requestBytes)}`).slice(0, 24)}`,
    workspace: {
      root: root,
      sourcePathsAreRelative: true,
      symbolicLinksAllowed: false,
    },
    requestSha256: sha256(requestBytes),
    registrySha256: sha256(registryBytes),
    externalSources,
    tasks: boundTasks,
    limits: {
      maximumTasks: registry.maximumTasks,
      maximumExternalSources: registry.maximumExternalSources,
      maximumSourceBytes: registry.maximumSourceBytes,
      maximumDecodedPixels: registry.maximumDecodedPixels,
    },
    execution: {
      runtime: 'python-pillow',
      entrypoint: 'tools/run_project_art_sandbox.py',
      outputRootMustNotExist: true,
      wholeRunAtomicPublication: true,
      createOnlyReceipt: true,
      sourceHashesRevalidatedBeforeExecution: true,
      sourceHashesRevalidatedAfterExecution: true,
      requiresExplicitExecution: true,
    },
    authority: {
      sandboxCompilation: true,
      sandboxExecution: false,
      sourceMutation: false,
      sourceDeletion: false,
      providerExecution: false,
      runtimeSubmission: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      publication: false,
      deployment: false,
      forcePush: false,
    },
  });
  verifyDocumentHash(plan);
  return plan;
}
