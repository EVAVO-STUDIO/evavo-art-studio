import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BRASS_ART_PRODUCTION_MODE,
  BRASS_ART_PRODUCTION_PROFILE,
  BRASS_ART_PRODUCTION_TOOL_NAMES,
  BrassArtProductionMcpConfig,
  loadDeliveryManifestStrict,
  productionCapabilityDocument,
  stageArtDeliveryBatch,
  validateArtDeliveryBatch,
} from "../dist/production.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePaths = [
  "../src/production.ts",
  "../src/production-contract.ts",
  "../src/production-manifest.ts",
].map((value) => path.resolve(here, value));
const source = sourcePaths
  .map((value) => fs.readFileSync(value, "utf8"))
  .join("\n");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function fixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "evavo-brass-art-production-"),
  );
  const sourceRoot = path.join(root, "source");
  const evidenceRoot = path.join(root, "evidence");
  fs.mkdirSync(sourceRoot);
  fs.mkdirSync(evidenceRoot);
  fs.writeFileSync(path.join(sourceRoot, "pixel.png"), PNG);
  const sourceSha256 = createHash("sha256").update(PNG).digest("hex");
  const manifest = {
    schema: "evavo.art-delivery-optimization.v1",
    batchId: "brass-production-test",
    project: {
      id: "Brass_Brine",
      title: "Brass & Brine",
      engine: "godot",
      engineVersion: "4.6.2",
      viewport: { width: 1280, height: 720 },
      rendering: "Compatibility",
    },
    items: [
      {
        id: "pixel",
        sourcePath: "pixel.png",
        targetPath: "assets/art/test/pixel.png",
        sourceSha256,
        sourceBytes: PNG.byteLength,
        profileId: "source-master-lossless",
        background: { mode: "preserve" },
      },
    ],
  };
  const manifestPath = path.join(evidenceRoot, "batch.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const config = new BrassArtProductionMcpConfig({
    sourceRoots: [sourceRoot],
    evidenceRoot,
  });
  return {
    root,
    sourceRoot,
    evidenceRoot,
    manifest,
    manifestPath,
    config,
    dispose() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test("production roots are explicit, canonical and disjoint", () => {
  const current = fixture();
  try {
    assert.throws(
      () =>
        new BrassArtProductionMcpConfig({
          sourceRoots: [],
          evidenceRoot: current.evidenceRoot,
        }),
      /at least one explicit production source root/iu,
    );
    assert.throws(
      () =>
        new BrassArtProductionMcpConfig({
          sourceRoots: [current.root],
          evidenceRoot: current.evidenceRoot,
        }),
      /evidence root must remain disjoint/iu,
    );
  } finally {
    current.dispose();
  }
});

test("production profile exposes exactly three bounded staging tools", () => {
  const current = fixture();
  try {
    const value = productionCapabilityDocument(current.config);
    assert.equal(value.profile, BRASS_ART_PRODUCTION_PROFILE);
    assert.equal(value.mode, BRASS_ART_PRODUCTION_MODE);
    assert.deepEqual(value.tools, BRASS_ART_PRODUCTION_TOOL_NAMES);
    assert.deepEqual(BRASS_ART_PRODUCTION_TOOL_NAMES, [
      "art_production_capabilities",
      "validate_art_delivery_batch",
      "stage_art_delivery_batch",
    ]);
    assert.equal(value.stagingWritesEnabled, true);
    assert.equal(value.createOnlyOutputs, true);
    assert.equal(value.atomicOutputPublication, true);
    for (const key of [
      "sourceMutationAllowed",
      "targetRepositoryMutationAllowed",
      "deletionAuthority",
      "providerExecutionAllowed",
      "runtimeJobSubmissionAllowed",
      "artifactReferenceMutationAllowed",
      "promotionAuthority",
      "publicationAuthority",
      "arbitraryShellAllowed",
      "arbitraryGitArgumentsAllowed",
      "arbitraryExecutablePathsAllowed",
      "executionPerformed",
      "mutationPerformed",
    ]) {
      assert.equal(value[key], false, key);
    }
  } finally {
    current.dispose();
  }
});

test("strict manifest loading rejects duplicate keys and UTF-8 BOM", () => {
  const current = fixture();
  try {
    const duplicate = path.join(current.evidenceRoot, "duplicate.json");
    fs.writeFileSync(
      duplicate,
      '{"schema":"evavo.art-delivery-optimization.v1","batchId":"one","batchId":"two","project":{},"items":[]}',
    );
    assert.throws(
      () => loadDeliveryManifestStrict(duplicate),
      /duplicate JSON key/iu,
    );
    const bom = path.join(current.evidenceRoot, "bom.json");
    fs.writeFileSync(
      bom,
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("{}")]),
    );
    assert.throws(() => loadDeliveryManifestStrict(bom), /byte-order mark/iu);
  } finally {
    current.dispose();
  }
});

