import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ArtifactStoreError, LocalArtifactStore } from "../dist/index.js";

function referenceFailure(error) {
  return error instanceof ArtifactStoreError && error.code === "ARTIFACT_REFERENCE_INVALID";
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-reference-integrity-"));
  const artifacts = new LocalArtifactStore({ root });
  await artifacts.root();
  const first = await artifacts.put("v1", { mediaType: "text/plain", storageClass: "master" });
  const second = await artifacts.put("v2", { mediaType: "text/plain", storageClass: "master" });
  const reference = await artifacts.updateReference(
    "projects/demo",
    "approved-master",
    first.artifactId,
    { expectedGeneration: 0, actor: "worker-a", now: new Date("2026-08-07T00:00:00.000Z") },
  );
  const referencePath = path.join(root, "refs", "projects", "demo", "approved-master.json");
  const referenceText = await readFile(referencePath, "utf8");
  return { root, artifacts, first, second, reference, referencePath, referenceText };
}

test("stored references fail closed on path identity, generation, target consistency and shape tampering", async () => {
  const { root, artifacts, first, second, referencePath, referenceText } = await fixture();
  try {
    const original = JSON.parse(referenceText);
    const mutations = [
      ["namespace", (value) => { value.namespace = "projects/other"; }],
      ["name", (value) => { value.name = "other"; }],
      ["generation zero", (value) => { value.generation = 0; }],
      ["generation fraction", (value) => { value.generation = 1.5; }],
      ["missing previous", (value) => { value.generation = 2; }],
      ["unexpected previous", (value) => { value.previousArtifactId = second.artifactId; }],
      ["invalid artifact", (value) => { value.artifactId = "artifact_bad"; }],
      ["mismatched content hash", (value) => { value.contentHash = second.contentHash; }],
      ["invalid timestamp", (value) => { value.updatedAt = "not-a-date"; }],
      ["noncanonical timestamp", (value) => { value.updatedAt = "2026-08-07T00:00:00Z"; }],
      ["noncanonical actor", (value) => { value.actor = " worker-a "; }],
      ["unsupported field", (value) => { value.authorization = "must-not-be-retained"; }],
    ];
    for (const [name, mutate] of mutations) {
      const tampered = structuredClone(original);
      mutate(tampered);
      await writeFile(referencePath, `${JSON.stringify(tampered, null, 2)}\n`);
      await assert.rejects(
        () => artifacts.resolveReference("projects/demo", "approved-master"),
        referenceFailure,
        name,
      );
    }

    await writeFile(referencePath, referenceText);
    assert.equal(
      (await artifacts.resolveReference("projects/demo", "approved-master")).artifactId,
      first.artifactId,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reference bytes, file identity and target descriptors are validated before use", async () => {
  const { root, artifacts, first, referencePath, referenceText } = await fixture();
  try {
    await writeFile(referencePath, JSON.stringify(JSON.parse(referenceText)));
    await assert.rejects(
      () => artifacts.resolveReference("projects/demo", "approved-master"),
      referenceFailure,
    );

    await writeFile(referencePath, "{\n");
    await assert.rejects(
      () => artifacts.resolveReference("projects/demo", "approved-master"),
      referenceFailure,
    );

    await writeFile(referencePath, referenceText);
    const copiedPath = path.join(root, "refs", "projects", "demo", "other.json");
    await writeFile(copiedPath, referenceText);
    await assert.rejects(
      () => artifacts.resolveReference("projects/demo", "other"),
      referenceFailure,
    );
    await assert.rejects(
      () => artifacts.listReferences("projects/demo"),
      referenceFailure,
    );
    await rm(copiedPath, { force: true });

    await rm(path.join(root, first.descriptorRelativePath), { force: true });
    await assert.rejects(
      () => artifacts.resolveReference("projects/demo", "approved-master"),
      referenceFailure,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reference updates reject corrupted prior state and return immutable snapshots", async () => {
  const { root, artifacts, first, second, referencePath, referenceText } = await fixture();
  try {
    const tampered = JSON.parse(referenceText);
    tampered.contentHash = second.contentHash;
    await writeFile(referencePath, `${JSON.stringify(tampered, null, 2)}\n`);
    const before = await readFile(referencePath, "utf8");
    await assert.rejects(
      () => artifacts.updateReference(
        "projects/demo",
        "approved-master",
        second.artifactId,
        { expectedGeneration: 1, expectedArtifactId: first.artifactId },
      ),
      referenceFailure,
    );
    assert.equal(await readFile(referencePath, "utf8"), before);

    await writeFile(referencePath, referenceText);
    const updated = await artifacts.updateReference(
      "projects/demo",
      "approved-master",
      second.artifactId,
      {
        expectedGeneration: 1,
        expectedArtifactId: first.artifactId,
        actor: " worker-b ",
        now: new Date("2026-08-07T00:01:00.000Z"),
      },
    );
    assert.equal(updated.generation, 2);
    assert.equal(updated.actor, "worker-b");
    assert.equal(Object.isFrozen(updated), true);
    assert.throws(() => { updated.generation = 99; }, TypeError);

    const resolved = await artifacts.resolveReference("projects/demo", "approved-master");
    assert.equal(Object.isFrozen(resolved), true);
    const listed = await artifacts.listReferences("projects/demo");
    assert.equal(Object.isFrozen(listed), true);
    assert.equal(Object.isFrozen(listed[0]), true);
    assert.throws(() => { listed.push(updated); }, TypeError);

    await assert.rejects(
      () => artifacts.updateReference(
        "projects/demo",
        "approved-master",
        first.artifactId,
        { now: new Date(Number.NaN) },
      ),
      referenceFailure,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
