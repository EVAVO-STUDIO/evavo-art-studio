import assert from "node:assert/strict";
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

import {
  ANIMATION_SOURCE_OBSERVATION_SCHEMA,
  SUPPORTED_ANIMATION_SOURCE_IMAGE_MEDIA_TYPES,
  compileAnimationSourceBundleStable,
  observeAnimationSourceFiles,
  verifyAnimationSourceBundleFilesStable,
} from "./lib/animation-source-stable-observation.mjs";

const FIRST_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAk+Uzr4AAAAASUVORK5CYII=",
  "base64",
);
const SECOND_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAC0lEQVR4nGNgQAcAABIAAXfx+gAAAAAASUVORK5CYII=",
  "base64",
);
const GIF_4_BY_3 = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
  0x04, 0x00, 0x03, 0x00,
]);
const JPEG_4_BY_3 = Buffer.from([
  0xff, 0xd8,
  0xff, 0xc0, 0x00, 0x11,
  0x08, 0x00, 0x03, 0x00, 0x04, 0x03,
  0x01, 0x11, 0x00,
  0x02, 0x11, 0x00,
  0x03, 0x11, 0x00,
  0xff, 0xd9,
]);
const WEBP_4_BY_3 = (() => {
  const bytes = Buffer.alloc(30);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(22, 4);
  bytes.write("WEBP", 8, "ascii");
  bytes.write("VP8X", 12, "ascii");
  bytes.writeUInt32LE(10, 16);
  bytes[24] = 3;
  bytes[27] = 2;
  return bytes;
})();

const fixtureUrl = new URL(
  "../contracts/fixtures/animation-source-bundle-v1.json",
  import.meta.url,
);

async function readFixture() {
  return JSON.parse(await readFile(fixtureUrl, "utf8"));
}

