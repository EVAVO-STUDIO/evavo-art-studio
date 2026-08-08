import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const SCHEMAS = Object.freeze({
  queue: 'evavo.raw-art-production-queue.v2',
  bridge: 'evavo.brass-brine.art-studio-bridge.v1',
  providerMap: 'evavo.brass-brine.raw-art-provider-role-map.v2',
  direction: 'evavo.brass-brine.art-direction-animation.v1',
  styleBank: 'evavo.image-style-reference-bank.v1',
  campaign: 'evavo.brass-brine.raw-art-production-campaign-state.v1',
  campaignRevision: 'evavo.brass-brine.raw-art-production-campaign-revision.v3',
  bindings: 'evavo.raw-art-provider-artifact-bindings.v2',
  bindingsTemplate: 'evavo.raw-art-provider-artifact-bindings-template.v2',
  requestBatch: 'evavo.raw-art-provider-request-batch.v2',
  requestMetadata: 'evavo.raw-art-provider-request-metadata.v2',
});

export const HEX24 = /^[0-9a-f]{24}$/u;
export const HEX40 = /^[0-9a-f]{40}$/u;
export const HEX64 = /^[0-9a-f]{64}$/u;
export const ARTIFACT_ID = /^artifact_[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CAMPAIGN_DECISIONS = new Set([
  'keep',
  'edit',
  'recreate',
  'generate-variation',
  'reference-only',
  'reject',
]);
const CAMPAIGN_STAGES = new Set([
  'needs-technical-batch-review',
  'technical-review-blocked',
  'needs-creative-review',
  'needs-work-order',
  'needs-processing',
  'needs-candidate-evaluation',
  'candidate-blocked',
  'needs-runtime-validation',
  'ready-for-publication',
  'reference-only',
  'rejected',
]);

export function fail(message) {
  throw new Error(message);
}

export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
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
  if (
    !state.isFile() ||
    state.isSymbolicLink() ||
    state.size < 2 ||
    state.size > 268_435_456
  ) {
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
  return Object.freeze({
    path: requested,
    bytes,
    fileSha256: sha256(bytes),
    value,
  });
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
  if (
    !isObject(value) ||
    Object.keys(value).length === 0 ||
    Object.values(value).some((entry) => entry !== false)
  ) {
    fail(`${label} authority must be entirely false`);
  }
}

export function verifySelfHash(value, key, label) {
  if (!HEX64.test(value[key] ?? '')) fail(`${label} lacks ${key}`);
  const unhashed = { ...value };
  delete unhashed[key];
  delete unhashed.runId;
  if (hashObject(unhashed) !== value[key]) fail(`${label} ${key} mismatch`);
  if (value.runId !== value[key].slice(0, 20)) fail(`${label} runId mismatch`);
  return value[key];
}

export const normalizeRole = (value) =>
  String(value ?? '').trim().toLowerCase().replaceAll('_', '-');
export const directionRole = (value) => normalizeRole(value).replaceAll('-', '_');
export const slug = (value) =>
  String(value ?? 'asset')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 90) || 'asset';

export function boundedText(value, label, minimum = 1, maximum = 32_000) {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length < minimum ||
    value.length > maximum ||
    value.includes('\0')
  ) {
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
  if (!Array.isArray(value) || value.length > maximumItems) {
    fail('string list is invalid');
  }
  return [
    ...new Set(
      value.map((entry) => boundedText(entry, 'list item', 1, 1_024)),
    ),
  ];
}

export function limited(values, maximum = 64) {
  return [...new Set(values.filter(Boolean))].slice(0, maximum);
}

export function canonicalRelative(value, label) {
  if (
    typeof value !== 'string' ||
    !value ||
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
    value.startsWith('../')
  ) {
    fail(`${label} is not canonical`);
  }
  return value;
}

export function sourceIdentity(sourcePath, sourceSha256) {
  return `${sourceSha256}\0${sourcePath}`;
}

