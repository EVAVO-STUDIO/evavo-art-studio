import { createHash } from "node:crypto";
import { constants as fsConstants, type Stats } from "node:fs";
import {
  lstat,
  open,
  realpath,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";

import {
  LEGACY_BOOK_ART_DRY_RUN_READINESS_BATCH_CONTRACT,
  assessLegacyBookArtDryRunReadinessBatch,
  type LegacyBookArtDryRunReadinessBatchResultV1,
} from "@evavo/art-book-runtime/legacy-registration-readiness-batch";

export const LEGACY_BOOK_ART_READINESS_FILE_SCHEMA_VERSION = 1 as const;
export const LEGACY_BOOK_ART_READINESS_FILE_CONTRACT =
  "evavo_book_art_legacy_dry_run_readiness_batch_file_v1" as const;

export interface LegacyBookArtReadinessFileCommandInputV1 {
  inputPath: string;
  sourceRoot: string;
  receiptPath: string;
}

export interface LegacyBookArtReadinessSourceFileEvidenceV1 {
  itemId: string;
  sourceFile: string;
  sourceContentSha256: string;
  sourceByteLength: number;
}

export interface LegacyBookArtReadinessFileReceiptV1 {
  outputKind: "evavo_legacy_book_art_dry_run_readiness_batch_file_receipt";
  schemaVersion: typeof LEGACY_BOOK_ART_READINESS_FILE_SCHEMA_VERSION;
  contract: typeof LEGACY_BOOK_ART_READINESS_FILE_CONTRACT;
  status: "blocked" | "ready";
  manifestFileName: string;
  manifestContentSha256: string;
  manifestByteLength: number;
  sourceFiles: LegacyBookArtReadinessSourceFileEvidenceV1[];
  sourceFileSetFingerprintSha256: string;
  batchResult: LegacyBookArtDryRunReadinessBatchResultV1;
  localReceiptFileCreated: true;
  networkCallPerformed: false;
  sourceArtifactWriteAttempted: false;
  evidenceArtifactWriteAttempted: false;
  providerCallPerformed: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  canonicalWriterChanged: false;
  runtimeCutoverApproved: false;
  retailerUploadPerformed: false;
  publicationPerformed: false;
  receiptFingerprintSha256: string;
}

export interface LegacyBookArtReadinessFileCommandResultV1 {
  outputKind: "evavo_legacy_book_art_dry_run_readiness_batch_file_command_result";
  schemaVersion: typeof LEGACY_BOOK_ART_READINESS_FILE_SCHEMA_VERSION;
  contract: typeof LEGACY_BOOK_ART_READINESS_FILE_CONTRACT;
  status: "blocked" | "ready";
  receiptPath: string;
  receiptContentSha256: string;
  receiptByteLength: number;
  receiptFingerprintSha256: string;
  batchFingerprintSha256: string;
  receiptSetFingerprintSha256: string;
  itemCount: number;
  readyCount: number;
  blockedCount: number;
  localReceiptFileWritten: true;
  networkCallPerformed: false;
  sourceArtifactWriteAttempted: false;
  evidenceArtifactWriteAttempted: false;
  providerCallPerformed: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  canonicalWriterChanged: false;
  runtimeCutoverApproved: false;
  retailerUploadPerformed: false;
  publicationPerformed: false;
}

export class LegacyBookArtReadinessFileCommandError extends Error {
  public readonly code: string;

  public constructor(code: string) {
    super(code);
    this.name = "LegacyBookArtReadinessFileCommandError";
    this.code = code;
  }
}

interface ManifestItem {
  itemId: string;
  registrationInput: unknown;
  sourceFile: string;
}

interface Manifest {
  batchId: string;
  sourceRepository: "EVAVO-STUDIO/Website";
  sourceCommitSha: string;
  compiledAt: string;
  compiledBy: string;
  items: ManifestItem[];
  sourceArtifactWritesAllowed: false;
  evidenceArtifactWritesAllowed: false;
  providerCallsAllowed: false;
  selectionAllowed: false;
  promotionAllowed: false;
  bookUseBindingAllowed: false;
  canonicalWriterChangeAllowed: false;
  runtimeCutoverApprovalAllowed: false;
  publicationAllowed: false;
}

interface ReadFileResult {
  bytes: Buffer;
  resolvedPath: string;
}

const MAXIMUM_MANIFEST_BYTES = 16 * 1024 * 1024;
const MAXIMUM_RECEIPT_BYTES = 64 * 1024 * 1024;
const MAXIMUM_SOURCE_BYTES = 512 * 1024 * 1024;
const MAXIMUM_TOTAL_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;
const MAXIMUM_ITEMS = 10_000;
const MAXIMUM_SOURCE_PATH_LENGTH = 1_024;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._@:/-]{0,299}$/u;
const COMMIT_SHA = /^[a-f0-9]{40}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const MANIFEST_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "batchId",
  "sourceRepository",
  "sourceCommitSha",
  "compiledAt",
  "compiledBy",
  "items",
  "sourceArtifactWritesAllowed",
  "evidenceArtifactWritesAllowed",
  "providerCallsAllowed",
  "selectionAllowed",
  "promotionAllowed",
  "bookUseBindingAllowed",
  "canonicalWriterChangeAllowed",
  "runtimeCutoverApprovalAllowed",
  "publicationAllowed",
]);
const ITEM_FIELDS = new Set(["itemId", "registrationInput", "sourceFile"]);
const FALSE_AUTHORITY_FIELDS = [
  "sourceArtifactWritesAllowed",
  "evidenceArtifactWritesAllowed",
  "providerCallsAllowed",
  "selectionAllowed",
  "promotionAllowed",
  "bookUseBindingAllowed",
  "canonicalWriterChangeAllowed",
  "runtimeCutoverApprovalAllowed",
  "publicationAllowed",
] as const;

