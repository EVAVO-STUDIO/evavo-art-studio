import { randomBytes } from "node:crypto";
import { constants as FS_CONSTANTS } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rmdir,
  unlink,
} from "node:fs/promises";
import path from "node:path";

import {
  LAYERED_GODOT_TRANSACTION_ROOT,
  LAYERED_GODOT_WORKSPACE_WRITER_PROTOCOL_VERSION,
  MAXIMUM_JOURNAL_BYTES,
  canonicalSha256,
  fail,
  portableRelativePath,
  repositoryName,
  sha256Value,
  text,
} from "./contract.mjs";
import {
  assertDirectory,
  assertSafeRegular,
  filesystemIdentity,
  inspectWorkspaceRoot,
  lstatMaybe,
  readStableRegularFile,
  revalidateWorkspaceRoot,
  sameFilesystemPath,
  syncDirectory,
} from "./filesystem.mjs";

const NOFOLLOW = FS_CONSTANTS.O_NOFOLLOW ?? 0;
const TRANSACTION_ID_PATTERN = /^[0-9a-f]{32}$/u;
const ACTIVE_DIRECTORY_PATTERN = /^([0-9a-f]{32})\.active$/u;
const RECORD_STAGE_PATTERN = /^\.journal-record-stage-[0-9a-f]{24}$/u;
const STAGE_NAME_PATTERN = /^stage-(\d{2})\.bin$/u;
const BACKUP_NAME_PATTERN = /^backup-(\d{2})\.bin$/u;

export const JOURNAL_INTENT_KIND =
  "evavo.layered-production.godot-workspace-transaction-intent";
export const JOURNAL_PREPARED_KIND =
  "evavo.layered-production.godot-workspace-transaction-prepared";
export const JOURNAL_FINALIZING_KIND =
  "evavo.layered-production.godot-workspace-transaction-finalizing";

function transactionFail(code, message, details = undefined) {
  fail(`LAYERED_GODOT_WRITE_${code}`, message, details);
}

function transactionRootPath(root) {
  return path.join(root.path, LAYERED_GODOT_TRANSACTION_ROOT);
}

function activeTransactionPath(root, transactionId) {
  return path.join(transactionRootPath(root), `${transactionId}.active`);
}

function recordPath(transactionPath, name) {
  return path.join(transactionPath, `${name}.json`);
}

function frozenIdentity(identity) {
  return Object.freeze({
    dev: String(identity.dev),
    ino: String(identity.ino),
    size: String(identity.size),
    mtimeNs: String(identity.mtimeNs),
  });
}

export function serializeFilesystemIdentity(identity) {
  return frozenIdentity(identity);
}

export function parentRelativePaths(resourcePaths) {
  const output = new Set();
  for (const resourcePath of resourcePaths) {
    const parts = resourcePath.split("/").slice(0, -1);
    for (let index = 1; index <= parts.length; index += 1) {
      output.add(parts.slice(0, index).join("/"));
    }
  }
  return [...output].sort((left, right) => {
    const depthDelta = left.split("/").length - right.split("/").length;
    return depthDelta || left.localeCompare(right);
  });
}

export async function snapshotPreexistingDirectories(root, resourcePaths) {
  await revalidateWorkspaceRoot(root);
  const existing = [];
  for (const relative of parentRelativePaths(resourcePaths)) {
    const absolute = path.join(root.path, ...relative.split("/"));
    const stats = await lstatMaybe(absolute);
    if (stats === null) continue;
    if (stats.isSymbolicLink()) {
      transactionFail(
        "SYMLINK_REJECTED",
        `Parent directory ${relative} must not be symbolic.`,
      );
    }
    if (!stats.isDirectory()) {
      transactionFail(
        "PARENT_INVALID",
        `Parent path ${relative} must be a directory.`,
      );
    }
    const resolved = await realpath(absolute);
    if (!sameFilesystemPath(resolved, absolute)) {
      transactionFail(
        "SYMLINK_REJECTED",
        `Parent directory ${relative} resolves through a symbolic path.`,
      );
    }
    existing.push(relative);
  }
  return Object.freeze(existing);
}

