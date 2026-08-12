#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import {
  heavyMetalFightingProductionRegistryBatch,
  heavyMetalFightingProductionRegistrySummary,
  verifyHmfProductionBatchRegistry,
} from "./heavy-metal-fighting/batch-registry.mjs";
import {
  buildHmfStyleProofExecutionPlan,
  heavyMetalFightingStyleProofExecutionStatus,
  verifyHmfStyleProofExecutionPlan,
} from "./heavy-metal-fighting/style-proof-plan.mjs";
import {
  buildHmfProductionWorkOrderBatch,
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionReceiptTemplate,
  heavyMetalFightingProductionRepairTemplate,
  heavyMetalFightingProductionWorkOrder,
} from "./heavy-metal-fighting/work-orders.mjs";
import { verifyHmfProductionWorkOrders } from "./heavy-metal-fighting/work-order-verification.mjs";

export const SERVER_NAME = "evavo-heavy-metal-fighting-production";
export const SERVER_VERSION = "1.1.0";

export const REGISTRY_SUMMARY_TOOL = "evavo_hmf_production_registry_summary";
export const REGISTRY_BATCH_TOOL = "evavo_hmf_production_registry_batch";
export const STYLE_PROOF_EXECUTION_TOOL = "evavo_hmf_production_style_proof_execution";
export const WORK_ORDER_BATCH_TOOL = "evavo_hmf_production_work_order_batch";
export const WORK_ORDER_TOOL = "evavo_hmf_production_work_order";
export const RECEIPT_TEMPLATE_TOOL = "evavo_hmf_production_receipt_template";
export const REPAIR_TEMPLATE_TOOL = "evavo_hmf_production_repair_template";
export const RESUME_BATCH_TOOL = "evavo_hmf_production_resume_batch";
export const VERIFY_TOOL = "evavo_hmf_production_verify";

const objectSchema = (properties = {}, required = []) => ({
  type: "object",
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});

const BATCH_ID_SCHEMA = {
  anyOf: [
    { type: "integer", minimum: 1, maximum: 179 },
    { type: "string", pattern: "^hmf-b(?:0[0-9]{3}|01[0-7][0-9]|0179)$" },
  ],
};

const APPROVAL_RECORD_SCHEMA = objectSchema({
  id: { type: "string", minLength: 1 },
  actorClass: { const: "human" },
  actorId: { type: "string", minLength: 1 },
  occurredAt: { type: "string", minLength: 1 },
  evidenceSha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
}, ["id", "actorClass", "actorId", "occurredAt", "evidenceSha256"]);

export function toolDefinitions() {
  return Object.freeze([
    {
      name: REGISTRY_SUMMARY_TOOL,
      description: "Return the exact HEAVY METAL FIGHTING final-production queue summary: 1,573 source images, 179 governed batches, style-proof batch ids, hashes and authority boundary.",
      inputSchema: objectSchema(),
    },
    {
      name: REGISTRY_BATCH_TOOL,
      description: "Inspect one exact numbered HMF production batch with up to ten separate source-art units, dependencies, approval prerequisites and output paths.",
      inputSchema: objectSchema({ batch: BATCH_ID_SCHEMA }, ["batch"]),
    },
    {
      name: STYLE_PROOF_EXECUTION_TOOL,
      description: "Compile the exact four-phase Branka/Bastion/Foundry Nine style-proof execution plan and optionally derive cross-batch readiness from externally recorded human approval evidence and production receipts. This never generates, approves or persists anything.",
      inputSchema: objectSchema({
        approvalRecords: { type: "array", items: APPROVAL_RECORD_SCHEMA, default: [] },
        receipts: { type: "array", items: { type: "object" }, default: [] },
      }),
    },
    {
      name: WORK_ORDER_BATCH_TOOL,
      description: "Compile the immutable one-image Art Studio work orders for one numbered HMF batch. This only compiles instructions; it does not call a provider.",
      inputSchema: objectSchema({ batch: BATCH_ID_SCHEMA }, ["batch"]),
    },
    {
      name: WORK_ORDER_TOOL,
      description: "Compile one exact immutable HMF production work order with identity references, dimensions, continuity, prompt, failure codes and candidate/review paths.",
      inputSchema: objectSchema({ unitId: { type: "string", minLength: 1 } }, ["unitId"]),
    },
    {
      name: RECEIPT_TEMPLATE_TOOL,
      description: "Return the receipt lifecycle and human-gated state requirements for one exact HMF production unit. This does not create or persist a receipt.",
      inputSchema: objectSchema({ unitId: { type: "string", minLength: 1 } }, ["unitId"]),
    },
    {
      name: REPAIR_TEMPLATE_TOOL,
      description: "Compile one bounded repair plan for an already-failed candidate, preserving all passing siblings. This does not execute the repair.",
      inputSchema: objectSchema({
        unitId: { type: "string", minLength: 1 },
        candidateSha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
        failureCodes: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", minLength: 1 } },
        attempt: { type: "integer", minimum: 1, maximum: 3 },
      }, ["unitId", "candidateSha256", "failureCodes"]),
    },
    {
      name: RESUME_BATCH_TOOL,
      description: "Compile a deterministic resume plan for one HMF batch from zero or more existing hash-linked receipts. No provider call or state mutation occurs.",
      inputSchema: objectSchema({
        batch: BATCH_ID_SCHEMA,
        receipts: { type: "array", items: { type: "object" }, default: [] },
      }, ["batch"]),
    },
    {
      name: VERIFY_TOOL,
      description: "Verify the exact HMF registry, style-proof execution and work-order governance layers without provider execution, approval, promotion, filesystem writes or repository mutation.",
      inputSchema: objectSchema(),
    },
  ]);
}

