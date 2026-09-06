#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { IMAGE_REVIEW_PROFILE_NAMES, planExistingImageFinishing } from "../packages/media/dist/index.js";
import { writeCreateOnlyBundle } from "./lib/create_only_bundle.mjs";
import { assertAllowedLocalPath, configuredLocalRootCount } from "./lib/local_path_policy.mjs";

const SERVER_NAME = "evavo-existing-image-finishing-plan";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const ROOTS_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOWED_ROOTS";
const WRITES_ENV = "EVAVO_EXISTING_IMAGE_POLISH_ALLOW_WRITES";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const allowed = (filePath, output = false) => assertAllowedLocalPath(filePath, { envName: ROOTS_ENV, output, label: "existing image finishing plan" });
const writesEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env[WRITES_ENV] ?? "").toLowerCase());

async function bound(filePath, label) {
  const path = await allowed(filePath, false);
  const bytes = await readFile(path);
  if (!bytes.length) throw new Error(`${label} is empty.`);
  return { path, bytes, sha256: sha256(bytes), byteLength: bytes.length };
}

async function verifyBinding(binding, label) {
  if (!binding || typeof binding.path !== "string" || typeof binding.sha256 !== "string" || !Number.isInteger(binding.byteLength)) throw new Error(`${label} binding is malformed.`);
  const current = await bound(binding.path, label);
  if (current.sha256 !== binding.sha256 || current.byteLength !== binding.byteLength) throw new Error(`${label} bytes changed after defect detection.`);
  return current;
}

async function createPlan(args) {
  if (typeof args.defectReceiptPath !== "string" || typeof args.planReceiptPath !== "string") throw new Error("defectReceiptPath and planReceiptPath are required.");
  if (args.confirmLocalWrite !== true) throw new Error("confirmLocalWrite=true is required.");
  if (!writesEnabled()) throw new Error(`${WRITES_ENV}=true is required.`);

  const defectReceipt = await bound(args.defectReceiptPath, "defectReceiptPath");
  const value = JSON.parse(defectReceipt.bytes.toString("utf8"));
  if (value.schemaVersion !== "1.3" || value.operation !== "evavo-detect-existing-image-defects") throw new Error("Defect receipt must be v1.3 source-bound evidence.");
  if (value.approvalState !== "proposal-only" || value.sourceMutation !== false) throw new Error("Defect receipt carries invalid authority/state.");
  const [source, mask, overlay] = await Promise.all([
    verifyBinding(value.sourceBinding, "source"),
    verifyBinding(value.maskBinding, "mask"),
    verifyBinding(value.overlayBinding, "overlay"),
  ]);
  const profile = args.profile ?? value.profile;
  if (!IMAGE_REVIEW_PROFILE_NAMES.includes(profile)) throw new Error("A valid profile is required when creating a finishing plan.");
  if (value.profile && args.profile && value.profile !== args.profile) throw new Error("Requested profile does not match the defect-review profile.");

  const plan = planExistingImageFinishing(value.evidence, value.regions, {
    profile,
    ...(Number.isInteger(args.maximumAutomaticRegionCount) ? { maximumAutomaticRegionCount: args.maximumAutomaticRegionCount } : {}),
    ...(typeof args.maximumAutomaticCoverageRatio === "number" ? { maximumAutomaticCoverageRatio: args.maximumAutomaticCoverageRatio } : {}),
    ...(Number.isInteger(args.regionPadding) ? { regionPadding: args.regionPadding } : {}),
  });

  const planReceiptPath = await allowed(args.planReceiptPath, true);
  const receipt = Object.freeze({
    contract: "evavo.existing-image-finishing-plan-receipt.v1",
    defectReceiptPath: defectReceipt.path,
    defectReceiptSha256: defectReceipt.sha256,
    sourceBinding: value.sourceBinding,
    maskBinding: value.maskBinding,
    overlayBinding: value.overlayBinding,
    bindingsReverified: true,
    plan,
    approvalState: "proposal-only",
    sourceMutationAllowed: false,
    automaticRepairAllowed: false,
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
    nextRequiredAction: plan.route === "no-op"
      ? "No finishing operation is proposed; continue to mandatory visual review."
      : plan.route === "manual-review"
        ? "Inspect the defect overlay/regions manually and do not run an automatic repair."
        : "Visually confirm the proposed regions/route before calling the next tool, then run post-repair review against the immutable source.",
  });
  const payload = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeCreateOnlyBundle([{ path: planReceiptPath, data: payload, encoding: "utf8" }]);
  return Object.freeze({
    ok: true,
    planReceiptPath,
    planReceiptSha256: sha256(Buffer.from(payload, "utf8")),
    sourceBinding: { path: source.path, sha256: source.sha256, byteLength: source.byteLength },
    maskBinding: { path: mask.path, sha256: mask.sha256, byteLength: mask.byteLength },
    overlayBinding: { path: overlay.path, sha256: overlay.sha256, byteLength: overlay.byteLength },
    plan,
    approvalState: "proposal-only",
    publicationAllowed: false,
  });
}

