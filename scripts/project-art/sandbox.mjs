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
  VIDEO_EXTENSIONS,
  verifyDocumentHash,
  withDocumentHash,
} from './common.mjs';

export const PROJECT_ART_SANDBOX_REQUEST_SCHEMA = 'evavo.project-art-sandbox-request.v1';
export const PROJECT_ART_SANDBOX_PLAN_SCHEMA = 'evavo.project-art-sandbox-plan.v1';
export const PROJECT_ART_OPERATIONS_SCHEMA = 'evavo.project-art-operations.v1';

const MAXIMUM_TASKS = 2_000;
const MAXIMUM_EXTERNAL_SOURCES = 10_000;
const MAXIMUM_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;
const MAXIMUM_TOTAL_SOURCE_BYTES = 16 * 1024 * 1024 * 1024;
const MAXIMUM_DECODED_PIXELS = 220_000_000;
const MAXIMUM_IMAGE_DIMENSION = 65_536;
const MAXIMUM_OUTPUT_FILES = 20_000;
const MAXIMUM_OUTPUT_BYTES = 2 * 1024 * 1024 * 1024;
const MAXIMUM_TOTAL_OUTPUT_BYTES = 16 * 1024 * 1024 * 1024;
const MAXIMUM_VIDEO_FRAME_TIMESTAMPS = 512;
const MAXIMUM_VIDEO_TIMESTAMP_MS = 24 * 60 * 60 * 1_000;
const MAXIMUM_NORMAL_MAP_PIXELS = 8_388_608;
const MAXIMUM_SEQUENCE_PREVIEW_FRAMES = 600;
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
    maximumTasks: boundedInteger(value.maximumTasks, 'registry.maximumTasks', 1, MAXIMUM_TASKS),
    maximumExternalSources: boundedInteger(
      value.maximumExternalSources,
      'registry.maximumExternalSources',
      1,
      MAXIMUM_EXTERNAL_SOURCES,
    ),
    maximumSourceBytes: boundedInteger(
      value.maximumSourceBytes,
      'registry.maximumSourceBytes',
      1,
      MAXIMUM_SOURCE_BYTES,
    ),
    maximumTotalSourceBytes: boundedInteger(
      value.maximumTotalSourceBytes,
      'registry.maximumTotalSourceBytes',
      1,
      MAXIMUM_TOTAL_SOURCE_BYTES,
    ),
    maximumDecodedPixels: boundedInteger(
      value.maximumDecodedPixels,
      'registry.maximumDecodedPixels',
      1,
      MAXIMUM_DECODED_PIXELS,
    ),
    maximumOutputFiles: boundedInteger(
      value.maximumOutputFiles,
      'registry.maximumOutputFiles',
      1,
      MAXIMUM_OUTPUT_FILES,
    ),
    maximumOutputBytes: boundedInteger(
      value.maximumOutputBytes,
      'registry.maximumOutputBytes',
      1,
      MAXIMUM_OUTPUT_BYTES,
    ),
    maximumTotalOutputBytes: boundedInteger(
      value.maximumTotalOutputBytes,
      'registry.maximumTotalOutputBytes',
      1,
      MAXIMUM_TOTAL_OUTPUT_BYTES,
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


function boundedNumberArray(value, label, length, minimum, maximum) {
  if (!Array.isArray(value) || value.length !== length) {
    fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', `${label} must contain exactly ${length} numbers.`);
  }
  return value.map((entry, index) => boundedNumber(entry, `${label}[${index}]`, minimum, maximum));
}

function normalizedSampling(value, label, fallback = 'bicubic') {
  const sampling = value ?? fallback;
  if (!['nearest', 'bicubic', 'lanczos'].includes(sampling)) {
    fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', `${label} must be nearest, bicubic, or lanczos.`);
  }
  return sampling;
}

function normalizedColour(value, label, fallback) {
  return boundedString(value ?? fallback, label, 64);
}

function normalizedBoolean(value, label, fallback, code = 'PROJECT_ART_SANDBOX_OPERATION_INVALID') {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    fail(code, `${label} must be boolean.`);
  }
  return value;
}

function normalizedDimensions(parameters, op, registry) {
  const width = parameters.width === undefined
    ? null
    : boundedInteger(parameters.width, `${op}.width`, 1, MAXIMUM_IMAGE_DIMENSION);
  const height = parameters.height === undefined
    ? null
    : boundedInteger(parameters.height, `${op}.height`, 1, MAXIMUM_IMAGE_DIMENSION);
  if ((width === null) !== (height === null)) {
    fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', `${op} must provide width and height together.`);
  }
  if (width !== null) assertDecodedPixelLimit(width, height, op, registry.maximumDecodedPixels);
  return width === null ? {} : { width, height };
}

function normalizedCurveChannels(value, label) {
  if (!isRecord(value) || Object.keys(value).length < 1) {
    fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', `${label} must define at least one curve.`);
  }
  const allowed = new Set(['master', 'red', 'green', 'blue', 'alpha']);
  const result = {};
  for (const [channel, rawPoints] of Object.entries(value)) {
    if (!allowed.has(channel)) {
      fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', `${label}.${channel} is not a supported channel.`);
    }
    if (!Array.isArray(rawPoints) || rawPoints.length < 2 || rawPoints.length > 32) {
      fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', `${label}.${channel} must contain 2-32 points.`);
    }
    const points = rawPoints.map((rawPoint, index) => {
      const point = Array.isArray(rawPoint)
        ? { input: rawPoint[0], output: rawPoint[1] }
        : rawPoint;
      if (!isRecord(point)) {
        fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', `${label}.${channel}[${index}] must be [input, output] or an object.`);
      }
      return {
        input: boundedInteger(point.input, `${label}.${channel}[${index}].input`, 0, 255),
        output: boundedInteger(point.output, `${label}.${channel}[${index}].output`, 0, 255),
      };
    });
    for (let index = 1; index < points.length; index += 1) {
      if (points[index].input <= points[index - 1].input) {
        fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', `${label}.${channel} inputs must be strictly increasing.`);
      }
    }
    if (points[0].input !== 0 || points.at(-1).input !== 255) {
      fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', `${label}.${channel} must start at input 0 and end at input 255.`);
    }
    result[channel] = points;
  }
  return result;
}

function operationWorkingSetMultiplier(operations) {
  let multiplier = 3;
  for (const operation of operations) {
    if (['rotate', 'affine-transform', 'perspective-transform'].includes(operation.op)) multiplier = Math.max(multiplier, 5);
    if (['box-blur', 'median-filter', 'gaussian-blur', 'unsharp-mask', 'find-edges', 'emboss', 'edge-enhance'].includes(operation.op)) multiplier = Math.max(multiplier, 5);
    if (operation.op === 'motion-blur') multiplier = Math.max(multiplier, 6);
    if (['drop-shadow', 'outer-glow', 'rim-light', 'normal-map-from-height', 'defringe', 'alpha-feather'].includes(operation.op)) multiplier = Math.max(multiplier, 8);
  }
  return multiplier;
}