function normalizeBatch(value) {
  return Number.isInteger(value) ? String(value) : String(value ?? "").trim().toLowerCase();
}

export async function callTool(name, input = {}) {
  if (!toolDefinitions().some((tool) => tool.name === name)) {
    throw new Error(`Unknown or prohibited HEAVY METAL FIGHTING production tool ${name}.`);
  }
  if (name === REGISTRY_SUMMARY_TOOL) return heavyMetalFightingProductionRegistrySummary();
  if (name === REGISTRY_BATCH_TOOL) return heavyMetalFightingProductionRegistryBatch(normalizeBatch(input.batch));
  if (name === STYLE_PROOF_EXECUTION_TOOL) {
    const [plan, status] = await Promise.all([
      buildHmfStyleProofExecutionPlan(),
      heavyMetalFightingStyleProofExecutionStatus({
        approvalRecords: input.approvalRecords ?? [],
        receipts: input.receipts ?? [],
      }),
    ]);
    return Object.freeze({
      schema: "evavo.heavy-metal-fighting-production-style-proof-agent-view.v1",
      plan,
      status,
    });
  }
  if (name === WORK_ORDER_BATCH_TOOL) return buildHmfProductionWorkOrderBatch(normalizeBatch(input.batch));
  if (name === WORK_ORDER_TOOL) return heavyMetalFightingProductionWorkOrder(input.unitId);
  if (name === RECEIPT_TEMPLATE_TOOL) return heavyMetalFightingProductionReceiptTemplate(input.unitId);
  if (name === REPAIR_TEMPLATE_TOOL) return heavyMetalFightingProductionRepairTemplate(input.unitId, {
    candidateSha256: input.candidateSha256,
    failureCodes: input.failureCodes,
    attempt: input.attempt ?? 1,
  });
  if (name === RESUME_BATCH_TOOL) return heavyMetalFightingProductionBatchResumePlan(normalizeBatch(input.batch), input.receipts ?? []);
  if (name === VERIFY_TOOL) {
    const [registry, styleProofExecution, workOrders] = await Promise.all([
      verifyHmfProductionBatchRegistry(),
      verifyHmfStyleProofExecutionPlan(),
      verifyHmfProductionWorkOrders(),
    ]);
    return Object.freeze({
      schema: "evavo.heavy-metal-fighting-production-agent-verification.v2",
      status: registry.status === "passed" && styleProofExecution.status === "passed" && workOrders.status === "passed" ? "passed" : "failed",
      registry,
      styleProofExecution,
      workOrders,
      authority: Object.freeze({
        providerExecution: false,
        receiptPersistence: false,
        automaticApproval: false,
        automaticPromotion: false,
        targetRepositoryMutation: false,
        gitMutation: false,
        publication: false,
      }),
    });
  }
  throw new Error(`Unhandled HEAVY METAL FIGHTING production tool ${name}.`);
}

const response = (id, result) => ({ jsonrpc: "2.0", id: id ?? null, result });
const content = (value) => [{ type: "text", text: JSON.stringify(value, null, 2) }];

export async function handleRequest(request) {
  if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    throw new Error("Invalid JSON-RPC request.");
  }
  if (request.method === "initialize") {
    return response(request.id, {
      protocolVersion: request.params?.protocolVersion ?? "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      instructions: "Read-only HEAVY METAL FIGHTING final-art production surface. It exposes the 1,573-image / 179-batch registry, the four-phase Branka/Bastion/Foundry Nine style-proof controller, immutable one-image work orders, receipt requirements, bounded repair templates and deterministic resume planning. It does not generate images, persist receipts or approvals, approve art, promote masters, mutate the game repository, commit, push, deploy or publish.",
    });
  }
  if (request.method === "ping") return response(request.id, {});
  if (request.method === "notifications/initialized") return null;
  if (request.method === "tools/list") return response(request.id, { tools: toolDefinitions() });
  if (request.method === "tools/call") {
    try {
      return response(request.id, {
        content: content(await callTool(request.params?.name, request.params?.arguments ?? {})),
        isError: false,
      });
    } catch (error) {
      return response(request.id, {
        content: content({ error: error instanceof Error ? error.message : String(error) }),
        isError: true,
      });
    }
  }
  throw new Error(`Unsupported MCP method ${request.method}.`);
}

export async function startServer() {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  for await (const line of input) {
    if (!line.trim()) continue;
    let request;
    try {
      request = JSON.parse(line);
      const result = await handleRequest(request);
      if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({
        jsonrpc: "2.0",
        id: request?.id ?? null,
        error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
      })}\n`);
    }
  }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  startServer().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
