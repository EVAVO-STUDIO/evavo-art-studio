import { digestStudioValue } from "./studio-handoff-v2.mjs";

export const CHARACTER_PERFORMANCE_BANK_REQUEST_SCHEMA =
  "evavo_character_performance_bank_request_v1";
export const CHARACTER_PERFORMANCE_BANK_SCHEMA =
  "evavo_character_performance_bank_v1";
export const CHARACTER_PERFORMANCE_REVIEW_SCHEMA =
  "evavo_character_performance_review_v1";
export const CHARACTER_PERFORMANCE_APPROVAL_SCHEMA =
  "evavo_character_performance_approval_v1";

const ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const SHA = /^[0-9a-f]{64}$/;
const MEDIA = /^image\/(?:png|webp|avif)$/;
const MOUTH_SHAPES = new Set([
  "rest",
  "a",
  "e",
  "o",
  "u",
  "m-b-p",
  "f-v",
  "l",
  "w-q",
]);
const MAX_SLOTS = 4096;
const MAX_CANVAS = 32768;

function plain(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function exact(value, label, required, optional = []) {
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new Error(`${label} is missing ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported field: ${key}`);
  }
}

function identifier(value, label) {
  if (typeof value !== "string" || value.length > 160 || !ID.test(value)) {
    throw new Error(`${label} must be a stable lowercase identifier`);
  }
  return value;
}

function sha(value, label) {
  if (typeof value !== "string" || !SHA.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function integer(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${label} must be an integer within ${minimum}..${maximum}`);
  }
  return value;
}

function text(value, label, maximum = 4096) {
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`${label} must be bounded text`);
  }
  return value;
}

function instant(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    throw new Error(`${label} must be a canonical UTC instant`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be a real canonical UTC instant`);
  }
  return value;
}

function portablePath(value, label) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 1024 ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("//") ||
    /^[A-Za-z]:/.test(value)
  ) {
    throw new Error(`${label} must be a portable relative POSIX path`);
  }
  if (
    value
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          /[\u0000-\u001f\u007f]/u.test(part),
      )
  ) {
    throw new Error(`${label} contains an unsafe segment`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function sortedUniqueIds(value, label, { allowEmpty = false } = {}) {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length < 1) ||
    value.length > 256
  ) {
    throw new Error(`${label} must be a bounded array`);
  }
  const rows = value
    .map((item, index) => identifier(item, `${label}[${index}]`))
    .sort();
  if (new Set(rows).size !== rows.length) {
    throw new Error(`${label} contains duplicates`);
  }
  return rows;
}

function canvas(raw) {
  const value = plain(raw, "canvas");
  exact(value, "canvas", ["width", "height"]);
  return {
    width: integer(value.width, "canvas.width", 16, MAX_CANVAS),
    height: integer(value.height, "canvas.height", 16, MAX_CANVAS),
  };
}

function thresholds(raw) {
  const value = plain(raw, "thresholds");
  const fields = [
    "identityMinBp",
    "lineQualityMinBp",
    "specificityMinBp",
    "genericAiPenaltyMaxBp",
    "alphaCoverageMinBp",
    "alphaCoverageMaxBp",
    "edgeContactMaxBp",
    "haloMaxPixels",
    "hiddenRgbMaxPixels",
    "unwantedMatteMaxPixels",
    "paletteDeviationMaxBp",
  ];
  exact(value, "thresholds", fields);
  const normalized = {};
  for (const field of fields) {
    const maximum = field.endsWith("Pixels") ? 10_000_000 : 10_000;
    normalized[field] = integer(value[field], `thresholds.${field}`, 0, maximum);
  }
  if (normalized.alphaCoverageMinBp > normalized.alphaCoverageMaxBp) {
    throw new Error("alpha coverage minimum exceeds maximum");
  }
  return normalized;
}

function bounds(raw, width, height, label) {
  const value = plain(raw, label);
  exact(value, label, ["left", "top", "right", "bottom"]);
  const result = {
    left: integer(value.left, `${label}.left`, 0, width - 1),
    top: integer(value.top, `${label}.top`, 0, height - 1),
    right: integer(value.right, `${label}.right`, 1, width),
    bottom: integer(value.bottom, `${label}.bottom`, 1, height),
  };
  if (result.right <= result.left || result.bottom <= result.top) {
    throw new Error(`${label} is empty`);
  }
  return result;
}

