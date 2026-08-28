import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

export const ANIMATION_SOURCE_BUNDLE_SCHEMA =
  "evavo.animation-source-bundle.v1";
export const ANIMATION_SOURCE_BUNDLE_SCHEMA_SHA256 =
  "b8e355066d1f937acf7d3e60998b38d8a133fcaf719e5f760efc206cbf01bedd";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u;
const SOURCE_REVISION = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,159}$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const ARTIFACT_ID = /^artifact_[0-9a-f]{64}$/u;
const MEDIA_TYPE =
  /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const WINDOWS_FORBIDDEN = /[:*?"<>|]/u;
const WINDOWS_DEVICE =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const ASSET_ROLES = new Set([
  "canonical-identity",
  "direction-master",
  "model-sheet",
  "layout",
  "background",
  "foreground",
  "key-pose",
  "breakdown",
  "inbetween",
  "cel",
  "effects",
  "matte",
  "reference",
]);
const FRAME_ROLES = new Set([
  "key-pose",
  "breakdown",
  "inbetween",
  "cel",
  "effects",
  "matte",
]);
const CADENCES = new Set(["ones", "twos", "threes", "mixed"]);
const LOOP_MODES = new Set(["none", "seamless", "finite-repeat"]);
const ALPHA_MODES = new Set(["straight", "premultiplied", "opaque"]);

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("ANIMATION_SOURCE_BUNDLE_OBJECT_REQUIRED", label);
  }
  return value;
}

function strict(value, allowed, required, label) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      fail("ANIMATION_SOURCE_BUNDLE_UNKNOWN_FIELD", `${label}.${key}`);
    }
  }
  for (const key of required) {
    if (!(key in value)) {
      fail("ANIMATION_SOURCE_BUNDLE_FIELD_REQUIRED", `${label}.${key}`);
    }
  }
}

function text(value, label, options = {}) {
  const minimum = options.minimum ?? 1;
  const maximum = options.maximum ?? 1024;
  if (typeof value !== "string") {
    fail("ANIMATION_SOURCE_BUNDLE_STRING_REQUIRED", label);
  }
  if (
    value.length < minimum ||
    value.length > maximum ||
    CONTROL.test(value) ||
    value.normalize("NFC") !== value
  ) {
    fail("ANIMATION_SOURCE_BUNDLE_STRING_INVALID", label);
  }
  return value;
}

function identifier(value, label) {
  const result = text(value, label, { maximum: 128 });
  if (!IDENTIFIER.test(result)) {
    fail("ANIMATION_SOURCE_BUNDLE_IDENTIFIER_INVALID", label);
  }
  return result;
}

function integer(value, label, minimum, maximum) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail("ANIMATION_SOURCE_BUNDLE_INTEGER_INVALID", label);
  }
  return value;
}

function booleanValue(value, label) {
  if (typeof value !== "boolean") {
    fail("ANIMATION_SOURCE_BUNDLE_BOOLEAN_REQUIRED", label);
  }
  return value;
}

function literal(value, expected, label) {
  if (value !== expected) {
    fail("ANIMATION_SOURCE_BUNDLE_LITERAL_INVALID", label);
  }
  return expected;
}

function enumValue(value, values, label) {
  if (typeof value !== "string" || !values.has(value)) {
    fail("ANIMATION_SOURCE_BUNDLE_ENUM_INVALID", label);
  }
  return value;
}

function sha256(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail("ANIMATION_SOURCE_BUNDLE_SHA256_INVALID", label);
  }
  return value;
}

function timestamp(value, label) {
  const result = text(value, label, { maximum: 32 });
  let canonical;
  try {
    canonical = new Date(result).toISOString();
  } catch {
    fail("ANIMATION_SOURCE_BUNDLE_TIMESTAMP_INVALID", label);
  }
  if (canonical !== result) {
    fail("ANIMATION_SOURCE_BUNDLE_TIMESTAMP_NOT_CANONICAL", label);
  }
  return result;
}

