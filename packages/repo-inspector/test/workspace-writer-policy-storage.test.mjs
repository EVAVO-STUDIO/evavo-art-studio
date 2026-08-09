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

test("protected repository controls and duplicate targets are rejected", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  await mkdir(path.join(f.workspace, "assets"), { recursive: true });
  await writeFile(path.join(f.workspace, "assets/a.png"), PNG_BYTES);
  await writeFile(path.join(f.workspace, "assets/b.png"), PNG_BYTES);
  await expectCode(
    compileArtWorkspaceFilePlan(
      {
        workspaceRoot: f.workspace,
        idempotencyKey: "control-path",
        operations: [
          { type: "copy", source: "assets/a.png", target: ".github/frame.png" },
        ],
      },
      f.policy,
    ),
    "ART_WORKSPACE_REPOSITORY_CONTROL_PATH_FORBIDDEN",
  );
  await expectCode(
    compileArtWorkspaceFilePlan(
      {
        workspaceRoot: f.workspace,
        idempotencyKey: "duplicate-target",
        operations: [
          { type: "copy", source: "assets/a.png", target: "assets/out.png" },
          { type: "copy", source: "assets/b.png", target: "assets/out.png" },
        ],
      },
      f.policy,
    ),
    "ART_WORKSPACE_TARGET_OPERATION_CONFLICT",
  );
});

test("symlink sources fail closed when the platform permits symlinks", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  await mkdir(path.join(f.workspace, "assets"), { recursive: true });
  await writeFile(path.join(f.workspace, "real.png"), PNG_BYTES);
  try {
    await symlink(path.join(f.workspace, "real.png"), path.join(f.workspace, "assets/link.png"));
  } catch {
    t.skip("Symlink creation is unavailable on this platform.");
    return;
  }
  await expectCode(
    compileArtWorkspaceFilePlan(
      {
        workspaceRoot: f.workspace,
        idempotencyKey: "symlink-source",
        operations: [
          { type: "copy", source: "assets/link.png", target: "assets/out.png" },
        ],
      },
      f.policy,
    ),
    "ART_WORKSPACE_SYMLINK_FORBIDDEN",
  );
});

test("EVAVO Storage handoff uses fixed arguments and excludes provider credentials", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  await mkdir(path.join(f.workspace, "assets"), { recursive: true });
  await writeFile(path.join(f.workspace, "assets/frame.png"), PNG_BYTES);
  const helper = path.join(f.root, "operator.mjs");
  await writeFile(
    helper,
    `process.stdout.write(JSON.stringify({args:process.argv.slice(2),hasOpenAI:Object.hasOwn(process.env,'OPENAI_API_KEY'),storageToken:process.env.EVAVO_STORAGE_OPERATOR_WRITE_TOKEN?'present':'absent'}));`,
  );
  const originalOpenAI = process.env.OPENAI_API_KEY;
  const originalStorage = process.env.EVAVO_STORAGE_OPERATOR_WRITE_TOKEN;
  process.env.OPENAI_API_KEY = "must-not-cross";
  process.env.EVAVO_STORAGE_OPERATOR_WRITE_TOKEN = "allowed-storage-secret";
  t.after(() => {
    if (originalOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAI;
    if (originalStorage === undefined) delete process.env.EVAVO_STORAGE_OPERATOR_WRITE_TOKEN;
    else process.env.EVAVO_STORAGE_OPERATOR_WRITE_TOKEN = originalStorage;
  });
  const receipt = await archiveArtWorkspaceFileToStorage(
    {
      workspaceRoot: f.workspace,
      source: "assets/frame.png",
      vault: "art-source",
      logicalPath: "Avatar Runtime/EVA/frame.png",
      title: "EVA frame",
      idempotencyKey: "storage-frame-001",
      mode: "put",
    },
    {
      ...f.policy,
      allowStorageWrites: true,
      storageOperatorCommand: [process.execPath, helper],
      storageTimeoutMs: 10_000,
      processOutputLimitBytes: 100_000,
    },
  );
  assert.equal(receipt.operatorResult.hasOpenAI, false);
  assert.equal(receipt.operatorResult.storageToken, "[REDACTED]");
  assert.equal(receipt.operatorResult.args[0], "put");
  assert.equal(receipt.operatorResult.args.includes("--idempotency-key"), true);
  assert.equal(receipt.providerCredentialExposed, false);
});
