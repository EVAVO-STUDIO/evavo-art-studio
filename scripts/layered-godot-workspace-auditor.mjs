#!/usr/bin/env node

import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LAYERED_GODOT_WORKSPACE_WRITE_RECEIPT_KIND,
  LAYERED_GODOT_WORKSPACE_WRITE_REQUEST_KIND,
  LAYERED_GODOT_WORKSPACE_WRITER_PROTOCOL_VERSION,
  LayeredGodotWorkspaceWriterError,
  absoluteWorkspaceRoot,
  canonicalSha256,
  fail,
  identifier,
  literal,
  record,
  repositoryName,
  sha256Value,
  text,
  verifyLayeredGodotWorkspaceWriteRequest,
} from "./layered-godot-workspace-writer.mjs";
import {
  inspectWorkspaceRoot,
  readStableRegularFile,
  resolveWorkspaceTarget,
  revalidateWorkspaceRoot,
  sameFilesystemPath,
} from "./layered-godot-workspace-writer/filesystem.mjs";

export const LAYERED_GODOT_WORKSPACE_AUDITOR_PROTOCOL_VERSION = "2026-08-12.1";
export const LAYERED_GODOT_WORKSPACE_AUDIT_RECEIPT_KIND =
  "evavo.layered-production.godot-workspace-audit-receipt";
const MAXIMUM_RECEIPT_BYTES = 4 * 1024 * 1024;
const TRANSACTION_MARKERS = [".evavo-godot-stage-", ".evavo-godot-backup-"];
const ALLOWED_OUTCOMES = new Set(["created", "replaced", "unchanged"]);

function auditFail(code, message, details = undefined) {
  fail(`LAYERED_GODOT_AUDIT_${code}`, message, details);
}

async function readBoundedJson(filePath, label, maximumBytes) {
  const inspected = await readStableRegularFile(path.resolve(filePath), label);
  if (inspected.bytes > maximumBytes) {
    auditFail("INPUT_INVALID", `${label} exceeds the bounded byte limit.`);
  }
  try {
    return JSON.parse(inspected.data.toString("utf8"));
  } catch {
    auditFail("INPUT_INVALID", `${label} is not valid UTF-8 JSON.`);
  }
}