function greatestCommonDivisor(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function rational(
  value,
  label,
  numeratorMaximum,
  denominatorMaximum,
  maximumRatio,
) {
  const input = object(value, label);
  strict(
    input,
    ["numerator", "denominator"],
    ["numerator", "denominator"],
    label,
  );
  const numerator = integer(
    input.numerator,
    `${label}.numerator`,
    1,
    numeratorMaximum,
  );
  const denominator = integer(
    input.denominator,
    `${label}.denominator`,
    1,
    denominatorMaximum,
  );
  if (greatestCommonDivisor(numerator, denominator) !== 1) {
    fail("ANIMATION_SOURCE_BUNDLE_RATIONAL_NOT_REDUCED", label);
  }
  if (
    maximumRatio !== undefined &&
    numerator / denominator > maximumRatio
  ) {
    fail("ANIMATION_SOURCE_BUNDLE_RATIONAL_OUT_OF_RANGE", label);
  }
  return { numerator, denominator };
}

export function assertAnimationSourceBundleRelativePath(value) {
  const result = text(value, "relativePath", { maximum: 1024 });
  if (
    result.startsWith("/") ||
    /^[A-Za-z]:/u.test(result) ||
    result.includes("\\") ||
    result.includes("//")
  ) {
    fail("ANIMATION_SOURCE_BUNDLE_PATH_INVALID", result);
  }
  for (const segment of result.split("/")) {
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      segment.endsWith(".") ||
      segment.endsWith(" ") ||
      WINDOWS_FORBIDDEN.test(segment) ||
      WINDOWS_DEVICE.test(segment)
    ) {
      fail("ANIMATION_SOURCE_BUNDLE_PATH_INVALID", result);
    }
  }
  return result;
}

function mediaType(value, label) {
  const result = text(value, label, { minimum: 3, maximum: 191 });
  if (result !== result.toLowerCase() || !MEDIA_TYPE.test(result)) {
    fail("ANIMATION_SOURCE_BUNDLE_MEDIA_TYPE_INVALID", label);
  }
  return result;
}

