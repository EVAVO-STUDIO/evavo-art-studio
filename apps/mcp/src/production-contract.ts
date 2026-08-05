import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BRASS_ART_PRODUCTION_PROFILE =
  "evavo_brass_art_production_mcp_v1";
export const BRASS_ART_PRODUCTION_MODE = "staging-only" as const;
export const BRASS_ART_PRODUCTION_TOOL_NAMES = Object.freeze([
  "art_production_capabilities",
  "validate_art_delivery_batch",
  "stage_art_delivery_batch",
] as const);

const MAXIMUM_MANIFEST_BYTES = 16 * 1024 * 1024;
const OUTPUT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const WINDOWS_RESERVED =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

export class BrassArtProductionMcpError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "BrassArtProductionMcpError";
    this.code = code;
  }
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string): string => {
    const candidate = path.normalize(value);
    return process.platform === "win32"
      ? candidate.toLocaleLowerCase("en-US")
      : candidate;
  };
  return normalize(left) === normalize(right);
}

function within(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function canonicalDirectory(value: string, label: string): string {
  const requested = path.resolve(value);
  let state: ReturnType<typeof fs.lstatSync>;
  try {
    state = fs.lstatSync(requested);
  } catch (error: unknown) {
    throw new BrassArtProductionMcpError(
      "ART_PRODUCTION_ROOT_UNAVAILABLE",
      `${label} is unavailable: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
  if (!state.isDirectory() || state.isSymbolicLink()) {
    throw new BrassArtProductionMcpError(
      "ART_PRODUCTION_ROOT_INVALID",
      `${label} must be a regular non-symlink directory.`,
    );
  }
  const resolved = fs.realpathSync.native(requested);
  if (!samePath(requested, resolved)) {
    throw new BrassArtProductionMcpError(
      "ART_PRODUCTION_ROOT_NONCANONICAL",
      `${label} must use its canonical path.`,
    );
  }
  return resolved;
}

function splitRoots(value: string | undefined): readonly string[] {
  return Object.freeze(
    String(value ?? "")
      .split(path.delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function strictText(value: unknown, label: string, maximum = 4096): string {
  if (typeof value !== "string") {
    throw new BrassArtProductionMcpError(
      "ART_PRODUCTION_ARGUMENT_INVALID",
      `${label} must be a string.`,
    );
  }
  const candidate = value.normalize("NFC").trim();
  if (
    candidate.length === 0 ||
    candidate.length > maximum ||
    /[\u0000-\u001f\u007f]/u.test(candidate)
  ) {
    throw new BrassArtProductionMcpError(
      "ART_PRODUCTION_ARGUMENT_INVALID",
      `${label} is invalid.`,
    );
  }
  return candidate;
}

function assertNoSymlinkComponents(value: string, label: string): void {
  const absolute = path.resolve(value);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep)) {
    if (!part) continue;
    current = path.join(current, part);
    const state = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!state) break;
    if (state.isSymbolicLink()) {
      throw new BrassArtProductionMcpError(
        "ART_PRODUCTION_PATH_SYMLINK",
        `${label} contains a symbolic-link component.`,
      );
    }
  }
}

function regularEvidenceFile(
  evidenceRoot: string,
  value: unknown,
  label: string,
): string {
  const requestedText = strictText(value, label);
  const requested = path.isAbsolute(requestedText)
    ? path.resolve(requestedText)
    : path.resolve(evidenceRoot, requestedText);
  if (!within(evidenceRoot, requested)) {
    throw new BrassArtProductionMcpError(
      "ART_PRODUCTION_EVIDENCE_ESCAPE",
      `${label} must remain below the configured evidence root.`,
    );
  }
  assertNoSymlinkComponents(requested, label);
  const state = fs.lstatSync(requested, { throwIfNoEntry: false });
  if (!state || !state.isFile() || state.isSymbolicLink()) {
    throw new BrassArtProductionMcpError(
      "ART_PRODUCTION_EVIDENCE_INVALID",
      `${label} must be a regular non-symlink file.`,
    );
  }
  if (state.size < 1 || state.size > MAXIMUM_MANIFEST_BYTES) {
    throw new BrassArtProductionMcpError(
      "ART_PRODUCTION_MANIFEST_SIZE_INVALID",
      `${label} has an invalid byte length.`,
    );
  }
  const resolved = fs.realpathSync.native(requested);
  if (!within(evidenceRoot, resolved) || !samePath(requested, resolved)) {
    throw new BrassArtProductionMcpError(
      "ART_PRODUCTION_EVIDENCE_NONCANONICAL",
      `${label} must use a canonical path below the evidence root.`,
    );
  }
  return resolved;
}

function outputDirectory(
  evidenceRoot: string,
  value: unknown,
  label: string,
): string {
  const name = strictText(value, label, 128);
  if (
    !OUTPUT_NAME.test(name) ||
    name === "." ||
    name === ".." ||
    name.endsWith(".") ||
    name.endsWith(" ") ||
    WINDOWS_RESERVED.test(name)
  ) {
    throw new BrassArtProductionMcpError(
      "ART_PRODUCTION_OUTPUT_NAME_INVALID",
      `${label} must be one portable create-only directory name.`,
    );
  }
  const candidate = path.join(evidenceRoot, name);
  if (!samePath(path.dirname(candidate), evidenceRoot)) {
    throw new BrassArtProductionMcpError(
      "ART_PRODUCTION_OUTPUT_ESCAPE",
      `${label} must be a direct child of the evidence root.`,
    );
  }
  if (
    fs.existsSync(candidate) ||
    fs.lstatSync(candidate, { throwIfNoEntry: false })
  ) {
    throw new BrassArtProductionMcpError(
      "ART_PRODUCTION_OUTPUT_EXISTS",
      `${label} already exists; staging outputs are create-only.`,
    );
  }
  return candidate;
}

export class BrassArtProductionMcpConfig {
  public readonly sourceRoots: readonly string[];
  public readonly evidenceRoot: string;
  public readonly toolRoot: string;

  public constructor(options: Readonly<{
    sourceRoots: readonly string[];
    evidenceRoot: string;
  }>) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    this.toolRoot = canonicalDirectory(
      path.resolve(here, "../../.."),
      "Art Studio repository root",
    );
    if (options.sourceRoots.length === 0) {
      throw new BrassArtProductionMcpError(
        "ART_PRODUCTION_SOURCE_ROOTS_REQUIRED",
        "At least one explicit production source root is required.",
      );
    }
    const roots: string[] = [];
    for (const [index, value] of options.sourceRoots.entries()) {
      const root = canonicalDirectory(value, `Production source root ${index}`);
      if (!roots.some((candidate) => samePath(candidate, root))) roots.push(root);
    }
    for (let index = 0; index < roots.length; index += 1) {
      for (let other = index + 1; other < roots.length; other += 1) {
        if (
          within(roots[index]!, roots[other]!) ||
          within(roots[other]!, roots[index]!)
        ) {
          throw new BrassArtProductionMcpError(
            "ART_PRODUCTION_SOURCE_ROOTS_OVERLAP",
            "Configured source roots must not contain one another.",
          );
        }
      }
    }
    this.sourceRoots = Object.freeze(roots);
    this.evidenceRoot = canonicalDirectory(
      options.evidenceRoot,
      "Art production evidence root",
    );
    for (const protectedRoot of [this.toolRoot, ...this.sourceRoots]) {
      if (
        within(protectedRoot, this.evidenceRoot) ||
        within(this.evidenceRoot, protectedRoot)
      ) {
        throw new BrassArtProductionMcpError(
          "ART_PRODUCTION_ROOTS_OVERLAP",
          "The evidence root must remain disjoint from Art Studio and every source root.",
        );
      }
    }
  }

  public static fromEnvironment(): BrassArtProductionMcpConfig {
    const mode = String(
      process.env.EVAVO_ART_PRODUCTION_MODE ?? BRASS_ART_PRODUCTION_MODE,
    ).trim();
    if (mode !== BRASS_ART_PRODUCTION_MODE) {
      throw new BrassArtProductionMcpError(
        "ART_PRODUCTION_MODE_INVALID",
        `EVAVO_ART_PRODUCTION_MODE must be ${BRASS_ART_PRODUCTION_MODE}.`,
      );
    }
    const evidenceRoot = process.env.EVAVO_ART_PRODUCTION_EVIDENCE_ROOT;
    if (!evidenceRoot) {
      throw new BrassArtProductionMcpError(
        "ART_PRODUCTION_EVIDENCE_ROOT_REQUIRED",
        "EVAVO_ART_PRODUCTION_EVIDENCE_ROOT is required.",
      );
    }
    return new BrassArtProductionMcpConfig({
      sourceRoots: splitRoots(process.env.EVAVO_ART_PRODUCTION_SOURCE_ROOTS),
      evidenceRoot,
    });
  }

  public resolveSourceRoot(value: unknown): string {
    const candidate = canonicalDirectory(
      strictText(value, "sourceRoot"),
      "Selected production source root",
    );
    if (!this.sourceRoots.some((root) => samePath(root, candidate))) {
      throw new BrassArtProductionMcpError(
        "ART_PRODUCTION_SOURCE_ROOT_NOT_ALLOWED",
        "sourceRoot must exactly match one configured production source root.",
      );
    }
    return candidate;
  }

  public resolveManifest(value: unknown): string {
    return regularEvidenceFile(this.evidenceRoot, value, "manifest");
  }

  public resolveOutput(value: unknown): string {
    return outputDirectory(this.evidenceRoot, value, "outputDirectory");
  }
}
