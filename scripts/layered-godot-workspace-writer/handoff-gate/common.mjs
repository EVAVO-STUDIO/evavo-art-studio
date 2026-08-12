import path from "node:path";

import { fail } from "../../layered-godot-workspace-writer.mjs";

export const MAXIMUM_INPUT_BYTES = 32 * 1024 * 1024;
const MAXIMUM_SNAPSHOT_BYTES = MAXIMUM_INPUT_BYTES * 4 + 1024 * 1024;
const MAXIMUM_SNAPSHOT_NODES = 200_000;
const MAXIMUM_SNAPSHOT_DEPTH = 64;
const SHA256 = /^[0-9a-f]{64}$/u;
const DECIMAL = /^(?:0|[1-9][0-9]*)$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

export const AUDIT_AUTHORITY_KEYS = [
  "fileWritePerformed",
  "targetRepositoryMutationPerformed",
  "godotExecutionPerformed",
  "runtimeActivationPerformed",
  "gitCommitCreated",
  "gitPushPerformed",
  "deploymentPerformed",
  "publicationPerformed",
  "forcePushPerformed",
];

export const RUNTIME_AUTHORITY_KEYS = [
  "godotExecutionPerformed",
  "sandboxFileWritePerformed",
  "targetRepositoryReadPerformed",
  "targetRepositoryMutationPerformed",
  "targetRuntimeActivationPerformed",
  "gitCommitCreated",
  "gitPushPerformed",
  "deploymentPerformed",
  "publicationPerformed",
  "forcePushPerformed",
];

export const gateFail = (code, message, details = undefined) =>
  fail(`LAYERED_GODOT_HANDOFF_${code}`, message, details);

function snapshotInputFail(label, message) {
  gateFail("INPUT_INVALID", `${label} ${message}`);
}

function addSnapshotBytes(state, bytes, label) {
  state.bytes += bytes;
  if (state.bytes > MAXIMUM_SNAPSHOT_BYTES) {
    snapshotInputFail(label, "exceeds the bounded immutable-snapshot byte limit.");
  }
}

function addSnapshotNode(state, label, depth) {
  if (depth > MAXIMUM_SNAPSHOT_DEPTH) {
    snapshotInputFail(label, "exceeds the bounded immutable-snapshot depth.");
  }
  state.nodes += 1;
  if (state.nodes > MAXIMUM_SNAPSHOT_NODES) {
    snapshotInputFail(label, "exceeds the bounded immutable-snapshot node limit.");
  }
}

function inspectSnapshotObject(value, label) {
  try {
    return {
      isArray: Array.isArray(value),
      prototype: Object.getPrototypeOf(value),
      descriptors: Object.getOwnPropertyDescriptors(value),
    };
  } catch {
    snapshotInputFail(label, "could not be inspected safely.");
  }
}

function assertDataDescriptor(descriptor, label, { enumerable = true } = {}) {
  if (
    descriptor === undefined ||
    !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
    descriptor.get !== undefined ||
    descriptor.set !== undefined ||
    descriptor.enumerable !== enumerable
  ) {
    snapshotInputFail(label, "must be an enumerable data property without accessors.");
  }
}

