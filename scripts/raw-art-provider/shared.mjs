import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const SCHEMAS = Object.freeze({
  queue: 'evavo.raw-art-production-queue.v2',
  bridge: 'evavo.brass-brine.art-studio-bridge.v1',
  providerMap: 'evavo.brass-brine.raw-art-provider-role-map.v1',
  direction: 'evavo.brass-brine.art-direction-animation.v1',
  styleBank: 'evavo.image-style-reference-bank.v1',
  bindings: 'evavo.raw-art-provider-artifact-bindings.v1',
  bindingsTemplate: 'evavo.raw-art-provider-artifact-bindings-template.v1',
  requestBatch: 'evavo.raw-art-provider-request-batch.v1',
});

export const HEX40 = /^[0-9a-f]{40}$/u;
export const HEX64 = /^[0-9a-f]{64}$/u;
export const ARTIFACT_ID = /^artifact_[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export function fail(message) {
  throw new Error(message);
}

export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function hashObject(value) {
  return sha256(Buffer.from(canonical(value), 'utf8'));
}

export async function readJsonRecord(file, label) {
  const requested = path.resolve(file);
  const state = await lstat(requested);
  if (!state.isFile() || state.isSymbolicLink() || state.size < 2 || state.size > 268_435_456) {
    fail(`${label} is not a bounded regular file`);
  }
  const bytes = await readFile(requested);
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail(`${label} is not strict JSON UTF-8`);
  }
  if (!isObject(value)) fail(`${label} root must be an object`);
  return Object.freeze({ path: requested, bytes, fileSha256: sha256(bytes), value });
}

export async function writeCreateOnly(file, value) {
  const target = path.resolve(file);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    if (error?.code === 'EEXIST') fail(`output already exists: ${target}`);
    throw error;
  }
}

export function assertFalseAuthority(value, label) {
  if (!isObject(value) || Object.keys(value).length === 0 || Object.values(value).some((entry) => entry !== false)) {
    fail(`${label} authority must be entirely false`);
  }
}

export function verifySelfHash(value, key, label) {
  if (!HEX64.test(value[key] ?? '')) fail(`${label} lacks ${key}`);
  const unhashed = { ...value };
  delete unhashed[key];
  delete unhashed.runId;
  if (hashObject(unhashed) !== value[key]) fail(`${label} ${key} mismatch`);
  return value[key];
}

export const normalizeRole = (value) => String(value ?? '').trim().toLowerCase().replaceAll('_', '-');
export const directionRole = (value) => normalizeRole(value).replaceAll('-', '_');
export const slug = (value) => String(value ?? 'asset').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 90) || 'asset';

export function boundedText(value, label, minimum = 1, maximum = 32_000) {
  if (typeof value !== 'string' || value.trim() !== value || value.length < minimum || value.length > maximum) {
    fail(`${label} is invalid`);
  }
  return value;
}

export function safeId(value, label) {
  const normalized = boundedText(value, label, 1, 128);
  if (!SAFE_ID.test(normalized)) fail(`${label} is invalid`);
  return normalized;
}

export function stringList(value = [], maximumItems = 64) {
  if (!Array.isArray(value) || value.length > maximumItems) fail('string list is invalid');
  return [...new Set(value.map((entry) => boundedText(entry, 'list item', 1, 1_024)))];
}

export function limited(values, maximum = 64) {
  return [...new Set(values.filter(Boolean))].slice(0, maximum);
}

export function validateQueue(record) {
  const queue = record.value;
  if (queue.schema !== SCHEMAS.queue || !Array.isArray(queue.entries)) fail('unexpected RAW_ART production queue');
  const unhashed = { ...queue };
  delete unhashed.queueSha256;
  if (!HEX64.test(queue.queueSha256 ?? '') || hashObject(unhashed) !== queue.queueSha256) fail('queue self hash mismatch');
  for (const key of ['sourceMutation', 'sourceDeletion', 'providerExecution', 'targetRepositoryMutation', 'publication']) {
    if (queue[key] !== false) fail('queue authority boundary changed');
  }
  return queue;
}

export function validateBridge(record, queue) {
  if (record.value.schema !== SCHEMAS.bridge || !isObject(record.value.roles)) fail('unexpected Brass Art Studio bridge');
  if (queue.inputs?.bridgeSha256 !== record.fileSha256) fail('queue is not bound to the supplied Art Studio bridge bytes');
  return record.value;
}

