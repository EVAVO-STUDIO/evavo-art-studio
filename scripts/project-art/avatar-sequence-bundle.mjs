import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  opendir,
  readFile,
  realpath,
  rename,
  rm,
} from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';

import {
  AUTHORITY_KEYS,
  LIMITS,
  canonicalJson,
  canonicalPath,
  digest,
  exactKeys,
  fail,
  hashBytes,
  timestamp,
} from './avatar-sequence-common.mjs';
import {
  assertTargetAvailable,
  directory,
  pngHeader,
  resolveSource,
  stableHash,
} from './avatar-sequence-filesystem.mjs';
import { verifyProjectArtAvatarSequencePlan } from './avatar-sequence-plan.mjs';

export const PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_MANIFEST_SCHEMA =
  'evavo.project-art-avatar-sequence-bundle-manifest.v1';
export const PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RECEIPT_SCHEMA =
  'evavo.project-art-avatar-sequence-bundle-receipt.v1';

const MAXIMUM_JSON_BYTES = 64 * 1024 * 1024;
const BUNDLE_AUTHORITY_KEYS = Object.freeze([
  'providerExecution',
  'sourceMutation',
  'sourceDeletion',
  'targetImageWrite',
  'workspaceFilePlanApplication',
  'loopClosureReview',
  'independentReview',
  'releaseSeal',
  'runtimeActivation',
  'targetRepositoryMutation',
  'gitCommit',
  'gitPush',
  'publication',
  'deployment',
  'forcePush',
]);

function falseBundleAuthority() {
  return Object.freeze(
    Object.fromEntries(BUNDLE_AUTHORITY_KEYS.map((key) => [key, false])),
  );
}

function snapshot(metadata) {
  return {
    mode: metadata.mode,
    device: metadata.dev,
    inode: metadata.ino,
    links: metadata.nlink,
    size: metadata.size,
    modifiedMs: metadata.mtimeMs,
    changedMs: metadata.ctimeMs,
  };
}

function sameSnapshot(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

async function stableRegularFile(filePath, label, maximumBytes = MAXIMUM_JSON_BYTES) {
  let before;
  try {
    before = await lstat(filePath);
  } catch {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_FILE_MISSING', `${label} is missing.`);
  }
  if (
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.nlink !== 1 ||
    before.size < 1 ||
    before.size > maximumBytes
  ) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_FILE_UNSAFE',
      `${label} must be a bounded single-link regular file.`,
    );
  }
  const beforeSnapshot = snapshot(before);
  const bytes = await readFile(filePath);
  const after = await lstat(filePath);
  if (!sameSnapshot(beforeSnapshot, snapshot(after)) || bytes.length !== before.size) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_FILE_CHANGED',
      `${label} changed during read.`,
    );
  }
  return { bytes, snapshot: beforeSnapshot };
}

async function readJsonStable(filePath, label, maximumBytes = MAXIMUM_JSON_BYTES) {
  const { bytes } = await stableRegularFile(filePath, label, maximumBytes);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_UTF8_INVALID', `${label} is not UTF-8.`);
  }
  if (text.startsWith('\uFEFF')) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_UTF8_INVALID', `${label} has a BOM.`);
  }
  try {
    return { value: JSON.parse(text), bytes };
  } catch (error) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_JSON_INVALID',
      `${label} is not valid JSON: ${error.message}`,
    );
  }
}

async function writeCreateOnly(filePath, bytes) {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  let handle;
  try {
    handle = await open(
      filePath,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
      0o600,
    );
  } catch (error) {
    if (error?.code === 'EEXIST') {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_TARGET_EXISTS',
        `Create-only bundle target already exists: ${filePath}`,
      );
    }
    throw error;
  }
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function withSelfHash(value, key) {
  const body = { ...value };
  delete body[key];
  return Object.freeze({
    ...body,
    [key]: hashBytes(Buffer.from(canonicalJson(body), 'utf8')),
  });
}

function verifySelfHash(value, key, code) {
  const supplied = digest(value?.[key], key);
  const body = { ...value };
  delete body[key];
  if (hashBytes(Buffer.from(canonicalJson(body), 'utf8')) !== supplied) {
    fail(code, `${key} does not match canonical content.`);
  }
  return supplied;
}

async function fileIdentity(filePath) {
  const { bytes } = await stableRegularFile(filePath, filePath);
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  };
}

