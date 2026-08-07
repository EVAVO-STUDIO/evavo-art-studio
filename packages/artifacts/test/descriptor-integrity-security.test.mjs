import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ArtifactStoreError,
  LocalArtifactStore,
  sha256,
} from "../dist/index.js";

async function fixture() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "evavo-artifact-descriptor-integrity-"),
  );
  const artifacts = new LocalArtifactStore({ root });
  await artifacts.root();
  const sourceA = await artifacts.put("source-a", {
    mediaType: "text/plain",
    storageClass: "source",
  });
  const sourceB = await artifacts.put("source-b", {
    mediaType: "text/plain",
    storageClass: "source",
  });
  const stored = await artifacts.put("trusted artifact bytes", {
    mediaType: "application/octet-stream",
    storageClass: "evidence",
    fileName: "trusted.bin",
    sourceArtifacts: [sourceB.artifactId, sourceA.artifactId],
    labels: { purpose: "integrity" },
    metadata: {
      governance: {
        stage: "retained",
        locks: ["identity", "content", "path"],
      },
    },
  });
  const descriptorPath = path.join(root, stored.descriptorRelativePath);
  const descriptor = JSON.parse(await readFile(descriptorPath, "utf8"));
  return { root, artifacts, stored, descriptorPath, descriptor };
}

function descriptorFailure(error) {
  return (
    error instanceof ArtifactStoreError &&
    error.code === "ARTIFACT_DESCRIPTOR_INVALID"
  );
}

test("tampered artifact descriptors cannot redirect reads outside canonical storage", async () => {
  const { root, artifacts, stored, descriptorPath, descriptor } =
    await fixture();
  const outsideRoot = await mkdtemp(
    path.join(os.tmpdir(), "evavo-artifact-descriptor-outside-"),
  );
  try {
    const outsideBytes = Buffer.from("outside file that must never be followed");
    const outsidePath = path.join(outsideRoot, "outside.bin");
    await writeFile(outsidePath, outsideBytes);
    const outsideSha256 = sha256(outsideBytes);
    const tampered = structuredClone(descriptor);
    tampered.contentHash = `sha256:${outsideSha256}`;
    tampered.contentSha256 = outsideSha256;
    tampered.sizeBytes = outsideBytes.byteLength;
    tampered.objectRelativePath = path
      .relative(root, outsidePath)
      .split(path.sep)
      .join("/");
    await writeFile(
      descriptorPath,
      `${JSON.stringify(tampered, null, 2)}\n`,
    );

    await assert.rejects(
      () => artifacts.read(stored.artifactId),
      descriptorFailure,
    );
    const verification = await artifacts.verify(stored.artifactId);
    assert.deepEqual(verification, {
      artifactId: stored.artifactId,
      exists: true,
      descriptorValid: false,
      contentValid: false,
      expectedContentSha256: "",
      expectedSizeBytes: 0,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test("stored descriptors fail closed on identity, digest, path and shape tampering", async () => {
  const { root, artifacts, stored, descriptorPath, descriptor } =
    await fixture();
  try {
    const mutations = [
      ["artifact identity", (value) => {
        value.artifactId = `artifact_${"0".repeat(64)}`;
      }],
      ["descriptor digest", (value) => {
        value.descriptorSha256 = "0".repeat(64);
      }],
      ["content digest", (value) => {
        value.contentSha256 = "0".repeat(64);
      }],
      ["size", (value) => {
        value.sizeBytes = 1.5;
      }],
      ["media type", (value) => {
        value.mediaType = "Application/Octet-Stream";
      }],
      ["storage class", (value) => {
        value.storageClass = "untrusted";
      }],
      ["source order", (value) => {
        value.sourceArtifacts.reverse();
      }],
      ["duplicate source", (value) => {
        value.sourceArtifacts.push(value.sourceArtifacts[0]);
      }],
      ["label normalization", (value) => {
        value.labels.purpose = " integrity ";
      }],
      ["object path", (value) => {
        value.objectRelativePath = "../outside.bin";
      }],
      ["descriptor path", (value) => {
        value.descriptorRelativePath = "descriptors/other.json";
      }],
      ["unsupported field", (value) => {
        value.serverSecret = "must-never-be-retained";
      }],
    ];

    for (const [name, mutate] of mutations) {
      const tampered = structuredClone(descriptor);
      mutate(tampered);
      await writeFile(
        descriptorPath,
        `${JSON.stringify(tampered, null, 2)}\n`,
      );
      await assert.rejects(
        () => artifacts.get(stored.artifactId),
        descriptorFailure,
        name,
      );
    }

    await writeFile(
      descriptorPath,
      `${JSON.stringify(descriptor, null, 2)}\n`,
    );
    assert.deepEqual(await artifacts.get(stored.artifactId), stored);

    await writeFile(descriptorPath, "{\n");
    await assert.rejects(
      () => artifacts.get(stored.artifactId),
      descriptorFailure,
    );
    assert.equal(
      (await artifacts.verify(stored.artifactId)).descriptorValid,
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact descriptors are returned as deeply immutable canonical data", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "evavo-artifact-descriptor-freeze-"),
  );
  try {
    const artifacts = new LocalArtifactStore({ root });
    const labels = { constructor: "ordinary-data", purpose: "approved" };
    const stored = await artifacts.put("immutable", {
      mediaType: "text/plain",
      storageClass: "master",
      labels,
      metadata: {
        governance: {
          stage: "approved",
          locks: ["content", "identity"],
        },
      },
    });

    for (const value of [
      stored,
      stored.labels,
      stored.sourceArtifacts,
      stored.metadata,
      stored.metadata.governance,
      stored.metadata.governance.locks,
    ]) {
      assert.equal(Object.isFrozen(value), true);
    }
    assert.equal(Object.hasOwn(stored.labels, "constructor"), true);
    assert.equal(stored.labels.constructor, "ordinary-data");

    assert.throws(() => {
      stored.objectRelativePath = "../mutated";
    }, TypeError);
    assert.throws(() => {
      stored.labels.purpose = "mutated";
    }, TypeError);
    assert.throws(() => {
      stored.metadata.governance.locks.push("mutated");
    }, TypeError);

    const loaded = await artifacts.get(stored.artifactId);
    assert.deepEqual(loaded, stored);
    assert.equal(Object.isFrozen(loaded), true);
    assert.equal(Object.isFrozen(loaded.metadata.governance.locks), true);
    assert.match(
      await readFile(path.join(root, stored.descriptorRelativePath), "utf8"),
      /"constructor": "ordinary-data"/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
