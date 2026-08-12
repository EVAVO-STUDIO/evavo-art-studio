#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LAYERED_GODOT_HANDOFF_GATE_PROTOCOL_VERSION,
  LAYERED_GODOT_HANDOFF_GATE_RECEIPT_KIND,
  gateLayeredGodotHandoff,
} from "./layered-godot-handoff-gate.mjs";
import {
  LayeredGodotWorkspaceWriterError,
  canonicalSha256,
} from "./layered-godot-workspace-writer.mjs";
import {
  LAYERED_GODOT_WORKSPACE_AUDIT_RECEIPT_KIND,
  LAYERED_GODOT_WORKSPACE_AUDITOR_PROTOCOL_VERSION,
} from "./layered-godot-workspace-auditor.mjs";
import {
  LAYERED_GODOT_RUNTIME_VALIDATION_RECEIPT_KIND,
  LAYERED_GODOT_RUNTIME_VALIDATOR_PROTOCOL_VERSION,
} from "./layered-godot-runtime-validator.mjs";

const REPOSITORY = "EVAVO-STUDIO/GodotGameFoundationKit";
const SCENE = "game/scenes/world/layered_district.tscn";
const hash = (value) => createHash("sha256").update(value).digest("hex");

function plan() {
  const content =
    '[gd_scene load_steps=1 format=3]\n[node name="LayeredDistrict" type="Node2D"]\n';
  return {
    scene: {
      path: SCENE,
      tscnDraft: content,
    },
    resources: Array.from({ length: 7 }, (_, index) => ({
      path: index ? `game/assets/final/r${index}.json` : SCENE,
      content: index ? "{}\n" : content,
    })),
  };
}

function auditAuthority() {
  return {
    fileWritePerformed: false,
    targetRepositoryMutationPerformed: false,
    godotExecutionPerformed: false,
    runtimeActivationPerformed: false,
    gitCommitCreated: false,
    gitPushPerformed: false,
    deploymentPerformed: false,
    publicationPerformed: false,
    forcePushPerformed: false,
  };
}

function audit(
  workspace,
  offset = 0,
  auditedAt = "2026-08-12T10:00:00.000Z",
) {
  const payload = {
    schemaVersion: "1.0",
    kind: LAYERED_GODOT_WORKSPACE_AUDIT_RECEIPT_KIND,
    protocolVersion: LAYERED_GODOT_WORKSPACE_AUDITOR_PROTOCOL_VERSION,
    requestSha256: "a".repeat(64),
    integrationSha256: "b".repeat(64),
    writeReceiptSha256: "c".repeat(64),
    target: {
      expectedRepository: REPOSITORY,
      workspaceRoot: workspace,
    },
    files: Array.from({ length: 7 }, (_, index) => ({
      path: index ? `game/assets/final/r${index}.json` : SCENE,
      sha256: hash(String(index)),
      bytes: index + 1,
      filesystemIdentity: {
        dev: "1",
        ino: String(index + offset),
        size: String(index + 1),
        mtimeNs: "1",
      },
    })),
    totals: {
      resources: 7,
      bytes: 28,
      residueFiles: 0,
    },
    auditedAt,
    authority: auditAuthority(),
  };
  return {
    ...payload,
    auditSha256: canonicalSha256(payload),
  };
}

