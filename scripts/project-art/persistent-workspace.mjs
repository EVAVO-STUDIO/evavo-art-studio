import { randomUUID } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';

import {
  boundedString,
  canonicalJson,
  canonicalRelativePath,
  fail,
  hashFileBounded,
  inspectImageFile,
  isRecord,
  mediaTypeFromPath,
  readJsonFileBounded,
  requireDirectoryNoSymlink,
  resolveExistingWithinRoot,
  safeId,
  sha256,
  timestamp,
  verifyDocumentHash,
  withDocumentHash,
  writeJsonCreateOnly,
} from './common.mjs';

export const WORKSPACE_CREATE_REQUEST_SCHEMA = 'evavo.persistent-artist-workspace-create-request.v1';
export const WORKSPACE_CREATE_PLAN_SCHEMA = 'evavo.persistent-artist-workspace-create-plan.v1';
export const WORKSPACE_MANIFEST_SCHEMA = 'evavo.persistent-artist-workspace-manifest.v1';
export const WORKSPACE_CREATE_RECEIPT_SCHEMA = 'evavo.persistent-artist-workspace-create-receipt.v1';
export const WORKSPACE_SNAPSHOT_REQUEST_SCHEMA = 'evavo.persistent-artist-workspace-snapshot-request.v1';
export const WORKSPACE_SNAPSHOT_PLAN_SCHEMA = 'evavo.persistent-artist-workspace-snapshot-plan.v1';
export const WORKSPACE_VERSION_SCHEMA = 'evavo.persistent-artist-workspace-version.v1';
export const WORKSPACE_SNAPSHOT_RECEIPT_SCHEMA = 'evavo.persistent-artist-workspace-snapshot-receipt.v1';
export const WORKSPACE_STORAGE_HANDOFF_REQUEST_SCHEMA = 'evavo.persistent-artist-workspace-storage-handoff-request.v1';
export const STORAGE_INGEST_REQUEST_SCHEMA = 'evavo.storage-art-ingest-request.v1';

const MAXIMUM_REQUEST_BYTES = 16 * 1024 * 1024;
const MAXIMUM_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;
const MAXIMUM_HANDOFF_ITEMS = 10_000;
const WORKSPACE_DIRECTORIES = Object.freeze([
  'sources',
  'working',
  'versions',
  'masks',
  'scratch',
  'review',
  'masters',
  'exports',
  'manifests',
  'manifests/storage-handoffs',
  'journals',
]);
const SNAPSHOT_SOURCE_PREFIXES = Object.freeze([
  'working/',
  'masks/',
  'scratch/',
  'review/',
  'masters/',
  'exports/',
]);
const HANDOFF_SOURCE_PREFIXES = Object.freeze([
  'sources/',
  'working/',
  'versions/',
  'masks/',
  'review/',
  'masters/',
  'exports/',
]);

function exactRequestDocument(request, requestBytes, schema, label) {
  if (!Buffer.isBuffer(requestBytes) || requestBytes.length < 2 || requestBytes.length > MAXIMUM_REQUEST_BYTES) {
    fail('PERSISTENT_ARTIST_WORKSPACE_REQUEST_BYTES_INVALID', `${label} request bytes are outside the bounded JSON boundary.`);
  }
  let decoded;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(requestBytes).replace(/^\uFEFF/u, '');
    decoded = JSON.parse(text);
  } catch (error) {
    fail('PERSISTENT_ARTIST_WORKSPACE_REQUEST_INVALID', `${label} request bytes are not valid UTF-8 JSON: ${error.message}`);
  }
  if (!isRecord(request) || request.schema !== schema) {
    fail('PERSISTENT_ARTIST_WORKSPACE_REQUEST_INVALID', `${label} request must use ${schema}.`);
  }
  if (canonicalJson(decoded) !== canonicalJson(request)) {
    fail('PERSISTENT_ARTIST_WORKSPACE_REQUEST_BYTES_MISMATCH', `${label} request bytes must encode the exact supplied request object.`);
  }
  return sha256(requestBytes);
}

