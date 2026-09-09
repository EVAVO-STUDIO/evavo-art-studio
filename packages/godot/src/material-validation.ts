import { spawn } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const GODOT_MATERIAL_VALIDATION_CONTRACT = "evavo.godot-material-validation.v1" as const;
export type GodotMaterialValidationClass = "StandardMaterial3D" | "ORMMaterial3D";

export interface GodotMaterialValidationOptions {
  readonly godotExecutable: string;
  readonly projectPath: string;
  readonly resourcePath: string;
  readonly expectedClass?: GodotMaterialValidationClass;
  readonly timeoutMs?: number;
}

export interface GodotMaterialValidationResult {
  readonly contract: typeof GODOT_MATERIAL_VALIDATION_CONTRACT;
  readonly ok: true;
  readonly resourcePath: string;
  readonly resourceClass: string;
  readonly expectedClass: GodotMaterialValidationClass | null;
  readonly exitCode: 0;
  readonly stdout: string;
  readonly stderr: string;
  readonly headless: true;
  readonly sourceMutationAllowed: false;
  readonly projectCacheMayChange: true;
}

const MARKER = "EVAVO_MATERIAL_VALIDATION=";

/** Temporary SceneTree validator used through Godot's documented --script CLI path. */
export function renderGodotMaterialValidationScript(): string {
  return `extends SceneTree

func _init():
    var args := OS.get_cmdline_user_args()
    if args.size() < 1:
        push_error("EVAVO validator requires a resource path")
        quit(2)
        return
    var resource_path: String = args[0]
    var expected_class: String = args[1] if args.size() > 1 else ""
    var resource := ResourceLoader.load(resource_path)
    if resource == null:
        push_error("EVAVO failed to load material resource: " + resource_path)
        quit(3)
        return
    var actual_class := resource.get_class()
    if expected_class != "" and actual_class != expected_class:
        push_error("EVAVO material class mismatch: expected " + expected_class + ", got " + actual_class)
        quit(4)
        return
    var payload := {
        "ok": true,
        "resource_path": resource_path,
        "resource_class": actual_class,
        "expected_class": expected_class,
    }
    print("${MARKER}" + JSON.stringify(payload))
    quit(0)
`;
}

export function parseGodotMaterialValidationOutput(stdout: string): Readonly<{
  ok: true;
  resource_path: string;
  resource_class: string;
  expected_class: string;
}> {
  const line = stdout.split(/\r?\n/u).find((entry) => entry.startsWith(MARKER));
  if (!line) throw new Error("Godot material validation did not emit the EVAVO validation marker.");
  const value: unknown = JSON.parse(line.slice(MARKER.length));
  if (!value || typeof value !== "object") throw new Error("Godot material validation marker was not a JSON object.");
  const record = value as Record<string, unknown>;
  if (record.ok !== true || typeof record.resource_path !== "string" || typeof record.resource_class !== "string" || typeof record.expected_class !== "string") {
    throw new Error("Godot material validation marker has an invalid shape.");
  }
  return Object.freeze({
    ok: true as const,
    resource_path: record.resource_path,
    resource_class: record.resource_class,
    expected_class: record.expected_class,
  });
}

/**
 * Load a material through a real Godot process. The temporary validator lives
 * outside the project; Godot may still update its normal .godot import/cache data.
 */
export async function runGodotMaterialValidation(
  options: GodotMaterialValidationOptions,
): Promise<GodotMaterialValidationResult> {
  if (!options || typeof options.godotExecutable !== "string" || !options.godotExecutable.trim()) {
    throw new Error("godotExecutable is required.");
  }
  if (typeof options.projectPath !== "string" || !options.projectPath.trim()) throw new Error("projectPath is required.");
  if (typeof options.resourcePath !== "string" || !options.resourcePath.startsWith("res://") || !options.resourcePath.endsWith(".tres")) {
    throw new Error("resourcePath must be a res:// path ending in .tres.");
  }
  if (options.expectedClass !== undefined && options.expectedClass !== "StandardMaterial3D" && options.expectedClass !== "ORMMaterial3D") {
    throw new Error("expectedClass must be StandardMaterial3D or ORMMaterial3D.");
  }
  const projectPath = path.resolve(options.projectPath);
  await access(path.join(projectPath, "project.godot"));
  const timeoutMs = options.timeoutMs ?? 120_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 600_000) {
    throw new Error("timeoutMs must be an integer from 1000 through 600000.");
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "evavo-godot-material-validator-"));
  const scriptPath = path.join(tempDir, "validate_material.gd");
  await writeFile(scriptPath, renderGodotMaterialValidationScript(), "utf8");

  try {
    const execution = await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(
        options.godotExecutable,
        [
          "--headless",
          "--path",
          projectPath,
          "--script",
          scriptPath,
          "--",
          options.resourcePath,
          options.expectedClass ?? "",
        ],
        { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => { stdout += chunk; });
      child.stderr.on("data", (chunk: string) => { stderr += chunk; });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(new Error(`Godot material validation timed out after ${timeoutMs} ms.`));
          return;
        }
        resolve({ exitCode: code ?? 1, stdout, stderr });
      });
    });

    if (execution.exitCode !== 0) {
      throw new Error(`Godot material validation exited with ${execution.exitCode}: ${execution.stderr || execution.stdout}`);
    }
    const marker = parseGodotMaterialValidationOutput(execution.stdout);
    if (marker.resource_path !== options.resourcePath) throw new Error("Godot material validation returned a different resource path than requested.");
    if (options.expectedClass && marker.resource_class !== options.expectedClass) {
      throw new Error(`Godot loaded ${marker.resource_class}, expected ${options.expectedClass}.`);
    }
    return Object.freeze({
      contract: GODOT_MATERIAL_VALIDATION_CONTRACT,
      ok: true as const,
      resourcePath: marker.resource_path,
      resourceClass: marker.resource_class,
      expectedClass: options.expectedClass ?? null,
      exitCode: 0 as const,
      stdout: execution.stdout,
      stderr: execution.stderr,
      headless: true as const,
      sourceMutationAllowed: false as const,
      projectCacheMayChange: true as const,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
