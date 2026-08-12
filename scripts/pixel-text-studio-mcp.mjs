#!/usr/bin/env node
import { lstat, realpath } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

export const SERVER_NAME = "evavo-pixel-text-studio";
export const SERVER_VERSION = "1.0.0";

export const TOOLS = Object.freeze({
  catalog: "evavo_pixel_text_catalog",
  validateStyle: "evavo_pixel_text_validate_style",
  styleExample: "evavo_pixel_text_style_example",
  render: "evavo_pixel_text_render",
  validateOutput: "evavo_pixel_text_validate_output",
  compare: "evavo_pixel_text_compare_builds",
});

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repositoryRoot, "tools", "pixel_text_studio.py");
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
  const mode = String(environment.EVAVO_PIXEL_TEXT_STUDIO_MODE ?? "read-only")
    .trim()
    .toLowerCase();
  if (!["read-only", "read-write"].includes(mode)) {
    throw new Error("EVAVO_PIXEL_TEXT_STUDIO_MODE must be read-only or read-write.");
  }
  const writesEnabled =
    mode === "read-write" &&
    flag(environment.EVAVO_PIXEL_TEXT_STUDIO_ALLOW_WRITES, "EVAVO_PIXEL_TEXT_STUDIO_ALLOW_WRITES");
  if (mode === "read-write" && !writesEnabled) {
    throw new Error("read-write mode also requires EVAVO_PIXEL_TEXT_STUDIO_ALLOW_WRITES=true.");
  }
  const allowedRoots = roots(environment.EVAVO_PIXEL_TEXT_STUDIO_ALLOWED_ROOTS);
  if (!allowedRoots.length) {
    throw new Error("EVAVO_PIXEL_TEXT_STUDIO_ALLOWED_ROOTS must not be empty.");
  }
  const python = String(
    environment.EVAVO_PIXEL_TEXT_STUDIO_PYTHON ??
      (process.platform === "win32" ? "python" : "python3"),
  ).trim();
  if (!python) throw new Error("EVAVO_PIXEL_TEXT_STUDIO_PYTHON must not be empty.");
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
    throw new Error(`${label} is outside EVAVO_PIXEL_TEXT_STUDIO_ALLOWED_ROOTS.`);
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
    throw new Error(`Pixel Text Studio command failed (${result.status}): ${details}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Pixel Text Studio returned invalid JSON: ${error.message}`);
  }
}

const objectSchema = (properties, required = []) => ({
  type: "object",
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});
const filePath = { type: "string", minLength: 1, maxLength: 4096 };
const literalText = { type: "string", minLength: 1, maxLength: 4096 };
const confirmation = { type: "boolean", const: true };

export function toolDefinitions(current = policy()) {
  const definitions = [
    {
      name: TOOLS.catalog,
      description:
        "List deterministic pixel-text/title effects, motions, presets, outputs and authority boundaries.",
      inputSchema: objectSchema({}),
    },
    {
      name: TOOLS.validateStyle,
      description: "Validate a Pixel Text Studio style profile without writing output.",
      inputSchema: objectSchema({ stylePath: filePath }, ["stylePath"]),
    },
    {
      name: TOOLS.styleExample,
      description: "Return one built-in original pixel-text/title starter profile without writing files.",
      inputSchema: objectSchema(
        {
          preset: { type: "string", minLength: 1, maxLength: 128 },
          styleId: { type: "string", minLength: 1, maxLength: 128 },
        },
        ["preset"],
      ),
    },
    {
      name: TOOLS.validateOutput,
      description: "Independently verify a retained Pixel Text Studio build and all SHA-256 identities.",
      inputSchema: objectSchema({ outputRoot: filePath }, ["outputRoot"]),
    },
    {
      name: TOOLS.compare,
      description: "Prove two complete Pixel Text Studio outputs are byte-for-byte identical.",
      inputSchema: objectSchema({ firstRoot: filePath, secondRoot: filePath }, ["firstRoot", "secondRoot"]),
    },
  ];
  if (current.writesEnabled) {
    definitions.push({
      name: TOOLS.render,
      description:
        "Render a new create-only static or animated pixel-text/title build from canonical BMFont/PNG. Requires write gates and confirmWrite=true.",
      inputSchema: objectSchema(
        {
          fontPath: filePath,
          text: literalText,
          stylePath: filePath,
          outputRoot: filePath,
          confirmWrite: confirmation,
        },
        ["fontPath", "text", "stylePath", "outputRoot", "confirmWrite"],
      ),
    });
  }
  return Object.freeze(definitions);
}

export async function callTool(name, input = {}, context = {}) {
  const current = context.policy ?? policy();
  if (!toolDefinitions(current).some((definition) => definition.name === name)) {
    throw new Error(`Unknown or prohibited Pixel Text Studio tool: ${name}`);
  }
  if (name === TOOLS.catalog) return execute(current, ["catalog"]);
  if (name === TOOLS.styleExample) {
    const args = ["style-example", "--preset", String(input.preset)];
    if (input.styleId) args.push("--style-id", String(input.styleId));
    return execute(current, args);
  }
  if (name === TOOLS.validateStyle) {
    const stylePath = await canonicalAllowed(input.stylePath, current, "stylePath");
    return execute(current, ["validate-style", "--style", stylePath]);
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
    throw new Error("Pixel Text Studio rendering requires the write gate and confirmWrite=true.");
  }
  const fontPath = await canonicalAllowed(input.fontPath, current, "fontPath");
  const stylePath = await canonicalAllowed(input.stylePath, current, "stylePath");
  const outputRoot = await canonicalAllowed(input.outputRoot, current, "outputRoot", { future: true });
  return execute(current, [
    "render",
    "--font",
    fontPath,
    "--text",
    String(input.text),
    "--style",
    stylePath,
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
        "Pixel-perfect static and animated text/title composition from canonical bitmap fonts. Writes are create-only and separately gated. The server never runs arbitrary shell/code, mutates font masters, approves art, commits, pushes or publishes repositories.",
    });
  }
  if (request.method === "ping") return response(request.id, {});
  if (request.method === "notifications/initialized") return null;
  if (request.method === "tools/list") return response(request.id, { tools: toolDefinitions(current) });
  if (request.method === "tools/call") {
    try {
      return response(request.id, {
        content: content(await callTool(request.params?.name, request.params?.arguments ?? {}, { policy: current })),
        isError: false,
      });
    } catch (error) {
      return response(request.id, {
        content: [{ type: "text", text: String(error?.message ?? error) }],
        isError: true,
      });
    }
  }
  if (request.id === undefined || request.id === null) return null;
  return { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: `Method not found: ${request.method}` } };
}

async function serve() {
  const current = policy();
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of input) {
    if (!line.trim()) continue;
    let request;
    try {
      request = JSON.parse(line);
      const result = await handleRequest(request, { policy: current });
      if (result !== null) process.stdout.write(`${JSON.stringify(result)}\n`);
    } catch (error) {
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: request?.id ?? null, error: { code: -32603, message: String(error?.message ?? error) } })}\n`,
      );
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await serve();
}
