import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ArtifactStoreError,
  LocalArtifactStore,
} from "../dist/index.js";

async function fixture(prefix) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  const artifacts = new LocalArtifactStore({ root });
  await artifacts.root();
  return { root, artifacts };
}

function once(reads, name, value) {
  return {
    enumerable: true,
    configurable: true,
    get() {
      const count = (reads.get(name) ?? 0) + 1;
      reads.set(name, count);
      if (count > 1) {
        throw new Error(`descriptor-input-secret-${name}`);
      }
      return value;
    },
  };
}

function expectedError(code, secret) {
  return (error) => {
    assert.equal(error instanceof ArtifactStoreError, true);
    assert.equal(error.code, code);
    assert.equal(error.message.includes(secret), false);
    return true;
  };
}

test("artifact descriptor inputs are snapshotted once before validation and hashing", async () => {
  const { root, artifacts } = await fixture(
    "evavo-artifact-descriptor-input-snapshot-",
  );
  try {
    const source = await artifacts.put("source", {
      mediaType: "text/plain",
      storageClass: "source",
    });
    const reads = new Map();

    const sourceArtifacts = [];
    Object.defineProperty(
      sourceArtifacts,
      0,
      once(reads, "sourceArtifacts[0]", source.artifactId),
    );

    const labels = {};
    Object.defineProperty(
      labels,
      "purpose",
      once(reads, "labels.purpose", " approved "),
    );

    const metadata = {};
    Object.defineProperty(
      metadata,
      "governance",
      once(reads, "metadata.governance", {
        stage: "draft",
        locks: ["identity", "content"],
      }),
    );

    const input = {};
    Object.defineProperties(input, {
      mediaType: once(reads, "input.mediaType", "Text/Plain"),
      storageClass: once(reads, "input.storageClass", "master"),
      fileName: once(reads, "input.fileName", "snapshot.txt"),
      sourceArtifacts: once(
        reads,
        "input.sourceArtifacts",
        sourceArtifacts,
      ),
      labels: once(reads, "input.labels", labels),
      metadata: once(reads, "input.metadata", metadata),
    });

    const stored = await artifacts.put("descriptor input snapshot", input);

    assert.equal(stored.mediaType, "text/plain");
    assert.equal(stored.storageClass, "master");
    assert.equal(stored.fileName, "snapshot.txt");
    assert.deepEqual(stored.sourceArtifacts, [source.artifactId]);
    assert.deepEqual({ ...stored.labels }, { purpose: "approved" });
    assert.deepEqual(stored.metadata, {
      governance: {
        stage: "draft",
        locks: ["identity", "content"],
      },
    });
    assert.deepEqual(
      Object.fromEntries([...reads.entries()].sort()),
      {
        "input.fileName": 1,
        "input.labels": 1,
        "input.mediaType": 1,
        "input.metadata": 1,
        "input.sourceArtifacts": 1,
        "input.storageClass": 1,
        "labels.purpose": 1,
        "metadata.governance": 1,
        "sourceArtifacts[0]": 1,
      },
    );
    assert.deepEqual(await artifacts.get(stored.artifactId), stored);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("descriptor input nested collections are copied before artifact identity is retained", async () => {
  const { root, artifacts } = await fixture(
    "evavo-artifact-descriptor-input-copy-",
  );
  try {
    const source = await artifacts.put("source", {
      mediaType: "text/plain",
      storageClass: "source",
    });
    const sourceArtifacts = [source.artifactId];
    const labels = { purpose: "approved" };
    const metadata = {
      governance: {
        stage: "draft",
        locks: ["identity"],
      },
    };
    const input = {
      mediaType: "text/plain",
      storageClass: "evidence",
      fileName: "evidence.txt",
      sourceArtifacts,
      labels,
      metadata,
    };

    const stored = await artifacts.put("detached descriptor input", input);
    const originalId = stored.artifactId;

    input.mediaType = "application/json";
    input.storageClass = "runtime";
    input.fileName = "mutated.json";
    sourceArtifacts.length = 0;
    labels.purpose = "mutated";
    metadata.governance.stage = "mutated";
    metadata.governance.locks.push("mutated");

    assert.equal(stored.artifactId, originalId);
    assert.equal(stored.mediaType, "text/plain");
    assert.equal(stored.storageClass, "evidence");
    assert.equal(stored.fileName, "evidence.txt");
    assert.deepEqual(stored.sourceArtifacts, [source.artifactId]);
    assert.deepEqual({ ...stored.labels }, { purpose: "approved" });
    assert.deepEqual(stored.metadata, {
      governance: {
        stage: "draft",
        locks: ["identity"],
      },
    });
    assert.deepEqual(await artifacts.get(originalId), stored);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("hostile artifact descriptor input access fails closed without leaking errors", async () => {
  const { root, artifacts } = await fixture(
    "evavo-artifact-descriptor-input-hostile-",
  );
  const secret = "descriptor-input-private-error";
  try {
    const hostileTopLevel = {
      get mediaType() {
        throw new Error(secret);
      },
      storageClass: "master",
    };
    await assert.rejects(
      () => artifacts.put("top-level", hostileTopLevel),
      expectedError("ARTIFACT_DESCRIPTOR_INPUT_INVALID", secret),
    );

    const hostileLabels = {};
    Object.defineProperty(hostileLabels, "purpose", {
      enumerable: true,
      get() {
        throw new Error(secret);
      },
    });
    await assert.rejects(
      () =>
        artifacts.put("labels", {
          mediaType: "text/plain",
          storageClass: "master",
          labels: hostileLabels,
        }),
      expectedError("ARTIFACT_LABEL_INVALID", secret),
    );

    const hostileSources = [];
    Object.defineProperty(hostileSources, 0, {
      enumerable: true,
      get() {
        throw new Error(secret);
      },
    });
    await assert.rejects(
      () =>
        artifacts.put("sources", {
          mediaType: "text/plain",
          storageClass: "master",
          sourceArtifacts: hostileSources,
        }),
      expectedError("ARTIFACT_ID_INVALID", secret),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("descriptor input runtime type failures use bounded artifact errors", async () => {
  const { root, artifacts } = await fixture(
    "evavo-artifact-descriptor-input-types-",
  );
  try {
    const cases = [
      [
        "media type",
        { mediaType: 42, storageClass: "master" },
        "ARTIFACT_MEDIA_TYPE_INVALID",
      ],
      [
        "storage class",
        { mediaType: "text/plain", storageClass: { value: "master" } },
        "ARTIFACT_STORAGE_CLASS_INVALID",
      ],
      [
        "file name",
        {
          mediaType: "text/plain",
          storageClass: "master",
          fileName: { value: "file.txt" },
        },
        "ARTIFACT_FILE_NAME_INVALID",
      ],
      [
        "labels",
        {
          mediaType: "text/plain",
          storageClass: "master",
          labels: { purpose: 1 },
        },
        "ARTIFACT_LABEL_INVALID",
      ],
      [
        "sources",
        {
          mediaType: "text/plain",
          storageClass: "master",
          sourceArtifacts: "not-an-array",
        },
        "ARTIFACT_ID_INVALID",
      ],
    ];

    for (const [name, input, code] of cases) {
      await assert.rejects(
        () => artifacts.put(String(name), input),
        (error) =>
          error instanceof ArtifactStoreError && error.code === code,
        name,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
