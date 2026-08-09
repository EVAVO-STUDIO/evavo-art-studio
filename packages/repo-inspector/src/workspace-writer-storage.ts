import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

import {
  ART_WORKSPACE_STORAGE_RECEIPT_VERSION,
  DEFAULT_MAXIMUM_FILE_BYTES,
  DEFAULT_PROCESS_OUTPUT_BYTES,
  DEFAULT_STORAGE_TIMEOUT_MS,
  ArtWorkspaceWriterError,
  type ArtWorkspaceStorageArchiveReceipt,
  type ArtWorkspaceWriterPolicy,
} from "./workspace-writer-types.js";
import {
  assertUserSourcePath,
  canonicalJson,
  fail,
  isRecord,
  sha256Bytes,
  validatedLimit,
} from "./workspace-writer-foundation.js";
import {
  absoluteFromRelative,
  ensureSafeParent,
  existingFile,
  resolveWorkspaceRoot,
  writeJsonCreateOnly,
} from "./workspace-writer-filesystem.js";
import { parseStorageRequest } from "./workspace-writer-requests.js";

function storageEnvironment(): NodeJS.ProcessEnv {
  const entries: Array<[string, string]> = [];
  const allowedExact = new Set([
    "PATH",
    "Path",
    "PATHEXT",
    "SystemRoot",
    "SYSTEMROOT",
    "ComSpec",
    "COMSPEC",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "HOMEDRIVE",
    "HOMEPATH",
    "HOME",
  ]);
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string") continue;
    if (allowedExact.has(key) || key.startsWith("EVAVO_STORAGE_")) {
      entries.push([key, value]);
    }
  }
  return Object.fromEntries(entries);
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /(token|secret|password|authorization|credential|api[_-]?key)/iu.test(key)
          ? "[REDACTED]"
          : redactSecrets(item),
      ]),
    );
  }
  return value;
}

async function runBoundedProcess(
  command: readonly string[],
  args: readonly string[],
  timeoutMs: number,
  outputLimitBytes: number,
): Promise<unknown> {
  const executable = command[0];
  if (!executable) {
    fail("ART_WORKSPACE_STORAGE_COMMAND_INVALID", "Storage command is empty.");
  }
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...command.slice(1), ...args], {
      shell: false,
      windowsHide: true,
      env: storageEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    const finish = (error?: Error, result?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const collect = (chunks: Buffer[], chunk: Buffer): void => {
      outputBytes += chunk.length;
      if (outputBytes > outputLimitBytes) {
        child.kill();
        finish(
          new ArtWorkspaceWriterError(
            "ART_WORKSPACE_STORAGE_OUTPUT_TOO_LARGE",
            `Storage operator output exceeded ${outputLimitBytes} bytes.`,
          ),
        );
        return;
      }
      chunks.push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));
    child.on("error", (error) => finish(error));
    child.on("close", (code, signal) => {
      if (settled) return;
      const output = Buffer.concat(stdout).toString("utf8").trim();
      const errorOutput = Buffer.concat(stderr).toString("utf8").trim();
      if (code !== 0) {
        finish(
          new ArtWorkspaceWriterError(
            "ART_WORKSPACE_STORAGE_OPERATOR_FAILED",
            `Storage operator exited with code ${String(code)}${
              signal ? ` (${signal})` : ""
            }: ${errorOutput.slice(0, 2000)}`,
          ),
        );
        return;
      }
      try {
        finish(undefined, output ? JSON.parse(output) : { ok: true });
      } catch {
        finish(undefined, { ok: true, stdout: output, stderr: errorOutput });
      }
    });
    const timer = setTimeout(() => {
      child.kill();
      finish(
        new ArtWorkspaceWriterError(
          "ART_WORKSPACE_STORAGE_TIMEOUT",
          `Storage operator exceeded ${timeoutMs}ms.`,
        ),
      );
    }, timeoutMs);
  });
}

