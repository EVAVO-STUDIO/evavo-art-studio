import { realpath } from "node:fs/promises";
import path from "node:path";

import { GodotSpritePackageError } from "./types.js";

function isWithin(base: string, candidate: string): boolean {
  const relative = path.relative(base, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function resolveGodotProjectPath(projectPath: string): Promise<string> {
  try {
    return await realpath(path.resolve(projectPath));
  } catch (error: unknown) {
    throw new GodotSpritePackageError(
      "GODOT_PROJECT_NOT_FOUND",
      `Godot project path could not be resolved: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function toGodotResourcePath(projectPath: string, candidate: string): string {
  const resolved = path.resolve(candidate);
  if (!isWithin(projectPath, resolved)) {
    throw new GodotSpritePackageError(
      "GODOT_OUTPUT_OUTSIDE_PROJECT",
      `${candidate} is outside the Godot project root.`,
    );
  }
  const relative = path.relative(projectPath, resolved).split(path.sep).join("/");
  return relative ? `res://${relative}` : "res://";
}

export function safeGodotFileName(
  value: string | undefined,
  fallback: string,
  extension: string,
): string {
  const result = value?.trim() || fallback;
  if (path.basename(result) !== result || result.includes("..") || !result.endsWith(extension)) {
    throw new GodotSpritePackageError(
      "GODOT_OUTPUT_NAME_INVALID",
      `Godot output file must be a single file name ending in ${extension}.`,
    );
  }
  return result;
}