function normalizeAsset(value, index) {
  const label = `assets[${index}]`;
  const input = object(value, label);
  strict(
    input,
    [
      "assetId",
      "role",
      "relativePath",
      "mediaType",
      "byteLength",
      "sha256",
      "width",
      "height",
      "frameNumber",
      "layerId",
      "sourceArtifactId",
    ],
    ["assetId", "role", "relativePath", "mediaType", "byteLength", "sha256"],
    label,
  );

  const role = enumValue(input.role, ASSET_ROLES, `${label}.role`);
  const resolvedMediaType = mediaType(input.mediaType, `${label}.mediaType`);
  const width =
    input.width === undefined
      ? undefined
      : integer(input.width, `${label}.width`, 1, 16_384);
  const height =
    input.height === undefined
      ? undefined
      : integer(input.height, `${label}.height`, 1, 16_384);
  if ((width === undefined) !== (height === undefined)) {
    fail("ANIMATION_SOURCE_BUNDLE_DIMENSION_PAIR_REQUIRED", label);
  }
  if (resolvedMediaType.startsWith("image/") && width === undefined) {
    fail("ANIMATION_SOURCE_BUNDLE_IMAGE_DIMENSIONS_REQUIRED", label);
  }

  const frameNumber =
    input.frameNumber === undefined
      ? undefined
      : integer(
          input.frameNumber,
          `${label}.frameNumber`,
          0,
          100_000_000,
        );
  if (FRAME_ROLES.has(role) && frameNumber === undefined) {
    fail("ANIMATION_SOURCE_BUNDLE_FRAME_NUMBER_REQUIRED", label);
  }

  let sourceArtifactId;
  if (input.sourceArtifactId !== undefined) {
    if (
      typeof input.sourceArtifactId !== "string" ||
      !ARTIFACT_ID.test(input.sourceArtifactId)
    ) {
      fail(
        "ANIMATION_SOURCE_BUNDLE_ARTIFACT_ID_INVALID",
        `${label}.sourceArtifactId`,
      );
    }
    sourceArtifactId = input.sourceArtifactId;
  }

  return {
    assetId: identifier(input.assetId, `${label}.assetId`),
    role,
    relativePath: assertAnimationSourceBundleRelativePath(
      input.relativePath,
    ),
    mediaType: resolvedMediaType,
    byteLength: integer(
      input.byteLength,
      `${label}.byteLength`,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    sha256: sha256(input.sha256, `${label}.sha256`),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(frameNumber === undefined ? {} : { frameNumber }),
    ...(input.layerId === undefined
      ? {}
      : {
          layerId: identifier(input.layerId, `${label}.layerId`),
        }),
    ...(sourceArtifactId === undefined ? {} : { sourceArtifactId }),
  };
}

function compareAssets(left, right) {
  const leftFrame = left.frameNumber ?? Number.MAX_SAFE_INTEGER;
  const rightFrame = right.frameNumber ?? Number.MAX_SAFE_INTEGER;
  if (leftFrame !== rightFrame) return leftFrame - rightFrame;

  for (const [leftValue, rightValue] of [
    [left.role, right.role],
    [left.layerId ?? "", right.layerId ?? ""],
    [left.relativePath, right.relativePath],
    [left.assetId, right.assetId],
  ]) {
    const result = leftValue.localeCompare(rightValue);
    if (result !== 0) return result;
  }
  return 0;
}

function normalizeAssets(value, timeline, requireCanonicalOrder) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4096) {
    fail("ANIMATION_SOURCE_BUNDLE_ASSET_COUNT_INVALID");
  }
  const source = value.map(normalizeAsset);
  const assets = [...source].sort(compareAssets);
  if (
    requireCanonicalOrder &&
    JSON.stringify(source) !== JSON.stringify(assets)
  ) {
    fail("ANIMATION_SOURCE_BUNDLE_ASSET_ORDER_NOT_CANONICAL");
  }

  const identifiers = new Set();
  const paths = new Set();
  const frameSlots = new Set();
  for (const asset of assets) {
    if (identifiers.has(asset.assetId)) {
      fail(
        "ANIMATION_SOURCE_BUNDLE_ASSET_ID_DUPLICATE",
        asset.assetId,
      );
    }
    identifiers.add(asset.assetId);

    if (paths.has(asset.relativePath)) {
      fail(
        "ANIMATION_SOURCE_BUNDLE_ASSET_PATH_DUPLICATE",
        asset.relativePath,
      );
    }
    paths.add(asset.relativePath);

    if (
      asset.frameNumber !== undefined &&
      (asset.frameNumber < timeline.startFrame ||
        asset.frameNumber > timeline.endFrame)
    ) {
      fail(
        "ANIMATION_SOURCE_BUNDLE_FRAME_OUTSIDE_TIMELINE",
        asset.assetId,
      );
    }

    if (asset.frameNumber !== undefined) {
      const slot = [
        asset.role,
        asset.layerId ?? "",
        String(asset.frameNumber),
      ].join("\u0000");
      if (frameSlots.has(slot)) {
        fail(
          "ANIMATION_SOURCE_BUNDLE_FRAME_SLOT_DUPLICATE",
          asset.assetId,
        );
      }
      frameSlots.add(slot);
    }
  }
  return assets;
}

