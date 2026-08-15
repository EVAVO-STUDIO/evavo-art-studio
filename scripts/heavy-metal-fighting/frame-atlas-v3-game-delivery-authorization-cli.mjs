import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { compileHmfAtlasV3GameDeliveryAuthorization } from "./frame-atlas-v3-game-delivery-authorization.mjs";

export const HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_CLI_REQUEST_SCHEMA =
  "evavo.heavy-metal-fighting-atlas-v3-game-delivery-authorization-cli-request.v1";

const FRAMES = Object.freeze(["bastion", "viper", "citadel", "mirage"]);
const GIT_SHA = /^[0-9a-f]{40}$/u;
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_ATLAS_BYTES = 128 * 1024 * 1024;
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const MAX_FRAME_BYTES = 512 * 1024 * 1024;
const REQUEST_FIELDS = Object.freeze([
  "schema",
  "expectedGameHead",
  "gameValidationAdmissionPath",
  "gameValidationReceiptPath",
  "humanAuthorizationPath",
  "frames",
]);
const FRAME_FIELDS = Object.freeze(["frameId", "planPath", "buildRoot"]);

function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_ATLAS_V3_DELIVERY_AUTHORIZATION_CLI_INVALID: ${message}`);
}
function assert(condition, message) {
  if (!condition) fail(message);
}
function exactObject(value, fields, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  assert(actual.length === expected.length && actual.every((key, index) => key === expected[index]), `${label} fields must be exactly: ${expected.join(", ")}.`);
  return value;
}
function safePathString(value, label) {
  assert(typeof value === "string" && value.length > 0 && value === value.trim(), `${label} must be a non-empty trimmed path.`);
  assert(!value.includes("\0"), `${label} may not contain NUL bytes.`);
  return value;
}
function resolveRequestPath(requestDirectory, value, label) {
  return path.resolve(requestDirectory, safePathString(value, label));
}
function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}
function sameStableFile(left, right) {
  return sameIdentity(left, right) && left.size === right.size && left.mtimeNs === right.mtimeNs && left.nlink === right.nlink;
}
async function inspectPathChain(resolved, label, maximumBytes) {
  const parsed = path.parse(resolved);
  const segments = path.relative(parsed.root, resolved).split(path.sep).filter(Boolean);
  let current = parsed.root;
  const entries = [];
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    const info = await lstat(current, { bigint: true });
    if (info.isSymbolicLink()) fail(`${label} path may not contain a symbolic link or junction: ${current}`);
    const final = index === segments.length - 1;
    if (!final && !info.isDirectory()) fail(`${label} parent path must remain a directory: ${current}`);
    entries.push(Object.freeze({ path: current, info }));
  }
  assert(entries.length > 0, `${label} must name a file, not a filesystem root.`);
  const endpoint = entries.at(-1).info;
  assert(endpoint.isFile(), `${label} must resolve to a regular file.`);
  assert(endpoint.nlink === 1n, `${label} must have exactly one filesystem link.`);
  assert(endpoint.size >= 1n && endpoint.size <= BigInt(maximumBytes), `${label} exceeds the admitted byte bounds.`);
  return Object.freeze(entries);
}
function assertChainUnchanged(before, after, label) {
  assert(before.length === after.length, `${label} path changed while being admitted.`);
  before.forEach((prior, index) => {
    const current = after[index];
    assert(prior.path === current.path && sameIdentity(prior.info, current.info), `${label} path component changed identity while being admitted: ${prior.path}`);
  });
}
export async function readHmfAtlasV3StableSingleLinkFile(filePath, { label = "input file", maximumBytes = MAX_JSON_BYTES } = {}) {
  const resolved = path.resolve(filePath);
  const initialChain = await inspectPathChain(resolved, label, maximumBytes);
  const initial = initialChain.at(-1).info;
  const noFollow = process.platform === "win32" ? 0 : (constants.O_NOFOLLOW ?? 0);
  const handle = await open(resolved, constants.O_RDONLY | noFollow);
  try {
    const opened = await handle.stat({ bigint: true });
    assert(opened.isFile() && opened.nlink === 1n, `${label} must remain a single-link regular file after opening.`);
    assert(sameStableFile(initial, opened), `${label} changed identity or metadata before reading.`);
    assertChainUnchanged(initialChain, await inspectPathChain(resolved, label, maximumBytes), label);
    const bytes = Buffer.allocUnsafe(Number(opened.size));
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) fail(`${label} was truncated while being read.`);
      offset += bytesRead;
    }
    const probe = Buffer.allocUnsafe(1);
    const { bytesRead: extra } = await handle.read(probe, 0, 1, offset);
    const finalHandle = await handle.stat({ bigint: true });
    assert(extra === 0 && sameStableFile(opened, finalHandle), `${label} changed while being read.`);
    const finalChain = await inspectPathChain(resolved, label, maximumBytes);
    assertChainUnchanged(initialChain, finalChain, label);
    assert(sameStableFile(finalHandle, finalChain.at(-1).info), `${label} path changed identity after reading.`);
    return bytes;
  } finally {
    await handle.close();
  }
}
function decodeJson(bytes, label) {
  const body = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch (error) {
    fail(`${label} is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function readJson(filePath, label, maximumBytes = MAX_JSON_BYTES) {
  return decodeJson(await readHmfAtlasV3StableSingleLinkFile(filePath, { label, maximumBytes }), label);
}
function admitRequest(value) {
  exactObject(value, REQUEST_FIELDS, "delivery authorization CLI request");
  assert(value.schema === HMF_ATLAS_V3_GAME_DELIVERY_AUTHORIZATION_CLI_REQUEST_SCHEMA, "delivery authorization CLI request schema drifted.");
  assert(typeof value.expectedGameHead === "string" && GIT_SHA.test(value.expectedGameHead), "expectedGameHead must be a lowercase 40-character Git SHA.");
  safePathString(value.gameValidationAdmissionPath, "gameValidationAdmissionPath");
  safePathString(value.gameValidationReceiptPath, "gameValidationReceiptPath");
  safePathString(value.humanAuthorizationPath, "humanAuthorizationPath");
  assert(Array.isArray(value.frames) && value.frames.length === FRAMES.length, "frames must contain exactly four canonical Frame entries.");
  value.frames.forEach((entry, index) => {
    exactObject(entry, FRAME_FIELDS, `frames[${index}]`);
    assert(entry.frameId === FRAMES[index], `frames[${index}] must be ${FRAMES[index]}.`);
    safePathString(entry.planPath, `frames[${index}].planPath`);
    safePathString(entry.buildRoot, `frames[${index}].buildRoot`);
  });
  return value;
}
function pathInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
export function preflightHmfAtlasV3DeliveryAuthorizationPlanPaths(plan, frameId) {
  assert(plan && typeof plan === "object" && !Array.isArray(plan), `${frameId} plan must be an object.`);
  assert(plan.frameId === frameId, `${frameId} plan frameId drifted.`);
  assert(typeof plan.workspaceRoot === "string" && path.isAbsolute(plan.workspaceRoot), `${frameId} plan workspaceRoot must be absolute.`);
  assert(typeof plan.allowedSourceRoot === "string" && path.isAbsolute(plan.allowedSourceRoot), `${frameId} plan allowedSourceRoot must be absolute.`);
  const workspaceRoot = path.resolve(plan.workspaceRoot);
  const expectedSourceRoot = path.resolve(workspaceRoot, "masters", "frames", frameId, "sprites");
  assert(path.resolve(plan.allowedSourceRoot) === expectedSourceRoot, `${frameId} plan allowedSourceRoot drifted.`);
  assert(plan.outputs && typeof plan.outputs === "object", `${frameId} plan outputs are required.`);
  assert(plan.outputs.image === `${frameId}.png`, `${frameId} plan image output drifted.`);
  assert(plan.outputs.receipt === `${frameId}.atlas-v3.receipt.json`, `${frameId} plan receipt output drifted.`);
  assert(plan.outputs.recommendedWorkspaceParent === `exports/runtime/frames/${frameId}`, `${frameId} plan recommendedWorkspaceParent drifted.`);
  assert(Array.isArray(plan.sources) && plan.sources.length === 224, `${frameId} plan must contain exactly 224 sources.`);
  const sourcePaths = plan.sources.map((source, index) => {
    assert(source && typeof source === "object" && !Array.isArray(source), `${frameId} source ${index} must be an object.`);
    assert(typeof source.masterRelativePath === "string" && typeof source.sourcePath === "string", `${frameId} source ${index} paths are required.`);
    const parts = source.masterRelativePath.split("/");
    assert(!path.posix.isAbsolute(source.masterRelativePath) && !parts.includes("..") && !parts.includes(""), `${frameId} source ${index} masterRelativePath is unsafe.`);
    const expected = path.resolve(workspaceRoot, ...parts);
    const actual = path.resolve(source.sourcePath);
    assert(actual === expected, `${frameId} source ${index} sourcePath drifted from masterRelativePath.`);
    assert(pathInside(actual, expectedSourceRoot), `${frameId} source ${index} escaped allowedSourceRoot.`);
    return actual;
  });
  return Object.freeze({ workspaceRoot, expectedSourceRoot, sourcePaths: Object.freeze(sourcePaths) });
}