async function fileRecord(root, relativePath) {
  const canonical = canonicalPath(relativePath, 'bundle file path');
  const absolute = path.join(root, ...canonical.split('/'));
  const identity = await fileIdentity(absolute);
  return Object.freeze({ relativePath: canonical, ...identity });
}

async function listBundleFiles(root) {
  const output = [];
  async function visit(directoryPath) {
    const entries = [];
    for await (const entry of await opendir(directoryPath)) entries.push(entry);
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const absolute = path.join(directoryPath, entry.name);
      const relativePath = path.relative(root, absolute).split(path.sep).join('/');
      const metadata = await lstat(absolute);
      if (metadata.isSymbolicLink()) {
        fail(
          'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SYMLINK',
          `Bundle contains symbolic link ${relativePath}.`,
        );
      }
      if (metadata.isDirectory()) {
        await visit(absolute);
      } else if (metadata.isFile()) {
        if (metadata.nlink !== 1) {
          fail(
            'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_FILE_UNSAFE',
            `Bundle contains hard-linked file ${relativePath}.`,
          );
        }
        output.push(await fileRecord(root, relativePath));
      } else {
        fail(
          'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_FILE_UNSAFE',
          `Bundle contains unsupported entry ${relativePath}.`,
        );
      }
    }
  }
  await visit(root);
  return output;
}

function expectedPayloads(plan) {
  const payloads = [
    ['mastering-plan.json', plan],
    ['handoffs/workspace-file-plan.json', plan.workspaceFilePlanRequest],
    ['handoffs/runtime-draft.json', plan.runtimeDraft],
    [
      'handoffs/finalization-requirements.json',
      plan.finalizationRequirements,
    ],
  ];
  for (const [index, entry] of plan.loopClosureRequests.entries()) {
    payloads.push([
      `handoffs/loop-closure/${String(index + 1).padStart(3, '0')}-${entry.clipId}.json`,
      entry.request,
    ]);
  }
  return payloads;
}

function sortedRecords(value) {
  return [...value].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, 'en'),
  );
}

function exactRecords(actual, expected, code, label) {
  const actualSorted = sortedRecords(actual);
  const expectedSorted = sortedRecords(expected);
  if (!Array.isArray(actual) || actualSorted.length !== expectedSorted.length) {
    fail(code, `${label} file count differs.`);
  }
  for (let index = 0; index < expectedSorted.length; index += 1) {
    const left = actualSorted[index];
    const right = expectedSorted[index];
    if (
      left?.relativePath !== right?.relativePath ||
      left?.sha256 !== right?.sha256 ||
      left?.bytes !== right?.bytes
    ) {
      fail(code, `${label} file identity differs at index ${index}.`);
    }
  }
}

async function resolveOutputRoot(workspaceRoot, outputRoot, { existing = false } = {}) {
  const absolute = path.resolve(outputRoot);
  if (!inside(workspaceRoot, absolute) || absolute === workspaceRoot) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_OUTPUT_INVALID',
      'Bundle output must be a child of the mastering workspace.',
    );
  }
  const relative = path.relative(workspaceRoot, absolute).split(path.sep).join('/');
  const parent = path.dirname(absolute);
  const parentMetadata = await lstat(parent).catch(() => undefined);
  if (!parentMetadata?.isDirectory() || parentMetadata.isSymbolicLink()) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_OUTPUT_INVALID',
      'Bundle output parent must be an existing ordinary directory.',
    );
  }
  if (!inside(workspaceRoot, await realpath(parent))) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_OUTPUT_INVALID', 'Output parent escaped.');
  }
  const targetMetadata = await lstat(absolute).catch(() => undefined);
  if (existing) {
    if (!targetMetadata?.isDirectory() || targetMetadata.isSymbolicLink()) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_OUTPUT_INVALID',
        'Bundle root must be an existing ordinary directory.',
      );
    }
    if (path.normalize(await realpath(absolute)) !== path.normalize(absolute)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_OUTPUT_INVALID', 'Bundle root moved.');
    }
  } else if (targetMetadata) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_TARGET_EXISTS',
      'Bundle output is create-only and already exists.',
    );
  }
  return { absolute, relative };
}

