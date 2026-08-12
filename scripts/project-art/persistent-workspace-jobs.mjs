import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

export const JOB_REQUEST_SCHEMA = 'evavo.persistent-artist-workspace-job-request.v1';
export const JOB_PLAN_SCHEMA = 'evavo.persistent-artist-workspace-job-plan.v1';
export const JOB_EVENT_SCHEMA = 'evavo.persistent-artist-workspace-job-event.v1';
export const JOB_COMMIT_SCHEMA = 'evavo.persistent-artist-workspace-job-commit.v1';
export const JOB_STATE_SCHEMA = 'evavo.persistent-artist-workspace-job-state.v1';

const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_STEPS = 512;
const MAX_DEPENDENCIES = 64;
const MAX_INPUTS = 256;
const MAX_OUTPUTS = 256;
const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_EVENTS = 50_000;
const MAX_STRING = 4096;
const MAX_LEASE_SECONDS = 24 * 60 * 60;
const ALLOWED_STEP_KINDS = new Set([
  'external-ingest',
  'workspace-operation',
  'workspace-catalog',
  'sprite-atlas',
  'workspace-snapshot',
  'visual-review',
  'storage-handoff',
  'repository-handoff',
  'manual-checkpoint',
]);

function fail(code, message, data) {
  const error = new Error(message);
  error.code = code;
  if (data !== undefined) error.data = data;
  throw error;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value, label, { min = 1, max = MAX_STRING } = {}) {
  if (typeof value !== 'string' || value.length < min || value.length > max || value.includes('\0')) {
    fail('ARTIST_WORKSPACE_JOB_INVALID', `${label} must be a ${min}-${max} character string.`);
  }
  return value;
}

function safeId(value, label) {
  boundedString(value, label, { max: 120 });
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value) || value === '.' || value === '..') {
    fail('ARTIST_WORKSPACE_JOB_INVALID', `${label} must be a safe identifier.`);
  }
  return value;
}

function rejectUnknownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail('ARTIST_WORKSPACE_JOB_INVALID', `${label} contains unsupported key: ${key}.`);
  }
}

function requireIsoTimestamp(value, label) {
  boundedString(value, label, { max: 80 });
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail('ARTIST_WORKSPACE_JOB_INVALID', `${label} must be a valid ISO timestamp.`);
  return new Date(parsed).toISOString();
}

function canonicalRelativePath(value, label) {
  boundedString(value, label, { max: 8192 });
  const normalized = value.replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized)) {
    fail('ARTIST_WORKSPACE_JOB_PATH_INVALID', `${label} must be workspace-relative.`);
  }
  const parts = normalized.split('/');
  if (parts.some((part) => part.length === 0 || part === '.' || part === '..')) {
    fail('ARTIST_WORKSPACE_JOB_PATH_INVALID', `${label} contains an unsafe path component.`);
  }
  return parts.join('/');
}

function sortCanonical(value) {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortCanonical(value[key])]));
}

export function canonicalJson(value) {
  return `${JSON.stringify(sortCanonical(value))}\n`;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function withoutDocumentHash(document) {
  const clone = structuredClone(document);
  delete clone.documentSha256;
  return clone;
}

export function withDocumentHash(document) {
  return {
    ...document,
    documentSha256: sha256(Buffer.from(canonicalJson(withoutDocumentHash(document)), 'utf8')),
  };
}

export function verifyDocumentHash(document, label = 'document') {
  if (!isRecord(document) || !/^[a-f0-9]{64}$/.test(document.documentSha256 ?? '')) {
    fail('ARTIST_WORKSPACE_JOB_HASH_INVALID', `${label} is missing a valid documentSha256.`);
  }
  const expected = sha256(Buffer.from(canonicalJson(withoutDocumentHash(document)), 'utf8'));
  if (expected !== document.documentSha256) {
    fail('ARTIST_WORKSPACE_JOB_HASH_MISMATCH', `${label} documentSha256 does not match its content.`);
  }
  return true;
}

function insideRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function requireDirectoryNoSymlink(value, label) {
  const absolute = path.resolve(value);
  const metadata = await lstat(absolute).catch((error) => {
    fail('ARTIST_WORKSPACE_JOB_PATH_INVALID', `${label} cannot be inspected: ${error.message}`);
  });
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    fail('ARTIST_WORKSPACE_JOB_PATH_INVALID', `${label} must be a non-symbolic directory.`);
  }
  return realpath(absolute);
}

async function rejectSymbolicChain(root, relative, { allowMissingLeaf = false } = {}) {
  const canonical = canonicalRelativePath(relative, 'workspace path');
  let current = root;
  const parts = canonical.split('/');
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    let metadata;
    try {
      metadata = await lstat(current);
    } catch (error) {
      if (error?.code === 'ENOENT' && allowMissingLeaf && index === parts.length - 1) return current;
      throw error;
    }
    if (metadata.isSymbolicLink()) {
      fail('ARTIST_WORKSPACE_JOB_PATH_INVALID', `Symbolic workspace path component is not allowed: ${relative}`);
    }
    if (index < parts.length - 1 && !metadata.isDirectory()) {
      fail('ARTIST_WORKSPACE_JOB_PATH_INVALID', `Non-directory workspace path component: ${relative}`);
    }
    const resolved = await realpath(current);
    if (!insideRoot(root, resolved)) {
      fail('ARTIST_WORKSPACE_JOB_PATH_INVALID', `Workspace path escaped root: ${relative}`);
    }
    current = resolved;
  }
  return current;
}

async function resolveJobPath(root, relative, label, { allowMissingLeaf = false, requireDirectory = false } = {}) {
  let absolute;
  try {
    absolute = await rejectSymbolicChain(root, relative, { allowMissingLeaf });
  } catch (error) {
    if (typeof error?.code === 'string' && error.code.startsWith('ARTIST_WORKSPACE_JOB_')) throw error;
    fail('ARTIST_WORKSPACE_JOB_PATH_INVALID', `${label} cannot be resolved safely: ${error.message}`);
  }
  if (requireDirectory) {
    const metadata = await lstat(absolute).catch((error) => {
      fail('ARTIST_WORKSPACE_JOB_PATH_INVALID', `${label} cannot be inspected: ${error.message}`);
    });
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      fail('ARTIST_WORKSPACE_JOB_PATH_INVALID', `${label} must be a non-symbolic directory.`);
    }
    const resolved = await realpath(absolute).catch((error) => {
      fail('ARTIST_WORKSPACE_JOB_PATH_INVALID', `${label} cannot be resolved: ${error.message}`);
    });
    if (!insideRoot(root, resolved)) fail('ARTIST_WORKSPACE_JOB_PATH_INVALID', `${label} escaped workspaceRoot.`);
    absolute = resolved;
  }
  return absolute;
}