function normalizeSlot(raw, index, bankCanvas) {
  const label = `slots[${index}]`;
  const value = plain(raw, label);
  exact(value, label, [
    "slotId",
    "role",
    "assetId",
    "relativePath",
    "sha256",
    "bytes",
    "mediaType",
    "width",
    "height",
    "safeBounds",
    "mouthShape",
    "intentionalHoldOf",
    "protectedLandmarksSha256",
    "paletteEvidenceSha256",
    "cleanupEvidenceSha256",
    "notes",
    "metadata",
  ]);
  const width = integer(value.width, `${label}.width`, 16, MAX_CANVAS);
  const height = integer(value.height, `${label}.height`, 16, MAX_CANVAS);
  if (width !== bankCanvas.width || height !== bankCanvas.height) {
    throw new Error(`${label} dimensions differ from the bank canvas`);
  }
  if (typeof value.mediaType !== "string" || !MEDIA.test(value.mediaType)) {
    throw new Error(`${label}.mediaType must be image/png, image/webp or image/avif`);
  }
  const mouthShape =
    value.mouthShape === null
      ? null
      : identifier(value.mouthShape, `${label}.mouthShape`);
  if (mouthShape !== null && !MOUTH_SHAPES.has(mouthShape)) {
    throw new Error(`${label}.mouthShape is unsupported`);
  }
  return {
    slotId: identifier(value.slotId, `${label}.slotId`),
    role: identifier(value.role, `${label}.role`),
    assetId: identifier(value.assetId, `${label}.assetId`),
    relativePath: portablePath(value.relativePath, `${label}.relativePath`),
    sha256: sha(value.sha256, `${label}.sha256`),
    bytes: integer(value.bytes, `${label}.bytes`, 1),
    mediaType: value.mediaType,
    width,
    height,
    safeBounds: bounds(value.safeBounds, width, height, `${label}.safeBounds`),
    mouthShape,
    intentionalHoldOf:
      value.intentionalHoldOf === null
        ? null
        : identifier(value.intentionalHoldOf, `${label}.intentionalHoldOf`),
    protectedLandmarksSha256: sha(
      value.protectedLandmarksSha256,
      `${label}.protectedLandmarksSha256`,
    ),
    paletteEvidenceSha256: sha(
      value.paletteEvidenceSha256,
      `${label}.paletteEvidenceSha256`,
    ),
    cleanupEvidenceSha256: sha(
      value.cleanupEvidenceSha256,
      `${label}.cleanupEvidenceSha256`,
    ),
    notes: text(value.notes, `${label}.notes`),
    metadata: value.metadata,
  };
}

function normalizeSlots(raw, bankCanvas) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_SLOTS) {
    throw new Error("slots must contain 1..4096 entries");
  }
  const slots = raw
    .map((slot, index) => normalizeSlot(slot, index, bankCanvas))
    .sort((left, right) => left.slotId.localeCompare(right.slotId));
  const byId = new Map();
  for (const slot of slots) {
    if (byId.has(slot.slotId)) throw new Error(`duplicate slotId: ${slot.slotId}`);
    byId.set(slot.slotId, slot);
  }
  const uniqueAssets = new Map();
  const uniquePaths = new Map();
  const digestSources = new Map();
  for (const slot of slots) {
    if (slot.intentionalHoldOf !== null) {
      const source = byId.get(slot.intentionalHoldOf);
      if (
        !source ||
        source.slotId === slot.slotId ||
        source.intentionalHoldOf !== null
      ) {
        throw new Error(
          `${slot.slotId} intentional hold must reference a non-hold source slot`,
        );
      }
      if (
        source.sha256 !== slot.sha256 ||
        source.assetId !== slot.assetId ||
        source.relativePath !== slot.relativePath ||
        source.bytes !== slot.bytes
      ) {
        throw new Error(`${slot.slotId} intentional hold must reuse the exact source asset`);
      }
    } else {
      if (uniqueAssets.has(slot.assetId)) {
        throw new Error(`duplicate assetId without intentional hold: ${slot.assetId}`);
      }
      if (uniquePaths.has(slot.relativePath)) {
        throw new Error(
          `duplicate asset path without intentional hold: ${slot.relativePath}`,
        );
      }
      if (digestSources.has(slot.sha256)) {
        throw new Error(
          `duplicate image bytes require an explicit intentional hold of ${digestSources.get(slot.sha256)}`,
        );
      }
      uniqueAssets.set(slot.assetId, slot.slotId);
      uniquePaths.set(slot.relativePath, slot.slotId);
      digestSources.set(slot.sha256, slot.slotId);
    }
  }
  return slots;
}

