#!/usr/bin/env node

import { spawn } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

export const SERVER_NAME = "evavo-pixel-font-studio-v2";
export const SERVER_VERSION = "2.2.0";
const TOOL_PATH = fileURLToPath(new URL("../tools/pixel_font_studio_v2.py", import.meta.url));
const MAX_PATH = 4096;
const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 240_000;

const TOOLS = Object.freeze({
  catalog: "evavo_pixel_font_v2_catalog",
  audit: "evavo_pixel_font_v2_audit",
  inspect: "evavo_pixel_font_v2_inspect_glyph",
  validate: "evavo_pixel_font_v2_validate",
  compare: "evavo_pixel_font_v2_compare_builds",
  build: "evavo_pixel_font_v2_build",
  sealFace: "evavo_pixel_font_v2_seal_face",
  sealFamily: "evavo_pixel_font_v2_seal_family",
  verifyGodot: "evavo_pixel_font_v2_verify_godot",
});

function parseBoolean(value, name, fallback = false) {
  if (value === undefined || value === "") return fallback;
  const token = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(token)) return true;
  if (["0", "false", "no", "off"].includes(token)) return false;
  throw new Error(`${name} must be true or false.`);
}

function parseRoots(env) {
  return String(env.EVAVO_PIXEL_FONT_ALLOWED_ROOTS ?? "")
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => path.resolve(value));
}

function inside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function policy(env = process.env) {
  const mode = String(env.EVAVO_PIXEL_FONT_STUDIO_MODE ?? "read-only").trim().toLowerCase();
  if (!new Set(["read-only", "read-write"]).has(mode)) {
    throw new Error("EVAVO_PIXEL_FONT_STUDIO_MODE must be read-only or read-write.");
  }
  const writes =
    mode === "read-write" &&
    parseBoolean(env.EVAVO_PIXEL_FONT_STUDIO_ALLOW_WRITES, "EVAVO_PIXEL_FONT_STUDIO_ALLOW_WRITES");
  const timeoutMs = Number.parseInt(env.EVAVO_PIXEL_FONT_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS), 10);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 900_000) {
    throw new Error("EVAVO_PIXEL_FONT_TIMEOUT_MS must be between 1000 and 900000.");
  }
  return Object.freeze({
    mode,
    writes,
    roots: Object.freeze(parseRoots(env)),
    python: String(
      env.EVAVO_PIXEL_FONT_PYTHON ?? (process.platform === "win32" ? "python" : "python3"),
    ),
    godot: String(env.EVAVO_PIXEL_FONT_GODOT ?? "").trim(),
    godotSha256: String(env.EVAVO_PIXEL_FONT_GODOT_SHA256 ?? "").trim().toLowerCase(),
    timeoutMs,
  });
}

function requirePath(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > MAX_PATH) {
    throw new Error(`${label} must be a non-empty path no longer than ${MAX_PATH} characters.`);
  }
  return path.resolve(value);
}

function requireRoots(current) {
  if (!current.roots.length) {
    throw new Error("EVAVO_PIXEL_FONT_ALLOWED_ROOTS must contain at least one explicit root.");
  }
}