async function verifyPlan(args) {
  if (typeof args.planReceiptPath !== "string") throw new Error("planReceiptPath is required.");
  const receipt = await bound(args.planReceiptPath, "planReceiptPath");
  const value = JSON.parse(receipt.bytes.toString("utf8"));
  if (value.contract !== "evavo.existing-image-finishing-plan-receipt.v1") throw new Error("Unsupported finishing-plan receipt contract.");
  if (value.approvalState !== "proposal-only" || value.sourceMutationAllowed !== false || value.automaticRepairAllowed !== false || value.publicationAllowed !== false) throw new Error("Finishing-plan receipt carries forbidden authority.");
  const defectReceipt = await bound(value.defectReceiptPath, "defect receipt");
  if (defectReceipt.sha256 !== value.defectReceiptSha256) throw new Error("Underlying defect receipt changed after finishing planning.");
  await Promise.all([
    verifyBinding(value.sourceBinding, "source"),
    verifyBinding(value.maskBinding, "mask"),
    verifyBinding(value.overlayBinding, "overlay"),
  ]);
  return Object.freeze({ ok: true, planReceiptPath: receipt.path, planReceiptSha256: receipt.sha256, bindingsReverified: true, route: value.plan?.route, automaticRepairAllowed: false, publicationAllowed: false });
}

const tools = Object.freeze([
  Object.freeze({ name: "evavo_existing_image_finishing_plan_capabilities", description: "Describe source-bound preservation-first finishing planning from defect evidence.", inputSchema: { type: "object", properties: {}, additionalProperties: false } }),
  Object.freeze({
    name: "evavo_plan_existing_image_finishing",
    description: "Reverify a v1.3 defect receipt and exact source/mask/overlay bytes, then create a review-only minimal finishing plan: no-op, preservation polish, bounded localized repair, or manual review.",
    inputSchema: {
      type: "object",
      properties: {
        defectReceiptPath: { type: "string", minLength: 1 }, planReceiptPath: { type: "string", minLength: 1 }, profile: { type: "string", enum: [...IMAGE_REVIEW_PROFILE_NAMES] }, maximumAutomaticRegionCount: { type: "integer", minimum: 1, maximum: 64 }, maximumAutomaticCoverageRatio: { type: "number", exclusiveMinimum: 0, maximum: 1 }, regionPadding: { type: "integer", minimum: 0, maximum: 64 }, confirmLocalWrite: { type: "boolean", const: true },
      },
      required: ["defectReceiptPath", "planReceiptPath", "confirmLocalWrite"], additionalProperties: false,
    },
  }),
  Object.freeze({ name: "evavo_verify_existing_image_finishing_plan", description: "Reverify the plan receipt, its defect receipt, and exact source/mask/overlay byte bindings before downstream finishing.", inputSchema: { type: "object", properties: { planReceiptPath: { type: "string", minLength: 1 } }, required: ["planReceiptPath"], additionalProperties: false } }),
]);

function capabilities() {
  return Object.freeze({
    contract: "evavo.existing-image-finishing-plan-receipt.v1",
    serverVersion: SERVER_VERSION,
    routes: ["no-op", "preservation-polish", "localized-repair", "manual-review"],
    exactSourceMaskOverlayBindingRequired: true,
    staleDefectEvidenceRejected: true,
    smallestPreservationFirstOperationPreferred: true,
    visualConfirmationRequiredBeforeRepair: true,
    automaticRepairAllowed: false,
    sourceMutationAllowed: false,
    publicationAllowed: false,
    allowedRootCount: configuredLocalRootCount(ROOTS_ENV),
    writesEnabled: writesEnabled(),
  });
}
async function callTool(name, args) {
  if (name === "evavo_existing_image_finishing_plan_capabilities") return capabilities();
  if (name === "evavo_plan_existing_image_finishing") return createPlan(args ?? {});
  if (name === "evavo_verify_existing_image_finishing_plan") return verifyPlan(args ?? {});
  throw new Error(`Unknown tool ${JSON.stringify(name)}.`);
}
const response = (id, result) => ({ jsonrpc: "2.0", id, result });
const toolResult = (payload, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError });
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try {
    const message = JSON.parse(line);
    let outgoing;
    if (message.method === "initialize") outgoing = response(message.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
    else if (message.method === "notifications/initialized") outgoing = null;
    else if (message.method === "tools/list") outgoing = response(message.id, { tools });
    else if (message.method === "tools/call") { try { outgoing = response(message.id, toolResult(await callTool(message.params?.name, message.params?.arguments ?? {}))); } catch (error) { outgoing = response(message.id, toolResult({ ok: false, message: error instanceof Error ? error.message : String(error) }, true)); } }
    else outgoing = response(message.id, toolResult({ ok: false, message: `Unsupported method ${JSON.stringify(message.method)}.` }, true));
    if (outgoing) process.stdout.write(`${JSON.stringify(outgoing)}\n`);
  } catch (error) { process.stdout.write(`${JSON.stringify(response(null, toolResult({ ok: false, message: String(error) }, true)))}\n`); }
}
