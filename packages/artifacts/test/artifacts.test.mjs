import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ArtifactStoreError,
  LocalArtifactStore,
} from "../dist/index.js";

async function store() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-artifacts-"));
  return { root, store: new LocalArtifactStore({ root }) };
}

test("deduplicates immutable bytes while retaining distinct descriptors", async () => {
  const { root, store: artifacts } = await store();
  const first = await artifacts.put("same bytes", {
    mediaType: "text/plain",
    storageClass: "master",
    fileName: "master.txt",
    labels: { purpose: "approved" },
    metadata: { revision: 1 },
  });
  const second = await artifacts.put("same bytes", {
    mediaType: "text/plain",
    storageClass: "evidence",
    fileName: "evidence.txt",
    labels: { purpose: "proof" },
    metadata: { revision: 1 },
  });

  assert.equal(first.contentHash, second.contentHash);
  assert.equal(first.objectRelativePath, second.objectRelativePath);
  assert.notEqual(first.artifactId, second.artifactId);
  assert.notEqual(first.descriptorRelativePath, second.descriptorRelativePath);
  assert.equal((await artifacts.read(first.artifactId)).toString("utf8"), "same bytes");
  assert.ok((await readFile(path.join(root, first.objectRelativePath))).length > 0);
});

test("concurrent identical puts converge on one artifact", async () => {
  const { store: artifacts } = await store();
  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      artifacts.put(Buffer.from("concurrent"), {
        mediaType: "application/octet-stream",
        storageClass: "intermediate",
        metadata: { stable: true },
      }),
    ),
  );
  assert.equal(new Set(results.map((entry) => entry.artifactId)).size, 1);
  assert.equal(new Set(results.map((entry) => entry.contentHash)).size, 1);
});

test("detects content tampering before returning bytes", async () => {
  const { root, store: artifacts } = await store();
  const artifact = await artifacts.put("trusted", {
    mediaType: "text/plain",
    storageClass: "evidence",
  });
  await writeFile(path.join(root, artifact.objectRelativePath), "tampered");
  const verification = await artifacts.verify(artifact.artifactId);
  assert.equal(verification.exists, true);
  assert.equal(verification.descriptorValid, true);
  assert.equal(verification.contentValid, false);
  await assert.rejects(
    () => artifacts.read(artifact.artifactId),
    (error) =>
      error instanceof ArtifactStoreError &&
      error.code === "ARTIFACT_CONTENT_CORRUPT",
  );
});

test("updates named references through compare-and-swap generations", async () => {
  const { store: artifacts } = await store();
  const first = await artifacts.put("v1", {
    mediaType: "text/plain",
    storageClass: "master",
  });
  const second = await artifacts.put("v2", {
    mediaType: "text/plain",
    storageClass: "master",
  });

  const initial = await artifacts.updateReference(
    "projects/demo",
    "approved-master",
    first.artifactId,
    { expectedGeneration: 0, actor: "worker-a", now: new Date("2026-07-29T00:00:00Z") },
  );
  assert.equal(initial.generation, 1);
  assert.equal(initial.artifactId, first.artifactId);

  await assert.rejects(
    () =>
      artifacts.updateReference(
        "projects/demo",
        "approved-master",
        second.artifactId,
        { expectedGeneration: 0 },
      ),
    (error) =>
      error instanceof ArtifactStoreError &&
      error.code === "ARTIFACT_REFERENCE_CONFLICT",
  );

  const updated = await artifacts.updateReference(
    "projects/demo",
    "approved-master",
    second.artifactId,
    {
      expectedGeneration: 1,
      expectedArtifactId: first.artifactId,
      actor: "worker-b",
      now: new Date("2026-07-29T00:01:00Z"),
    },
  );
  assert.equal(updated.generation, 2);
  assert.equal(updated.previousArtifactId, first.artifactId);
  assert.equal((await artifacts.resolveReference("projects/demo", "approved-master")).artifactId, second.artifactId);
  assert.deepEqual(
    (await artifacts.listReferences("projects/demo")).map((entry) => entry.name),
    ["approved-master"],
  );
});

test("rejects traversal-shaped reference names and non-JSON metadata", async () => {
  const { store: artifacts } = await store();
  const artifact = await artifacts.put("safe", {
    mediaType: "text/plain",
    storageClass: "master",
  });
  await assert.rejects(
    () => artifacts.updateReference("../escape", "master", artifact.artifactId),
    (error) =>
      error instanceof ArtifactStoreError &&
      error.code === "ARTIFACT_PATH_INVALID",
  );
  await assert.rejects(
    () =>
      artifacts.put("bad", {
        mediaType: "text/plain",
        storageClass: "evidence",
        metadata: { invalid: Number.NaN },
      }),
    (error) =>
      error instanceof ArtifactStoreError &&
      error.code === "ARTIFACT_METADATA_INVALID",
  );
});
