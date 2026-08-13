import { types as utilTypes } from "node:util";
import {
  MAXIMUM_VERIFIER_INPUT_BYTES,
  verifierFail,
} from "./protocol.mjs";

const MAXIMUM_SNAPSHOT_NODES = 100_000;
const MAXIMUM_SNAPSHOT_DEPTH = 64;

function fail(label, message) {
  verifierFail("INPUT_INVALID", `${label} ${message}`);
}

function capture(value, label, state, depth, ancestors) {
  if (depth > MAXIMUM_SNAPSHOT_DEPTH) fail(label, "exceeds the bounded snapshot depth.");
  state.nodes += 1;
  if (state.nodes > MAXIMUM_SNAPSHOT_NODES) fail(label, "exceeds the bounded snapshot node limit.");

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    state.bytes += value === null ? 4 : Buffer.byteLength(String(value), "utf8");
    if (state.bytes > MAXIMUM_VERIFIER_INPUT_BYTES) fail(label, "exceeds the bounded snapshot byte limit.");
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(label, "contains a non-finite number.");
    state.bytes += 24;
    if (state.bytes > MAXIMUM_VERIFIER_INPUT_BYTES) fail(label, "exceeds the bounded snapshot byte limit.");
    return value;
  }
  if (typeof value !== "object") fail(label, "must contain JSON-compatible data only.");
  if (utilTypes.isProxy(value)) fail(label, "must not be a Proxy value.");
  if (ancestors.has(value)) fail(label, "contains a cyclic object graph.");
  ancestors.add(value);
  try {
    let descriptors;
    let prototype;
    let isArray;
    try {
      descriptors = Object.getOwnPropertyDescriptors(value);
      prototype = Object.getPrototypeOf(value);
      isArray = Array.isArray(value);
    } catch {
      fail(label, "could not be inspected safely.");
    }
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string")) fail(label, "contains a symbolic property.");

    if (isArray) {
      if (prototype !== Array.prototype) fail(label, "must use the intrinsic Array prototype.");
      const length = descriptors.length?.value;
      if (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1) {
        fail(label, "must be a dense bounded array without extra properties.");
      }
      const output = new Array(length);
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set || !descriptor.enumerable) {
          fail(`${label}[${index}]`, "must be an enumerable data property without accessors.");
        }
        output[index] = capture(descriptor.value, `${label}[${index}]`, state, depth + 1, ancestors);
      }
      return Object.freeze(output);
    }

    if (prototype !== Object.prototype && prototype !== null) fail(label, "must use a plain JSON object prototype.");
    const output = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set || !descriptor.enumerable) {
        fail(`${label}.${key}`, "must be an enumerable data property without accessors.");
      }
      state.bytes += Buffer.byteLength(key, "utf8");
      if (state.bytes > MAXIMUM_VERIFIER_INPUT_BYTES) fail(label, "exceeds the bounded snapshot byte limit.");
      Object.defineProperty(output, key, {
        value: capture(descriptor.value, `${label}.${key}`, state, depth + 1, ancestors),
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
    return Object.freeze(output);
  } finally {
    ancestors.delete(value);
  }
}

export function snapshotJsonValue(value, label = "gitPushVerificationInput") {
  return capture(value, label, { bytes: 0, nodes: 0 }, 0, new WeakSet());
}
