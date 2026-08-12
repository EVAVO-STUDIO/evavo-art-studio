#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LAYERED_GODOT_RUNTIME_VALIDATION_RECEIPT_KIND,
  REQUIRED_GODOT_VERSION,
  inspectGodotExecutable,
  runBoundedProcess,
  validateLayeredGodotRuntime,
} from "./layered-godot-runtime-validator.mjs";
import {
  LayeredGodotWorkspaceWriterError,
  canonicalSha256,
} from "./layered-godot-workspace-writer.mjs";
import {
  LAYERED_GODOT_WORKSPACE_AUDIT_RECEIPT_KIND,
  LAYERED_GODOT_WORKSPACE_AUDITOR_PROTOCOL_VERSION,
} from "./layered-godot-workspace-auditor.mjs";

const REPOSITORY = "EVAVO-STUDIO/GodotGameFoundationKit";
const SCENE_PATH = "game/scenes/world/layered_district.tscn";
const SIMPLE_SCENE = '[gd_scene load_steps=1 format=3]\n\n[node name="LayeredDistrict" type="Node2D"]\n';
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const resource = (kind, filePath, mediaType, content) => ({
  kind,
  path: filePath,
  mediaType,
  content,
  bytes: Buffer.byteLength(content, "utf8"),
  sha256: sha256(content),
});

function buildPlan(sceneText = SIMPLE_SCENE) {
  const resources = [
    resource("scene-draft", SCENE_PATH, "text/plain", sceneText),
    resource("route-graph", "game/assets/final/layered_district.route.json", "application/json", '{"kind":"route-graph"}\n'),
    resource("placements", "game/assets/final/layered_district.placements.json", "application/json", '{"kind":"placements"}\n'),
    resource("animations", "game/assets/final/layered_district.animations.json", "application/json", '{"kind":"animations"}\n'),
    resource("cameras", "game/assets/final/layered_district.cameras.json", "application/json", '{"kind":"cameras"}\n'),
    resource("import-policy", "game/assets/final/layered_district.import-policy.json", "application/json", '{"kind":"import-policy"}\n'),
    resource("integration-manifest", "game/assets/final/layered_district.integration.json", "application/json", '{"kind":"integration-manifest","version":"4.6.2"}\n'),
  ];
  return {
    schemaVersion: "1.0",
    kind: "evavo.layered-production.godot-integration-plan",
    protocolVersion: "2026-08-11.1",
    integrationSha256: "c".repeat(64),
    scene: { path: SCENE_PATH, tscnDraft: sceneText },
    resources,
  };
}