function validateWriteReceipt(receiptValue, verifiedRequest, root) {
  const receipt = record(receiptValue, "receipt");
  literal(receipt.schemaVersion, "1.0", "receipt.schemaVersion");
  literal(receipt.kind, LAYERED_GODOT_WORKSPACE_WRITE_RECEIPT_KIND, "receipt.kind");
  literal(
    receipt.protocolVersion,
    LAYERED_GODOT_WORKSPACE_WRITER_PROTOCOL_VERSION,
    "receipt.protocolVersion",
  );
  const receiptSha256 = sha256Value(receipt.receiptSha256, "receipt.receiptSha256");
  const { receiptSha256: _discarded, ...withoutHash } = receipt;
  if (canonicalSha256(withoutHash) !== receiptSha256) {
    auditFail("RECEIPT_INVALID", "Write receipt self-hash does not match its canonical payload.");
  }

  if (
    identifier(receipt.requestId, "receipt.requestId") !== verifiedRequest.requestId ||
    text(receipt.revision, "receipt.revision", 40) !== verifiedRequest.revision ||
    sha256Value(receipt.requestSha256, "receipt.requestSha256") !== verifiedRequest.requestSha256 ||
    sha256Value(receipt.integrationSha256, "receipt.integrationSha256") !==
      verifiedRequest.integration.integrationSha256
  ) {
    auditFail("RECEIPT_INVALID", "Write receipt is not bound to the exact reconstructed write request.");
  }

  const target = record(receipt.target, "receipt.target");
  if (
    repositoryName(target.expectedRepository, "receipt.target.expectedRepository") !==
      verifiedRequest.expectedRepository ||
    !sameFilesystemPath(absoluteWorkspaceRoot(target.workspaceRoot), root.realPath)
  ) {
    auditFail("RECEIPT_INVALID", "Write receipt target does not match the selected repository workspace.");
  }

  if (!Array.isArray(receipt.operations) || receipt.operations.length !== 7) {
    auditFail("RECEIPT_INVALID", "Write receipt must cover exactly seven resource operations.");
  }
  const resourceByPath = new Map(
    verifiedRequest.integration.resources.map((resource) => [resource.path, resource]),
  );
  const seenPaths = new Set();
  for (const [index, operationValue] of receipt.operations.entries()) {
    const operation = record(operationValue, `receipt.operations[${index}]`);
    const resource = resourceByPath.get(operation.path);
    if (
      operation.index !== index ||
      !resource ||
      seenPaths.has(operation.path) ||
      !ALLOWED_OUTCOMES.has(operation.outcome) ||
      operation.sha256 !== resource.sha256 ||
      operation.bytes !== resource.bytes
    ) {
      auditFail("RECEIPT_INVALID", `Write receipt operation ${index} drifted from the exact integration plan.`);
    }
    if (operation.outcome === "created") {
      if ("priorSha256" in operation || "priorBytes" in operation) {
        auditFail("RECEIPT_INVALID", `Created operation ${index} must not claim prior target bytes.`);
      }
    } else if (
      ("priorSha256" in operation) !== ("priorBytes" in operation) ||
      ("priorSha256" in operation &&
        (typeof operation.priorBytes !== "number" ||
          !Number.isSafeInteger(operation.priorBytes) ||
          operation.priorBytes < 0 ||
          typeof operation.priorSha256 !== "string" ||
          !/^[0-9a-f]{64}$/u.test(operation.priorSha256)))
    ) {
      auditFail("RECEIPT_INVALID", `Write receipt prior identity for operation ${index} is malformed.`);
    }
    seenPaths.add(operation.path);
  }

  const totals = record(receipt.totals, "receipt.totals");
  const counts = {
    created: receipt.operations.filter((entry) => entry.outcome === "created").length,
    replaced: receipt.operations.filter((entry) => entry.outcome === "replaced").length,
    unchanged: receipt.operations.filter((entry) => entry.outcome === "unchanged").length,
  };
  if (
    totals.resources !== 7 ||
    totals.created !== counts.created ||
    totals.replaced !== counts.replaced ||
    totals.unchanged !== counts.unchanged ||
    totals.bytes !== verifiedRequest.integration.totalBytes
  ) {
    auditFail("RECEIPT_INVALID", "Write receipt totals do not match its exact operations and integration bytes.");
  }
  if (
    "cleanupWarnings" in receipt &&
    (!Array.isArray(receipt.cleanupWarnings) || receipt.cleanupWarnings.length > 0)
  ) {
    auditFail("RESIDUE_PRESENT", "Write receipt retained cleanup warnings and is not cleanly auditable.");
  }

  const authority = record(receipt.authority, "receipt.authority");
  const mutated = receipt.operations.some((entry) => entry.outcome !== "unchanged");
  if (
    authority.exactFileWritePerformed !== mutated ||
    authority.targetRepositoryWorkingTreeMutationPerformed !== mutated ||
    [
      "godotExecutionPerformed",
      "runtimeActivationPerformed",
      "gitCommitCreated",
      "gitPushPerformed",
      "deploymentPerformed",
      "publicationPerformed",
      "forcePushPerformed",
    ].some((key) => authority[key] !== false)
  ) {
    auditFail("RECEIPT_INVALID", "Write receipt authority boundary has drifted.");
  }
  const appliedAt = text(receipt.appliedAt, "receipt.appliedAt", 64);
  const parsedAppliedAt = new Date(appliedAt);
  if (!Number.isFinite(parsedAppliedAt.getTime()) || parsedAppliedAt.toISOString() !== appliedAt) {
    auditFail("RECEIPT_INVALID", "Write receipt appliedAt must be canonical UTC ISO-8601.");
  }
  return Object.freeze({ receipt, receiptSha256 });
}

async function inspectExistingParent(root, relativePath) {
  await revalidateWorkspaceRoot(root);
  let current = root.path;
  for (const segment of relativePath.split("/").slice(0, -1)) {
    current = path.join(current, segment);
    let stats;
    try {
      stats = await lstat(current, { bigint: true });
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        auditFail("TARGET_MISSING", `Required parent directory ${current} is missing.`);
      }
      throw error;
    }
    if (stats.isSymbolicLink()) {
      auditFail("SYMLINK_REJECTED", `Required parent directory ${current} must not be symbolic.`);
    }
    if (!stats.isDirectory()) {
      auditFail("TARGET_INVALID", `Required parent path ${current} must be a directory.`);
    }
    const resolved = await realpath(current);
    if (!sameFilesystemPath(resolved, current)) {
      auditFail("SYMLINK_REJECTED", `Required parent directory ${current} resolves through a symbolic path.`);
    }
  }
  return current;
}

async function assertNoTransactionResidue(parents) {
  for (const directory of parents) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (TRANSACTION_MARKERS.some((marker) => entry.name.includes(marker))) {
        auditFail(
          "RESIDUE_PRESENT",
          `Transaction residue ${path.join(directory, entry.name)} remains after the recorded write.`,
        );
      }
    }
  }
}

