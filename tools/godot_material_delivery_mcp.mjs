#!/usr/bin/env node

import readline from "node:readline";

import { planGodotMaterialDelivery } from "../packages/godot/dist/index.js";

const SERVER_NAME = "evavo-godot-material-delivery";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";

const MAP_KINDS = Object.freeze([
  "base-color",
  "normal-tangent",
  "roughness",
  "metallic",
  "ambient-occlusion",
  "height",
  "specular",
  "emissive",
  "opacity",
  "orm-packed",
]);
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

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_godot_material_delivery_capabilities",
    description: "Describe the read-only Godot 4.x material delivery planner used after texture/material/UV assurance.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_plan_godot_material_delivery",
    description: "Plan explicit StandardMaterial3D or ORMMaterial3D bindings from admitted material maps. Never writes project files and never silently converts unsupported normal, opacity or specular workflows.",
    inputSchema: {
      type: "object",
      properties: {
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
      },
      required: ["materialId", "textures"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_godot_material_delivery_capabilities") {
    return Object.freeze({
      contract: "evavo_godot_material_delivery_agent_v1",
      mode: "read-only-planning",
      tools: tools.map((tool) => tool.name),
      targetClasses: ["StandardMaterial3D", "ORMMaterial3D"],
      directTextureBindings: [
        "albedo_texture",
        "normal_texture",
        "roughness_texture",
        "metallic_texture",
        "ao_texture",
        "heightmap_texture",
        "emission_texture",
        "orm_texture",
      ],
      guardedWorkflows: [
        "DirectX normal maps require explicit Y conversion before binding",
        "standalone opacity maps require albedo-alpha composition or a reviewed custom shader",
        "standalone specular maps require re-authoring or a reviewed custom shader",
        "packed ORM and separate AO/roughness/metallic maps cannot both be authoritative",
      ],
      sourceMutationAllowed: false,
      projectWritesAllowed: false,
      visualRuntimeReviewRequired: true,
    });
  }
  if (name === "evavo_plan_godot_material_delivery") {
    return Object.freeze({
      ok: true,
      plan: planGodotMaterialDelivery(args ?? {}),
      sourceModified: false,
      projectModified: false,
    });
  }
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
        instructions: "Read-only Godot material delivery planning. Run texture/material/UV assurance first; this surface plans engine bindings but never writes project files.",
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
        result: result({ code: "GODOT_MATERIAL_DELIVERY_FAILED", message: error instanceof Error ? error.message : String(error) }, true),
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
