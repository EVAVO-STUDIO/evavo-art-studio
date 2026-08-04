import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";

import {
  canonicalBookJson,
  sha256BookText,
} from "../../../../packages/core/src/book-studio-project-contracts";
import type {
  BookStateShadowImportPlanV1,
  BookStateShadowRollbackPlanV1,
  PreparedBookStateShadowImportV1,
} from "../../../../packages/core/src/book-studio-state-shadow-import";

const MAXIMUM_RECORD_BYTES = 16_000_000;
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const SHA256 = /^sha256:[a-f0-9]{64}$/;

interface ShadowSnapshotV1 {
  outputKind: "evavo_docs_book_state_shadow_snapshot";
  schemaVersion: 1;
  authorityMode: "shadow_migration";
  projectId: string;
  programmeId: string;
  revision: number;
  previousSnapshotFingerprint: string | null;
  importId: string;
  requestFingerprint: string;
  planFingerprint: string;
  bundleFingerprint: string;
  statePayloadFingerprint: string;
  bundle: PreparedBookStateShadowImportV1["request"]["bundle"];
  validationResult: PreparedBookStateShadowImportV1["validationResult"];
  importedAt: string;
  importedBy: string;
  evidenceIds: string[];
  snapshotFingerprint: string;
  canonicalWriterEnabled: false;
  publicationPerformed: false;
}

interface ShadowPointerV1 {
  outputKind: "evavo_docs_book_state_shadow_pointer";
  schemaVersion: 1;
  authorityMode: "shadow_migration";
  projectId: string;
  revision: number;
  currentSnapshotFingerprint: string;
  previousSnapshotFingerprint: string | null;
  bundleFingerprint: string;
  lastImportId: string;
  lastRequestFingerprint: string;
  lastIdempotencyKeySha256: string;
  updatedAt: string;
  pointerFingerprint: string;
  canonicalWriterEnabled: false;
  publicationPerformed: false;
}

export interface BookStateShadowImportReceiptV1 {
  outputKind: "evavo_docs_book_state_shadow_import_receipt";
  schemaVersion: 1;
  authorityMode: "shadow_migration";
  status: "committed";
  importId: string;
  projectId: string;
  revision: number;
  snapshotFingerprint: string;
  previousSnapshotFingerprint: string | null;
  bundleFingerprint: string;
  requestFingerprint: string;
  idempotencyKeySha256: string;
  committedAt: string;
  committedBy: string;
  receiptFingerprint: string;
  statePersisted: true;
  canonicalWriterEnabled: false;
  websiteCompatibilityRuntimeStillAuthoritative: true;
  runtimeCutoverApproved: false;
  sourceDeletionApproved: false;
  publicationPerformed: false;
}

export interface BookStateShadowRollbackReceiptV1 {
  outputKind: "evavo_docs_book_state_shadow_rollback_rehearsal_receipt";
  schemaVersion: 1;
  authorityMode: "shadow_migration";
  status: "rehearsal_passed";
  rehearsalId: string;
  projectId: string;
  currentRevision: number;
  currentSnapshotFingerprint: string;
  previousSnapshotFingerprint: string | null;
  restoreEmptyState: boolean;
  currentSnapshotVerified: true;
  previousSnapshotVerified: boolean;
  requestFingerprint: string;
  planFingerprint: string;
  rehearsedAt: string;
  rehearsedBy: string;
  evidenceIds: string[];
  receiptFingerprint: string;
  stateChanged: false;
  canonicalWriterEnabled: false;
  websiteCompatibilityRuntimeStillAuthoritative: true;
  runtimeCutoverApproved: false;
  sourceDeletionApproved: false;
  publicationPerformed: false;
}

interface ProjectPaths {
  root: string;
  snapshots: string;
  receipts: string;
  rehearsals: string;
  current: string;
  lock: string;
}

export class FileBookStudioShadowStatePersistence {
  readonly #root: string;

  constructor(root: string) {
    if (typeof root !== "string" || !root.trim()) {
      throw new Error("BOOK_STATE_SHADOW_STORE_ROOT_REQUIRED");
    }
    this.#root = path.resolve(root);
  }

