#!/usr/bin/env node
import { lstat, realpath } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

export const SERVER_NAME = "evavo-pixel-font-universal";
export const SERVER_VERSION = "3.0.0";

export const TOOLS = Object.freeze({
  catalog: "evavo_pixel_font_style_catalog",
  validateFace: "evavo_pixel_font_validate_face",
  validateProfile: "evavo_pixel_font_validate_profile",
  profileExample: "evavo_pixel_font_profile_example",
  compile: "evavo_pixel_font_compile_style",
  validateOutput: "evavo_pixel_font_validate_output",
  compare: "evavo_pixel_font_compare_builds",
});

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repositoryRoot, "tools", "pixel_font_universal.py");
const MAX_BUFFER = 128 * 1024 * 1024;

function flag(value, name, fallback = false) {
  if (value === undefined || value === "") return fallback;
  const token = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(token)) return true;
  if (["0", "false", "no", "off"].includes(token)) return false;
  throw new Error(`${name} must be true or false.`);
}

function roots(value) {
  return String(value ?? "")
    .split(/[;\n]/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => path.resolve(item));
}

export function policy(environment = process.env) {
  const mode = String(environment.EVAVO_PIXEL_FONT_UNIVERSAL_MODE ?? "read-only")
    .trim()
    .toLowerCase();
  if (!["read-only", "read-write"].includes(mode)) {
    throw new Error("EVAVO_PIXEL_FONT_UNIVERSAL_MODE must be read-only or read-write.");
  }
  const writesEnabled =
    mode === "read-write" &&
    flag(
      environment.EVAVO_PIXEL_FONT_UNIVERSAL_ALLOW_WRITES,
      "EVAVO_PIXEL_FONT_UNIVERSAL_ALLOW_WRITES",
    );
  if (mode === "read-write" && !writesEnabled) {
    throw new Error(
      "read-write mode also requires EVAVO_PIXEL_FONT_UNIVERSAL_ALLOW_WRITES=true.",
    );
  }
  const allowedRoots = roots(environment.EVAVO_PIXEL_FONT_UNIVERSAL_ALLOWED_ROOTS);
  if (!allowedRoots.length) {
    throw new Error("EVAVO_PIXEL_FONT_UNIVERSAL_ALLOWED_ROOTS must not be empty.");
  }
  const python = String(
    environment.EVAVO_PIXEL_FONT_UNIVERSAL_PYTHON ??
      (process.platform === "win32" ? "python" : "python3"),
  ).trim();
  if (!python) throw new Error("EVAVO_PIXEL_FONT_UNIVERSAL_PYTHON must not be empty.");
  return Object.freeze({ mode, writesEnabled, allowedRoots: Object.freeze(allowedRoots), python });
}

