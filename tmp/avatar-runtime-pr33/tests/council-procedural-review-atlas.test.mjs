import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  COUNCIL_PROCEDURAL_REVIEW_CHARACTERS,
  COUNCIL_PROCEDURAL_REVIEW_EXPECTED_CLIPS,
  councilProceduralReviewRuntimeCapabilities,
  createCouncilProceduralReviewPlayer,
  parseCouncilProceduralReviewAtlasManifest,
  resolveCouncilProceduralReviewFrame,
  sampleCouncilProceduralReviewFrame,
  verifyCouncilProceduralReviewAtlasFiles,
} from "../src/council-procedural-review-atlas.js";

const AUTHORITY = Object.freeze({
  providerExecution: false,
  creativeApproval: false,
  identityApproval: false,
  candidatePromotion: false,
  productionAdmission: false,
  publication: false,
  runtimeActivation: false,
  websiteActivation: false,
  deployment: false,
});

const PIVOT_Y = Object.freeze({
  "top-hat-man": 337.5,
  "eva-female": 334.25,
  "council-critic": 342.5,
  "council-open-reviewer": 335,
  "nymm-guest-arbiter": 341.25,
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function pngHeader(width = 2048, height = 2048) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function buildClip(expected, files) {
  const pagePath = `${expected.characterId}/${expected.clipId}/page-00.png`;
  const pageBytes = pngHeader();
  files.set(pagePath, pageBytes);
  const frames = Array.from({ length: expected.frameCount }, (_, frameIndex) => {
    const column = frameIndex % 20;
    const row = Math.floor(frameIndex / 20);
    return {
      frameIndex,
      phase: frameIndex / expected.frameCount,
      durationMs: 1000 / 30,
      sourceSize: { width: 256, height: 384 },
      sourceRect: { x: 100, y: 200, width: 6, height: 6 },
      drawOffset: { x: 100, y: 200 },
      pivot: { x: 128, y: PIVOT_Y[expected.characterId] },
      trimmedPixelSha256: sha256(
        Buffer.from(`${expected.characterId}:${expected.clipId}:${frameIndex}`),
      ),
      page: 0,
      atlasRect: {
        x: 4 + column * 8,
        y: 4 + row * 8,
        width: 6,
        height: 6,
      },
    };
  });
  const raw = {
    schema:
      "evavo.project-art-council-avatar-procedural-review-atlas-clip.v1",
    characterId: expected.characterId,
    clipId: expected.clipId,
    status: "procedural-review-atlas-not-production-approved",
    fps: 30,
    frameCount: expected.frameCount,
    loop: true,
    sourceCanvas: { width: 1024, height: 1536 },
    atlasFrameCanvas: { width: 256, height: 384 },
    pageSize: { width: 2048, height: 2048 },
    padding: 4,
    rotationAllowed: false,
    trimmed: true,
    stableBottomCentrePivot: true,
    pages: [
      {
        page: 0,
        path: pagePath,
        width: 2048,
        height: 2048,
        sha256: sha256(pageBytes),
      },
    ],
    frames,
    authority: { ...AUTHORITY },
  };
  const metadataPath = `${expected.characterId}/${expected.clipId}/atlas.json`;
  const metadataBytes = Buffer.from(`${JSON.stringify(raw, null, 2)}\n`, "utf8");
  files.set(metadataPath, metadataBytes);
  return {
    ...raw,
    metadataPath,
    metadataSha256: sha256(metadataBytes),
  };
}

function fixture() {
  const files = new Map();
  const clips = COUNCIL_PROCEDURAL_REVIEW_EXPECTED_CLIPS.map((expected) =>
    buildClip(expected, files),
  );
  return {
    files,
    manifest: {
      schema:
        "evavo.project-art-council-avatar-procedural-review-atlas-manifest.v1",
      status: "procedural-review-atlases-verified-not-production-approved",
      clips,
      summary: {
        clipCount: 6,
        frameCount: 636,
        pageCount: 6,
      },
      authority: { ...AUTHORITY },
    },
  };
}

test("parses the exact five-character, six-clip, 636-frame review manifest", () => {
  const { manifest } = fixture();
  const parsed = parseCouncilProceduralReviewAtlasManifest(manifest);
  assert.equal(parsed.summary.clipCount, 6);
  assert.equal(parsed.summary.frameCount, 636);
  assert.equal(parsed.summary.pageCount, 6);
  assert.deepEqual(
    parsed.characters.map((character) => [
      character.characterId,
      character.seatId,
      character.canonicalSeat,
      character.previewOnly,
    ]),
    [
      ["top-hat-man", "architect", true, false],
      ["eva-female", "researcher", true, false],
      ["council-critic", "critic", true, false],
      ["council-open-reviewer", "open-reviewer", true, false],
      ["nymm-guest-arbiter", null, false, true],
    ],
  );
  assert.equal(parsed.productionEligibility.identityMasterCandidate, false);
  assert.equal(parsed.productionEligibility.productionAnimation, false);
  assert.equal(parsed.fileVerification.pageBytesVerified, false);
  assert.ok(Object.values(parsed.authority).every((value) => value === false));
});

test("resolves trimmed atlas drawing data around a stable bottom-centre pivot", () => {
  const parsed = parseCouncilProceduralReviewAtlasManifest(fixture().manifest);
  const frame = resolveCouncilProceduralReviewFrame(parsed, {
    characterId: "council-critic",
    clipId: "idle-primary",
    frameIndex: 17,
  });
  assert.equal(frame.reviewOnly, true);
  assert.equal(frame.productionEligible, false);
  assert.equal(frame.displayName, "Veyra");
  assert.equal(frame.seatId, "critic");
  assert.equal(frame.atlasPagePath, "council-critic/idle-primary/page-00.png");
  assert.deepEqual(frame.atlasSourceRect, {
    x: 140,
    y: 4,
    width: 6,
    height: 6,
  });
  assert.deepEqual(frame.destinationRect, {
    x: 100,
    y: 200,
    width: 6,
    height: 6,
  });
  assert.deepEqual(frame.pivot, { x: 128, y: 342.5 });
});

test("samples authored 30 fps motion, loops cleanly and honours reduced motion", () => {
  const parsed = parseCouncilProceduralReviewAtlasManifest(fixture().manifest);
  assert.equal(
    sampleCouncilProceduralReviewFrame(parsed, {
      characterId: "eva-female",
      clipId: "run-loop",
      elapsedMs: 0,
    }).frameIndex,
    0,
  );
  assert.equal(
    sampleCouncilProceduralReviewFrame(parsed, {
      characterId: "eva-female",
      clipId: "run-loop",
      elapsedMs: 1000 / 30 + 0.001,
    }).frameIndex,
    1,
  );
  assert.equal(
    sampleCouncilProceduralReviewFrame(parsed, {
      characterId: "eva-female",
      clipId: "run-loop",
      elapsedMs: 1200,
    }).frameIndex,
    0,
  );
  assert.equal(
    sampleCouncilProceduralReviewFrame(parsed, {
      characterId: "eva-female",
      clipId: "run-loop",
      elapsedMs: 1000,
      reducedMotion: true,
    }).frameIndex,
    0,
  );
});

test("stateful player changes clips without granting production authority", () => {
  const parsed = parseCouncilProceduralReviewAtlasManifest(fixture().manifest);
  const player = createCouncilProceduralReviewPlayer(parsed, {
    characterId: "top-hat-man",
  });
  assert.equal(player.sample(0).characterId, "top-hat-man");
  player.setClip("eva-female", "run-loop", 500);
  assert.equal(player.sample(500).frameIndex, 0);
  assert.equal(player.sample(534).frameIndex, 1);
  player.setReducedMotion(true);
  assert.equal(player.sample(900).frameIndex, 0);
  const snapshot = player.snapshot();
  assert.equal(snapshot.reviewOnly, true);
  assert.equal(snapshot.productionEligible, false);
});

test("verifies exact declared page and metadata bytes when a loader is supplied", async () => {
  const { manifest, files } = fixture();
  const parsed = parseCouncilProceduralReviewAtlasManifest(manifest);
  const result = await verifyCouncilProceduralReviewAtlasFiles(
    parsed,
    async (relativePath) => files.get(relativePath),
  );
  assert.equal(result.pageFileCount, 6);
  assert.equal(result.metadataFileCount, 6);
  assert.equal(result.totalFileCount, 12);
  assert.equal(result.allDeclaredSha256ValuesVerified, true);
  assert.equal(result.productionEligible, false);
  assert.equal(result.runtimeActivationAllowed, false);
  assert.equal(result.websiteActivationAllowed, false);
});

test("manifest parser rejects roster, order, authority, path, pivot and overlap drift", () => {
  const base = fixture().manifest;

  const reordered = structuredClone(base);
  [reordered.clips[0], reordered.clips[1]] = [
    reordered.clips[1],
    reordered.clips[0],
  ];
  assert.throws(
    () => parseCouncilProceduralReviewAtlasManifest(reordered),
    /CLIP_PROFILE_INVALID|CLIP_ORDER_INVALID/u,
  );

  const authority = structuredClone(base);
  authority.authority.runtimeActivation = true;
  assert.throws(
    () => parseCouncilProceduralReviewAtlasManifest(authority),
    /AUTHORITY_INVALID/u,
  );

  const pathTraversal = structuredClone(base);
  pathTraversal.clips[0].pages[0].path = "../page.png";
  assert.throws(
    () => parseCouncilProceduralReviewAtlasManifest(pathTraversal),
    /PATH_INVALID|PAGE_INVALID/u,
  );

  const wrongPivot = structuredClone(base);
  wrongPivot.clips[2].frames[0].pivot.y = 300;
  assert.throws(
    () => parseCouncilProceduralReviewAtlasManifest(wrongPivot),
    /NUMBER_INVALID/u,
  );

  const overlap = structuredClone(base);
  overlap.clips[0].frames[1].atlasRect = {
    ...overlap.clips[0].frames[0].atlasRect,
  };
  assert.throws(
    () => parseCouncilProceduralReviewAtlasManifest(overlap),
    /FRAME_OVERLAP/u,
  );
});

test("file verifier rejects altered page and metadata bytes", async () => {
  const first = fixture();
  const parsed = parseCouncilProceduralReviewAtlasManifest(first.manifest);
  const firstPage = first.manifest.clips[0].pages[0].path;
  const changedPages = new Map(first.files);
  changedPages.set(firstPage, pngHeader(1024, 2048));
  await assert.rejects(
    () =>
      verifyCouncilProceduralReviewAtlasFiles(
        parsed,
        async (relativePath) => changedPages.get(relativePath),
      ),
    /PNG_INVALID|FILE_HASH_MISMATCH/u,
  );

  const second = fixture();
  const secondParsed = parseCouncilProceduralReviewAtlasManifest(second.manifest);
  const metadataPath = second.manifest.clips[0].metadataPath;
  const changedMetadata = new Map(second.files);
  changedMetadata.set(metadataPath, Buffer.from("{}\n"));
  await assert.rejects(
    () =>
      verifyCouncilProceduralReviewAtlasFiles(
        secondParsed,
        async (relativePath) => changedMetadata.get(relativePath),
      ),
    /FILE_HASH_MISMATCH/u,
  );
});

test("unknown clips and production-shaped requests fail closed", () => {
  const parsed = parseCouncilProceduralReviewAtlasManifest(fixture().manifest);
  assert.throws(
    () =>
      resolveCouncilProceduralReviewFrame(parsed, {
        characterId: "nymm-guest-arbiter",
        clipId: "speaking",
      }),
    /CLIP_UNKNOWN/u,
  );
  assert.throws(
    () =>
      createCouncilProceduralReviewPlayer(parsed, {
        characterId: "council-critic",
        clipId: "production-release",
      }),
    /CLIP_UNKNOWN/u,
  );
});

test("capabilities disclose the exact review-only runtime boundary", () => {
  const capabilities = councilProceduralReviewRuntimeCapabilities();
  assert.deepEqual(
    capabilities.characterIds,
    COUNCIL_PROCEDURAL_REVIEW_CHARACTERS.map(
      (character) => character.characterId,
    ),
  );
  assert.equal(capabilities.canonicalSeatCount, 4);
  assert.equal(capabilities.previewOnlyCharacterCount, 1);
  assert.equal(capabilities.expectedClipCount, 6);
  assert.equal(capabilities.expectedFrameCount, 636);
  assert.equal(capabilities.authoredFps, 30);
  assert.equal(capabilities.playerAvailable, true);
  assert.equal(capabilities.reviewOnly, true);
  assert.equal(capabilities.identityMasterCandidate, false);
  assert.equal(capabilities.assetPackCandidate, false);
  assert.equal(capabilities.runtimeActivation, false);
  assert.equal(capabilities.websiteActivation, false);
});
