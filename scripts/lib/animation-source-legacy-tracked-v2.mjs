import { spawnSync } from "node:child_process";
import { TextDecoder } from "node:util";

import {
  codePointCompare,
  failLegacy,
  normalizeTrackedPath,
  portablePathKey,
} from "./animation-source-legacy-common-v2.mjs";

export function listTrackedPathsV2(root) {
  const result = spawnSync("git", ["ls-files", "-z", "--cached"], {
    cwd: root,
    encoding: "buffer",
    shell: false,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    failLegacy(
      "ANIMATION_SOURCE_LEGACY_V2_GIT_LIST_FAILED",
      result.error?.message ?? Buffer.from(result.stderr ?? []).toString("utf8").trim(),
    );
  }
  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.from(result.stdout ?? []),
    );
  } catch {
    failLegacy("ANIMATION_SOURCE_LEGACY_V2_GIT_PATH_UTF8_INVALID");
  }

  const paths = decoded.split("\u0000").filter(Boolean)
    .map(normalizeTrackedPath).sort(codePointCompare);
  const exact = new Set();
  const portable = new Map();
  for (const value of paths) {
    if (exact.has(value)) {
      failLegacy("ANIMATION_SOURCE_LEGACY_V2_TRACKED_PATH_DUPLICATE", value);
    }
    exact.add(value);
    const key = portablePathKey(value);
    const previous = portable.get(key);
    if (previous !== undefined && previous !== value) {
      failLegacy(
        "ANIMATION_SOURCE_LEGACY_V2_PORTABLE_PATH_COLLISION",
        `${previous}:${value}`,
      );
    }
    portable.set(key, value);
  }
  return Object.freeze(paths);
}