async function snapshotFile(root, relative, label = 'file') {
  const canonical = canonicalRelativePath(relative, label);
  const absolute = await rejectSymbolicChain(root, canonical);
  const before = await lstat(absolute);
  if (before.isSymbolicLink() || !before.isFile()) {
    fail('ARTIST_WORKSPACE_JOB_PATH_INVALID', `${label} must be a regular non-symbolic file: ${canonical}`);
  }
  if (before.nlink !== 1) {
    fail('ARTIST_WORKSPACE_JOB_MULTIPLY_LINKED', `${label} must have exactly one filesystem link: ${canonical}`);
  }
  if (before.size < 0 || before.size > MAX_EVIDENCE_BYTES) {
    fail('ARTIST_WORKSPACE_JOB_FILE_TOO_LARGE', `${label} exceeds the bounded evidence size: ${canonical}`);
  }
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const handle = await open(absolute, flags).catch((error) => {
    fail('ARTIST_WORKSPACE_JOB_PATH_CHANGED', `${label} could not be opened safely: ${error.message}`);
  });
  try {
    const handleBefore = await handle.stat();
    const bytes = await handle.readFile();
    const [handleAfter, pathAfter] = await Promise.all([handle.stat(), lstat(absolute)]);
    const stable =
      handleBefore.dev === before.dev && handleBefore.ino === before.ino &&
      handleAfter.dev === before.dev && handleAfter.ino === before.ino &&
      pathAfter.dev === before.dev && pathAfter.ino === before.ino &&
      handleAfter.size === before.size && pathAfter.size === before.size && bytes.length === before.size &&
      handleAfter.mtimeMs === before.mtimeMs && pathAfter.mtimeMs === before.mtimeMs &&
      handleAfter.ctimeMs === before.ctimeMs && pathAfter.ctimeMs === before.ctimeMs &&
      pathAfter.nlink === 1;
    if (!stable) fail('ARTIST_WORKSPACE_JOB_PATH_CHANGED', `${label} changed while being fingerprinted: ${canonical}`);
    return { path: canonical, bytes: bytes.length, sha256: sha256(bytes) };
  } finally {
    await handle.close();
  }
}

function validateRequest(request) {
  if (!isRecord(request) || request.schema !== JOB_REQUEST_SCHEMA) {
    fail('ARTIST_WORKSPACE_JOB_INVALID', `Job request must use ${JOB_REQUEST_SCHEMA}.`);
  }
  rejectUnknownKeys(request, new Set(['schema', 'jobId', 'workspaceId', 'projectId', 'title', 'steps']), 'job request');
  const workspaceId = safeId(request.workspaceId, 'workspaceId');
  const projectId = safeId(request.projectId, 'projectId');
  const title = boundedString(request.title, 'title', { max: 240 });
  if (!Array.isArray(request.steps) || request.steps.length < 1 || request.steps.length > MAX_STEPS) {
    fail('ARTIST_WORKSPACE_JOB_INVALID', `steps must contain 1-${MAX_STEPS} entries.`);
  }
  const seen = new Set();
  const steps = request.steps.map((raw, index) => {
    if (!isRecord(raw)) fail('ARTIST_WORKSPACE_JOB_INVALID', `steps[${index}] must be an object.`);
    rejectUnknownKeys(raw, new Set(['id', 'kind', 'description', 'requires', 'inputs', 'outputs', 'tool']), `steps[${index}]`);
    const id = safeId(raw.id, `steps[${index}].id`);
    if (seen.has(id)) fail('ARTIST_WORKSPACE_JOB_INVALID', `Duplicate step id: ${id}`);
    seen.add(id);
    const kind = boundedString(raw.kind, `steps[${index}].kind`, { max: 80 });
    if (!ALLOWED_STEP_KINDS.has(kind)) fail('ARTIST_WORKSPACE_JOB_INVALID', `Unsupported step kind: ${kind}`);
    const description = boundedString(raw.description, `steps[${index}].description`, { max: 1000 });
    const requires = raw.requires ?? [];
    const inputs = raw.inputs ?? [];
    const outputs = raw.outputs ?? [];
    if (!Array.isArray(requires) || requires.length > MAX_DEPENDENCIES) fail('ARTIST_WORKSPACE_JOB_INVALID', `${id}.requires is invalid.`);
    if (!Array.isArray(inputs) || inputs.length > MAX_INPUTS) fail('ARTIST_WORKSPACE_JOB_INVALID', `${id}.inputs is invalid.`);
    if (!Array.isArray(outputs) || outputs.length > MAX_OUTPUTS) fail('ARTIST_WORKSPACE_JOB_INVALID', `${id}.outputs is invalid.`);
    return {
      id,
      kind,
      description,
      requires: [...new Set(requires.map((value, depIndex) => safeId(value, `${id}.requires[${depIndex}]`)))],
      inputs: [...new Set(inputs.map((value, inputIndex) => canonicalRelativePath(value, `${id}.inputs[${inputIndex}]`)))],
      outputs: [...new Set(outputs.map((value, outputIndex) => canonicalRelativePath(value, `${id}.outputs[${outputIndex}]`)))],
      ...(raw.tool === undefined ? {} : (() => {
        const tool = boundedString(raw.tool, `${id}.tool`, { max: 180 });
        if (!/^evavo_art_[a-z0-9_]+$/.test(tool)) fail('ARTIST_WORKSPACE_JOB_INVALID', `${id}.tool must name an existing evavo_art_* tool.`);
        return { tool };
      })()),
    };
  });
  for (const step of steps) {
    for (const dep of step.requires) {
      if (!seen.has(dep)) fail('ARTIST_WORKSPACE_JOB_INVALID', `${step.id} depends on unknown step ${dep}.`);
      if (dep === step.id) fail('ARTIST_WORKSPACE_JOB_INVALID', `${step.id} cannot depend on itself.`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const byId = new Map(steps.map((step) => [step.id, step]));
  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) fail('ARTIST_WORKSPACE_JOB_INVALID', `Dependency cycle detected at ${id}.`);
    visiting.add(id);
    for (const dep of byId.get(id).requires) visit(dep);
    visiting.delete(id);
    visited.add(id);
  }
  for (const step of steps) visit(step.id);
  return { workspaceId, projectId, title, steps };
}

function planInvalid(message, data) {
  fail('ARTIST_WORKSPACE_JOB_PLAN_INVALID', message, data);
}

function planValue(label, callback) {
  try {
    return callback();
  } catch (error) {
    if (error?.code === 'ARTIST_WORKSPACE_JOB_PLAN_INVALID') throw error;
    planInvalid(`${label} is invalid: ${error.message}`, { causeCode: error?.code ?? null });
  }
}

function requirePlanKeys(value, requiredKeys, optionalKeys, label) {
  if (!isRecord(value)) planInvalid(`${label} must be an object.`);
  const required = new Set(requiredKeys);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) planInvalid(`${label} contains unsupported key: ${key}.`);
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) planInvalid(`${label} is missing required key: ${key}.`);
  }
}

