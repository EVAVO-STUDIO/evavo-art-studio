import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const STUDIO_HANDOFF_REQUEST_SCHEMA = "evavo_studio_handoff_request_v2";
export const STUDIO_HANDOFF_SCHEMA = "evavo_studio_handoff_v2";
export const STUDIO_HANDOFF_FILE_VERIFICATION_SCHEMA =
  "evavo_studio_handoff_file_verification_v2";
export const STUDIO_HANDOFF_ACCEPTANCE_REQUEST_SCHEMA =
  "evavo_studio_handoff_acceptance_request_v2";
export const STUDIO_HANDOFF_ACCEPTANCE_SCHEMA =
  "evavo_studio_handoff_acceptance_v2";

const IDENTIFIER = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const GIT_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*(?:;[ -~]+)?$/i;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_ITEMS = 4096;
const MAX_DEPTH = 32;

function plain(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a plain JSON object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain JSON object`);
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

function id(value, label) {
  if (typeof value !== "string" || value.length > 160 || !IDENTIFIER.test(value)) {
    throw new Error(`${label} must be a stable lowercase identifier`);
  }
  return value;
}

function sha(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function commit(value, label) {
  if (typeof value !== "string" || !GIT_COMMIT.test(value)) {
    throw new Error(`${label} must be an immutable Git commit`);
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

function hasLoneSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function jsonValue(value, label, depth = 0) {
  if (depth > MAX_DEPTH) throw new Error(`${label} exceeds the JSON depth limit`);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (hasLoneSurrogate(value)) {
      throw new Error(`${label} contains an unpaired Unicode surrogate`);
    }
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(
        `${label} must use safe integers; use fixed-point integer units instead of floats`,
      );
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ITEMS) throw new Error(`${label} exceeds the array limit`);
    return value.map((item, index) =>
      jsonValue(item, `${label}[${index}]`, depth + 1),
    );
  }
  const object = plain(value, label);
  const keys = Object.keys(object);
  if (keys.length > MAX_ITEMS) throw new Error(`${label} exceeds the object limit`);
  const rows = [];
  for (const key of keys.sort()) {
    if (
      !key ||
      key.length > 256 ||
      FORBIDDEN_KEYS.has(key) ||
      /[\u0000-\u001f\u007f]/u.test(key) ||
      hasLoneSurrogate(key)
    ) {
      throw new Error(`${label} contains an unsafe JSON key`);
    }
    rows.push([key, jsonValue(object[key], `${label}.${key}`, depth + 1)]);
  }
  return Object.fromEntries(rows);
}

export function canonicalizeStudioValue(value) {
  return jsonValue(value, "canonical payload");
}

export function digestStudioValue(value) {
  const canonical = JSON.stringify(canonicalizeStudioValue(value));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
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
  const parts = value.split("/");
  if (
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        /[\u0000-\u001f\u007f]/u.test(part),
    )
  ) {
    throw new Error(`${label} contains an unsafe path segment`);
  }
  return value;
}

function normalizeAssets(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ITEMS) {
    throw new Error("assets must contain 1..4096 entries");
  }
  const rows = value
    .map((raw, index) => {
      const label = `assets[${index}]`;
      const asset = plain(raw, label);
      exact(asset, label, [
        "assetId",
        "kind",
        "relativePath",
        "sha256",
        "bytes",
        "mediaType",
        "metadata",
      ]);
      if (!Number.isSafeInteger(asset.bytes) || asset.bytes < 1) {
        throw new Error(`${label}.bytes must be a positive safe integer`);
      }
      if (
        typeof asset.mediaType !== "string" ||
        asset.mediaType.length > 256 ||
        !MEDIA_TYPE.test(asset.mediaType)
      ) {
        throw new Error(`${label}.mediaType is invalid`);
      }
      return {
        assetId: id(asset.assetId, `${label}.assetId`),
        kind: id(asset.kind, `${label}.kind`),
        relativePath: portablePath(asset.relativePath, `${label}.relativePath`),
        sha256: sha(asset.sha256, `${label}.sha256`),
        bytes: asset.bytes,
        mediaType: asset.mediaType.toLowerCase(),
        metadata: jsonValue(asset.metadata, `${label}.metadata`),
      };
    })
    .sort(
      (left, right) =>
        left.assetId.localeCompare(right.assetId) ||
        left.relativePath.localeCompare(right.relativePath),
    );
  const ids = new Set();
  const paths = new Set();
  for (const row of rows) {
    if (ids.has(row.assetId)) throw new Error(`duplicate handoff assetId: ${row.assetId}`);
    if (paths.has(row.relativePath)) {
      throw new Error(`duplicate handoff asset path: ${row.relativePath}`);
    }
    ids.add(row.assetId);
    paths.add(row.relativePath);
  }
  return rows;
}

function normalizeEvidence(value) {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) {
    throw new Error("evidence must be an array of at most 4096 entries");
  }
  const rows = value
    .map((raw, index) => {
      const label = `evidence[${index}]`;
      const row = plain(raw, label);
      exact(row, label, ["evidenceId", "kind", "sha256", "metadata"]);
      return {
        evidenceId: id(row.evidenceId, `${label}.evidenceId`),
        kind: id(row.kind, `${label}.kind`),
        sha256: sha(row.sha256, `${label}.sha256`),
        metadata: jsonValue(row.metadata, `${label}.metadata`),
      };
    })
    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
  const ids = new Set();
  for (const row of rows) {
    if (ids.has(row.evidenceId)) {
      throw new Error(`duplicate handoff evidenceId: ${row.evidenceId}`);
    }
    ids.add(row.evidenceId);
  }
  return rows;
}

function normalizeAuthority(raw) {
  const value = plain(raw, "authority");
  exact(value, "authority", [
    "candidateOnly",
    "creativeApprovalIncluded",
    "releaseApprovalIncluded",
    "publicationAuthority",
    "deploymentAuthority",
  ]);
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "boolean") throw new Error(`authority.${key} must be Boolean`);
  }
  if (value.publicationAuthority || value.deploymentAuthority) {
    throw new Error("Studio Handoff v2 cannot grant publication or deployment authority");
  }
  if (value.releaseApprovalIncluded && !value.creativeApprovalIncluded) {
    throw new Error("release approval requires creative approval");
  }
  if (
    value.candidateOnly &&
    (value.creativeApprovalIncluded || value.releaseApprovalIncluded)
  ) {
    throw new Error("candidate-only handoffs cannot contain approvals");
  }
  return { ...value, publicationAuthority: false, deploymentAuthority: false };
}

function compileBody(request) {
  const producer = plain(request.producer, "producer");
  exact(producer, "producer", ["studio", "commit"]);
  const consumer = plain(request.consumer, "consumer");
  exact(consumer, "consumer", ["studio"]);
  return {
    schema: STUDIO_HANDOFF_SCHEMA,
    handoffType: id(request.handoffType, "handoffType"),
    productionId: id(request.productionId, "productionId"),
    producer: {
      studio: id(producer.studio, "producer.studio"),
      commit: commit(producer.commit, "producer.commit"),
    },
    consumer: { studio: id(consumer.studio, "consumer.studio") },
    creativeIntentSha256: sha(request.creativeIntentSha256, "creativeIntentSha256"),
    continuitySha256: sha(request.continuitySha256, "continuitySha256"),
    createdAt: instant(request.createdAt, "createdAt"),
    assets: normalizeAssets(request.assets),
    evidence: normalizeEvidence(request.evidence),
    authority: normalizeAuthority(request.authority),
    metadata: jsonValue(request.metadata ?? {}, "metadata"),
  };
}

export function compileStudioHandoff(input) {
  const request = plain(input, "studio handoff request");
  exact(
    request,
    "studio handoff request",
    [
      "schema",
      "handoffType",
      "productionId",
      "producer",
      "consumer",
      "creativeIntentSha256",
      "continuitySha256",
      "createdAt",
      "assets",
      "evidence",
      "authority",
    ],
    ["metadata"],
  );
  if (request.schema !== STUDIO_HANDOFF_REQUEST_SCHEMA) {
    throw new Error(`request schema must equal ${STUDIO_HANDOFF_REQUEST_SCHEMA}`);
  }
  const body = compileBody(request);
  const handoffId = `handoff_${digestStudioValue(body).slice(0, 24)}`;
  const withIdentity = { ...body, handoffId };
  return deepFreeze({ ...withIdentity, handoffSha256: digestStudioValue(withIdentity) });
}

export function verifyStudioHandoff(input) {
  const value = plain(input, "studio handoff");
  exact(value, "studio handoff", [
    "schema",
    "handoffType",
    "productionId",
    "producer",
    "consumer",
    "creativeIntentSha256",
    "continuitySha256",
    "createdAt",
    "assets",
    "evidence",
    "authority",
    "metadata",
    "handoffId",
    "handoffSha256",
  ]);
  if (value.schema !== STUDIO_HANDOFF_SCHEMA) {
    throw new Error("studio handoff schema changed");
  }
  sha(value.handoffSha256, "handoffSha256");
  const rebuilt = compileStudioHandoff({
    schema: STUDIO_HANDOFF_REQUEST_SCHEMA,
    handoffType: value.handoffType,
    productionId: value.productionId,
    producer: value.producer,
    consumer: value.consumer,
    creativeIntentSha256: value.creativeIntentSha256,
    continuitySha256: value.continuitySha256,
    createdAt: value.createdAt,
    assets: value.assets,
    evidence: value.evidence,
    authority: value.authority,
    metadata: value.metadata,
  });
  if (digestStudioValue(rebuilt) !== digestStudioValue(value)) {
    throw new Error("studio handoff digest mismatch or non-canonical payload");
  }
  return rebuilt.handoffSha256;
}

function withinRoot(root, candidate) {
  const rel = relative(resolve(root), resolve(candidate));
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

async function resolveRegularAsset(root, relativePath) {
  let cursor = resolve(root);
  for (const segment of relativePath.split("/")) {
    cursor = resolve(cursor, segment);
    if (!withinRoot(root, cursor)) {
      throw new Error(`asset path escapes admitted root: ${relativePath}`);
    }
    const status = await lstat(cursor);
    if (status.isSymbolicLink()) {
      throw new Error(`asset path contains a symbolic link: ${relativePath}`);
    }
  }
  const status = await lstat(cursor);
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`handoff asset is not a regular file: ${relativePath}`);
  }
  return { path: cursor, status };
}

function verificationBody(handoff, handoffSha256, assets) {
  return {
    schema: STUDIO_HANDOFF_FILE_VERIFICATION_SCHEMA,
    handoffId: handoff.handoffId,
    handoffSha256,
    assetCount: assets.length,
    assets,
  };
}

export async function verifyStudioHandoffFiles(handoff, rootInput) {
  const handoffSha256 = verifyStudioHandoff(handoff);
  const root = resolve(rootInput);
  const rootStatus = await lstat(root);
  if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink()) {
    throw new Error("handoff asset root must be a real directory");
  }
  const assets = [];
  for (const asset of handoff.assets) {
    const resolved = await resolveRegularAsset(root, asset.relativePath);
    if (resolved.status.size !== asset.bytes) {
      throw new Error(`handoff asset byte count changed: ${asset.relativePath}`);
    }
    const bytes = await readFile(resolved.path);
    const observed = createHash("sha256").update(bytes).digest("hex");
    if (observed !== asset.sha256) {
      throw new Error(`handoff asset digest changed: ${asset.relativePath}`);
    }
    assets.push({
      assetId: asset.assetId,
      relativePath: asset.relativePath,
      sha256: observed,
      bytes: resolved.status.size,
    });
  }
  const body = verificationBody(handoff, handoffSha256, assets);
  return deepFreeze({ ...body, verificationSha256: digestStudioValue(body) });
}

export function verifyStudioHandoffFileVerification(input, handoff) {
  const value = plain(input, "file verification");
  exact(value, "file verification", [
    "schema",
    "handoffId",
    "handoffSha256",
    "assetCount",
    "assets",
    "verificationSha256",
  ]);
  if (value.schema !== STUDIO_HANDOFF_FILE_VERIFICATION_SCHEMA) {
    throw new Error("file verification schema changed");
  }
  const handoffSha256 = verifyStudioHandoff(handoff);
  const expectedAssets = handoff.assets.map((asset) => ({
    assetId: asset.assetId,
    relativePath: asset.relativePath,
    sha256: asset.sha256,
    bytes: asset.bytes,
  }));
  if (
    value.handoffId !== handoff.handoffId ||
    value.handoffSha256 !== handoffSha256
  ) {
    throw new Error("file verification is bound to another handoff");
  }
  if (
    value.assetCount !== expectedAssets.length ||
    digestStudioValue(value.assets) !== digestStudioValue(expectedAssets)
  ) {
    throw new Error("file verification asset set differs from handoff");
  }
  const body = verificationBody(handoff, handoffSha256, expectedAssets);
  if (value.verificationSha256 !== digestStudioValue(body)) {
    throw new Error("file verification digest mismatch");
  }
  return value.verificationSha256;
}

export function compileStudioHandoffAcceptance(input) {
  const request = plain(input, "studio handoff acceptance request");
  exact(
    request,
    "studio handoff acceptance request",
    ["schema", "handoff", "consumerCommit", "acceptedAt", "fileVerification"],
    ["metadata"],
  );
  if (request.schema !== STUDIO_HANDOFF_ACCEPTANCE_REQUEST_SCHEMA) {
    throw new Error("acceptance request schema changed");
  }
  const handoffSha256 = verifyStudioHandoff(request.handoff);
  const fileVerificationSha256 = verifyStudioHandoffFileVerification(
    request.fileVerification,
    request.handoff,
  );
  const body = {
    schema: STUDIO_HANDOFF_ACCEPTANCE_SCHEMA,
    handoffId: request.handoff.handoffId,
    handoffSha256,
    consumer: {
      studio: request.handoff.consumer.studio,
      commit: commit(request.consumerCommit, "consumerCommit"),
    },
    acceptedAt: instant(request.acceptedAt, "acceptedAt"),
    fileVerificationSha256,
    metadata: jsonValue(request.metadata ?? {}, "metadata"),
    authority: {
      creativeApprovalIncluded: false,
      releaseApprovalIncluded: false,
      publicationAuthority: false,
      deploymentAuthority: false,
    },
  };
  const acceptanceId = `acceptance_${digestStudioValue(body).slice(0, 24)}`;
  const withIdentity = { ...body, acceptanceId };
  return deepFreeze({
    ...withIdentity,
    acceptanceSha256: digestStudioValue(withIdentity),
  });
}

export function verifyStudioHandoffAcceptance(input) {
  const value = plain(input, "studio handoff acceptance");
  exact(value, "studio handoff acceptance", [
    "schema",
    "handoffId",
    "handoffSha256",
    "consumer",
    "acceptedAt",
    "fileVerificationSha256",
    "metadata",
    "authority",
    "acceptanceId",
    "acceptanceSha256",
  ]);
  if (value.schema !== STUDIO_HANDOFF_ACCEPTANCE_SCHEMA) {
    throw new Error("studio handoff acceptance schema changed");
  }
  id(value.handoffId, "acceptance.handoffId");
  sha(value.handoffSha256, "acceptance.handoffSha256");
  sha(value.fileVerificationSha256, "acceptance.fileVerificationSha256");
  sha(value.acceptanceSha256, "acceptance.acceptanceSha256");
  const consumer = plain(value.consumer, "acceptance.consumer");
  exact(consumer, "acceptance.consumer", ["studio", "commit"]);
  id(consumer.studio, "acceptance.consumer.studio");
  commit(consumer.commit, "acceptance.consumer.commit");
  instant(value.acceptedAt, "acceptance.acceptedAt");
  jsonValue(value.metadata, "acceptance.metadata");
  const expectedAuthority = {
    creativeApprovalIncluded: false,
    releaseApprovalIncluded: false,
    publicationAuthority: false,
    deploymentAuthority: false,
  };
  if (digestStudioValue(value.authority) !== digestStudioValue(expectedAuthority)) {
    throw new Error("acceptance authority changed");
  }
  const withoutSha = { ...value };
  delete withoutSha.acceptanceSha256;
  const withoutIdentity = { ...withoutSha };
  delete withoutIdentity.acceptanceId;
  if (
    value.acceptanceId !==
    `acceptance_${digestStudioValue(withoutIdentity).slice(0, 24)}`
  ) {
    throw new Error("acceptance identity mismatch");
  }
  if (value.acceptanceSha256 !== digestStudioValue(withoutSha)) {
    throw new Error("acceptance digest mismatch");
  }
  return value.acceptanceSha256;
}

export const compileStudioHandoffAcceptanceReceipt = compileStudioHandoffAcceptance;
export const verifyStudioHandoffAcceptanceReceipt = verifyStudioHandoffAcceptance;
