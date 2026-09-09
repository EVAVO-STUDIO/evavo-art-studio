#!/usr/bin/env node

import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { planGodotMaterialDelivery, renderGodotMaterialTres } from "../packages/godot/dist/index.js";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-godot-material-delivery";
const SERVER_VERSION = "1.1.0";
const PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_GODOT_MATERIAL_ALLOWED_ROOTS";
const WRITE_ENV = "EVAVO_GODOT_MATERIAL_ALLOW_WRITES";

const MAP_KINDS = Object.freeze(["base-color", "normal-tangent", "roughness", "metallic", "ambient-occlusion", "height", "specular", "emissive", "opacity", "orm-packed"]);
const SCALAR_CHANNELS = Object.freeze(["red", "green", "blue", "alpha"]);
const TARGETS = Object.freeze(["auto", "standard", "orm"]);
const NORMAL_CONVENTIONS = Object.freeze(["opengl", "directx"]);
const TRANSPARENCY_MODES = Object.freeze(["disabled", "alpha", "alpha-scissor", "alpha-hash", "alpha-depth-pre-pass"]);

const textureSchema = Object.freeze({
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    kind: { type: "string", enum: MAP_KINDS },
    resourcePath: { type: "string", minLength: 1 },
    scalarChannel: { type: "string", enum: SCALAR_CHANNELS },
  },
  required: ["id", "kind", "resourcePath"],
  additionalProperties: false,
});

const planProperties = Object.freeze({
  materialId: { type: "string", minLength: 1 },
  textures: { type: "array", minItems: 1, maxItems: 32, items: textureSchema },
  targetMaterial: { type: "string", enum: TARGETS },
  normalConvention: { type: "string", enum: NORMAL_CONVENTIONS },
  transparencyMode: { type: "string", enum: TRANSPARENCY_MODES },
  albedoAlphaCarriesOpacity: { type: "boolean" },
  normalScale: { type: "number", minimum: -16, maximum: 16 },
  heightScale: { type: "number", exclusiveMinimum: 0 },
  emissionEnergyMultiplier: { type: "number", exclusiveMinimum: 0 },
  alphaScissorThreshold: { type: "number", minimum: 0, maximum: 1 },
});

function planFromArgs(args) {
  return planGodotMaterialDelivery({
    materialId: args.materialId,
    textures: args.textures,
    ...(typeof args.targetMaterial === "string" ? { targetMaterial: args.targetMaterial } : {}),
    ...(typeof args.normalConvention === "string" ? { normalConvention: args.normalConvention } : {}),
    ...(typeof args.transparencyMode === "string" ? { transparencyMode: args.transparencyMode } : {}),
    ...(typeof args.albedoAlphaCarriesOpacity === "boolean" ? { albedoAlphaCarriesOpacity: args.albedoAlphaCarriesOpacity } : {}),
    ...(Number.isFinite(args.normalScale) ? { normalScale: args.normalScale } : {}),
    ...(Number.isFinite(args.heightScale) ? { heightScale: args.heightScale } : {}),
    ...(Number.isFinite(args.emissionEnergyMultiplier) ? { emissionEnergyMultiplier: args.emissionEnergyMultiplier } : {}),
    ...(Number.isFinite(args.alphaScissorThreshold) ? { alphaScissorThreshold: args.alphaScissorThreshold } : {}),
  });
}

const assertAllowedOutput = (filePath) => assertAllowedLocalPath(filePath, {
  envName: ALLOWED_ROOTS_ENV,
  output: true,
  label: "Godot material delivery",
});

function requireWriteAdmission(args) {
  if (process.env[WRITE_ENV] !== "true") throw new Error(`Godot material writes are disabled. Set ${WRITE_ENV}=true.`);
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required for this exact material write.");
}

async function assertCreateOnly(filePaths) {
  for (const filePath of filePaths) {
    try {
      await access(filePath);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
    throw new Error(`Create-only Godot material target already exists: ${filePath}`);
  }
}

async function createOnly(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, { flag: "wx" });
}

