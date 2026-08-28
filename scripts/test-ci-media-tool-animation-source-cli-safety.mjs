import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const cli = path.join(
  repositoryRoot,
  "scripts",
  "animation-source-bundle.mjs",
);
const fixturePath = path.join(
  repositoryRoot,
  "contracts",
  "fixtures",
  "animation-source-bundle-v1.json",
);

const FIRST_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAk+Uzr4AAAAASUVORK5CYII=";
const SECOND_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAC0lEQVR4nGNgQAcAABIAAXfx+gAAAAAASUVORK5CYII=";

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
}

async function fixture() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "evavo-animation-cli-safety-"),
  );
  const source = path.join(root, "source");
  const frames = path.join(source, "frames");
  await mkdir(frames, { recursive: true });
  await writeFile(
    path.join(frames, "hero-key-0001.png"),
    Buffer.from(FIRST_PNG, "base64"),
  );
  await writeFile(
    path.join(frames, "hero-key-0002.png"),
    Buffer.from(SECOND_PNG, "base64"),
  );

  const manifest = JSON.parse(
    await readFile(fixturePath, "utf8"),
  );
  const request = {
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
  const requestPath = path.join(root, "request.json");
  await writeFile(
    requestPath,
    `${JSON.stringify(request, null, 2)}\n`,
    "utf8",
  );
  return {
    root,
    source,
    requestPath,
    firstSource: path.join(frames, "hero-key-0001.png"),
    bundlePath: path.join(root, "bundle.json"),
    receiptPath: path.join(root, "receipt.json"),
  };
}

test("CLI compile and verify emit control and output evidence", async () => {
  const value = await fixture();
  try {
    const compiled = run([
      "compile",
      value.requestPath,
      "--root",
      value.source,
      "--output",
      value.bundlePath,
      "--concurrency",
      "2",
    ]);
    assert.equal(
      compiled.status,
      0,
      [compiled.stdout, compiled.stderr].filter(Boolean).join("\n"),
    );
    const compileSummary = JSON.parse(compiled.stdout);
    assert.equal(compileSummary.operation, "compile");
    assert.equal(
      compileSummary.controlDocumentEvidence.stableDoubleRead,
      true,
    );
    assert.equal(compileSummary.outputEvidence.createOnly, true);

    const bundle = JSON.parse(
      await readFile(value.bundlePath, "utf8"),
    );
    assert.equal(bundle.assets.length, 2);

    const verified = run([
      "verify",
      value.bundlePath,
      "--root",
      value.source,
      "--output",
      value.receiptPath,
      "--concurrency",
      "2",
    ]);
    assert.equal(
      verified.status,
      0,
      [verified.stdout, verified.stderr].filter(Boolean).join("\n"),
    );
    const verifySummary = JSON.parse(verified.stdout);
    assert.equal(verifySummary.operation, "verify");
    assert.equal(verifySummary.outputEvidence.createOnly, true);
    assert.equal(verifySummary.assetCount, 2);
    const receipt = JSON.parse(
      await readFile(value.receiptPath, "utf8"),
    );
    assert.equal(receipt.assetCount, 2);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("CLI output is create-only unless replacement is explicit", async () => {
  const value = await fixture();
  try {
    const initial = run([
      "compile",
      value.requestPath,
      "--root",
      value.source,
      "--output",
      value.bundlePath,
    ]);
    assert.equal(initial.status, 0, initial.stderr);
    const original = await readFile(value.bundlePath);

    const refused = run([
      "compile",
      value.requestPath,
      "--root",
      value.source,
      "--output",
      value.bundlePath,
    ]);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /ANIMATION_SOURCE_OUTPUT_EXISTS/u);
    assert.deepEqual(await readFile(value.bundlePath), original);

    const replaced = run([
      "compile",
      value.requestPath,
      "--root",
      value.source,
      "--output",
      value.bundlePath,
      "--replace-output",
    ]);
    assert.equal(
      replaced.status,
      0,
      [replaced.stdout, replaced.stderr].filter(Boolean).join("\n"),
    );
    assert.equal(
      JSON.parse(replaced.stdout).outputEvidence.replaced,
      true,
    );
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("CLI refuses to overwrite control documents or source media", async () => {
  const value = await fixture();
  try {
    const requestBefore = await readFile(value.requestPath);
    const requestCollision = run([
      "compile",
      value.requestPath,
      "--root",
      value.source,
      "--output",
      value.requestPath,
      "--replace-output",
    ]);
    assert.notEqual(requestCollision.status, 0);
    assert.match(
      requestCollision.stderr,
      /ANIMATION_SOURCE_OUTPUT_PROTECTED_PATH_COLLISION/u,
    );
    assert.deepEqual(await readFile(value.requestPath), requestBefore);

    const compiled = run([
      "compile",
      value.requestPath,
      "--root",
      value.source,
      "--output",
      value.bundlePath,
    ]);
    assert.equal(compiled.status, 0, compiled.stderr);

    const sourceBefore = await readFile(value.firstSource);
    const sourceCollision = run([
      "verify",
      value.bundlePath,
      "--root",
      value.source,
      "--output",
      value.firstSource,
      "--replace-output",
    ]);
    assert.notEqual(sourceCollision.status, 0);
    assert.match(
      sourceCollision.stderr,
      /ANIMATION_SOURCE_OUTPUT_PROTECTED_PATH_COLLISION/u,
    );
    assert.deepEqual(await readFile(value.firstSource), sourceBefore);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("CLI rejects ambiguous and unsafe byte-limit options", async () => {
  const value = await fixture();
  try {
    const duplicate = run([
      "compile",
      value.requestPath,
      "--root",
      value.source,
      "--output",
      value.bundlePath,
      "--output",
      value.receiptPath,
    ]);
    assert.notEqual(duplicate.status, 0);
    assert.match(
      duplicate.stderr,
      /ANIMATION_SOURCE_BUNDLE_OPTION_DUPLICATE/u,
    );

    const bounded = run([
      "compile",
      value.requestPath,
      "--root",
      value.source,
      "--output",
      value.bundlePath,
      "--max-control-bytes",
      "8",
    ]);
    assert.notEqual(bounded.status, 0);
    assert.match(
      bounded.stderr,
      /ANIMATION_SOURCE_CONTROL_DOCUMENT_TOO_LARGE/u,
    );

    const invalid = run([
      "compile",
      value.requestPath,
      "--root",
      value.source,
      "--output",
      value.bundlePath,
      "--max-output-bytes",
      "0",
    ]);
    assert.notEqual(invalid.status, 0);
    assert.match(
      invalid.stderr,
      /ANIMATION_SOURCE_BUNDLE_MAX_OUTPUT_BYTES_INVALID/u,
    );
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