function normalizeBody(value, requireCanonicalOrder) {
  const input = object(value, "bundle");
  const fields = [
    "schema",
    "bundleId",
    "createdAt",
    "producer",
    "project",
    "timeline",
    "canvas",
    "creativeIntentSha256",
    "continuitySha256",
    "assets",
    "authority",
  ];
  strict(input, fields, fields, "bundle");
  literal(
    input.schema,
    ANIMATION_SOURCE_BUNDLE_SCHEMA,
    "bundle.schema",
  );

  const producer = object(input.producer, "bundle.producer");
  strict(
    producer,
    ["studio", "version", "sourceRevision"],
    ["studio", "version", "sourceRevision"],
    "bundle.producer",
  );
  literal(
    producer.studio,
    "evavo-art-studio",
    "bundle.producer.studio",
  );
  const producerVersion = text(
    producer.version,
    "bundle.producer.version",
    { maximum: 64 },
  );
  if (!VERSION.test(producerVersion)) {
    fail("ANIMATION_SOURCE_BUNDLE_PRODUCER_VERSION_INVALID");
  }
  const sourceRevision = text(
    producer.sourceRevision,
    "bundle.producer.sourceRevision",
    { maximum: 160 },
  );
  if (!SOURCE_REVISION.test(sourceRevision)) {
    fail("ANIMATION_SOURCE_BUNDLE_SOURCE_REVISION_INVALID");
  }

  const project = object(input.project, "bundle.project");
  strict(
    project,
    ["projectId", "sceneId", "shotId"],
    ["projectId", "sceneId"],
    "bundle.project",
  );

  const timelineInput = object(input.timeline, "bundle.timeline");
  const timelineFields = [
    "framesPerSecond",
    "startFrame",
    "endFrame",
    "frameCount",
    "cadence",
    "loopMode",
  ];
  strict(
    timelineInput,
    timelineFields,
    timelineFields,
    "bundle.timeline",
  );
  const startFrame = integer(
    timelineInput.startFrame,
    "bundle.timeline.startFrame",
    0,
    100_000_000,
  );
  const endFrame = integer(
    timelineInput.endFrame,
    "bundle.timeline.endFrame",
    0,
    100_000_000,
  );
  if (endFrame < startFrame) {
    fail("ANIMATION_SOURCE_BUNDLE_TIMELINE_RANGE_INVALID");
  }
  const frameCount = integer(
    timelineInput.frameCount,
    "bundle.timeline.frameCount",
    1,
    100_000_001,
  );
  if (frameCount !== endFrame - startFrame + 1) {
    fail("ANIMATION_SOURCE_BUNDLE_FRAME_COUNT_MISMATCH");
  }
  const timeline = {
    framesPerSecond: rational(
      timelineInput.framesPerSecond,
      "bundle.timeline.framesPerSecond",
      240_000,
      1001,
      240,
    ),
    startFrame,
    endFrame,
    frameCount,
    cadence: enumValue(
      timelineInput.cadence,
      CADENCES,
      "bundle.timeline.cadence",
    ),
    loopMode: enumValue(
      timelineInput.loopMode,
      LOOP_MODES,
      "bundle.timeline.loopMode",
    ),
  };

  const canvasInput = object(input.canvas, "bundle.canvas");
  const canvasFields = [
    "width",
    "height",
    "pixelAspectRatio",
    "colourSpace",
    "alphaMode",
  ];
  strict(canvasInput, canvasFields, canvasFields, "bundle.canvas");
  const canvas = {
    width: integer(
      canvasInput.width,
      "bundle.canvas.width",
      1,
      16_384,
    ),
    height: integer(
      canvasInput.height,
      "bundle.canvas.height",
      1,
      16_384,
    ),
    pixelAspectRatio: rational(
      canvasInput.pixelAspectRatio,
      "bundle.canvas.pixelAspectRatio",
      10_000,
      10_000,
    ),
    colourSpace: text(
      canvasInput.colourSpace,
      "bundle.canvas.colourSpace",
      { maximum: 96 },
    ),
    alphaMode: enumValue(
      canvasInput.alphaMode,
      ALPHA_MODES,
      "bundle.canvas.alphaMode",
    ),
  };

  const authority = object(input.authority, "bundle.authority");
  const authorityFields = [
    "candidateOnly",
    "providerExecution",
    "renderExecution",
    "xSheetAuthority",
    "creativeApprovalIncluded",
    "publication",
    "repositoryMutation",
  ];
  strict(
    authority,
    authorityFields,
    authorityFields,
    "bundle.authority",
  );

  return {
    schema: ANIMATION_SOURCE_BUNDLE_SCHEMA,
    bundleId: identifier(input.bundleId, "bundle.bundleId"),
    createdAt: timestamp(input.createdAt, "bundle.createdAt"),
    producer: {
      studio: "evavo-art-studio",
      version: producerVersion,
      sourceRevision,
    },
    project: {
      projectId: identifier(
        project.projectId,
        "bundle.project.projectId",
      ),
      sceneId: identifier(
        project.sceneId,
        "bundle.project.sceneId",
      ),
      ...(project.shotId === undefined
        ? {}
        : {
            shotId: identifier(
              project.shotId,
              "bundle.project.shotId",
            ),
          }),
    },
    timeline,
    canvas,
    creativeIntentSha256: sha256(
      input.creativeIntentSha256,
      "bundle.creativeIntentSha256",
    ),
    continuitySha256: sha256(
      input.continuitySha256,
      "bundle.continuitySha256",
    ),
    assets: normalizeAssets(
      input.assets,
      timeline,
      requireCanonicalOrder,
    ),
    authority: {
      candidateOnly: literal(
        authority.candidateOnly,
        true,
        "bundle.authority.candidateOnly",
      ),
      providerExecution: literal(
        authority.providerExecution,
        false,
        "bundle.authority.providerExecution",
      ),
      renderExecution: literal(
        authority.renderExecution,
        false,
        "bundle.authority.renderExecution",
      ),
      xSheetAuthority: literal(
        authority.xSheetAuthority,
        "cel-animation-studio",
        "bundle.authority.xSheetAuthority",
      ),
      creativeApprovalIncluded: booleanValue(
        authority.creativeApprovalIncluded,
        "bundle.authority.creativeApprovalIncluded",
      ),
      publication: literal(
        authority.publication,
        false,
        "bundle.authority.publication",
      ),
      repositoryMutation: literal(
        authority.repositoryMutation,
        false,
        "bundle.authority.repositoryMutation",
      ),
    },
  };
}