function requirePlanUniqueArray(value, maximum, label) {
  if (!Array.isArray(value) || value.length > maximum) planInvalid(`${label} must be an array with at most ${maximum} entries.`);
  if (new Set(value).size !== value.length) planInvalid(`${label} must not contain duplicate entries.`);
  return value;
}

function canonicalPlanPath(value, label) {
  const canonical = planValue(label, () => canonicalRelativePath(value, label));
  if (canonical !== value) planInvalid(`${label} must already use canonical workspace-relative path syntax.`);
  return canonical;
}

function validatePlan(plan) {
  if (!isRecord(plan) || plan.schema !== JOB_PLAN_SCHEMA) planInvalid(`Plan must use ${JOB_PLAN_SCHEMA}.`);
  verifyDocumentHash(plan, 'job plan');
  requirePlanKeys(
    plan,
    ['schema', 'version', 'jobId', 'workspaceId', 'projectId', 'title', 'workspaceRoot', 'compiledAt', 'requestSha256', 'steps', 'publication', 'execution', 'authority', 'documentSha256'],
    [],
    'job plan',
  );
  if (plan.version !== 1) planInvalid('Job plan version must be 1.');
  const jobId = planValue('jobId', () => safeId(plan.jobId, 'jobId'));
  planValue('workspaceId', () => safeId(plan.workspaceId, 'workspaceId'));
  planValue('projectId', () => safeId(plan.projectId, 'projectId'));
  planValue('title', () => boundedString(plan.title, 'title', { max: 240 }));
  if (typeof plan.workspaceRoot !== 'string' || plan.workspaceRoot.length < 1 || plan.workspaceRoot.length > 8192 || plan.workspaceRoot.includes('\0')) {
    planInvalid('workspaceRoot must be a bounded absolute path string.');
  }
  if (!path.isAbsolute(plan.workspaceRoot) || path.resolve(plan.workspaceRoot) !== plan.workspaceRoot) {
    planInvalid('workspaceRoot must already be an absolute normalized path.');
  }
  const canonicalCompiledAt = planValue('compiledAt', () => requireIsoTimestamp(plan.compiledAt, 'compiledAt'));
  if (canonicalCompiledAt !== plan.compiledAt) planInvalid('compiledAt must already be canonical ISO-8601 text.');
  if (!/^[a-f0-9]{64}$/.test(plan.requestSha256 ?? '')) planInvalid('requestSha256 must be a lowercase SHA-256 digest.');
  if (!Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > MAX_STEPS) planInvalid(`Plan steps must contain 1-${MAX_STEPS} entries.`);

  const seen = new Set();
  const validatedSteps = plan.steps.map((raw, index) => {
    const label = `plan.steps[${index}]`;
    requirePlanKeys(raw, ['id', 'kind', 'description', 'requires', 'inputs', 'outputs', 'inputFingerprints'], ['tool'], label);
    const id = planValue(`${label}.id`, () => safeId(raw.id, `${label}.id`));
    if (seen.has(id)) planInvalid(`Duplicate plan step id: ${id}.`);
    seen.add(id);
    const kind = planValue(`${label}.kind`, () => boundedString(raw.kind, `${label}.kind`, { max: 80 }));
    if (!ALLOWED_STEP_KINDS.has(kind)) planInvalid(`Unsupported plan step kind: ${kind}.`);
    planValue(`${label}.description`, () => boundedString(raw.description, `${label}.description`, { max: 1000 }));

    const requires = requirePlanUniqueArray(raw.requires, MAX_DEPENDENCIES, `${label}.requires`)
      .map((value, depIndex) => planValue(`${label}.requires[${depIndex}]`, () => safeId(value, `${label}.requires[${depIndex}]`)));
    const inputs = requirePlanUniqueArray(raw.inputs, MAX_INPUTS, `${label}.inputs`)
      .map((value, inputIndex) => canonicalPlanPath(value, `${label}.inputs[${inputIndex}]`));
    const outputs = requirePlanUniqueArray(raw.outputs, MAX_OUTPUTS, `${label}.outputs`)
      .map((value, outputIndex) => canonicalPlanPath(value, `${label}.outputs[${outputIndex}]`));

    if (raw.tool !== undefined) {
      const tool = planValue(`${label}.tool`, () => boundedString(raw.tool, `${label}.tool`, { max: 180 }));
      if (!/^evavo_art_[a-z0-9_]+$/.test(tool)) planInvalid(`${label}.tool must name an existing evavo_art_* tool.`);
    }

    if (!Array.isArray(raw.inputFingerprints) || raw.inputFingerprints.length !== inputs.length) {
      planInvalid(`${label}.inputFingerprints must contain exactly one fingerprint for each declared input.`);
    }
    raw.inputFingerprints.forEach((fingerprint, fingerprintIndex) => {
      const fingerprintLabel = `${label}.inputFingerprints[${fingerprintIndex}]`;
      requirePlanKeys(fingerprint, ['path', 'bytes', 'sha256'], [], fingerprintLabel);
      const fingerprintPath = canonicalPlanPath(fingerprint.path, `${fingerprintLabel}.path`);
      if (fingerprintPath !== inputs[fingerprintIndex]) {
        planInvalid(`${fingerprintLabel}.path must bind the corresponding declared input path.`);
      }
      if (!Number.isSafeInteger(fingerprint.bytes) || fingerprint.bytes < 0 || fingerprint.bytes > MAX_EVIDENCE_BYTES) {
        planInvalid(`${fingerprintLabel}.bytes is outside the bounded evidence size.`);
      }
      if (!/^[a-f0-9]{64}$/.test(fingerprint.sha256 ?? '')) planInvalid(`${fingerprintLabel}.sha256 must be a lowercase SHA-256 digest.`);
    });

    return { id, requires, inputs, outputs };
  });

  const byId = new Map(validatedSteps.map((step) => [step.id, step]));
  for (const step of validatedSteps) {
    for (const dependency of step.requires) {
      if (!seen.has(dependency)) planInvalid(`${step.id} depends on unknown step ${dependency}.`);
      if (dependency === step.id) planInvalid(`${step.id} cannot depend on itself.`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) planInvalid(`Dependency cycle detected at ${id}.`);
    visiting.add(id);
    for (const dependency of byId.get(id).requires) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const step of validatedSteps) visit(step.id);

  requirePlanKeys(plan.publication, ['relativeRoot', 'planFile', 'eventsDirectory', 'commitFile'], [], 'plan.publication');
  if (plan.publication.relativeRoot !== `journals/jobs/${jobId}`) planInvalid('plan.publication.relativeRoot does not match the job identity.');
  if (plan.publication.planFile !== 'job-plan.json') planInvalid('plan.publication.planFile must remain job-plan.json.');
  if (plan.publication.eventsDirectory !== 'events') planInvalid('plan.publication.eventsDirectory must remain events.');
  if (plan.publication.commitFile !== 'job-commit.json') planInvalid('plan.publication.commitFile must remain job-commit.json.');

  const requiredExecutionFlags = [
    'appendOnlyEvents',
    'createOnlyPlan',
    'staleLeaseRecovery',
    'compareAndAppendEvents',
    'exactInputRevalidationBeforeStart',
    'exactOutputEvidenceOnSuccess',
  ];
  requirePlanKeys(plan.execution, requiredExecutionFlags, ['revalidateJournalPathChainOnReadAndAppend'], 'plan.execution');
  for (const key of requiredExecutionFlags) {
    if (plan.execution[key] !== true) planInvalid(`plan.execution.${key} must remain true.`);
  }
  if (Object.prototype.hasOwnProperty.call(plan.execution, 'revalidateJournalPathChainOnReadAndAppend') && plan.execution.revalidateJournalPathChainOnReadAndAppend !== true) {
    planInvalid('plan.execution.revalidateJournalPathChainOnReadAndAppend must be true when present.');
  }

  const authority = authorityBoundary();
  requirePlanKeys(plan.authority, Object.keys(authority), [], 'plan.authority');
  for (const key of Object.keys(authority)) {
    if (plan.authority[key] !== false) planInvalid(`plan.authority.${key} must remain false.`);
  }
  return plan;
}

function authorityBoundary() {
  return {
    arbitraryShell: false,
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    sourceMutation: false,
    sourceDeletion: false,
    storageWrite: false,
    targetRepositoryMutation: false,
    gitPublication: false,
    deployment: false,
    publication: false,
    forcePush: false,
  };
}

export function jobCapabilities() {
  return {
    schema: 'evavo.persistent-artist-workspace-job-capabilities.v1',
    jobRequestSchema: JOB_REQUEST_SCHEMA,
    jobPlanSchema: JOB_PLAN_SCHEMA,
    eventSchema: JOB_EVENT_SCHEMA,
    stateSchema: JOB_STATE_SCHEMA,
    maximumSteps: MAX_STEPS,
    maximumEvents: MAX_EVENTS,
    maximumLeaseSeconds: MAX_LEASE_SECONDS,
    appendOnlyEvents: true,
    createOnlyPlans: true,
    exactInputFingerprints: true,
    exactOutputEvidence: true,
    crashResumable: true,
    staleLeaseRecovery: true,
    optimisticConcurrency: true,
    postCreationPathChainRevalidation: true,
    strictRehashedPlanAdmission: true,
    imageBytesThroughMcp: false,
    authority: authorityBoundary(),
  };
}

export async function readStableJsonFile(filePath, label = 'JSON file') {
  const absolute = path.resolve(filePath);
  const before = await lstat(absolute).catch((error) => fail('ARTIST_WORKSPACE_JOB_INPUT_INVALID', `${label} cannot be inspected: ${error.message}`));
  if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1 || before.size < 2 || before.size > MAX_REQUEST_BYTES) {
    fail('ARTIST_WORKSPACE_JOB_INPUT_INVALID', `${label} must be a bounded, singly-linked regular file.`);
  }
  const handle = await open(absolute, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || after.mtimeMs !== before.mtimeMs || bytes.length !== before.size) {
      fail('ARTIST_WORKSPACE_JOB_INPUT_CHANGED', `${label} changed while being read.`);
    }
    let value;
    try { value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, '')); }
    catch (error) { fail('ARTIST_WORKSPACE_JOB_INPUT_INVALID', `${label} is not valid UTF-8 JSON: ${error.message}`); }
    return { value, bytes };
  } finally {
    await handle.close();
  }
}

