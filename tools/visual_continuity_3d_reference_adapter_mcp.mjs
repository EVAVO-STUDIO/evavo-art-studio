#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import {
  ADAPTER_PROTOCOL_VERSION,
  ADAPTER_REQUEST_CONTRACT,
  compileContinuity3dReferenceHandoff,
  verifyContinuity3dReferenceHandoff,
} from "../scripts/game-art-production/visual-continuity-3d-reference-adapter.mjs";
import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import {
  assertAllowedLocalPath,
  configuredLocalRootCount,
} from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-visual-continuity-3d-reference-adapter";
const SERVER_VERSION = "1.0.0";
const MCP_PROTOCOL_VERSION = "2025-03-26";
const ALLOWED_ROOTS_ENV = "EVAVO_VISUAL_CONTINUITY_3D_ALLOWED_ROOTS";
const ALLOW_WRITES_ENV = "EVAVO_VISUAL_CONTINUITY_3D_ALLOW_WRITES";

const assertAllowed = (filePath, output = false, label = "visual continuity 3D adapter") =>
  assertAllowedLocalPath(filePath, {
    envName: ALLOWED_ROOTS_ENV,
    output,
    label,
  });

function writesEnabled() {
  return process.env[ALLOW_WRITES_ENV] === "true";
}

async function loadGuardedRequest(requestPathInput) {
  if (typeof requestPathInput !== "string" || !requestPathInput.trim()) {
    throw new Error("requestPath is required.");
  }
  const requestPath = await assertAllowed(requestPathInput, false, "3D adapter request");
  const bytes = await readFile(requestPath);
  if (bytes.length < 2 || bytes.length > 64 * 1024 * 1024) {
    throw new Error("3D adapter request size is invalid.");
  }
  let request;
  try {
    request = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("3D adapter request is not valid JSON.");
  }
  if (request?.contractVersion !== ADAPTER_REQUEST_CONTRACT) {
    throw new Error(`request contract must be ${ADAPTER_REQUEST_CONTRACT}.`);
  }
  const baseDirectory = path.dirname(requestPath);
  await assertAllowed(
    path.resolve(baseDirectory, request.approvedHandoffPath),
    false,
    "approved continuity handoff",
  );
  if (!Array.isArray(request.references)) {
    throw new Error("request.references must be an array.");
  }
  for (const [index, reference] of request.references.entries()) {
    await assertAllowed(
      path.resolve(baseDirectory, reference?.path ?? ""),
      false,
      `3D adapter reference ${index}`,
    );
  }
  return { requestPath, baseDirectory, request };
}

async function compileAdapter(args) {
  const loaded = await loadGuardedRequest(args.requestPath);
  const handoff = await compileContinuity3dReferenceHandoff(loaded.request, {
    baseDirectory: loaded.baseDirectory,
    sourceProgramPath: loaded.requestPath,
  });
  let writeReceipt;
  if (args.outputPath !== undefined) {
    if (!writesEnabled()) {
      throw new Error(`${ALLOW_WRITES_ENV}=true is required to write a handoff.`);
    }
    const outputPath = await assertAllowed(
      args.outputPath,
      true,
      "3D adapter output",
    );
    if (path.extname(outputPath).toLowerCase() !== ".json") {
      throw new Error("outputPath must end in .json.");
    }
    writeReceipt = await writeCreateOnlyBundle([
      {
        path: outputPath,
        data: `${JSON.stringify(handoff, null, 2)}\n`,
        encoding: "utf8",
      },
    ]);
  }
  return Object.freeze({
    ok: true,
    requestPath: loaded.requestPath,
    handoff,
    ...(writeReceipt ? { writeReceipt } : {}),
    receiverExecutionPerformed: false,
    receiver: "evavo-3d-art-reference-brief",
    workerTaskId: "creative-media-3d-art-reference-brief",
  });
}