export function canonicalJson(value) {
  function normalize(entry) {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (entry && typeof entry === "object") {
      const result = {};
      for (const key of Object.keys(entry).sort()) {
        if (entry[key] !== undefined) {
          result[key] = normalize(entry[key]);
        }
      }
      return result;
    }
    return entry;
  }
  return JSON.stringify(normalize(value));
}

export function sha256Json(value) {
  const digest = createHash("sha256")
    .update(canonicalJson(value))
    .digest("hex");
  return `sha256:${digest}`;
}

function normalizeApproval(value, bundleDigest, compile) {
  const input = object(value, "approval");

  if (input.state === "draft") {
    const fields = compile
      ? ["state"]
      : ["state", "approvalDigest"];
    strict(input, fields, fields, "approval");
    const body = { state: "draft" };
    const approvalDigest = sha256Json(body);
    if (
      !compile &&
      sha256(
        input.approvalDigest,
        "approval.approvalDigest",
      ) !== approvalDigest
    ) {
      fail("ANIMATION_SOURCE_BUNDLE_APPROVAL_DIGEST_MISMATCH");
    }
    return { ...body, approvalDigest };
  }

  if (input.state === "approved") {
    const compileFields = [
      "state",
      "approvedBy",
      "approvedAt",
      "decisionReason",
    ];
    const verifyFields = [
      "state",
      "approvedBundleDigest",
      "approvedBy",
      "approvedAt",
      "decisionReason",
      "approvalDigest",
    ];
    const fields = compile ? compileFields : verifyFields;
    strict(input, fields, fields, "approval");

    const approvedBundleDigest = compile
      ? bundleDigest
      : sha256(
          input.approvedBundleDigest,
          "approval.approvedBundleDigest",
        );
    if (approvedBundleDigest !== bundleDigest) {
      fail("ANIMATION_SOURCE_BUNDLE_STALE_APPROVAL");
    }

    const body = {
      state: "approved",
      approvedBundleDigest,
      approvedBy: identifier(
        input.approvedBy,
        "approval.approvedBy",
      ),
      approvedAt: timestamp(
        input.approvedAt,
        "approval.approvedAt",
      ),
      decisionReason: text(
        input.decisionReason,
        "approval.decisionReason",
        { minimum: 8, maximum: 1024 },
      ),
    };
    const approvalDigest = sha256Json(body);
    if (
      !compile &&
      sha256(
        input.approvalDigest,
        "approval.approvalDigest",
      ) !== approvalDigest
    ) {
      fail("ANIMATION_SOURCE_BUNDLE_APPROVAL_DIGEST_MISMATCH");
    }
    return { ...body, approvalDigest };
  }

  if (input.state === "rejected") {
    const fields = compile
      ? ["state", "decisionReason"]
      : ["state", "decisionReason", "approvalDigest"];
    strict(input, fields, fields, "approval");
    const body = {
      state: "rejected",
      decisionReason: text(
        input.decisionReason,
        "approval.decisionReason",
        { minimum: 8, maximum: 1024 },
      ),
    };
    const approvalDigest = sha256Json(body);
    if (
      !compile &&
      sha256(
        input.approvalDigest,
        "approval.approvalDigest",
      ) !== approvalDigest
    ) {
      fail("ANIMATION_SOURCE_BUNDLE_APPROVAL_DIGEST_MISMATCH");
    }
    return { ...body, approvalDigest };
  }

  fail("ANIMATION_SOURCE_BUNDLE_APPROVAL_STATE_INVALID");
}

