import { createHash } from "node:crypto";

export const COUNCIL_PROCEDURAL_REVIEW_ATLAS_MANIFEST_VERSION =
  "evavo.project-art-council-avatar-procedural-review-atlas-manifest.v1";
export const COUNCIL_PROCEDURAL_REVIEW_ATLAS_CLIP_VERSION =
  "evavo.project-art-council-avatar-procedural-review-atlas-clip.v1";
export const COUNCIL_PROCEDURAL_REVIEW_RUNTIME_VERSION =
  "evavo_council_procedural_review_runtime_v1";

export const COUNCIL_PROCEDURAL_REVIEW_CHARACTERS = Object.freeze([
  Object.freeze({
    characterId: "top-hat-man",
    displayName: "Top Hat Man",
    seatId: "architect",
    canonicalSeat: true,
    previewOnly: false,
    expectedPivotY: 337.5,
  }),
  Object.freeze({
    characterId: "eva-female",
    displayName: "EVA",
    seatId: "researcher",
    canonicalSeat: true,
    previewOnly: false,
    expectedPivotY: 334.25,
  }),
  Object.freeze({
    characterId: "council-critic",
    displayName: "Veyra",
    seatId: "critic",
    canonicalSeat: true,
    previewOnly: false,
    expectedPivotY: 342.5,
  }),
  Object.freeze({
    characterId: "council-open-reviewer",
    displayName: "Moro Pell",
    seatId: "open-reviewer",
    canonicalSeat: true,
    previewOnly: false,
    expectedPivotY: 335,
  }),
  Object.freeze({
    characterId: "nymm-guest-arbiter",
    displayName: "Nymm",
    seatId: null,
    canonicalSeat: false,
    previewOnly: true,
    expectedPivotY: 341.25,
  }),
]);

export const COUNCIL_PROCEDURAL_REVIEW_EXPECTED_CLIPS = Object.freeze([
  Object.freeze({
    characterId: "top-hat-man",
    clipId: "idle-primary",
    frameCount: 120,
  }),
  Object.freeze({
    characterId: "eva-female",
    clipId: "idle-primary",
    frameCount: 120,
  }),
  Object.freeze({
    characterId: "council-critic",
    clipId: "idle-primary",
    frameCount: 120,
  }),
  Object.freeze({
    characterId: "council-open-reviewer",
    clipId: "idle-primary",
    frameCount: 120,
  }),
  Object.freeze({
    characterId: "nymm-guest-arbiter",
    clipId: "idle-primary",
    frameCount: 120,
  }),
  Object.freeze({
    characterId: "eva-female",
    clipId: "run-loop",
    frameCount: 36,
  }),
]);

const CHARACTER_BY_ID = new Map(
  COUNCIL_PROCEDURAL_REVIEW_CHARACTERS.map((character) => [
    character.characterId,
    character,
  ]),
);
const CLIP_KEYS = Object.freeze(
  COUNCIL_PROCEDURAL_REVIEW_EXPECTED_CLIPS.map(
    (clip) => `${clip.characterId}:${clip.clipId}`,
  ),
);
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_PATH_SEGMENT = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const MANIFEST_INDEX = new WeakMap();
const AUTHORITY_KEYS = Object.freeze([
  "providerExecution",
  "creativeApproval",
  "identityApproval",
  "candidatePromotion",
  "productionAdmission",
  "publication",
  "runtimeActivation",
  "websiteActivation",
  "deployment",
]);

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function record(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function exactKeys(value, expectedKeys, code) {
  record(value, code);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(code);
  }
}

function safeInteger(value, minimum, maximum, label) {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail("EVAVO_COUNCIL_REVIEW_ATLAS_NUMBER_INVALID", `${label} is invalid.`);
  }
  return value;
}