export function campaignItemId(sourcePath, sourceSha256) {
  return hashObject({ sourceSha256, sourcePath }).slice(0, 24);
}

export function validateQueue(record) {
  const queue = record.value;
  if (queue.schema !== SCHEMAS.queue || !Array.isArray(queue.entries)) {
    fail('unexpected RAW_ART production queue');
  }
  const unhashed = { ...queue };
  delete unhashed.queueSha256;
  if (
    !HEX64.test(queue.queueSha256 ?? '') ||
    hashObject(unhashed) !== queue.queueSha256
  ) {
    fail('queue self hash mismatch');
  }
  for (const key of [
    'sourceMutation',
    'sourceDeletion',
    'providerExecution',
    'targetRepositoryMutation',
    'publication',
  ]) {
    if (queue[key] !== false) fail('queue authority boundary changed');
  }
  const identities = new Set();
  for (const entry of queue.entries) {
    if (
      !isObject(entry) ||
      !HEX64.test(entry.sourceSha256 ?? '') ||
      !entry.semanticRole
    ) {
      fail('queue contains an invalid entry');
    }
    const sourcePath = canonicalRelative(entry.sourcePath, 'queue sourcePath');
    const identity = sourceIdentity(sourcePath, entry.sourceSha256);
    if (identities.has(identity)) fail(`queue duplicates source identity: ${sourcePath}`);
    identities.add(identity);
  }
  return queue;
}

export function validateBridge(record, queue) {
  if (
    record.value.schema !== SCHEMAS.bridge ||
    !isObject(record.value.roles)
  ) {
    fail('unexpected Brass Art Studio bridge');
  }
  if (queue.inputs?.bridgeSha256 !== record.fileSha256) {
    fail('queue is not bound to the supplied Art Studio bridge bytes');
  }
  return record.value;
}

export function validateProviderMap(record) {
  const map = record.value;
  if (
    map.schema !== SCHEMAS.providerMap ||
    map.bridgeSchema !== SCHEMAS.bridge ||
    map.directionContract !== SCHEMAS.direction ||
    map.campaignSchema !== SCHEMAS.campaign ||
    map.campaignRevision !== SCHEMAS.campaignRevision ||
    map.requestBatchSchema !== SCHEMAS.requestBatch ||
    map.requestMetadataSchema !== SCHEMAS.requestMetadata ||
    map.artifactBindingsSchema !== SCHEMAS.bindings ||
    map.artifactBindingsTemplateSchema !== SCHEMAS.bindingsTemplate ||
    map.styleBankSchema !== SCHEMAS.styleBank ||
    map.technicalAdmissionRequired !== true ||
    map.campaignNextBatchRequired !== true ||
    map.campaignNeedsProcessingStageRequired !== true ||
    map.sourceCanvasPolicy !== 'adapter-derived-from-target' ||
    map.candidateEvidenceAutomaticallyStored !== true ||
    map.providerExecutionSeparate !== true ||
    map.runtimeSubmissionSeparate !== true ||
    !Number.isSafeInteger(map.maximumOrdersPerBatch) ||
    map.maximumOrdersPerBatch < 1 ||
    map.maximumOrdersPerBatch > 100 ||
    !isObject(map.roleMappings)
  ) {
    fail('unexpected game-owned RAW_ART provider role map');
  }
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
  ) {
    fail('unexpected Brass art-direction contract');
  }
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
  ) {
    fail('unexpected approved style-reference bank');
  }
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
    ) {
      fail('style bank contains an invalid reference');
    }
    const role = normalizeRole(reference.semanticRole);
    const group = byRole.get(role) ?? [];
    group.push(reference);
    byRole.set(role, group);
    if (bySha.has(reference.sourceSha256)) fail('duplicate style bytes');
    bySha.set(reference.sourceSha256, reference);
  }
  return Object.freeze({ value: bank, bankSha256, byRole, bySha });
}