  async importPrepared(prepared: PreparedBookStateShadowImportV1) {
    const project = await this.#project(prepared.plan.projectId, true);
    return withLock(project.lock, prepared.plan.requestFingerprint, async () => {
      const keyHash = sha(prepared.plan.idempotencyKey);
      const keyDigest = `sha256:${keyHash}`;
      const receiptPath = path.join(project.receipts, `${keyHash}.json`);
      const existing = await readOptional<BookStateShadowImportReceiptV1>(receiptPath);
      if (existing) {
        await verifyImportReceipt(existing);
        if (
          existing.projectId !== prepared.plan.projectId ||
          existing.requestFingerprint !== prepared.plan.requestFingerprint ||
          existing.idempotencyKeySha256 !== keyDigest
        ) throw new Error("BOOK_STATE_SHADOW_IMPORT_IDEMPOTENCY_CONFLICT");
        return { disposition: "idempotent_replay" as const, receipt: existing };
      }

      const current = await this.#readAndVerifyCurrent(project, prepared.plan.projectId);
      if (
        current?.lastRequestFingerprint === prepared.plan.requestFingerprint &&
        current.lastIdempotencyKeySha256 === keyDigest
      ) {
        const receipt = await receiptFromPointer(prepared.plan, current);
        await writeExclusive(receiptPath, receipt);
        return { disposition: "idempotent_replay" as const, receipt };
      }

      const revision = current?.revision ?? 0;
      const fingerprint = current?.currentSnapshotFingerprint ?? null;
      if (
        revision !== prepared.plan.expectedCurrentRevision ||
        fingerprint !== prepared.plan.expectedCurrentSnapshotFingerprint
      ) throw new Error("BOOK_STATE_SHADOW_IMPORT_COMPARE_AND_SWAP_CONFLICT");

      const nextRevision = revision + 1;
      const unsignedSnapshot: Omit<ShadowSnapshotV1, "snapshotFingerprint"> = {
        outputKind: "evavo_docs_book_state_shadow_snapshot",
        schemaVersion: 1,
        authorityMode: "shadow_migration",
        projectId: prepared.plan.projectId,
        programmeId: prepared.plan.programmeId,
        revision: nextRevision,
        previousSnapshotFingerprint: fingerprint,
        importId: prepared.plan.importId,
        requestFingerprint: prepared.plan.requestFingerprint,
        planFingerprint: prepared.plan.planFingerprint,
        bundleFingerprint: prepared.plan.bundleFingerprint,
        statePayloadFingerprint: prepared.plan.statePayloadFingerprint,
        bundle: prepared.request.bundle,
        validationResult: prepared.validationResult,
        importedAt: prepared.plan.requestedAt,
        importedBy: prepared.plan.requestedBy,
        evidenceIds: [...prepared.plan.evidenceIds],
        canonicalWriterEnabled: false,
        publicationPerformed: false,
      };
      const snapshot: ShadowSnapshotV1 = {
        ...unsignedSnapshot,
        snapshotFingerprint: await fingerprintRecord(unsignedSnapshot),
      };
      await writeExclusiveOrExact(
        snapshotPath(project, snapshot.snapshotFingerprint),
        snapshot,
      );

      const unsignedPointer: Omit<ShadowPointerV1, "pointerFingerprint"> = {
        outputKind: "evavo_docs_book_state_shadow_pointer",
        schemaVersion: 1,
        authorityMode: "shadow_migration",
        projectId: prepared.plan.projectId,
        revision: nextRevision,
        currentSnapshotFingerprint: snapshot.snapshotFingerprint,
        previousSnapshotFingerprint: fingerprint,
        bundleFingerprint: prepared.plan.bundleFingerprint,
        lastImportId: prepared.plan.importId,
        lastRequestFingerprint: prepared.plan.requestFingerprint,
        lastIdempotencyKeySha256: keyDigest,
        updatedAt: prepared.plan.requestedAt,
        canonicalWriterEnabled: false,
        publicationPerformed: false,
      };
      const pointer: ShadowPointerV1 = {
        ...unsignedPointer,
        pointerFingerprint: await fingerprintRecord(unsignedPointer),
      };
      await writeAtomic(project.current, pointer);

      const receipt = await receiptFromPointer(prepared.plan, pointer);
      await writeExclusive(receiptPath, receipt);
      return { disposition: "written" as const, receipt };
    });
  }