function finiteNumber(value, minimum, maximum, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail("EVAVO_COUNCIL_REVIEW_ATLAS_NUMBER_INVALID", `${label} is invalid.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function closeTo(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) {
    fail(
      "EVAVO_COUNCIL_REVIEW_ATLAS_NUMBER_INVALID",
      `${label} must equal ${expected}.`,
    );
  }
  return expected;
}

function digest(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail("EVAVO_COUNCIL_REVIEW_ATLAS_SHA256_INVALID", `${label} is invalid.`);
  }
  return value;
}

function safeRelativePath(value, label) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 1024 ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.startsWith("/") ||
    value.startsWith("../") ||
    value.includes("/../") ||
    value.includes("//") ||
    /^[A-Za-z]:/u.test(value)
  ) {
    fail("EVAVO_COUNCIL_REVIEW_ATLAS_PATH_INVALID", `${label} is invalid.`);
  }
  const segments = value.split("/");
  if (
    segments.some(
      (segment) =>
        !SAFE_PATH_SEGMENT.test(segment) || segment === "." || segment === "..",
    )
  ) {
    fail("EVAVO_COUNCIL_REVIEW_ATLAS_PATH_INVALID", `${label} is invalid.`);
  }
  return value;
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function parseAuthority(value) {
  exactKeys(value, AUTHORITY_KEYS, "EVAVO_COUNCIL_REVIEW_ATLAS_AUTHORITY_INVALID");
  for (const key of AUTHORITY_KEYS) {
    if (value[key] !== false) {
      fail(
        "EVAVO_COUNCIL_REVIEW_ATLAS_AUTHORITY_INVALID",
        `authority.${key} must remain false.`,
      );
    }
  }
  return Object.fromEntries(AUTHORITY_KEYS.map((key) => [key, false]));
}

function parseCanvas(value, expectedWidth, expectedHeight, label) {
  exactKeys(value, ["width", "height"], "EVAVO_COUNCIL_REVIEW_ATLAS_CANVAS_INVALID");
  if (value.width !== expectedWidth || value.height !== expectedHeight) {
    fail(
      "EVAVO_COUNCIL_REVIEW_ATLAS_CANVAS_INVALID",
      `${label} must be ${expectedWidth}x${expectedHeight}.`,
    );
  }
  return { width: expectedWidth, height: expectedHeight };
}

function parseRect(value, canvas, label, allowOrigin = true) {
  exactKeys(value, ["x", "y", "width", "height"], "EVAVO_COUNCIL_REVIEW_ATLAS_RECT_INVALID");
  const x = safeInteger(value.x, allowOrigin ? 0 : 1, canvas.width - 1, `${label}.x`);
  const y = safeInteger(value.y, allowOrigin ? 0 : 1, canvas.height - 1, `${label}.y`);
  const width = safeInteger(value.width, 1, canvas.width, `${label}.width`);
  const height = safeInteger(value.height, 1, canvas.height, `${label}.height`);
  if (x + width > canvas.width || y + height > canvas.height) {
    fail("EVAVO_COUNCIL_REVIEW_ATLAS_RECT_INVALID", `${label} exceeds its canvas.`);
  }
  return { x, y, width, height };
}

function rectanglesOverlap(left, right) {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

function parsePage(value, expectedPage, expectedPath) {
  exactKeys(
    value,
    ["page", "path", "width", "height", "sha256"],
    "EVAVO_COUNCIL_REVIEW_ATLAS_PAGE_INVALID",
  );
  if (
    value.page !== expectedPage ||
    value.width !== 2048 ||
    value.height !== 2048 ||
    safeRelativePath(value.path, "page.path") !== expectedPath
  ) {
    fail("EVAVO_COUNCIL_REVIEW_ATLAS_PAGE_INVALID");
  }
  return {
    page: expectedPage,
    path: expectedPath,
    width: 2048,
    height: 2048,
    sha256: digest(value.sha256, "page.sha256"),
  };
}

function parseFrame(value, context) {
  exactKeys(
    value,
    [
      "frameIndex",
      "phase",
      "durationMs",
      "sourceSize",
      "sourceRect",
      "drawOffset",
      "pivot",
      "trimmedPixelSha256",
      "page",
      "atlasRect",
    ],
    "EVAVO_COUNCIL_REVIEW_ATLAS_FRAME_INVALID",
  );
  const frameIndex = safeInteger(
    value.frameIndex,
    0,
    context.frameCount - 1,
    "frame.frameIndex",
  );
  if (frameIndex !== context.expectedFrameIndex) {
    fail("EVAVO_COUNCIL_REVIEW_ATLAS_FRAME_ORDER_INVALID");
  }
  const phase = finiteNumber(value.phase, 0, 1, "frame.phase");
  closeTo(phase, frameIndex / context.frameCount, 1e-12, "frame.phase");
  const durationMs = finiteNumber(value.durationMs, 1, 1000, "frame.durationMs");
  closeTo(durationMs, 1000 / 30, 1e-9, "frame.durationMs");
  const sourceSize = parseCanvas(value.sourceSize, 256, 384, "frame.sourceSize");
  const sourceRect = parseRect(
    value.sourceRect,
    sourceSize,
    "frame.sourceRect",
  );
  exactKeys(
    value.drawOffset,
    ["x", "y"],
    "EVAVO_COUNCIL_REVIEW_ATLAS_DRAW_OFFSET_INVALID",
  );
  if (
    value.drawOffset.x !== sourceRect.x ||
    value.drawOffset.y !== sourceRect.y
  ) {
    fail("EVAVO_COUNCIL_REVIEW_ATLAS_DRAW_OFFSET_INVALID");
  }
  exactKeys(value.pivot, ["x", "y"], "EVAVO_COUNCIL_REVIEW_ATLAS_PIVOT_INVALID");
  const pivotX = finiteNumber(value.pivot.x, 0, 256, "frame.pivot.x");
  const pivotY = finiteNumber(value.pivot.y, 0, 384, "frame.pivot.y");
  closeTo(pivotX, 128, 1e-9, "frame.pivot.x");
  closeTo(pivotY, context.expectedPivotY, 1e-9, "frame.pivot.y");
  const page = safeInteger(value.page, 0, context.pageCount - 1, "frame.page");
  const atlasRect = parseRect(
    value.atlasRect,
    { width: 2048, height: 2048 },
    "frame.atlasRect",
  );
  if (
    atlasRect.x < 4 ||
    atlasRect.y < 4 ||
    atlasRect.x + atlasRect.width > 2044 ||
    atlasRect.y + atlasRect.height > 2044 ||
    atlasRect.width !== sourceRect.width ||
    atlasRect.height !== sourceRect.height
  ) {
    fail("EVAVO_COUNCIL_REVIEW_ATLAS_RECT_INVALID");
  }
  return {
    frameIndex,
    phase: frameIndex / context.frameCount,
    durationMs: 1000 / 30,
    sourceSize,
    sourceRect,
    drawOffset: { x: sourceRect.x, y: sourceRect.y },
    pivot: { x: 128, y: context.expectedPivotY },
    trimmedPixelSha256: digest(
      value.trimmedPixelSha256,
      "frame.trimmedPixelSha256",
    ),
    page,
    atlasRect,
  };
}

function parseClip(value, expected, expectedIndex) {
  exactKeys(
    value,
    [
      "schema",
      "characterId",
      "clipId",
      "status",
      "fps",
      "frameCount",
      "loop",
      "sourceCanvas",
      "atlasFrameCanvas",
      "pageSize",
      "padding",
      "rotationAllowed",
      "trimmed",
      "stableBottomCentrePivot",
      "pages",
      "frames",
      "authority",
      "metadataPath",
      "metadataSha256",
    ],
    "EVAVO_COUNCIL_REVIEW_ATLAS_CLIP_INVALID",
  );
  const character = CHARACTER_BY_ID.get(expected.characterId);
  if (
    !character ||
    value.schema !== COUNCIL_PROCEDURAL_REVIEW_ATLAS_CLIP_VERSION ||
    value.characterId !== expected.characterId ||
    value.clipId !== expected.clipId ||
    value.status !== "procedural-review-atlas-not-production-approved" ||
    value.fps !== 30 ||
    value.frameCount !== expected.frameCount ||
    value.loop !== true ||
    value.padding !== 4 ||
    value.rotationAllowed !== false ||
    value.trimmed !== true ||
    value.stableBottomCentrePivot !== true
  ) {
    fail("EVAVO_COUNCIL_REVIEW_ATLAS_CLIP_PROFILE_INVALID");
  }
  const sourceCanvas = parseCanvas(value.sourceCanvas, 1024, 1536, "sourceCanvas");
  const atlasFrameCanvas = parseCanvas(
    value.atlasFrameCanvas,
    256,
    384,
    "atlasFrameCanvas",
  );
  const pageSize = parseCanvas(value.pageSize, 2048, 2048, "pageSize");
  if (!Array.isArray(value.pages) || value.pages.length < 1 || value.pages.length > 32) {
    fail("EVAVO_COUNCIL_REVIEW_ATLAS_PAGES_INVALID");
  }
  const pages = value.pages.map((page, pageIndex) =>
    parsePage(
      page,
      pageIndex,
      `${expected.characterId}/${expected.clipId}/page-${String(pageIndex).padStart(2, "0")}.png`,
    ),
  );
  if (!Array.isArray(value.frames) || value.frames.length !== expected.frameCount) {
    fail("EVAVO_COUNCIL_REVIEW_ATLAS_FRAMES_INVALID");
  }
  const frames = value.frames.map((frame, frameIndex) =>
    parseFrame(frame, {
      expectedFrameIndex: frameIndex,
      frameCount: expected.frameCount,
      pageCount: pages.length,
      expectedPivotY: character.expectedPivotY,
    }),
  );
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const pageFrames = frames.filter((frame) => frame.page === pageIndex);
    if (pageFrames.length === 0) {
      fail("EVAVO_COUNCIL_REVIEW_ATLAS_EMPTY_PAGE_INVALID");
    }
    for (let leftIndex = 0; leftIndex < pageFrames.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < pageFrames.length;
        rightIndex += 1
      ) {
        if (
          rectanglesOverlap(
            pageFrames[leftIndex].atlasRect,
            pageFrames[rightIndex].atlasRect,
          )
        ) {
          fail("EVAVO_COUNCIL_REVIEW_ATLAS_FRAME_OVERLAP");
        }
      }
    }
  }
  const metadataPath = safeRelativePath(value.metadataPath, "metadataPath");
  const expectedMetadataPath = `${expected.characterId}/${expected.clipId}/atlas.json`;
  if (metadataPath !== expectedMetadataPath) {
    fail("EVAVO_COUNCIL_REVIEW_ATLAS_METADATA_PATH_INVALID");
  }
  const authority = parseAuthority(value.authority);
  return {
    schema: COUNCIL_PROCEDURAL_REVIEW_ATLAS_CLIP_VERSION,
    characterId: expected.characterId,
    displayName: character.displayName,
    seatId: character.seatId,
    canonicalSeat: character.canonicalSeat,
    previewOnly: character.previewOnly,
    clipId: expected.clipId,
    status: "procedural-review-atlas-not-production-approved",
    fps: 30,
    frameCount: expected.frameCount,
    loop: true,
    sourceCanvas,
    atlasFrameCanvas,
    pageSize,
    padding: 4,
    rotationAllowed: false,
    trimmed: true,
    stableBottomCentrePivot: true,
    pages,
    frames,
    authority,
    metadataPath,
    metadataSha256: digest(value.metadataSha256, "metadataSha256"),
    manifestIndex: expectedIndex,
  };
}

function indexManifest(parsed) {
  const clips = new Map();
  for (const clip of parsed.clips) {
    clips.set(`${clip.characterId}:${clip.clipId}`, clip);
  }
  MANIFEST_INDEX.set(parsed, clips);
}

export function parseCouncilProceduralReviewAtlasManifest(value) {
  if (MANIFEST_INDEX.has(value)) return value;
  exactKeys(
    value,
    ["schema", "status", "clips", "summary", "authority"],
    "EVAVO_COUNCIL_REVIEW_ATLAS_MANIFEST_INVALID",
  );
  if (
    value.schema !== COUNCIL_PROCEDURAL_REVIEW_ATLAS_MANIFEST_VERSION ||
    value.status !==
      "procedural-review-atlases-verified-not-production-approved" ||
    !Array.isArray(value.clips) ||
    value.clips.length !== COUNCIL_PROCEDURAL_REVIEW_EXPECTED_CLIPS.length
  ) {
    fail("EVAVO_COUNCIL_REVIEW_ATLAS_MANIFEST_PROFILE_INVALID");
  }
  const clips = value.clips.map((clip, index) =>
    parseClip(clip, COUNCIL_PROCEDURAL_REVIEW_EXPECTED_CLIPS[index], index),
  );
  const actualKeys = clips.map((clip) => `${clip.characterId}:${clip.clipId}`);
  if (actualKeys.some((key, index) => key !== CLIP_KEYS[index])) {
    fail("EVAVO_COUNCIL_REVIEW_ATLAS_CLIP_ORDER_INVALID");
  }
  exactKeys(
    value.summary,
    ["clipCount", "frameCount", "pageCount"],
    "EVAVO_COUNCIL_REVIEW_ATLAS_SUMMARY_INVALID",
  );
  const frameCount = clips.reduce((sum, clip) => sum + clip.frameCount, 0);
  const pageCount = clips.reduce((sum, clip) => sum + clip.pages.length, 0);
  if (
    value.summary.clipCount !== clips.length ||
    value.summary.frameCount !== frameCount ||
    value.summary.pageCount !== pageCount ||
    clips.length !== 6 ||
    frameCount !== 636
  ) {
    fail("EVAVO_COUNCIL_REVIEW_ATLAS_SUMMARY_INVALID");
  }
  const parsed = freeze({
    schema: COUNCIL_PROCEDURAL_REVIEW_ATLAS_MANIFEST_VERSION,
    runtimeVersion: COUNCIL_PROCEDURAL_REVIEW_RUNTIME_VERSION,
    status: "procedural-review-atlases-verified-not-production-approved",
    clips,
    summary: { clipCount: 6, frameCount: 636, pageCount },
    characters: COUNCIL_PROCEDURAL_REVIEW_CHARACTERS,
    productionEligibility: Object.freeze({
      identityMasterCandidate: false,
      assetPackCandidate: false,
      productionAnimation: false,
      runtimeActivation: false,
      websiteActivation: false,
    }),
    fileVerification: Object.freeze({
      pageBytesVerified: false,
      metadataBytesVerified: false,
    }),
    authority: parseAuthority(value.authority),
  });
  indexManifest(parsed);
  return parsed;
}

function clipFromManifest(manifest, characterId, clipId) {
  const parsed = MANIFEST_INDEX.has(manifest)
    ? manifest
    : parseCouncilProceduralReviewAtlasManifest(manifest);
  const key = `${characterId}:${clipId}`;
  const clip = MANIFEST_INDEX.get(parsed)?.get(key);
  if (!clip) fail("EVAVO_COUNCIL_REVIEW_ATLAS_CLIP_UNKNOWN");
  return { parsed, clip };
}

export function resolveCouncilProceduralReviewFrame(
  manifest,
  { characterId, clipId = "idle-primary", frameIndex = 0 } = {},
) {
  const { parsed, clip } = clipFromManifest(manifest, characterId, clipId);
  const index = safeInteger(
    frameIndex,
    0,
    clip.frameCount - 1,
    "frameIndex",
  );
  const frame = clip.frames[index];
  const page = clip.pages[frame.page];
  return freeze({
    runtimeVersion: parsed.runtimeVersion,
    reviewOnly: true,
    productionEligible: false,
    characterId: clip.characterId,
    displayName: clip.displayName,
    seatId: clip.seatId,
    canonicalSeat: clip.canonicalSeat,
    previewOnly: clip.previewOnly,
    clipId: clip.clipId,
    fps: clip.fps,
    frameIndex: frame.frameIndex,
    phase: frame.phase,
    durationMs: frame.durationMs,
    atlasPageIndex: page.page,
    atlasPagePath: page.path,
    atlasPageSha256: page.sha256,
    atlasSourceRect: { ...frame.atlasRect },
    destinationRect: { ...frame.sourceRect },
    drawOffset: { ...frame.drawOffset },
    pivot: { ...frame.pivot },
    frameCanvas: { ...clip.atlasFrameCanvas },
    trimmedPixelSha256: frame.trimmedPixelSha256,
    authority: { ...parsed.authority },
  });
}

export function sampleCouncilProceduralReviewFrame(
  manifest,
  {
    characterId,
    clipId = "idle-primary",
    elapsedMs = 0,
    playbackRate = 1,
    reducedMotion = false,
  } = {},
) {
  const { clip } = clipFromManifest(manifest, characterId, clipId);
  const elapsed = finiteNumber(elapsedMs, 0, Number.MAX_SAFE_INTEGER, "elapsedMs");
  const rate = finiteNumber(playbackRate, 0.01, 8, "playbackRate");
  const frameIndex = reducedMotion
    ? 0
    : Math.floor((elapsed * rate) / (1000 / clip.fps)) % clip.frameCount;
  return resolveCouncilProceduralReviewFrame(manifest, {
    characterId,
    clipId,
    frameIndex,
  });
}

export function createCouncilProceduralReviewPlayer(
  manifestValue,
  {
    characterId,
    clipId = "idle-primary",
    playbackRate = 1,
    reducedMotion = false,
  } = {},
) {
  const manifest = MANIFEST_INDEX.has(manifestValue)
    ? manifestValue
    : parseCouncilProceduralReviewAtlasManifest(manifestValue);
  let selectedCharacterId = characterId;
  let selectedClipId = clipId;
  let selectedRate = finiteNumber(playbackRate, 0.01, 8, "playbackRate");
  let selectedReducedMotion = Boolean(reducedMotion);
  let startedAtMs = 0;
  clipFromManifest(manifest, selectedCharacterId, selectedClipId);

  const player = Object.freeze({
    manifest,
    sample(nowMs = 0) {
      const now = finiteNumber(nowMs, 0, Number.MAX_SAFE_INTEGER, "nowMs");
      return sampleCouncilProceduralReviewFrame(manifest, {
        characterId: selectedCharacterId,
        clipId: selectedClipId,
        elapsedMs: Math.max(0, now - startedAtMs),
        playbackRate: selectedRate,
        reducedMotion: selectedReducedMotion,
      });
    },
    setClip(nextCharacterId, nextClipId = "idle-primary", nowMs = 0) {
      clipFromManifest(manifest, nextCharacterId, nextClipId);
      selectedCharacterId = nextCharacterId;
      selectedClipId = nextClipId;
      startedAtMs = finiteNumber(nowMs, 0, Number.MAX_SAFE_INTEGER, "nowMs");
      return player.snapshot();
    },
    setPlaybackRate(nextRate) {
      selectedRate = finiteNumber(nextRate, 0.01, 8, "playbackRate");
      return player.snapshot();
    },
    setReducedMotion(value) {
      selectedReducedMotion = Boolean(value);
      return player.snapshot();
    },
    reset(nowMs = 0) {
      startedAtMs = finiteNumber(nowMs, 0, Number.MAX_SAFE_INTEGER, "nowMs");
      return player.snapshot();
    },
    snapshot() {
      return freeze({
        runtimeVersion: COUNCIL_PROCEDURAL_REVIEW_RUNTIME_VERSION,
        reviewOnly: true,
        productionEligible: false,
        characterId: selectedCharacterId,
        clipId: selectedClipId,
        playbackRate: selectedRate,
        reducedMotion: selectedReducedMotion,
        startedAtMs,
      });
    },
  });
  return player;
}

function bytes(value, label, maximumBytes) {
  let result;
  if (value instanceof Uint8Array) result = value;
  else if (value instanceof ArrayBuffer) result = new Uint8Array(value);
  else fail("EVAVO_COUNCIL_REVIEW_ATLAS_FILE_BYTES_INVALID", `${label} is invalid.`);
  if (result.byteLength < 1 || result.byteLength > maximumBytes) {
    fail("EVAVO_COUNCIL_REVIEW_ATLAS_FILE_BYTES_INVALID", `${label} is invalid.`);
  }
  return result;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function inspectPngHeader(value, label) {
  const file = bytes(value, label, 64 * 1024 * 1024);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    file.byteLength < 24 ||
    signature.some((byte, index) => file[index] !== byte) ||
    String.fromCharCode(...file.slice(12, 16)) !== "IHDR"
  ) {
    fail("EVAVO_COUNCIL_REVIEW_ATLAS_PNG_INVALID", `${label} is not PNG.`);
  }
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width !== 2048 || height !== 2048) {
    fail("EVAVO_COUNCIL_REVIEW_ATLAS_PNG_INVALID", `${label} has wrong canvas.`);
  }
  return file;
}

export async function verifyCouncilProceduralReviewAtlasFiles(
  manifestValue,
  loadFile,
) {
  if (typeof loadFile !== "function") {
    fail("EVAVO_COUNCIL_REVIEW_ATLAS_LOADER_INVALID");
  }
  const manifest = MANIFEST_INDEX.has(manifestValue)
    ? manifestValue
    : parseCouncilProceduralReviewAtlasManifest(manifestValue);
  let pageFileCount = 0;
  let metadataFileCount = 0;
  let totalBytes = 0;
  for (const clip of manifest.clips) {
    for (const page of clip.pages) {
      const loaded = inspectPngHeader(
        await loadFile(page.path),
        page.path,
      );
      if (sha256(loaded) !== page.sha256) {
        fail("EVAVO_COUNCIL_REVIEW_ATLAS_FILE_HASH_MISMATCH", page.path);
      }
      pageFileCount += 1;
      totalBytes += loaded.byteLength;
    }
    const metadataBytes = bytes(
      await loadFile(clip.metadataPath),
      clip.metadataPath,
      16 * 1024 * 1024,
    );
    if (sha256(metadataBytes) !== clip.metadataSha256) {
      fail(
        "EVAVO_COUNCIL_REVIEW_ATLAS_FILE_HASH_MISMATCH",
        clip.metadataPath,
      );
    }
    let metadata;
    try {
      metadata = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(metadataBytes));
    } catch {
      fail("EVAVO_COUNCIL_REVIEW_ATLAS_METADATA_INVALID", clip.metadataPath);
    }
    const comparable = { ...clip };
    delete comparable.displayName;
    delete comparable.seatId;
    delete comparable.canonicalSeat;
    delete comparable.previewOnly;
    delete comparable.metadataPath;
    delete comparable.metadataSha256;
    delete comparable.manifestIndex;
    if (JSON.stringify(metadata) !== JSON.stringify(comparable)) {
      fail("EVAVO_COUNCIL_REVIEW_ATLAS_METADATA_INVALID", clip.metadataPath);
    }
    metadataFileCount += 1;
    totalBytes += metadataBytes.byteLength;
  }
  return freeze({
    runtimeVersion: COUNCIL_PROCEDURAL_REVIEW_RUNTIME_VERSION,
    status: "review-files-verified-not-production-approved",
    pageFileCount,
    metadataFileCount,
    totalFileCount: pageFileCount + metadataFileCount,
    totalBytes,
    pageBytesVerified: true,
    metadataBytesVerified: true,
    allDeclaredSha256ValuesVerified: true,
    productionEligible: false,
    runtimeActivationAllowed: false,
    websiteActivationAllowed: false,
    authority: { ...manifest.authority },
  });
}

export function councilProceduralReviewRuntimeCapabilities() {
  return freeze({
    runtimeVersion: COUNCIL_PROCEDURAL_REVIEW_RUNTIME_VERSION,
    sourceManifestSchema: COUNCIL_PROCEDURAL_REVIEW_ATLAS_MANIFEST_VERSION,
    sourceClipSchema: COUNCIL_PROCEDURAL_REVIEW_ATLAS_CLIP_VERSION,
    characterIds: COUNCIL_PROCEDURAL_REVIEW_CHARACTERS.map(
      (character) => character.characterId,
    ),
    canonicalSeatCount: 4,
    previewOnlyCharacterCount: 1,
    expectedClipCount: 6,
    expectedFrameCount: 636,
    authoredFps: 30,
    frameCanvas: { width: 256, height: 384 },
    pageCanvas: { width: 2048, height: 2048 },
    stableBottomCentrePivotRequired: true,
    exactPageAndMetadataSha256VerificationAvailable: true,
    playerAvailable: true,
    reviewOnly: true,
    identityMasterCandidate: false,
    assetPackCandidate: false,
    productionAnimation: false,
    publication: false,
    runtimeActivation: false,
    websiteActivation: false,
  });
}