function compileBody(request) {
  const bankCanvas = canvas(request.canvas);
  const requiredRoles = sortedUniqueIds(request.requiredRoles, "requiredRoles");
  const requiredMouthShapes = sortedUniqueIds(
    request.requiredMouthShapes,
    "requiredMouthShapes",
    { allowEmpty: true },
  );
  for (const shape of requiredMouthShapes) {
    if (!MOUTH_SHAPES.has(shape)) {
      throw new Error(`required mouth shape is unsupported: ${shape}`);
    }
  }
  const slots = normalizeSlots(request.slots, bankCanvas);
  const roles = new Set(slots.map((slot) => slot.role));
  const mouthShapes = new Set(
    slots.map((slot) => slot.mouthShape).filter(Boolean),
  );
  const missingRoles = requiredRoles.filter((role) => !roles.has(role));
  const missingMouthShapes = requiredMouthShapes.filter(
    (shape) => !mouthShapes.has(shape),
  );
  if (missingRoles.length) {
    throw new Error(`bank is missing required roles: ${missingRoles.join(", ")}`);
  }
  if (missingMouthShapes.length) {
    throw new Error(
      `bank is missing required mouth shapes: ${missingMouthShapes.join(", ")}`,
    );
  }
  if (typeof request.producerCommit !== "string" || !/^[0-9a-f]{40}$/.test(request.producerCommit)) {
    throw new Error("producerCommit must be a 40-character Git commit");
  }
  return {
    schema: CHARACTER_PERFORMANCE_BANK_SCHEMA,
    productionId: identifier(request.productionId, "productionId"),
    characterId: identifier(request.characterId, "characterId"),
    producerCommit: request.producerCommit,
    creativeIntentSha256: sha(
      request.creativeIntentSha256,
      "creativeIntentSha256",
    ),
    continuitySha256: sha(request.continuitySha256, "continuitySha256"),
    artDirectionSha256: sha(request.artDirectionSha256, "artDirectionSha256"),
    createdAt: instant(request.createdAt, "createdAt"),
    canvas: bankCanvas,
    thresholds: thresholds(request.thresholds),
    requiredRoles,
    requiredMouthShapes,
    slots,
    metadata: request.metadata ?? {},
    authority: {
      planningOnly: true,
      executesProvider: false,
      automaticCreativeApproval: false,
      releaseApproval: false,
      publicationAuthority: false,
      deploymentAuthority: false,
    },
  };
}

export function compileCharacterPerformanceBank(input) {
  const request = plain(input, "character performance bank request");
  exact(
    request,
    "character performance bank request",
    [
      "schema",
      "productionId",
      "characterId",
      "producerCommit",
      "creativeIntentSha256",
      "continuitySha256",
      "artDirectionSha256",
      "createdAt",
      "canvas",
      "thresholds",
      "requiredRoles",
      "requiredMouthShapes",
      "slots",
    ],
    ["metadata"],
  );
  if (request.schema !== CHARACTER_PERFORMANCE_BANK_REQUEST_SCHEMA) {
    throw new Error("character performance bank request schema changed");
  }
  const body = compileBody(request);
  const bankId = `character-bank-${digestStudioValue(body).slice(0, 24)}`;
  const withIdentity = { ...body, bankId };
  return deepFreeze({ ...withIdentity, bankSha256: digestStudioValue(withIdentity) });
}