  async rehearseRollback(plan: BookStateShadowRollbackPlanV1) {
    const project = await this.#project(plan.projectId, false);
    return withLock(project.lock, plan.requestFingerprint, async () => {
      const receiptPath = path.join(
        project.rehearsals,
        `${sha(plan.rehearsalId)}.json`,
      );
      const existing = await readOptional<BookStateShadowRollbackReceiptV1>(receiptPath);
      if (existing) {
        await verifyRollbackReceipt(existing);
        if (
          existing.projectId !== plan.projectId ||
          existing.requestFingerprint !== plan.requestFingerprint ||
          existing.planFingerprint !== plan.planFingerprint
        ) throw new Error("BOOK_STATE_SHADOW_ROLLBACK_IDENTITY_CONFLICT");
        return { disposition: "idempotent_replay" as const, receipt: existing };
      }

      const current = await this.#readAndVerifyCurrent(project, plan.projectId);
      if (!current) throw new Error("BOOK_STATE_SHADOW_ROLLBACK_CURRENT_MISSING");
      if (
        current.revision !== plan.expectedCurrentRevision ||
        current.currentSnapshotFingerprint !== plan.expectedCurrentSnapshotFingerprint
      ) throw new Error("BOOK_STATE_SHADOW_ROLLBACK_CURRENT_CONFLICT");
      if (
        current.previousSnapshotFingerprint !== plan.expectedPreviousSnapshotFingerprint
      ) throw new Error("BOOK_STATE_SHADOW_ROLLBACK_PREVIOUS_CONFLICT");

      let previousSnapshotVerified = false;
      if (current.previousSnapshotFingerprint !== null) {
        const previous = await readOptional<ShadowSnapshotV1>(
          snapshotPath(project, current.previousSnapshotFingerprint),
        );
        if (!previous) throw new Error("BOOK_STATE_SHADOW_ROLLBACK_TARGET_MISSING");
        await verifySnapshot(previous);
        if (
          previous.projectId !== plan.projectId ||
          previous.revision !== current.revision - 1 ||
          previous.snapshotFingerprint !== current.previousSnapshotFingerprint
        ) throw new Error("BOOK_STATE_SHADOW_ROLLBACK_CHAIN_INVALID");
        previousSnapshotVerified = true;
      }

      const unsigned: Omit<BookStateShadowRollbackReceiptV1, "receiptFingerprint"> = {
        outputKind: "evavo_docs_book_state_shadow_rollback_rehearsal_receipt",
        schemaVersion: 1,
        authorityMode: "shadow_migration",
        status: "rehearsal_passed",
        rehearsalId: plan.rehearsalId,
        projectId: plan.projectId,
        currentRevision: current.revision,
        currentSnapshotFingerprint: current.currentSnapshotFingerprint,
        previousSnapshotFingerprint: current.previousSnapshotFingerprint,
        restoreEmptyState: current.previousSnapshotFingerprint === null,
        currentSnapshotVerified: true,
        previousSnapshotVerified,
        requestFingerprint: plan.requestFingerprint,
        planFingerprint: plan.planFingerprint,
        rehearsedAt: plan.requestedAt,
        rehearsedBy: plan.requestedBy,
        evidenceIds: [...plan.evidenceIds],
        stateChanged: false,
        canonicalWriterEnabled: false,
        websiteCompatibilityRuntimeStillAuthoritative: true,
        runtimeCutoverApproved: false,
        sourceDeletionApproved: false,
        publicationPerformed: false,
      };
      const receipt = {
        ...unsigned,
        receiptFingerprint: await fingerprintRecord(unsigned),
      };
      await writeExclusive(receiptPath, receipt);
      return { disposition: "written" as const, receipt };
    });
  }

