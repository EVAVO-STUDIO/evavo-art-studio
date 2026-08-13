import { types as utilTypes } from "node:util";
import { HTTPS_GITHUB_ORIGIN, verifierFail } from "./protocol.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const GIT_OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const BRANCH = /^(?!.*(?:\.\.|@\{|\\|\s|~|\^|:|\?|\*|\[))[A-Za-z0-9._/-]+$/u;

export function inspectPlainObject(value, label, code = "INPUT_INVALID") {
  if (value === null || typeof value !== "object" || Array.isArray(value) || utilTypes.isProxy(value)) {
    verifierFail(code, `${label} must be a plain non-Proxy object.`);
  }
  let descriptors;
  let prototype;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
    prototype = Object.getPrototypeOf(value);
  } catch {
    verifierFail(code, `${label} could not be inspected safely.`);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    verifierFail(code, `${label} must use a plain object prototype.`);
  }
  return descriptors;
}

export function exactObject(value, keys, label, code = "INPUT_INVALID") {
  const descriptors = inspectPlainObject(value, label, code);
  const actualKeys = Reflect.ownKeys(descriptors);
  if (actualKeys.some((key) => typeof key !== "string")) verifierFail(code, `${label} contains a symbolic property.`);
  const allowed = new Set(keys);
  for (const key of actualKeys) {
    if (!allowed.has(key)) verifierFail(code, `${label} contains unsupported field ${key}.`);
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set || !descriptor.enumerable) {
      verifierFail(code, `${label}.${key} must be an enumerable data property without accessors.`);
    }
  }
  for (const key of keys) if (!Object.hasOwn(descriptors, key)) verifierFail(code, `${label} is missing required field ${key}.`);
  return value;
}

export function repositoryName(value, label, code = "INPUT_INVALID") {
  if (typeof value !== "string" || !REPOSITORY.test(value)) verifierFail(code, `${label} must be OWNER/REPOSITORY.`);
  return value;
}

export function gitOid(value, label, code = "PUSH_RECEIPT_INVALID") {
  if (typeof value !== "string" || !GIT_OID.test(value)) verifierFail(code, `${label} must be a Git object ID.`);
  return value;
}

export function sha256(value, label, code = "PUSH_RECEIPT_INVALID") {
  if (typeof value !== "string" || !SHA256.test(value)) verifierFail(code, `${label} must be lowercase SHA-256.`);
  return value;
}

export function branchName(value, label, code = "PUSH_RECEIPT_INVALID") {
  if (
    typeof value !== "string" || value.length < 1 || value.length > 240 ||
    !BRANCH.test(value) || value.startsWith("/") || value.endsWith("/") || value.endsWith(".")
  ) verifierFail(code, `${label} must be a bounded named Git branch.`);
  return value;
}

export function canonicalUtc(value, label, code = "PUSH_RECEIPT_INVALID") {
  if (typeof value !== "string" || value.length < 1 || value.length > 64) {
    verifierFail(code, `${label} must be canonical UTC ISO-8601.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    verifierFail(code, `${label} must be canonical UTC ISO-8601.`);
  }
  return value;
}

export function parseOriginRepository(originUrl, label, code = "PUSH_RECEIPT_INVALID") {
  if (typeof originUrl !== "string" || originUrl.length > 2048) verifierFail(code, `${label} must be an HTTPS GitHub origin.`);
  const match = HTTPS_GITHUB_ORIGIN.exec(originUrl);
  if (!match) verifierFail(code, `${label} must be an exact HTTPS github.com origin.`);
  return `${match[1]}/${match[2]}`;
}
