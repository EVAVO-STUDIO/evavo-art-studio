import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";
import { verifierFail } from "./protocol.mjs";

function canonicalize(value, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) verifierFail("INPUT_INVALID", "Canonical payload contains a non-finite number.");
    return value;
  }
  if (
    typeof value !== "object" || value === undefined ||
    ArrayBuffer.isView(value) || utilTypes.isProxy(value)
  ) verifierFail("INPUT_INVALID", "Canonical payload contains a non-JSON value.");
  if (seen.has(value)) verifierFail("INPUT_INVALID", "Canonical payload contains a cycle.");
  seen.add(value);
  let output;
  if (Array.isArray(value)) {
    output = value.map((entry) => canonicalize(entry, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      verifierFail("INPUT_INVALID", "Canonical payload contains a non-plain object.");
    }
    output = Object.fromEntries(
      Object.keys(value).sort().map((key) => {
        if (value[key] === undefined) verifierFail("INPUT_INVALID", `Canonical payload property ${key} is undefined.`);
        return [key, canonicalize(value[key], seen)];
      }),
    );
  }
  seen.delete(value);
  return output;
}

export function canonicalSha256(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value)), "utf8").digest("hex");
}

export function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) deepFreeze(entry);
  }
  return value;
}