async function verifyAdapter(args) {
  const loaded = await loadGuardedRequest(args.requestPath);
  if (typeof args.handoffPath !== "string" || !args.handoffPath.trim()) {
    throw new Error("handoffPath is required.");
  }
  const handoffPath = await assertAllowed(
    args.handoffPath,
    false,
    "3D receiver handoff",
  );
  const handoff = JSON.parse(await readFile(handoffPath, "utf8"));
  await verifyContinuity3dReferenceHandoff(loaded.request, handoff, {
    baseDirectory: loaded.baseDirectory,
    sourceProgramPath: loaded.requestPath,
  });
  return Object.freeze({
    ok: true,
    requestPath: loaded.requestPath,
    handoffPath,
    handoffSha256: handoff.handoffSha256,
    receiverExecutionPerformed: false,
  });
}

const tools = Object.freeze([
  Object.freeze({
    name: "evavo_visual_continuity_3d_adapter_capabilities",
    description:
      "Describe the governed adapter from approved visual-continuity sources to the exact EVAVO 3D Studio multi-view reference-handoff receiver schema.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  }),
  Object.freeze({
    name: "evavo_compile_visual_continuity_3d_handoff",
    description:
      "Compile exact approved continuity view files, approval receipts, style locks and 3D production intent into the live evavo-3d-art-reference-brief schema. Optionally write one create-only JSON file when server-side writes are enabled. Does not execute the receiver.",
    inputSchema: {
      type: "object",
      properties: {
        requestPath: { type: "string", minLength: 1 },
        outputPath: { type: "string", minLength: 1 },
      },
      required: ["requestPath"],
      additionalProperties: false,
    },
  }),
  Object.freeze({
    name: "evavo_verify_visual_continuity_3d_handoff",
    description:
      "Verify an existing 3D receiver handoff by replaying the exact approved continuity adapter request and comparing the complete deterministic output.",
    inputSchema: {
      type: "object",
      properties: {
        requestPath: { type: "string", minLength: 1 },
        handoffPath: { type: "string", minLength: 1 },
      },
      required: ["requestPath", "handoffPath"],
      additionalProperties: false,
    },
  }),
]);

async function callTool(name, args) {
  if (name === "evavo_visual_continuity_3d_adapter_capabilities") {
    return Object.freeze({
      contract: "evavo_visual_continuity_3d_reference_adapter_mcp_v1",
      protocolVersion: ADAPTER_PROTOCOL_VERSION,
      requestContract: ADAPTER_REQUEST_CONTRACT,
      outputSchema: "evavo.art.asset-fabricator-reference-handoff.v1",
      receiver: "evavo-3d-art-reference-brief",
      workerTaskId: "creative-media-3d-art-reference-brief",
      requiredViews: ["front", "back", "left", "right", "three-quarter"],
      topRequiredFor: ["vehicle", "architecture", "environment-piece", "environment-kit", "terrain"],
      allowedRootCount: configuredLocalRootCount(ALLOWED_ROOTS_ENV),
      writesEnabled: writesEnabled(),
      createOnlyWrites: true,
      providerExecution: false,
      receiverExecution: false,
      automaticCreativeApproval: false,
      targetRepositoryMutation: false,
      publication: false,
    });
  }
  if (name === "evavo_compile_visual_continuity_3d_handoff") {
    return compileAdapter(args ?? {});
  }
  if (name === "evavo_verify_visual_continuity_3d_handoff") {
    return verifyAdapter(args ?? {});
  }
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
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          `Configure ${ALLOWED_ROOTS_ENV}. Compilation is read-only unless ${ALLOW_WRITES_ENV}=true and an outputPath is supplied. Receiver execution is always separate.`,
      },
    };
  }
  if (request.method === "ping") {
    return { jsonrpc: "2.0", id: request.id, result: {} };
  }
  if (request.method === "tools/list") {
    return { jsonrpc: "2.0", id: request.id, result: { tools } };
  }
  if (request.method === "tools/call") {
    try {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: result(await callTool(request.params?.name, request.params?.arguments)),
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: result(
          {
            code: "VISUAL_CONTINUITY_3D_ADAPTER_FAILED",
            message: error instanceof Error ? error.message : String(error),
          },
          true,
        ),
      };
    }
  }
  if (request.method?.startsWith("notifications/")) return null;
  return {
    jsonrpc: "2.0",
    id: request.id ?? null,
    error: { code: -32601, message: "Method not found" },
  };
}

const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
  terminal: false,
});
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
