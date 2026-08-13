import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";
import { MAXIMUM_GIT_OUTPUT_BYTES, verifierFail } from "./protocol.mjs";
import { exactObject, inspectPlainObject } from "./validation.mjs";

export function copyStableBuffer(value, label, code = "GIT_RESULT_INVALID") {
  if (!Buffer.isBuffer(value) || utilTypes.isProxy(value)) verifierFail(code, `${label} must be a non-Proxy Buffer.`);
  if (typeof SharedArrayBuffer !== "undefined" && value.buffer instanceof SharedArrayBuffer) {
    verifierFail(code, `${label} must not use shared memory.`);
  }
  const first = Buffer.from(value);
  const second = Buffer.from(value);
  if (!first.equals(second)) verifierFail(code, `${label} changed while it was captured.`);
  return first;
}

export function captureGitResult(value, allowedExitCodes) {
  const result = exactObject(
    value,
    ["exitCode", "signal", "stdout", "stderr"],
    "runGit result",
    "GIT_RESULT_INVALID",
  );
  if (!Number.isInteger(result.exitCode) || !allowedExitCodes.includes(result.exitCode)) {
    verifierFail("GIT_RESULT_INVALID", "Git result exit code is outside the admitted set.", {
      allowedExitCodes,
      actualExitCode: result.exitCode,
    });
  }
  if (result.signal !== null && (typeof result.signal !== "string" || result.signal.length > 64)) {
    verifierFail("GIT_RESULT_INVALID", "Git result signal is invalid.");
  }
  const stdout = copyStableBuffer(result.stdout, "runGit result.stdout");
  const stderr = copyStableBuffer(result.stderr, "runGit result.stderr");
  if (stdout.byteLength + stderr.byteLength > MAXIMUM_GIT_OUTPUT_BYTES) {
    verifierFail("GIT_RESULT_INVALID", "Git result exceeds the governed output byte limit.");
  }
  return Object.freeze({ exitCode: result.exitCode, signal: result.signal, stdout, stderr });
}

export function captureStringArray(value, label) {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    verifierFail("GIT_COMMAND_REJECTED", `${label} must be an intrinsic non-Proxy array.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) {
    verifierFail("GIT_COMMAND_REJECTED", `${label} must be dense without extra properties.`);
  }
  const output = new Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      !descriptor || !Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set ||
      !descriptor.enumerable || typeof descriptor.value !== "string" ||
      descriptor.value.length > 8192 || descriptor.value.includes("\0")
    ) verifierFail("GIT_COMMAND_REJECTED", `${label}[${index}] must be a bounded string data property.`);
    output[index] = descriptor.value;
  }
  return Object.freeze(output);
}

export function captureStableFileRead(value, label) {
  const descriptors = inspectPlainObject(value, label);
  const allowed = new Set(["data", "bytes", "sha256", "identity"]);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      verifierFail("INPUT_INVALID", `${label} contains unsupported field ${String(key)}.`);
    }
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set || !descriptor.enumerable) {
      verifierFail("INPUT_INVALID", `${label}.${key} must be an enumerable data property without accessors.`);
    }
  }
  for (const key of ["data", "bytes", "sha256"]) {
    if (!Object.hasOwn(descriptors, key)) verifierFail("INPUT_INVALID", `${label} is missing stable file evidence ${key}.`);
  }
  const data = copyStableBuffer(descriptors.data.value, `${label}.data`, "INPUT_INVALID");
  const bytes = descriptors.bytes.value;
  const recordedSha256 = descriptors.sha256.value;
  if (!Number.isSafeInteger(bytes) || bytes !== data.byteLength || bytes < 0) {
    verifierFail("INPUT_INVALID", `${label}.bytes must equal captured data length.`);
  }
  const digest = createHash("sha256").update(data).digest("hex");
  if (recordedSha256 !== digest) verifierFail("INPUT_INVALID", `${label}.sha256 must equal captured data.`);
  return Object.freeze({ data, bytes, sha256: digest });
}