async function seedWorkspace(workspace, plan) {
  for (const entry of plan.resources) {
    const target = path.join(workspace, ...entry.path.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, entry.content, "utf8");
  }
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

function buildAudit(plan, workspace, suffix = "", auditedAt = "2026-08-12T09:00:00.000Z") {
  const files = plan.resources.map((entry, index) => ({
    path: entry.path,
    sha256: entry.sha256,
    bytes: entry.bytes,
    filesystemIdentity: { dev: "1", ino: `${index + 1}${suffix}`, size: String(entry.bytes), mtimeNs: "1" },
  }));
  const payload = {
    schemaVersion: "1.0",
    kind: LAYERED_GODOT_WORKSPACE_AUDIT_RECEIPT_KIND,
    protocolVersion: LAYERED_GODOT_WORKSPACE_AUDITOR_PROTOCOL_VERSION,
    requestSha256: "a".repeat(64),
    integrationSha256: "c".repeat(64),
    writeReceiptSha256: "b".repeat(64),
    target: { expectedRepository: REPOSITORY, workspaceRoot: workspace },
    files,
    totals: { resources: 7, bytes: files.reduce((sum, entry) => sum + entry.bytes, 0), residueFiles: 0 },
    auditedAt,
    authority: auditAuthority(),
  };
  return { ...payload, auditSha256: canonicalSha256(payload) };
}
function freshAudit(audit, time) {
  const copy = structuredClone(audit);
  copy.auditedAt = time;
  delete copy.auditSha256;
  copy.auditSha256 = canonicalSha256(copy);
  return copy;
}
function result(exitCode = 0, stdout = "", stderr = "") {
  return {
    exitCode,
    signal: null,
    stdout,
    stderr,
    stdoutBytes: Buffer.byteLength(stdout),
    stderrBytes: Buffer.byteLength(stderr),
  };
}
function assertCode(error, code) {
  assert.ok(error instanceof LayeredGodotWorkspaceWriterError, String(error));
  assert.equal(error.code, code);
  return true;
}

async function fixture(run, sceneText = SIMPLE_SCENE) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-layered-runtime-test-"));
  const workspace = path.join(root, "workspace");
  await mkdir(workspace);
  const plan = buildPlan(sceneText);
  await seedWorkspace(workspace, plan);
  const audit = buildAudit(plan, workspace);
  try {
    await run({ root, workspace, plan, audit, writeReceipt: { receiptSha256: "b".repeat(64) } });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function dependencies({ audit, workspace, version = "4.6.2.stable.official.test", runtimeExit = 0, evidence = true, drift = false }) {
  let auditCalls = 0;
  let processCalls = 0;
  let sandboxPath;
  return {
    state: () => ({ auditCalls, processCalls, sandboxPath }),
    auditWorkspace: async () => {
      auditCalls += 1;
      if (drift && auditCalls === 2) return buildAudit(buildPlan(), workspace, "9", "2026-08-12T09:00:02.000Z");
      return freshAudit(audit, `2026-08-12T09:00:0${auditCalls}.000Z`);
    },
    inspectExecutable: async () => ({
      path: path.resolve("/fake/godot"),
      sha256: "d".repeat(64),
      bytes: 1234,
      filesystemIdentity: { dev: "9", ino: "9", size: "1234", mtimeNs: "9" },
    }),
    executeProcess: async (_exe, args, options) => {
      processCalls += 1;
      if (args.length === 1 && args[0] === "--version") return result(0, `${version}\n`);
      assert.ok(args.includes("--headless"));
      sandboxPath = args[args.indexOf("--path") + 1];
      assert.notEqual(sandboxPath, workspace);
      assert.equal(options.cwd, sandboxPath);
      await access(path.join(sandboxPath, ...SCENE_PATH.split("/")));
      const scene = args.at(-1);
      const stdout = evidence
        ? `${JSON.stringify({ event: "evavo_layered_godot_runtime_validated", scene, rootName: "LayeredDistrict", rootType: "Node2D" })}\n`
        : "Godot Engine\n";
      return result(runtimeExit, stdout, runtimeExit ? "engine failed\n" : "");
    },
  };
}

const request = ({ plan, writeReceipt, audit, workspace }) => ({
  integrationPlan: plan,
  writeReceipt,
  auditReceipt: audit,
  workspaceRoot: workspace,
  expectedRepository: REPOSITORY,
  godotExecutable: "/fake/godot",
  timeoutMs: 1000,
});

test("validates exact 4.6.2 in an ephemeral sandbox and does not alter target bytes", async () => {
  await fixture(async ({ workspace, plan, audit, writeReceipt }) => {
    const before = await Promise.all(plan.resources.map((entry) => readFile(path.join(workspace, ...entry.path.split("/")))));
    const deps = dependencies({ audit, workspace });
    const receipt = await validateLayeredGodotRuntime(request({ plan, writeReceipt, audit, workspace }), deps);
    assert.equal(receipt.kind, LAYERED_GODOT_RUNTIME_VALIDATION_RECEIPT_KIND);
    assert.equal(receipt.engine.requiredVersion, REQUIRED_GODOT_VERSION);
    assert.equal(receipt.execution.sceneInstantiationPerformed, true);
    assert.equal(receipt.execution.sceneTreeActivationPerformed, false);
    assert.equal(receipt.authority.targetRepositoryMutationPerformed, false);
    const { validationSha256, ...payload } = receipt;
    assert.equal(validationSha256, canonicalSha256(payload));
    assert.deepEqual(await Promise.all(plan.resources.map((entry) => readFile(path.join(workspace, ...entry.path.split("/"))))), before);
    await assert.rejects(access(deps.state().sandboxPath), (error) => error.code === "ENOENT");
  });
});

test("stale audit and outstanding durable transaction both block engine execution", async () => {
  await fixture(async ({ workspace, plan, audit, writeReceipt }) => {
    const deps = dependencies({ audit, workspace });
    await assert.rejects(
      validateLayeredGodotRuntime(request({ plan, writeReceipt, audit: buildAudit(plan, workspace, "9"), workspace }), deps),
      (error) => assertCode(error, "LAYERED_GODOT_RUNTIME_AUDIT_STALE"),
    );
    assert.equal(deps.state().processCalls, 0);
    await mkdir(path.join(workspace, ".evavo-godot-transactions", `${"1".repeat(32)}.active`), { recursive: true });
    await assert.rejects(
      validateLayeredGodotRuntime(request({ plan, writeReceipt, audit, workspace }), dependencies({ audit, workspace })),
      (error) => assertCode(error, "LAYERED_GODOT_WRITE_RECOVERY_REQUIRED"),
    );
  });
});

test("rejects version drift and unsafe external/script scene surfaces", async () => {
  await fixture(async ({ workspace, plan, audit, writeReceipt }) => {
    const deps = dependencies({ audit, workspace, version: "4.6.3.stable.official.test" });
    await assert.rejects(
      validateLayeredGodotRuntime(request({ plan, writeReceipt, audit, workspace }), deps),
      (error) => assertCode(error, "LAYERED_GODOT_RUNTIME_VERSION_MISMATCH"),
    );
    assert.equal(deps.state().auditCalls, 2);
  });
  const unsafe = '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://evil.gd" id="1"]\n[node name="Unsafe" type="Node2D"]\nscript = ExtResource("1")\n';
  await fixture(async ({ workspace, plan, audit, writeReceipt }) => {
    const deps = dependencies({ audit, workspace });
    await assert.rejects(
      validateLayeredGodotRuntime(request({ plan, writeReceipt, audit, workspace }), deps),
      (error) => assertCode(error, "LAYERED_GODOT_RUNTIME_SCENE_UNSAFE"),
    );
    assert.equal(deps.state().processCalls, 0);
  }, unsafe);
});

test("engine failure and missing evidence fail closed after the post-execution audit", async () => {
  await fixture(async ({ workspace, plan, audit, writeReceipt }) => {
    const failed = dependencies({ audit, workspace, runtimeExit: 7 });
    await assert.rejects(
      validateLayeredGodotRuntime(request({ plan, writeReceipt, audit, workspace }), failed),
      (error) => assertCode(error, "LAYERED_GODOT_RUNTIME_ENGINE_FAILED"),
    );
    assert.equal(failed.state().auditCalls, 2);
    await assert.rejects(access(failed.state().sandboxPath), (error) => error.code === "ENOENT");
    const noEvidence = dependencies({ audit, workspace, evidence: false });
    await assert.rejects(
      validateLayeredGodotRuntime(request({ plan, writeReceipt, audit, workspace }), noEvidence),
      (error) => assertCode(error, "LAYERED_GODOT_RUNTIME_EVIDENCE_MISSING"),
    );
    assert.equal(noEvidence.state().auditCalls, 2);
  });
});

test("target drift outranks engine failure", async () => {
  await fixture(async ({ workspace, plan, audit, writeReceipt }) => {
    const deps = dependencies({ audit, workspace, runtimeExit: 9, drift: true });
    await assert.rejects(
      validateLayeredGodotRuntime(request({ plan, writeReceipt, audit, workspace }), deps),
      (error) => assertCode(error, "LAYERED_GODOT_RUNTIME_TARGET_DRIFT"),
    );
  });
});

test("binds an explicit executable and bounds child output and runtime", async () => {
  const inspected = await inspectGodotExecutable(process.execPath);
  assert.match(inspected.sha256, /^[0-9a-f]{64}$/u);
  assert.ok(inspected.bytes > 0);
  const normal = await runBoundedProcess(process.execPath, ["-e", "process.stdout.write('ok')"], {
    timeoutMs: 2000,
    maximumOutputBytes: 1024,
  });
  assert.equal(normal.stdout, "ok");
  await assert.rejects(
    runBoundedProcess(process.execPath, ["-e", "process.stdout.write('x'.repeat(200000))"], { timeoutMs: 2000, maximumOutputBytes: 1024 }),
    (error) => assertCode(error, "LAYERED_GODOT_RUNTIME_OUTPUT_LIMIT"),
  );
  await assert.rejects(
    runBoundedProcess(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], { timeoutMs: 100, maximumOutputBytes: 1024 }),
    (error) => assertCode(error, "LAYERED_GODOT_RUNTIME_TIMEOUT"),
  );
});