function imageOperationDimensions(initial, operations) {
  let width = initial.width;
  let height = initial.height;
  for (const operation of operations) {
    if (['crop', 'pad-canvas', 'resize', 'pixel-resize'].includes(operation.op)) {
      width = operation.width;
      height = operation.height;
    } else if (operation.op === 'repack-alpha-components') {
      width = operation.componentCount * operation.cellWidth;
      height = operation.cellHeight;
    } else if (['affine-transform', 'perspective-transform'].includes(operation.op) && operation.width !== undefined) {
      width = operation.width;
      height = operation.height;
    } else if (operation.op === 'rotate' && operation.expand === true) {
      const radians = Math.abs(operation.angle) * Math.PI / 180;
      const cosine = Math.abs(Math.cos(radians));
      const sine = Math.abs(Math.sin(radians));
      const nextWidth = Math.max(1, Math.ceil(width * cosine + height * sine));
      const nextHeight = Math.max(1, Math.ceil(width * sine + height * cosine));
      width = nextWidth;
      height = nextHeight;
    } else if (operation.op === 'drop-shadow' && operation.expandCanvas === true) {
      const margin = Math.ceil(operation.radius * 3 + Math.max(Math.abs(operation.offsetX), Math.abs(operation.offsetY)));
      width += margin * 2;
      height += margin * 2;
    } else if (operation.op === 'outer-glow' && operation.expandCanvas === true) {
      const margin = Math.ceil(operation.radius * 3 + operation.spread);
      width += margin * 2;
      height += margin * 2;
    }
  }
  return { width, height, pixels: width * height };
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
      if (parameters[key] !== undefined) boundedInteger(parameters[key], `${op}.${key}`, 1, MAXIMUM_IMAGE_DIMENSION);
    }
    if (parameters.width !== undefined && parameters.height !== undefined) {
      assertDecodedPixelLimit(parameters.width, parameters.height, op, registry.maximumDecodedPixels);
    }
  }
  if (op === 'crop') {
    boundedInteger(parameters.x, 'crop.x', 0, MAXIMUM_IMAGE_DIMENSION - 1);
    boundedInteger(parameters.y, 'crop.y', 0, MAXIMUM_IMAGE_DIMENSION - 1);
  }
  if (op === 'alpha-threshold' && parameters.threshold !== undefined) {
    boundedInteger(parameters.threshold, 'alpha-threshold.threshold', 0, 255);
  }
  if (op === 'alpha-clean') {
    parameters.threshold = boundedInteger(parameters.threshold ?? 96, 'alpha-clean.threshold', 0, 255);
    parameters.binary = normalizedBoolean(parameters.binary, 'alpha-clean.binary', true);
    parameters.zeroTransparentRgb = normalizedBoolean(
      parameters.zeroTransparentRgb,
      'alpha-clean.zeroTransparentRgb',
      true,
    );
  }
  if (op === 'chroma-to-alpha') {
    parameters.channel = parameters.channel ?? 'green';
    if (!['red', 'green', 'blue'].includes(parameters.channel)) {
      fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', 'chroma-to-alpha.channel must be red, green or blue.');
    }
    parameters.minimumChannel = boundedInteger(
      parameters.minimumChannel ?? 45,
      'chroma-to-alpha.minimumChannel',
      0,
      255,
    );
    parameters.minimumDominance = boundedInteger(
      parameters.minimumDominance ?? 15,
      'chroma-to-alpha.minimumDominance',
      0,
      255,
    );
    parameters.minimumAlpha = boundedInteger(parameters.minimumAlpha ?? 1, 'chroma-to-alpha.minimumAlpha', 0, 255);
    parameters.maximumAlpha = boundedInteger(parameters.maximumAlpha ?? 95, 'chroma-to-alpha.maximumAlpha', 0, 255);
    if (parameters.minimumAlpha > parameters.maximumAlpha) {
      fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', 'chroma-to-alpha.minimumAlpha cannot exceed maximumAlpha.');
    }
  }
  if (op === 'component-prune') {
    parameters.minimumPixels = boundedInteger(
      parameters.minimumPixels ?? 2,
      'component-prune.minimumPixels',
      1,
      1_000_000,
    );
    parameters.alphaThreshold = boundedInteger(
      parameters.alphaThreshold ?? 1,
      'component-prune.alphaThreshold',
      1,
      255,
    );
  }
  if (op === 'matte-colour-to-alpha') {
    parameters.matteColour = normalizedColour(parameters.matteColour, 'matte-colour-to-alpha.matteColour');
    parameters.distance = boundedNumber(parameters.distance ?? 0, 'matte-colour-to-alpha.distance', 0, 441);
  }
  if (op === 'repack-alpha-components') {
    parameters.componentCount = boundedInteger(parameters.componentCount, 'repack-alpha-components.componentCount', 1, 256);
    parameters.cellWidth = boundedInteger(parameters.cellWidth, 'repack-alpha-components.cellWidth', 1, MAXIMUM_IMAGE_DIMENSION);
    parameters.cellHeight = boundedInteger(parameters.cellHeight, 'repack-alpha-components.cellHeight', 1, MAXIMUM_IMAGE_DIMENSION);
    parameters.minimumPixels = boundedInteger(parameters.minimumPixels ?? 100, 'repack-alpha-components.minimumPixels', 1, 10_000_000);
    parameters.alphaThreshold = boundedInteger(parameters.alphaThreshold ?? 1, 'repack-alpha-components.alphaThreshold', 1, 255);
    parameters.connectivity = boundedInteger(parameters.connectivity ?? 8, 'repack-alpha-components.connectivity', 4, 8);
    parameters.minimumPadding = boundedInteger(parameters.minimumPadding ?? 1, 'repack-alpha-components.minimumPadding', 1, 1_024);
    if (![4, 8].includes(parameters.connectivity)) {
      fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', 'repack-alpha-components.connectivity must be 4 or 8.');
    }
    assertDecodedPixelLimit(
      parameters.componentCount * parameters.cellWidth,
      parameters.cellHeight,
      'repack-alpha-components',
      registry.maximumDecodedPixels,
    );
  }
  if (['rect-clear', 'rect-fill'].includes(op)) {
    parameters.x = boundedInteger(parameters.x, `${op}.x`, 0, MAXIMUM_IMAGE_DIMENSION - 1);
    parameters.y = boundedInteger(parameters.y, `${op}.y`, 0, MAXIMUM_IMAGE_DIMENSION - 1);
    parameters.width = boundedInteger(parameters.width, `${op}.width`, 1, MAXIMUM_IMAGE_DIMENSION);
    parameters.height = boundedInteger(parameters.height, `${op}.height`, 1, MAXIMUM_IMAGE_DIMENSION);
    if (op === 'rect-fill') parameters.colour = normalizedColour(parameters.colour, 'rect-fill.colour', '#00000000');
  }
  if (op === 'clone-stamp') {
    if (!isRecord(parameters.source) || !isRecord(parameters.destination)) {
      fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', 'clone-stamp.source and destination must be objects.');
    }
    parameters.source = {
      x: boundedInteger(parameters.source.x, 'clone-stamp.source.x', 0, MAXIMUM_IMAGE_DIMENSION - 1),
      y: boundedInteger(parameters.source.y, 'clone-stamp.source.y', 0, MAXIMUM_IMAGE_DIMENSION - 1),
      width: boundedInteger(parameters.source.width, 'clone-stamp.source.width', 1, MAXIMUM_IMAGE_DIMENSION),
      height: boundedInteger(parameters.source.height, 'clone-stamp.source.height', 1, MAXIMUM_IMAGE_DIMENSION),
    };
    parameters.destination = {
      x: boundedInteger(parameters.destination.x, 'clone-stamp.destination.x', 0, MAXIMUM_IMAGE_DIMENSION - 1),
      y: boundedInteger(parameters.destination.y, 'clone-stamp.destination.y', 0, MAXIMUM_IMAGE_DIMENSION - 1),
    };
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
    if (parameters.x !== undefined) boundedInteger(parameters.x, 'translate.x', -MAXIMUM_IMAGE_DIMENSION, MAXIMUM_IMAGE_DIMENSION);
    if (parameters.y !== undefined) boundedInteger(parameters.y, 'translate.y', -MAXIMUM_IMAGE_DIMENSION, MAXIMUM_IMAGE_DIMENSION);
  }
  if (op === 'colour-replace' && parameters.distance !== undefined) {
    boundedNumber(parameters.distance, 'colour-replace.distance', 0, 441);
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

  if (op === 'rotate') {
    parameters.angle = boundedNumber(parameters.angle, 'rotate.angle', -3600, 3600);
    parameters.expand = parameters.expand === true;
    parameters.sampling = normalizedSampling(parameters.sampling, 'rotate.sampling');
    parameters.background = normalizedColour(parameters.background, 'rotate.background', '#00000000');
  }
  if (op === 'affine-transform') {
    parameters.matrix = boundedNumberArray(parameters.matrix, 'affine-transform.matrix', 6, -1_000_000, 1_000_000);
    Object.assign(parameters, normalizedDimensions(parameters, op, registry));
    parameters.sampling = normalizedSampling(parameters.sampling, 'affine-transform.sampling');
    parameters.background = normalizedColour(parameters.background, 'affine-transform.background', '#00000000');
  }
  if (op === 'perspective-transform') {
    parameters.coefficients = boundedNumberArray(parameters.coefficients, 'perspective-transform.coefficients', 8, -1_000_000, 1_000_000);
    Object.assign(parameters, normalizedDimensions(parameters, op, registry));
    parameters.sampling = normalizedSampling(parameters.sampling, 'perspective-transform.sampling');
    parameters.background = normalizedColour(parameters.background, 'perspective-transform.background', '#00000000');
  }
  if (op === 'grayscale') {
    parameters.mode = parameters.mode ?? 'luminance';
    if (!['luminance', 'average'].includes(parameters.mode)) {
      fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', 'grayscale.mode must be luminance or average.');
    }
  }
  if (op === 'posterize') parameters.bits = boundedInteger(parameters.bits, 'posterize.bits', 1, 8);
  if (op === 'threshold') {
    parameters.threshold = boundedInteger(parameters.threshold, 'threshold.threshold', 0, 255);
    parameters.lowColour = normalizedColour(parameters.lowColour, 'threshold.lowColour', '#000000');
    parameters.highColour = normalizedColour(parameters.highColour, 'threshold.highColour', '#ffffff');
  }
  if (op === 'gamma') parameters.gamma = boundedNumber(parameters.gamma, 'gamma.gamma', 0.05, 10);
  if (op === 'hue-shift') parameters.degrees = boundedNumber(parameters.degrees, 'hue-shift.degrees', -3600, 3600);
  if (op === 'curves') parameters.channels = normalizedCurveChannels(parameters.channels, 'curves.channels');
  if (op === 'channel-mixer') {
    parameters.red = boundedNumberArray(parameters.red, 'channel-mixer.red', 3, -4, 4);
    parameters.green = boundedNumberArray(parameters.green, 'channel-mixer.green', 3, -4, 4);
    parameters.blue = boundedNumberArray(parameters.blue, 'channel-mixer.blue', 3, -4, 4);
    parameters.offsets = parameters.offsets === undefined
      ? [0, 0, 0]
      : boundedNumberArray(parameters.offsets, 'channel-mixer.offsets', 3, -255, 255);
  }
  if (op === 'selective-channel-mixer') {
    parameters.hueMin = boundedNumber(parameters.hueMin, 'selective-channel-mixer.hueMin', 0, 360);
    parameters.hueMax = boundedNumber(parameters.hueMax, 'selective-channel-mixer.hueMax', 0, 360);
    parameters.saturationMin = boundedNumber(parameters.saturationMin, 'selective-channel-mixer.saturationMin', 0, 1);
    parameters.saturationMax = boundedNumber(parameters.saturationMax, 'selective-channel-mixer.saturationMax', 0, 1);
    parameters.valueMin = boundedNumber(parameters.valueMin, 'selective-channel-mixer.valueMin', 0, 1);
    parameters.valueMax = boundedNumber(parameters.valueMax, 'selective-channel-mixer.valueMax', 0, 1);
    if (parameters.saturationMin > parameters.saturationMax || parameters.valueMin > parameters.valueMax) {
      fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', 'selective-channel-mixer ranges must be ordered.');
    }
    parameters.red = boundedNumberArray(parameters.red, 'selective-channel-mixer.red', 3, -4, 4);
    parameters.green = boundedNumberArray(parameters.green, 'selective-channel-mixer.green', 3, -4, 4);
    parameters.blue = boundedNumberArray(parameters.blue, 'selective-channel-mixer.blue', 3, -4, 4);
    parameters.offsets = parameters.offsets === undefined
      ? [0, 0, 0]
      : boundedNumberArray(parameters.offsets, 'selective-channel-mixer.offsets', 3, -255, 255);
  }
  if (op === 'box-blur') parameters.radius = boundedNumber(parameters.radius ?? 1, 'box-blur.radius', 0, 256);
  if (op === 'median-filter') {
    parameters.size = boundedInteger(parameters.size ?? 3, 'median-filter.size', 3, 31);
    if (parameters.size % 2 === 0) fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', 'median-filter.size must be odd.');
  }
  if (op === 'motion-blur') {
    parameters.radius = boundedNumber(parameters.radius ?? 8, 'motion-blur.radius', 0, 256);
    parameters.angle = boundedNumber(parameters.angle ?? 0, 'motion-blur.angle', -3600, 3600);
    parameters.samples = boundedInteger(parameters.samples ?? 17, 'motion-blur.samples', 3, 65);
    if (parameters.samples % 2 === 0) fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', 'motion-blur.samples must be odd.');
  }
  if (['emboss', 'find-edges', 'edge-enhance'].includes(op)) {
    parameters.blend = boundedNumber(parameters.blend ?? 1, `${op}.blend`, 0, 1);
  }
  if (op === 'alpha-feather') parameters.radius = boundedNumber(parameters.radius ?? 1, 'alpha-feather.radius', 0, 64);
  if (op === 'defringe') {
    parameters.radius = boundedInteger(parameters.radius ?? 1, 'defringe.radius', 1, 32);
    parameters.maximumAlpha = boundedInteger(parameters.maximumAlpha ?? 254, 'defringe.maximumAlpha', 1, 254);
    parameters.strength = boundedNumber(parameters.strength ?? 1, 'defringe.strength', 0, 1);
    if (parameters.matteColour !== undefined) parameters.matteColour = normalizedColour(parameters.matteColour, 'defringe.matteColour', '#ffffff');
  }
  if (op === 'drop-shadow') {
    parameters.offsetX = boundedInteger(parameters.offsetX ?? 4, 'drop-shadow.offsetX', -4096, 4096);
    parameters.offsetY = boundedInteger(parameters.offsetY ?? 4, 'drop-shadow.offsetY', -4096, 4096);
    parameters.radius = boundedNumber(parameters.radius ?? 4, 'drop-shadow.radius', 0, 256);
    parameters.opacity = boundedNumber(parameters.opacity ?? 0.5, 'drop-shadow.opacity', 0, 1);
    parameters.colour = normalizedColour(parameters.colour, 'drop-shadow.colour', '#000000');
    parameters.expandCanvas = parameters.expandCanvas === true;
  }
  if (op === 'outer-glow') {
    parameters.radius = boundedNumber(parameters.radius ?? 4, 'outer-glow.radius', 0, 256);
    parameters.spread = boundedNumber(parameters.spread ?? 0, 'outer-glow.spread', 0, 64);
    parameters.opacity = boundedNumber(parameters.opacity ?? 0.5, 'outer-glow.opacity', 0, 1);
    parameters.colour = normalizedColour(parameters.colour, 'outer-glow.colour', '#ffffff');
    parameters.expandCanvas = parameters.expandCanvas === true;
  }
  if (op === 'rim-light') {
    parameters.width = boundedInteger(parameters.width ?? 2, 'rim-light.width', 1, 32);
    parameters.angleDegrees = boundedNumber(parameters.angleDegrees ?? 315, 'rim-light.angleDegrees', -3600, 3600);
    parameters.softness = boundedNumber(parameters.softness ?? 0, 'rim-light.softness', 0, 64);
    parameters.opacity = boundedNumber(parameters.opacity ?? 0.5, 'rim-light.opacity', 0, 1);
    parameters.colour = normalizedColour(parameters.colour, 'rim-light.colour', '#ffffff');
    parameters.blendMode = parameters.blendMode ?? 'screen';
    if (!['normal', 'screen', 'add'].includes(parameters.blendMode)) {
      fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', 'rim-light.blendMode must be normal, screen or add.');
    }
  }
  if (op === 'normal-map-from-height') {
    parameters.source = parameters.source ?? 'luminance';
    if (!['luminance', 'alpha'].includes(parameters.source)) {
      fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', 'normal-map-from-height.source must be luminance or alpha.');
    }
    parameters.strength = boundedNumber(parameters.strength ?? 2, 'normal-map-from-height.strength', 0.01, 32);
    parameters.blurRadius = boundedNumber(parameters.blurRadius ?? 0, 'normal-map-from-height.blurRadius', 0, 32);
    parameters.invertX = normalizedBoolean(parameters.invertX, 'normal-map-from-height.invertX', false);
    parameters.invertY = normalizedBoolean(parameters.invertY, 'normal-map-from-height.invertY', false);
    parameters.preserveAlpha = normalizedBoolean(parameters.preserveAlpha, 'normal-map-from-height.preserveAlpha', true);
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

function transparencyPolicy(value, label, fallback = 'required') {
  const policy = value ?? fallback;
  if (!['required', 'preferred', 'opaque'].includes(policy)) {
    fail('PROJECT_ART_SANDBOX_TASK_INVALID', `${label} must be required, preferred or opaque.`);
  }
  return policy;
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
    alphaPolicy: transparencyPolicy(task.alphaPolicy, `tasks[${taskIndex}].alphaPolicy`),
  };
}

function normalizeVideoFrameTask(task, taskIndex, registry, targetClaims) {
  const source = normalizedSourceDescriptor(task.source, `tasks[${taskIndex}].source`);
  if (source.kind !== 'external' || !VIDEO_EXTENSIONS.has(path.posix.extname(source.path).toLowerCase())) {
    fail(
      'PROJECT_ART_SANDBOX_SOURCE_INVALID',
      `tasks[${taskIndex}].source must be an external MP4, M4V, MOV, WebM, MKV or AVI file.`,
    );
  }
  const targetDirectory = normalizeTargetPath(
    task.targetDirectory,
    `tasks[${taskIndex}].targetDirectory`,
    targetClaims,
  );
  const fileNamePattern = task.fileNamePattern ?? 'frame-{index}.png';
  boundedString(fileNamePattern, `tasks[${taskIndex}].fileNamePattern`, 512);
  if (
    !fileNamePattern.includes('{index}') ||
    fileNamePattern.includes('/') ||
    fileNamePattern.includes('\\') ||
    fileNamePattern.includes('\0') ||
    !fileNamePattern.endsWith('.png')
  ) {
    fail(
      'PROJECT_ART_SANDBOX_TASK_INVALID',
      'video-frame-extract fileNamePattern must contain {index}, contain no slash, and end in .png.',
    );
  }
  if (
    !Array.isArray(task.timestampsMs) ||
    task.timestampsMs.length < 1 ||
    task.timestampsMs.length > MAXIMUM_VIDEO_FRAME_TIMESTAMPS
  ) {
    fail(
      'PROJECT_ART_SANDBOX_TASK_INVALID',
      `tasks[${taskIndex}].timestampsMs must contain 1-${MAXIMUM_VIDEO_FRAME_TIMESTAMPS} entries.`,
    );
  }
  const timestampsMs = task.timestampsMs.map((value, index) =>
    boundedInteger(
      value,
      `tasks[${taskIndex}].timestampsMs[${index}]`,
      0,
      MAXIMUM_VIDEO_TIMESTAMP_MS,
    ));
  if (timestampsMs.some((value, index) => index > 0 && value <= timestampsMs[index - 1])) {
    fail(
      'PROJECT_ART_SANDBOX_TASK_INVALID',
      `tasks[${taskIndex}].timestampsMs must be strictly increasing.`,
    );
  }
  const expectedWidth = boundedInteger(
    task.expectedWidth,
    `tasks[${taskIndex}].expectedWidth`,
    1,
    MAXIMUM_IMAGE_DIMENSION,
  );
  const expectedHeight = boundedInteger(
    task.expectedHeight,
    `tasks[${taskIndex}].expectedHeight`,
    1,
    MAXIMUM_IMAGE_DIMENSION,
  );
  assertDecodedPixelLimit(
    expectedWidth,
    expectedHeight,
    `tasks[${taskIndex}] extracted video frame`,
    registry.maximumDecodedPixels,
  );
  assertActiveDecodedPixelLimit(
    [expectedWidth * expectedHeight * 2],
    `tasks[${taskIndex}] video-frame extraction working set`,
    registry.maximumDecodedPixels,
  );
  return {
    id: safeId(task.id, `tasks[${taskIndex}].id`),
    kind: 'video-frame-extract',
    source,
    targetDirectory,
    fileNamePattern,
    startIndex: boundedInteger(task.startIndex ?? 0, `tasks[${taskIndex}].startIndex`, 0, 1_000_000),
    timestampsMs,
    expectedWidth,
    expectedHeight,
    preserveSourceAlpha: normalizedBoolean(
      task.preserveSourceAlpha,
      `tasks[${taskIndex}].preserveSourceAlpha`,
      true,
      'PROJECT_ART_SANDBOX_TASK_INVALID',
    ),
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
    alphaPolicy: transparencyPolicy(task.alphaPolicy, `tasks[${taskIndex}].alphaPolicy`),
  };
}


function normalizedCompositeRect(value, label, registry) {
  if (value === undefined) return null;
  if (!isRecord(value)) {
    fail('PROJECT_ART_SANDBOX_TASK_INVALID', `${label} must be an object.`);
  }
  const rect = {
    x: boundedInteger(value.x, `${label}.x`, 0, 65_535),
    y: boundedInteger(value.y, `${label}.y`, 0, 65_535),
    width: boundedInteger(value.width, `${label}.width`, 1, 65_536),
    height: boundedInteger(value.height, `${label}.height`, 1, 65_536),
  };
  assertDecodedPixelLimit(rect.width, rect.height, label, registry.maximumDecodedPixels);
  return rect;
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
    const sourceRect = normalizedCompositeRect(
      layer.sourceRect,
      `tasks[${taskIndex}].layers[${layerIndex}].sourceRect`,
      registry,
    );
    const maskSourceRect = normalizedCompositeRect(
      layer.maskSourceRect,
      `tasks[${taskIndex}].layers[${layerIndex}].maskSourceRect`,
      registry,
    );
    if (maskSourceRect !== null && maskSourceIndex === null) {
      fail(
        'PROJECT_ART_SANDBOX_TASK_INVALID',
        `tasks[${taskIndex}].layers[${layerIndex}].maskSourceRect requires maskSourceIndex.`,
      );
    }
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
    if (!['nearest', 'bicubic', 'lanczos'].includes(sampling)) {
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
      ...(sourceRect === null ? {} : { sourceRect }),
      ...(maskSourceRect === null ? {} : { maskSourceRect }),
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
  const consistencyProfile = boundedString(
    task.consistencyProfile ?? 'off',
    `tasks[${taskIndex}].consistencyProfile`,
    32,
  );
  const consistencyDefaults = {
    off: {
      maximumCentroidShiftPixels: 1_000_000,
      maximumAlphaBoundsWidthChangeFraction: 1_000,
      maximumAlphaBoundsHeightChangeFraction: 1_000,
      maximumVisibleMeanColourDistance: 441.672956,
      maximumAlphaMassChangeFraction: 1_000,
      minimumCentroidAlignedAlphaIoU: 0,
    },
    'motion-family': {
      maximumCentroidShiftPixels: 96,
      maximumAlphaBoundsWidthChangeFraction: 0.75,
      maximumAlphaBoundsHeightChangeFraction: 0.75,
      maximumVisibleMeanColourDistance: 64,
      maximumAlphaMassChangeFraction: 1.25,
      minimumCentroidAlignedAlphaIoU: 0.1,
    },
    'identity-locked': {
      maximumCentroidShiftPixels: 48,
      maximumAlphaBoundsWidthChangeFraction: 0.35,
      maximumAlphaBoundsHeightChangeFraction: 0.35,
      maximumVisibleMeanColourDistance: 36,
      maximumAlphaMassChangeFraction: 0.55,
      minimumCentroidAlignedAlphaIoU: 0.3,
    },
  }[consistencyProfile];
  if (!consistencyDefaults) {
    fail('PROJECT_ART_SANDBOX_TASK_INVALID', `tasks[${taskIndex}].consistencyProfile must be off, motion-family or identity-locked.`);
  }
  const sources = normalizeSources(task.sources, `tasks[${taskIndex}].sources`);
  const expectedWidth =
    task.expectedWidth === undefined
      ? null
      : boundedInteger(task.expectedWidth, `tasks[${taskIndex}].expectedWidth`, 1, 65_536);
  const expectedHeight =
    task.expectedHeight === undefined
      ? null
      : boundedInteger(task.expectedHeight, `tasks[${taskIndex}].expectedHeight`, 1, 65_536);
  const frameDurationMs = boundedInteger(
    task.preview?.frameDurationMs ?? 100,
    `tasks[${taskIndex}].preview.frameDurationMs`,
    20,
    10_000,
  );
  const interpolation = boundedString(
    task.preview?.interpolation ?? 'none',
    `tasks[${taskIndex}].preview.interpolation`,
    32,
  );
  if (!['none', 'crossfade'].includes(interpolation)) {
    fail(
      'PROJECT_ART_SANDBOX_TASK_INVALID',
      `tasks[${taskIndex}].preview.interpolation must be none or crossfade.`,
    );
  }
  const easing = boundedString(
    task.preview?.easing ?? 'smoothstep',
    `tasks[${taskIndex}].preview.easing`,
    32,
  );
  if (!['linear', 'smoothstep'].includes(easing)) {
    fail(
      'PROJECT_ART_SANDBOX_TASK_INVALID',
      `tasks[${taskIndex}].preview.easing must be linear or smoothstep.`,
    );
  }
  const presentationFps = boundedNumber(
    task.preview?.presentationFps ?? 30,
    `tasks[${taskIndex}].preview.presentationFps`,
    1,
    50,
  );
  const loopTransition = task.preview?.loopTransition === true;
  const samplesPerTransition =
    interpolation === 'crossfade'
      ? Math.max(1, Math.round((frameDurationMs * presentationFps) / 1_000))
      : 1;
  const transitionCount =
    sources.length < 2
      ? 0
      : loopTransition
        ? sources.length
        : sources.length - 1;
  const renderedFrameCount =
    interpolation === 'crossfade' && transitionCount > 0
      ? transitionCount * samplesPerTransition + (loopTransition ? 0 : 1)
      : sources.length;
  if (renderedFrameCount > MAXIMUM_SEQUENCE_PREVIEW_FRAMES) {
    fail(
      'PROJECT_ART_SANDBOX_TASK_INVALID',
      `tasks[${taskIndex}] smooth animation preview would render ${renderedFrameCount} frames; ` +
        `the governed maximum is ${MAXIMUM_SEQUENCE_PREVIEW_FRAMES}.`,
    );
  }
  const preview = {
    contactSheet: task.preview?.contactSheet !== false,
    animatedGif: task.preview?.animatedGif !== false,
    onionSkins: task.preview?.onionSkins === true,
    frameDurationMs,
    columns: boundedInteger(task.preview?.columns ?? 8, `tasks[${taskIndex}].preview.columns`, 1, 100),
    interpolation,
    easing,
    presentationFps,
    loopTransition,
    samplesPerTransition,
    renderedFrameCount,
    outputFrameDurationMs:
      interpolation === 'crossfade'
        ? Math.max(20, Math.round(frameDurationMs / samplesPerTransition))
        : frameDurationMs,
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
    if (preview.animatedGif) {
      assertActiveDecodedPixelLimit(
        preview.interpolation === 'none'
          ? [sources.length * framePixels, framePixels * 2]
          : [
              sources.length * framePixels,
              preview.renderedFrameCount * framePixels,
              framePixels,
            ],
        `tasks[${taskIndex}] animation-preview working set`,
        registry.maximumDecodedPixels,
      );
    }
  }
  const requireAlpha = task.requireAlpha === true;
  return {
    id: safeId(task.id, `tasks[${taskIndex}].id`),
    kind: 'sequence-review',
    sources,
    targetDirectory,
    expectedWidth,
    expectedHeight,
    requireAlpha,
    alphaPolicy: transparencyPolicy(
      task.alphaPolicy,
      `tasks[${taskIndex}].alphaPolicy`,
      requireAlpha ? 'required' : 'preferred',
    ),
    rejectBlankFrames: task.rejectBlankFrames !== false,
    rejectIdenticalAdjacentFrames: task.rejectIdenticalAdjacentFrames !== false,
    consistencyProfile,
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
        thresholds.maximumCentroidShiftPixels ?? consistencyDefaults.maximumCentroidShiftPixels,
        `tasks[${taskIndex}].thresholds.maximumCentroidShiftPixels`,
        0,
        1_000_000,
      ),
      maximumAlphaBoundsWidthChangeFraction: boundedNumber(
        thresholds.maximumAlphaBoundsWidthChangeFraction ?? consistencyDefaults.maximumAlphaBoundsWidthChangeFraction,
        `tasks[${taskIndex}].thresholds.maximumAlphaBoundsWidthChangeFraction`,
        0,
        1_000,
      ),
      maximumAlphaBoundsHeightChangeFraction: boundedNumber(
        thresholds.maximumAlphaBoundsHeightChangeFraction ?? consistencyDefaults.maximumAlphaBoundsHeightChangeFraction,
        `tasks[${taskIndex}].thresholds.maximumAlphaBoundsHeightChangeFraction`,
        0,
        1_000,
      ),
      maximumVisibleMeanColourDistance: boundedNumber(
        thresholds.maximumVisibleMeanColourDistance ?? consistencyDefaults.maximumVisibleMeanColourDistance,
        `tasks[${taskIndex}].thresholds.maximumVisibleMeanColourDistance`,
        0,
        441.672956,
      ),
      maximumAlphaMassChangeFraction: boundedNumber(
        thresholds.maximumAlphaMassChangeFraction ?? consistencyDefaults.maximumAlphaMassChangeFraction,
        `tasks[${taskIndex}].thresholds.maximumAlphaMassChangeFraction`,
        0,
        1_000,
      ),
      minimumCentroidAlignedAlphaIoU: boundedNumber(
        thresholds.minimumCentroidAlignedAlphaIoU ?? consistencyDefaults.minimumCentroidAlignedAlphaIoU,
        `tasks[${taskIndex}].thresholds.minimumCentroidAlignedAlphaIoU`,
        0,
        1,
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


function normalizeMasterProfile(value, taskIndex) {
  const profile = value === undefined ? {} : value;
  if (!isRecord(profile)) {
    fail('PROJECT_ART_SANDBOX_TASK_INVALID', `tasks[${taskIndex}].profile must be an object.`);
  }
  const exactWidth = profile.exactWidth === undefined
    ? null
    : boundedInteger(profile.exactWidth, `tasks[${taskIndex}].profile.exactWidth`, 1, MAXIMUM_IMAGE_DIMENSION);
  const exactHeight = profile.exactHeight === undefined
    ? null
    : boundedInteger(profile.exactHeight, `tasks[${taskIndex}].profile.exactHeight`, 1, MAXIMUM_IMAGE_DIMENSION);
  if ((exactWidth === null) !== (exactHeight === null)) {
    fail('PROJECT_ART_SANDBOX_TASK_INVALID', `tasks[${taskIndex}].profile must provide exactWidth and exactHeight together.`);
  }
  const alphaMode = profile.alphaMode ?? 'preserve';
  if (!['preserve', 'required', 'forbidden'].includes(alphaMode)) {
    fail('PROJECT_ART_SANDBOX_TASK_INVALID', `tasks[${taskIndex}].profile.alphaMode is invalid.`);
  }
  let expectedAlphaBounds;
  if (profile.expectedAlphaBounds !== undefined) {
    if (!isRecord(profile.expectedAlphaBounds)) {
      fail('PROJECT_ART_SANDBOX_TASK_INVALID', `tasks[${taskIndex}].profile.expectedAlphaBounds must be an object.`);
    }
    expectedAlphaBounds = {
      x: boundedInteger(profile.expectedAlphaBounds.x, `tasks[${taskIndex}].profile.expectedAlphaBounds.x`, 0, MAXIMUM_IMAGE_DIMENSION),
      y: boundedInteger(profile.expectedAlphaBounds.y, `tasks[${taskIndex}].profile.expectedAlphaBounds.y`, 0, MAXIMUM_IMAGE_DIMENSION),
      width: boundedInteger(profile.expectedAlphaBounds.width, `tasks[${taskIndex}].profile.expectedAlphaBounds.width`, 1, MAXIMUM_IMAGE_DIMENSION),
      height: boundedInteger(profile.expectedAlphaBounds.height, `tasks[${taskIndex}].profile.expectedAlphaBounds.height`, 1, MAXIMUM_IMAGE_DIMENSION),
      tolerance: boundedInteger(profile.expectedAlphaBounds.tolerance ?? 0, `tasks[${taskIndex}].profile.expectedAlphaBounds.tolerance`, 0, MAXIMUM_IMAGE_DIMENSION),
    };
  }
  return {
    name: boundedString(profile.name ?? 'production-master', `tasks[${taskIndex}].profile.name`, 256),
    enforce: profile.enforce !== false,
    alphaMode,
    ...(exactWidth === null ? {} : { exactWidth, exactHeight }),
    maximumTransparentRgbFraction: boundedNumber(profile.maximumTransparentRgbFraction ?? 1, `tasks[${taskIndex}].profile.maximumTransparentRgbFraction`, 0, 1),
    maximumSemiTransparentFraction: boundedNumber(profile.maximumSemiTransparentFraction ?? 1, `tasks[${taskIndex}].profile.maximumSemiTransparentFraction`, 0, 1),
    minimumOpaqueFraction: boundedNumber(profile.minimumOpaqueFraction ?? 0, `tasks[${taskIndex}].profile.minimumOpaqueFraction`, 0, 1),
    maximumUniqueColours: boundedInteger(profile.maximumUniqueColours ?? 1_000_000, `tasks[${taskIndex}].profile.maximumUniqueColours`, 1, 1_000_000),
    shadowThreshold: boundedInteger(profile.shadowThreshold ?? 0, `tasks[${taskIndex}].profile.shadowThreshold`, 0, 255),
    highlightThreshold: boundedInteger(profile.highlightThreshold ?? 255, `tasks[${taskIndex}].profile.highlightThreshold`, 0, 255),
    maximumShadowClippingFraction: boundedNumber(profile.maximumShadowClippingFraction ?? 1, `tasks[${taskIndex}].profile.maximumShadowClippingFraction`, 0, 1),
    maximumHighlightClippingFraction: boundedNumber(profile.maximumHighlightClippingFraction ?? 1, `tasks[${taskIndex}].profile.maximumHighlightClippingFraction`, 0, 1),
    minimumLuminanceSpan: boundedNumber(profile.minimumLuminanceSpan ?? 0, `tasks[${taskIndex}].profile.minimumLuminanceSpan`, 0, 255),
    maximumEdgeMatteFraction: boundedNumber(profile.maximumEdgeMatteFraction ?? 1, `tasks[${taskIndex}].profile.maximumEdgeMatteFraction`, 0, 1),
    maximumEdgeMatteDistance: boundedNumber(profile.maximumEdgeMatteDistance ?? 16, `tasks[${taskIndex}].profile.maximumEdgeMatteDistance`, 0, 441),
    edgeMatteColour: normalizedColour(profile.edgeMatteColour, `tasks[${taskIndex}].profile.edgeMatteColour`, '#ffffff'),
    ...(expectedAlphaBounds ? { expectedAlphaBounds } : {}),
  };
}

function normalizeMasterTask(task, taskIndex, registry, targetClaims) {
  const targetPath = normalizeTargetPath(task.targetPath, `tasks[${taskIndex}].targetPath`, targetClaims);
  const outputFormat = task.outputFormat || extensionFormat(targetPath);
  if (!['png', 'webp', 'jpeg'].includes(outputFormat) || !OUTPUT_EXTENSIONS[outputFormat]?.has(path.posix.extname(targetPath).toLowerCase())) {
    fail('PROJECT_ART_SANDBOX_TARGET_INVALID', `Master target extension does not match outputFormat: ${targetPath}.`);
  }
  const extension = path.posix.extname(targetPath);
  const defaultReportPath = `${targetPath.slice(0, -extension.length)}.mastering.json`;
  const reportPath = normalizeTargetPath(task.reportPath ?? defaultReportPath, `tasks[${taskIndex}].reportPath`, targetClaims);
  if (path.posix.extname(reportPath).toLowerCase() !== '.json') {
    fail('PROJECT_ART_SANDBOX_TARGET_INVALID', `Master reportPath must end in .json: ${reportPath}.`);
  }
  if (!Array.isArray(task.operations) || task.operations.length > 100) {
    fail('PROJECT_ART_SANDBOX_OPERATION_INVALID', `tasks[${taskIndex}].operations must contain 0-100 entries.`);
  }
  return {
    id: safeId(task.id, `tasks[${taskIndex}].id`),
    kind: 'image-master',
    source: normalizedSourceDescriptor(task.source, `tasks[${taskIndex}].source`),
    targetPath,
    reportPath,
    outputFormat,
    operations: task.operations.map((operation, index) => normalizedOperation(operation, index, registry)),
    profile: normalizeMasterProfile(task.profile, taskIndex),
  };
}

function normalizeMotionKeyframes(value, taskIndex, layerIndex, frameCount) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 1_000) {
    fail('PROJECT_ART_SANDBOX_TASK_INVALID', `tasks[${taskIndex}].layers[${layerIndex}].keyframes must contain 1-1,000 entries.`);
  }
  const easingModes = new Set(['linear', 'ease-in', 'ease-out', 'ease-in-out', 'hold']);
  const result = value.map((keyframe, keyframeIndex) => {
    if (!isRecord(keyframe)) {
      fail('PROJECT_ART_SANDBOX_TASK_INVALID', `tasks[${taskIndex}].layers[${layerIndex}].keyframes[${keyframeIndex}] must be an object.`);
    }
    const easing = keyframe.easing ?? 'linear';
    if (!easingModes.has(easing)) {
      fail('PROJECT_ART_SANDBOX_TASK_INVALID', `Unsupported motion easing: ${easing}.`);
    }
    return {
      frame: boundedInteger(keyframe.frame, `tasks[${taskIndex}].layers[${layerIndex}].keyframes[${keyframeIndex}].frame`, 0, frameCount - 1),
      x: boundedNumber(keyframe.x ?? 0, `tasks[${taskIndex}].layers[${layerIndex}].keyframes[${keyframeIndex}].x`, -131_072, 131_072),
      y: boundedNumber(keyframe.y ?? 0, `tasks[${taskIndex}].layers[${layerIndex}].keyframes[${keyframeIndex}].y`, -131_072, 131_072),
      scaleX: boundedNumber(keyframe.scaleX ?? 1, `tasks[${taskIndex}].layers[${layerIndex}].keyframes[${keyframeIndex}].scaleX`, 0.01, 64),
      scaleY: boundedNumber(keyframe.scaleY ?? 1, `tasks[${taskIndex}].layers[${layerIndex}].keyframes[${keyframeIndex}].scaleY`, 0.01, 64),
      rotation: boundedNumber(keyframe.rotation ?? 0, `tasks[${taskIndex}].layers[${layerIndex}].keyframes[${keyframeIndex}].rotation`, -3600, 3600),
      opacity: boundedNumber(keyframe.opacity ?? 1, `tasks[${taskIndex}].layers[${layerIndex}].keyframes[${keyframeIndex}].opacity`, 0, 1),
      easing,
    };
  });
  for (let index = 1; index < result.length; index += 1) {
    if (result[index].frame <= result[index - 1].frame) {
      fail('PROJECT_ART_SANDBOX_TASK_INVALID', `Motion keyframe frames must be strictly increasing.`);
    }
  }
  return result;
}

function normalizeMotionTask(task, taskIndex, registry, targetClaims) {
  const targetDirectory = normalizeTargetPath(task.targetDirectory, `tasks[${taskIndex}].targetDirectory`, targetClaims);
  const sources = normalizeSources(task.sources, `tasks[${taskIndex}].sources`);
  if (sources.length > 128) {
    fail('PROJECT_ART_SANDBOX_SOURCE_INVALID', `tasks[${taskIndex}].sources must contain at most 128 images.`);
  }
  const frameCount = boundedInteger(task.frameCount, `tasks[${taskIndex}].frameCount`, 1, 600);
  const fps = boundedNumber(task.fps ?? 12, `tasks[${taskIndex}].fps`, 1, 120);
  const fileNamePattern = boundedString(task.fileNamePattern ?? 'frame-{index}.png', `tasks[${taskIndex}].fileNamePattern`, 512);
  if (!fileNamePattern.includes('{index}') || fileNamePattern.includes('/') || !fileNamePattern.endsWith('.png')) {
    fail('PROJECT_ART_SANDBOX_TASK_INVALID', 'motion-sequence fileNamePattern must contain {index}, contain no slash, and end in .png.');
  }
  const manifestName = boundedString(task.manifestName ?? 'motion-sequence.json', `tasks[${taskIndex}].manifestName`, 256);
  const previewName = boundedString(task.previewName ?? 'motion-preview.gif', `tasks[${taskIndex}].previewName`, 256);
  if (manifestName.includes('/') || !manifestName.endsWith('.json') || previewName.includes('/') || !previewName.endsWith('.gif')) {
    fail('PROJECT_ART_SANDBOX_TASK_INVALID', 'motion manifestName and previewName must be leaf .json/.gif names.');
  }
  const canvasWidth = boundedInteger(task.canvas?.width, `tasks[${taskIndex}].canvas.width`, 1, MAXIMUM_IMAGE_DIMENSION);
  const canvasHeight = boundedInteger(task.canvas?.height, `tasks[${taskIndex}].canvas.height`, 1, MAXIMUM_IMAGE_DIMENSION);
  assertDecodedPixelLimit(canvasWidth, canvasHeight, `tasks[${taskIndex}].canvas`, registry.maximumDecodedPixels);
  if (!Array.isArray(task.layers) || task.layers.length < 1 || task.layers.length > 128) {
    fail('PROJECT_ART_SANDBOX_TASK_INVALID', `tasks[${taskIndex}].layers must contain 1-128 entries.`);
  }
  const layers = task.layers.map((layer, layerIndex) => {
    if (!isRecord(layer)) fail('PROJECT_ART_SANDBOX_TASK_INVALID', `tasks[${taskIndex}].layers[${layerIndex}] must be an object.`);
    const sourceIndex = boundedInteger(layer.sourceIndex, `tasks[${taskIndex}].layers[${layerIndex}].sourceIndex`, 0, sources.length - 1);
    const maskSourceIndex = layer.maskSourceIndex === undefined
      ? null
      : boundedInteger(layer.maskSourceIndex, `tasks[${taskIndex}].layers[${layerIndex}].maskSourceIndex`, 0, sources.length - 1);
    const blendMode = layer.blendMode ?? 'normal';
    if (!['normal', 'multiply', 'screen', 'add', 'subtract', 'darken', 'lighten'].includes(blendMode)) {
      fail('PROJECT_ART_SANDBOX_TASK_INVALID', `Unsupported motion blend mode: ${blendMode}.`);
    }
    const maskChannel = layer.maskChannel ?? 'alpha';
    if (!['alpha', 'luminance'].includes(maskChannel)) {
      fail('PROJECT_ART_SANDBOX_TASK_INVALID', `Unsupported motion mask channel: ${maskChannel}.`);
    }
    return {
      sourceIndex,
      maskSourceIndex,
      maskChannel,
      invertMask: layer.invertMask === true,
      blendMode,
      sampling: normalizedSampling(layer.sampling, `tasks[${taskIndex}].layers[${layerIndex}].sampling`),
      anchor: {
        x: boundedNumber(layer.anchor?.x ?? 0.5, `tasks[${taskIndex}].layers[${layerIndex}].anchor.x`, 0, 1),
        y: boundedNumber(layer.anchor?.y ?? 0.5, `tasks[${taskIndex}].layers[${layerIndex}].anchor.y`, 0, 1),
      },
      keyframes: normalizeMotionKeyframes(layer.keyframes, taskIndex, layerIndex, frameCount),
    };
  });
  const preview = task.preview?.animatedGif === true;
  const motionBlurSamples = boundedInteger(task.motionBlur?.samples ?? 1, `tasks[${taskIndex}].motionBlur.samples`, 1, 5);
  return {
    id: safeId(task.id, `tasks[${taskIndex}].id`),
    kind: 'motion-sequence',
    sources,
    targetDirectory,
    fileNamePattern,
    manifestName,
    previewName,
    startIndex: boundedInteger(task.startIndex ?? 0, `tasks[${taskIndex}].startIndex`, 0, 1_000_000),
    frameCount,
    fps,
    canvas: {
      width: canvasWidth,
      height: canvasHeight,
      background: normalizedColour(task.canvas?.background, `tasks[${taskIndex}].canvas.background`, '#00000000'),
    },
    layers,
    preview: { animatedGif: preview },
    motionBlur: {
      samples: motionBlurSamples,
      shutterFraction: boundedNumber(task.motionBlur?.shutterFraction ?? 0.5, `tasks[${taskIndex}].motionBlur.shutterFraction`, 0, 1),
    },
  };
}

async function bindExternalSource(
  workspaceRoot,
  descriptor,
  sourceMap,
  sourceByteTotal,
  registry,
  expectedMediaKind = 'image',
) {
  if (descriptor.kind !== 'external') return descriptor;
  if (sourceMap.has(descriptor.path)) {
    const existing = sourceMap.get(descriptor.path);
    if (existing.mediaKind !== expectedMediaKind) {
      fail('PROJECT_ART_SANDBOX_SOURCE_INVALID', `Source media kind changed within the task graph: ${descriptor.path}.`);
    }
    if (descriptor.expectedSha256 && descriptor.expectedSha256 !== existing.sha256) {
      fail('PROJECT_ART_SANDBOX_SOURCE_HASH_MISMATCH', `Expected SHA-256 changed for ${descriptor.path}.`);
    }
    return { kind: 'external', sourceId: existing.sourceId };
  }
  const resolved = await resolveExistingWithinRoot(workspaceRoot, descriptor.path, 'sandbox source');
  const sourceBytes = boundedInteger(
    resolved.metadata.size,
    `source ${descriptor.path} bytes`,
    0,
    registry.maximumSourceBytes,
  );
  if (sourceByteTotal.value + sourceBytes > registry.maximumTotalSourceBytes) {
    fail(
      'PROJECT_ART_SANDBOX_SOURCE_BYTES_LIMIT',
      `Sandbox sources exceed the ${registry.maximumTotalSourceBytes}-byte aggregate source boundary.`,
    );
  }
  const identity = await hashFileBounded(resolved.absolutePath, registry.maximumSourceBytes);
  if (identity.bytes !== sourceBytes) {
    fail(
      'PROJECT_ART_SANDBOX_SOURCE_IDENTITY_CHANGED',
      `Source size changed while binding: ${descriptor.path}.`,
    );
  }
  if (sourceByteTotal.value + identity.bytes > registry.maximumTotalSourceBytes) {
    fail(
      'PROJECT_ART_SANDBOX_SOURCE_BYTES_LIMIT',
      `Sandbox sources exceed the ${registry.maximumTotalSourceBytes}-byte aggregate source boundary.`,
    );
  }
  if (descriptor.expectedSha256 && descriptor.expectedSha256 !== identity.sha256) {
    fail('PROJECT_ART_SANDBOX_SOURCE_HASH_MISMATCH', `Source SHA-256 mismatch: ${descriptor.path}.`);
  }
  let image;
  if (expectedMediaKind === 'video') {
    if (!VIDEO_EXTENSIONS.has(path.posix.extname(descriptor.path).toLowerCase())) {
      fail('PROJECT_ART_SANDBOX_SOURCE_INVALID', `Sandbox video source has an unsupported extension: ${descriptor.path}.`);
    }
  } else {
    image = await inspectImageFile(resolved.absolutePath);
    if (!image) {
      fail('PROJECT_ART_SANDBOX_SOURCE_INVALID', `Sandbox sources must be supported images: ${descriptor.path}.`);
    }
    assertDecodedPixelLimit(
      image.width,
      image.height,
      `Sandbox source ${descriptor.path}`,
      registry.maximumDecodedPixels,
    );
  }
  const source = {
    sourceId: `source_${sha256(`${descriptor.path}\0${identity.sha256}`).slice(0, 32)}`,
    path: descriptor.path,
    sha256: identity.sha256,
    bytes: identity.bytes,
    mediaType: mediaTypeFromPath(descriptor.path),
    mediaKind: expectedMediaKind,
    ...(image === undefined ? {} : { image }),
  };
  sourceMap.set(descriptor.path, source);
  sourceByteTotal.value += identity.bytes;
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
  const dimensions = [];
  for (const [index, source] of descriptors.entries()) {
    const external = externalById.get(source.sourceId);
    if (!external) {
      fail(
        'PROJECT_ART_SANDBOX_SOURCE_INVALID',
        `tasks.${task.id}.sources[${index}] refers to an unknown external source.`,
      );
    }
    if (external.mediaKind !== 'image' || !external.image) return null;
    dimensions.push({
      width: external.image.width,
      height: external.image.height,
      pixels: external.image.width * external.image.height,
    });
  }
  return dimensions;
}

function assertBoundTaskPixelBudgets(task, externalById, maximumDecodedPixels) {
  const dimensions = externalTaskDimensions(task, externalById);
  if (!dimensions) return;

  if (task.kind === 'image' || task.kind === 'image-master') {
    let operationInput = dimensions[0];
    for (const operation of task.operations) {
      if (operation.op === 'normal-map-from-height' && operationInput.pixels > MAXIMUM_NORMAL_MAP_PIXELS) {
        fail(
          'PROJECT_ART_SANDBOX_PIXEL_LIMIT',
          `Task ${task.id} normal-map-from-height exceeds its ${MAXIMUM_NORMAL_MAP_PIXELS}-pixel CPU boundary.`,
        );
      }
      operationInput = imageOperationDimensions(operationInput, [operation]);
    }
    const output = imageOperationDimensions(dimensions[0], task.operations);
    assertDecodedPixelLimit(output.width, output.height, `Task ${task.id} image output`, maximumDecodedPixels);
    assertActiveDecodedPixelLimit(
      [dimensions[0].pixels, output.pixels * operationWorkingSetMultiplier(task.operations)],
      `Task ${task.id} operation working set`,
      maximumDecodedPixels,
    );
    return;
  }

  if (task.kind === 'motion-sequence') {
    const canvasPixels = task.canvas.width * task.canvas.height;
    for (const [index, layer] of task.layers.entries()) {
      const source = dimensions[layer.sourceIndex];
      const maximumScaleX = Math.max(...layer.keyframes.map((keyframe) => keyframe.scaleX));
      const maximumScaleY = Math.max(...layer.keyframes.map((keyframe) => keyframe.scaleY));
      const scaledWidth = Math.max(1, Math.ceil(source.width * maximumScaleX));
      const scaledHeight = Math.max(1, Math.ceil(source.height * maximumScaleY));
      assertDecodedPixelLimit(scaledWidth, scaledHeight, `Task ${task.id} layer ${index} scaled source`, maximumDecodedPixels);
      const maximumRotatedPixels = Math.max(
        ...layer.keyframes.map((keyframe) => {
          const radians = Math.abs(keyframe.rotation) * Math.PI / 180;
          const rotatedWidth = Math.ceil(scaledWidth * Math.abs(Math.cos(radians)) + scaledHeight * Math.abs(Math.sin(radians)));
          const rotatedHeight = Math.ceil(scaledWidth * Math.abs(Math.sin(radians)) + scaledHeight * Math.abs(Math.cos(radians)));
          assertDecodedPixelLimit(rotatedWidth, rotatedHeight, `Task ${task.id} layer ${index} rotated source`, maximumDecodedPixels);
          return rotatedWidth * rotatedHeight;
        }),
      );
      const mask = layer.maskSourceIndex === null ? null : dimensions[layer.maskSourceIndex];
      assertActiveDecodedPixelLimit(
        [canvasPixels * 9, source.pixels, maximumRotatedPixels * 5, mask?.pixels ?? 0],
        `Task ${task.id} layer ${index} working set`,
        maximumDecodedPixels,
      );
    }
    if (task.motionBlur.samples > 1) {
      assertActiveDecodedPixelLimit(
        [canvasPixels * 3],
        `Task ${task.id} motion-blur frame working set`,
        maximumDecodedPixels,
      );
    }
    if (task.preview.animatedGif) {
      assertActiveDecodedPixelLimit(
        [canvasPixels * task.frameCount, canvasPixels * 2],
        `Task ${task.id} animation-preview retained frame set`,
        maximumDecodedPixels,
      );
    }
    return;
  }

  if (task.kind === 'image-composite') {
    const canvasPixels = task.canvas.width * task.canvas.height;
    for (const [index, layer] of task.layers.entries()) {
      const source = dimensions[layer.sourceIndex];
      if (
        layer.sourceRect &&
        (layer.sourceRect.x + layer.sourceRect.width > source.width ||
          layer.sourceRect.y + layer.sourceRect.height > source.height)
      ) {
        fail('PROJECT_ART_SANDBOX_TASK_INVALID', `Task ${task.id} layer ${index} sourceRect escaped its source image.`);
      }
      const sourceWidth = layer.sourceRect?.width ?? source.width;
      const sourceHeight = layer.sourceRect?.height ?? source.height;
      const layerWidth = layer.width ?? sourceWidth;
      const layerHeight = layer.height ?? sourceHeight;
      const mask = layer.maskSourceIndex === null ? null : dimensions[layer.maskSourceIndex];
      if (
        layer.maskSourceRect && mask &&
        (layer.maskSourceRect.x + layer.maskSourceRect.width > mask.width ||
          layer.maskSourceRect.y + layer.maskSourceRect.height > mask.height)
      ) {
        fail('PROJECT_ART_SANDBOX_TASK_INVALID', `Task ${task.id} layer ${index} maskSourceRect escaped its mask image.`);
      }
      const canvasMultiplier = layer.blendMode === 'normal' ? 3 : 9;
      const layerMultiplier = mask ? 8 : 6;
      assertActiveDecodedPixelLimit(
        [
          canvasPixels * canvasMultiplier,
          source.pixels,
          layerWidth * layerHeight * (layerMultiplier - 1),
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
    assertDecodedPixelLimit(sheetWidth, sheetHeight, `Task ${task.id} assembled sheet`, maximumDecodedPixels);
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
    const sourceTotal = assertActiveDecodedPixelLimit(sourcePixels, `Task ${task.id} frame set`, maximumDecodedPixels);
    const maximumFramePixels = Math.max(...sourcePixels);
    if (dimensions.length > 1) {
      assertActiveDecodedPixelLimit([sourceTotal, maximumFramePixels], `Task ${task.id} transition working set`, maximumDecodedPixels);
    }
    if (task.preview.contactSheet) {
      const columns = Math.min(task.preview.columns, dimensions.length);
      const rows = Math.ceil(dimensions.length / columns);
      const cellWidth = Math.max(...dimensions.map((value) => value.width));
      const cellHeight = Math.max(...dimensions.map((value) => value.height));
      const sheetWidth = columns * cellWidth;
      const sheetHeight = rows * (cellHeight + REVIEW_LABEL_HEIGHT);
      assertDecodedPixelLimit(sheetWidth, sheetHeight, `Task ${task.id} contact sheet`, maximumDecodedPixels);
      assertActiveDecodedPixelLimit([sourceTotal, sheetWidth * sheetHeight * 2], `Task ${task.id} contact-sheet working set`, maximumDecodedPixels);
    }
    if (task.preview.animatedGif) {
      assertActiveDecodedPixelLimit(
        task.preview.interpolation === 'none'
          ? [sourceTotal, maximumFramePixels * 2]
          : [
              sourceTotal,
              maximumFramePixels * task.preview.renderedFrameCount,
              maximumFramePixels,
            ],
        `Task ${task.id} animation-preview working set`,
        maximumDecodedPixels,
      );
    }
    if (task.preview.onionSkins && dimensions.length > 1) {
      assertActiveDecodedPixelLimit([sourceTotal, maximumFramePixels * 5], `Task ${task.id} onion-skin working set`, maximumDecodedPixels);
    }
    return;
  }

  if (task.kind === 'image-compare') {
    const sourcePixels = dimensions.map((value) => value.pixels);
    const sourceTotal = assertActiveDecodedPixelLimit(sourcePixels, `Task ${task.id} comparison sources`, maximumDecodedPixels);
    if (dimensions[0].width === dimensions[1].width && dimensions[0].height === dimensions[1].height) {
      assertActiveDecodedPixelLimit([sourceTotal, dimensions[0].pixels * 2], `Task ${task.id} comparison working set`, maximumDecodedPixels);
    }
  }
}

function maximumSliceOutputFrames(task, externalById, maximumDecodedPixels) {
  if (task.count !== undefined) return task.count;
  const dimensions = externalTaskDimensions(task, externalById);
  if (dimensions) {
    const [source] = dimensions;
    const usableWidth = source.width - task.margin * 2;
    const usableHeight = source.height - task.margin * 2;
    const columns = Math.floor((usableWidth + task.spacing) / (task.frameWidth + task.spacing));
    const rows = Math.floor((usableHeight + task.spacing) / (task.frameHeight + task.spacing));
    if (columns < 1 || rows < 1) {
      fail(
        'PROJECT_ART_SANDBOX_TASK_INVALID',
        `Task ${task.id} has no complete slice cells.`,
      );
    }
    return columns * rows;
  }
  return Math.floor(maximumDecodedPixels / (task.frameWidth * task.frameHeight));
}

function maximumTaskOutputFiles(task, externalById, maximumDecodedPixels) {
  if (task.kind === 'slice-sheet') {
    return maximumSliceOutputFrames(task, externalById, maximumDecodedPixels) + 1;
  }
  if (task.kind === 'sequence-review') {
    return 1 + (task.preview.contactSheet ? 1 : 0) + (task.preview.animatedGif ? 1 : 0) + (task.preview.onionSkins ? Math.max(0, task.sources.length - 1) : 0);
  }
  if (task.kind === 'image-compare') {
    return 1 + (task.preview.difference ? 1 : 0) + (task.preview.overlay ? 1 : 0);
  }
  if (task.kind === 'image-master') return 2;
  if (task.kind === 'video-frame-extract') return task.timestampsMs.length + 1;
  if (task.kind === 'motion-sequence') {
    return task.frameCount + 1 + (task.preview.animatedGif ? 1 : 0);
  }
  return 1;
}

function assertOutputFileBudget(
  tasks,
  externalById,
  maximumDecodedPixels,
  maximumOutputFiles,
) {
  let total = 1; // create-only sandbox receipt
  for (const task of tasks) {
    total += maximumTaskOutputFiles(task, externalById, maximumDecodedPixels);
    if (total > maximumOutputFiles) {
      fail(
        'PROJECT_ART_SANDBOX_OUTPUT_COUNT_LIMIT',
        `Sandbox outputs exceed the ${maximumOutputFiles}-file publication boundary. ` +
          'Provide an explicit slice count or split the request into smaller sandboxes.',
      );
    }
  }
  return total;
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
    else if (kind === 'video-frame-extract') normalized = normalizeVideoFrameTask(task, index, registry, targetClaims);
    else if (kind === 'slice-sheet') normalized = normalizeSliceTask(task, index, registry, targetClaims);
    else if (kind === 'assemble-sheet') normalized = normalizeAssembleTask(task, index, registry, targetClaims);
    else if (kind === 'sequence-review') normalized = normalizeReviewTask(task, index, registry, targetClaims);
    else if (kind === 'image-composite') normalized = normalizeCompositeTask(task, index, targetClaims, registry);
    else if (kind === 'image-compare') normalized = normalizeCompareTask(task, index, targetClaims);
    else if (kind === 'image-master') normalized = normalizeMasterTask(task, index, registry, targetClaims);
    else normalized = normalizeMotionTask(task, index, registry, targetClaims);
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
  const sourceByteTotal = { value: 0 };
  const boundTasks = [];
  for (const task of normalizedTasks) {
    if (task.source) {
      boundTasks.push({
        ...task,
        source: await bindExternalSource(
          root,
          task.source,
          sourceMap,
          sourceByteTotal,
          registry,
          task.kind === 'video-frame-extract' ? 'video' : 'image',
        ),
      });
    } else {
      const sources = [];
      for (const source of task.sources) {
        sources.push(
          await bindExternalSource(
            root,
            source,
            sourceMap,
            sourceByteTotal,
            registry,
            'image',
          ),
        );
      }
      boundTasks.push({ ...task, sources });
    }
  }
  const externalSources = [...sourceMap.values()].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const externalById = new Map(externalSources.map((source) => [source.sourceId, source]));
  for (const task of boundTasks) {
    assertBoundTaskPixelBudgets(task, externalById, registry.maximumDecodedPixels);
  }
  const plannedMaximumOutputFiles = assertOutputFileBudget(
    boundTasks,
    externalById,
    registry.maximumDecodedPixels,
    registry.maximumOutputFiles,
  );
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
      maximumTotalSourceBytes: registry.maximumTotalSourceBytes,
      maximumDecodedPixels: registry.maximumDecodedPixels,
      maximumOutputFiles: registry.maximumOutputFiles,
      maximumOutputBytes: registry.maximumOutputBytes,
      maximumTotalOutputBytes: registry.maximumTotalOutputBytes,
      boundExternalSourceBytes: sourceByteTotal.value,
      plannedMaximumOutputFiles,
    },
    execution: {
      runtime: boundTasks.some((task) => task.kind === 'video-frame-extract')
        ? 'python-pillow-governed-ffmpeg'
        : 'python-pillow',
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
