#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const artStudioRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function booleanEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`${name} must be true or false.`);
}

function roots() {
  const configured = process.env.EVAVO_ART_WORKSPACE_ROOTS;
  if (!configured) return [artStudioRoot];
  const delimiter = process.platform === "win32" ? ";" : ":";
  const values = configured
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));
  if (values.length < 1) throw new Error("EVAVO_ART_WORKSPACE_ROOTS is empty.");
  return [...new Set([artStudioRoot, ...values])];
}

const allowedRoots = roots();
const writeEnabled = booleanEnv("EVAVO_ART_WORKSPACE_MCP_ALLOW_WRITE", false);
const python = process.env.EVAVO_ART_WORKSPACE_PYTHON || (process.platform === "win32" ? "py" : "python3");
const pythonPrefix = process.platform === "win32" && path.basename(python).toLowerCase() === "py" ? ["-3"] : [];

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function confined(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  const candidate = path.resolve(value);
  if (!allowedRoots.some((root) => inside(root, candidate))) {
    throw new Error(`${label} is outside EVAVO_ART_WORKSPACE_ROOTS.`);
  }
  return candidate;
}

function requireWrite() {
  if (!writeEnabled) {
    throw new Error(
      "Workspace writes are disabled. Set EVAVO_ART_WORKSPACE_MCP_ALLOW_WRITE=true on the trusted local MCP deployment.",
    );
  }
}

const objectSchema = (properties, required) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
const pathField = { type: "string", minLength: 1, maxLength: 32768 };
const tools = Object.freeze([
  {
    name: "evavo_art_compile_intake",
    description: "Compile exact mounted/local image paths into a self-hashed Art Studio intake plan. Image bytes do not enter MCP.",
    inputSchema: objectSchema(
      { requestPath: pathField, planPath: pathField, compiledAt: { type: "string" } },
      ["requestPath", "planPath"],
    ),
  },
  {
    name: "evavo_art_run_intake",
    description: "Create an atomic temporary Art Studio workspace containing immutable originals, editable working copies and a storage handoff.",
    inputSchema: objectSchema(
      { planPath: pathField, outputRoot: pathField },
      ["planPath", "outputRoot"],
    ),
  },
  {
    name: "evavo_art_compile_atlas",
    description: "Compile exact local sprite-frame paths into a deterministic variable-size sprite-atlas plan.",
    inputSchema: objectSchema(
      { requestPath: pathField, planPath: pathField, compiledAt: { type: "string" } },
      ["requestPath", "planPath"],
    ),
  },
  {
    name: "evavo_art_run_atlas",
    description: "Build a create-only PNG sprite atlas with EVAVO, TexturePacker, Phaser and Godot metadata.",
    inputSchema: objectSchema(
      { planPath: pathField, outputRoot: pathField },
      ["planPath", "outputRoot"],
    ),
  },
]);

function run(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: artStudioRoot,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "Workspace command failed.").trim());
  }
  const lines = result.stdout.trim().split(/\r?\n/u).filter(Boolean);
  let summary = null;
  try {
    summary = JSON.parse(lines.at(-1) || "null");
  } catch {
    summary = { stdout: result.stdout.trim() };
  }
  return {
    summary,
    command: {
      executable: path.basename(executable),
      argumentCount: args.length,
      shell: false,
    },
    bytesFlowThroughMcp: false,
    repositoryMutation: false,
    storageWrite: false,
  };
}

function callTool(name, input) {
  requireWrite();
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Tool arguments must be an object.");
  }
  if (name === "evavo_art_compile_intake") {
    const requestPath = confined(input.requestPath, "requestPath");
    const planPath = confined(input.planPath, "planPath");
    const args = [
      path.join(artStudioRoot, "scripts", "compile-project-art-intake.mjs"),
      "--request",
      requestPath,
      "--output",
      planPath,
    ];
    if (input.compiledAt) args.push("--compiled-at", String(input.compiledAt));
    return run(process.execPath, args);
  }
  if (name === "evavo_art_run_intake") {
    return run(python, [
      ...pythonPrefix,
      path.join(artStudioRoot, "tools", "run_project_art_intake.py"),
      "--plan",
      confined(input.planPath, "planPath"),
      "--output-root",
      confined(input.outputRoot, "outputRoot"),
    ]);
  }
  if (name === "evavo_art_compile_atlas") {
    const requestPath = confined(input.requestPath, "requestPath");
    const planPath = confined(input.planPath, "planPath");
    const args = [
      path.join(artStudioRoot, "scripts", "compile-project-art-atlas.mjs"),
      "--request",
      requestPath,
      "--output",
      planPath,
    ];
    if (input.compiledAt) args.push("--compiled-at", String(input.compiledAt));
    return run(process.execPath, args);
  }
  if (name === "evavo_art_run_atlas") {
    return run(python, [
      ...pythonPrefix,
      path.join(artStudioRoot, "tools", "build_project_art_atlas.py"),
      "--plan",
      confined(input.planPath, "planPath"),
      "--output-root",
      confined(input.outputRoot, "outputRoot"),
    ]);
  }
  throw new Error(`Unknown tool: ${name}`);
}

function response(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function errorResponse(id, error) {
  process.stdout.write(`${JSON.stringify({
    jsonrpc: "2.0",
    id,
    error: {
      code: -32000,
      message: error instanceof Error ? error.message : String(error),
    },
  })}\n`);
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (!line.trim()) continue;
  let request;
  try {
    request = JSON.parse(line);
    if (request.method === "initialize") {
      response(request.id, {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "evavo-project-art-workspace", version: "1.0.0" },
      });
    } else if (request.method === "notifications/initialized") {
      // Notification: no response.
    } else if (request.method === "tools/list") {
      response(request.id, { tools });
    } else if (request.method === "tools/call") {
      const name = request.params?.name;
      const output = callTool(name, request.params?.arguments ?? {});
      response(request.id, {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
        isError: false,
      });
    } else {
      errorResponse(request.id, new Error(`Unsupported method: ${request.method}`));
    }
  } catch (error) {
    if (request?.id !== undefined) errorResponse(request.id, error);
  }
}