function requestFromBank(bank) {
  return {
    schema: CHARACTER_PERFORMANCE_BANK_REQUEST_SCHEMA,
    productionId: bank.productionId,
    characterId: bank.characterId,
    producerCommit: bank.producerCommit,
    creativeIntentSha256: bank.creativeIntentSha256,
    continuitySha256: bank.continuitySha256,
    artDirectionSha256: bank.artDirectionSha256,
    createdAt: bank.createdAt,
    canvas: bank.canvas,
    thresholds: bank.thresholds,
    requiredRoles: bank.requiredRoles,
    requiredMouthShapes: bank.requiredMouthShapes,
    slots: bank.slots,
    metadata: bank.metadata,
  };
}

export function verifyCharacterPerformanceBank(input) {
  const value = plain(input, "character performance bank");
  if (
    value.schema !== CHARACTER_PERFORMANCE_BANK_SCHEMA ||
    !SHA.test(value.bankSha256)
  ) {
    throw new Error("character performance bank schema or digest is invalid");
  }
  const rebuilt = compileCharacterPerformanceBank(requestFromBank(value));
  if (digestStudioValue(rebuilt) !== digestStudioValue(value)) {
    throw new Error("character performance bank digest mismatch or semantic drift");
  }
  return value.bankSha256;
}

function measurement(raw, index) {
  const label = `measurements[${index}]`;
  const value = plain(raw, label);
  exact(value, label, [
    "slotId",
    "sha256",
    "width",
    "height",
    "identityBp",
    "lineQualityBp",
    "specificityBp",
    "genericAiPenaltyBp",
    "alphaCoverageBp",
    "edgeContactBp",
    "haloPixels",
    "hiddenRgbPixels",
    "unwantedMattePixels",
    "paletteDeviationBp",
    "protectedLandmarksSha256",
    "paletteEvidenceSha256",
    "cleanupEvidenceSha256",
  ]);
  return {
    slotId: identifier(value.slotId, `${label}.slotId`),
    sha256: sha(value.sha256, `${label}.sha256`),
    width: integer(value.width, `${label}.width`, 1, MAX_CANVAS),
    height: integer(value.height, `${label}.height`, 1, MAX_CANVAS),
    identityBp: integer(value.identityBp, `${label}.identityBp`, 0, 10_000),
    lineQualityBp: integer(
      value.lineQualityBp,
      `${label}.lineQualityBp`,
      0,
      10_000,
    ),
    specificityBp: integer(
      value.specificityBp,
      `${label}.specificityBp`,
      0,
      10_000,
    ),
    genericAiPenaltyBp: integer(
      value.genericAiPenaltyBp,
      `${label}.genericAiPenaltyBp`,
      0,
      10_000,
    ),
    alphaCoverageBp: integer(
      value.alphaCoverageBp,
      `${label}.alphaCoverageBp`,
      0,
      10_000,
    ),
    edgeContactBp: integer(
      value.edgeContactBp,
      `${label}.edgeContactBp`,
      0,
      10_000,
    ),
    haloPixels: integer(value.haloPixels, `${label}.haloPixels`, 0, 10_000_000),
    hiddenRgbPixels: integer(
      value.hiddenRgbPixels,
      `${label}.hiddenRgbPixels`,
      0,
      10_000_000,
    ),
    unwantedMattePixels: integer(
      value.unwantedMattePixels,
      `${label}.unwantedMattePixels`,
      0,
      10_000_000,
    ),
    paletteDeviationBp: integer(
      value.paletteDeviationBp,
      `${label}.paletteDeviationBp`,
      0,
      10_000,
    ),
    protectedLandmarksSha256: sha(
      value.protectedLandmarksSha256,
      `${label}.protectedLandmarksSha256`,
    ),
    paletteEvidenceSha256: sha(
      value.paletteEvidenceSha256,
      `${label}.paletteEvidenceSha256`,
    ),
    cleanupEvidenceSha256: sha(
      value.cleanupEvidenceSha256,
      `${label}.cleanupEvidenceSha256`,
    ),
  };
}

function issue(code, severity, slotId, details = {}) {
  return { code, severity, department: "art", slotId, details };
}