async function inspectTransactionRoot(root, { create = false } = {}) {
  await revalidateWorkspaceRoot(root);
  const rootPath = transactionRootPath(root);
  let stats = await lstatMaybe(rootPath);
  if (stats === null && create) {
    try {
      await mkdir(rootPath, { mode: 0o700 });
      await syncDirectory(root.path);
    } catch (error) {
      if (!error || typeof error !== "object" || error.code !== "EEXIST") {
        throw error;
      }
    }
    stats = await lstat(rootPath, { bigint: true });
  }
  if (stats === null) return null;
  if (stats.isSymbolicLink()) {
    transactionFail(
      "TRANSACTION_ROOT_INVALID",
      "Transaction root must not be a symbolic link.",
    );
  }
  if (!stats.isDirectory()) {
    transactionFail(
      "TRANSACTION_ROOT_INVALID",
      "Transaction root must be a directory.",
    );
  }
  const resolved = await realpath(rootPath);
  if (!sameFilesystemPath(resolved, rootPath)) {
    transactionFail(
      "TRANSACTION_ROOT_INVALID",
      "Transaction root resolves through a symbolic path.",
    );
  }
  return Object.freeze({
    path: rootPath,
    identity: await assertDirectory(rootPath, "transaction root"),
  });
}

export async function listActiveTransactions(root) {
  const txRoot = await inspectTransactionRoot(root);
  if (txRoot === null) return Object.freeze([]);
  const active = [];
  for (const entry of await readdir(txRoot.path, { withFileTypes: true })) {
    const match = ACTIVE_DIRECTORY_PATTERN.exec(entry.name);
    if (!match || !entry.isDirectory()) {
      transactionFail(
        "TRANSACTION_ROOT_INVALID",
        `Unexpected transaction-root entry ${entry.name}.`,
      );
    }
    const transactionPath = path.join(txRoot.path, entry.name);
    const stats = await lstat(transactionPath, { bigint: true });
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      transactionFail(
        "TRANSACTION_ROOT_INVALID",
        `Transaction ${entry.name} must be a real directory.`,
      );
    }
    const resolved = await realpath(transactionPath);
    if (!sameFilesystemPath(resolved, transactionPath)) {
      transactionFail(
        "TRANSACTION_ROOT_INVALID",
        `Transaction ${entry.name} resolves through a symbolic path.`,
      );
    }
    active.push(
      Object.freeze({
        transactionId: match[1],
        path: transactionPath,
        rootPath: txRoot.path,
      }),
    );
  }
  return Object.freeze(active.sort((a, b) => a.transactionId.localeCompare(b.transactionId)));
}

export async function assertNoOutstandingTransactions(root) {
  const active = await listActiveTransactions(root);
  if (active.length > 0) {
    transactionFail(
      "RECOVERY_REQUIRED",
      "An interrupted Godot workspace transaction must be recovered before another write.",
      { transactionIds: active.map((entry) => entry.transactionId) },
    );
  }
}

async function writeImmutableRecord(transactionPath, name, payload) {
  const finalPath = recordPath(transactionPath, name);
  if ((await lstatMaybe(finalPath)) !== null) {
    transactionFail(
      "JOURNAL_INVALID",
      `Journal record ${name}.json already exists.`,
    );
  }
  const recordWithoutHash = {
    schemaVersion: "1.0",
    protocolVersion: LAYERED_GODOT_WORKSPACE_WRITER_PROTOCOL_VERSION,
    ...payload,
  };
  const record = {
    ...recordWithoutHash,
    journalSha256: canonicalSha256(recordWithoutHash),
  };
  const data = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8");
  if (data.byteLength > MAXIMUM_JOURNAL_BYTES) {
    transactionFail("JOURNAL_INVALID", `Journal record ${name}.json is too large.`);
  }

  const stageName = `.journal-record-stage-${randomBytes(12).toString("hex")}`;
  const stagePath = path.join(transactionPath, stageName);
  let handle;
  try {
    handle = await open(
      stagePath,
      FS_CONSTANTS.O_WRONLY |
        FS_CONSTANTS.O_CREAT |
        FS_CONSTANTS.O_EXCL |
        NOFOLLOW,
      0o600,
    );
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await link(stagePath, finalPath);
    await syncDirectory(transactionPath);
    await unlink(stagePath);
    await syncDirectory(transactionPath);
  } catch (error) {
    if (handle) await handle.close();
    throw error;
  }
  return Object.freeze(record);
}