export async function auditLayeredGodotWorkspace({
  integrationPlan,
  writeReceipt,
  workspaceRoot,
  expectedRepository,
}) {
  const selectedRoot = absoluteWorkspaceRoot(workspaceRoot);
  const selectedRepository = repositoryName(expectedRepository, "expectedRepository");
  const root = await inspectWorkspaceRoot(selectedRoot);
  const provisionalReceipt = record(writeReceipt, "receipt");
  const reconstructedRequest = {
    schemaVersion: "1.0",
    kind: LAYERED_GODOT_WORKSPACE_WRITE_REQUEST_KIND,
    requestId: provisionalReceipt.requestId,
    revision: provisionalReceipt.revision,
    expectedRepository: selectedRepository,
    workspaceRoot: selectedRoot,
    integrationPlan,
  };
  const verifiedRequest = verifyLayeredGodotWorkspaceWriteRequest(reconstructedRequest);
  const verifiedReceipt = validateWriteReceipt(writeReceipt, verifiedRequest, root);

  const auditedFiles = [];
  const parentDirectories = new Set();
  for (const resource of verifiedRequest.integration.resources) {
    await revalidateWorkspaceRoot(root);
    const parent = await inspectExistingParent(root, resource.path);
    parentDirectories.add(parent);
    const target = resolveWorkspaceTarget(root.path, resource.path);
    let inspected;
    try {
      inspected = await readStableRegularFile(target, `audited target ${resource.path}`);
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        auditFail("TARGET_MISSING", `Required target ${resource.path} is missing.`);
      }
      throw error;
    }
    if (
      inspected.sha256 !== resource.sha256 ||
      inspected.bytes !== resource.bytes ||
      !inspected.data.equals(resource.data)
    ) {
      auditFail("TARGET_DRIFT", `Target ${resource.path} does not match the approved integration bytes.`);
    }
    auditedFiles.push(
      Object.freeze({
        path: resource.path,
        sha256: inspected.sha256,
        bytes: inspected.bytes,
        filesystemIdentity: inspected.identity,
      }),
    );
  }
  await assertNoTransactionResidue([...parentDirectories].sort());

  const auditWithoutHash = {
    schemaVersion: "1.0",
    kind: LAYERED_GODOT_WORKSPACE_AUDIT_RECEIPT_KIND,
    protocolVersion: LAYERED_GODOT_WORKSPACE_AUDITOR_PROTOCOL_VERSION,
    requestSha256: verifiedRequest.requestSha256,
    integrationSha256: verifiedRequest.integration.integrationSha256,
    writeReceiptSha256: verifiedReceipt.receiptSha256,
    target: {
      expectedRepository: selectedRepository,
      workspaceRoot: root.realPath,
    },
    files: auditedFiles,
    totals: {
      resources: auditedFiles.length,
      bytes: auditedFiles.reduce((sum, entry) => sum + entry.bytes, 0),
      residueFiles: 0,
    },
    auditedAt: new Date().toISOString(),
    authority: {
      fileWritePerformed: false,
      targetRepositoryMutationPerformed: false,
      godotExecutionPerformed: false,
      runtimeActivationPerformed: false,
      gitCommitCreated: false,
      gitPushPerformed: false,
      deploymentPerformed: false,
      publicationPerformed: false,
      forcePushPerformed: false,
    },
  };
  return Object.freeze({
    ...auditWithoutHash,
    auditSha256: canonicalSha256(auditWithoutHash),
  });
}

function parseCliArguments(argv) {
  const [command, ...rest] = argv;
  if (command !== "audit") {
    auditFail(
      "CLI_INVALID",
      "Usage: layered-godot-workspace-auditor.mjs audit --plan FILE --receipt FILE --workspace DIR --repository OWNER/REPO",
    );
  }
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) {
      auditFail("CLI_INVALID", `Invalid CLI argument near ${String(flag)}.`);
    }
    if (values.has(flag)) auditFail("CLI_INVALID", `Duplicate CLI argument ${flag}.`);
    values.set(flag, value);
  }
  for (const required of ["--plan", "--receipt", "--workspace", "--repository"]) {
    if (!values.has(required)) auditFail("CLI_INVALID", `Missing required CLI argument ${required}.`);
  }
  for (const key of values.keys()) {
    if (!["--plan", "--receipt", "--workspace", "--repository"].includes(key)) {
      auditFail("CLI_INVALID", `Unknown CLI argument ${key}.`);
    }
  }
  return {
    planPath: values.get("--plan"),
    receiptPath: values.get("--receipt"),
    workspaceRoot: path.resolve(values.get("--workspace")),
    expectedRepository: values.get("--repository"),
  };
}

async function main() {
  try {
    const cli = parseCliArguments(process.argv.slice(2));
    const integrationPlan = await readBoundedJson(
      cli.planPath,
      "integration plan file",
      32 * 1024 * 1024,
    );
    const writeReceipt = await readBoundedJson(
      cli.receiptPath,
      "write receipt file",
      MAXIMUM_RECEIPT_BYTES,
    );
    console.log(
      JSON.stringify(
        await auditLayeredGodotWorkspace({
          integrationPlan,
          writeReceipt,
          workspaceRoot: cli.workspaceRoot,
          expectedRepository: cli.expectedRepository,
        }),
        null,
        2,
      ),
    );
  } catch (error) {
    const payload = {
      code:
        error instanceof LayeredGodotWorkspaceWriterError
          ? error.code
          : "LAYERED_GODOT_AUDIT_FAILED",
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof LayeredGodotWorkspaceWriterError && error.details !== undefined
        ? { details: error.details }
        : {}),
    };
    console.error(JSON.stringify(payload, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