/**
 * Read an explicit private legacy-art manifest and exact local source files,
 * compile one batch readiness result, and write one exclusive local receipt.
 *
 * The output file is reserved before the manifest or any source bytes are read.
 * This command performs no network request and has no Art Studio write,
 * provider, selection, promotion, Book-use, canonical-writer, cutover,
 * retailer-upload, or publication authority.
 */
export async function runLegacyBookArtReadinessFileCommand(
  input: LegacyBookArtReadinessFileCommandInputV1,
): Promise<LegacyBookArtReadinessFileCommandResultV1> {
  const inputPath = requiredPath(input.inputPath, "INPUT_PATH_REQUIRED");
  const sourceRoot = requiredPath(input.sourceRoot, "SOURCE_ROOT_REQUIRED");
  const receiptPath = requiredPath(input.receiptPath, "RECEIPT_PATH_REQUIRED");
  const receipt = await reserveReceipt(receiptPath);
  let receiptClosed = false;
  let receiptCommitted = false;

  try {
    const inspectedRoot = await inspectPlainDirectory(sourceRoot, "SOURCE_ROOT_INVALID");
    const manifestFile = await readExactRegularFile(
      inputPath,
      MAXIMUM_MANIFEST_BYTES,
      "MANIFEST_INVALID",
    );
    const manifest = parseManifest(manifestFile.bytes);
    const sourceFiles: LegacyBookArtReadinessSourceFileEvidenceV1[] = [];
    const batchItems: Array<{
      itemId: string;
      registrationInput: unknown;
      sourceBytes: Uint8Array;
    }> = [];
    let totalBytes = 0;

    for (const item of [...manifest.items].sort((left, right) =>
      left.itemId.localeCompare(right.itemId)
    )) {
      const source = await readRelativeSource(
        inspectedRoot,
        item.sourceFile,
        item.itemId,
      );
      totalBytes += source.bytes.byteLength;
      if (totalBytes > MAXIMUM_TOTAL_SOURCE_BYTES) {
        fail("SOURCE_SET_TOO_LARGE");
      }
      sourceFiles.push({
        itemId: item.itemId,
        sourceFile: item.sourceFile,
        sourceContentSha256: hash(source.bytes),
        sourceByteLength: source.bytes.byteLength,
      });
      batchItems.push({
        itemId: item.itemId,
        registrationInput: item.registrationInput,
        sourceBytes: source.bytes,
      });
    }

    const batchResult = await assessLegacyBookArtDryRunReadinessBatch({
      outputKind: "evavo_legacy_book_art_dry_run_readiness_batch_input",
      schemaVersion: 1,
      contract: LEGACY_BOOK_ART_DRY_RUN_READINESS_BATCH_CONTRACT,
      batchId: manifest.batchId,
      sourceRepository: manifest.sourceRepository,
      sourceCommitSha: manifest.sourceCommitSha,
      compiledAt: manifest.compiledAt,
      compiledBy: manifest.compiledBy,
      items: batchItems,
      sourceArtifactWritesAllowed: false,
      evidenceArtifactWritesAllowed: false,
      providerCallsAllowed: false,
      selectionAllowed: false,
      promotionAllowed: false,
      bookUseBindingAllowed: false,
      canonicalWriterChangeAllowed: false,
      runtimeCutoverApprovalAllowed: false,
      publicationAllowed: false,
    });

    const receiptWithoutFingerprint = {
      outputKind:
        "evavo_legacy_book_art_dry_run_readiness_batch_file_receipt" as const,
      schemaVersion: LEGACY_BOOK_ART_READINESS_FILE_SCHEMA_VERSION,
      contract: LEGACY_BOOK_ART_READINESS_FILE_CONTRACT,
      status: batchResult.status,
      manifestFileName: path.basename(manifestFile.resolvedPath),
      manifestContentSha256: hash(manifestFile.bytes),
      manifestByteLength: manifestFile.bytes.byteLength,
      sourceFiles,
      sourceFileSetFingerprintSha256: fingerprint(sourceFiles),
      batchResult,
      localReceiptFileCreated: true as const,
      networkCallPerformed: false as const,
      sourceArtifactWriteAttempted: false as const,
      evidenceArtifactWriteAttempted: false as const,
      providerCallPerformed: false as const,
      selectionPerformed: false as const,
      promotionPerformed: false as const,
      bookUseBindingCreated: false as const,
      canonicalWriterChanged: false as const,
      runtimeCutoverApproved: false as const,
      retailerUploadPerformed: false as const,
      publicationPerformed: false as const,
    };
    const fileReceipt: LegacyBookArtReadinessFileReceiptV1 = {
      ...receiptWithoutFingerprint,
      receiptFingerprintSha256: fingerprint(receiptWithoutFingerprint),
    };
    const content = Buffer.from(`${JSON.stringify(fileReceipt, null, 2)}\n`, "utf8");
    if (content.byteLength > MAXIMUM_RECEIPT_BYTES) {
      fail("RECEIPT_TOO_LARGE");
    }

    await receipt.handle.writeFile(content);
    await receipt.handle.sync();
    await receipt.handle.close();
    receiptClosed = true;

    const installed = await readExactRegularFile(
      receipt.path,
      MAXIMUM_RECEIPT_BYTES,
      "RECEIPT_READBACK_INVALID",
    );
    if (!installed.bytes.equals(content)) {
      fail("RECEIPT_READBACK_MISMATCH");
    }
    receiptCommitted = true;

    return {
      outputKind:
        "evavo_legacy_book_art_dry_run_readiness_batch_file_command_result",
      schemaVersion: LEGACY_BOOK_ART_READINESS_FILE_SCHEMA_VERSION,
      contract: LEGACY_BOOK_ART_READINESS_FILE_CONTRACT,
      status: batchResult.status,
      receiptPath: receipt.path,
      receiptContentSha256: hash(content),
      receiptByteLength: content.byteLength,
      receiptFingerprintSha256: fileReceipt.receiptFingerprintSha256,
      batchFingerprintSha256: batchResult.batchFingerprintSha256,
      receiptSetFingerprintSha256: batchResult.receiptSetFingerprintSha256,
      itemCount: batchResult.itemCount,
      readyCount: batchResult.readyCount,
      blockedCount: batchResult.blockedCount,
      localReceiptFileWritten: true,
      networkCallPerformed: false,
      sourceArtifactWriteAttempted: false,
      evidenceArtifactWriteAttempted: false,
      providerCallPerformed: false,
      selectionPerformed: false,
      promotionPerformed: false,
      bookUseBindingCreated: false,
      canonicalWriterChanged: false,
      runtimeCutoverApproved: false,
      retailerUploadPerformed: false,
      publicationPerformed: false,
    };
  } catch (error: unknown) {
    if (!receiptClosed) {
      await receipt.handle.close().catch(() => undefined);
    }
    if (!receiptCommitted) {
      await unlink(receipt.path).catch(() => undefined);
    }
    if (error instanceof LegacyBookArtReadinessFileCommandError) throw error;
    throw new LegacyBookArtReadinessFileCommandError(
      "LEGACY_BOOK_ART_READINESS_FILE_COMMAND_FAILED",
    );
  }
}