export function assertAnimationSourceBundle(value) {
  const input = object(value, "bundle");
  const fields = [
    "schema",
    "bundleId",
    "createdAt",
    "producer",
    "project",
    "timeline",
    "canvas",
    "creativeIntentSha256",
    "continuitySha256",
    "assets",
    "authority",
    "bundleDigest",
    "approval",
  ];
  strict(input, fields, fields, "bundle");

  const body = normalizeBody(
    {
      schema: input.schema,
      bundleId: input.bundleId,
      createdAt: input.createdAt,
      producer: input.producer,
      project: input.project,
      timeline: input.timeline,
      canvas: input.canvas,
      creativeIntentSha256: input.creativeIntentSha256,
      continuitySha256: input.continuitySha256,
      assets: input.assets,
      authority: input.authority,
    },
    true,
  );
  const bundleDigest = sha256Json(body);
  if (
    sha256(input.bundleDigest, "bundle.bundleDigest") !==
    bundleDigest
  ) {
    fail("ANIMATION_SOURCE_BUNDLE_DIGEST_MISMATCH");
  }

  const approval = normalizeApproval(
    input.approval,
    bundleDigest,
    false,
  );
  if (
    approval.state === "approved" &&
    body.authority.creativeApprovalIncluded !== true
  ) {
    fail("ANIMATION_SOURCE_BUNDLE_APPROVAL_AUTHORITY_MISMATCH");
  }

  return { ...body, bundleDigest, approval };
}

function resolveContainedPath(root, relativePath) {
  const safeRelativePath =
    assertAnimationSourceBundleRelativePath(relativePath);
  const candidate = resolve(
    root,
    ...safeRelativePath.split("/"),
  );
  const lexical = relative(root, candidate);
  if (
    lexical === "" ||
    lexical === ".." ||
    lexical.startsWith(`..${sep}`) ||
    isAbsolute(lexical)
  ) {
    fail(
      "ANIMATION_SOURCE_BUNDLE_PATH_ESCAPES_ROOT",
      safeRelativePath,
    );
  }
  return candidate;
}

async function digestFile(path) {
  const hash = createHash("sha256");
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      hash.update(chunk);
      callback();
    },
  });
  await pipeline(createReadStream(path), sink);
  return `sha256:${hash.digest("hex")}`;
}

async function probePng(path) {
  const handle = await open(path, "r");
  try {
    const header = Buffer.alloc(24);
    const { bytesRead } = await handle.read(
      header,
      0,
      header.length,
      0,
    );
    if (
      bytesRead !== header.length ||
      !header.subarray(0, 8).equals(PNG_SIGNATURE) ||
      header.toString("ascii", 12, 16) !== "IHDR"
    ) {
      fail("ANIMATION_SOURCE_BUNDLE_PNG_INVALID", path);
    }
    return {
      width: header.readUInt32BE(16),
      height: header.readUInt32BE(20),
    };
  } finally {
    await handle.close();
  }
}