function snapshotJsonInternal(value, label, state, depth, ancestors) {
  addSnapshotNode(state, label, depth);

  if (value === null) {
    addSnapshotBytes(state, 4, label);
    return null;
  }

  switch (typeof value) {
    case "string":
      addSnapshotBytes(state, Buffer.byteLength(value, "utf8"), label);
      return value;
    case "boolean":
      addSnapshotBytes(state, value ? 4 : 5, label);
      return value;
    case "number":
      if (!Number.isFinite(value)) {
        snapshotInputFail(label, "contains a non-finite number.");
      }
      addSnapshotBytes(state, 24, label);
      return value;
    case "object":
      break;
    default:
      snapshotInputFail(label, "must contain JSON-compatible data only.");
  }

  if (ancestors.has(value)) {
    snapshotInputFail(label, "contains a cyclic object graph.");
  }
  ancestors.add(value);

  try {
    const inspected = inspectSnapshotObject(value, label);
    const descriptorKeys = Reflect.ownKeys(inspected.descriptors);

    if (inspected.isArray) {
      if (inspected.prototype !== Array.prototype) {
        snapshotInputFail(label, "must use the intrinsic Array prototype.");
      }

      const lengthDescriptor = inspected.descriptors.length;
      if (
        lengthDescriptor === undefined ||
        !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
        !Number.isSafeInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < 0 ||
        lengthDescriptor.value > MAXIMUM_SNAPSHOT_NODES
      ) {
        snapshotInputFail(label, "has an invalid bounded array length.");
      }

      const length = lengthDescriptor.value;
      if (descriptorKeys.length !== length + 1) {
        snapshotInputFail(label, "must be a dense array without extra properties.");
      }

      const snapshot = new Array(length);
      for (const key of descriptorKeys) {
        if (typeof key !== "string") {
          snapshotInputFail(label, "contains a symbolic array property.");
        }
        if (key === "length") continue;
        const index = Number(key);
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index >= length ||
          String(index) !== key
        ) {
          snapshotInputFail(label, `contains unsupported array property ${key}.`);
        }
      }

      for (let index = 0; index < length; index += 1) {
        const key = String(index);
        const descriptor = inspected.descriptors[key];
        assertDataDescriptor(descriptor, `${label}[${index}]`);
        snapshot[index] = snapshotJsonInternal(
          descriptor.value,
          `${label}[${index}]`,
          state,
          depth + 1,
          ancestors,
        );
      }
      return Object.freeze(snapshot);
    }

    if (
      inspected.prototype !== Object.prototype &&
      inspected.prototype !== null
    ) {
      snapshotInputFail(label, "must use a plain JSON object prototype.");
    }

    const snapshot = {};
    for (const key of descriptorKeys) {
      if (typeof key !== "string") {
        snapshotInputFail(label, "contains a symbolic object property.");
      }
      const descriptor = inspected.descriptors[key];
      assertDataDescriptor(descriptor, `${label}.${key}`);
      addSnapshotBytes(state, Buffer.byteLength(key, "utf8"), label);
      Object.defineProperty(snapshot, key, {
        value: snapshotJsonInternal(
          descriptor.value,
          `${label}.${key}`,
          state,
          depth + 1,
          ancestors,
        ),
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
    return Object.freeze(snapshot);
  } finally {
    ancestors.delete(value);
  }
}

export function snapshotJsonValue(value, label = "handoffInput") {
  return snapshotJsonInternal(
    value,
    label,
    { bytes: 0, nodes: 0 },
    0,
    new WeakSet(),
  );
}

export function exactObject(value, keys, label, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    gateFail(code, `${label} must be an object.`);
  }
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      gateFail(code, `${label} contains unsupported field ${key}.`);
    }
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      gateFail(code, `${label} is missing required field ${key}.`);
    }
  }
  return value;
}

export function sha(value, label, code) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    gateFail(code, `${label} must be lowercase SHA-256.`);
  }
  return value;
}

export function utc(value, label, code) {
  if (typeof value !== "string" || value.length > 64) {
    gateFail(code, `${label} must be canonical UTC ISO-8601.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    gateFail(code, `${label} must be canonical UTC ISO-8601.`);
  }
  return value;
}

export function boundedText(value, label, maximum, code) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value.includes("\0")
  ) {
    gateFail(code, `${label} must be a bounded non-empty string.`);
  }
  return value;
}

export function repository(value, label, code) {
  boundedText(value, label, 240, code);
  if (!REPOSITORY.test(value)) {
    gateFail(code, `${label} must be OWNER/REPOSITORY.`);
  }
  return value;
}

export function absolutePath(value, label, code) {
  boundedText(value, label, 8192, code);
  if (!path.isAbsolute(value) || path.resolve(value) !== value) {
    gateFail(code, `${label} must be an absolute normalized path.`);
  }
  return value;
}

export function relativeResourcePath(value, label, code) {
  boundedText(value, label, 8192, code);
  if (
    value.includes("\\") ||
    value.startsWith("/") ||
    /^[A-Za-z]:\//u.test(value) ||
    path.posix.normalize(value) !== value ||
    value.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    gateFail(code, `${label} must be a canonical workspace-relative resource path.`);
  }
  return value;
}

export function safeBytes(value, label, code, { positive = false } = {}) {
  if (
    !Number.isSafeInteger(value) ||
    value < (positive ? 1 : 0)
  ) {
    gateFail(code, `${label} must be a ${positive ? "positive" : "non-negative"} safe integer.`);
  }
  return value;
}

export function decimalString(value, label, code) {
  if (typeof value !== "string" || value.length > 80 || !DECIMAL.test(value)) {
    gateFail(code, `${label} must be canonical non-negative decimal text.`);
  }
  return value;
}

export function validateFilesystemIdentity(value, label, code, expectedBytes) {
  const identity = exactObject(
    value,
    ["dev", "ino", "size", "mtimeNs"],
    label,
    code,
  );
  decimalString(identity.dev, `${label}.dev`, code);
  decimalString(identity.ino, `${label}.ino`, code);
  decimalString(identity.size, `${label}.size`, code);
  decimalString(identity.mtimeNs, `${label}.mtimeNs`, code);
  if (expectedBytes !== undefined && identity.size !== String(expectedBytes)) {
    gateFail(code, `${label}.size must bind the recorded byte length.`);
  }
  return identity;
}