  async #readAndVerifyCurrent(
    project: ProjectPaths,
    expectedProjectId: string,
  ): Promise<ShadowPointerV1 | undefined> {
    const pointer = await readOptional<ShadowPointerV1>(project.current);
    if (!pointer) return undefined;
    await verifyPointer(pointer);
    if (pointer.projectId !== expectedProjectId) {
      throw new Error("BOOK_STATE_SHADOW_POINTER_PROJECT_MISMATCH");
    }
    const currentSnapshot = await readOptional<ShadowSnapshotV1>(
      snapshotPath(project, pointer.currentSnapshotFingerprint),
    );
    if (!currentSnapshot) throw new Error("BOOK_STATE_SHADOW_CURRENT_SNAPSHOT_MISSING");
    await verifySnapshot(currentSnapshot);
    if (
      currentSnapshot.projectId !== expectedProjectId ||
      currentSnapshot.revision !== pointer.revision ||
      currentSnapshot.snapshotFingerprint !== pointer.currentSnapshotFingerprint ||
      currentSnapshot.previousSnapshotFingerprint !== pointer.previousSnapshotFingerprint ||
      currentSnapshot.bundleFingerprint !== pointer.bundleFingerprint
    ) throw new Error("BOOK_STATE_SHADOW_CURRENT_CHAIN_INVALID");
    return pointer;
  }

  async #project(projectId: string, create: boolean): Promise<ProjectPaths> {
    await ensureDirectory(this.#root, true);
    const root = path.join(this.#root, `project-${sha(projectId)}`);
    await ensureDirectory(root, create);
    const snapshots = path.join(root, "snapshots");
    const receipts = path.join(root, "receipts");
    const rehearsals = path.join(root, "rehearsals");
    const locks = path.join(root, "locks");
    for (const directory of [snapshots, receipts, rehearsals, locks]) {
      await ensureDirectory(directory, create);
    }
    return {
      root,
      snapshots,
      receipts,
      rehearsals,
      current: path.join(root, "current.json"),
      lock: path.join(locks, `${sha(projectId)}.lock`),
    };
  }
}

function snapshotPath(project: ProjectPaths, digest: string): string {
  if (!SHA256.test(digest)) throw new Error("BOOK_STATE_SHADOW_SNAPSHOT_DIGEST_INVALID");
  return path.join(project.snapshots, `${digest.slice("sha256:".length)}.json`);
}

async function receiptFromPointer(
  plan: BookStateShadowImportPlanV1,
  pointer: ShadowPointerV1,
): Promise<BookStateShadowImportReceiptV1> {
  const unsigned: Omit<BookStateShadowImportReceiptV1, "receiptFingerprint"> = {
    outputKind: "evavo_docs_book_state_shadow_import_receipt",
    schemaVersion: 1,
    authorityMode: "shadow_migration",
    status: "committed",
    importId: plan.importId,
    projectId: plan.projectId,
    revision: pointer.revision,
    snapshotFingerprint: pointer.currentSnapshotFingerprint,
    previousSnapshotFingerprint: pointer.previousSnapshotFingerprint,
    bundleFingerprint: pointer.bundleFingerprint,
    requestFingerprint: plan.requestFingerprint,
    idempotencyKeySha256: pointer.lastIdempotencyKeySha256,
    committedAt: pointer.updatedAt,
    committedBy: plan.requestedBy,
    statePersisted: true,
    canonicalWriterEnabled: false,
    websiteCompatibilityRuntimeStillAuthoritative: true,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  };
  return { ...unsigned, receiptFingerprint: await fingerprintRecord(unsigned) };
}

async function verifySnapshot(value: ShadowSnapshotV1): Promise<void> {
  const { snapshotFingerprint, ...unsigned } = value;
  if (
    value.outputKind !== "evavo_docs_book_state_shadow_snapshot" ||
    value.schemaVersion !== 1 ||
    value.authorityMode !== "shadow_migration" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    !SHA256.test(snapshotFingerprint) ||
    (value.previousSnapshotFingerprint !== null &&
      !SHA256.test(value.previousSnapshotFingerprint)) ||
    value.canonicalWriterEnabled !== false ||
    value.publicationPerformed !== false ||
    snapshotFingerprint !== await fingerprintRecord(unsigned)
  ) throw new Error("BOOK_STATE_SHADOW_SNAPSHOT_INVALID");
}

async function verifyPointer(value: ShadowPointerV1): Promise<void> {
  const { pointerFingerprint, ...unsigned } = value;
  if (
    value.outputKind !== "evavo_docs_book_state_shadow_pointer" ||
    value.schemaVersion !== 1 ||
    value.authorityMode !== "shadow_migration" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    !SHA256.test(value.currentSnapshotFingerprint) ||
    (value.previousSnapshotFingerprint !== null &&
      !SHA256.test(value.previousSnapshotFingerprint)) ||
    !SHA256.test(value.bundleFingerprint) ||
    !SHA256.test(value.lastRequestFingerprint) ||
    !SHA256.test(value.lastIdempotencyKeySha256) ||
    !SHA256.test(pointerFingerprint) ||
    value.canonicalWriterEnabled !== false ||
    value.publicationPerformed !== false ||
    pointerFingerprint !== await fingerprintRecord(unsigned)
  ) throw new Error("BOOK_STATE_SHADOW_POINTER_INVALID");
}

