import { types as utilTypes } from "node:util";
import {
  inspectOrigin as inspectPushOrigin,
  readRemoteHead as readPushRemoteHead,
  runGit as runPushGit,
} from "../layered-godot-git-push-operator.mjs";
import { verifierFail } from "./protocol.mjs";
import {
  exactObject,
  inspectPlainObject,
  parseOriginRepository,
  repositoryName,
} from "./validation.mjs";

const KEYS = [
  "complete", "inspectWorkspaceRoot", "sameFilesystemPath", "runGit",
  "resolveOrigin", "readRemoteHead", "now",
];
const FUNCTION_KEYS = KEYS.filter((entry) => entry !== "complete");

export function captureDependencies(value) {
  const descriptors = inspectPlainObject(value, "dependencies");
  const allowed = new Set(KEYS);
  const captured = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") verifierFail("INPUT_INVALID", "dependencies contains a symbolic property.");
    if (!allowed.has(key)) verifierFail("INPUT_INVALID", `dependencies contains unsupported field ${key}.`);
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set || !descriptor.enumerable) {
      verifierFail("INPUT_INVALID", `dependencies.${key} must be an enumerable data property without accessors.`);
    }
    if (utilTypes.isProxy(descriptor.value)) verifierFail("INPUT_INVALID", `dependencies.${key} must not be a Proxy value.`);
    Object.defineProperty(captured, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  if (Object.hasOwn(captured, "complete") && typeof captured.complete !== "boolean") {
    verifierFail("INPUT_INVALID", "dependencies.complete must be boolean.");
  }
  return Object.freeze(captured);
}

export async function resolveDefaultDependencies() {
  const filesystem = await import("../layered-godot-workspace-writer/filesystem.mjs");
  return {
    inspectWorkspaceRoot: filesystem.inspectWorkspaceRoot,
    sameFilesystemPath: filesystem.sameFilesystemPath,
    runGit: runPushGit,
    resolveOrigin: inspectPushOrigin,
    readRemoteHead: readPushRemoteHead,
    now: () => new Date().toISOString(),
  };
}

export function validateResolvedDependencies(value) {
  for (const key of FUNCTION_KEYS) {
    if (typeof value[key] !== "function" || utilTypes.isProxy(value[key])) {
      verifierFail("INPUT_INVALID", `dependencies.${key} must be a non-Proxy function.`);
    }
  }
  return Object.freeze({ ...value });
}

export function captureWorkspaceRoot(value) {
  const descriptors = inspectPlainObject(value, "inspectWorkspaceRoot result");
  const allowed = new Set(["path", "realPath", "identity"]);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      verifierFail("INPUT_INVALID", `inspectWorkspaceRoot result contains unsupported field ${String(key)}.`);
    }
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set || !descriptor.enumerable) {
      verifierFail("INPUT_INVALID", `inspectWorkspaceRoot result.${key} must be an enumerable data property without accessors.`);
    }
  }
  for (const key of ["path", "realPath"]) {
    if (!Object.hasOwn(descriptors, key)) verifierFail("INPUT_INVALID", `inspectWorkspaceRoot result is missing ${key}.`);
  }
  const rootPath = descriptors.path.value;
  const realPath = descriptors.realPath.value;
  if (
    typeof rootPath !== "string" || rootPath.length < 1 || rootPath.includes("\0") ||
    typeof realPath !== "string" || realPath.length < 1 || realPath.includes("\0")
  ) verifierFail("INPUT_INVALID", "inspectWorkspaceRoot result must carry two bounded path strings.");
  return Object.freeze({ path: rootPath, realPath });
}

export function captureOrigin(value, repository) {
  const origin = exactObject(value, ["url", "repository"], "resolveOrigin result");
  const parsed = parseOriginRepository(origin.url, "resolveOrigin result.url", "ORIGIN_INVALID");
  if (
    repositoryName(origin.repository, "resolveOrigin result.repository", "ORIGIN_INVALID").toLowerCase() !== repository.toLowerCase() ||
    parsed.toLowerCase() !== repository.toLowerCase()
  ) verifierFail("ORIGIN_INVALID", "Resolved origin identity does not match the selected repository.");
  return Object.freeze({ url: origin.url, repository: origin.repository });
}