export function validateCampaign(record) {
  const campaign = record.value;
  if (
    campaign.schema !== SCHEMAS.campaign ||
    campaign.revision !== SCHEMAS.campaignRevision ||
    !Array.isArray(campaign.items) ||
    !isObject(campaign.nextBatch) ||
    !isObject(campaign.technicalAdmission)
  ) {
    fail('unexpected RAW_ART campaign v3');
  }
  const campaignSha256 = verifySelfHash(
    campaign,
    'campaignSha256',
    'RAW_ART campaign',
  );
  if (
    campaign.technicalAdmission.status !== 'complete' ||
    campaign.technicalAdmission.currentSourceBytesVerified !== true ||
    !HEX64.test(campaign.technicalAdmission.admissionSha256 ?? '')
  ) {
    fail('RAW_ART campaign lacks complete current-byte technical admission');
  }
  assertFalseAuthority(campaign.effectBoundary, 'campaign effect boundary');
  if (
    !Number.isSafeInteger(campaign.nextBatch.maximumItems) ||
    campaign.nextBatch.maximumItems < 1 ||
    campaign.nextBatch.maximumItems > 500 ||
    !Array.isArray(campaign.nextBatch.itemIds) ||
    campaign.nextBatch.itemIds.length > campaign.nextBatch.maximumItems ||
    !Number.isSafeInteger(campaign.nextBatch.remainingActiveItems) ||
    campaign.nextBatch.remainingActiveItems < campaign.nextBatch.itemIds.length
  ) {
    fail('RAW_ART campaign nextBatch is invalid');
  }

  const byId = new Map();
  const byIdentity = new Map();
  for (const item of campaign.items) {
    if (
      !isObject(item) ||
      !HEX24.test(item.itemId ?? '') ||
      !HEX64.test(item.sourceSha256 ?? '') ||
      !item.semanticRole ||
      (item.decision !== null && !CAMPAIGN_DECISIONS.has(item.decision)) ||
      !CAMPAIGN_STAGES.has(item.stage) ||
      !isObject(item.technicalAdmission)
    ) {
      fail('RAW_ART campaign contains an invalid item');
    }
    const sourcePath = canonicalRelative(
      item.sourcePath,
      'campaign sourcePath',
    );
    const expectedItemId = campaignItemId(sourcePath, item.sourceSha256);
    if (item.itemId !== expectedItemId) {
      fail(`RAW_ART campaign itemId mismatch: ${sourcePath}`);
    }
    if (
      item.technicalAdmission.admissionSha256 !==
      campaign.technicalAdmission.admissionSha256
    ) {
      fail(`RAW_ART campaign item admission mismatch: ${sourcePath}`);
    }
    const identity = sourceIdentity(sourcePath, item.sourceSha256);
    if (byId.has(item.itemId) || byIdentity.has(identity)) {
      fail(`RAW_ART campaign duplicates item: ${sourcePath}`);
    }
    byId.set(item.itemId, item);
    byIdentity.set(identity, item);
  }

  const nextBatchItems = [];
  const nextBatchIds = new Set();
  for (const itemId of campaign.nextBatch.itemIds) {
    if (!HEX24.test(itemId ?? '') || nextBatchIds.has(itemId)) {
      fail('RAW_ART campaign nextBatch contains an invalid or duplicate itemId');
    }
    const item = byId.get(itemId);
    if (!item) fail(`RAW_ART campaign nextBatch item is missing: ${itemId}`);
    nextBatchIds.add(itemId);
    nextBatchItems.push(item);
  }

  return Object.freeze({
    value: campaign,
    campaignSha256,
    technicalAdmissionSha256: campaign.technicalAdmission.admissionSha256,
    byId,
    byIdentity,
    nextBatchIds,
    nextBatchItems: Object.freeze(nextBatchItems),
  });
}

