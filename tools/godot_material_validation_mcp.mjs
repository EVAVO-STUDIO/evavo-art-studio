#!/usr/bin/env node

import { access } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { runGodotMaterialValidation } from "../packages/godot/dist/index.js";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-godot-material-validator";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_GODOT_MATERIAL_VALIDATION_ALLOWED_ROOTS";
const EXECUTION_ENV = "EVAVO_GODOT_MATERIAL_ALLOW_EXECUTION";
const EXECUTABLE_ENV = "EVAVO_GODOT_EXECUTABLE";
const MATERIAL_CLASSES = Object.freeze(["StandardMaterial3D", "ORMMaterial3D"]);

const assertAllowedProjectPath = (filePath) => assertAllowedLocalPath(filePath, {
  envName: ALLOWED_ROOTS_ENV,
  output: false,
  label: "Godot material validation project",
});

function requireExecutionAdmission(args) {
  if (process.env[EXECUTION_ENV] !== "true") {
    throw new Error(`Godot material validation execution is disabled. Set ${EXECUTION_ENV}=true.`);
  }
  if (args.confirmLocalExecution !== true) {
    throw new Error("confirmLocalExecution=true is required for this exact native validation call.");
  }
}

function validateResourcePath(resourcePath) {
  if (typeof resourcePath !== "string" || !resourcePath.startsWith("res://") || !resourcePath.toLowerCase().endsWith(".tres")) {
    throw new Error("resourcePath must be a res:// path ending in .tres.");
  }
  const relative = resourcePath.slice("res://".length);
  if (!relative || relative.includes("\\") || relative.split("/").some((segment) => segment === ".." || segment === "." || segment === "")) {
    throw new Error("resourcePath must remain inside res:// and may not contain empty, dot or parent segments.");
  }
  return resourcePath;
}

function localPathForResource(projectPath, resourcePath) {
  const relative = resourcePath.slice("res://".length).split("/");
  const resolved = path.resolve(projectPath, ...relative);
  const project = path.resolve(projectPath);
  const relation = path.relative(project, resolved);
  if (relation === ".." || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw new Error("resourcePath resolves outside projectPath.");
  }
  return resolved;
}

async function validateMaterial(args) {
  requireExecutionAdmission(args);
  if (typeof args.projectPath !== "string") throw new Error("projectPath is required.");
  const resourcePath = validateResourcePath(args.resourcePath);
  const projectPath = await assertAllowedProjectPath(args.projectPath);
  await access(path.join(projectPath, "project.godot"));
  const localResourcePath = localPathForResource(projectPath, resourcePath);
  await access(localResourcePath);

  const expectedClass = typeof args.expectedClass === "string" ? args.expectedClass : undefined;
  if (expectedClass !== undefined && !MATERIAL_CLASSES.includes(expectedClass)) {
    throw new Error("expectedClass must be StandardMaterial3D or ORMMaterial3D.");
  }
  const godotExecutable = process.env[EXECUTABLE_ENV];
  if (!godotExecutable?.trim()) throw new Error(`${EXECUTABLE_ENV} is not configured.`);

  const validation = await runGodotMaterialValidation({
    godotExecutable,
    projectPath,
    resourcePath,
    ...(expectedClass ? { expectedClass } : {}),
    ...(Number.isInteger(args.timeoutMs) ? { timeoutMs: args.timeoutMs } : {}),
  });
  return Object.freeze({
    ok: true,
    projectPath,
    localResourcePath,
    validation,
    approvalState: "native-load-validated-unapproved",
    sourceModified: false,
    projectCacheMayChange: true,
  });
}

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_godot_material_validation_capabilities",
    description: "Describe execution-gated native Godot 4.6 material resource validation.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_validate_godot_material_resource",
    description: "Launch the environment-configured Godot executable headlessly to load one existing res:// .tres material and optionally verify its resource class. No source file is rewritten, but Godot may update normal project import/cache data.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string", minLength: 1 },
        resourcePath: { type: "string", pattern: "^res://.+\\.tres$" },
        expectedClass: { type: "string", enum: MATERIAL_CLASSES },
        timeoutMs: { type: "integer", minimum: 1000, maximum: 600000 },
        confirmLocalExecution: { type: "boolean", const: true },
      },
      required: ["projectPath", "resourcePath", "confirmLocalExecution"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_godot_material_validation_capabilities") {
    return Object.freeze({
      contract: "evavo_godot_material_validation_agent_v1",
      godotTarget: "4.6.x",
      mode: "execution-gated-native-validation",
      tools: tools.map((tool) => tool.name),
      executionEnabled: process.env[EXECUTION_ENV] === "true",
      godotExecutableConfigured: Boolean(process.env[EXECUTABLE_ENV]?.trim()),
      allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
      executionContract: Object.freeze({
        shell: false,
        headless: true,
        executableComesFromEnvironmentOnly: true,
        timeoutProtected: true,
        temporaryValidatorOutsideProject: true,
      }),
      guarantees: Object.freeze({
        sourceMutationAllowed: false,
        arbitraryExecutableInputAllowed: false,
        resourcePathRestrictedToResTres: true,
        projectCacheMayChange: true,
        automaticApproval: false,
      }),
    });
  }
  if (name === "evavo_validate_godot_material_resource") return validateMaterial(args ?? {});
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}

function result(value, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError,
  };
}

async function dispatch(request) {
  if (request?.jsonrpc !== "2.0") {
    return { jsonrpc: "2.0", id: request?.id ?? null, error: { code: -32600, message: "Invalid Request" } };
  }
  if (request.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: `Native Godot material loading is disabled by default. Configure ${ALLOWED_ROOTS_ENV}, ${EXECUTABLE_ENV}, set ${EXECUTION_ENV}=true and pass confirmLocalExecution=true for the exact call.`,
      },
    };
  }
  if (request.method === "ping") return { jsonrpc: "2.0", id: request.id, result: {} };
  if (request.method === "tools/list") return { jsonrpc: "2.0", id: request.id, result: { tools } };
  if (request.method === "tools/call") {
    try {
      return { jsonrpc: "2.0", id: request.id, result: result(await callTool(request.params?.name, request.params?.arguments)) };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: result({ code: "GODOT_MATERIAL_VALIDATION_FAILED", message: error instanceof Error ? error.message : String(error) }, true),
      };
    }
  }
  if (request.method?.startsWith("notifications/")) return null;
  return { jsonrpc: "2.0", id: request.id ?? null, error: { code: -32601, message: "Method not found" } };
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
let chain = Promise.resolve();
input.on("line", (line) => {
  if (!line.trim()) return;
  chain = chain.then(async () => {
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
      return;
    }
    const response = await dispatch(request);
    if (response !== null) process.stdout.write(`${JSON.stringify(response)}\n`);
  });
});