async function writeJsonCreateOnly(filePath, value) {
  const bytes = Buffer.from(canonicalJson(value), 'utf8');
  const handle = await open(filePath, 'wx', 0o600).catch((error) => {
    if (error?.code === 'EEXIST') fail('ARTIST_WORKSPACE_JOB_COLLISION', `Create-only path already exists: ${filePath}`);
    throw error;
  });
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return bytes.length;
}

export async function compileWorkspaceJob({ workspaceRoot, request, requestBytes, outputPath, compiledAt = new Date().toISOString() }) {
  const root = await requireDirectoryNoSymlink(workspaceRoot, 'workspaceRoot');
  const validated = validateRequest(request);
  if (requestBytes !== undefined) {
    if (!Buffer.isBuffer(requestBytes) || requestBytes.length < 2 || requestBytes.length > MAX_REQUEST_BYTES) fail('ARTIST_WORKSPACE_JOB_INVALID', 'requestBytes are outside the bounded JSON boundary.');
    let decoded;
    try { decoded = JSON.parse(requestBytes.toString('utf8').replace(/^\uFEFF/u, '')); }
    catch (error) { fail('ARTIST_WORKSPACE_JOB_INVALID', `requestBytes are not valid JSON: ${error.message}`); }
    if (canonicalJson(decoded) !== canonicalJson(request)) fail('ARTIST_WORKSPACE_JOB_INVALID', 'requestBytes do not encode the supplied request exactly.');
  }
  const compiledSteps = [];
  for (const step of validated.steps) {
    const inputs = [];
    for (const relative of step.inputs) inputs.push(await snapshotFile(root, relative, `step ${step.id} input`));
    compiledSteps.push({ ...step, inputFingerprints: inputs });
  }
  const canonicalCompiledAt = requireIsoTimestamp(compiledAt, 'compiledAt');
  const requestDigest = requestBytes === undefined
    ? sha256(Buffer.from(canonicalJson(request), 'utf8'))
    : sha256(requestBytes);
  const jobId = safeId(request.jobId ?? `job-${requestDigest.slice(0, 20)}`, 'jobId');
  const plan = withDocumentHash({
    schema: JOB_PLAN_SCHEMA,
    version: 1,
    jobId,
    workspaceId: validated.workspaceId,
    projectId: validated.projectId,
    title: validated.title,
    workspaceRoot: root,
    compiledAt: canonicalCompiledAt,
    requestSha256: requestDigest,
    steps: compiledSteps,
    publication: {
      relativeRoot: `journals/jobs/${jobId}`,
      planFile: 'job-plan.json',
      eventsDirectory: 'events',
      commitFile: 'job-commit.json',
    },
    execution: {
      appendOnlyEvents: true,
      createOnlyPlan: true,
      staleLeaseRecovery: true,
      compareAndAppendEvents: true,
      revalidateJournalPathChainOnReadAndAppend: true,
      exactInputRevalidationBeforeStart: true,
      exactOutputEvidenceOnSuccess: true,
    },
    authority: authorityBoundary(),
  });
  if (outputPath) await writeJsonCreateOnly(path.resolve(outputPath), plan);
  return plan;
}

