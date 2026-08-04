import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, lstat, mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  exportWebsiteBookStateToDocsSuite,
  type WebsiteBookStateMigrationExportInputV1,
  type WebsiteBookStateMigrationRecordV1,
} from "../src/evavo/bookStudio/storyBookStudioDocsSuiteStateMigrationExport";

const MAXIMUM_MANIFEST_BYTES = 4_000_000;
const MAXIMUM_SOURCE_BYTES = 4_000_000;
const MANIFEST_KEYS = new Set([
  "outputKind",
  "schemaVersion",
  "authorityMode",
  "bundleId",
  "sourceRepository",
  "sourceCommit",
  "projectId",
  "programmeId",
  "volumeIds",
  "artworkRequiredVolumeIds",
  "records",
  "compiledAt",
  "compiledBy",
  "evidenceIds",
  "authoritativeWritesAllowed",
  "canonicalManuscriptMutationAllowed",
  "runtimeCutoverApproved",
  "sourceDeletionApproved",
  "publicationPerformed",
]);
const RECORD_KEYS = new Set([
  "migrationItemId",
  "stateKind",
  "scope",
  "scopeId",
  "sourceFile",
  "evidenceIds",
]);

export interface WebsiteBookStateMigrationExportManifestRecordV1 {
  migrationItemId: string;
  stateKind: WebsiteBookStateMigrationRecordV1["stateKind"];
  scope: WebsiteBookStateMigrationRecordV1["scope"];
  scopeId: string;
  sourceFile: string;
  evidenceIds: string[];
}

export interface WebsiteBookStateMigrationExportManifestV1
  extends Omit<WebsiteBookStateMigrationExportInputV1, "outputKind" | "records"> {
  outputKind: "evavo_website_book_state_migration_export_manifest";
  records: WebsiteBookStateMigrationExportManifestRecordV1[];
}

