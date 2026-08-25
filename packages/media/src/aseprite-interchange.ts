import { createHash } from "node:crypto";

export const ASEPRITE_INTERCHANGE_PLAN_VERSION = "2026-08-25.1" as const;
export const ASEPRITE_INTERCHANGE_PLAN_KIND =
  "evavo.aseprite-interchange.plan" as const;

export type AsepriteSheetType =
  | "horizontal"
  | "vertical"
  | "rows"
  | "columns"
  | "packed";

export interface AsepriteInterchangePlanRequest {
  readonly executable: Readonly<{
    path: string;
    version: string;
    sha256: string;
  }>;
  readonly sourcePath: string;
  readonly sheetPath: string;
  readonly dataPath: string;
  readonly sheetType?: AsepriteSheetType;
  readonly tag?: string;
  readonly borderPadding?: number;
  readonly shapePadding?: number;
  readonly innerPadding?: number;
  readonly trim?: boolean;
  readonly extrude?: boolean;
  readonly mergeDuplicates?: boolean;
}

export interface AsepriteInterchangePlan {
  readonly kind: typeof ASEPRITE_INTERCHANGE_PLAN_KIND;
  readonly version: typeof ASEPRITE_INTERCHANGE_PLAN_VERSION;
  readonly executable: AsepriteInterchangePlanRequest["executable"];
  readonly sourcePath: string;
  readonly outputs: Readonly<{
    sheetPath: string;
    dataPath: string;
  }>;
  readonly arguments: readonly string[];
  readonly planSha256: string;
  readonly authority: Readonly<{
    processExecution: false;
    sourceOverwrite: false;
    creativeApproval: false;
    artifactPromotion: false;
    repositoryMutation: false;
    publication: false;
  }>;
}

const SHA256 = /^[a-f0-9]{64}$/;
const SHEET_TYPES = new Set<AsepriteSheetType>([
  "horizontal",
  "vertical",
  "rows",
  "columns",
  "packed",
]);

function fail(message: string): never {
  throw new Error(`Aseprite interchange plan failed: ${message}`);
}

function text(value: unknown, field: string, maximum = 2048): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > maximum ||
    value.includes("\0")
  ) {
    fail(`${field} must be a non-empty safe string.`);
  }
  return value;
}

function integer(value: unknown, field: string, fallback = 0): number {
  const resolved = value === undefined ? fallback : value;
  if (
    typeof resolved !== "number" ||
    !Number.isInteger(resolved) ||
    resolved < 0 ||
    resolved > 256
  ) {
    fail(`${field} must be an integer from 0 to 256.`);
  }
  return resolved;
}

function bool(value: unknown, field: string, fallback = false): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") fail(`${field} must be boolean.`);
  return value;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(object[key])}`)
    .join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function sourceExtension(path: string): void {
  const lower = path.toLowerCase();
  if (!lower.endsWith(".ase") && !lower.endsWith(".aseprite")) {
    fail("sourcePath must identify an .ase or .aseprite source file.");
  }
}

export function compileAsepriteInterchangePlan(
  request: AsepriteInterchangePlanRequest,
): AsepriteInterchangePlan {
  if (!request || typeof request !== "object") fail("request must be an object.");
  const executablePath = text(request.executable?.path, "executable.path");
  const executableVersion = text(request.executable?.version, "executable.version", 256);
  const executableSha256 = text(request.executable?.sha256, "executable.sha256", 64);
  if (!SHA256.test(executableSha256)) {
    fail("executable.sha256 must be 64 lowercase hexadecimal characters.");
  }
  const sourcePath = text(request.sourcePath, "sourcePath");
  sourceExtension(sourcePath);
  const sheetPath = text(request.sheetPath, "sheetPath");
  if (!sheetPath.toLowerCase().endsWith(".png")) {
    fail("sheetPath must end in .png.");
  }
  const dataPath = text(request.dataPath, "dataPath");
  if (!dataPath.toLowerCase().endsWith(".json")) {
    fail("dataPath must end in .json.");
  }
  if (sourcePath === sheetPath || sourcePath === dataPath || sheetPath === dataPath) {
    fail("source and output paths must be distinct.");
  }

  const sheetType = request.sheetType ?? "packed";
  if (!SHEET_TYPES.has(sheetType)) fail("sheetType is unsupported.");
  const tag = request.tag === undefined ? undefined : text(request.tag, "tag", 256);
  const borderPadding = integer(request.borderPadding, "borderPadding");
  const shapePadding = integer(request.shapePadding, "shapePadding");
  const innerPadding = integer(request.innerPadding, "innerPadding");
  const trim = bool(request.trim, "trim");
  const extrude = bool(request.extrude, "extrude");
  const mergeDuplicates = bool(request.mergeDuplicates, "mergeDuplicates");

  const args = [
    "-b",
    sourcePath,
    ...(tag ? ["--tag", tag] : []),
    "--list-tags",
    "--list-slices",
    "--format",
    "json-array",
    "--sheet-type",
    sheetType,
    "--border-padding",
    String(borderPadding),
    "--shape-padding",
    String(shapePadding),
    "--inner-padding",
    String(innerPadding),
    ...(trim ? ["--trim"] : []),
    ...(extrude ? ["--extrude"] : []),
    ...(mergeDuplicates ? ["--merge-duplicates"] : []),
    "--sheet",
    sheetPath,
    "--data",
    dataPath,
  ];

  if (args.some((argument) => argument === "--shell" || argument === "--script")) {
    fail("interactive shell and script execution are forbidden.");
  }

  const body = {
    kind: ASEPRITE_INTERCHANGE_PLAN_KIND,
    version: ASEPRITE_INTERCHANGE_PLAN_VERSION,
    executable: {
      path: executablePath,
      version: executableVersion,
      sha256: executableSha256,
    },
    sourcePath,
    outputs: { sheetPath, dataPath },
    arguments: args,
    authority: {
      processExecution: false as const,
      sourceOverwrite: false as const,
      creativeApproval: false as const,
      artifactPromotion: false as const,
      repositoryMutation: false as const,
      publication: false as const,
    },
  };

  return { ...body, planSha256: digest(body) };
}
