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
  };
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

function normalizeSliceTask(task, taskIndex, targetClaims) {
  const targetDirectory = normalizeTargetPath(task.targetDirectory, `tasks[${taskIndex}].targetDirectory`, targetClaims);
  const fileNamePattern = task.fileNamePattern ?? 'frame-{index}.png';
  boundedString(fileNamePattern, `tasks[${taskIndex}].fileNamePattern`, 512);
  if (!fileNamePattern.includes('{index}') || fileNamePattern.includes('/') || !fileNamePattern.endsWith('.png')) {
    fail('PROJECT_ART_SANDBOX_TASK_INVALID', 'slice-sheet fileNamePattern must contain {index}, contain no slash, and end in .png.');
  }
  return {
    id: safeId(task.id, `tasks[${taskIndex}].id`),
    kind: 'slice-sheet',
    source: normalizedSourceDescriptor(task.source, `tasks[${taskIndex}].source`),
    targetDirectory,
    fileNamePattern,
    frameWidth: boundedInteger(task.frameWidth, `tasks[${taskIndex}].frameWidth`, 1, 65_536),
    frameHeight: boundedInteger(task.frameHeight, `tasks[${taskIndex}].frameHeight`, 1, 65_536),
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

function normalizeAssembleTask(task, taskIndex, targetClaims) {
  const targetPath = normalizeTargetPath(task.targetPath, `tasks[${taskIndex}].targetPath`, targetClaims);
  if (path.posix.extname(targetPath).toLowerCase() !== '.png') {
    fail('PROJECT_ART_SANDBOX_TARGET_INVALID', 'assemble-sheet targetPath must end in .png.');
  }
  const cell = task.cell === undefined ? null : task.cell;
  if (cell !== null && !isRecord(cell)) fail('PROJECT_ART_SANDBOX_TASK_INVALID', 'assemble-sheet cell must be an object.');
  return {
    id: safeId(task.id, `tasks[${taskIndex}].id`),
    kind: 'assemble-sheet',
    sources: normalizeSources(task.sources, `tasks[${taskIndex}].sources`),
    targetPath,
    columns: boundedInteger(task.columns, `tasks[${taskIndex}].columns`, 1, 10_000),
    ...(cell
      ? {
          cell: {
            width: boundedInteger(cell.width, `tasks[${taskIndex}].cell.width`, 1, 65_536),
            height: boundedInteger(cell.height, `tasks[${taskIndex}].cell.height`, 1, 65_536),
            fit: ['strict', 'contain', 'cover'].includes(cell.fit) ? cell.fit : 'strict',
            sampling: ['nearest', 'lanczos'].includes(cell.sampling) ? cell.sampling : 'nearest',
          },
        }
      : {}),
    padding: boundedInteger(task.padding ?? 0, `tasks[${taskIndex}].padding`, 0, 4096),
    background: task.background ?? '#00000000',
  };
}

function normalizeReviewTask(task, taskIndex, targetClaims) {
  const targetDirectory = normalizeTargetPath(task.targetDirectory, `tasks[${taskIndex}].targetDirectory`, targetClaims);
  const thresholds = isRecord(task.thresholds) ? task.thresholds : {};
  return {
    id: safeId(task.id, `tasks[${taskIndex}].id`),
    kind: 'sequence-review',
    sources: normalizeSources(task.sources, `tasks[${taskIndex}].sources`),
    targetDirectory,
    expectedWidth:
      task.expectedWidth === undefined
        ? null
        : boundedInteger(task.expectedWidth, `tasks[${taskIndex}].expectedWidth`, 1, 65_536),
    expectedHeight:
      task.expectedHeight === undefined
        ? null
        : boundedInteger(task.expectedHeight, `tasks[${taskIndex}].expectedHeight`, 1, 65_536),
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
    preview: {
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
    else if (kind === 'slice-sheet') normalized = normalizeSliceTask(task, index, targetClaims);
    else if (kind === 'assemble-sheet') normalized = normalizeAssembleTask(task, index, targetClaims);
    else normalized = normalizeReviewTask(task, index, targetClaims);
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
      maximumDecodedPixels: rawRegistry.maximumDecodedPixels,
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