async function revalidateSources(verified, { requireTargetsAvailable }) {
  for (const [index, source] of verified.plan.sources.entries()) {
    const resolved = resolveSource(
      verified.workspaceRoot,
      source.sourcePath,
      `plan.sources[${index}].sourcePath`,
    );
    const identity = await stableHash(resolved.absolute, `plan.sources[${index}]`);
    if (identity.sha256 !== source.sha256 || identity.bytes !== source.bytes) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SOURCE_CHANGED',
        `Source identity changed: ${source.sourcePath}.`,
      );
    }
    const image = pngHeader(resolved.absolute, `plan.sources[${index}]`);
    if (canonicalJson(image) !== canonicalJson(source.image)) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SOURCE_CHANGED',
        `Source image metadata changed: ${source.sourcePath}.`,
      );
    }
    if (requireTargetsAvailable) {
      assertTargetAvailable(
        verified.workspaceRoot,
        source.targetPath,
        resolved.absolute,
        `plan.sources[${index}].targetPath`,
      );
    }
  }
}

function validateManifest(value) {
  exactKeys(
    value,
    [
      'schema',
      'bundleId',
      'planId',
      'assignmentId',
      'characterId',
      'planSha256',
      'createdAt',
      'files',
      'sourceCount',
      'clipCount',
      'loopRequestCount',
      'sourceIdentitiesRevalidated',
      'sourceImageBytesIncluded',
      'workspaceFilePlanApplied',
      'loopClosureReviewPerformed',
      'independentReviewPerformed',
      'releaseSealPerformed',
      'runtimeActivationAllowed',
      'authority',
      'manifestSha256',
    ],
    'bundle manifest',
    'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_MANIFEST_INVALID',
  );
  if (value.schema !== PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_MANIFEST_SCHEMA) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_MANIFEST_INVALID');
  }
  verifySelfHash(
    value,
    'manifestSha256',
    'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_MANIFEST_HASH_MISMATCH',
  );
  return value;
}

function validateReceipt(value) {
  exactKeys(
    value,
    [
      'schema',
      'bundleId',
      'planId',
      'assignmentId',
      'characterId',
      'planSha256',
      'manifestSha256',
      'createdAt',
      'outputPath',
      'fileCount',
      'files',
      'sourceIdentitiesRevalidated',
      'wholeRunAtomicMaterialization',
      'sourceImageBytesIncluded',
      'workspaceFilePlanApplied',
      'loopClosureReviewPerformed',
      'independentReviewPerformed',
      'releaseSealPerformed',
      'runtimeActivationAllowed',
      'authority',
      'receiptSha256',
    ],
    'bundle receipt',
    'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RECEIPT_INVALID',
  );
  if (value.schema !== PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RECEIPT_SCHEMA) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RECEIPT_INVALID');
  }
  verifySelfHash(
    value,
    'receiptSha256',
    'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RECEIPT_HASH_MISMATCH',
  );
  return value;
}

function validateInertBundle(value, label) {
  if (
    value.sourceIdentitiesRevalidated !== true ||
    value.sourceImageBytesIncluded !== false ||
    value.workspaceFilePlanApplied !== false ||
    value.loopClosureReviewPerformed !== false ||
    value.independentReviewPerformed !== false ||
    value.releaseSealPerformed !== false ||
    value.runtimeActivationAllowed !== false
  ) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_AUTHORITY_ESCALATION',
      `${label} no longer describes an inert evidence bundle.`,
    );
  }
  exactKeys(
    value.authority,
    BUNDLE_AUTHORITY_KEYS,
    `${label}.authority`,
    'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_AUTHORITY_ESCALATION',
  );
  for (const key of BUNDLE_AUTHORITY_KEYS) {
    if (value.authority[key] !== false) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_AUTHORITY_ESCALATION',
        `${label}.authority.${key} must remain false.`,
      );
    }
  }
}

