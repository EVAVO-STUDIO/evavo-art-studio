import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import {
  asArray,
  asInteger,
  asObject,
  asString,
  assert,
  canonicalJson,
  freeze,
  sha256,
  unique,
} from "./common.mjs";
import { compileCampaign } from "./compile.mjs";
import { BUNDLE_SCHEMA, PLAN_SCHEMA } from "./model.mjs";

function bundlePartPath(value, requestPath, label) {
  const relative = asString(value, label, { maximum: 1000 });
  assert(!relative.includes("\\"), `${label} must use POSIX forward slashes.`);
  assert(!path.posix.isAbsolute(relative), `${label} must be relative.`);
  const normalized = path.posix.normalize(relative);
  assert(normalized === relative && normalized !== "." && !normalized.startsWith("../"), `${label} may not escape the bundle directory.`);
  assert(/\.payload\.b64\.part-[0-9]{3}$/.test(relative), `${label} must end with .payload.b64.part-###.`);
  return path.resolve(path.dirname(requestPath), ...relative.split("/"));
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

async function readStableRegularFile(filePath, label, { maximumBytes = 2 * 1024 * 1024 } = {}) {
  const before = await lstat(filePath);
  assert(!before.isSymbolicLink(), `${label} must not be a symbolic link.`);
  assert(before.isFile(), `${label} must be a regular file.`);
  assert(before.nlink === 1, `${label} must have exactly one hard link.`);
  assert(before.size > 0 && before.size <= maximumBytes, `${label} must be between 1 byte and ${maximumBytes} bytes.`);
  const content = await readFile(filePath);
  const after = await lstat(filePath);
  assert(sameFileIdentity(before, after), `${label} changed while it was being read.`);
  assert(content.length === before.size, `${label} byte count changed while it was being read.`);
  return content;
}

function parseJsonBytes(content, label) {
  try {
    return JSON.parse(content.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function loadCampaignRequestFile(requestPath) {
  const requestBytes = await readStableRegularFile(requestPath, "campaign request");
  const loaded = parseJsonBytes(requestBytes, "campaign request");
  if (loaded?.schema !== BUNDLE_SCHEMA) return loaded;
  const bundle = asObject(loaded, "bundle");
  assert(bundle.compression === "gzip", "bundle.compression must be gzip.");
  assert(bundle.encoding === "base64", "bundle.encoding must be base64.");
  const payloadSha256 = asString(bundle.payloadSha256, "bundle.payloadSha256", { pattern: /^[0-9a-f]{64}$/ });
  const requestSha256 = asString(bundle.requestSha256, "bundle.requestSha256", { pattern: /^[0-9a-f]{64}$/ });
  const encodedBytes = asInteger(bundle.encodedBytes, "bundle.encodedBytes", { minimum: 1, maximum: 3 * 1024 * 1024 });
  const payloadBytes = asInteger(bundle.payloadBytes, "bundle.payloadBytes", { minimum: 1, maximum: 2 * 1024 * 1024 });
  const partRecords = asArray(bundle.payloadParts, "bundle.payloadParts", { minimum: 1 }).map((entry, index) => {
    const part = asObject(entry, `bundle.payloadParts[${index}]`);
    return {
      path: bundlePartPath(part.path, requestPath, `bundle.payloadParts[${index}].path`),
      relativePath: asString(part.path, `bundle.payloadParts[${index}].path`, { maximum: 1000 }),
      bytes: asInteger(part.bytes, `bundle.payloadParts[${index}].bytes`, { minimum: 2, maximum: 64 * 1024 }),
      sha256: asString(part.sha256, `bundle.payloadParts[${index}].sha256`, { pattern: /^[0-9a-f]{64}$/ }),
    };
  });
  assert(partRecords.length <= 64, "bundle.payloadParts may contain at most 64 parts.");
  unique(partRecords.map((part) => part.relativePath), "bundle payload part paths");
  let observedEncodedBytes = 0;
  const encodedParts = [];
  for (const [index, part] of partRecords.entries()) {
    const raw = await readStableRegularFile(part.path, `bundle payload part ${index + 1}`, { maximumBytes: 64 * 1024 });
    assert(raw.length === part.bytes, `bundle.payloadParts[${index}].bytes does not match the retained part.`);
    assert(sha256(raw) === part.sha256, `bundle.payloadParts[${index}].sha256 does not match the retained part.`);
    assert(raw.at(-1) === 0x0a, `bundle.payloadParts[${index}] must end with one newline.`);
    const text = raw.toString("ascii");
    assert(Buffer.from(text, "ascii").equals(raw), `bundle.payloadParts[${index}] must contain ASCII only.`);
    const body = text.slice(0, -1);
    assert(body.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(body), `bundle.payloadParts[${index}] contains invalid base64 text.`);
    observedEncodedBytes += raw.length;
    encodedParts.push(body);
  }
  assert(observedEncodedBytes === encodedBytes, "bundle.encodedBytes does not match the retained parts.");
  const encoded = encodedParts.join("");
  assert(encoded.length % 4 === 0, "bundle base64 length must be divisible by four.");
  const compressed = Buffer.from(encoded, "base64");
  assert(compressed.length === payloadBytes, "bundle.payloadBytes does not match the decoded payload.");
  assert(compressed.toString("base64") === encoded, "bundle base64 payload is not canonical.");
  assert(sha256(compressed) === payloadSha256, "bundle.payloadSha256 does not match the compressed payload.");
  let uncompressed;
  try {
    uncompressed = gunzipSync(compressed, { maxOutputLength: 2 * 1024 * 1024 });
  } catch (error) {
    throw new Error(`Unable to decompress campaign bundle: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(sha256(uncompressed) === requestSha256, "bundle.requestSha256 does not match the uncompressed request.");
  return parseJsonBytes(uncompressed, "bundled campaign request");
}

export async function compileCampaignFile(requestPath) {
  return compileCampaign(await loadCampaignRequestFile(requestPath));
}

export function campaignSummary(plan) {
  assert(plan?.schema === PLAN_SCHEMA, `plan.schema must equal ${PLAN_SCHEMA}.`);
  return freeze({
    schema: "evavo.game-art-campaign-summary.v1",
    campaignId: plan.campaignId,
    planSha256: plan.planSha256,
    totals: plan.totals,
    games: plan.games.map((game) => freeze({
      id: game.id,
      title: game.title,
      productionOrder: game.productionOrder,
      totals: game.totals,
      families: game.families.map((family) => freeze({
        id: family.id,
        label: family.label,
        phase: family.phase,
        images: family.images,
        batches: family.batches,
      })),
    })),
    fontPhase: plan.fontPhase,
    authority: plan.authority,
  });
}

export function getCampaignBatch(plan, gameId, batchNumber) {
  assert(plan?.schema === PLAN_SCHEMA, `plan.schema must equal ${PLAN_SCHEMA}.`);
  const game = plan.games.find((item) => item.id === gameId);
  assert(game, `Unknown game ${gameId}.`);
  const number = asInteger(batchNumber, "batchNumber", { minimum: 1, maximum: game.batches.length });
  return game.batches[number - 1];
}

export function verifyPlanSelfHash(plan) {
  const { planSha256, ...withoutHash } = plan;
  assert(/^[0-9a-f]{64}$/.test(planSha256), "planSha256 must be a lowercase SHA-256.");
  assert(sha256(withoutHash) === planSha256, "planSha256 does not match the canonical plan payload.");
  return true;
}

export function serializePlan(plan) {
  verifyPlanSelfHash(plan);
  return canonicalJson(plan);
}