export function reviewCharacterPerformanceBank(input) {
  const request = plain(input, "character performance review request");
  exact(
    request,
    "character performance review request",
    ["bank", "measurements"],
    ["reviewId"],
  );
  const bankSha256 = verifyCharacterPerformanceBank(request.bank);
  if (
    !Array.isArray(request.measurements) ||
    request.measurements.length !== request.bank.slots.length
  ) {
    throw new Error("review requires exactly one measurement row per slot");
  }
  const rows = request.measurements
    .map(measurement)
    .sort((left, right) => left.slotId.localeCompare(right.slotId));
  const ids = new Set();
  for (const row of rows) {
    if (ids.has(row.slotId)) {
      throw new Error(`duplicate measurement slotId: ${row.slotId}`);
    }
    ids.add(row.slotId);
  }
  const issues = [];
  const byId = new Map(rows.map((row) => [row.slotId, row]));
  for (const slot of request.bank.slots) {
    const row = byId.get(slot.slotId);
    if (!row) throw new Error(`measurement missing slot: ${slot.slotId}`);
    if (
      row.sha256 !== slot.sha256 ||
      row.width !== slot.width ||
      row.height !== slot.height
    ) {
      issues.push(issue("asset-identity-mismatch", "blocker", slot.slotId));
    }
    if (row.protectedLandmarksSha256 !== slot.protectedLandmarksSha256) {
      issues.push(issue("protected-landmarks-drift", "blocker", slot.slotId));
    }
    if (
      row.paletteEvidenceSha256 !== slot.paletteEvidenceSha256 ||
      row.paletteDeviationBp > request.bank.thresholds.paletteDeviationMaxBp
    ) {
      issues.push(
        issue("palette-drift", "major", slot.slotId, {
          observedBp: row.paletteDeviationBp,
        }),
      );
    }
    if (row.cleanupEvidenceSha256 !== slot.cleanupEvidenceSha256) {
      issues.push(issue("cleanup-evidence-drift", "major", slot.slotId));
    }
    if (row.identityBp < request.bank.thresholds.identityMinBp) {
      issues.push(
        issue("identity-below-threshold", "blocker", slot.slotId, {
          observedBp: row.identityBp,
        }),
      );
    }
    if (row.lineQualityBp < request.bank.thresholds.lineQualityMinBp) {
      issues.push(
        issue("line-quality-below-threshold", "major", slot.slotId, {
          observedBp: row.lineQualityBp,
        }),
      );
    }
    if (
      row.specificityBp < request.bank.thresholds.specificityMinBp ||
      row.genericAiPenaltyBp > request.bank.thresholds.genericAiPenaltyMaxBp
    ) {
      issues.push(
        issue("generic-or-underspecified", "major", slot.slotId, {
          specificityBp: row.specificityBp,
          genericAiPenaltyBp: row.genericAiPenaltyBp,
        }),
      );
    }
    if (
      row.alphaCoverageBp < request.bank.thresholds.alphaCoverageMinBp ||
      row.alphaCoverageBp > request.bank.thresholds.alphaCoverageMaxBp
    ) {
      issues.push(
        issue("alpha-coverage-outside-envelope", "major", slot.slotId, {
          observedBp: row.alphaCoverageBp,
        }),
      );
    }
    if (row.edgeContactBp > request.bank.thresholds.edgeContactMaxBp) {
      issues.push(
        issue("unsafe-framing-or-cropped-edge", "blocker", slot.slotId, {
          observedBp: row.edgeContactBp,
        }),
      );
    }
    if (row.haloPixels > request.bank.thresholds.haloMaxPixels) {
      issues.push(
        issue("alpha-halo-detected", "major", slot.slotId, {
          observedPixels: row.haloPixels,
        }),
      );
    }
    if (row.hiddenRgbPixels > request.bank.thresholds.hiddenRgbMaxPixels) {
      issues.push(
        issue("hidden-rgb-under-alpha", "major", slot.slotId, {
          observedPixels: row.hiddenRgbPixels,
        }),
      );
    }
    if (
      row.unwantedMattePixels > request.bank.thresholds.unwantedMatteMaxPixels
    ) {
      issues.push(
        issue("unwanted-background-or-matte", "blocker", slot.slotId, {
          observedPixels: row.unwantedMattePixels,
        }),
      );
    }
  }
  const reviewId = request.reviewId
    ? identifier(request.reviewId, "reviewId")
    : `review-${bankSha256.slice(0, 24)}`;
  const body = {
    schema: CHARACTER_PERFORMANCE_REVIEW_SCHEMA,
    reviewId,
    bankId: request.bank.bankId,
    bankSha256,
    measurements: rows,
    status: issues.length ? "repair-required" : "clean",
    issues,
    repairPlan: {
      targetedOnly: true,
      preserveBankSha256: bankSha256,
      regenerateWholeBank: false,
      items: issues.map((entry, index) => ({
        sequence: index + 1,
        slotId: entry.slotId,
        code: entry.code,
        preserveUnaffectedSlots: true,
        automaticApproval: false,
      })),
    },
    authority: {
      technicalReviewOnly: true,
      automaticCreativeApproval: false,
      releaseApproval: false,
      publicationAuthority: false,
      deploymentAuthority: false,
    },
  };
  return deepFreeze({ ...body, reviewSha256: digestStudioValue(body) });
}

