#!/usr/bin/env node
import { lstat, realpath } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

export const SERVER_NAME = "evavo-pixel-typography-review";
export const SERVER_VERSION = "1.1.0";
export const TOOLS = Object.freeze({
  catalog: "evavo_pixel_typography_review_catalog",
  validateProfile: "evavo_pixel_typography_review_validate_profile",
  profileExample: "evavo_pixel_typography_review_profile_example",
  build: "evavo_pixel_typography_review_build",
  validateOutput: "evavo_pixel_typography_review_validate_output",
  compare: "evavo_pixel_typography_review_compare_builds",
});

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repositoryRoot, "tools", "pixel_typography_review.py");
const MAX_BUFFER = 128 * 1024 * 1024;

function flag(value, name, fallback = false) {
  if (value === undefined || value === "") return fallback;
  const token = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(token)) return true;
  if (["0", "false", "no", "off"].includes(token)) return false;
  throw new Error(`${name} must be true or false.`);
}
function roots(value) {
  return String(value ?? "").split(/[;\n]/u).map((item) => item.trim()).filter(Boolean).map((item) => path.resolve(item));
}
export function policy(environment = process.env) {
  const mode = String(environment.EVAVO_PIXEL_TYPOGRAPHY_REVIEW_MODE ?? "read-only").trim().toLowerCase();
  if (!["read-only", "read-write"].includes(mode)) throw new Error("EVAVO_PIXEL_TYPOGRAPHY_REVIEW_MODE must be read-only or read-write.");
  const writesEnabled = mode === "read-write" && flag(environment.EVAVO_PIXEL_TYPOGRAPHY_REVIEW_ALLOW_WRITES, "EVAVO_PIXEL_TYPOGRAPHY_REVIEW_ALLOW_WRITES");
  if (mode === "read-write" && !writesEnabled) throw new Error("read-write mode also requires EVAVO_PIXEL_TYPOGRAPHY_REVIEW_ALLOW_WRITES=true.");
  const allowedRoots = roots(environment.EVAVO_PIXEL_TYPOGRAPHY_REVIEW_ALLOWED_ROOTS);
  if (!allowedRoots.length) throw new Error("EVAVO_PIXEL_TYPOGRAPHY_REVIEW_ALLOWED_ROOTS must not be empty.");
  const python = String(environment.EVAVO_PIXEL_TYPOGRAPHY_REVIEW_PYTHON ?? (process.platform === "win32" ? "python" : "python3")).trim();
  if (!python) throw new Error("EVAVO_PIXEL_TYPOGRAPHY_REVIEW_PYTHON must not be empty.");
  return Object.freeze({ mode, writesEnabled, allowedRoots: Object.freeze(allowedRoots), python });
}
function inside(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
async function canonicalAllowed(value, current, label, { future = false } = {}) {
  if (typeof value !== "string" || !value.trim() || value.length > 4096) throw new Error(`${label} is required and must be no longer than 4096 characters.`);
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
    if (!parentState.isDirectory() || parentState.isSymbolicLink()) throw new Error(`${label} parent must be a non-symlink directory.`);
    observed = path.join(await realpath(parent), path.basename(requested));
  } else {
    const state = await lstat(requested);
    if (state.isSymbolicLink()) throw new Error(`${label} must not be a symlink.`);
    observed = await realpath(requested);
  }
  if (!current.allowedRoots.some((root) => inside(observed, root))) throw new Error(`${label} is outside EVAVO_PIXEL_TYPOGRAPHY_REVIEW_ALLOWED_ROOTS.`);
  return requested;
}
function execute(current, args) {
  const result = spawnSync(current.python, [cliPath, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: false,
    timeout: 300_000,
    maxBuffer: MAX_BUFFER,
    env: { ...process.env, PYTHONUTF8: "1", PYTHONHASHSEED: "0", PYTHONDONTWRITEBYTECODE: "1", SOURCE_DATE_EPOCH: "1577836800" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Pixel Typography Review command failed (${result.status}): ${`${result.stderr ?? ""}\n${result.stdout ?? ""}`.trim()}`);
  try { return JSON.parse(result.stdout); } catch (error) { throw new Error(`Pixel Typography Review returned invalid JSON: ${error.message}`); }
}
const objectSchema = (properties, required = []) => ({ type: "object", additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const filePath = { type: "string", minLength: 1, maxLength: 4096 };
export function toolDefinitions(current = policy()) {
  const definitions = [
    { name: TOOLS.catalog, description: "List native-resolution and display-aspect review profiles, roles, outputs and authority boundaries.", inputSchema: objectSchema({}) },
    { name: TOOLS.validateProfile, description: "Validate one native-resolution review profile without writing files.", inputSchema: objectSchema({ profilePath: filePath }, ["profilePath"]) },
    { name: TOOLS.profileExample, description: "Return one original starter review profile without writing files.", inputSchema: objectSchema({ preset: { type: "string", minLength: 1, maxLength: 128 }, profileId: { type: "string", minLength: 1, maxLength: 128 } }, ["preset"]) },
    { name: TOOLS.validateOutput, description: "Verify a retained review kit, PNGs, palettes, integer previews and hashes.", inputSchema: objectSchema({ outputRoot: filePath }, ["outputRoot"]) },
    { name: TOOLS.compare, description: "Prove two review kits are byte-for-byte identical.", inputSchema: objectSchema({ firstRoot: filePath, secondRoot: filePath }, ["firstRoot", "secondRoot"]) },
  ];
  if (current.writesEnabled) definitions.push({
    name: TOOLS.build,
    description: "Build a create-only review kit from BMFont/PNG, Pixel Text style and review profile. Requires confirmWrite=true.",
    inputSchema: objectSchema({ fontPath: filePath, stylePath: filePath, profilePath: filePath, outputRoot: filePath, confirmWrite: { type: "boolean", const: true } }, ["fontPath", "stylePath", "profilePath", "outputRoot", "confirmWrite"]),
  });
  return Object.freeze(definitions);
}
export async function callTool(name, input = {}, context = {}) {
  const current = context.policy ?? policy();
  if (!toolDefinitions(current).some((definition) => definition.name === name)) throw new Error(`Unknown or prohibited Pixel Typography Review tool: ${name}`);
  if (name === TOOLS.catalog) return execute(current, ["catalog"]);
  if (name === TOOLS.profileExample) {
    const args = ["profile-example", "--preset", String(input.preset)];
    if (input.profileId) args.push("--profile-id", String(input.profileId));
    return execute(current, args);
  }
  if (name === TOOLS.validateProfile) return execute(current, ["validate-profile", "--profile", await canonicalAllowed(input.profilePath, current, "profilePath")]);
  if (name === TOOLS.validateOutput) return execute(current, ["validate-output", "--output", await canonicalAllowed(input.outputRoot, current, "outputRoot")]);
  if (name === TOOLS.compare) return execute(current, ["compare", "--first", await canonicalAllowed(input.firstRoot, current, "firstRoot"), "--second", await canonicalAllowed(input.secondRoot, current, "secondRoot")]);
  if (!current.writesEnabled || input.confirmWrite !== true) throw new Error("Pixel Typography Review building requires the write gate and confirmWrite=true.");
  return execute(current, [
    "build",
    "--font", await canonicalAllowed(input.fontPath, current, "fontPath"),
    "--style", await canonicalAllowed(input.stylePath, current, "stylePath"),
    "--profile", await canonicalAllowed(input.profilePath, current, "profilePath"),
    "--output", await canonicalAllowed(input.outputRoot, current, "outputRoot", { future: true }),
  ]);
}
function response(id, result) { return { jsonrpc: "2.0", id: id ?? null, result }; }
function content(value) { return [{ type: "text", text: JSON.stringify(value, null, 2) }]; }
export async function handleRequest(request, context = {}) {
  if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") throw new Error("Invalid JSON-RPC request.");
  const current = context.policy ?? policy();
  if (request.method === "initialize") return response(request.id, { protocolVersion: request.params?.protocolVersion ?? "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }, instructions: "Native-resolution pixel typography review. Writes are create-only and gated. No arbitrary shell, creative approval, repository mutation, Git commit, push or publication." });
  if (request.method === "ping") return response(request.id, {});
  if (request.method === "notifications/initialized") return null;
  if (request.method === "tools/list") return response(request.id, { tools: toolDefinitions(current) });
  if (request.method === "tools/call") {
    try { return response(request.id, { content: content(await callTool(request.params?.name, request.params?.arguments ?? {}, { policy: current })), isError: false }); }
    catch (error) { return response(request.id, { content: [{ type: "text", text: String(error?.message ?? error) }], isError: true }); }
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
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request?.id ?? null, error: { code: -32603, message: String(error?.message ?? error) } })}\n`);
    }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await serve();