export async function loadWebsiteBookStateMigrationExportInput(
  manifestPath: string,
): Promise<WebsiteBookStateMigrationExportInputV1> {
  const absoluteManifest = path.resolve(manifestPath);
  const manifestStats = await lstat(absoluteManifest);
  if (!manifestStats.isFile() || manifestStats.isSymbolicLink()) {
    throw new Error("WEBSITE_BOOK_STATE_EXPORT_MANIFEST_FILE_INVALID");
  }
  const manifestBytes = await readFile(absoluteManifest);
  if (!manifestBytes.byteLength || manifestBytes.byteLength > MAXIMUM_MANIFEST_BYTES) {
    throw new Error("WEBSITE_BOOK_STATE_EXPORT_MANIFEST_SIZE_INVALID");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error("WEBSITE_BOOK_STATE_EXPORT_MANIFEST_JSON_INVALID");
  }
  const manifest = strictRecord(parsed, MANIFEST_KEYS, "manifest");
  if (
    manifest.outputKind !== "evavo_website_book_state_migration_export_manifest" ||
    manifest.schemaVersion !== 1 ||
    manifest.authorityMode !== "shadow_migration" ||
    manifest.sourceRepository !== "EVAVO-STUDIO/Website"
  ) {
    throw new Error("WEBSITE_BOOK_STATE_EXPORT_MANIFEST_CONTRACT_INVALID");
  }
  for (const key of [
    "authoritativeWritesAllowed",
    "canonicalManuscriptMutationAllowed",
    "runtimeCutoverApproved",
    "sourceDeletionApproved",
    "publicationPerformed",
  ]) {
    if (manifest[key] !== false) {
      throw new Error("WEBSITE_BOOK_STATE_EXPORT_MANIFEST_AUTHORITY_INVALID");
    }
  }
  if (!Array.isArray(manifest.records) || manifest.records.length < 1 || manifest.records.length > 10_000) {
    throw new Error("WEBSITE_BOOK_STATE_EXPORT_MANIFEST_RECORDS_INVALID");
  }

  const root = path.dirname(absoluteManifest);
  const records: WebsiteBookStateMigrationRecordV1[] = [];
  for (let index = 0; index < manifest.records.length; index += 1) {
    const entry = strictRecord(manifest.records[index], RECORD_KEYS, `records[${index}]`);
    const sourceFile = relativePath(entry.sourceFile, `records[${index}].sourceFile`);
    const absoluteSource = path.resolve(root, sourceFile);
    if (!isWithin(root, absoluteSource)) {
      throw new Error("WEBSITE_BOOK_STATE_EXPORT_SOURCE_PATH_ESCAPE");
    }
    const stats = await lstat(absoluteSource);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error("WEBSITE_BOOK_STATE_EXPORT_SOURCE_FILE_INVALID");
    }
    const bytes = await readFile(absoluteSource);
    if (!bytes.byteLength || bytes.byteLength > MAXIMUM_SOURCE_BYTES) {
      throw new Error("WEBSITE_BOOK_STATE_EXPORT_SOURCE_SIZE_INVALID");
    }
    let state: unknown;
    try {
      state = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new Error("WEBSITE_BOOK_STATE_EXPORT_SOURCE_JSON_INVALID");
    }
    const stateKind = entry.stateKind as WebsiteBookStateMigrationRecordV1["stateKind"];
    const record: WebsiteBookStateMigrationRecordV1 = {
      migrationItemId: stringValue(entry.migrationItemId, "migrationItemId"),
      stateKind,
      scope: entry.scope as WebsiteBookStateMigrationRecordV1["scope"],
      scopeId: stringValue(entry.scopeId, "scopeId"),
      source: {
        sourcePath: sourceFile,
        sourceGitBlobSha1: gitBlobSha1(bytes),
        sourceByteLength: bytes.byteLength,
        sourceContentSha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      },
      evidenceIds: stringArray(entry.evidenceIds, "record.evidenceIds"),
    };
    if (stateKind === "artwork_use") {
      const artwork = object(state, "artwork_use source");
      record.artworkUseValidation = {
        binding: object(artwork.binding, "artwork_use binding"),
        artifact: object(artwork.artifact, "artwork_use artifact"),
      };
    } else {
      record.payload = state;
    }
    records.push(record);
  }

  return {
    outputKind: "evavo_website_book_state_migration_export_input",
    schemaVersion: 1,
    authorityMode: "shadow_migration",
    bundleId: stringValue(manifest.bundleId, "bundleId"),
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommit: stringValue(manifest.sourceCommit, "sourceCommit"),
    projectId: stringValue(manifest.projectId, "projectId"),
    programmeId: stringValue(manifest.programmeId, "programmeId"),
    volumeIds: stringArray(manifest.volumeIds, "volumeIds"),
    artworkRequiredVolumeIds: stringArray(
      manifest.artworkRequiredVolumeIds,
      "artworkRequiredVolumeIds",
    ),
    records,
    compiledAt: stringValue(manifest.compiledAt, "compiledAt"),
    compiledBy: stringValue(manifest.compiledBy, "compiledBy"),
    evidenceIds: stringArray(manifest.evidenceIds, "evidenceIds"),
    authoritativeWritesAllowed: false,
    canonicalManuscriptMutationAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  };
}