export function verifyCharacterPerformanceReview(input, bank) {
  const value = plain(input, "character performance review");
  if (
    value.schema !== CHARACTER_PERFORMANCE_REVIEW_SCHEMA ||
    !SHA.test(value.reviewSha256)
  ) {
    throw new Error("character performance review schema or digest is invalid");
  }
  const rebuilt = reviewCharacterPerformanceBank({
    bank,
    measurements: value.measurements,
    reviewId: value.reviewId,
  });
  if (digestStudioValue(rebuilt) !== digestStudioValue(value)) {
    throw new Error("character performance review digest mismatch");
  }
  return value.reviewSha256;
}

export function approveCharacterPerformanceBank(input) {
  const request = plain(input, "character performance approval request");
  exact(request, "character performance approval request", [
    "bank",
    "review",
    "decisionId",
    "actorId",
    "actorRole",
    "approvalEvidenceSha256",
    "observedAt",
  ]);
  const bankSha256 = verifyCharacterPerformanceBank(request.bank);
  const reviewSha256 = verifyCharacterPerformanceReview(request.review, request.bank);
  if (request.review.status !== "clean") {
    throw new Error("creative approval requires a clean technical review");
  }
  const body = {
    schema: CHARACTER_PERFORMANCE_APPROVAL_SCHEMA,
    decisionId: identifier(request.decisionId, "decisionId"),
    bankId: request.bank.bankId,
    bankSha256,
    reviewSha256,
    actorId: identifier(request.actorId, "actorId"),
    actorRole: identifier(request.actorRole, "actorRole"),
    approvalEvidenceSha256: sha(
      request.approvalEvidenceSha256,
      "approvalEvidenceSha256",
    ),
    observedAt: instant(request.observedAt, "observedAt"),
    decision: "approved",
    grantsCreativeApproval: true,
    grantsReleaseApproval: false,
    grantsPublicationAuthority: false,
    grantsDeploymentAuthority: false,
  };
  return deepFreeze({ ...body, approvalSha256: digestStudioValue(body) });
}

export function verifyCharacterPerformanceApproval(input, bank, review) {
  const value = plain(input, "character performance approval");
  if (
    value.schema !== CHARACTER_PERFORMANCE_APPROVAL_SCHEMA ||
    !SHA.test(value.approvalSha256)
  ) {
    throw new Error("character performance approval schema or digest is invalid");
  }
  const rebuilt = approveCharacterPerformanceBank({
    bank,
    review,
    decisionId: value.decisionId,
    actorId: value.actorId,
    actorRole: value.actorRole,
    approvalEvidenceSha256: value.approvalEvidenceSha256,
    observedAt: value.observedAt,
  });
  if (digestStudioValue(rebuilt) !== digestStudioValue(value)) {
    throw new Error("character performance approval digest mismatch");
  }
  return value.approvalSha256;
}