async function inspectAsset(rootReal, descriptor, verifyExpected) {
  const candidate = resolveContainedPath(
    rootReal,
    descriptor.relativePath,
  );
  const link = await lstat(candidate);
  if (link.isSymbolicLink()) {
    fail(
      "ANIMATION_SOURCE_BUNDLE_SYMLINK_FORBIDDEN",
      descriptor.relativePath,
    );
  }

  const candidateReal = await realpath(candidate);
  const resolved = relative(rootReal, candidateReal);
  if (
    resolved === "" ||
    resolved === ".." ||
    resolved.startsWith(`..${sep}`) ||
    isAbsolute(resolved)
  ) {
    fail(
      "ANIMATION_SOURCE_BUNDLE_REALPATH_ESCAPES_ROOT",
      descriptor.relativePath,
    );
  }

  const details = await stat(candidateReal);
  if (!details.isFile()) {
    fail(
      "ANIMATION_SOURCE_BUNDLE_ASSET_NOT_FILE",
      descriptor.relativePath,
    );
  }

  const digest = await digestFile(candidateReal);
  const dimensions =
    descriptor.mediaType === "image/png"
      ? await probePng(candidateReal)
      : undefined;

  if (verifyExpected) {
    if (details.size !== descriptor.byteLength) {
      fail(
        "ANIMATION_SOURCE_BUNDLE_BYTE_LENGTH_MISMATCH",
        descriptor.assetId,
      );
    }
    if (digest !== descriptor.sha256) {
      fail(
        "ANIMATION_SOURCE_BUNDLE_ASSET_DIGEST_MISMATCH",
        descriptor.assetId,
      );
    }
    if (
      dimensions &&
      (dimensions.width !== descriptor.width ||
        dimensions.height !== descriptor.height)
    ) {
      fail(
        "ANIMATION_SOURCE_BUNDLE_DIMENSION_MISMATCH",
        descriptor.assetId,
      );
    }
  }

  return {
    byteLength: details.size,
    sha256: digest,
    ...(dimensions ?? {}),
  };
}

async function mapBounded(values, concurrency, worker) {
  const output = new Array(values.length);
  let cursor = 0;
  const workerCount = Math.min(concurrency, values.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        output[index] = await worker(values[index], index);
      }
    }),
  );
  return output;
}

function normalizeConcurrency(value) {
  const resolved = value ?? 4;
  if (
    typeof resolved !== "number" ||
    !Number.isSafeInteger(resolved) ||
    resolved < 1 ||
    resolved > 16
  ) {
    fail("ANIMATION_SOURCE_BUNDLE_CONCURRENCY_INVALID");
  }
  return resolved;
}

export async function verifyAnimationSourceBundleFiles(
  value,
  sourceRoot,
  options = {},
) {
  const bundle = assertAnimationSourceBundle(value);
  const rootReal = await realpath(resolve(sourceRoot));
  const evidence = await mapBounded(
    bundle.assets,
    normalizeConcurrency(options.concurrency),
    async (asset) => {
      const inspected = await inspectAsset(
        rootReal,
        asset,
        true,
      );
      return {
        assetId: asset.assetId,
        relativePath: asset.relativePath,
        byteLength: inspected.byteLength,
        sha256: inspected.sha256,
      };
    },
  );

  const receiptBody = {
    schema:
      "evavo.animation-source-bundle-verification.v1",
    bundleDigest: bundle.bundleDigest,
    sourceSetDigest: sha256Json(
      evidence.map(
        ({ relativePath, byteLength, sha256: digest }) => ({
          relativePath,
          byteLength,
          sha256: digest,
        }),
      ),
    ),
    assetCount: evidence.length,
    totalBytes: evidence.reduce(
      (sum, entry) => sum + entry.byteLength,
      0,
    ),
    evidence,
    authority: {
      candidateOnly: true,
      providerExecution: false,
      renderExecution: false,
      creativeApproval: false,
      xSheetApproval: false,
      publication: false,
      repositoryMutation: false,
    },
  };

  return {
    ...receiptBody,
    receiptDigest: sha256Json(receiptBody),
  };
}