function jobPaths(root, jobId) {
  const safeJobId = safeId(jobId, 'jobId');
  const jobRoot = path.join(root, 'journals', 'jobs', safeJobId);
  return {
    jobRoot,
    planPath: path.join(jobRoot, 'job-plan.json'),
    eventsRoot: path.join(jobRoot, 'events'),
    commitPath: path.join(jobRoot, 'job-commit.json'),
  };
}

async function ensureSafeJobParent(root) {
  for (const relative of ['journals', 'journals/jobs']) {
    let current = root;
    for (const part of relative.split('/')) {
      current = path.join(current, part);
      let metadata;
      try { metadata = await lstat(current); }
      catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        await mkdir(current, { recursive: false, mode: 0o700 }).catch((createError) => {
          if (createError?.code !== 'EEXIST') throw createError;
        });
        metadata = await lstat(current);
      }
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) fail('ARTIST_WORKSPACE_JOB_PATH_INVALID', `${relative} contains a symbolic or non-directory component.`);
      const resolved = await realpath(current);
      if (!insideRoot(root, resolved)) fail('ARTIST_WORKSPACE_JOB_PATH_INVALID', `${relative} escaped workspaceRoot.`);
      current = resolved;
    }
  }
}

function eventFilename(sequence) {
  return `${String(sequence).padStart(6, '0')}.json`;
}

export async function createWorkspaceJob({ workspaceRoot, plan, createdAt = new Date().toISOString() }) {
  const root = await requireDirectoryNoSymlink(workspaceRoot, 'workspaceRoot');
  const canonicalCreatedAt = requireIsoTimestamp(createdAt, 'createdAt');
  validatePlan(plan);
  if (plan.workspaceRoot !== root) fail('ARTIST_WORKSPACE_JOB_PLAN_INVALID', 'Plan workspaceRoot does not match execution workspaceRoot.');
  await ensureSafeJobParent(root);
  const paths = jobPaths(root, plan.jobId);
  await mkdir(paths.jobRoot, { recursive: false, mode: 0o700 }).catch((error) => {
    if (error?.code === 'EEXIST') fail('ARTIST_WORKSPACE_JOB_COLLISION', `Job already exists: ${plan.jobId}`);
    throw error;
  });
  try {
    await mkdir(paths.eventsRoot, { recursive: false, mode: 0o700 });
    await writeJsonCreateOnly(paths.planPath, plan);
    const createdEvent = withDocumentHash({
      schema: JOB_EVENT_SCHEMA,
      version: 1,
      jobId: plan.jobId,
      sequence: 1,
      type: 'created',
      at: canonicalCreatedAt,
      actor: 'system',
      previousEventSha256: null,
      details: { planSha256: plan.documentSha256 },
    });
    await writeJsonCreateOnly(path.join(paths.eventsRoot, eventFilename(1)), createdEvent);
    const commit = withDocumentHash({
      schema: JOB_COMMIT_SCHEMA,
      version: 1,
      jobId: plan.jobId,
      committedAt: canonicalCreatedAt,
      planSha256: plan.documentSha256,
      initialEventSha256: createdEvent.documentSha256,
    });
    await writeJsonCreateOnly(paths.commitPath, commit);
  } catch (error) {
    await rm(paths.jobRoot, { recursive: true, force: true });
    throw error;
  }
  return inspectWorkspaceJob({ workspaceRoot: root, jobId: plan.jobId });
}

async function readPlanFromRoot(root, jobId) {
  const safeJobId = safeId(jobId, 'jobId');
  const relativeRoot = `journals/jobs/${safeJobId}`;
  const jobRoot = await resolveJobPath(root, relativeRoot, 'job root', { requireDirectory: true });
  const planPath = await resolveJobPath(root, `${relativeRoot}/job-plan.json`, 'job plan path');
  const eventsRoot = await resolveJobPath(root, `${relativeRoot}/events`, 'job events directory', { requireDirectory: true });
  const commitPath = await resolveJobPath(root, `${relativeRoot}/job-commit.json`, 'job commit marker path');
  const { value: commit } = await readStableJsonFile(commitPath, 'job commit marker');
  if (!isRecord(commit) || commit.schema !== JOB_COMMIT_SCHEMA || commit.jobId !== safeJobId) {
    fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', 'Job commit marker is missing or invalid.');
  }
  verifyDocumentHash(commit, 'job commit marker');
  const { value } = await readStableJsonFile(planPath, 'job plan');
  validatePlan(value);
  if (value.workspaceRoot !== root) fail('ARTIST_WORKSPACE_JOB_PLAN_INVALID', 'Job plan workspaceRoot does not match the inspected root.');
  if (value.jobId !== safeJobId) fail('ARTIST_WORKSPACE_JOB_PLAN_INVALID', 'Job plan jobId does not match its directory.');
  if (commit.planSha256 !== value.documentSha256) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', 'Job commit marker does not bind the current plan.');
  const initialEventPath = await resolveJobPath(root, `${relativeRoot}/events/${eventFilename(1)}`, 'initial job event path');
  const { value: initialEvent } = await readStableJsonFile(initialEventPath, 'initial job event');
  if (initialEvent.documentSha256 !== commit.initialEventSha256) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', 'Job commit marker does not bind the initial event.');
  return { plan: value, commit, jobRoot, planPath, eventsRoot, commitPath };
}

