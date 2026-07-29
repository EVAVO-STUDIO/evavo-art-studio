import { spawn } from "node:child_process";

import {
  GodotSpritePackageError,
  type RunGodotSpriteFramesImportOptions,
  type RunGodotSpriteFramesImportResult,
} from "./types.js";

export async function runGodotSpriteFramesImport(
  options: RunGodotSpriteFramesImportOptions,
): Promise<RunGodotSpriteFramesImportResult> {
  if (!options.godotExecutable.trim()) {
    throw new GodotSpritePackageError(
      "GODOT_EXECUTABLE_REQUIRED",
      "A Godot executable is required for headless resource generation.",
    );
  }
  const timeoutMs = options.timeoutMs ?? 120_000;
  return new Promise((resolve, reject) => {
    const child = spawn(
      options.godotExecutable,
      [
        "--headless",
        "--path",
        options.projectPath,
        "--script",
        options.importerPath,
        "--",
        options.descriptorResourcePath,
      ],
      {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(
        new GodotSpritePackageError(
          "GODOT_EXECUTION_FAILED",
          error.message,
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const exitCode = code ?? 1;
      if (exitCode !== 0) {
        reject(
          new GodotSpritePackageError(
            "GODOT_IMPORT_FAILED",
            `Godot exited with ${exitCode}: ${stderr || stdout}`,
          ),
        );
        return;
      }
      resolve({ exitCode, stdout, stderr });
    });
  });
}