export async function loadHmfAtlasV3GameDeliveryAuthorizationCliInput(requestPath) {
  const resolvedRequest = path.resolve(requestPath);
  const requestDirectory = path.dirname(resolvedRequest);
  const request = admitRequest(decodeJson(await readHmfAtlasV3StableSingleLinkFile(resolvedRequest, { label: "--request", maximumBytes: MAX_REQUEST_BYTES }), "--request"));
  const gameValidationAdmission = await readJson(resolveRequestPath(requestDirectory, request.gameValidationAdmissionPath, "gameValidationAdmissionPath"), "game validation admission", MAX_JSON_BYTES);
  const gameValidationReceiptBytes = await readHmfAtlasV3StableSingleLinkFile(resolveRequestPath(requestDirectory, request.gameValidationReceiptPath, "gameValidationReceiptPath"), { label: "game validation receipt", maximumBytes: MAX_JSON_BYTES });
  const humanAuthorization = await readJson(resolveRequestPath(requestDirectory, request.humanAuthorizationPath, "humanAuthorizationPath"), "human authorization", 64 * 1024);
  const atlasBuildEvidence = [];
  let totalBinaryBytes = 0;
  for (const frameRequest of request.frames) {
    const frameId = frameRequest.frameId;
    const plan = await readJson(resolveRequestPath(requestDirectory, frameRequest.planPath, `${frameId} planPath`), `${frameId} plan`, MAX_JSON_BYTES);
    const preflight = preflightHmfAtlasV3DeliveryAuthorizationPlanPaths(plan, frameId);
    const buildRoot = resolveRequestPath(requestDirectory, frameRequest.buildRoot, `${frameId} buildRoot`);
    const expectedParent = path.resolve(preflight.workspaceRoot, "exports", "runtime", "frames", frameId);
    assert(path.dirname(buildRoot) === expectedParent, `${frameId} buildRoot must be a direct child of ${expectedParent}.`);
    const receipt = await readJson(path.join(buildRoot, plan.outputs.receipt), `${frameId} build receipt`, MAX_JSON_BYTES);
    const atlasPngBytes = await readHmfAtlasV3StableSingleLinkFile(path.join(buildRoot, plan.outputs.image), { label: `${frameId} atlas PNG`, maximumBytes: MAX_ATLAS_BYTES });
    const sourcePngBytes = [];
    let frameBinaryBytes = atlasPngBytes.length;
    for (const [index, sourcePath] of preflight.sourcePaths.entries()) {
      const bytes = await readHmfAtlasV3StableSingleLinkFile(sourcePath, { label: `${frameId} source PNG ${index}`, maximumBytes: MAX_SOURCE_BYTES });
      frameBinaryBytes += bytes.length;
      assert(frameBinaryBytes <= MAX_FRAME_BYTES, `${frameId} binary evidence exceeds the per-frame aggregate bound.`);
      sourcePngBytes.push(bytes);
    }
    totalBinaryBytes += frameBinaryBytes;
    assert(totalBinaryBytes <= MAX_FRAME_BYTES * FRAMES.length, "delivery authorization binary evidence exceeds the aggregate bound.");
    atlasBuildEvidence.push({ frameId, plan, receipt, atlasPngBytes, sourcePngBytes });
  }
  return Object.freeze({
    gameValidationAdmission,
    gameValidationReceiptBytes,
    expectedGameHead: request.expectedGameHead,
    atlasBuildEvidence: Object.freeze(atlasBuildEvidence),
    humanAuthorization,
  });
}

export async function compileHmfAtlasV3GameDeliveryAuthorizationFromRequestFile(requestPath) {
  return compileHmfAtlasV3GameDeliveryAuthorization(
    await loadHmfAtlasV3GameDeliveryAuthorizationCliInput(requestPath),
  );
}