function runtime(workspace, inputAudit, overrides = {}) {
  const payload = {
    schemaVersion: "1.0",
    kind: LAYERED_GODOT_RUNTIME_VALIDATION_RECEIPT_KIND,
    protocolVersion: LAYERED_GODOT_RUNTIME_VALIDATOR_PROTOCOL_VERSION,
    requestSha256: "a".repeat(64),
    integrationSha256: "b".repeat(64),
    writeReceiptSha256: "c".repeat(64),
    inputAuditSha256: inputAudit.auditSha256,
    preExecutionAuditSha256: "d".repeat(64),
    postExecutionAuditSha256: "e".repeat(64),
    target: {
      expectedRepository: REPOSITORY,
      workspaceRoot: workspace,
    },
    engine: {
      requiredVersion: "4.6.2",
      reportedVersion: "4.6.2.stable.official.test",
      executablePath: path.resolve("/fake/godot"),
      executableSha256: "f".repeat(64),
      executableBytes: 1234,
      filesystemIdentity: {
        dev: "9",
        ino: "9",
        size: "1234",
        mtimeNs: "9",
      },
    },
    sandbox: {
      strategy: "ephemeral-exact-resource-copy",
      exactIntegrationResources: 7,
      scenePath: SCENE,
      targetWorkspaceMounted: false,
      removedAfterValidation: true,
    },
    execution: {
      headless: true,
      sceneInstantiationPerformed: true,
      sceneTreeActivationPerformed: false,
      exitCode: 0,
      stdoutSha256: "1".repeat(64),
      stdoutBytes: 20,
      stderrSha256: "2".repeat(64),
      stderrBytes: 0,
      evidence: {
        event: "evavo_layered_godot_runtime_validated",
        scene: `res://${SCENE}`,
        rootName: "LayeredDistrict",
        rootType: "Node2D",
      },
    },
    validatedAt: "2026-08-12T10:01:00.000Z",
    authority: {
      godotExecutionPerformed: true,
      sandboxFileWritePerformed: true,
      targetRepositoryReadPerformed: true,
      targetRepositoryMutationPerformed: false,
      targetRuntimeActivationPerformed: false,
      gitCommitCreated: false,
      gitPushPerformed: false,
      deploymentPerformed: false,
      publicationPerformed: false,
      forcePushPerformed: false,
    },
    ...overrides,
  };
  return {
    ...payload,
    validationSha256: canonicalSha256(payload),
  };
}

function current(value, auditedAt = "2026-08-12T10:02:00.000Z") {
  const output = structuredClone(value);
  output.auditedAt = auditedAt;
  delete output.auditSha256;
  output.auditSha256 = canonicalSha256(output);
  return output;
}

function rehash(value, hashKey, mutate) {
  const output = structuredClone(value);
  delete output[hashKey];
  mutate(output);
  output[hashKey] = canonicalSha256(output);
  return output;
}