function authority(value, allowedTrue = []) {
  const keys = [
    'workspaceCreation',
    'workspaceSnapshot',
    'sourceRead',
    'workspaceWrite',
    'storageWrite',
    'sourceMutation',
    'sourceDeletion',
    'providerExecution',
    'candidateApproval',
    'candidatePromotion',
    'targetRepositoryMutation',
    'publication',
    'deployment',
    'forcePush',
  ];
  if (value !== undefined && !isRecord(value)) {
    fail('PERSISTENT_ARTIST_WORKSPACE_AUTHORITY_INVALID', 'authority must be an object.');
  }
  const allowed = new Set(allowedTrue);
  for (const key of Object.keys(value ?? {})) {
    if (!keys.includes(key)) fail('PERSISTENT_ARTIST_WORKSPACE_AUTHORITY_INVALID', `Unsupported authority key: ${key}.`);
    if (value[key] !== false) fail('PERSISTENT_ARTIST_WORKSPACE_AUTHORITY_INVALID', `Request authority.${key} must be false.`);
  }
  return Object.fromEntries(keys.map((key) => [key, allowed.has(key)]));
}


function assertPlanAuthority(plan, trueKeys, label) {
  if (!isRecord(plan.authority)) {
    fail('PERSISTENT_ARTIST_WORKSPACE_AUTHORITY_INVALID', `${label} plan authority is missing.`);
  }
  const expected = authority(undefined, trueKeys);
  if (canonicalJson(plan.authority) !== canonicalJson(expected)) {
    fail('PERSISTENT_ARTIST_WORKSPACE_AUTHORITY_INVALID', `${label} plan authority changed after compilation.`);
  }
}

function assertExecutionBoundary(plan, expected, label) {
  if (!isRecord(plan.execution)) {
    fail('PERSISTENT_ARTIST_WORKSPACE_PLAN_INVALID', `${label} plan execution boundary is missing.`);
  }
  for (const [key, value] of Object.entries(expected)) {
    if (plan.execution[key] !== value) {
      fail('PERSISTENT_ARTIST_WORKSPACE_PLAN_INVALID', `${label} plan execution.${key} changed after compilation.`);
    }
  }
}

function normalizedTags(value, label = 'tags') {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 256) {
    fail('PERSISTENT_ARTIST_WORKSPACE_TAGS_INVALID', `${label} must contain at most 256 strings.`);
  }
  return [...new Set(value.map((entry, index) => boundedString(entry, `${label}[${index}]`, 160)))].sort();
}

function portableDirectoryName(value, label) {
  const normalized = safeId(value, label).replaceAll(':', '-');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(normalized)) {
    fail('PERSISTENT_ARTIST_WORKSPACE_PATH_INVALID', `${label} is not portable as a directory name.`);
  }
  return normalized;
}

function ensurePrefix(relative, prefixes, label) {
  if (!prefixes.some((prefix) => relative.startsWith(prefix))) {
    fail('PERSISTENT_ARTIST_WORKSPACE_SOURCE_SCOPE_INVALID', `${label} must be inside ${prefixes.join(', ')}.`);
  }
  return relative;
}

