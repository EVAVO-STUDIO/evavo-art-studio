import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ANIMATION_SOURCE_BUNDLE_SCHEMA_SHA256,
  assertAnimationSourceBundle,
  assertAnimationSourceBundleRelativePath,
  compileAnimationSourceBundle,
  sha256Json,
  verifyAnimationSourceBundleFiles,
  writeJsonAtomic,
} from "./lib/animation-source-bundle.mjs";

const FIRST_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAk+Uzr4AAAAASUVORK5CYII=";
const SECOND_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAC0lEQVR4nGNgQAcAABIAAXfx+gAAAAAASUVORK5CYII=";

const fixtureUrl = new URL(
  "../contracts/fixtures/animation-source-bundle-v1.json",
  import.meta.url,
);
const schemaUrl = new URL(
  "../contracts/animation-source-bundle-v1.schema.json",
  import.meta.url,
);

async function readFixture() {
  return JSON.parse(await readFile(fixtureUrl, "utf8"));
}

async function createSourceRoot() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "evavo-animation-bundle-"),
  );
  await mkdir(path.join(root, "frames"), { recursive: true });
  await writeFile(
    path.join(root, "frames", "hero-key-0001.png"),
    Buffer.from(FIRST_PNG, "base64"),
  );
  await writeFile(
    path.join(root, "frames", "hero-key-0002.png"),
    Buffer.from(SECOND_PNG, "base64"),
  );
  return root;
}

function requestFromManifest(manifest) {
  return {
    bundleId: manifest.bundleId,
    createdAt: manifest.createdAt,
    producer: {
      version: manifest.producer.version,
      sourceRevision: manifest.producer.sourceRevision,
    },
    project: manifest.project,
    timeline: manifest.timeline,
    canvas: manifest.canvas,
    creativeIntentSha256: manifest.creativeIntentSha256,
    continuitySha256: manifest.continuitySha256,
    assets: manifest.assets.map(
      ({ byteLength: _byteLength, sha256: _sha256, ...asset }) =>
        asset,
    ),
    creativeApprovalIncluded:
      manifest.authority.creativeApprovalIncluded,
    approval: {
      state: "approved",
      approvedBy: manifest.approval.approvedBy,
      approvedAt: manifest.approval.approvedAt,
      decisionReason: manifest.approval.decisionReason,
    },
  };
}

test("repository governance checker accepts the wired surfaces", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-animation-source-bundle.mjs"],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    },
  );
  assert.equal(
    result.status,
    0,
    [result.stdout, result.stderr].filter(Boolean).join("\n"),
  );
});

test("shared schema fingerprint and fixture stay canonical", async () => {
  const schema = await readFile(schemaUrl);
  assert.equal(
    createHash("sha256").update(schema).digest("hex"),
    ANIMATION_SOURCE_BUNDLE_SCHEMA_SHA256,
  );

  const manifest = assertAnimationSourceBundle(
    await readFixture(),
  );
  assert.equal(
    manifest.bundleDigest,
    "sha256:66e24fa35fb53699b4283210c78f023162be1cdf48f80cddf0f037cbc3f53d7c",
  );
  assert.equal(
    manifest.approval.approvalDigest,
    "sha256:b478177edb4881ff73580fa4d2ecb20f6611ab66393711674a15b52f0d6aa986",
  );
});

test("compiler measures source media and reproduces the fixture", async () => {
  const manifest = await readFixture();
  const root = await createSourceRoot();
  try {
    const compiled = await compileAnimationSourceBundle(
      requestFromManifest(manifest),
      root,
      { concurrency: 2 },
    );
    assert.deepEqual(compiled, manifest);

    const receipt = await verifyAnimationSourceBundleFiles(
      compiled,
      root,
      { concurrency: 2 },
    );
    assert.equal(receipt.assetCount, 2);
    assert.equal(receipt.totalBytes, 145);
    assert.match(
      receipt.receiptDigest,
      /^sha256:[0-9a-f]{64}$/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verification rejects changed bytes and stale approvals", async () => {
  const manifest = await readFixture();
  const root = await createSourceRoot();
  try {
    await writeFile(
      path.join(root, "frames", "hero-key-0002.png"),
      Buffer.from(FIRST_PNG, "base64"),
    );
    await assert.rejects(
      verifyAnimationSourceBundleFiles(manifest, root),
      /ANIMATION_SOURCE_BUNDLE_BYTE_LENGTH_MISMATCH|ANIMATION_SOURCE_BUNDLE_ASSET_DIGEST_MISMATCH/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  const stale = structuredClone(manifest);
  stale.timeline.cadence = "ones";
  const { approval: _approval, bundleDigest: _digest, ...body } =
    stale;
  stale.bundleDigest = sha256Json(body);
  assert.throws(
    () => assertAnimationSourceBundle(stale),
    /ANIMATION_SOURCE_BUNDLE_STALE_APPROVAL/,
  );
});

test("portable paths reject traversal, drive, UNC and devices", () => {
  for (const value of [
    "../outside.png",
    "frames/../outside.png",
    "C:/frames/one.png",
    "\\\\server\\share\\one.png",
    "frames//one.png",
    "frames/con.png",
    "frames/trailing. ",
  ]) {
    assert.throws(
      () => assertAnimationSourceBundleRelativePath(value),
      /ANIMATION_SOURCE_BUNDLE_PATH_INVALID/,
    );
  }
  assert.equal(
    assertAnimationSourceBundleRelativePath(
      "frames/hero-0001.png",
    ),
    "frames/hero-0001.png",
  );
});

test("realpath validation rejects symlinked source files", async () => {
  if (process.platform === "win32") return;

  const manifest = await readFixture();
  const root = await createSourceRoot();
  const outsideRoot = await mkdtemp(
    path.join(os.tmpdir(), "evavo-animation-outside-"),
  );
  try {
    const outside = path.join(outsideRoot, "outside.png");
    await writeFile(outside, Buffer.from(FIRST_PNG, "base64"));

    const target = path.join(
      root,
      "frames",
      "hero-key-0001.png",
    );
    await rm(target);
    await symlink(outside, target);

    await assert.rejects(
      verifyAnimationSourceBundleFiles(manifest, root),
      /ANIMATION_SOURCE_BUNDLE_SYMLINK_FORBIDDEN/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test("atomic JSON output always leaves complete evidence", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "evavo-animation-output-"),
  );
  try {
    const destination = path.join(
      root,
      "nested",
      "manifest.json",
    );
    const manifest = await readFixture();
    await writeJsonAtomic(destination, manifest);
    assert.deepEqual(
      JSON.parse(await readFile(destination, "utf8")),
      manifest,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
