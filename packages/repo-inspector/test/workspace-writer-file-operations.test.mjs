import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ArtWorkspaceWriterError,
  applyArtWorkspaceFilePlan,
  archiveArtWorkspaceFileToStorage,
  artWorkspaceWriterCapabilities,
  compileArtWorkspaceFilePlan,
  intakeArtWorkspaceFiles,
  readArtWorkspaceMediaPreview,
} from "../dist/workspace-writer.js";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lz7l4QAAAABJRU5ErkJggg==";
const PNG_BYTES = Buffer.from(PNG_BASE64, "base64");

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-art-writer-"));
  const workspace = path.join(root, "workspace");
  const imports = path.join(root, "imports");
  await Promise.all([mkdir(workspace), mkdir(imports)]);
  return {
    root,
    workspace,
    imports,
    policy: {
      allowedWorkspaceRoots: [root],
      allowedImportRoots: [imports],
      allowWrites: true,
      maximumFileBytes: 32 * 1024 * 1024,
      maximumBase64Bytes: 4 * 1024 * 1024,
    },
  };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ArtWorkspaceWriterError);
    assert.equal(error.code, code);
    return true;
  });
}

test("copy is no-overwrite and detects a target race", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  await mkdir(path.join(f.workspace, "assets"), { recursive: true });
  await writeFile(path.join(f.workspace, "assets/source.png"), PNG_BYTES);
  const plan = await compileArtWorkspaceFilePlan(
    {
      workspaceRoot: f.workspace,
      idempotencyKey: "copy-race",
      operations: [
        { type: "copy", source: "assets/source.png", target: "assets/target.png" },
      ],
    },
    f.policy,
  );
  await writeFile(path.join(f.workspace, "assets/target.png"), "raced");
  await expectCode(
    applyArtWorkspaceFilePlan(plan, f.policy),
    "ART_WORKSPACE_TARGET_EXISTS",
  );
  assert.equal(await readFile(path.join(f.workspace, "assets/target.png"), "utf8"), "raced");
  assert.deepEqual(await readFile(path.join(f.workspace, "assets/source.png")), PNG_BYTES);
});

test("move, reversible trash and exact restore retain bytes", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  await mkdir(path.join(f.workspace, "assets/source"), { recursive: true });
  await writeFile(path.join(f.workspace, "assets/source/frame.png"), PNG_BYTES);
  const movePlan = await compileArtWorkspaceFilePlan(
    {
      workspaceRoot: f.workspace,
      idempotencyKey: "move-frame",
      operations: [
        {
          type: "move",
          source: "assets/source/frame.png",
          target: "assets/eva/idle/eva_idle_001.png",
        },
      ],
    },
    f.policy,
  );
  await applyArtWorkspaceFilePlan(movePlan, f.policy);
  assert.deepEqual(
    await readFile(path.join(f.workspace, "assets/eva/idle/eva_idle_001.png")),
    PNG_BYTES,
  );
  const trashPlan = await compileArtWorkspaceFilePlan(
    {
      workspaceRoot: f.workspace,
      idempotencyKey: "trash-frame",
      operations: [{ type: "trash", source: "assets/eva/idle/eva_idle_001.png" }],
    },
    f.policy,
  );
  const trashReceipt = await applyArtWorkspaceFilePlan(trashPlan, f.policy);
  const trashPath = trashReceipt.operations[0].trashPath;
  assert.ok(trashPath);
  const restorePlan = await compileArtWorkspaceFilePlan(
    {
      workspaceRoot: f.workspace,
      idempotencyKey: "restore-frame",
      operations: [
        {
          type: "restore",
          source: trashPath,
          target: "assets/eva/idle/eva_idle_001.png",
        },
      ],
    },
    f.policy,
  );
  await applyArtWorkspaceFilePlan(restorePlan, f.policy);
  assert.deepEqual(
    await readFile(path.join(f.workspace, "assets/eva/idle/eva_idle_001.png")),
    PNG_BYTES,
  );
});

test("replace retains exact previous bytes in reversible trash", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  await mkdir(path.join(f.workspace, "assets"), { recursive: true });
  const oldBytes = Buffer.from(PNG_BYTES);
  const newBytes = Buffer.concat([PNG_BYTES, Buffer.from("new")]);
  await writeFile(path.join(f.workspace, "assets/approved.png"), oldBytes);
  await writeFile(path.join(f.workspace, "assets/repaired.png"), newBytes);
  const crypto = await import("node:crypto");
  const oldHash = crypto.createHash("sha256").update(oldBytes).digest("hex");
  const plan = await compileArtWorkspaceFilePlan(
    {
      workspaceRoot: f.workspace,
      idempotencyKey: "replace-frame",
      operations: [
        {
          type: "replace",
          source: "assets/repaired.png",
          target: "assets/approved.png",
          expectedTargetSha256: oldHash,
        },
      ],
    },
    f.policy,
  );
  const receipt = await applyArtWorkspaceFilePlan(plan, f.policy);
  assert.deepEqual(await readFile(path.join(f.workspace, "assets/approved.png")), newBytes);
  assert.deepEqual(
    await readFile(path.join(f.workspace, receipt.operations[0].trashPath)),
    oldBytes,
  );
});
