import { types as utilTypes } from "node:util";
import {
  MAXIMUM_GIT_OUTPUT_BYTES,
  MAXIMUM_LOCAL_TIMEOUT_MS,
  MAXIMUM_NETWORK_TIMEOUT_MS,
  verifierFail,
} from "./protocol.mjs";
import { inspectPlainObject } from "./validation.mjs";

export function captureGitOptions(value = {}) {
  const descriptors = inspectPlainObject(value, "runGit options");
  const allowedKeys = new Set([
    "timeoutMs", "maximumBytes", "allowedExitCodes", "allowAnyExitCode", "errorCode",
  ]);
  const captured = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !allowedKeys.has(key)) {
      verifierFail("GIT_COMMAND_REJECTED", `runGit options contains unsupported field ${String(key)}.`);
    }
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set || !descriptor.enumerable) {
      verifierFail("GIT_COMMAND_REJECTED", `runGit options.${key} must be an enumerable data property without accessors.`);
    }
    captured[key] = descriptor.value;
  }
  const timeoutMs = Object.hasOwn(captured, "timeoutMs") ? captured.timeoutMs : MAXIMUM_LOCAL_TIMEOUT_MS;
  const maximumBytes = Object.hasOwn(captured, "maximumBytes") ? captured.maximumBytes : MAXIMUM_GIT_OUTPUT_BYTES;
  const allowedExitCodes = Object.hasOwn(captured, "allowedExitCodes") ? captured.allowedExitCodes : [0];
  const allowAnyExitCode = Object.hasOwn(captured, "allowAnyExitCode") ? captured.allowAnyExitCode : false;
  const errorCode = Object.hasOwn(captured, "errorCode") ? captured.errorCode : "VERIFIER_GIT_FAILED";
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAXIMUM_NETWORK_TIMEOUT_MS) {
    verifierFail("GIT_COMMAND_REJECTED", "Git timeout is outside the verifier limit.");
  }
  if (!Number.isInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > MAXIMUM_GIT_OUTPUT_BYTES) {
    verifierFail("GIT_COMMAND_REJECTED", "Git output limit is outside the verifier limit.");
  }
  if (!Array.isArray(allowedExitCodes) || utilTypes.isProxy(allowedExitCodes) || Object.getPrototypeOf(allowedExitCodes) !== Array.prototype) {
    verifierFail("GIT_COMMAND_REJECTED", "Git allowed exit codes must be an intrinsic non-Proxy array.");
  }
  const descriptorsByIndex = Object.getOwnPropertyDescriptors(allowedExitCodes);
  if (allowedExitCodes.length < 1 || Reflect.ownKeys(descriptorsByIndex).length !== allowedExitCodes.length + 1) {
    verifierFail("GIT_COMMAND_REJECTED", "Git allowed exit codes must be dense without extra properties.");
  }
  const ownedExitCodes = new Array(allowedExitCodes.length);
  for (let index = 0; index < allowedExitCodes.length; index += 1) {
    const descriptor = descriptorsByIndex[String(index)];
    if (
      !descriptor || !Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set ||
      !descriptor.enumerable || !Number.isInteger(descriptor.value) ||
      descriptor.value < 0 || descriptor.value > 255
    ) verifierFail("GIT_COMMAND_REJECTED", `Git allowed exit code ${index} is invalid.`);
    ownedExitCodes[index] = descriptor.value;
  }
  if (allowAnyExitCode !== false) verifierFail("GIT_COMMAND_REJECTED", "Verifier Git calls may not accept arbitrary exit codes.");
  if (typeof errorCode !== "string" || errorCode.length < 1 || errorCode.length > 128 || errorCode.includes("\0")) {
    verifierFail("GIT_COMMAND_REJECTED", "Git error code is invalid.");
  }
  return Object.freeze({
    timeoutMs,
    maximumBytes,
    allowedExitCodes: Object.freeze(ownedExitCodes),
    allowAnyExitCode: false,
    errorCode,
  });
}