async function readEvents(root, jobId) {
  const safeJobId = safeId(jobId, 'jobId');
  const relativeEventsRoot = `journals/jobs/${safeJobId}/events`;
  const eventsRoot = await resolveJobPath(root, relativeEventsRoot, 'job events directory', { requireDirectory: true });
  const names = (await readdir(eventsRoot)).filter((name) => /^\d{6}\.json$/.test(name)).sort();
  if (names.length < 1 || names.length > MAX_EVENTS) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Job event count must be 1-${MAX_EVENTS}.`);
  const events = [];
  let previous = null;
  for (let index = 0; index < names.length; index += 1) {
    const expectedName = eventFilename(index + 1);
    if (names[index] !== expectedName) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Job event sequence is not contiguous at ${expectedName}.`);
    const eventPath = await resolveJobPath(root, `${relativeEventsRoot}/${names[index]}`, `job event ${expectedName} path`);
    const { value } = await readStableJsonFile(eventPath, `job event ${expectedName}`);
    if (!isRecord(value) || value.schema !== JOB_EVENT_SCHEMA || value.jobId !== safeJobId || value.sequence !== index + 1) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Job event ${expectedName} has invalid identity.`);
    verifyDocumentHash(value, `job event ${expectedName}`);
    const expectedPrevious = previous?.documentSha256 ?? null;
    if (value.previousEventSha256 !== expectedPrevious) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Job event ${expectedName} broke the hash chain.`);
    events.push(value);
    previous = value;
  }
  return events;
}

function derivedState(plan, events, nowMs = Date.now()) {
  const stepStates = Object.fromEntries(plan.steps.map((step) => [step.id, { status: 'pending', attempts: 0, evidence: [] }]));
  let status = 'ready';
  let paused = false;
  let cancelled = false;
  let activeLease = null;
  const failures = [];
  for (const event of events) {
    switch (event.type) {
      case 'created': break;
      case 'claimed': {
        const expiresAtMs = Date.parse(event.details?.expiresAt ?? '');
        if (!Number.isFinite(expiresAtMs)) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', 'Claim event has invalid expiresAt.');
        activeLease = { actor: event.actor, claimedAt: event.at, expiresAt: event.details.expiresAt, expiresAtMs, eventSha256: event.documentSha256 };
        break;
      }
      case 'released': activeLease = null; break;
      case 'paused': paused = true; break;
      case 'resumed': paused = false; break;
      case 'cancelled': cancelled = true; activeLease = null; break;
      case 'step-started': {
        const state = stepStates[event.stepId];
        if (!state) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Event references unknown step ${event.stepId}.`);
        state.status = 'in-progress';
        state.attempts += 1;
        state.startedAt = event.at;
        state.actor = event.actor;
        break;
      }
      case 'step-succeeded': {
        const state = stepStates[event.stepId];
        if (!state) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Event references unknown step ${event.stepId}.`);
        state.status = 'succeeded';
        state.completedAt = event.at;
        state.actor = event.actor;
        state.evidence = Array.isArray(event.details?.evidence) ? event.details.evidence : [];
        break;
      }
      case 'step-failed': {
        const state = stepStates[event.stepId];
        if (!state) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Event references unknown step ${event.stepId}.`);
        state.status = 'failed';
        state.failedAt = event.at;
        state.actor = event.actor;
        state.error = event.details?.message ?? 'step failed';
        failures.push({ stepId: event.stepId, at: event.at, message: state.error });
        break;
      }
      default: fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Unsupported job event type: ${event.type}`);
    }
  }
  if (activeLease && activeLease.expiresAtMs <= nowMs) activeLease = null;
  const succeeded = new Set(Object.entries(stepStates).filter(([, state]) => state.status === 'succeeded').map(([id]) => id));
  const inProgress = plan.steps.find((step) => stepStates[step.id].status === 'in-progress');
  const nextReady = plan.steps.find((step) => stepStates[step.id].status !== 'succeeded' && step.requires.every((dep) => succeeded.has(dep)));
  if (cancelled) status = 'cancelled';
  else if (Object.values(stepStates).every((entry) => entry.status === 'succeeded')) status = 'completed';
  else if (paused) status = 'paused';
  else if (inProgress) status = 'in-progress';
  else if (nextReady) status = 'ready';
  else status = 'blocked';
  return { status, paused, cancelled, activeLease, stepStates, nextStepId: inProgress?.id ?? nextReady?.id ?? null, failures };
}

async function verifyStepEvidence(root, plan, state) {
  const drift = [];
  for (const step of plan.steps) {
    const stepState = state.stepStates[step.id];
    if (stepState.status !== 'succeeded') continue;
    for (const evidence of stepState.evidence) {
      try {
        const live = await snapshotFile(root, evidence.path, `step ${step.id} output evidence`);
        if (live.bytes !== evidence.bytes || live.sha256 !== evidence.sha256) drift.push({ stepId: step.id, path: evidence.path, expected: evidence, actual: live });
      } catch (error) {
        drift.push({ stepId: step.id, path: evidence.path, error: error.message, code: error.code ?? null });
      }
    }
  }
  return drift;
}

export async function inspectWorkspaceJob({ workspaceRoot, jobId, verifyEvidence = true, now = new Date().toISOString() }) {
  const root = await requireDirectoryNoSymlink(workspaceRoot, 'workspaceRoot');
  const { plan, eventsRoot } = await readPlanFromRoot(root, safeId(jobId, 'jobId'));
  const events = await readEvents(root, plan.jobId);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) fail('ARTIST_WORKSPACE_JOB_INVALID', 'now must be an ISO timestamp.');
  const derived = derivedState(plan, events, nowMs);
  const evidenceDrift = verifyEvidence ? await verifyStepEvidence(root, plan, derived) : [];
  const state = withDocumentHash({
    schema: JOB_STATE_SCHEMA,
    version: 1,
    jobId: plan.jobId,
    workspaceId: plan.workspaceId,
    projectId: plan.projectId,
    title: plan.title,
    planSha256: plan.documentSha256,
    eventCount: events.length,
    lastEventSha256: events.at(-1).documentSha256,
    status: evidenceDrift.length > 0 && derived.status !== 'cancelled' ? 'blocked' : derived.status,
    paused: derived.paused,
    cancelled: derived.cancelled,
    activeLease: derived.activeLease ? { actor: derived.activeLease.actor, claimedAt: derived.activeLease.claimedAt, expiresAt: derived.activeLease.expiresAt } : null,
    nextStepId: evidenceDrift.length > 0 ? null : derived.nextStepId,
    steps: plan.steps.map((step) => ({ ...step, state: derived.stepStates[step.id] })),
    failures: derived.failures,
    evidenceDrift,
    inspectedAt: now,
  });
  return state;
}