function identity(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

async function writeMaterial(args) {
  requireWriteAdmission(args);
  if (typeof args.outputPath !== "string") throw new Error("outputPath is required.");
  if (path.extname(args.outputPath).toLowerCase() !== ".tres") throw new Error("outputPath must end in .tres.");

  const plan = planFromArgs(args);
  if (plan.decision !== "ready") {
    throw new Error(`Godot material plan is ${plan.decision}; resolve preprocessing/blockers before writing.`);
  }
  const rendered = renderGodotMaterialTres(plan);
  const outputPath = await assertAllowedOutput(args.outputPath);
  const receiptPath = await assertAllowedOutput(typeof args.receiptPath === "string" ? args.receiptPath : `${outputPath}.receipt.json`);
  if (identity(outputPath) === identity(receiptPath)) throw new Error("Material output and receipt paths must be distinct.");
  await assertCreateOnly([outputPath, receiptPath]);

  const receipt = Object.freeze({
    schemaVersion: "1.1",
    operation: "evavo-write-godot-material-resource",
    approvalState: "unapproved",
    outputPath,
    receiptPath,
    plan,
    render: rendered.evidence,
    sourceModified: false,
    projectModified: true,
  });
  await createOnly(outputPath, rendered.text);
  await createOnly(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return Object.freeze({
    ok: true,
    outputPath,
    receiptPath,
    materialClass: plan.materialClass,
    render: rendered.evidence,
    approvalState: "unapproved",
    sourceModified: false,
    projectModified: true,
  });
}

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_godot_material_delivery_capabilities",
    description: "Describe Godot 4.6 material delivery planning and guarded create-only TRES materialization.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_plan_godot_material_delivery",
    description: "Plan explicit StandardMaterial3D or ORMMaterial3D bindings from admitted material maps. Read-only and never silently converts unsupported normal, opacity or specular workflows.",
    inputSchema: { type: "object", properties: planProperties, required: ["materialId", "textures"], additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_write_godot_material_resource",
    description: "Create a new Godot 4.6 .tres material plus JSON receipt from a ready plan. Fails closed on preprocessing/reject plans, existing outputs or paths outside configured roots.",
    inputSchema: {
      type: "object",
      properties: {
        ...planProperties,
        outputPath: { type: "string", minLength: 1 },
        receiptPath: { type: "string", minLength: 1 },
        confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["materialId", "textures", "outputPath", "confirmLocalWrite"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_godot_material_delivery_capabilities") {
    return Object.freeze({
      contract: "evavo_godot_material_delivery_agent_v1_1",
      godotTarget: "4.6.x",
      tools: tools.map((tool) => tool.name),
      targetClasses: ["StandardMaterial3D", "ORMMaterial3D"],
      resourceFormat: { extension: ".tres", format: 3, deprecatedLoadStepsEmitted: false },
      guardedWorkflows: [
        "DirectX normal maps require explicit Y conversion before binding",
        "standalone opacity maps require albedo-alpha composition or a reviewed custom shader",
        "standalone specular maps require re-authoring or a reviewed custom shader",
        "packed ORM and separate AO/roughness/metallic maps cannot both be authoritative",
      ],
      writesEnabled: process.env[WRITE_ENV] === "true",
      allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
      sourceMutationAllowed: false,
      createOnlyProjectWrites: true,
      visualRuntimeReviewRequired: true,
    });
  }
  if (name === "evavo_plan_godot_material_delivery") {
    return Object.freeze({ ok: true, plan: planFromArgs(args ?? {}), sourceModified: false, projectModified: false });
  }
  if (name === "evavo_write_godot_material_resource") return writeMaterial(args ?? {});
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}

function result(value, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value, isError };
}

async function dispatch(request) {
  if (request?.jsonrpc !== "2.0") return { jsonrpc: "2.0", id: request?.id ?? null, error: { code: -32600, message: "Invalid Request" } };
  if (request.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: `Godot material planning is read-only. Create-only TRES writes require ${ALLOWED_ROOTS_ENV}, ${WRITE_ENV}=true and confirmLocalWrite=true. Generated materials remain unapproved until runtime visual review.`,
      },
    };
  }
  if (request.method === "ping") return { jsonrpc: "2.0", id: request.id, result: {} };
  if (request.method === "tools/list") return { jsonrpc: "2.0", id: request.id, result: { tools } };
  if (request.method === "tools/call") {
    try {
      return { jsonrpc: "2.0", id: request.id, result: result(await callTool(request.params?.name, request.params?.arguments)) };
    } catch (error) {
      return { jsonrpc: "2.0", id: request.id, result: result({ code: "GODOT_MATERIAL_DELIVERY_FAILED", message: error instanceof Error ? error.message : String(error) }, true) };
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
    try { request = JSON.parse(line); } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
      return;
    }
    const response = await dispatch(request);
    if (response !== null) process.stdout.write(`${JSON.stringify(response)}\n`);
  });
});