function inside(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function canonicalAllowed(value, current, label, { future = false } = {}) {
  if (typeof value !== "string" || !value.trim() || value.length > 4096) {
    throw new Error(`${label} is required and must be no longer than 4096 characters.`);
  }
  const requested = path.resolve(value);
  let observed;
  if (future) {
    try {
      await lstat(requested);
      throw new Error(`${label} must not already exist: ${requested}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const parent = path.dirname(requested);
    const parentState = await lstat(parent);
    if (!parentState.isDirectory() || parentState.isSymbolicLink()) {
      throw new Error(`${label} parent must be a non-symlink directory.`);
    }
    observed = path.join(await realpath(parent), path.basename(requested));
  } else {
    const state = await lstat(requested);
    if (state.isSymbolicLink()) throw new Error(`${label} must not be a symlink.`);
    observed = await realpath(requested);
  }
  if (!current.allowedRoots.some((root) => inside(observed, root))) {
    throw new Error(`${label} is outside EVAVO_PIXEL_FONT_UNIVERSAL_ALLOWED_ROOTS.`);
  }
  return requested;
}

function execute(current, args) {
  const result = spawnSync(current.python, [cliPath, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: false,
    timeout: 300_000,
    maxBuffer: MAX_BUFFER,
    env: {
      ...process.env,
      PYTHONUTF8: "1",
      PYTHONHASHSEED: "0",
      PYTHONDONTWRITEBYTECODE: "1",
      SOURCE_DATE_EPOCH: "1577836800",
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = `${result.stderr ?? ""}\n${result.stdout ?? ""}`.trim();
    throw new Error(`Universal pixel-font command failed (${result.status}): ${details}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Universal pixel-font command returned invalid JSON: ${error.message}`);
  }
}

const objectSchema = (properties, required = []) => ({
  type: "object",
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});
const filePath = { type: "string", minLength: 1, maxLength: 4096 };
const confirmation = { type: "boolean", const: true };

export function toolDefinitions(current = policy()) {
  const definitions = [
    {
      name: TOOLS.catalog,
      description:
        "List universal pixel-font source models, spacing models, style operations, packers, outputs and authority boundaries.",
      inputSchema: objectSchema({}),
    },
    {
      name: TOOLS.validateFace,
      description:
        "Validate an existing v2 binary face or universal binary/indexed/RGBA/layered/component face.",
      inputSchema: objectSchema({ facePath: filePath }, ["facePath"]),
    },
    {
      name: TOOLS.validateProfile,
      description: "Validate a deterministic universal pixel-font style profile.",
      inputSchema: objectSchema({ profilePath: filePath }, ["profilePath"]),
    },
    {
      name: TOOLS.profileExample,
      description: "Create a JSON result for a built-in starter profile without writing files.",
      inputSchema: objectSchema(
        {
          preset: { type: "string", minLength: 1, maxLength: 128 },
          profileId: { type: "string", minLength: 1, maxLength: 128 },
        },
        ["preset"],
      ),
    },
    {
      name: TOOLS.validateOutput,
      description: "Independently validate a generated universal pixel-font build and all retained hashes.",
      inputSchema: objectSchema({ outputRoot: filePath }, ["outputRoot"]),
    },
    {
      name: TOOLS.compare,
      description: "Prove two complete universal pixel-font builds are byte-for-byte identical.",
      inputSchema: objectSchema({ firstRoot: filePath, secondRoot: filePath }, [
        "firstRoot",
        "secondRoot",
      ]),
    },
  ];
  if (current.writesEnabled) {
    definitions.push({
      name: TOOLS.compile,
      description:
        "Compile one face and style profile into a new create-only output root. Requires the write environment gate and confirmWrite=true.",
      inputSchema: objectSchema(
        {
          facePath: filePath,
          profilePath: filePath,
          outputRoot: filePath,
          confirmWrite: confirmation,
        },
        ["facePath", "profilePath", "outputRoot", "confirmWrite"],
      ),
    });
  }
  return Object.freeze(definitions);
}

export async function callTool(name, input = {}, context = {}) {
  const current = context.policy ?? policy();
  if (!toolDefinitions(current).some((definition) => definition.name === name)) {
    throw new Error(`Unknown or prohibited universal pixel-font tool: ${name}`);
  }
  if (name === TOOLS.catalog) return execute(current, ["catalog"]);
  if (name === TOOLS.profileExample) {
    const args = ["profile-example", "--preset", String(input.preset)];
    if (input.profileId) args.push("--profile-id", String(input.profileId));
    return execute(current, args);
  }
  if (name === TOOLS.validateFace) {
    const facePath = await canonicalAllowed(input.facePath, current, "facePath");
    return execute(current, ["validate-face", "--face", facePath]);
  }
  if (name === TOOLS.validateProfile) {
    const profilePath = await canonicalAllowed(input.profilePath, current, "profilePath");
    return execute(current, ["validate-profile", "--profile", profilePath]);
  }
  if (name === TOOLS.validateOutput) {
    const outputRoot = await canonicalAllowed(input.outputRoot, current, "outputRoot");
    return execute(current, ["validate-output", "--output", outputRoot]);
  }
  if (name === TOOLS.compare) {
    const firstRoot = await canonicalAllowed(input.firstRoot, current, "firstRoot");
    const secondRoot = await canonicalAllowed(input.secondRoot, current, "secondRoot");
    return execute(current, ["compare", "--first", firstRoot, "--second", secondRoot]);
  }
  if (!current.writesEnabled || input.confirmWrite !== true) {
    throw new Error("Universal pixel-font compilation requires the write gate and confirmWrite=true.");
  }
  const facePath = await canonicalAllowed(input.facePath, current, "facePath");
  const profilePath = await canonicalAllowed(input.profilePath, current, "profilePath");
  const outputRoot = await canonicalAllowed(input.outputRoot, current, "outputRoot", {
    future: true,
  });
  return execute(current, [
    "compile",
    "--face",
    facePath,
    "--profile",
    profilePath,
    "--output",
    outputRoot,
  ]);
}

function response(id, result) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
function content(value) {
  return [{ type: "text", text: JSON.stringify(value, null, 2) }];
}

export async function handleRequest(request, context = {}) {
  if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    throw new Error("Invalid JSON-RPC request.");
  }
  const current = context.policy ?? policy();
  if (request.method === "initialize") {
    return response(request.id, {
      protocolVersion: request.params?.protocolVersion ?? "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      instructions:
        "Style-neutral pixel-font compilation for binary, indexed, RGBA, layered and component sources. Writes are create-only and separately gated. The server never accepts arbitrary code or shell commands and never commits, pushes, publishes or approves art.",
    });
  }
  if (request.method === "ping") return response(request.id, {});
  if (request.method === "notifications/initialized") return null;
  if (request.method === "tools/list") return response(request.id, { tools: toolDefinitions(current) });
  if (request.method === "tools/call") {
    try {
      return response(request.id, {
        content: content(
          await callTool(request.params?.name, request.params?.arguments ?? {}, {
            policy: current,
          }),
        ),
        isError: false,
      });
    } catch (error) {
      return response(request.id, {
        content: content({ error: error instanceof Error ? error.message : String(error) }),
        isError: true,
      });
    }
  }
  throw new Error(`Unsupported MCP method: ${request.method}`);
}

export async function startServer(options = {}) {
  const current = options.policy ?? policy(options.environment);
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  for await (const line of input) {
    if (!line.trim()) continue;
    let request;
    try {
      request = JSON.parse(line);
      const result = await handleRequest(request, { policy: current });
      if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
    } catch (error) {
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: request?.id ?? null, error: { code: -32000, message: error instanceof Error ? error.message : String(error) } })}\n`,
      );
    }
  }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  startServer().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
