#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LayeredGodotWorkspaceWriterError,
  canonicalSha256,
  repositoryName,
} from "./layered-godot-workspace-writer.mjs";
import { auditLayeredGodotWorkspace } from "./layered-godot-workspace-auditor.mjs";
import {
  inspectWorkspaceRoot,
  readStableRegularFile,
} from "./layered-godot-workspace-writer/filesystem.mjs";
import { assertNoOutstandingTransactions } from "./layered-godot-workspace-writer/journal.mjs";
import {
  MAXIMUM_INPUT_BYTES,
  exactObject,
  gateFail,
  snapshotJsonValue,
} from "./layered-godot-workspace-writer/handoff-gate/common.mjs";
import { assertCurrentAudit } from "./layered-godot-workspace-writer/handoff-gate/audit-contract.mjs";
import { validateRuntimeReceipt } from "./layered-godot-workspace-writer/handoff-gate/runtime-contract.mjs";

export const LAYERED_GODOT_HANDOFF_GATE_PROTOCOL_VERSION = "2026-08-13.1";
export const LAYERED_GODOT_HANDOFF_GATE_RECEIPT_KIND =
  "evavo.layered-production.godot-handoff-gate-receipt";

const HANDOFF_INPUT_KEYS = [
  "integrationPlan",
  "writeReceipt",
  "auditReceipt",
  "runtimeValidationReceipt",
  "workspaceRoot",
  "expectedRepository",
];