export async function runWebsiteBookStateMigrationExport(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  if (command === "capabilities") {
    process.stdout.write(`${JSON.stringify({
      outputKind: "evavo_website_book_state_migration_export_capabilities",
      schemaVersion: 1,
      contract: "evavo_docs_book_state_migration_bundle_v1",
      command: "export",
      sourceRepository: "EVAVO-STUDIO/Website",
      exactSourceBytesHashed: true,
      exactGitBlobSha1Computed: true,
      operationValidationPerformed: true,
      bundleValidationPerformed: true,
      providerCalled: false,
      authoritativeWritesPerformed: false,
      canonicalManuscriptMutationPerformed: false,
      runtimeCutoverApproved: false,
      sourceDeletionApproved: false,
      publicationPerformed: false,
    }, null, 2)}\n`);
    return;
  }
  if (command !== "export") throw new Error(usage());
  const flags = flagsFrom(rest);
  const inputPath = requiredFlag(flags, "input");
  const outputPath = requiredFlag(flags, "output");
  const bundleOutput = flags.get("bundle-output");
  for (const key of flags.keys()) {
    if (!new Set(["input", "output", "bundle-output"]).has(key)) {
      throw new Error(`Unknown option --${key}.`);
    }
  }
  const input = await loadWebsiteBookStateMigrationExportInput(inputPath);
  const receipt = await exportWebsiteBookStateToDocsSuite({ exportInput: input });
  await writeExclusive(outputPath, receipt);
  if (bundleOutput) await writeExclusive(bundleOutput, receipt.bundle);
}

function usage(): string {
  return [
    "Usage:",
    "  npx tsx scripts/run-book-studio-state-migration-export.ts capabilities",
    "  npx tsx scripts/run-book-studio-state-migration-export.ts export --input manifest.json --output receipt.json [--bundle-output bundle.json]",
    "",
    "The manifest and every sourceFile must be regular, non-symlink JSON files under the manifest directory.",
    "The command hashes exact source bytes, performs one no-retry Docs operation validation per non-art state item, then performs one no-retry state-bundle validation.",
  ].join("\n");
}

function flagsFrom(argv: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!option?.startsWith("--") || option.length < 3) throw new Error(usage());
    const key = option.slice(2);
    if (flags.has(key)) throw new Error(`Duplicate option --${key}.`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Option --${key} requires a value.`);
    flags.set(key, value);
    index += 1;
  }
  return flags;
}
function requiredFlag(flags: Map<string, string>, key: string): string {
  const value = flags.get(key);
  if (!value) throw new Error(`Missing --${key}.\n${usage()}`);
  return value;
}
async function writeExclusive(filePath: string, value: unknown): Promise<void> {
  const absolute = path.resolve(filePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  try {
    await access(absolute, fsConstants.F_OK);
    throw new Error(`Refusing to overwrite existing output: ${absolute}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Refusing")) throw error;
  }
  const handle = await open(absolute, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }
}
function strictRecord(value: unknown, keys: Set<string>, label: string): Record<string, unknown> {
  const source = object(value, label);
  const unknown = Object.keys(source).filter((key) => !keys.has(key)).sort();
  if (unknown.length) throw new Error(`WEBSITE_BOOK_STATE_EXPORT_UNKNOWN_FIELDS:${label}:${unknown.join(",")}`);
  return source;
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`WEBSITE_BOOK_STATE_EXPORT_OBJECT_INVALID:${label}`);
  }
  return value as Record<string, unknown>;
}
function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value !== value.trim() || !value) {
    throw new Error(`WEBSITE_BOOK_STATE_EXPORT_STRING_INVALID:${label}`);
  }
  return value;
}
function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > 16_384) {
    throw new Error(`WEBSITE_BOOK_STATE_EXPORT_ARRAY_INVALID:${label}`);
  }
  const values = value.map((entry) => stringValue(entry, label));
  if (new Set(values).size !== values.length) {
    throw new Error(`WEBSITE_BOOK_STATE_EXPORT_ARRAY_DUPLICATED:${label}`);
  }
  return values;
}
function relativePath(value: unknown, label: string): string {
  const source = stringValue(value, label);
  if (
    path.isAbsolute(source) ||
    source.includes("\\") ||
    source.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`WEBSITE_BOOK_STATE_EXPORT_RELATIVE_PATH_INVALID:${label}`);
  }
  return source;
}
function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
function gitBlobSha1(bytes: Uint8Array): string {
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.byteLength}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  runWebsiteBookStateMigrationExport(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Website state migration export failed."}\n`);
    process.exitCode = 1;
  });
}