async function verifyImportReceipt(value: BookStateShadowImportReceiptV1) {
  const { receiptFingerprint, ...unsigned } = value;
  if (
    value.outputKind !== "evavo_docs_book_state_shadow_import_receipt" ||
    value.schemaVersion !== 1 ||
    value.authorityMode !== "shadow_migration" ||
    value.status !== "committed" ||
    value.statePersisted !== true ||
    !SHA256.test(value.snapshotFingerprint) ||
    (value.previousSnapshotFingerprint !== null &&
      !SHA256.test(value.previousSnapshotFingerprint)) ||
    !SHA256.test(value.bundleFingerprint) ||
    !SHA256.test(value.requestFingerprint) ||
    !SHA256.test(value.idempotencyKeySha256) ||
    !SHA256.test(receiptFingerprint) ||
    value.canonicalWriterEnabled !== false ||
    value.websiteCompatibilityRuntimeStillAuthoritative !== true ||
    value.runtimeCutoverApproved !== false ||
    value.sourceDeletionApproved !== false ||
    value.publicationPerformed !== false ||
    receiptFingerprint !== await fingerprintRecord(unsigned)
  ) throw new Error("BOOK_STATE_SHADOW_IMPORT_RECEIPT_INVALID");
}

async function verifyRollbackReceipt(value: BookStateShadowRollbackReceiptV1) {
  const { receiptFingerprint, ...unsigned } = value;
  if (
    value.outputKind !==
      "evavo_docs_book_state_shadow_rollback_rehearsal_receipt" ||
    value.schemaVersion !== 1 ||
    value.authorityMode !== "shadow_migration" ||
    value.status !== "rehearsal_passed" ||
    value.currentSnapshotVerified !== true ||
    value.stateChanged !== false ||
    !SHA256.test(value.currentSnapshotFingerprint) ||
    (value.previousSnapshotFingerprint !== null &&
      !SHA256.test(value.previousSnapshotFingerprint)) ||
    !SHA256.test(value.requestFingerprint) ||
    !SHA256.test(value.planFingerprint) ||
    !SHA256.test(receiptFingerprint) ||
    value.canonicalWriterEnabled !== false ||
    value.websiteCompatibilityRuntimeStillAuthoritative !== true ||
    value.runtimeCutoverApproved !== false ||
    value.sourceDeletionApproved !== false ||
    value.publicationPerformed !== false ||
    receiptFingerprint !== await fingerprintRecord(unsigned)
  ) throw new Error("BOOK_STATE_SHADOW_ROLLBACK_RECEIPT_INVALID");
}

async function ensureDirectory(directory: string, create: boolean): Promise<void> {
  const resolved = path.resolve(directory);
  const filesystemRoot = path.parse(resolved).root;
  const segments = path.relative(filesystemRoot, resolved).split(path.sep).filter(Boolean);
  let current = filesystemRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    let stat = await lstat(current).catch((error: unknown) => {
      if (isCode(error, "ENOENT")) return undefined;
      throw error;
    });
    let created = false;
    if (!stat) {
      if (!create) throw new Error("BOOK_STATE_SHADOW_STORE_DIRECTORY_MISSING");
      await mkdir(current, { mode: DIRECTORY_MODE });
      stat = await lstat(current);
      created = true;
    }
    if (!stat) throw new Error("BOOK_STATE_SHADOW_STORE_DIRECTORY_MISSING");
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error("BOOK_STATE_SHADOW_STORE_DIRECTORY_UNSAFE");
    }
    if (created || current === resolved) await chmod(current, DIRECTORY_MODE);
  }
}

async function withLock<T>(
  filePath: string,
  identity: string,
  run: () => Promise<T>,
): Promise<T> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let created = false;
  try {
    handle = await open(
      filePath,
      fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        fsConstants.O_WRONLY |
        noFollow(),
      FILE_MODE,
    );
    created = true;
    await handle.writeFile(`${identity}\n`, "utf8");
    await handle.sync();
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (created) {
      await unlink(filePath).catch((cleanupError: unknown) => {
        if (!isCode(cleanupError, "ENOENT")) throw cleanupError;
      });
    }
    if (isCode(error, "EEXIST")) throw new Error("BOOK_STATE_SHADOW_STORE_LOCKED");
    throw error;
  }
  if (!handle) throw new Error("BOOK_STATE_SHADOW_STORE_LOCK_HANDLE_MISSING");
  try {
    return await run();
  } finally {
    await handle.close();
    await unlink(filePath).catch((error: unknown) => {
      if (!isCode(error, "ENOENT")) throw error;
    });
  }
}