export async function gateLayeredGodotHandoff(input, dependencies = {}) {
  const request = exactObject(
    snapshotJsonValue(input, "handoffInput"),
    HANDOFF_INPUT_KEYS,
    "handoffInput",
    "INPUT_INVALID",
  );
  if (typeof request.workspaceRoot !== "string") {
    gateFail("INPUT_INVALID", "handoffInput.workspaceRoot must be a string.");
  }

  const auditWorkspace =
    dependencies.auditWorkspace ?? auditLayeredGodotWorkspace;
  if (typeof auditWorkspace !== "function") {
    gateFail("INPUT_INVALID", "dependencies.auditWorkspace must be a function.");
  }

  const selectedRepository = repositoryName(
    request.expectedRepository,
    "expectedRepository",
  );
  const root = await inspectWorkspaceRoot(path.resolve(request.workspaceRoot));

  await assertNoOutstandingTransactions(root);
  const admissionAudit = await auditWorkspace({
    integrationPlan: request.integrationPlan,
    writeReceipt: request.writeReceipt,
    workspaceRoot: root.path,
    expectedRepository: selectedRepository,
  });
  const admittedAudit = assertCurrentAudit(
    request.auditReceipt,
    admissionAudit,
    "admissionAudit",
  );
  const runtimeReceipt = validateRuntimeReceipt(
    request.runtimeValidationReceipt,
    {
      currentAudit: admittedAudit,
      auditReceipt: request.auditReceipt,
      repository: selectedRepository,
      root,
      integrationPlan: request.integrationPlan,
    },
  );

  await assertNoOutstandingTransactions(root);
  const finalAudit = await auditWorkspace({
    integrationPlan: request.integrationPlan,
    writeReceipt: request.writeReceipt,
    workspaceRoot: root.path,
    expectedRepository: selectedRepository,
  });
  const admittedFinalAudit = assertCurrentAudit(
    admissionAudit,
    finalAudit,
    "finalAudit",
  );
  assertCurrentAudit(
    request.auditReceipt,
    admittedFinalAudit,
    "finalAudit",
  );
  await assertNoOutstandingTransactions(root);

  const payload = {
    schemaVersion: "1.0",
    kind: LAYERED_GODOT_HANDOFF_GATE_RECEIPT_KIND,
    protocolVersion: LAYERED_GODOT_HANDOFF_GATE_PROTOCOL_VERSION,
    requestSha256: admittedFinalAudit.requestSha256,
    integrationSha256: admittedFinalAudit.integrationSha256,
    writeReceiptSha256: admittedFinalAudit.writeReceiptSha256,
    auditReceiptSha256: request.auditReceipt.auditSha256,
    runtimeValidationSha256: runtimeReceipt.validationSha256,
    admissionAuditSha256: admittedAudit.auditSha256,
    currentAuditSha256: admittedFinalAudit.auditSha256,
    target: {
      expectedRepository: selectedRepository,
      workspaceRoot: root.realPath,
    },
    admission: {
      immutableInputSnapshot: true,
      exactAuditReceiptContract: true,
      exactRuntimeReceiptContract: true,
      unsupportedReceiptFieldsRejected: true,
      targetStableAcrossGate: true,
    },
    readiness: {
      repositoryReviewReady: true,
      gitCommitAuthorized: false,
      gitPushAuthorized: false,
      requiresExplicitRepositoryReview: true,
      requiresExplicitGitOperator: true,
    },
    gatedAt: new Date().toISOString(),
    authority: {
      targetRepositoryReadPerformed: true,
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
  return Object.freeze({ ...payload, gateSha256: canonicalSha256(payload) });
}

async function readJson(filePath, label) {
  const inspected = await readStableRegularFile(path.resolve(filePath), label);
  if (inspected.bytes > MAXIMUM_INPUT_BYTES) {
    gateFail("INPUT_INVALID", `${label} exceeds the bounded byte limit.`);
  }
  try {
    return JSON.parse(inspected.data.toString("utf8"));
  } catch {
    gateFail("INPUT_INVALID", `${label} is not valid UTF-8 JSON.`);
  }
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  if (command !== "gate") {
    gateFail(
      "CLI_INVALID",
      "Usage: layered-godot-handoff-gate.mjs gate --plan FILE --receipt FILE --audit-receipt FILE --runtime-receipt FILE --workspace DIR --repository OWNER/REPO",
    );
  }
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) {
      gateFail("CLI_INVALID", `Invalid CLI argument near ${String(flag)}.`);
    }
    if (values.has(flag)) {
      gateFail("CLI_INVALID", `Duplicate CLI argument ${flag}.`);
    }
    values.set(flag, value);
  }
  const allowed = [
    "--plan",
    "--receipt",
    "--audit-receipt",
    "--runtime-receipt",
    "--workspace",
    "--repository",
  ];
  for (const key of allowed) {
    if (!values.has(key)) {
      gateFail("CLI_INVALID", `Missing required CLI argument ${key}.`);
    }
  }
  for (const key of values.keys()) {
    if (!allowed.includes(key)) {
      gateFail("CLI_INVALID", `Unknown CLI argument ${key}.`);
    }
  }
  return {
    planPath: values.get("--plan"),
    receiptPath: values.get("--receipt"),
    auditPath: values.get("--audit-receipt"),
    runtimePath: values.get("--runtime-receipt"),
    workspaceRoot: path.resolve(values.get("--workspace")),
    expectedRepository: values.get("--repository"),
  };
}

async function main() {
  try {
    const cli = parseCli(process.argv.slice(2));
    const [integrationPlan, writeReceipt, auditReceipt, runtimeValidationReceipt] =
      await Promise.all([
        readJson(cli.planPath, "integration plan"),
        readJson(cli.receiptPath, "write receipt"),
        readJson(cli.auditPath, "audit receipt"),
        readJson(cli.runtimePath, "runtime validation receipt"),
      ]);
    console.log(
      JSON.stringify(
        await gateLayeredGodotHandoff({
          integrationPlan,
          writeReceipt,
          auditReceipt,
          runtimeValidationReceipt,
          workspaceRoot: cli.workspaceRoot,
          expectedRepository: cli.expectedRepository,
        }),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          code:
            error instanceof LayeredGodotWorkspaceWriterError
              ? error.code
              : "LAYERED_GODOT_HANDOFF_FAILED",
          message: error instanceof Error ? error.message : String(error),
          ...(error instanceof LayeredGodotWorkspaceWriterError &&
          error.details !== undefined
            ? { details: error.details }
            : {}),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  await main();
}