function parseManifest(bytes: Buffer): Manifest {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    fail("MANIFEST_JSON_INVALID");
  }
  const source = exactRecord(value, MANIFEST_FIELDS, "MANIFEST_SHAPE_INVALID");
  if (
    source.outputKind !==
      "evavo_legacy_book_art_dry_run_readiness_batch_file_input" ||
    source.schemaVersion !== LEGACY_BOOK_ART_READINESS_FILE_SCHEMA_VERSION ||
    source.contract !== LEGACY_BOOK_ART_READINESS_FILE_CONTRACT
  ) {
    fail("MANIFEST_CONTRACT_INVALID");
  }
  const batchId = safeId(source.batchId, "MANIFEST_BATCH_ID_INVALID");
  if (source.sourceRepository !== "EVAVO-STUDIO/Website") {
    fail("MANIFEST_SOURCE_REPOSITORY_INVALID");
  }
  const sourceCommitSha = stringValue(source.sourceCommitSha);
  if (!COMMIT_SHA.test(sourceCommitSha)) {
    fail("MANIFEST_SOURCE_COMMIT_INVALID");
  }
  const compiledAt = stringValue(source.compiledAt);
  if (!isTimestamp(compiledAt)) {
    fail("MANIFEST_COMPILED_AT_INVALID");
  }
  const compiledBy = boundedText(
    source.compiledBy,
    300,
    "MANIFEST_COMPILED_BY_INVALID",
  );
  for (const field of FALSE_AUTHORITY_FIELDS) {
    if (source[field] !== false) {
      fail(`MANIFEST_${field.toUpperCase()}_MUST_REMAIN_FALSE`);
    }
  }

  if (
    !Array.isArray(source.items) ||
    source.items.length < 1 ||
    source.items.length > MAXIMUM_ITEMS
  ) {
    fail("MANIFEST_ITEMS_INVALID");
  }
  const items: ManifestItem[] = [];
  const itemIds = new Set<string>();
  const sourceFiles = new Set<string>();
  for (const [index, value] of source.items.entries()) {
    const item = exactRecord(
      value,
      ITEM_FIELDS,
      `MANIFEST_ITEM_${index}_SHAPE_INVALID`,
    );
    const itemId = safeId(item.itemId, `MANIFEST_ITEM_${index}_ID_INVALID`);
    if (itemIds.has(itemId)) fail("MANIFEST_ITEM_ID_DUPLICATE");
    itemIds.add(itemId);
    const sourceFile = portableRelativePath(
      item.sourceFile,
      `MANIFEST_ITEM_${index}_SOURCE_FILE_INVALID`,
    );
    if (sourceFiles.has(sourceFile)) fail("MANIFEST_SOURCE_FILE_DUPLICATE");
    sourceFiles.add(sourceFile);
    const registrationInput = exactJsonValue(
      item.registrationInput,
      `MANIFEST_ITEM_${index}_REGISTRATION_INPUT_INVALID`,
    );
    items.push({ itemId, registrationInput, sourceFile });
  }

  return {
    batchId,
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommitSha,
    compiledAt,
    compiledBy,
    items,
    sourceArtifactWritesAllowed: false,
    evidenceArtifactWritesAllowed: false,
    providerCallsAllowed: false,
    selectionAllowed: false,
    promotionAllowed: false,
    bookUseBindingAllowed: false,
    canonicalWriterChangeAllowed: false,
    runtimeCutoverApprovalAllowed: false,
    publicationAllowed: false,
  };
}