async function readOptional<T>(filePath: string): Promise<T | undefined> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const beforePath = await lstat(filePath);
    if (beforePath.isSymbolicLink() || !beforePath.isFile()) {
      throw new Error("BOOK_STATE_SHADOW_STORE_FILE_UNSAFE");
    }
    handle = await open(filePath, fsConstants.O_RDONLY | noFollow());
    const before = await handle.stat();
    if (!before.isFile() || before.size < 1 || before.size > MAXIMUM_RECORD_BYTES) {
      throw new Error("BOOK_STATE_SHADOW_STORE_FILE_SIZE_INVALID");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs
    ) throw new Error("BOOK_STATE_SHADOW_STORE_FILE_CHANGED_DURING_READ");
    try {
      return JSON.parse(bytes.toString("utf8")) as T;
    } catch {
      throw new Error("BOOK_STATE_SHADOW_STORE_JSON_INVALID");
    }
  } catch (error) {
    if (isCode(error, "ENOENT")) return undefined;
    throw error;
  } finally {
    await handle?.close();
  }
}

async function writeExclusive(filePath: string, value: unknown): Promise<void> {
  const source = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(source, "utf8") > MAXIMUM_RECORD_BYTES) {
    throw new Error("BOOK_STATE_SHADOW_STORE_RECORD_TOO_LARGE");
  }
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let created = false;
  let succeeded = false;
  try {
    handle = await open(
      filePath,
      fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        fsConstants.O_WRONLY |
        noFollow(),
      FILE_MODE,
    );
    created = true;
    await handle.writeFile(source, "utf8");
    await handle.sync();
    succeeded = true;
  } finally {
    await handle?.close();
    if (created && !succeeded) {
      await unlink(filePath).catch((error: unknown) => {
        if (!isCode(error, "ENOENT")) throw error;
      });
    }
  }
  await chmod(filePath, FILE_MODE);
  const installed = await readOptional<unknown>(filePath);
  if (canonicalBookJson(installed) !== canonicalBookJson(value)) {
    throw new Error("BOOK_STATE_SHADOW_STORE_READBACK_MISMATCH");
  }
}

async function writeExclusiveOrExact(filePath: string, value: unknown): Promise<void> {
  try {
    await writeExclusive(filePath, value);
  } catch (error) {
    if (!isCode(error, "EEXIST")) throw error;
    const installed = await readOptional<unknown>(filePath);
    if (canonicalBookJson(installed) !== canonicalBookJson(value)) {
      throw new Error("BOOK_STATE_SHADOW_STORE_IDENTITY_CONFLICT");
    }
  }
}

async function writeAtomic(filePath: string, value: unknown): Promise<void> {
  const temporary = `${filePath}.${sha(canonicalBookJson(value))}.tmp`;
  await writeExclusiveOrExact(temporary, value);
  try {
    const target = await lstat(filePath).catch((error: unknown) => {
      if (isCode(error, "ENOENT")) return undefined;
      throw error;
    });
    if (target && (target.isSymbolicLink() || !target.isFile())) {
      throw new Error("BOOK_STATE_SHADOW_STORE_POINTER_UNSAFE");
    }
    await rename(temporary, filePath);
    await chmod(filePath, FILE_MODE);
    await syncDirectory(path.dirname(filePath));
  } finally {
    await unlink(temporary).catch((error: unknown) => {
      if (!isCode(error, "ENOENT")) throw error;
    });
  }
  const installed = await readOptional<unknown>(filePath);
  if (canonicalBookJson(installed) !== canonicalBookJson(value)) {
    throw new Error("BOOK_STATE_SHADOW_STORE_POINTER_READBACK_MISMATCH");
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, fsConstants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function fingerprintRecord(value: unknown): Promise<string> {
  return sha256BookText(canonicalBookJson(value));
}

function sha(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function noFollow(): number {
  return typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0;
}

function isCode(error: unknown, code: string): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === code,
  );
}
