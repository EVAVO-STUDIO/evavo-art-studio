import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  PROJECT_ART_ATLAS_PLAN_SCHEMA,
  PROJECT_ART_ATLAS_REQUEST_SCHEMA,
  SHA256,
  absolutePath,
  booleanValue,
  canonicalJson,
  fail,
  integer,
  isObject,
  requiredString,
  safeId,
  secureFile,
  sha256,
  sha256File,
  validateTimestamp,
} from "./atlas-contract.mjs";

export {
  PROJECT_ART_ATLAS_PLAN_SCHEMA,
  PROJECT_ART_ATLAS_RECEIPT_SCHEMA,
  PROJECT_ART_ATLAS_REQUEST_SCHEMA,
  canonicalJson,
  sha256,
} from "./atlas-contract.mjs";

export async function compileProjectArtAtlas(
  request,
  { compiledAt = new Date().toISOString() } = {},
) {
  if (!isObject(request) || request.schema !== PROJECT_ART_ATLAS_REQUEST_SCHEMA) {
    fail(`Request must use ${PROJECT_ART_ATLAS_REQUEST_SCHEMA}.`);
  }
  const atlasId = safeId(request.atlasId, "atlasId");
  const projectId = safeId(request.projectId, "projectId");
  const outputName = requiredString(request.outputName ?? atlasId, "outputName", 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(outputName)) {
    fail("outputName must be portable.");
  }
  if (
    !Array.isArray(request.allowedSourceRoots) ||
    request.allowedSourceRoots.length < 1 ||
    request.allowedSourceRoots.length > 32
  ) {
    fail("allowedSourceRoots must contain 1 to 32 directories.");
  }
  const allowedRoots = [];
  for (const [index, value] of request.allowedSourceRoots.entries()) {
    const root = absolutePath(value, `allowedSourceRoots[${index}]`);
    const info = await lstat(root).catch(() => null);
    if (!info?.isDirectory() || info.isSymbolicLink()) {
      fail(`allowedSourceRoots[${index}] must be an existing non-symbolic directory.`);
    }
    allowedRoots.push(await realpath(root));
  }
  const uniqueRoots = [...new Set(allowedRoots)].sort((a, b) => a.localeCompare(b));
  if (
    !Array.isArray(request.frames) ||
    request.frames.length < 1 ||
    request.frames.length > 20_000
  ) {
    fail("frames must contain 1 to 20000 entries.");
  }
  const seen = new Set();
  const frames = [];
  for (const [index, input] of request.frames.entries()) {
    const label = `frames[${index}]`;
    if (!isObject(input)) fail(`${label} must be an object.`);
    const id = safeId(input.id, `${label}.id`);
    if (seen.has(id)) fail(`Duplicate frame id: ${id}.`);
    seen.add(id);
    const sourcePath = absolutePath(input.sourcePath, `${label}.sourcePath`);
    const verified = await secureFile(sourcePath, uniqueRoots, `${label}.sourcePath`);
    const contentSha256 = await sha256File(verified.resolved);
    if (input.expectedSha256 !== undefined) {
      const expected = requiredString(input.expectedSha256, `${label}.expectedSha256`, 64);
      if (!SHA256.test(expected) || expected !== contentSha256) {
        fail(`${label}.expectedSha256 differs from current bytes.`);
      }
    }
    if (
      input.expectedBytes !== undefined &&
      (!Number.isSafeInteger(input.expectedBytes) || input.expectedBytes !== verified.size)
    ) {
      fail(`${label}.expectedBytes differs from current bytes.`);
    }
    const pivot = isObject(input.pivot)
      ? {
          x: Number(input.pivot.x),
          y: Number(input.pivot.y),
        }
      : { x: 0.5, y: 0.5 };
    if (
      !Number.isFinite(pivot.x) ||
      !Number.isFinite(pivot.y) ||
      pivot.x < 0 ||
      pivot.x > 1 ||
      pivot.y < 0 ||
      pivot.y > 1
    ) {
      fail(`${label}.pivot values must be between 0 and 1.`);
    }
    frames.push({
      id,
      sourcePath: verified.resolved,
      contentSha256,
      sizeBytes: verified.size,
      pivot,
      tags: Array.isArray(input.tags)
        ? [...new Set(input.tags.map((tag, tagIndex) => requiredString(tag, `${label}.tags[${tagIndex}]`, 256)))].sort()
        : [],
    });
  }
  frames.sort((left, right) => left.id.localeCompare(right.id));
  const options = isObject(request.options) ? request.options : {};
  const alphaPolicy = options.alphaPolicy ?? "required";
  if (!new Set(["required", "preferred", "opaque"]).has(alphaPolicy)) {
    fail("options.alphaPolicy must be required, preferred or opaque.");
  }
  const alphaThreshold = integer(
    options.alphaThreshold,
    0,
    0,
    254,
    "options.alphaThreshold",
  );
  const body = {
    schema: PROJECT_ART_ATLAS_PLAN_SCHEMA,
    requestSchema: PROJECT_ART_ATLAS_REQUEST_SCHEMA,
    atlasId,
    projectId,
    outputName,
    compiledAt: validateTimestamp(compiledAt, "compiledAt"),
    allowedSourceRoots: uniqueRoots,
    frames,
    options: {
      alphaPolicy,
      trimAlpha: booleanValue(options.trimAlpha, true, "options.trimAlpha"),
      alphaThreshold,
      transparentRgbBleed: booleanValue(
        options.transparentRgbBleed,
        true,
        "options.transparentRgbBleed",
      ),
      transparentRgbBleedRadius: integer(
        options.transparentRgbBleedRadius,
        8,
        0,
        64,
        "options.transparentRgbBleedRadius",
      ),
      transparentRgbAlphaThreshold: integer(
        options.transparentRgbAlphaThreshold,
        alphaThreshold,
        0,
        254,
        "options.transparentRgbAlphaThreshold",
      ),
      padding: integer(options.padding, 2, 0, 128, "options.padding"),
      margin: integer(options.margin, 2, 0, 128, "options.margin"),
      extrude: integer(options.extrude, 1, 0, 32, "options.extrude"),
      powerOfTwo: booleanValue(options.powerOfTwo, true, "options.powerOfTwo"),
      square: booleanValue(options.square, false, "options.square"),
      allowRotation: booleanValue(options.allowRotation, false, "options.allowRotation"),
      maximumWidth: integer(options.maximumWidth, 4096, 16, 16384, "options.maximumWidth"),
      maximumHeight: integer(options.maximumHeight, 4096, 16, 16384, "options.maximumHeight"),
      outputFormat: "png",
      metadataFormats: ["evavo", "texturepacker-json-hash", "phaser-json-hash", "godot-region-map"],
    },
    outputFiles: {
      image: `${outputName}.png`,
      manifest: `${outputName}.atlas.json`,
      texturePacker: `${outputName}.texturepacker.json`,
      phaser: `${outputName}.phaser.json`,
      godot: `${outputName}.godot.json`,
      receipt: `${outputName}.receipt.json`,
    },
    limits: {
      maximumFrames: 20_000,
      maximumSourceBytes: 512 * 1024 * 1024,
      maximumTotalBytes: 16 * 1024 * 1024 * 1024,
      maximumDecodedPixelsPerFrame: 220_000_000,
    },
    authority: {
      sourceRead: true,
      atlasWrite: true,
      sourceMutation: false,
      sourceDeletion: false,
      repositoryMutation: false,
      storageWrite: false,
      providerExecution: false,
      candidateApproval: false,
      candidatePromotion: false,
      deployment: false,
      publication: false,
      forcePush: false,
    },
    createOnlyOutput: true,
    atomicPublication: true,
    bytesFlowThroughMcp: false,
  };
  if (frames.some((frame) => frame.sizeBytes > body.limits.maximumSourceBytes)) {
    fail("At least one frame exceeds the per-frame byte limit.");
  }
  const totalBytes = frames.reduce((sum, frame) => sum + frame.sizeBytes, 0);
  if (totalBytes > body.limits.maximumTotalBytes) fail("Atlas source bytes exceed the batch limit.");
  return Object.freeze({ ...body, planSha256: sha256(canonicalJson(body)) });
}

export async function compileProjectArtAtlasFile(requestPath, outputPath, options = {}) {
  const request = JSON.parse(await readFile(path.resolve(requestPath), "utf8"));
  const plan = await compileProjectArtAtlas(request, options);
  await writeFile(path.resolve(outputPath), `${JSON.stringify(plan, null, 2)}\n`, {
    flag: "wx",
  });
  return plan;
}
