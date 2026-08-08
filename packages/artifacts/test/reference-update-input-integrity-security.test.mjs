import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ArtifactStoreError, LocalArtifactStore } from "../dist/index.js";

const T0 = new Date("2026-08-08T00:00:00.000Z");
const T1 = new Date("2026-08-08T00:01:00.000Z");

function once(reads, name, value) {
  return {
    enumerable: true,
    configurable: true,
    get() {
      const count = (reads.get(name) ?? 0) + 1;
      reads.set(name, count);
      if (count > 1) {
        throw new Error(`reference-update-secret-${name}`);
      }
      return value;
    },
  };
}

function referenceInputFailure(secret) {
  return (error) =>
    error instanceof ArtifactStoreError &&
    error.code === "ARTIFACT_REFERENCE_INVALID" &&
    !error.message.includes(secret);
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-reference-input-"));
  const artifacts = new LocalArtifactStore({ root });
  await artifacts.root();
  const first = await artifacts.put("v1", {
    mediaType: "text/plain",
    storageClass: "master",
  });
  const second = await artifacts.put("v2", {
    mediaType: "text/plain",
    storageClass: "master",
  });
  await artifacts.updateReference(
    "projects/demo",
    "approved-master",
    first.artifactId,
    {
      expectedGeneration: 0,
      actor: "operator-a",
      now: T0,
    },
  );
  const referencePath = path.join(
    root,
    "refs",
    "projects",
    "demo",
    "approved-master.json",
  );
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return { artifacts, first, second, referencePath };
}

test("reference update options are read once and detached before promotion", async (t) => {
  const { artifacts, first, second } = await fixture(t);
  const reads = new Map();
  const options = {};
  Object.defineProperties(options, {
    expectedGeneration: once(reads, "expectedGeneration", 1),
    expectedArtifactId: once(
      reads,
      "expectedArtifactId",
      first.artifactId,
    ),
    actor: once(reads, "actor", " operator-b "),
    now: once(reads, "now", T1),
  });

  const updated = await artifacts.updateReference(
    "projects/demo",
    "approved-master",
    second.artifactId,
    options,
  );

  for (const name of [
    "expectedGeneration",
    "expectedArtifactId",
    "actor",
    "now",
  ]) {
    assert.equal(reads.get(name), 1, name);
  }
  assert.equal(updated.generation, 2);
  assert.equal(updated.artifactId, second.artifactId);
  assert.equal(updated.previousArtifactId, first.artifactId);
  assert.equal(updated.actor, "operator-b");
  assert.equal(updated.updatedAt, T1.toISOString());
});

test("reference compare-and-swap binds caller options before asynchronous reads", async (t) => {
  const { artifacts, first, second } = await fixture(t);
  const now = new Date(T1);
  const options = {
    expectedGeneration: 1,
    expectedArtifactId: first.artifactId,
    actor: "operator-original",
    now,
  };

  const update = artifacts.updateReference(
    "projects/demo",
    "approved-master",
    second.artifactId,
    options,
  );
  options.expectedGeneration = 999;
  options.expectedArtifactId = second.artifactId;
  options.actor = "operator-mutated";
  now.setUTCFullYear(2040);

  const updated = await update;
  assert.equal(updated.generation, 2);
  assert.equal(updated.artifactId, second.artifactId);
  assert.equal(updated.previousArtifactId, first.artifactId);
  assert.equal(updated.actor, "operator-original");
  assert.equal(updated.updatedAt, T1.toISOString());
});

test("hostile reference update options fail closed without leaking errors", async (t) => {
  const { artifacts, second, referencePath } = await fixture(t);
  const before = await readFile(referencePath, "utf8");
  const secret = "private-reference-option-error";
  const hostile = {};
  Object.defineProperty(hostile, "expectedGeneration", {
    enumerable: true,
    get() {
      throw new Error(secret);
    },
  });

  await assert.rejects(
    () =>
      artifacts.updateReference(
        "projects/demo",
        "approved-master",
        second.artifactId,
        hostile,
      ),
    referenceInputFailure(secret),
  );
  assert.equal(await readFile(referencePath, "utf8"), before);

  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  await assert.rejects(
    () =>
      artifacts.updateReference(
        "projects/demo",
        "approved-master",
        second.artifactId,
        revoked.proxy,
      ),
    referenceInputFailure(secret),
  );
  assert.equal(await readFile(referencePath, "utf8"), before);
});

test("reference compare-and-swap inputs reject malformed runtime values", async (t) => {
  const { artifacts, first, second } = await fixture(t);
  const invalidOptions = [
    null,
    { expectedGeneration: -1 },
    { expectedGeneration: 1.5 },
    { expectedGeneration: "1" },
    { expectedArtifactId: "artifact_bad" },
  ];

  for (const options of invalidOptions) {
    await assert.rejects(
      () =>
        artifacts.updateReference(
          "projects/demo",
          "approved-master",
          second.artifactId,
          options,
        ),
      referenceInputFailure("malformed-reference-option"),
    );
  }

  const resolved = await artifacts.resolveReference(
    "projects/demo",
    "approved-master",
  );
  assert.equal(resolved.artifactId, first.artifactId);
  assert.equal(resolved.generation, 1);
});