export async function archiveArtWorkspaceFileToStorage(
  requestValue: unknown,
  policy: ArtWorkspaceWriterPolicy,
): Promise<ArtWorkspaceStorageArchiveReceipt> {
  if (policy.allowWrites !== true || policy.allowStorageWrites !== true) {
    fail(
      "ART_WORKSPACE_STORAGE_WRITES_DISABLED",
      "Storage handoff requires both EVAVO_ART_ALLOW_WRITES=true and EVAVO_ART_ALLOW_STORAGE_WRITES=true.",
    );
  }
  const command = policy.storageOperatorCommand;
  if (!command?.length) {
    fail(
      "ART_WORKSPACE_STORAGE_OPERATOR_UNCONFIGURED",
      "EVAVO_STORAGE_OPERATOR_COMMAND_JSON is not configured.",
    );
  }
  const request = parseStorageRequest(requestValue);
  const workspaceRoot = await resolveWorkspaceRoot(request.workspaceRoot, policy);
  const sourcePath = assertUserSourcePath(request.source);
  const source = await existingFile(
    workspaceRoot,
    sourcePath,
    validatedLimit(
      policy.maximumFileBytes,
      DEFAULT_MAXIMUM_FILE_BYTES,
      "maximumFileBytes",
    ),
  );
  const idempotencyKeySha256 = sha256Bytes(request.idempotencyKey);
  const requestFingerprint = sha256Bytes(
    canonicalJson({
      source: source.relativePath,
      sourceSha256: source.sha256,
      sourceSizeBytes: source.sizeBytes,
      vault: request.vault,
      logicalPath: request.logicalPath,
      title: request.title,
      idempotencyKeySha256,
      mode: request.mode,
    }),
  );
  const archiveId = `storage_${requestFingerprint.slice(0, 24)}`;
  const receiptRelative = `.art-studio/receipts/storage/${archiveId}.json`;
  const receiptAbsolute = absoluteFromRelative(workspaceRoot, receiptRelative);
  const existingReceipt = await readFile(receiptAbsolute, "utf8").catch(() => undefined);
  if (existingReceipt !== undefined) {
    const parsed = JSON.parse(existingReceipt) as ArtWorkspaceStorageArchiveReceipt;
    if (
      parsed.schema !== ART_WORKSPACE_STORAGE_RECEIPT_VERSION ||
      parsed.requestFingerprint !== requestFingerprint
    ) {
      fail(
        "ART_WORKSPACE_STORAGE_IDEMPOTENCY_CONFLICT",
        "Existing storage receipt does not match this request.",
      );
    }
    return parsed;
  }
  const mode = request.mode ?? "put";
  const args: string[] = [
    mode,
    source.absolutePath,
    "--vault",
    request.vault,
    "--path",
    request.logicalPath,
    "--title",
    request.title,
    "--idempotency-key",
    request.idempotencyKey,
  ];
  const operatorResult = redactSecrets(
    await runBoundedProcess(
      command,
      args,
      validatedLimit(
        policy.storageTimeoutMs,
        DEFAULT_STORAGE_TIMEOUT_MS,
        "storageTimeoutMs",
      ),
      validatedLimit(
        policy.processOutputLimitBytes,
        DEFAULT_PROCESS_OUTPUT_BYTES,
        "processOutputLimitBytes",
      ),
    ),
  );
  const currentSource = await existingFile(workspaceRoot, sourcePath);
  if (
    currentSource.sha256 !== source.sha256 ||
    currentSource.sizeBytes !== source.sizeBytes
  ) {
    fail(
      "ART_WORKSPACE_STORAGE_SOURCE_DRIFTED",
      "Source changed while the storage handoff was running.",
    );
  }
  const receipt: ArtWorkspaceStorageArchiveReceipt = {
    schema: ART_WORKSPACE_STORAGE_RECEIPT_VERSION,
    archiveId,
    idempotencyKeySha256,
    requestFingerprint,
    source: source.relativePath,
    sourceSha256: source.sha256,
    sourceSizeBytes: source.sizeBytes,
    vault: request.vault,
    logicalPath: request.logicalPath,
    mode,
    operatorResult,
    completedAt: new Date().toISOString(),
    providerCredentialExposed: false,
    repositoryMutationPerformed: false,
    publicationAuthority: false,
  };
  await ensureSafeParent(workspaceRoot, receiptAbsolute);
  await writeJsonCreateOnly(receiptAbsolute, receipt);
  return receipt;
}