async function requireCreateOnlyChild(parentRoot, directoryName, label) {
  const lexical = path.join(parentRoot, directoryName);
  try {
    await lstat(lexical);
    fail('PERSISTENT_ARTIST_WORKSPACE_OUTPUT_EXISTS', `${label} already exists: ${lexical}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return lexical;
}

async function safeFileSummary(root, relative, label) {
  const resolved = await resolveExistingWithinRoot(root, relative, label);
  const identity = await hashFileBounded(resolved.absolutePath, MAXIMUM_SOURCE_BYTES);
  let image = null;
  try {
    image = await inspectImageFile(resolved.absolutePath, identity.bytes);
  } catch {
    image = null;
  }
  return {
    path: relative,
    sha256: identity.sha256,
    bytes: identity.bytes,
    mediaType: mediaTypeFromPath(relative),
    ...(image
      ? {
          image: {
            width: image.width,
            height: image.height,
            format: image.format,
            hasAlpha: image.hasAlpha,
          },
        }
      : {}),
  };
}

async function loadWorkspaceManifest(workspaceRoot) {
  const root = await requireDirectoryNoSymlink(workspaceRoot, 'workspace-root');
  const manifestPath = path.join(root, 'manifests', 'workspace.json');
  const { value: manifest } = await readJsonFileBounded(manifestPath, 'persistent workspace manifest');
  if (!isRecord(manifest) || manifest.schema !== WORKSPACE_MANIFEST_SCHEMA) {
    fail('PERSISTENT_ARTIST_WORKSPACE_MANIFEST_INVALID', `Workspace manifest must use ${WORKSPACE_MANIFEST_SCHEMA}.`);
  }
  verifyDocumentHash(manifest);
  if (manifest.workspaceRoot !== root) {
    fail('PERSISTENT_ARTIST_WORKSPACE_MANIFEST_ROOT_MISMATCH', 'Workspace manifest root does not match the opened workspace.');
  }
  for (const relative of WORKSPACE_DIRECTORIES) {
    const candidate = path.join(root, ...relative.split('/'));
    const metadata = await lstat(candidate);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      fail('PERSISTENT_ARTIST_WORKSPACE_DIRECTORY_INVALID', `Workspace directory is missing or symbolic: ${relative}.`);
    }
  }
  return { root, manifest, manifestPath };
}

export async function compileWorkspaceCreate({ parentRoot, request, requestBytes, outputPath, compiledAt = new Date().toISOString() }) {
  const parent = await requireDirectoryNoSymlink(parentRoot, 'parent-root');
  const requestSha256 = exactRequestDocument(request, requestBytes, WORKSPACE_CREATE_REQUEST_SCHEMA, 'create');
  timestamp(compiledAt, 'compiledAt');
  const workspaceId = safeId(request.workspaceId, 'workspaceId');
  const projectId = safeId(request.projectId, 'projectId');
  const directoryName = portableDirectoryName(request.directoryName ?? workspaceId, 'directoryName');
  await requireCreateOnlyChild(parent, directoryName, 'workspace output');
  const plan = withDocumentHash({
    schema: WORKSPACE_CREATE_PLAN_SCHEMA,
    workspaceId,
    projectId,
    title: boundedString(request.title ?? workspaceId, 'title', 512),
    purpose: boundedString(request.purpose ?? 'Persistent EVAVO artist workspace.', 'purpose', 8192),
    createdBy: boundedString(request.createdBy ?? 'evavo-agent', 'createdBy', 256),
    compiledAt,
    parentRoot: parent,
    directoryName,
    outputRoot: path.join(parent, directoryName),
    requestSha256,
    tags: normalizedTags(request.tags),
    storage: {
      enabled: request.storage?.enabled === true,
      vaultId: boundedString(request.storage?.vaultId ?? 'art', 'storage.vaultId', 160),
      logicalPrefix: boundedString(request.storage?.logicalPrefix ?? `Projects/${projectId}/Art`, 'storage.logicalPrefix', 1024),
      tags: normalizedTags(request.storage?.tags, 'storage.tags'),
      storageWrite: false,
    },
    directories: WORKSPACE_DIRECTORIES,
    execution: {
      createOnlyOutput: true,
      atomicPublication: true,
      immutableManifest: true,
      appendOnlyVersions: true,
      bytesFlowThroughMcp: false,
    },
    authority: authority(request.authority, ['workspaceCreation', 'workspaceWrite']),
  });
  if (outputPath) await writeJsonCreateOnly(path.resolve(outputPath), plan);
  return plan;
}

export async function runWorkspaceCreate(planInput) {
  const plan = structuredClone(planInput);
  if (!isRecord(plan) || plan.schema !== WORKSPACE_CREATE_PLAN_SCHEMA) {
    fail('PERSISTENT_ARTIST_WORKSPACE_PLAN_INVALID', `Create plan must use ${WORKSPACE_CREATE_PLAN_SCHEMA}.`);
  }
  verifyDocumentHash(plan);
  assertPlanAuthority(plan, ['workspaceCreation', 'workspaceWrite'], 'create');
  assertExecutionBoundary(plan, {
    createOnlyOutput: true,
    atomicPublication: true,
    immutableManifest: true,
    appendOnlyVersions: true,
    bytesFlowThroughMcp: false,
  }, 'create');
  const parent = await requireDirectoryNoSymlink(plan.parentRoot, 'plan parent-root');
  const outputRoot = await requireCreateOnlyChild(parent, portableDirectoryName(plan.directoryName, 'directoryName'), 'workspace output');
  if (outputRoot !== plan.outputRoot) {
    fail('PERSISTENT_ARTIST_WORKSPACE_PLAN_INVALID', 'Create plan outputRoot does not match parentRoot and directoryName.');
  }
  const staging = path.join(parent, `.${plan.directoryName}.staging-${randomUUID()}`);
  await mkdir(staging, { recursive: false });
  try {
    for (const relative of WORKSPACE_DIRECTORIES) {
      await mkdir(path.join(staging, ...relative.split('/')), { recursive: true });
    }
    const manifest = withDocumentHash({
      schema: WORKSPACE_MANIFEST_SCHEMA,
      workspaceId: plan.workspaceId,
      projectId: plan.projectId,
      title: plan.title,
      purpose: plan.purpose,
      createdBy: plan.createdBy,
      createdAt: plan.compiledAt,
      workspaceRoot: outputRoot,
      createPlanSha256: plan.documentSha256,
      requestSha256: plan.requestSha256,
      tags: plan.tags,
      paths: {
        immutableSources: 'sources',
        workingCopies: 'working',
        appendOnlyVersions: 'versions',
        masks: 'masks',
        scratch: 'scratch',
        reviewEvidence: 'review',
        masteredAssets: 'masters',
        publishingExports: 'exports',
        manifests: 'manifests',
        storageHandoffs: 'manifests/storage-handoffs',
        journals: 'journals',
      },
      policy: {
        immutableSources: true,
        appendOnlyVersions: true,
        reversibleWorkspaceMutations: true,
        exactSourceHashRequired: true,
        sourceOverwriteAllowed: false,
        sourceDeletionAllowed: false,
        wholeOperationAtomicPublication: true,
        providerOutputIsNeverFinalByDefault: true,
        technicalPassIsNotCreativeApproval: true,
      },
      storage: plan.storage,
      authority: authority(undefined, []),
    });
    await writeJsonCreateOnly(path.join(staging, 'manifests', 'workspace.json'), manifest);
    const receipt = withDocumentHash({
      schema: WORKSPACE_CREATE_RECEIPT_SCHEMA,
      workspaceId: plan.workspaceId,
      projectId: plan.projectId,
      createdAt: plan.compiledAt,
      workspaceRoot: outputRoot,
      manifestSha256: manifest.documentSha256,
      createPlanSha256: plan.documentSha256,
      directoryCount: WORKSPACE_DIRECTORIES.length,
      directories: WORKSPACE_DIRECTORIES,
      storageWrite: false,
      repositoryMutation: false,
      publication: false,
    });
    await writeJsonCreateOnly(path.join(staging, 'manifests', 'workspace-create-receipt.json'), receipt);
    await rename(staging, outputRoot);
    return {
      status: 'passed',
      schema: receipt.schema,
      workspaceId: plan.workspaceId,
      projectId: plan.projectId,
      workspaceRoot: outputRoot,
      manifestSha256: manifest.documentSha256,
      receiptSha256: receipt.documentSha256,
      storageWrite: false,
      repositoryMutation: false,
    };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function compileWorkspaceSnapshot({ workspaceRoot, request, requestBytes, outputPath, compiledAt = new Date().toISOString() }) {
  const { root, manifest } = await loadWorkspaceManifest(workspaceRoot);
  const requestSha256 = exactRequestDocument(request, requestBytes, WORKSPACE_SNAPSHOT_REQUEST_SCHEMA, 'snapshot');
  timestamp(compiledAt, 'compiledAt');
  if (safeId(request.workspaceId, 'workspaceId') !== manifest.workspaceId) {
    fail('PERSISTENT_ARTIST_WORKSPACE_ID_MISMATCH', 'Snapshot workspaceId does not match the workspace manifest.');
  }
  const assetId = portableDirectoryName(request.assetId, 'assetId');
  const versionId = portableDirectoryName(request.versionId, 'versionId');
  const sourcePath = ensurePrefix(
    canonicalRelativePath(request.sourcePath, 'sourcePath'),
    SNAPSHOT_SOURCE_PREFIXES,
    'sourcePath',
  );
  const source = await safeFileSummary(root, sourcePath, 'snapshot source');
  if (request.expectedSha256 !== undefined && request.expectedSha256 !== source.sha256) {
    fail('PERSISTENT_ARTIST_WORKSPACE_SOURCE_HASH_MISMATCH', 'Snapshot source does not match expectedSha256.');
  }
  const fileName = path.posix.basename(sourcePath);
  const versionDirectory = `versions/${assetId}/${versionId}`;
  const versionPath = `${versionDirectory}/${fileName}`;
  try {
    await lstat(path.join(root, ...versionDirectory.split('/')));
    fail('PERSISTENT_ARTIST_WORKSPACE_VERSION_EXISTS', `Version directory already exists: ${versionDirectory}.`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const plan = withDocumentHash({
    schema: WORKSPACE_SNAPSHOT_PLAN_SCHEMA,
    workspaceId: manifest.workspaceId,
    projectId: manifest.projectId,
    workspaceManifestSha256: manifest.documentSha256,
    assetId,
    versionId,
    role: boundedString(request.role ?? 'art-asset-version', 'role', 160),
    note: boundedString(request.note ?? 'Append-only artist workspace snapshot.', 'note', 8192),
    createdBy: boundedString(request.createdBy ?? 'evavo-agent', 'createdBy', 256),
    compiledAt,
    requestSha256,
    tags: normalizedTags(request.tags),
    source,
    versionDirectory,
    versionPath,
    execution: {
      sourceReadOnly: true,
      versionCreateOnly: true,
      atomicPublication: true,
      sourceHashesRevalidatedBeforeCopy: true,
      sourceHashesRevalidatedAfterCopy: true,
      bytesFlowThroughMcp: false,
    },
    authority: authority(request.authority, ['workspaceSnapshot', 'sourceRead', 'workspaceWrite']),
  });
  if (outputPath) await writeJsonCreateOnly(path.resolve(outputPath), plan);
  return plan;
}

export async function runWorkspaceSnapshot(workspaceRoot, planInput) {
  const { root, manifest } = await loadWorkspaceManifest(workspaceRoot);
  const plan = structuredClone(planInput);
  if (!isRecord(plan) || plan.schema !== WORKSPACE_SNAPSHOT_PLAN_SCHEMA) {
    fail('PERSISTENT_ARTIST_WORKSPACE_PLAN_INVALID', `Snapshot plan must use ${WORKSPACE_SNAPSHOT_PLAN_SCHEMA}.`);
  }
  verifyDocumentHash(plan);
  assertPlanAuthority(plan, ['workspaceSnapshot', 'sourceRead', 'workspaceWrite'], 'snapshot');
  assertExecutionBoundary(plan, {
    sourceReadOnly: true,
    versionCreateOnly: true,
    atomicPublication: true,
    sourceHashesRevalidatedBeforeCopy: true,
    sourceHashesRevalidatedAfterCopy: true,
    bytesFlowThroughMcp: false,
  }, 'snapshot');
  if (plan.workspaceId !== manifest.workspaceId || plan.workspaceManifestSha256 !== manifest.documentSha256) {
    fail('PERSISTENT_ARTIST_WORKSPACE_MANIFEST_CHANGED', 'Snapshot plan is not bound to the current workspace manifest.');
  }
  const sourcePath = ensurePrefix(canonicalRelativePath(plan.source.path, 'plan source path'), SNAPSHOT_SOURCE_PREFIXES, 'plan source path');
  const source = await safeFileSummary(root, sourcePath, 'snapshot source');
  if (source.sha256 !== plan.source.sha256 || source.bytes !== plan.source.bytes) {
    fail('PERSISTENT_ARTIST_WORKSPACE_SOURCE_IDENTITY_CHANGED', 'Snapshot source changed after compilation.');
  }
  const versionDirectory = canonicalRelativePath(plan.versionDirectory, 'versionDirectory');
  const versionPath = canonicalRelativePath(plan.versionPath, 'versionPath');
  if (!versionPath.startsWith(`${versionDirectory}/`)) {
    fail('PERSISTENT_ARTIST_WORKSPACE_PLAN_INVALID', 'versionPath must be inside versionDirectory.');
  }
  const finalDirectory = path.join(root, ...versionDirectory.split('/'));
  try {
    await lstat(finalDirectory);
    fail('PERSISTENT_ARTIST_WORKSPACE_VERSION_EXISTS', `Version directory already exists: ${versionDirectory}.`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const parent = path.dirname(finalDirectory);
  await mkdir(parent, { recursive: true });
  const staging = path.join(parent, `.${path.basename(finalDirectory)}.staging-${randomUUID()}`);
  await mkdir(staging, { recursive: false });
  try {
    const targetFile = path.join(staging, path.posix.basename(versionPath));
    await copyFile(path.join(root, ...sourcePath.split('/')), targetFile);
    const copiedIdentity = await hashFileBounded(targetFile, MAXIMUM_SOURCE_BYTES);
    if (copiedIdentity.sha256 !== source.sha256 || copiedIdentity.bytes !== source.bytes) {
      fail('PERSISTENT_ARTIST_WORKSPACE_COPY_MISMATCH', 'Version copy does not match the exact source bytes.');
    }
    const version = withDocumentHash({
      schema: WORKSPACE_VERSION_SCHEMA,
      workspaceId: plan.workspaceId,
      projectId: plan.projectId,
      workspaceManifestSha256: manifest.documentSha256,
      snapshotPlanSha256: plan.documentSha256,
      assetId: plan.assetId,
      versionId: plan.versionId,
      role: plan.role,
      note: plan.note,
      tags: plan.tags,
      createdBy: plan.createdBy,
      createdAt: plan.compiledAt,
      source: plan.source,
      version: {
        path: versionPath,
        sha256: copiedIdentity.sha256,
        bytes: copiedIdentity.bytes,
        mediaType: plan.source.mediaType,
        ...(plan.source.image ? { image: plan.source.image } : {}),
      },
      authority: authority(undefined, []),
    });
    await writeJsonCreateOnly(path.join(staging, 'version.json'), version);
    const receipt = withDocumentHash({
      schema: WORKSPACE_SNAPSHOT_RECEIPT_SCHEMA,
      workspaceId: plan.workspaceId,
      projectId: plan.projectId,
      assetId: plan.assetId,
      versionId: plan.versionId,
      createdAt: plan.compiledAt,
      snapshotPlanSha256: plan.documentSha256,
      versionDocumentSha256: version.documentSha256,
      sourceSha256: source.sha256,
      versionSha256: copiedIdentity.sha256,
      byteExact: true,
      sourceMutation: false,
      sourceDeletion: false,
      storageWrite: false,
      repositoryMutation: false,
      publication: false,
    });
    await writeJsonCreateOnly(path.join(staging, 'receipt.json'), receipt);
    const sourceAfter = await safeFileSummary(root, sourcePath, 'snapshot source');
    if (sourceAfter.sha256 !== source.sha256 || sourceAfter.bytes !== source.bytes) {
      fail('PERSISTENT_ARTIST_WORKSPACE_SOURCE_IDENTITY_CHANGED', 'Snapshot source changed during copy.');
    }
    await rename(staging, finalDirectory);
    return {
      status: 'passed',
      schema: receipt.schema,
      workspaceId: plan.workspaceId,
      assetId: plan.assetId,
      versionId: plan.versionId,
      versionPath,
      versionSha256: copiedIdentity.sha256,
      versionDocumentSha256: version.documentSha256,
      receiptSha256: receipt.documentSha256,
      sourceMutation: false,
      storageWrite: false,
      repositoryMutation: false,
    };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function prepareWorkspaceStorageHandoff({ workspaceRoot, request, requestBytes, outputPath, compiledAt = new Date().toISOString() }) {
  const { root, manifest } = await loadWorkspaceManifest(workspaceRoot);
  const requestSha256 = exactRequestDocument(request, requestBytes, WORKSPACE_STORAGE_HANDOFF_REQUEST_SCHEMA, 'storage handoff');
  timestamp(compiledAt, 'compiledAt');
  if (safeId(request.workspaceId, 'workspaceId') !== manifest.workspaceId) {
    fail('PERSISTENT_ARTIST_WORKSPACE_ID_MISMATCH', 'Storage handoff workspaceId does not match the workspace manifest.');
  }
  const handoffId = portableDirectoryName(request.handoffId, 'handoffId');
  if (!Array.isArray(request.items) || request.items.length < 1 || request.items.length > MAXIMUM_HANDOFF_ITEMS) {
    fail('PERSISTENT_ARTIST_WORKSPACE_HANDOFF_INVALID', `Storage handoff items must contain 1-${MAXIMUM_HANDOFF_ITEMS} entries.`);
  }
  const vaultId = boundedString(request.vaultId ?? manifest.storage.vaultId ?? 'art', 'vaultId', 160);
  const logicalPrefix = boundedString(request.logicalPrefix ?? manifest.storage.logicalPrefix, 'logicalPrefix', 1024).replace(/^\/+|\/+$/gu, '');
  const items = [];
  const assetIds = new Set();
  for (const [index, raw] of request.items.entries()) {
    if (!isRecord(raw)) fail('PERSISTENT_ARTIST_WORKSPACE_HANDOFF_INVALID', `items[${index}] must be an object.`);
    const assetId = safeId(raw.assetId, `items[${index}].assetId`);
    if (assetIds.has(assetId)) fail('PERSISTENT_ARTIST_WORKSPACE_HANDOFF_INVALID', `Duplicate storage assetId: ${assetId}.`);
    assetIds.add(assetId);
    const relative = ensurePrefix(canonicalRelativePath(raw.path, `items[${index}].path`), HANDOFF_SOURCE_PREFIXES, `items[${index}].path`);
    const summary = await safeFileSummary(root, relative, `items[${index}] source`);
    if (raw.expectedSha256 !== undefined && raw.expectedSha256 !== summary.sha256) {
      fail('PERSISTENT_ARTIST_WORKSPACE_SOURCE_HASH_MISMATCH', `items[${index}] does not match expectedSha256.`);
    }
    const logicalPath = canonicalRelativePath(raw.logicalPath ?? `${relative}`, `items[${index}].logicalPath`);
    items.push({
      assetId,
      sourcePath: path.join(root, ...relative.split('/')),
      logicalPath: `${logicalPrefix}/${logicalPath}`,
      fileName: path.posix.basename(relative),
      mediaType: summary.mediaType,
      sha256: summary.sha256,
      bytes: summary.bytes,
      title: boundedString(raw.title ?? `${manifest.projectId} ${assetId}`, `items[${index}].title`, 512),
      tags: [...new Set([
        ...normalizedTags(manifest.tags, 'workspace.tags'),
        ...normalizedTags(manifest.storage.tags, 'workspace.storage.tags'),
        ...normalizedTags(request.tags, 'request.tags'),
        ...normalizedTags(raw.tags, `items[${index}].tags`),
        boundedString(raw.role ?? 'art-asset', `items[${index}].role`, 160),
      ])].sort(),
      provenance: {
        workspaceId: manifest.workspaceId,
        projectId: manifest.projectId,
        workspaceManifestSha256: manifest.documentSha256,
        persistentWorkspacePath: relative,
        role: boundedString(raw.role ?? 'art-asset', `items[${index}].role`, 160),
      },
    });
  }
  items.sort((left, right) => left.assetId.localeCompare(right.assetId));
  const handoff = withDocumentHash({
    schema: STORAGE_INGEST_REQUEST_SCHEMA,
    projectId: manifest.projectId,
    sessionId: `persistent-workspace:${manifest.workspaceId}:${handoffId}`,
    vaultId,
    workspaceRoot: root,
    allowedSourceRoots: [root],
    items,
    idempotencyKeyPrefix: boundedString(
      request.idempotencyKeyPrefix ?? `persistent-workspace:${manifest.workspaceId}:${handoffId}`,
      'idempotencyKeyPrefix',
      512,
    ),
    sourceWorkspaceManifestSha256: manifest.documentSha256,
    sourceWorkspaceRequestSha256: requestSha256,
    compiledAt,
    enabled: request.enabled !== false,
    authority: {
      sourceRead: true,
      storageWrite: false,
      repositoryMutation: false,
      sourceDeletion: false,
      physicalPurge: false,
      publication: false,
    },
    bytesFlowThroughMcp: false,
  }, 'requestSha256');
  const output = outputPath
    ? path.resolve(outputPath)
    : path.join(root, 'manifests', 'storage-handoffs', `${handoffId}.json`);
  const outputParent = await realpath(path.dirname(output));
  if (!outputParent.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`)) {
    fail('PERSISTENT_ARTIST_WORKSPACE_PATH_INVALID', 'Storage handoff output must stay inside the workspace.');
  }
  await writeJsonCreateOnly(output, handoff);
  return {
    status: 'passed',
    schema: handoff.schema,
    workspaceId: manifest.workspaceId,
    projectId: manifest.projectId,
    handoffId,
    itemCount: items.length,
    output,
    requestSha256: handoff.requestSha256,
    storageWrite: false,
    repositoryMutation: false,
  };
}

export async function loadRequestFile(filePath) {
  const absolute = path.resolve(filePath);
  const metadata = await stat(absolute);
  if (!metadata.isFile() || metadata.size < 2 || metadata.size > MAXIMUM_REQUEST_BYTES) {
    fail('PERSISTENT_ARTIST_WORKSPACE_REQUEST_INVALID', `Request file must be 2-${MAXIMUM_REQUEST_BYTES} bytes.`);
  }
  const bytes = await readFile(absolute);
  let value;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/u, '');
    value = JSON.parse(text);
  } catch (error) {
    fail('PERSISTENT_ARTIST_WORKSPACE_REQUEST_INVALID', `Request file is not valid UTF-8 JSON: ${error.message}`);
  }
  return { value, bytes };
}

export async function loadPlanFile(filePath, expectedSchema) {
  const { value } = await readJsonFileBounded(path.resolve(filePath), 'persistent workspace plan');
  if (!isRecord(value) || value.schema !== expectedSchema) {
    fail('PERSISTENT_ARTIST_WORKSPACE_PLAN_INVALID', `Plan must use ${expectedSchema}.`);
  }
  verifyDocumentHash(value);
  return value;
}