async function inspectPlainDirectory(
  directoryPath: string,
  errorCode: string,
): Promise<string> {
  try {
    const resolved = path.resolve(directoryPath);
    const info = await lstat(resolved);
    if (!info.isDirectory() || info.isSymbolicLink()) fail(errorCode);
    const canonical = await realpath(resolved);
    if (!samePath(canonical, resolved)) fail(errorCode);
    return canonical;
  } catch (error: unknown) {
    if (error instanceof LegacyBookArtReadinessFileCommandError) throw error;
    fail(errorCode);
  }
}

async function readRelativeSource(
  sourceRoot: string,
  sourceFile: string,
  itemId: string,
): Promise<ReadFileResult> {
  const segments = sourceFile.split("/");
  let current = sourceRoot;
  try {
    for (let index = 0; index < segments.length; index += 1) {
      current = path.join(current, segments[index]!);
      const info = await lstat(current);
      if (info.isSymbolicLink()) fail(`SOURCE_FILE_SYMLINK:${itemId}`);
      if (index < segments.length - 1 && !info.isDirectory()) {
        fail(`SOURCE_PARENT_INVALID:${itemId}`);
      }
      if (index === segments.length - 1 && !info.isFile()) {
        fail(`SOURCE_FILE_INVALID:${itemId}`);
      }
    }
    const relative = path.relative(sourceRoot, current);
    if (
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      fail(`SOURCE_FILE_OUTSIDE_ROOT:${itemId}`);
    }
    return await readExactRegularFile(
      current,
      MAXIMUM_SOURCE_BYTES,
      `SOURCE_FILE_READ_INVALID:${itemId}`,
    );
  } catch (error: unknown) {
    if (error instanceof LegacyBookArtReadinessFileCommandError) throw error;
    fail(`SOURCE_FILE_READ_INVALID:${itemId}`);
  }
}