export function classifyProviderEntries(queue, campaign) {
  const providerEntries = queue.entries.filter(
    (entry) => entry.state === 'provider-required',
  );
  const nextBatchOrder = new Map(
    campaign.value.nextBatch.itemIds.map((itemId, index) => [itemId, index]),
  );
  const eligible = [];
  const blocked = [];
  const deferred = [];

  for (const entry of providerEntries) {
    const sourcePath = canonicalRelative(entry.sourcePath, 'queue sourcePath');
    const identity = sourceIdentity(sourcePath, entry.sourceSha256);
    const item = campaign.byIdentity.get(identity);
    const operation = operationFor(entry);
    const semanticRole = normalizeRole(entry.semanticRole);
    if (!item) {
      blocked.push({
        sourcePath,
        sourceSha256: entry.sourceSha256,
        semanticRole,
        targetPath: entry.targetPath ?? null,
        operation,
        reasons: ['campaign-item-missing'],
      });
      continue;
    }
    const reasons = [];
    if (normalizeRole(item.semanticRole) !== semanticRole) {
      reasons.push('campaign-role-mismatch');
    }
    if (item.decision !== entry.decision) reasons.push('campaign-decision-mismatch');
    if (item.technicalAdmission.status !== 'passed') {
      reasons.push('campaign-technical-admission-not-passed');
    }
    if (reasons.length > 0) {
      blocked.push({
        campaignItemId: item.itemId,
        sourcePath,
        sourceSha256: entry.sourceSha256,
        semanticRole,
        targetPath: entry.targetPath ?? null,
        operation,
        reasons: [...new Set(reasons)].sort(),
      });
      continue;
    }
    if (!campaign.nextBatchIds.has(item.itemId)) {
      deferred.push({
        campaignItemId: item.itemId,
        sourcePath,
        sourceSha256: entry.sourceSha256,
        semanticRole,
        targetPath: entry.targetPath ?? null,
        operation,
        reason: 'outside-campaign-next-batch',
      });
      continue;
    }
    if (item.stage !== 'needs-processing') {
      deferred.push({
        campaignItemId: item.itemId,
        sourcePath,
        sourceSha256: entry.sourceSha256,
        semanticRole,
        targetPath: entry.targetPath ?? null,
        operation,
        reason: `campaign-stage-not-needs-processing:${item.stage}`,
      });
      continue;
    }
    eligible.push({
      entry,
      campaignItem: item,
      order: nextBatchOrder.get(item.itemId),
    });
  }

  eligible.sort(
    (left, right) =>
      left.order - right.order ||
      left.entry.sourcePath.localeCompare(right.entry.sourcePath),
  );
  blocked.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
  deferred.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
  return Object.freeze({
    providerRequiredTotal: providerEntries.length,
    eligible: Object.freeze(eligible),
    blocked: Object.freeze(blocked),
    deferred: Object.freeze(deferred),
  });
}