async function verifyInputFingerprints(root, step) {
  const drift = [];
  for (const expected of step.inputFingerprints ?? []) {
    try {
      const live = await snapshotFile(root, expected.path, `step ${step.id} input`);
      if (live.bytes !== expected.bytes || live.sha256 !== expected.sha256) drift.push({ path: expected.path, expected, actual: live });
    } catch (error) {
      drift.push({ path: expected.path, error: error.message, code: error.code ?? null });
    }
  }
  return drift;
}

async function appendEvent(root, plan, eventsRoot, rawEvent, expectedPreviousEventSha256) {
  const canonicalAt = requireIsoTimestamp(rawEvent.at, 'event.at');
  if (!/^[a-f0-9]{64}$/.test(expectedPreviousEventSha256 ?? '')) {
    fail('ARTIST_WORKSPACE_JOB_CONCURRENCY', 'Append requires the exact previously inspected event SHA-256.');
  }
  const events = await readEvents(root, plan.jobId);
  const currentPreviousEventSha256 = events.at(-1).documentSha256;
  if (currentPreviousEventSha256 !== expectedPreviousEventSha256) {
    fail('ARTIST_WORKSPACE_JOB_CONCURRENCY', 'Job state changed after precondition verification; inspect current state before retrying.', {
      expectedPreviousEventSha256,
      currentPreviousEventSha256,
    });
  }
  const sequence = events.length + 1;
  const event = withDocumentHash({
    schema: JOB_EVENT_SCHEMA,
    version: 1,
    jobId: plan.jobId,
    sequence,
    previousEventSha256: currentPreviousEventSha256,
    ...rawEvent,
    at: canonicalAt,
  });
  const target = await resolveJobPath(
    root,
    `journals/jobs/${plan.jobId}/events/${eventFilename(sequence)}`,
    'next job event path',
    { allowMissingLeaf: true },
  );
  try {
    await writeJsonCreateOnly(target, event);
  } catch (error) {
    if (error?.code === 'ARTIST_WORKSPACE_JOB_COLLISION') {
      fail('ARTIST_WORKSPACE_JOB_CONCURRENCY', 'Another checkpoint won the append race; inspect current state before retrying.');
    }
    throw error;
  }
  return event;
}

function requireActor(actor) {
  return safeId(actor, 'actor');
}

function requireLease(state, actor) {
  if (!state.activeLease || state.activeLease.actor !== actor) {
    fail('ARTIST_WORKSPACE_JOB_LEASE_REQUIRED', `Actor ${actor} does not hold the active job lease.`);
  }
}

export async function claimWorkspaceJob({ workspaceRoot, jobId, actor, leaseSeconds = 900, now = new Date().toISOString() }) {
  const root = await requireDirectoryNoSymlink(workspaceRoot, 'workspaceRoot');
  const safeActor = requireActor(actor);
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > MAX_LEASE_SECONDS) fail('ARTIST_WORKSPACE_JOB_INVALID', `leaseSeconds must be 30-${MAX_LEASE_SECONDS}.`);
  const { plan, eventsRoot } = await readPlanFromRoot(root, safeId(jobId, 'jobId'));
  const state = await inspectWorkspaceJob({ workspaceRoot: root, jobId: plan.jobId, verifyEvidence: true, now });
  if (['completed', 'cancelled'].includes(state.status)) fail('ARTIST_WORKSPACE_JOB_TERMINAL', `Cannot claim a ${state.status} job.`);
  if (state.evidenceDrift.length > 0) fail('ARTIST_WORKSPACE_JOB_EVIDENCE_DRIFT', 'Cannot claim a job with output evidence drift.', state.evidenceDrift);
  if (state.activeLease && state.activeLease.actor !== safeActor) fail('ARTIST_WORKSPACE_JOB_ALREADY_CLAIMED', `Job is already claimed by ${state.activeLease.actor}.`);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) fail('ARTIST_WORKSPACE_JOB_INVALID', 'now must be an ISO timestamp.');
  const expiresAt = new Date(nowMs + leaseSeconds * 1000).toISOString();
  await appendEvent(root, plan, eventsRoot, { type: 'claimed', at: now, actor: safeActor, details: { expiresAt, leaseSeconds } }, state.lastEventSha256);
  return inspectWorkspaceJob({ workspaceRoot: root, jobId: plan.jobId, now });
}

export async function releaseWorkspaceJob({ workspaceRoot, jobId, actor, now = new Date().toISOString() }) {
  const root = await requireDirectoryNoSymlink(workspaceRoot, 'workspaceRoot');
  const safeActor = requireActor(actor);
  const { plan, eventsRoot } = await readPlanFromRoot(root, safeId(jobId, 'jobId'));
  const state = await inspectWorkspaceJob({ workspaceRoot: root, jobId: plan.jobId, now });
  requireLease(state, safeActor);
  await appendEvent(root, plan, eventsRoot, { type: 'released', at: now, actor: safeActor, details: {} }, state.lastEventSha256);
  return inspectWorkspaceJob({ workspaceRoot: root, jobId: plan.jobId, now });
}