export async function materializeProjectArtAvatarSequenceBundle({
  planPath,
  outputRoot,
  createdAt = new Date().toISOString(),
}) {
  timestamp(createdAt, 'createdAt');
  const planRead = await readJsonStable(path.resolve(planPath), 'mastering plan');
  const verified = verifyProjectArtAvatarSequencePlan(planRead.value);
  const output = await resolveOutputRoot(verified.workspaceRoot, outputRoot);
  await revalidateSources(verified, { requireTargetsAvailable: true });

  const staging = path.join(
    path.dirname(output.absolute),
    `.${path.basename(output.absolute)}.staging-${process.pid}-${randomUUID()}`,
  );
  if (await lstat(staging).catch(() => undefined)) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_TARGET_EXISTS', 'Staging path exists.');
  }
  await mkdir(staging, { mode: 0o700 });
  try {
    const payloads = expectedPayloads(verified.plan);
    for (const [relativePath, value] of payloads) {
      await writeCreateOnly(
        path.join(staging, ...relativePath.split('/')),
        jsonBytes(value),
      );
    }
    const payloadRecords = [];
    for (const [relativePath] of payloads) {
      payloadRecords.push(await fileRecord(staging, relativePath));
    }
    const bundleId = `avatar-sequence-bundle-${verified.plan.documentSha256.slice(0, 24)}`;
    const authority = falseBundleAuthority();
    const manifest = withSelfHash(
      {
        schema: PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_MANIFEST_SCHEMA,
        bundleId,
        planId: verified.plan.planId,
        assignmentId: verified.plan.assignmentId,
        characterId: verified.plan.characterId,
        planSha256: verified.plan.documentSha256,
        createdAt,
        files: Object.freeze(sortedRecords(payloadRecords)),
        sourceCount: verified.sourceCount,
        clipCount: verified.clipCount,
        loopRequestCount: verified.loopClipCount,
        sourceIdentitiesRevalidated: true,
        sourceImageBytesIncluded: false,
        workspaceFilePlanApplied: false,
        loopClosureReviewPerformed: false,
        independentReviewPerformed: false,
        releaseSealPerformed: false,
        runtimeActivationAllowed: false,
        authority,
      },
      'manifestSha256',
    );
    await writeCreateOnly(
      path.join(staging, 'bundle-manifest.json'),
      jsonBytes(manifest),
    );
    const receiptFiles = sortedRecords([
      ...payloadRecords,
      await fileRecord(staging, 'bundle-manifest.json'),
    ]);
    const receipt = withSelfHash(
      {
        schema: PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RECEIPT_SCHEMA,
        bundleId,
        planId: verified.plan.planId,
        assignmentId: verified.plan.assignmentId,
        characterId: verified.plan.characterId,
        planSha256: verified.plan.documentSha256,
        manifestSha256: manifest.manifestSha256,
        createdAt,
        outputPath: output.relative,
        fileCount: receiptFiles.length,
        files: Object.freeze(receiptFiles),
        sourceIdentitiesRevalidated: true,
        wholeRunAtomicMaterialization: true,
        sourceImageBytesIncluded: false,
        workspaceFilePlanApplied: false,
        loopClosureReviewPerformed: false,
        independentReviewPerformed: false,
        releaseSealPerformed: false,
        runtimeActivationAllowed: false,
        authority,
      },
      'receiptSha256',
    );
    await writeCreateOnly(path.join(staging, 'bundle-receipt.json'), jsonBytes(receipt));

    const stagedFiles = (await listBundleFiles(staging)).filter(
      (entry) => entry.relativePath !== 'bundle-receipt.json',
    );
    exactRecords(
      stagedFiles,
      receiptFiles,
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_MANIFEST_FILES_MISMATCH',
      'Staged bundle',
    );
    await revalidateSources(verified, { requireTargetsAvailable: true });
    await rename(staging, output.absolute);
    return Object.freeze({
      status: 'materialized',
      bundleRoot: output.absolute,
      bundleId,
      planSha256: verified.plan.documentSha256,
      manifestSha256: manifest.manifestSha256,
      receiptSha256: receipt.receiptSha256,
      payloadFileCount: payloadRecords.length,
      fileCount: receiptFiles.length + 1,
      sourceImageBytesIncluded: false,
      workspaceFilePlanApplied: false,
      runtimeActivationAllowed: false,
    });
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyProjectArtAvatarSequenceBundle({ bundleRoot }) {
  const lexicalRoot = path.resolve(bundleRoot);
  const rootMetadata = await lstat(lexicalRoot).catch(() => undefined);
  if (!rootMetadata?.isDirectory() || rootMetadata.isSymbolicLink()) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_OUTPUT_INVALID',
      'Bundle root must be an ordinary directory.',
    );
  }
  const manifest = validateManifest(
    (await readJsonStable(path.join(lexicalRoot, 'bundle-manifest.json'), 'bundle manifest'))
      .value,
  );
  const receipt = validateReceipt(
    (await readJsonStable(path.join(lexicalRoot, 'bundle-receipt.json'), 'bundle receipt'))
      .value,
  );
  validateInertBundle(manifest, 'manifest');
  validateInertBundle(receipt, 'receipt');
  if (
    receipt.bundleId !== manifest.bundleId ||
    receipt.planId !== manifest.planId ||
    receipt.assignmentId !== manifest.assignmentId ||
    receipt.characterId !== manifest.characterId ||
    receipt.planSha256 !== manifest.planSha256 ||
    receipt.manifestSha256 !== manifest.manifestSha256 ||
    receipt.createdAt !== manifest.createdAt ||
    receipt.fileCount !== receipt.files.length ||
    receipt.wholeRunAtomicMaterialization !== true
  ) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RECEIPT_INVALID', 'Receipt binding drifted.');
  }
  timestamp(manifest.createdAt, 'manifest.createdAt');

  const plan = (
    await readJsonStable(path.join(lexicalRoot, 'mastering-plan.json'), 'mastering plan')
  ).value;
  const verified = verifyProjectArtAvatarSequencePlan(plan);
  const output = await resolveOutputRoot(verified.workspaceRoot, lexicalRoot, {
    existing: true,
  });
  if (receipt.outputPath !== output.relative) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_OUTPUT_MOVED',
      'Bundle output path no longer matches its receipt.',
    );
  }
  if (
    manifest.bundleId !==
      `avatar-sequence-bundle-${verified.plan.documentSha256.slice(0, 24)}` ||
    manifest.planId !== verified.plan.planId ||
    manifest.assignmentId !== verified.plan.assignmentId ||
    manifest.characterId !== verified.plan.characterId ||
    manifest.planSha256 !== verified.plan.documentSha256 ||
    manifest.sourceCount !== verified.sourceCount ||
    manifest.clipCount !== verified.clipCount ||
    manifest.loopRequestCount !== verified.loopClipCount
  ) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_MANIFEST_INVALID', 'Manifest plan binding drifted.');
  }

  const actualFiles = await listBundleFiles(lexicalRoot);
  const actualWithoutReceipt = actualFiles.filter(
    (entry) => entry.relativePath !== 'bundle-receipt.json',
  );
  exactRecords(
    actualWithoutReceipt,
    receipt.files,
    'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_MANIFEST_FILES_MISMATCH',
    'Bundle receipt',
  );
  const payloadActual = actualFiles.filter(
    (entry) =>
      entry.relativePath !== 'bundle-manifest.json' &&
      entry.relativePath !== 'bundle-receipt.json',
  );
  exactRecords(
    payloadActual,
    manifest.files,
    'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_MANIFEST_FILES_MISMATCH',
    'Bundle manifest',
  );

  const payloads = expectedPayloads(verified.plan);
  if (payloads.length !== manifest.files.length) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_MANIFEST_FILES_MISMATCH');
  }
  const manifestByPath = new Map(
    manifest.files.map((entry) => [entry.relativePath, entry]),
  );
  for (const [relativePath, expectedValue] of payloads) {
    if (!manifestByPath.has(relativePath)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_MANIFEST_FILES_MISMATCH');
    }
    const actualValue = (
      await readJsonStable(
        path.join(lexicalRoot, ...relativePath.split('/')),
        `bundle payload ${relativePath}`,
      )
    ).value;
    if (canonicalJson(actualValue) !== canonicalJson(expectedValue)) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_PAYLOAD_MISMATCH',
        `Bundle payload differs: ${relativePath}.`,
      );
    }
  }
  await revalidateSources(verified, { requireTargetsAvailable: false });
  return Object.freeze({
    status: 'passed',
    bundleRoot: lexicalRoot,
    bundleId: manifest.bundleId,
    planSha256: verified.plan.documentSha256,
    manifestSha256: manifest.manifestSha256,
    receiptSha256: receipt.receiptSha256,
    verifiedFileCount: actualFiles.length,
    sourceCount: verified.sourceCount,
    loopRequestCount: verified.loopClipCount,
    sourceIdentitiesRevalidated: true,
    sourceImageBytesIncluded: false,
    workspaceFilePlanApplied: false,
    runtimeActivationAllowed: false,
  });
}

export { BUNDLE_AUTHORITY_KEYS };
