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
  heavyMetalFightingBodyChoreographyOverlay,
  verifyHmfBodyChoreographyOverlays,
} from "./heavy-metal-fighting/frame-body-choreography-overlay.mjs";
import {
  buildHmfProviderExecutionEnvelopeBatch,
  heavyMetalFightingProviderExecutionEnvelope,
  verifyHmfProviderExecutionEnvelopes,
} from "./heavy-metal-fighting/frame-body-provider-execution-envelope.mjs";
import {
  buildHmfFrameAtlasV3Layout,
  verifyHmfFrameAtlasV3Delivery,
} from "./heavy-metal-fighting/frame-atlas-v3-delivery.mjs";
import {
  buildHmfFrameMoveBodyChoreography,
  verifyHmfFrameMoveBodyChoreography,
} from "./heavy-metal-fighting/frame-move-body-choreography.mjs";
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
export const SERVER_VERSION = "1.5.0";

export const REGISTRY_SUMMARY_TOOL = "evavo_hmf_production_registry_summary";
export const REGISTRY_BATCH_TOOL = "evavo_hmf_production_registry_batch";
export const STYLE_PROOF_EXECUTION_TOOL = "evavo_hmf_production_style_proof_execution";
export const FRAME_ATLAS_V3_TOOL = "evavo_hmf_production_frame_atlas_v3";
export const FRAME_MOVE_CHOREOGRAPHY_TOOL = "evavo_hmf_production_frame_move_choreography";
export const BODY_CHOREOGRAPHY_OVERLAY_TOOL = "evavo_hmf_production_body_choreography_overlay";
export const PROVIDER_EXECUTION_ENVELOPE_TOOL = "evavo_hmf_production_provider_execution_envelope";
export const PROVIDER_EXECUTION_ENVELOPE_BATCH_TOOL = "evavo_hmf_production_provider_execution_envelope_batch";
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
const FRAME_ID_SCHEMA = {
  type: "string",
  enum: ["bastion", "viper", "citadel", "mirage"],
};
const APPROVAL_RECORD_SCHEMA = objectSchema({
  id: { type: "string", minLength: 1 },
  actorClass: { const: "human" },
  actorId: { type: "string", minLength: 1 },
  occurredAt: { type: "string", minLength: 1 },
  evidenceSha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
}, ["id", "actorClass", "actorId", "occurredAt", "evidenceSha256"]);
const ARTIFACT_BINDING_PROPERTIES = {
  unitId: { type: "string", minLength: 1 },
  bindingKey: { type: "string", minLength: 1 },
  sourcePath: { type: "string", minLength: 1 },
  artifactId: { type: "string", pattern: "^artifact_[0-9a-f]{64}$" },
  evidenceSha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
  actorClass: { const: "human" },
  actorId: { type: "string", minLength: 1 },
  occurredAt: { type: "string", minLength: 1 },
};
const SINGLE_ARTIFACT_BINDING_SCHEMA = objectSchema(
  ARTIFACT_BINDING_PROPERTIES,
  ["bindingKey", "sourcePath", "artifactId", "evidenceSha256", "actorClass", "actorId", "occurredAt"],
);
const BATCH_ARTIFACT_BINDING_SCHEMA = objectSchema(
  ARTIFACT_BINDING_PROPERTIES,
  ["unitId", "bindingKey", "sourcePath", "artifactId", "evidenceSha256", "actorClass", "actorId", "occurredAt"],
);

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
      name: FRAME_ATLAS_V3_TOOL,
      description: "Return the deterministic 224-authored-cel / 32-transparent-reserve atlas-v3 layout for one Frame, including semantic body roles, motion realization, all 26 governed body batches, exact master paths and the steel-dominion final-v3 target path. This does not read image bytes, build an atlas or mutate either repository.",
      inputSchema: objectSchema({ frameId: FRAME_ID_SCHEMA }, ["frameId"]),
    },
    {
      name: FRAME_MOVE_CHOREOGRAPHY_TOOL,
      description: "Return the exact 11-move named production body choreography for one Frame: six normals, two specials, reversal, Overdrive and throw, mapped to production-master-v3 role slots while preserving runtime implementation and timing as read-only external authority.",
      inputSchema: objectSchema({ frameId: FRAME_ID_SCHEMA }, ["frameId"]),
    },
    {
      name: BODY_CHOREOGRAPHY_OVERLAY_TOOL,
      description: "Compile a hash-bound supplemental choreography overlay for one existing Frame body-cel work order. It adds exact body-role, motion and optional named-move context without mutating the base workOrderSha256 or receipt chain and without executing a provider.",
      inputSchema: objectSchema({ unitId: { type: "string", minLength: 1 } }, ["unitId"]),
    },
    {
      name: PROVIDER_EXECUTION_ENVELOPE_TOOL,
      description: "Compose one immutable Frame body work order and its choreography overlay into a hash-bound provider execution envelope. Optional external receipts and human-admitted reference artifacts can make it submit-ready, but this tool never executes the provider, admits artifacts, persists receipts or approves the candidate.",
      inputSchema: objectSchema({
        unitId: { type: "string", minLength: 1 },
        receipts: { type: "array", items: { type: "object" }, default: [] },
        artifactBindings: { type: "array", items: SINGLE_ARTIFACT_BINDING_SCHEMA, maxItems: 16, default: [] },
      }, ["unitId"]),
    },
    {
      name: PROVIDER_EXECUTION_ENVELOPE_BATCH_TOOL,
      description: "Compile the existing 1-10 work units in one Frame-animation batch into provider execution envelopes. Every reference artifact binding must identify its exact unit. This remains compilation-only and performs no provider call or state mutation.",
      inputSchema: objectSchema({
        batch: BATCH_ID_SCHEMA,
        receipts: { type: "array", items: { type: "object" }, default: [] },
        artifactBindings: { type: "array", items: BATCH_ARTIFACT_BINDING_SCHEMA, maxItems: 160, default: [] },
      }, ["batch"]),
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
      description: "Verify the exact HMF registry, style-proof execution, frame-atlas-v3 layout, named move/body choreography, supplemental overlays, provider execution envelopes and work-order governance without provider execution, approval, promotion, filesystem writes or repository mutation.",
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
  if (name === FRAME_ATLAS_V3_TOOL) return buildHmfFrameAtlasV3Layout(String(input.frameId ?? ""));
  if (name === FRAME_MOVE_CHOREOGRAPHY_TOOL) return buildHmfFrameMoveBodyChoreography(String(input.frameId ?? ""));
  if (name === BODY_CHOREOGRAPHY_OVERLAY_TOOL) return heavyMetalFightingBodyChoreographyOverlay(input.unitId);
  if (name === PROVIDER_EXECUTION_ENVELOPE_TOOL) return heavyMetalFightingProviderExecutionEnvelope(input.unitId, {
    receipts: input.receipts ?? [],
    artifactBindings: input.artifactBindings ?? [],
  });
  if (name === PROVIDER_EXECUTION_ENVELOPE_BATCH_TOOL) return buildHmfProviderExecutionEnvelopeBatch(normalizeBatch(input.batch), {
    receipts: input.receipts ?? [],
    artifactBindings: input.artifactBindings ?? [],
  });
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
    const [
      registry,
      styleProofExecution,
      frameAtlasV3,
      frameMoveChoreography,
      bodyChoreographyOverlays,
      providerExecutionEnvelopes,
      workOrders,
    ] = await Promise.all([
      verifyHmfProductionBatchRegistry(),
      verifyHmfStyleProofExecutionPlan(),
      verifyHmfFrameAtlasV3Delivery(),
      verifyHmfFrameMoveBodyChoreography(),
      verifyHmfBodyChoreographyOverlays(),
      verifyHmfProviderExecutionEnvelopes(),
      verifyHmfProductionWorkOrders(),
    ]);
    return Object.freeze({
      schema: "evavo.heavy-metal-fighting-production-agent-verification.v6",
      status: registry.status === "passed"
        && styleProofExecution.status === "passed"
        && frameAtlasV3.status === "passed"
        && frameMoveChoreography.status === "passed"
        && bodyChoreographyOverlays.status === "passed"
        && providerExecutionEnvelopes.status === "passed"
        && workOrders.status === "passed"
        ? "passed"
        : "failed",
      registry,
      styleProofExecution,
      frameAtlasV3,
      frameMoveChoreography,
      bodyChoreographyOverlays,
      providerExecutionEnvelopes,
      workOrders,
      authority: Object.freeze({
        providerExecution: false,
        referenceArtifactAdmission: false,
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
      instructions: "Read-only HEAVY METAL FIGHTING final-art production surface. It exposes the 1,573-image / 179-batch registry, four-phase style-proof controller, deterministic 224-cel atlas-v3 layout, exact 44-move body choreography, hash-bound choreography overlays, human-gated provider execution envelopes, immutable one-image work orders, receipt requirements, bounded repair templates and deterministic resume planning. A submit-ready envelope still requires a separate explicit write-enabled runtime call. This server does not generate images, execute providers, admit reference artifacts, persist receipts or approvals, mutate base work orders or receipt chains, change combat timing, approve art, promote masters, mutate the game repository, commit, push, deploy or publish.",
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