export async function startWorkspaceJobStep({ workspaceRoot, jobId, actor, stepId, now = new Date().toISOString() }) {
  const root = await requireDirectoryNoSymlink(workspaceRoot, 'workspaceRoot');
  const safeActor = requireActor(actor);
  const safeStepId = safeId(stepId, 'stepId');
  const { plan, eventsRoot } = await readPlanFromRoot(root, safeId(jobId, 'jobId'));
  const state = await inspectWorkspaceJob({ workspaceRoot: root, jobId: plan.jobId, now });
  requireLease(state, safeActor);
  if (state.paused || state.cancelled || state.status === 'completed') fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Cannot start a step while job status is ${state.status}.`);
  if (state.evidenceDrift.length > 0) fail('ARTIST_WORKSPACE_JOB_EVIDENCE_DRIFT', 'Cannot start a step with output evidence drift.', state.evidenceDrift);
  if (state.nextStepId !== safeStepId) fail('ARTIST_WORKSPACE_JOB_STEP_NOT_READY', `Next resumable step is ${state.nextStepId ?? 'none'}, not ${safeStepId}.`);
  const planStep = plan.steps.find((step) => step.id === safeStepId);
  const stepState = state.steps.find((step) => step.id === safeStepId).state;
  if (stepState.status === 'in-progress') return state;
  const inputDrift = await verifyInputFingerprints(root, planStep);
  if (inputDrift.length > 0) fail('ARTIST_WORKSPACE_JOB_INPUT_DRIFT', `Step ${safeStepId} inputs changed since compilation.`, inputDrift);
  await appendEvent(root, plan, eventsRoot, { type: 'step-started', at: now, actor: safeActor, stepId: safeStepId, details: { attempt: stepState.attempts + 1 } }, state.lastEventSha256);
  return inspectWorkspaceJob({ workspaceRoot: root, jobId: plan.jobId, now });
}

export async function completeWorkspaceJobStep({ workspaceRoot, jobId, actor, stepId, now = new Date().toISOString() }) {
  const root = await requireDirectoryNoSymlink(workspaceRoot, 'workspaceRoot');
  const safeActor = requireActor(actor);
  const safeStepId = safeId(stepId, 'stepId');
  const { plan, eventsRoot } = await readPlanFromRoot(root, safeId(jobId, 'jobId'));
  const state = await inspectWorkspaceJob({ workspaceRoot: root, jobId: plan.jobId, now });
  requireLease(state, safeActor);
  if (state.paused || state.cancelled) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Cannot complete a step while job status is ${state.status}.`);
  const planStep = plan.steps.find((step) => step.id === safeStepId);
  if (!planStep) fail('ARTIST_WORKSPACE_JOB_STEP_NOT_FOUND', `Unknown step ${safeStepId}.`);
  const stepState = state.steps.find((step) => step.id === safeStepId).state;
  if (stepState.status !== 'in-progress') fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Step ${safeStepId} must be in-progress before completion.`);
  const evidence = [];
  for (const output of planStep.outputs) evidence.push(await snapshotFile(root, output, `step ${safeStepId} output`));
  await appendEvent(root, plan, eventsRoot, { type: 'step-succeeded', at: now, actor: safeActor, stepId: safeStepId, details: { evidence } }, state.lastEventSha256);
  return inspectWorkspaceJob({ workspaceRoot: root, jobId: plan.jobId, now });
}

export async function failWorkspaceJobStep({ workspaceRoot, jobId, actor, stepId, message, now = new Date().toISOString() }) {
  const root = await requireDirectoryNoSymlink(workspaceRoot, 'workspaceRoot');
  const safeActor = requireActor(actor);
  const safeStepId = safeId(stepId, 'stepId');
  const safeMessage = boundedString(message, 'message', { max: 2000 });
  const { plan, eventsRoot } = await readPlanFromRoot(root, safeId(jobId, 'jobId'));
  const state = await inspectWorkspaceJob({ workspaceRoot: root, jobId: plan.jobId, now });
  requireLease(state, safeActor);
  if (state.paused || state.cancelled) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Cannot fail a step while job status is ${state.status}.`);
  const stepState = state.steps.find((step) => step.id === safeStepId)?.state;
  if (!stepState || stepState.status !== 'in-progress') fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Step ${safeStepId} must be in-progress before failure can be recorded.`);
  await appendEvent(root, plan, eventsRoot, { type: 'step-failed', at: now, actor: safeActor, stepId: safeStepId, details: { message: safeMessage } }, state.lastEventSha256);
  return inspectWorkspaceJob({ workspaceRoot: root, jobId: plan.jobId, now });
}

export async function pauseWorkspaceJob({ workspaceRoot, jobId, actor, now = new Date().toISOString() }) {
  const root = await requireDirectoryNoSymlink(workspaceRoot, 'workspaceRoot');
  const safeActor = requireActor(actor);
  const { plan, eventsRoot } = await readPlanFromRoot(root, safeId(jobId, 'jobId'));
  const state = await inspectWorkspaceJob({ workspaceRoot: root, jobId: plan.jobId, now });
  requireLease(state, safeActor);
  if (state.paused) return state;
  await appendEvent(root, plan, eventsRoot, { type: 'paused', at: now, actor: safeActor, details: {} }, state.lastEventSha256);
  return inspectWorkspaceJob({ workspaceRoot: root, jobId: plan.jobId, now });
}

export async function resumeWorkspaceJob({ workspaceRoot, jobId, actor, now = new Date().toISOString() }) {
  const root = await requireDirectoryNoSymlink(workspaceRoot, 'workspaceRoot');
  const safeActor = requireActor(actor);
  const { plan, eventsRoot } = await readPlanFromRoot(root, safeId(jobId, 'jobId'));
  const state = await inspectWorkspaceJob({ workspaceRoot: root, jobId: plan.jobId, now });
  requireLease(state, safeActor);
  if (!state.paused) return state;
  await appendEvent(root, plan, eventsRoot, { type: 'resumed', at: now, actor: safeActor, details: {} }, state.lastEventSha256);
  return inspectWorkspaceJob({ workspaceRoot: root, jobId: plan.jobId, now });
}

export async function cancelWorkspaceJob({ workspaceRoot, jobId, actor, reason, now = new Date().toISOString() }) {
  const root = await requireDirectoryNoSymlink(workspaceRoot, 'workspaceRoot');
  const safeActor = requireActor(actor);
  const safeReason = boundedString(reason, 'reason', { max: 2000 });
  const { plan, eventsRoot } = await readPlanFromRoot(root, safeId(jobId, 'jobId'));
  const state = await inspectWorkspaceJob({ workspaceRoot: root, jobId: plan.jobId, now });
  requireLease(state, safeActor);
  if (state.status === 'completed') fail('ARTIST_WORKSPACE_JOB_TERMINAL', 'Completed jobs cannot be cancelled.');
  await appendEvent(root, plan, eventsRoot, { type: 'cancelled', at: now, actor: safeActor, details: { reason: safeReason } }, state.lastEventSha256);
  return inspectWorkspaceJob({ workspaceRoot: root, jobId: plan.jobId, now });
}
