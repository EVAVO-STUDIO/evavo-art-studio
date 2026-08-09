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

test("capabilities retain the publication boundary", async () => {
  const capabilities = artWorkspaceWriterCapabilities({
    allowedWorkspaceRoots: [process.cwd()],
    allowWrites: true,
  });
  assert.equal(capabilities.writesEnabled, true);
  assert.equal(capabilities.publicationAuthority, false);
  assert.equal(capabilities.gitPushPerformed, false);
  assert.equal(capabilities.arbitraryShellAllowed, false);
});

test("base64 intake is create-only, idempotent and previewable", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const request = {
    workspaceRoot: f.workspace,
    projectId: "eva-female",
    idempotencyKey: "chat-frame-001",
    sources: [
      {
        kind: "base64",
        name: "eva_idle_001.png",
        dataBase64: PNG_BASE64,
      },
    ],
  };
  const first = await intakeArtWorkspaceFiles(request, f.policy);
  const second = await intakeArtWorkspaceFiles(request, f.policy);
  assert.deepEqual(second, first);
  assert.equal(first.files.length, 1);
  assert.equal(first.files[0].media.width, 1);
  assert.equal(first.files[0].media.height, 1);
  assert.equal(first.files[0].media.hasAlphaChannel, true);
  const preview = await readArtWorkspaceMediaPreview(
    {
      workspaceRoot: f.workspace,
      path: first.files[0].storedRelativePath,
    },
    f.policy,
  );
  assert.equal(preview.dataBase64, PNG_BASE64);
  assert.equal(preview.media.mimeType, "image/png");
});

test("mounted path intake is import-root scoped and signature checked", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const source = path.join(f.imports, "frame.png");
  await writeFile(source, PNG_BYTES);
  const receipt = await intakeArtWorkspaceFiles(
    {
      workspaceRoot: f.workspace,
      projectId: "eva-female",
      idempotencyKey: "mounted-frame",
      sources: [{ kind: "path", path: source }],
    },
    f.policy,
  );
  assert.equal(receipt.files[0].sourceKind, "path");
  const fake = path.join(f.imports, "fake.png");
  await writeFile(fake, "not a png");
  await expectCode(
    intakeArtWorkspaceFiles(
      {
        workspaceRoot: f.workspace,
        projectId: "eva-female",
        idempotencyKey: "fake-frame",
        sources: [{ kind: "path", path: fake }],
      },
      f.policy,
    ),
    "ART_WORKSPACE_MEDIA_SIGNATURE_INVALID",
  );
});


test("intake originals are immutable and must be copied into working art", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const intake = await intakeArtWorkspaceFiles(
    {
      workspaceRoot: f.workspace,
      projectId: "eva-female",
      idempotencyKey: "immutable-intake",
      sources: [{ kind: "base64", name: "frame.png", dataBase64: PNG_BASE64 }],
    },
    f.policy,
  );
  await expectCode(
    compileArtWorkspaceFilePlan(
      {
        workspaceRoot: f.workspace,
        idempotencyKey: "move-intake",
        operations: [
          {
            type: "move",
            source: intake.files[0].storedRelativePath,
            target: "assets/eva/frame.png",
          },
        ],
      },
      f.policy,
    ),
    "ART_WORKSPACE_INTAKE_IMMUTABLE",
  );
  const copyPlan = await compileArtWorkspaceFilePlan(
    {
      workspaceRoot: f.workspace,
      idempotencyKey: "copy-intake",
      operations: [
        {
          type: "copy",
          source: intake.files[0].storedRelativePath,
          target: "assets/eva/frame.png",
        },
      ],
    },
    f.policy,
  );
  await applyArtWorkspaceFilePlan(copyPlan, f.policy);
  assert.deepEqual(await readFile(path.join(f.workspace, "assets/eva/frame.png")), PNG_BYTES);
  assert.deepEqual(
    await readFile(path.join(f.workspace, intake.files[0].storedRelativePath)),
    PNG_BYTES,
  );
});