async function createSourceRoot() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "evavo-animation-stable-observation-"),
  );
  await mkdir(path.join(root, "frames"), { recursive: true });
  await writeFile(
    path.join(root, "frames", "hero-key-0001.png"),
    FIRST_PNG,
  );
  await writeFile(
    path.join(root, "frames", "hero-key-0002.png"),
    SECOND_PNG,
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
      ({ byteLength: _byteLength, sha256: _sha256, ...asset }) => asset,
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

function digest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

test("stable observation binds exact bytes, dimensions and file identity", async () => {
  const manifest = await readFixture();
  const root = await createSourceRoot();
  try {
    const observation = await observeAnimationSourceFiles(
      manifest.assets,
      root,
      { concurrency: 2, chunkBytes: 64 * 1024 },
    );
    assert.equal(observation.schema, ANIMATION_SOURCE_OBSERVATION_SCHEMA);
    assert.equal(observation.assetCount, 2);
    assert.equal(observation.totalBytes, FIRST_PNG.length + SECOND_PNG.length);
    assert.equal(observation.assets[0].sha256, digest(FIRST_PNG));
    assert.equal(observation.assets[1].sha256, digest(SECOND_PNG));
    assert.deepEqual(
      observation.assets.map(({ width, height }) => ({ width, height })),
      [{ width: 2, height: 2 }, { width: 2, height: 2 }],
    );
    for (const asset of observation.assets) {
      assert.match(asset.identityDigest, /^sha256:[0-9a-f]{64}$/u);
    }
    assert.deepEqual(observation.authority, {
      candidateOnly: true,
      providerExecution: false,
      renderExecution: false,
      publication: false,
      repositoryMutation: false,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stable compile and verify reproduce the canonical bundle", async () => {
  const manifest = await readFixture();
  const root = await createSourceRoot();
  try {
    const compiled = await compileAnimationSourceBundleStable(
      requestFromManifest(manifest),
      root,
      { concurrency: 2 },
    );
    assert.deepEqual(compiled, manifest);

    const receipt = await verifyAnimationSourceBundleFilesStable(
      compiled,
      root,
      { concurrency: 2 },
    );
    assert.equal(receipt.assetCount, 2);
    assert.equal(receipt.totalBytes, 145);
    assert.deepEqual(
      receipt.evidence.map(({ sha256 }) => sha256),
      manifest.assets.map(({ sha256 }) => sha256),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stable compile supplies measured dimensions for supported non-PNG images", async () => {
  const manifest = await readFixture();
  const root = await mkdtemp(
    path.join(os.tmpdir(), "evavo-animation-measured-jpeg-"),
  );
  try {
    await writeFile(path.join(root, "hero.jpg"), JPEG_4_BY_3);
    const request = {
      ...requestFromManifest(manifest),
      bundleId: "hero-jpeg-source-v1",
      timeline: {
        ...manifest.timeline,
        startFrame: 1,
        endFrame: 1,
        frameCount: 1,
        loopMode: "none",
      },
      canvas: {
        ...manifest.canvas,
        width: 4,
        height: 3,
      },
      assets: [{
        assetId: "hero-jpeg",
        role: "key-pose",
        relativePath: "hero.jpg",
        mediaType: "image/jpeg",
        frameNumber: 1,
        layerId: "hero",
      }],
      creativeApprovalIncluded: false,
      approval: { state: "draft" },
    };
    const compiled = await compileAnimationSourceBundleStable(request, root);
    assert.equal(compiled.assets[0].width, 4);
    assert.equal(compiled.assets[0].height, 3);
    assert.equal(compiled.assets[0].sha256, digest(JPEG_4_BY_3));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stable compile rejects a source replacement during delegated work", async () => {
  const manifest = await readFixture();
  const root = await createSourceRoot();
  try {
    await assert.rejects(
      compileAnimationSourceBundleStable(
        requestFromManifest(manifest),
        root,
        {
          concurrency: 1,
          onPhase: async ({ phase }) => {
            if (phase === "before-operation") {
              await writeFile(
                path.join(root, "frames", "hero-key-0002.png"),
                FIRST_PNG,
              );
            }
          },
        },
      ),
      /ANIMATION_SOURCE_BUNDLE_SOURCE_CHANGED_DURING_OPERATION/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stable verification cannot accept a swapped source set", async () => {
  const manifest = await readFixture();
  const root = await createSourceRoot();
  try {
    await assert.rejects(
      verifyAnimationSourceBundleFilesStable(manifest, root, {
        onPhase: async ({ phase }) => {
          if (phase === "before-operation") {
            await writeFile(
              path.join(root, "frames", "hero-key-0001.png"),
              SECOND_PNG,
            );
          }
        },
      }),
      /ANIMATION_SOURCE_BUNDLE_(?:SOURCE_CHANGED_DURING_OPERATION|BYTE_LENGTH_MISMATCH|ASSET_DIGEST_MISMATCH)/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PNG, JPEG, GIF and WebP dimensions are read from the same opened file", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "evavo-animation-image-probes-"),
  );
  try {
    const fixtures = [
      ["png", "image/png", FIRST_PNG, 2, 2],
      ["jpeg", "image/jpeg", JPEG_4_BY_3, 4, 3],
      ["gif", "image/gif", GIF_4_BY_3, 4, 3],
      ["webp", "image/webp", WEBP_4_BY_3, 4, 3],
    ];
    for (const [name, mediaType, bytes] of fixtures) {
      await writeFile(path.join(root, `${name}.bin`), bytes);
    }
    const observation = await observeAnimationSourceFiles(
      fixtures.map(([name, mediaType, _bytes, width, height]) => ({
        assetId: name,
        relativePath: `${name}.bin`,
        mediaType,
        width,
        height,
      })),
      root,
    );
    assert.deepEqual(
      observation.assets.map(({ mediaType, width, height }) => ({
        mediaType,
        width,
        height,
      })),
      fixtures.map(([_name, mediaType, _bytes, width, height]) => ({
        mediaType,
        width,
        height,
      })),
    );
    assert.deepEqual(
      SUPPORTED_ANIMATION_SOURCE_IMAGE_MEDIA_TYPES,
      ["image/png", "image/jpeg", "image/gif", "image/webp"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unsupported and spoofed images fail closed", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "evavo-animation-spoofed-image-"),
  );
  try {
    await writeFile(path.join(root, "source.bin"), Buffer.from("not an image"));
    await assert.rejects(
      observeAnimationSourceFiles(
        [{
          assetId: "unsupported",
          relativePath: "source.bin",
          mediaType: "image/tiff",
        }],
        root,
      ),
      /ANIMATION_SOURCE_BUNDLE_OBSERVATION_IMAGE_TYPE_UNSUPPORTED/u,
    );
    await assert.rejects(
      observeAnimationSourceFiles(
        [{
          assetId: "spoofed",
          relativePath: "source.bin",
          mediaType: "image/png",
        }],
        root,
      ),
      /ANIMATION_SOURCE_BUNDLE_OBSERVATION_PNG_INVALID/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("symlinked inputs remain outside the stable observation boundary", async (t) => {
  if (process.platform === "win32") {
    t.skip("Windows symlink creation may require an elevated local policy.");
    return;
  }
  const root = await createSourceRoot();
  const outsideRoot = await mkdtemp(
    path.join(os.tmpdir(), "evavo-animation-stable-outside-"),
  );
  try {
    const source = path.join(outsideRoot, "outside.png");
    await writeFile(source, FIRST_PNG);
    const target = path.join(root, "frames", "hero-key-0001.png");
    await rm(target);
    await symlink(source, target);
    const manifest = await readFixture();
    await assert.rejects(
      observeAnimationSourceFiles(manifest.assets, root),
      /ANIMATION_SOURCE_BUNDLE_OBSERVATION_SYMLINK_FORBIDDEN/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test("cancellation and unknown options fail before delegated execution", async () => {
  const manifest = await readFixture();
  const root = await createSourceRoot();
  try {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      observeAnimationSourceFiles(manifest.assets, root, {
        signal: controller.signal,
      }),
      /ANIMATION_SOURCE_BUNDLE_OBSERVATION_CANCELLED/u,
    );
    await assert.rejects(
      observeAnimationSourceFiles(manifest.assets, root, {
        cloudFallback: true,
      }),
      /ANIMATION_SOURCE_BUNDLE_OBSERVATION_OPTION_UNKNOWN/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