test("validation rechecks source bytes without writing output", async () => {
  const current = fixture();
  try {
    const before = fs.readdirSync(current.evidenceRoot).sort();
    const value = await validateArtDeliveryBatch(current.config, {
      sourceRoot: current.sourceRoot,
      manifest: current.manifestPath,
    });
    assert.equal(value.operation, "evavo_brass_art_delivery_validation_v1");
    assert.equal(value.stagingMutationPerformed, false);
    assert.equal(value.sourceMutationPerformed, false);
    assert.equal(value.targetRepositoryMutationPerformed, false);
    assert.equal(value.receipt.mutationPerformed, false);
    assert.deepEqual(fs.readdirSync(current.evidenceRoot).sort(), before);
  } finally {
    current.dispose();
  }
});

test("staging creates one atomic batch and receipt outside the source root", async () => {
  const current = fixture();
  try {
    const value = await stageArtDeliveryBatch(current.config, {
      sourceRoot: current.sourceRoot,
      manifest: current.manifestPath,
      outputDirectory: "staged-batch",
      apply: true,
    });
    const output = path.join(current.evidenceRoot, "staged-batch");
    assert.equal(value.operation, "evavo_brass_art_delivery_staging_v1");
    assert.equal(value.stagingMutationPerformed, true);
    assert.equal(value.targetRepositoryMutationPerformed, false);
    assert.equal(value.receipt.mutationPerformed, true);
    assert.ok(fs.statSync(output).isDirectory());
    assert.ok(
      fs
        .statSync(path.join(output, "assets", "art", "test", "pixel.png"))
        .isFile(),
    );
    assert.ok(
      fs.statSync(path.join(output, "optimization-receipt.json")).isFile(),
    );
    assert.equal(
      fs.readFileSync(path.join(current.sourceRoot, "pixel.png")).equals(PNG),
      true,
    );
    await assert.rejects(
      () =>
        stageArtDeliveryBatch(current.config, {
          sourceRoot: current.sourceRoot,
          manifest: current.manifestPath,
          outputDirectory: "staged-batch",
          apply: true,
        }),
      /create-only|already exists/iu,
    );
  } finally {
    current.dispose();
  }
});

test("changed source identity and unconfigured roots fail closed", async () => {
  const current = fixture();
  try {
    fs.writeFileSync(
      path.join(current.sourceRoot, "pixel.png"),
      Buffer.concat([PNG, Buffer.from([0])]),
    );
    await assert.rejects(
      () =>
        validateArtDeliveryBatch(current.config, {
          sourceRoot: current.sourceRoot,
          manifest: current.manifestPath,
        }),
      /bytes|SHA-256/iu,
    );
    const other = path.join(current.root, "other");
    fs.mkdirSync(other);
    assert.throws(
      () => current.config.resolveSourceRoot(other),
      /must exactly match one configured/iu,
    );
  } finally {
    current.dispose();
  }
});

test("production source registers no provider, runtime, deletion or publication surface", () => {
  const registered = [
    ...source.matchAll(/server\.registerTool\(\s*"([^"]+)"/gu),
  ].map((match) => match[1]);
  assert.deepEqual(registered, [...BRASS_ART_PRODUCTION_TOOL_NAMES]);
  for (const required of [
    "EVAVO_ART_PRODUCTION_SOURCE_ROOTS",
    "EVAVO_ART_PRODUCTION_EVIDENCE_ROOT",
    "EVAVO_ART_PRODUCTION_MODE",
    "validateDeliveryBatchManifest",
    "executeDeliveryBatch",
    "remove-border-matte",
    "luminance-alpha",
    "createOnlyOutputs: true",
    "targetRepositoryMutationAllowed: false",
  ]) {
    assert.equal(source.includes(required), true, required);
  }
  for (const forbidden of [
    "registerRuntimeTools",
    "registerProviderTools",
    "LocalRuntimeRepository",
    "LocalArtifactStore",
    "writeGodotSpriteFramesImporter",
    "node:child_process",
    "git push",
    "git commit",
    "shell: true",
    "unlinkSync",
    "rmSync",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

test("symlinked production roots fail closed", (context) => {
  const current = fixture();
  const link = path.join(current.root, "linked-source");
  try {
    try {
      fs.symlinkSync(current.sourceRoot, link, "dir");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error) {
        context.skip(`symlinks unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    assert.throws(
      () =>
        new BrassArtProductionMcpConfig({
          sourceRoots: [link],
          evidenceRoot: current.evidenceRoot,
        }),
      /non-symlink|canonical/iu,
    );
  } finally {
    current.dispose();
  }
});