async function assertExistingComponentsNotSymlinks(candidate, stopAt) {
  let current = candidate;
  for (;;) {
    const state = await lstat(current);
    if (state.isSymbolicLink()) throw new Error(`Path component must not be a symlink: ${current}`);
    if (current === stopAt) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

async function boundedExisting(value, current, label, { directory = false } = {}) {
  requireRoots(current);
  const requested = requirePath(value, label);
  const state = await lstat(requested);
  if (state.isSymbolicLink()) throw new Error(`${label} must not be a symlink.`);
  if (directory ? !state.isDirectory() : !state.isFile()) {
    throw new Error(`${label} must be an existing ${directory ? "directory" : "file"}.`);
  }
  const observed = await realpath(requested);
  const root = current.roots.find((candidate) => inside(observed, candidate));
  if (!root) throw new Error(`${label} is outside EVAVO_PIXEL_FONT_ALLOWED_ROOTS.`);
  const realRoot = await realpath(root);
  if (!inside(observed, realRoot)) throw new Error(`${label} escapes its configured root.`);
  await assertExistingComponentsNotSymlinks(observed, realRoot);
  return requested;
}

async function boundedFuture(value, current, label) {
  requireRoots(current);
  const requested = requirePath(value, label);
  let ancestor = requested;
  for (;;) {
    try {
      const state = await lstat(ancestor);
      if (state.isSymbolicLink()) throw new Error(`${label} contains a symlink component.`);
      if (!state.isDirectory()) throw new Error(`${label} existing ancestor must be a directory.`);
      break;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw new Error(`${label} has no existing ancestor.`);
      ancestor = parent;
    }
  }
  const observedAncestor = await realpath(ancestor);
  const root = current.roots.find((candidate) => inside(observedAncestor, candidate));
  if (!root) throw new Error(`${label} is outside EVAVO_PIXEL_FONT_ALLOWED_ROOTS.`);
  const realRoot = await realpath(root);
  if (!inside(observedAncestor, realRoot)) throw new Error(`${label} escapes its configured root.`);
  await assertExistingComponentsNotSymlinks(observedAncestor, realRoot);
  return requested;
}

function spawnTool(current, args, { stdinValue } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(current.python, [TOOL_PATH, ...args], {
      shell: false,
      windowsHide: true,
      env: {
        PATH: process.env.PATH ?? "",
        SYSTEMROOT: process.env.SYSTEMROOT ?? "",
        WINDIR: process.env.WINDIR ?? "",
        HOME: process.env.HOME ?? "",
        USERPROFILE: process.env.USERPROFILE ?? "",
        PYTHONUTF8: "1",
        PYTHONHASHSEED: "0",
        PYTHONDONTWRITEBYTECODE: "1",
        SOURCE_DATE_EPOCH: "1577836800",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let terminatedForSize = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > MAX_OUTPUT_BYTES) {
        terminatedForSize = true;
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > MAX_OUTPUT_BYTES) {
        terminatedForSize = true;
        child.kill("SIGKILL");
      }
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), current.timeoutMs);
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (terminatedForSize) {
        reject(new Error("Pixel Font Studio output exceeded the bounded response size."));
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim() || stdout.trim() || `Pixel Font Studio exited ${code ?? signal ?? "unknown"}.`,
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("Pixel Font Studio returned invalid JSON."));
      }
    });
    if (stdinValue !== undefined) {
      const payload = JSON.stringify(stdinValue);
      if (Buffer.byteLength(payload, "utf8") > MAX_DOCUMENT_BYTES) {
        child.kill("SIGKILL");
        reject(new Error("Master document exceeds the bounded input size."));
        return;
      }
      child.stdin.end(payload);
    } else {
      child.stdin.end();
    }
  });
}

const schema = (properties = {}, required = []) => ({
  type: "object",
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});
const filePath = { type: "string", minLength: 1, maxLength: MAX_PATH };
const codepoint = { anyOf: [{ type: "integer", minimum: 0, maximum: 0x10ffff }, { type: "string", minLength: 1, maxLength: 16 }] };
const confirmWrite = { type: "boolean", const: true };

export function toolDefinitions(current = policy()) {
  const tools = [
    {
      name: TOOLS.catalog,
      description: "Describe the complete Pixel Font Studio v2 authored-master, QA, BDF, atlas-map, grid-sheet, TTF and Godot 4.6.2 contract.",
      inputSchema: schema(),
    },
    {
      name: TOOLS.audit,
      description: "Fail-closed audit of one face master or a complete family master, including coverage, confusables and exhaustive pair collisions.",
      inputSchema: schema({ facePath: filePath, familyPath: filePath }),
    },
    {
      name: TOOLS.inspect,
      description: "Inspect one explicit glyph matrix, metrics and related kerning pairs from a face master.",
      inputSchema: schema({ facePath: filePath, codepoint }, ["facePath", "codepoint"]),
    },
    {
      name: TOOLS.validate,
      description: "Validate a generated family, every file hash, BMFont atlas, BDF, atlas JSON, grid sheet, exact specimens and optional TTF cmap/kerning.",
      inputSchema: schema({ familyPath: filePath }, ["familyPath"]),
    },
    {
      name: TOOLS.compare,
      description: "Prove two generated family directories are byte-for-byte reproducible.",
      inputSchema: schema({ firstRoot: filePath, secondRoot: filePath }, ["firstRoot", "secondRoot"]),
    },
  ];
  if (current.writes) {
    tools.push(
      {
        name: TOOLS.build,
        description: "Create a complete BMFont/PNG/Godot/specimen family, BDF and engine-neutral atlas/grid forms, plus optional TTF derivatives. Output is create-only.",
        inputSchema: schema(
          { masterPath: filePath, outputRoot: filePath, confirmWrite },
          ["masterPath", "outputRoot", "confirmWrite"],
        ),
      },
      {
        name: TOOLS.sealFace,
        description: "Validate, canonicalise and create a new explicit face-master JSON document. Existing files are never replaced.",
        inputSchema: schema(
          { document: { type: "object" }, outputPath: filePath, confirmWrite },
          ["document", "outputPath", "confirmWrite"],
        ),
      },
      {
        name: TOOLS.sealFamily,
        description: "Validate, canonicalise and create a new family-master JSON document. Existing files are never replaced.",
        inputSchema: schema(
          { document: { type: "object" }, outputPath: filePath, confirmWrite },
          ["document", "outputPath", "confirmWrite"],
        ),
      },
    );
    if (current.godot) {
      tools.push({
        name: TOOLS.verifyGodot,
        description: "Run the fixed operator-configured Godot 4.6.2 executable against a built family and create isolated import/render evidence.",
        inputSchema: schema(
          { familyPath: filePath, evidenceRoot: filePath, confirmWrite },
          ["familyPath", "evidenceRoot", "confirmWrite"],
        ),
      });
    }
  }
  return tools;
}