export async function compileAnimationSourceBundle(
  request,
  sourceRoot,
  options = {},
) {
  const input = object(request, "request");
  const fields = [
    "bundleId",
    "createdAt",
    "producer",
    "project",
    "timeline",
    "canvas",
    "creativeIntentSha256",
    "continuitySha256",
    "assets",
    "creativeApprovalIncluded",
    "approval",
  ];
  strict(input, fields, fields, "request");

  if (
    !Array.isArray(input.assets) ||
    input.assets.length < 1 ||
    input.assets.length > 4096
  ) {
    fail("ANIMATION_SOURCE_BUNDLE_ASSET_COUNT_INVALID");
  }

  const rootReal = await realpath(resolve(sourceRoot));
  const measured = await mapBounded(
    input.assets,
    normalizeConcurrency(options.concurrency),
    async (value, index) => {
      const label = `request.assets[${index}]`;
      const descriptor = object(value, label);
      strict(
        descriptor,
        [
          "assetId",
          "role",
          "relativePath",
          "mediaType",
          "width",
          "height",
          "frameNumber",
          "layerId",
          "sourceArtifactId",
        ],
        ["assetId", "role", "relativePath", "mediaType"],
        label,
      );

      const prepared = {
        ...descriptor,
        relativePath:
          assertAnimationSourceBundleRelativePath(
            descriptor.relativePath,
          ),
        mediaType: mediaType(
          descriptor.mediaType,
          `${label}.mediaType`,
        ),
      };
      const inspected = await inspectAsset(
        rootReal,
        prepared,
        false,
      );

      if (
        inspected.width !== undefined &&
        prepared.width !== undefined &&
        (prepared.width !== inspected.width ||
          prepared.height !== inspected.height)
      ) {
        fail(
          "ANIMATION_SOURCE_BUNDLE_DECLARED_DIMENSION_MISMATCH",
          String(descriptor.assetId),
        );
      }

      return {
        ...prepared,
        byteLength: inspected.byteLength,
        sha256: inspected.sha256,
        ...(inspected.width === undefined
          ? prepared.width === undefined
            ? {}
            : {
                width: prepared.width,
                height: prepared.height,
              }
          : {
              width: inspected.width,
              height: inspected.height,
            }),
      };
    },
  );

  const producer = object(input.producer, "request.producer");
  strict(
    producer,
    ["version", "sourceRevision"],
    ["version", "sourceRevision"],
    "request.producer",
  );

  const body = normalizeBody(
    {
      schema: ANIMATION_SOURCE_BUNDLE_SCHEMA,
      bundleId: input.bundleId,
      createdAt: input.createdAt,
      producer: {
        studio: "evavo-art-studio",
        version: producer.version,
        sourceRevision: producer.sourceRevision,
      },
      project: input.project,
      timeline: input.timeline,
      canvas: input.canvas,
      creativeIntentSha256: input.creativeIntentSha256,
      continuitySha256: input.continuitySha256,
      assets: measured,
      authority: {
        candidateOnly: true,
        providerExecution: false,
        renderExecution: false,
        xSheetAuthority: "cel-animation-studio",
        creativeApprovalIncluded: booleanValue(
          input.creativeApprovalIncluded,
          "request.creativeApprovalIncluded",
        ),
        publication: false,
        repositoryMutation: false,
      },
    },
    false,
  );
  const bundleDigest = sha256Json(body);
  const approval = normalizeApproval(
    input.approval,
    bundleDigest,
    true,
  );

  return assertAnimationSourceBundle({
    ...body,
    bundleDigest,
    approval,
  });
}

export async function readJson(path) {
  return JSON.parse(
    await readFile(resolve(path), "utf8"),
  );
}

export async function writeJsonAtomic(path, value) {
  const destination = resolve(path);
  await mkdir(dirname(destination), { recursive: true });
  const suffix = createHash("sha256")
    .update(`${destination}:${process.pid}:${Date.now()}`)
    .digest("hex")
    .slice(0, 16);
  const temporary = `${destination}.tmp-${suffix}`;

  try {
    const handle = await open(temporary, "wx");
    try {
      await handle.writeFile(
        `${JSON.stringify(value, null, 2)}\n`,
        "utf8",
      );
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