export async function createTransactionJournal(
  root,
  verified,
  preexistingDirectories,
) {
  await assertNoOutstandingTransactions(root);
  const txRoot = await inspectTransactionRoot(root, { create: true });
  const transactionId = randomBytes(16).toString("hex");
  const transactionPath = activeTransactionPath(root, transactionId);
  try {
    await mkdir(transactionPath, { mode: 0o700 });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      transactionFail("TRANSACTION_COLLISION", "Transaction identifier collision.");
    }
    throw error;
  }
  await syncDirectory(txRoot.path);
  let intent;
  try {
    intent = await writeImmutableRecord(transactionPath, "intent", {
      kind: JOURNAL_INTENT_KIND,
      transactionId,
      requestId: verified.requestId,
      revision: verified.revision,
      requestSha256: verified.requestSha256,
      integrationSha256: verified.integration.integrationSha256,
      expectedRepository: verified.expectedRepository,
      workspaceRoot: root.realPath,
      resources: verified.integration.resources.map((resource, index) => ({
        index,
        path: resource.path,
        sha256: resource.sha256,
        bytes: resource.bytes,
      })),
      preexistingDirectories: [...preexistingDirectories],
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    for (const entry of await readdir(transactionPath, { withFileTypes: true })) {
      const entryPath = path.join(transactionPath, entry.name);
      const stats = await lstat(entryPath, { bigint: true });
      assertSafeRegular(stats, `failed transaction entry ${entry.name}`);
      await unlink(entryPath);
    }
    await rmdir(transactionPath);
    await syncDirectory(txRoot.path);
    if ((await readdir(txRoot.path)).length === 0) {
      await rmdir(txRoot.path);
      await syncDirectory(root.path);
    }
    throw error;
  }
  return Object.freeze({
    transactionId,
    path: transactionPath,
    rootPath: txRoot.path,
    intent,
  });
}

export async function createTransactionStage(
  journal,
  index,
  expectedData,
) {
  const name = `stage-${String(index).padStart(2, "0")}.bin`;
  const stagePath = path.join(journal.path, name);
  let handle;
  try {
    handle = await open(
      stagePath,
      FS_CONSTANTS.O_WRONLY |
        FS_CONSTANTS.O_CREAT |
        FS_CONSTANTS.O_EXCL |
        NOFOLLOW,
      0o600,
    );
    await handle.writeFile(expectedData);
    await handle.sync();
    await handle.close();
    handle = undefined;
  } catch (error) {
    if (handle) await handle.close();
    throw error;
  }
  const staged = await readStableRegularFile(stagePath, `transaction stage ${index}`);
  if (!staged.data.equals(expectedData)) {
    transactionFail(
      "STAGE_INVALID",
      `Transaction stage ${index} did not retain the exact expected bytes.`,
    );
  }
  await syncDirectory(journal.path);
  return Object.freeze({
    name,
    path: stagePath,
    identity: staged.identity,
  });
}

export function transactionBackupName(index) {
  return `backup-${String(index).padStart(2, "0")}.bin`;
}

export function transactionBackupPath(transactionPath, index) {
  return path.join(transactionPath, transactionBackupName(index));
}

export async function writePreparedJournal(journal, operations) {
  const prepared = await writeImmutableRecord(journal.path, "prepared", {
    kind: JOURNAL_PREPARED_KIND,
    transactionId: journal.transactionId,
    intentSha256: journal.intent.journalSha256,
    operations: operations.map((operation) => ({
      index: operation.index,
      path: operation.relativePath,
      outcome: operation.outcome,
      resourceSha256: operation.resource.sha256,
      resourceBytes: operation.resource.bytes,
      stage:
        operation.stage === null
          ? null
          : {
              name: operation.stage.name,
              identity: serializeFilesystemIdentity(operation.stage.identity),
            },
      existing:
        operation.existing === null
          ? null
          : {
              sha256: operation.existing.sha256,
              bytes: operation.existing.bytes,
              identity: serializeFilesystemIdentity(operation.existing.identity),
            },
      backupName: operation.backupName,
    })),
    preparedAt: new Date().toISOString(),
  });
  return Object.freeze(prepared);
}

export async function writeFinalizingJournal(journal, prepared) {
  return writeImmutableRecord(journal.path, "finalizing", {
    kind: JOURNAL_FINALIZING_KIND,
    transactionId: journal.transactionId,
    intentSha256: journal.intent.journalSha256,
    preparedSha256: prepared.journalSha256,
    finalizingAt: new Date().toISOString(),
  });
}

function validateJournalHash(record, expectedKind, transactionId, label) {
  if (
    record === null ||
    typeof record !== "object" ||
    Array.isArray(record) ||
    record.schemaVersion !== "1.0" ||
    record.protocolVersion !== LAYERED_GODOT_WORKSPACE_WRITER_PROTOCOL_VERSION ||
    record.kind !== expectedKind ||
    record.transactionId !== transactionId ||
    typeof record.journalSha256 !== "string"
  ) {
    transactionFail("JOURNAL_INVALID", `${label} is malformed.`);
  }
  const { journalSha256, ...withoutHash } = record;
  if (canonicalSha256(withoutHash) !== sha256Value(journalSha256, `${label}.journalSha256`)) {
    transactionFail("JOURNAL_INVALID", `${label} self-hash does not match.`);
  }
  return Object.freeze(record);
}

export async function readJournalRecord(
  transaction,
  name,
  expectedKind,
  { required = true } = {},
) {
  const filePath = recordPath(transaction.path, name);
  const stats = await lstatMaybe(filePath);
  if (stats === null) {
    if (!required) return null;
    transactionFail("JOURNAL_INVALID", `Missing ${name}.json journal record.`);
  }
  const inspected = await readStableRegularFile(filePath, `${name} journal record`);
  if (inspected.bytes > MAXIMUM_JOURNAL_BYTES) {
    transactionFail("JOURNAL_INVALID", `${name}.json exceeds the journal byte limit.`);
  }
  let parsed;
  try {
    parsed = JSON.parse(inspected.data.toString("utf8"));
  } catch {
    transactionFail("JOURNAL_INVALID", `${name}.json is not valid JSON.`);
  }
  return validateJournalHash(parsed, expectedKind, transaction.transactionId, `${name}.json`);
}

export function validateIntentRecord(intent, root, expectedRepository) {
  if (
    repositoryName(intent.expectedRepository, "journal expectedRepository") !==
      expectedRepository ||
    !sameFilesystemPath(text(intent.workspaceRoot, "journal workspaceRoot", 4096), root.realPath) ||
    !TRANSACTION_ID_PATTERN.test(intent.transactionId) ||
    !Array.isArray(intent.resources) ||
    intent.resources.length !== 7 ||
    !Array.isArray(intent.preexistingDirectories)
  ) {
    transactionFail(
      "JOURNAL_INVALID",
      "Transaction intent is not bound to the selected repository workspace.",
    );
  }
  const seenPaths = new Set();
  for (const [index, resource] of intent.resources.entries()) {
    if (
      resource.index !== index ||
      portableRelativePath(resource.path, `journal.resources[${index}].path`) !==
        resource.path ||
      seenPaths.has(resource.path) ||
      sha256Value(resource.sha256, `journal.resources[${index}].sha256`) !==
        resource.sha256 ||
      !Number.isSafeInteger(resource.bytes) ||
      resource.bytes < 0
    ) {
      transactionFail("JOURNAL_INVALID", `Transaction intent resource ${index} is invalid.`);
    }
    seenPaths.add(resource.path);
  }
  const expectedParents = new Set(parentRelativePaths(intent.resources.map((entry) => entry.path)));
  const seenParents = new Set();
  for (const relative of intent.preexistingDirectories) {
    if (
      portableRelativePath(relative, "journal preexisting directory") !== relative ||
      !expectedParents.has(relative) ||
      seenParents.has(relative)
    ) {
      transactionFail("JOURNAL_INVALID", "Transaction intent directory baseline is invalid.");
    }
    seenParents.add(relative);
  }
  return Object.freeze(intent);
}

function validateStoredIdentity(identity, label) {
  if (
    identity === null ||
    typeof identity !== "object" ||
    Array.isArray(identity) ||
    !["dev", "ino", "size", "mtimeNs"].every(
      (key) => typeof identity[key] === "string" && /^\d+$/u.test(identity[key]),
    )
  ) {
    transactionFail("JOURNAL_INVALID", `${label} filesystem identity is malformed.`);
  }
  return Object.freeze({ ...identity });
}

export function validatePreparedRecord(prepared, intent) {
  if (
    prepared.intentSha256 !== intent.journalSha256 ||
    !Array.isArray(prepared.operations) ||
    prepared.operations.length !== intent.resources.length
  ) {
    transactionFail("JOURNAL_INVALID", "Prepared journal is not bound to its exact intent.");
  }
  for (const [index, operation] of prepared.operations.entries()) {
    const resource = intent.resources[index];
    if (
      operation.index !== index ||
      operation.path !== resource.path ||
      operation.resourceSha256 !== resource.sha256 ||
      operation.resourceBytes !== resource.bytes ||
      !["created", "replaced", "unchanged"].includes(operation.outcome)
    ) {
      transactionFail("JOURNAL_INVALID", `Prepared operation ${index} is invalid.`);
    }
    if (operation.outcome === "unchanged") {
      if (operation.stage !== null || operation.backupName !== null || operation.existing === null) {
        transactionFail("JOURNAL_INVALID", `Unchanged operation ${index} is inconsistent.`);
      }
    } else {
      if (
        operation.stage === null ||
        typeof operation.stage.name !== "string" ||
        STAGE_NAME_PATTERN.exec(operation.stage.name)?.[1] !== String(index).padStart(2, "0")
      ) {
        transactionFail("JOURNAL_INVALID", `Prepared operation ${index} stage is invalid.`);
      }
      validateStoredIdentity(operation.stage.identity, `operation ${index} stage`);
      if (operation.outcome === "created") {
        if (operation.existing !== null || operation.backupName !== null) {
          transactionFail("JOURNAL_INVALID", `Created operation ${index} is inconsistent.`);
        }
      } else {
        if (
          operation.existing === null ||
          operation.backupName !== transactionBackupName(index)
        ) {
          transactionFail("JOURNAL_INVALID", `Replaced operation ${index} is inconsistent.`);
        }
      }
    }
    if (operation.existing !== null) {
      if (
        sha256Value(operation.existing.sha256, `operation ${index} prior sha256`) !==
          operation.existing.sha256 ||
        !Number.isSafeInteger(operation.existing.bytes) ||
        operation.existing.bytes < 0
      ) {
        transactionFail("JOURNAL_INVALID", `Prepared operation ${index} prior bytes are invalid.`);
      }
      validateStoredIdentity(operation.existing.identity, `operation ${index} prior`);
    }
  }
  return Object.freeze(prepared);
}

export function validateFinalizingRecord(finalizing, intent, prepared) {
  if (
    finalizing.intentSha256 !== intent.journalSha256 ||
    finalizing.preparedSha256 !== prepared.journalSha256
  ) {
    transactionFail("JOURNAL_INVALID", "Finalizing journal is not bound to the exact prepared state.");
  }
  return Object.freeze(finalizing);
}

export async function assertTransactionDirectoryEntries(
  transaction,
  { allowPrepared = true, allowFinalizing = true } = {},
) {
  for (const entry of await readdir(transaction.path, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      transactionFail("JOURNAL_INVALID", `Transaction entry ${entry.name} must not be symbolic.`);
    }
    const allowedRecord =
      entry.name === "intent.json" ||
      (allowPrepared && entry.name === "prepared.json") ||
      (allowFinalizing && entry.name === "finalizing.json");
    const allowedData =
      STAGE_NAME_PATTERN.test(entry.name) ||
      BACKUP_NAME_PATTERN.test(entry.name) ||
      RECORD_STAGE_PATTERN.test(entry.name);
    if (!entry.isFile() || (!allowedRecord && !allowedData)) {
      transactionFail(
        "JOURNAL_INVALID",
        `Unexpected transaction entry ${entry.name}.`,
      );
    }
    const stats = await lstat(path.join(transaction.path, entry.name), { bigint: true });
    assertSafeRegular(
      stats,
      `transaction entry ${entry.name}`,
      STAGE_NAME_PATTERN.test(entry.name) ? [1n, 2n] : [1n],
    );
  }
}

export async function removeTransactionDirectory(transaction) {
  await assertTransactionDirectoryEntries(transaction);
  for (const entry of await readdir(transaction.path, { withFileTypes: true })) {
    const entryPath = path.join(transaction.path, entry.name);
    const stats = await lstat(entryPath, { bigint: true });
    assertSafeRegular(stats, `transaction cleanup ${entry.name}`);
    await unlink(entryPath);
  }
  await syncDirectory(transaction.path);
  await rmdir(transaction.path);
  await syncDirectory(transaction.rootPath);
  const remaining = await readdir(transaction.rootPath);
  if (remaining.length === 0) {
    await rmdir(transaction.rootPath);
    await syncDirectory(path.dirname(transaction.rootPath));
  }
}

export async function readTransactionBundle(root, transaction, expectedRepository) {
  await revalidateWorkspaceRoot(root);
  await assertDirectory(transaction.path, `transaction ${transaction.transactionId}`);
  await assertTransactionDirectoryEntries(transaction);
  const intent = validateIntentRecord(
    await readJournalRecord(transaction, "intent", JOURNAL_INTENT_KIND),
    root,
    expectedRepository,
  );
  const preparedRaw = await readJournalRecord(
    transaction,
    "prepared",
    JOURNAL_PREPARED_KIND,
    { required: false },
  );
  if (preparedRaw === null) {
    return Object.freeze({ transaction, intent, prepared: null, finalizing: null });
  }
  const prepared = validatePreparedRecord(preparedRaw, intent);
  const finalizingRaw = await readJournalRecord(
    transaction,
    "finalizing",
    JOURNAL_FINALIZING_KIND,
    { required: false },
  );
  const finalizing =
    finalizingRaw === null
      ? null
      : validateFinalizingRecord(finalizingRaw, intent, prepared);
  return Object.freeze({ transaction, intent, prepared, finalizing });
}