function requireWrite(current, input) {
  if (!current.writes || input?.confirmWrite !== true) {
    throw new Error("This operation requires read-write mode, write enablement and confirmWrite=true.");
  }
}

export async function callTool(name, input = {}, context = {}) {
  const current = context.policy ?? policy();
  if (!toolDefinitions(current).some((tool) => tool.name === name)) {
    throw new Error(`Unknown or prohibited Pixel Font Studio tool: ${name}`);
  }
  if (name === TOOLS.catalog) return spawnTool(current, ["catalog"]);
  if (name === TOOLS.audit) {
    const hasFace = typeof input.facePath === "string" && input.facePath.trim();
    const hasFamily = typeof input.familyPath === "string" && input.familyPath.trim();
    if (Boolean(hasFace) === Boolean(hasFamily)) throw new Error("Audit requires exactly one of facePath or familyPath.");
    if (hasFace) {
      const face = await boundedExisting(input.facePath, current, "facePath");
      return spawnTool(current, ["audit", "--face", face]);
    }
    const family = await boundedExisting(input.familyPath, current, "familyPath");
    return spawnTool(current, ["audit", "--family", family]);
  }
  if (name === TOOLS.inspect) {
    const face = await boundedExisting(input.facePath, current, "facePath");
    return spawnTool(current, ["inspect", "--face", face, "--codepoint", String(input.codepoint)]);
  }
  if (name === TOOLS.validate) {
    const family = await boundedExisting(input.familyPath, current, "familyPath");
    return spawnTool(current, ["validate", "--family", family]);
  }
  if (name === TOOLS.compare) {
    const first = await boundedExisting(input.firstRoot, current, "firstRoot", { directory: true });
    const second = await boundedExisting(input.secondRoot, current, "secondRoot", { directory: true });
    return spawnTool(current, ["compare", "--first", first, "--second", second]);
  }
  if (name === TOOLS.build) {
    requireWrite(current, input);
    const master = await boundedExisting(input.masterPath, current, "masterPath");
    const output = await boundedFuture(input.outputRoot, current, "outputRoot");
    return spawnTool(current, ["build", "--master", master, "--output", output]);
  }
  if (name === TOOLS.sealFace || name === TOOLS.sealFamily) {
    requireWrite(current, input);
    if (!input.document || typeof input.document !== "object" || Array.isArray(input.document)) {
      throw new Error("document must be a JSON object.");
    }
    const output = await boundedFuture(input.outputPath, current, "outputPath");
    return spawnTool(current, [name === TOOLS.sealFace ? "seal-face" : "seal-family", "--output", output], {
      stdinValue: input.document,
    });
  }
  if (name === TOOLS.verifyGodot) {
    requireWrite(current, input);
    if (!current.godot) throw new Error("EVAVO_PIXEL_FONT_GODOT is not configured.");
    const family = await boundedExisting(input.familyPath, current, "familyPath");
    const evidence = await boundedFuture(input.evidenceRoot, current, "evidenceRoot");
    const args = ["verify-godot", "--family", family, "--godot", current.godot, "--evidence", evidence];
    if (current.godotSha256) args.push("--sha256", current.godotSha256);
    return spawnTool(current, args);
  }
  throw new Error(`Unhandled Pixel Font Studio tool: ${name}`);
}

const response = (id, result) => ({ jsonrpc: "2.0", id: id ?? null, result });
const content = (value) => [{ type: "text", text: JSON.stringify(value, null, 2) }];

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
        "Author explicit per-face glyph masters. Audit before sealing, inspect control glyphs, build create-only outputs, validate identities, and use the operator-pinned Godot verifier. BMFont + packed PNG is canonical; BDF, atlas JSON, grid sheets and TTF are interoperable derivatives.",
    });
  }
  if (request.method === "ping") return response(request.id, {});
  if (request.method === "notifications/initialized") return null;
  if (request.method === "tools/list") return response(request.id, { tools: toolDefinitions(current) });
  if (request.method === "tools/call") {
    try {
      const result = await callTool(request.params?.name, request.params?.arguments ?? {}, { policy: current });
      return response(request.id, { content: content(result), isError: false });
    } catch (error) {
      return response(request.id, {
        content: content({ error: error instanceof Error ? error.message : String(error) }),
        isError: true,
      });
    }
  }
  throw new Error(`Unsupported JSON-RPC method: ${request.method}`);
}

export async function start() {
  const current = policy();
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
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: request?.id ?? null,
          error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
        })}\n`,
      );
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