async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-handoff-gate-"));
  const workspace = path.join(root, "workspace");
  await mkdir(workspace);
  const integrationPlan = plan();
  for (const resource of integrationPlan.resources) {
    const file = path.join(workspace, ...resource.path.split("/"));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, resource.content);
  }

  const auditReceipt = audit(workspace);
  const runtimeValidationReceipt = runtime(workspace, auditReceipt);
  const writeReceipt = {
    receiptSha256: "c".repeat(64),
  };

  try {
    await run({
      workspace,
      integrationPlan,
      auditReceipt,
      runtimeValidationReceipt,
      writeReceipt,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function code(error, expected) {
  assert.ok(
    error instanceof LayeredGodotWorkspaceWriterError,
    String(error),
  );
  assert.equal(error.code, expected);
  return true;
}

function input(value, runtimeValidationReceipt = value.runtimeValidationReceipt) {
  return {
    integrationPlan: value.integrationPlan,
    writeReceipt: value.writeReceipt,
    auditReceipt: value.auditReceipt,
    runtimeValidationReceipt,
    workspaceRoot: value.workspace,
    expectedRepository: REPOSITORY,
  };
}

const gate = (value, runtimeValidationReceipt, auditReceipt = value.auditReceipt) =>
  gateLayeredGodotHandoff(
    {
      ...input(value, runtimeValidationReceipt),
      auditReceipt,
    },
    {
      auditWorkspace: async () => current(value.auditReceipt),
    },
  );

test(
  "review-ready output records immutable two-phase admission and remains Git-false",
  async () =>
    fixture(async (value) => {
      const output = await gate(value, value.runtimeValidationReceipt);
      assert.equal(output.kind, LAYERED_GODOT_HANDOFF_GATE_RECEIPT_KIND);
      assert.equal(
        output.protocolVersion,
        LAYERED_GODOT_HANDOFF_GATE_PROTOCOL_VERSION,
      );
      assert.equal(output.readiness.repositoryReviewReady, true);
      assert.equal(output.readiness.gitCommitAuthorized, false);
      assert.equal(output.readiness.gitPushAuthorized, false);
      assert.deepEqual(output.admission, {
        immutableInputSnapshot: true,
        exactAuditReceiptContract: true,
        exactRuntimeReceiptContract: true,
        unsupportedReceiptFieldsRejected: true,
        targetStableAcrossGate: true,
      });
      assert.match(output.admissionAuditSha256, /^[0-9a-f]{64}$/u);
      const { gateSha256, ...payload } = output;
      assert.equal(gateSha256, canonicalSha256(payload));
    }),
);

test(
  "known rehashed authority escalation is rejected",
  async () =>
    fixture(async (value) => {
      const bad = rehash(
        value.runtimeValidationReceipt,
        "validationSha256",
        (receipt) => {
          receipt.authority.gitCommitCreated = true;
        },
      );
      await assert.rejects(
        gate(value, bad),
        (error) =>
          code(error, "LAYERED_GODOT_HANDOFF_RUNTIME_RECEIPT_INVALID"),
      );
    }),
);

test(
  "unsupported rehashed runtime fields are rejected at every nested boundary",
  async () =>
    fixture(async (value) => {
      const attacks = [
        (receipt) => {
          receipt.gitPushAuthorized = true;
        },
        (receipt) => {
          receipt.authority.repositoryWriteAuthorized = true;
        },
        (receipt) => {
          receipt.engine.untrustedExecutableAccepted = true;
        },
        (receipt) => {
          receipt.target.repositoryMutationAuthorized = true;
        },
        (receipt) => {
          receipt.execution.evidence.publicationReady = true;
        },
      ];

      for (const mutate of attacks) {
        const bad = rehash(
          value.runtimeValidationReceipt,
          "validationSha256",
          mutate,
        );
        await assert.rejects(
          gate(value, bad),
          (error) =>
            code(error, "LAYERED_GODOT_HANDOFF_RUNTIME_RECEIPT_INVALID"),
        );
      }
    }),
);

test(
  "missing exact runtime evidence is rejected after a correct rehash",
  async () =>
    fixture(async (value) => {
      const bad = rehash(
        value.runtimeValidationReceipt,
        "validationSha256",
        (receipt) => {
          delete receipt.sandbox.removedAfterValidation;
        },
      );
      await assert.rejects(
        gate(value, bad),
        (error) =>
          code(error, "LAYERED_GODOT_HANDOFF_RUNTIME_RECEIPT_INVALID"),
      );
    }),
);

test(
  "unsupported rehashed audit authority is rejected before drift comparison",
  async () =>
    fixture(async (value) => {
      const bad = rehash(
        value.auditReceipt,
        "auditSha256",
        (receipt) => {
          receipt.authority.repositoryWriteAuthorized = true;
        },
      );
      await assert.rejects(
        gate(value, value.runtimeValidationReceipt, bad),
        (error) => code(error, "LAYERED_GODOT_HANDOFF_AUDIT_INVALID"),
      );
    }),
);

test(
  "post-call mutation cannot change the snapshotted handoff identity",
  async () =>
    fixture(async (value) => {
      let audits = 0;
      const request = input(value);
      const output = await gateLayeredGodotHandoff(request, {
        auditWorkspace: async () => {
          audits += 1;
          value.runtimeValidationReceipt.authority.gitCommitCreated = true;
          value.integrationPlan.scene.path = "game/scenes/world/changed.tscn";
          return current(value.auditReceipt);
        },
      });

      assert.equal(audits, 2);
      assert.equal(output.readiness.repositoryReviewReady, true);
      assert.equal(
        value.runtimeValidationReceipt.authority.gitCommitCreated,
        true,
      );
      assert.equal(
        value.integrationPlan.scene.path,
        "game/scenes/world/changed.tscn",
      );
    }),
);

test(
  "accessors and revoked proxies fail closed before the first audit",
  async () =>
    fixture(async (value) => {
      let getterCalls = 0;
      let auditCalls = 0;
      const hostile = structuredClone(value.runtimeValidationReceipt);
      Object.defineProperty(hostile.authority, "gitCommitCreated", {
        enumerable: true,
        configurable: true,
        get() {
          getterCalls += 1;
          return false;
        },
      });

      await assert.rejects(
        gateLayeredGodotHandoff(
          input(value, hostile),
          {
            auditWorkspace: async () => {
              auditCalls += 1;
              return current(value.auditReceipt);
            },
          },
        ),
        (error) => code(error, "LAYERED_GODOT_HANDOFF_INPUT_INVALID"),
      );
      assert.equal(getterCalls, 0);
      assert.equal(auditCalls, 0);

      const revoked = Proxy.revocable(
        structuredClone(value.runtimeValidationReceipt),
        {},
      );
      revoked.revoke();
      await assert.rejects(
        gateLayeredGodotHandoff(
          input(value, revoked.proxy),
          {
            auditWorkspace: async () => {
              auditCalls += 1;
              return current(value.auditReceipt);
            },
          },
        ),
        (error) => code(error, "LAYERED_GODOT_HANDOFF_INPUT_INVALID"),
      );
      assert.equal(auditCalls, 0);
    }),
);

test(
  "unsupported top-level handoff fields fail before repository inspection",
  async () =>
    fixture(async (value) => {
      let auditCalls = 0;
      await assert.rejects(
        gateLayeredGodotHandoff(
          {
            ...input(value),
            gitPushAuthorized: true,
          },
          {
            auditWorkspace: async () => {
              auditCalls += 1;
              return current(value.auditReceipt);
            },
          },
        ),
        (error) => code(error, "LAYERED_GODOT_HANDOFF_INPUT_INVALID"),
      );
      assert.equal(auditCalls, 0);
    }),
);

test(
  "post-runtime target drift is rejected",
  async () =>
    fixture(async (value) => {
      await assert.rejects(
        gateLayeredGodotHandoff(
          input(value),
          {
            auditWorkspace: async () =>
              audit(
                value.workspace,
                9,
                "2026-08-12T10:02:00.000Z",
              ),
          },
        ),
        (error) => code(error, "LAYERED_GODOT_HANDOFF_TARGET_DRIFT"),
      );
    }),
);

test(
  "drift during receipt admission is caught by the final fresh audit",
  async () =>
    fixture(async (value) => {
      let calls = 0;
      await assert.rejects(
        gateLayeredGodotHandoff(
          input(value),
          {
            auditWorkspace: async () =>
              ++calls === 1
                ? current(value.auditReceipt)
                : audit(
                    value.workspace,
                    9,
                    "2026-08-12T10:03:00.000Z",
                  ),
          },
        ),
        (error) => code(error, "LAYERED_GODOT_HANDOFF_TARGET_DRIFT"),
      );
      assert.equal(calls, 2);
    }),
);

test(
  "malformed self-hash and repository mismatch are rejected",
  async () =>
    fixture(async (value) => {
      const tampered = structuredClone(value.runtimeValidationReceipt);
      tampered.execution.exitCode = 9;
      await assert.rejects(
        gate(value, tampered),
        (error) =>
          code(error, "LAYERED_GODOT_HANDOFF_RUNTIME_RECEIPT_INVALID"),
      );

      const wrong = runtime(
        value.workspace,
        value.auditReceipt,
        {
          target: {
            expectedRepository: "EVAVO-STUDIO/other",
            workspaceRoot: value.workspace,
          },
        },
      );
      await assert.rejects(
        gate(value, wrong),
        (error) =>
          code(error, "LAYERED_GODOT_HANDOFF_RUNTIME_RECEIPT_INVALID"),
      );
    }),
);

test(
  "outstanding transaction blocks promotion",
  async () =>
    fixture(async (value) => {
      await mkdir(
        path.join(
          value.workspace,
          ".evavo-godot-transactions",
          `${"1".repeat(32)}.active`,
        ),
        { recursive: true },
      );
      await assert.rejects(
        gate(value, value.runtimeValidationReceipt),
        (error) =>
          code(error, "LAYERED_GODOT_WRITE_RECOVERY_REQUIRED"),
      );
    }),
);