async function readExactRegularFile(
  filePath: string,
  maximumBytes: number,
  errorCode: string,
): Promise<ReadFileResult> {
  let handle: FileHandle | undefined;
  try {
    const resolvedPath = path.resolve(filePath);
    const beforePath = await lstat(resolvedPath);
    if (!beforePath.isFile() || beforePath.isSymbolicLink()) fail(errorCode);
    const canonical = await realpath(resolvedPath);
    if (!samePath(canonical, resolvedPath)) fail(errorCode);

    handle = await open(
      resolvedPath,
      fsConstants.O_RDONLY | noFollowFlag(),
    );
    const before = await handle.stat();
    if (!before.isFile() || before.size < 1 || before.size > maximumBytes) {
      fail(errorCode);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    await handle.close();
    handle = undefined;
    const afterPath = await lstat(resolvedPath);
    const finalCanonical = await realpath(resolvedPath);
    if (
      !sameFile(before, after) ||
      !sameFile(beforePath, afterPath) ||
      !samePath(canonical, finalCanonical) ||
      bytes.byteLength !== before.size
    ) {
      fail(errorCode);
    }
    return { bytes, resolvedPath };
  } catch (error: unknown) {
    await handle?.close().catch(() => undefined);
    if (error instanceof LegacyBookArtReadinessFileCommandError) throw error;
    fail(errorCode);
  }
}

async function reserveReceipt(
  receiptPath: string,
): Promise<{ path: string; handle: FileHandle }> {
  const resolved = path.resolve(receiptPath);
  await inspectPlainDirectory(path.dirname(resolved), "RECEIPT_PARENT_INVALID");
  try {
    const handle = await open(
      resolved,
      fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        fsConstants.O_WRONLY |
        noFollowFlag(),
      0o600,
    );
    return { path: resolved, handle };
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "EEXIST"
    ) {
      fail("RECEIPT_ALREADY_EXISTS");
    }
    fail("RECEIPT_RESERVATION_FAILED");
  }
}

function exactRecord(
  value: unknown,
  allowedFields: ReadonlySet<string>,
  errorCode: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(errorCode);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(errorCode);
  const keys = Object.keys(value);
  if (keys.some((key) => !allowedFields.has(key))) fail(errorCode);
  return value as Record<string, unknown>;
}

function exactJsonValue(value: unknown, errorCode: string): unknown {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) fail(errorCode);
    return JSON.parse(encoded) as unknown;
  } catch {
    fail(errorCode);
  }
}

function portableRelativePath(value: unknown, errorCode: string): string {
  const source = stringValue(value);
  if (
    !source ||
    source.length > MAXIMUM_SOURCE_PATH_LENGTH ||
    source.trim() !== source ||
    source.includes("\0") ||
    source.includes("\\") ||
    path.posix.isAbsolute(source) ||
    path.posix.normalize(source) !== source
  ) {
    fail(errorCode);
  }
  const segments = source.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        /[\u0000-\u001f\u007f]/u.test(segment),
    )
  ) {
    fail(errorCode);
  }
  return source;
}

function requiredPath(value: string, code: string): string {
  if (!value || value.trim() !== value || value.includes("\0")) fail(code);
  return value;
}

function safeId(value: unknown, errorCode: string): string {
  const source = stringValue(value);
  if (!SAFE_ID.test(source)) fail(errorCode);
  return source;
}

function boundedText(value: unknown, maximum: number, errorCode: string): string {
  const source = stringValue(value);
  if (
    !source ||
    source.length > maximum ||
    source.trim() !== source ||
    /[\u0000-\u001f\u007f]/u.test(source)
  ) {
    fail(errorCode);
  }
  return source;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isTimestamp(value: string): boolean {
  if (!ISO_TIMESTAMP.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string) =>
    process.platform === "win32"
      ? path.resolve(value).toLowerCase()
      : path.resolve(value);
  return normalize(left) === normalize(right);
}

function sameFile(left: Stats, right: Stats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

function noFollowFlag(): number {
  return typeof fsConstants.O_NOFOLLOW === "number"
    ? fsConstants.O_NOFOLLOW
    : 0;
}

function hash(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprint(value: unknown): string {
  return hash(Buffer.from(JSON.stringify(canonical(value)), "utf8"));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

function fail(code: string): never {
  throw new LegacyBookArtReadinessFileCommandError(code);
}