export function validateBindings(record, records, queue, campaign, styleBank) {
  const bindings = record.value;
  if (
    bindings.schema !== SCHEMAS.bindings ||
    !['ready', 'partially-ready'].includes(bindings.status) ||
    !HEX40.test(bindings.gameHead ?? '') ||
    bindings.queueSha256 !== queue.queueSha256 ||
    bindings.campaignSha256 !== campaign.campaignSha256 ||
    bindings.technicalAdmissionSha256 !== campaign.technicalAdmissionSha256 ||
    bindings.styleBankSha256 !== styleBank.bankSha256 ||
    !isObject(bindings.inputFileSha256s) ||
    bindings.inputFileSha256s.queue !== records.queue.fileSha256 ||
    bindings.inputFileSha256s.campaign !== records.campaign.fileSha256 ||
    bindings.inputFileSha256s.bridge !== records.bridge.fileSha256 ||
    bindings.inputFileSha256s.providerMap !== records.providerMap.fileSha256 ||
    bindings.inputFileSha256s.direction !== records.direction.fileSha256 ||
    bindings.inputFileSha256s.styleBank !== records.styleBank.fileSha256 ||
    !Array.isArray(bindings.styleReferenceArtifacts) ||
    !Array.isArray(bindings.bindings)
  ) {
    fail('unexpected or stale RAW_ART provider artifact bindings');
  }
  const bindingsSha256 = verifySelfHash(
    bindings,
    'bindingsSha256',
    'RAW_ART provider artifact bindings',
  );
  assertFalseAuthority(bindings.authority, 'artifact bindings');
  const styles = new Map();
  const sources = new Map();
  const sourceItemIds = new Set();
  for (const binding of bindings.styleReferenceArtifacts) {
    const reference = styleBank.bySha.get(binding?.sourceSha256);
    if (
      !isObject(binding) ||
      !HEX64.test(binding.sourceSha256 ?? '') ||
      !ARTIFACT_ID.test(binding.artifactId ?? '') ||
      ![
        'direction-master',
        'palette-reference',
        'line-reference',
        'material-reference',
      ].includes(binding.providerRole) ||
      !reference ||
      binding.sourcePath !== reference.sourcePath ||
      normalizeRole(binding.semanticRole) !==
        normalizeRole(reference.semanticRole) ||
      (binding.strength !== undefined &&
        (typeof binding.strength !== 'number' ||
          !Number.isFinite(binding.strength) ||
          binding.strength < 0 ||
          binding.strength > 2))
    ) {
      fail('style-reference artifact binding is invalid');
    }
    const key = `${binding.sourceSha256}\0${binding.providerRole}`;
    if (styles.has(key)) fail('style-reference artifact binding is duplicated');
    styles.set(key, binding);
  }
  for (const binding of bindings.bindings) {
    if (
      !isObject(binding) ||
      !HEX24.test(binding.campaignItemId ?? '') ||
      !HEX64.test(binding.sourceSha256 ?? '') ||
      !binding.sourcePath
    ) {
      fail('source artifact binding is invalid');
    }
    const sourcePath = canonicalRelative(
      binding.sourcePath,
      'artifact binding sourcePath',
    );
    const item = campaign.byId.get(binding.campaignItemId);
    if (
      !item ||
      item.sourcePath !== sourcePath ||
      item.sourceSha256 !== binding.sourceSha256 ||
      !campaign.nextBatchIds.has(item.itemId) ||
      item.stage !== 'needs-processing' ||
      item.technicalAdmission.status !== 'passed'
    ) {
      fail('source artifact binding is outside the admitted campaign nextBatch');
    }
    if (
      binding.semanticRole !== undefined &&
      normalizeRole(binding.semanticRole) !== normalizeRole(item.semanticRole)
    ) {
      fail('source artifact binding role differs from campaign');
    }
    const identity = sourceIdentity(sourcePath, binding.sourceSha256);
    if (sources.has(identity) || sourceItemIds.has(item.itemId)) {
      fail('source artifact binding is duplicated');
    }
    sources.set(identity, binding);
    sourceItemIds.add(item.itemId);
  }
  return Object.freeze({
    value: bindings,
    bindingsSha256,
    styles,
    sources,
  });
}

export function operationFor(entry) {
  if (['recreate', 'generate-variation'].includes(entry.decision)) {
    return 'generate';
  }
  return entry.operations?.includes('inpaint') ? 'inpaint' : 'edit';
}

export function transparencyFor(entry, mapping) {
  if (mapping.transparency) return mapping.transparency;
  if (
    ['opaque', 'preserve-authored-black-stage'].includes(entry.alphaPolicy)
  ) {
    return 'opaque';
  }
  if (
    String(entry.alphaPolicy).includes('required') ||
    String(entry.alphaPolicy).includes('luminance')
  ) {
    return 'required';
  }
  return 'preferred';
}