export function validateProviderMap(record) {
  const map = record.value;
  if (
    map.schema !== SCHEMAS.providerMap ||
    map.bridgeSchema !== SCHEMAS.bridge ||
    map.directionContract !== SCHEMAS.direction ||
    map.requestBatchSchema !== SCHEMAS.requestBatch ||
    map.artifactBindingsSchema !== SCHEMAS.bindings ||
    map.styleBankSchema !== SCHEMAS.styleBank ||
    map.providerExecutionSeparate !== true ||
    map.runtimeSubmissionSeparate !== true ||
    !isObject(map.roleMappings)
  ) fail('unexpected game-owned RAW_ART provider role map');
  assertFalseAuthority(map.authority, 'provider role map');
  return map;
}

export function validateDirection(record) {
  const direction = record.value;
  if (
    direction.contract !== SCHEMAS.direction ||
    !isObject(direction.timeline) ||
    !isObject(direction.palette) ||
    !isObject(direction.cameraAndComposition) ||
    !isObject(direction.roleProfiles) ||
    !Array.isArray(direction.visualPillars) ||
    !Array.isArray(direction.forbidden)
  ) fail('unexpected Brass art-direction contract');
  assertFalseAuthority(direction.authority, 'art direction');
  return direction;
}

export function validateStyleBank(record) {
  const bank = record.value;
  if (
    bank.schema !== SCHEMAS.styleBank ||
    bank.contract !== 'evavo.executable-image-pipeline.v1' ||
    !Array.isArray(bank.references) ||
    bank.references.length === 0 ||
    !isObject(bank.roleProfiles)
  ) fail('unexpected approved style-reference bank');
  const bankSha256 = verifySelfHash(bank, 'bankSha256', 'style bank');
  assertFalseAuthority(bank.effects, 'style bank effects');
  const byRole = new Map();
  const bySha = new Map();
  for (const reference of bank.references) {
    if (
      !isObject(reference) ||
      !HEX64.test(reference.sourceSha256 ?? '') ||
      !reference.sourcePath ||
      !reference.semanticRole ||
      !Array.isArray(reference.approvedTraits) ||
      reference.approvedTraits.length === 0 ||
      !reference.approvalAuthority ||
      !HEX64.test(reference.reviewSha256 ?? '')
    ) fail('style bank contains an invalid reference');
    const role = normalizeRole(reference.semanticRole);
    const group = byRole.get(role) ?? [];
    group.push(reference);
    byRole.set(role, group);
    if (bySha.has(reference.sourceSha256)) fail('duplicate style bytes');
    bySha.set(reference.sourceSha256, reference);
  }
  return Object.freeze({ value: bank, bankSha256, byRole, bySha });
}

export function validateBindings(record, queue, styleBank) {
  const bindings = record.value;
  if (
    bindings.schema !== SCHEMAS.bindings ||
    bindings.status !== 'ready' ||
    !HEX40.test(bindings.gameHead ?? '') ||
    bindings.queueSha256 !== queue.queueSha256 ||
    bindings.styleBankSha256 !== styleBank.bankSha256 ||
    !Array.isArray(bindings.styleReferenceArtifacts) ||
    !Array.isArray(bindings.bindings)
  ) fail('unexpected or stale RAW_ART provider artifact bindings');
  assertFalseAuthority(bindings.authority, 'artifact bindings');
  const styles = new Map();
  const sources = new Map();
  for (const binding of bindings.styleReferenceArtifacts) {
    if (
      !isObject(binding) ||
      !HEX64.test(binding.sourceSha256 ?? '') ||
      !ARTIFACT_ID.test(binding.artifactId ?? '') ||
      !['direction-master', 'palette-reference', 'line-reference', 'material-reference'].includes(binding.providerRole) ||
      !styleBank.bySha.has(binding.sourceSha256)
    ) fail('style-reference artifact binding is invalid');
    styles.set(`${binding.sourceSha256}\0${binding.providerRole}`, binding);
  }
  for (const binding of bindings.bindings) {
    if (!isObject(binding) || !HEX64.test(binding.sourceSha256 ?? '') || !binding.sourcePath || sources.has(binding.sourceSha256)) {
      fail('source artifact binding is invalid');
    }
    sources.set(binding.sourceSha256, binding);
  }
  return Object.freeze({ value: bindings, styles, sources });
}

export function operationFor(entry) {
  if (['recreate', 'generate-variation'].includes(entry.decision)) return 'generate';
  return entry.operations?.includes('inpaint') ? 'inpaint' : 'edit';
}

export function transparencyFor(entry, mapping) {
  if (mapping.transparency) return mapping.transparency;
  if (['opaque', 'preserve-authored-black-stage'].includes(entry.alphaPolicy)) return 'opaque';
  if (String(entry.alphaPolicy).includes('required') || String(entry.alphaPolicy).includes('luminance')) return 'required';
  return 'preferred';
}
