#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import * as internal from "./animation_frame_work_ledger_v1_internal.mjs";

export const ANIMATION_FRAME_LEDGER_PROTOCOL_VERSION =
  internal.ANIMATION_FRAME_LEDGER_PROTOCOL_VERSION;
export const ANIMATION_FRAME_LEDGER_KIND = internal.ANIMATION_FRAME_LEDGER_KIND;
export const ANIMATION_FRAME_WORK_BATCH_KIND =
  internal.ANIMATION_FRAME_WORK_BATCH_KIND;
export const ANIMATION_FRAME_WORK_ORDER_KIND =
  internal.ANIMATION_FRAME_WORK_ORDER_KIND;
export const ANIMATION_FRAME_CANDIDATE_RECEIPT_KIND =
  internal.ANIMATION_FRAME_CANDIDATE_RECEIPT_KIND;
export const ANIMATION_FRAME_LEDGER_EVENT_KIND =
  internal.ANIMATION_FRAME_LEDGER_EVENT_KIND;
export const animationFrameLedgerSha256 = internal.animationFrameLedgerSha256;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const AUTHORITY = Object.freeze({
  providerExecution: false,
  automaticCreativeApproval: false,
  artifactPromotion: false,
  targetRepositoryMutation: false,
  gitCommit: false,
  gitPush: false,
  runtimeActivation: false,
  publication: false,
});

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function safeDerivedId(value, field) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    fail("ANIMATION_FRAME_LEDGER_DERIVED_ID_INVALID", field);
  }
}

function assertLedgerIds(ledger) {
  object(ledger, "ANIMATION_FRAME_LEDGER_INVALID");
  safeDerivedId(ledger.ledgerId, "ledger.ledgerId");
  safeDerivedId(ledger.sessionId, "ledger.sessionId");
  safeDerivedId(ledger.profileId, "ledger.profileId");
}

function assertWorkOrderIds(workOrder, path) {
  object(workOrder, "ANIMATION_FRAME_WORK_ORDER_INVALID");
  safeDerivedId(workOrder.workOrderId, `${path}.workOrderId`);
  safeDerivedId(workOrder.ledgerId, `${path}.ledgerId`);
  safeDerivedId(workOrder.profileId, `${path}.profileId`);
  safeDerivedId(workOrder.drawingId, `${path}.drawingId`);
  const eventualReceiptId = `${workOrder.workOrderId}:candidate`;
  safeDerivedId(eventualReceiptId, `${path}.eventualReceiptId`);
}

function assertBatchIds(batch) {
  object(batch, "ANIMATION_FRAME_WORK_BATCH_INVALID");
  safeDerivedId(batch.batchId, "batch.batchId");
  safeDerivedId(batch.ledgerId, "batch.ledgerId");
  safeDerivedId(batch.profileId, "batch.profileId");
  safeDerivedId(batch.generationBatchId, "batch.generationBatchId");
  if (!Array.isArray(batch.workOrders)) {
    fail("ANIMATION_FRAME_WORK_BATCH_ORDERS_INVALID");
  }
  batch.workOrders.forEach((order, index) =>
    assertWorkOrderIds(order, `batch.workOrders[${index}]`),
  );
}

function assertReceiptIds(receipt) {
  object(receipt, "ANIMATION_FRAME_CANDIDATE_RECEIPT_INVALID");
  safeDerivedId(receipt.receiptId, "receipt.receiptId");
  safeDerivedId(receipt.ledgerId, "receipt.ledgerId");
  safeDerivedId(receipt.drawingId, "receipt.drawingId");
}

function assertBatchInputIds(input) {
  if (input?.batch) assertBatchIds(input.batch);
  if (Array.isArray(input?.receipts)) {
    input.receipts.forEach(assertReceiptIds);
  }
}

export async function createAnimationFrameWorkLedger(input, now = new Date()) {
  const ledger = await internal.createAnimationFrameWorkLedger(input, now);
  assertLedgerIds(ledger);
  return ledger;
}

export async function assertAnimationFrameWorkLedgerIntegrity(profile, ledger) {
  assertLedgerIds(ledger);
  return internal.assertAnimationFrameWorkLedgerIntegrity(profile, ledger);
}

export async function compileNextAnimationFrameWorkBatch(
  input,
  now = new Date(),
) {
  assertLedgerIds(input?.ledger);
  const batch = await internal.compileNextAnimationFrameWorkBatch(input, now);
  if (batch?.status === "work-ready") assertBatchIds(batch);
  return batch;
}

export function compileAnimationFrameCandidateReceipt(input, now = new Date()) {
  assertWorkOrderIds(input?.workOrder, "workOrder");
  const receipt = internal.compileAnimationFrameCandidateReceipt(input, now);
  assertReceiptIds(receipt);
  return receipt;
}

export async function applyAnimationFrameCandidateBatch(input, now = new Date()) {
  assertLedgerIds(input?.ledger);
  assertBatchInputIds(input);
  const ledger = await internal.applyAnimationFrameCandidateBatch(input, now);
  assertLedgerIds(ledger);
  return ledger;
}

export async function reviewAnimationFrameWorkLedger(input, now = new Date()) {
  assertLedgerIds(input?.ledger);
  const result = await internal.reviewAnimationFrameWorkLedger(input, now);
  assertLedgerIds(result.ledger);
  return result;
}

export function summarizeAnimationFrameWorkLedger(ledger) {
  assertLedgerIds(ledger);
  return internal.summarizeAnimationFrameWorkLedger(ledger);
}

function safeWorkspacePath(input) {
  const root = process.cwd();
  const absolute = resolve(root, input);
  const rel = relative(root, absolute);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return absolute;
  fail("ANIMATION_FRAME_LEDGER_PATH_OUTSIDE_WORKSPACE", input);
}

async function emit(value, outputPath) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  if (!outputPath) process.stdout.write(body);
  else {
    await writeFile(safeWorkspacePath(outputPath), body, {
      encoding: "utf8",
      flag: "wx",
    });
  }
}

async function cli() {
  const [command, inputPath, outputPath] = process.argv.slice(2);
  if (
    !command ||
    !inputPath ||
    ![
      "create",
      "verify",
      "next-work",
      "candidate-receipt",
      "apply-candidates",
      "review",
      "summary",
    ].includes(command)
  ) {
    fail(
      "ANIMATION_FRAME_LEDGER_USAGE",
      "node tools/animation_frame_work_ledger_v1.mjs <create|verify|next-work|candidate-receipt|apply-candidates|review|summary> <input.json> [output.json]",
    );
  }
  const input = JSON.parse(
    await readFile(safeWorkspacePath(inputPath), "utf8"),
  );
  if (command === "create") {
    return emit(await createAnimationFrameWorkLedger(input), outputPath);
  }
  if (command === "verify") {
    await assertAnimationFrameWorkLedgerIntegrity(input.profile, input.ledger);
    return emit(
      {
        status: "verified",
        ledgerId: input.ledger.ledgerId,
        contentDigest: input.ledger.contentDigest,
        revision: input.ledger.revision,
        authority: AUTHORITY,
      },
      outputPath,
    );
  }
  if (command === "next-work") {
    return emit(await compileNextAnimationFrameWorkBatch(input), outputPath);
  }
  if (command === "candidate-receipt") {
    return emit(compileAnimationFrameCandidateReceipt(input), outputPath);
  }
  if (command === "apply-candidates") {
    return emit(await applyAnimationFrameCandidateBatch(input), outputPath);
  }
  if (command === "review") {
    return emit(await reviewAnimationFrameWorkLedger(input), outputPath);
  }
  return emit(summarizeAnimationFrameWorkLedger(input.ledger ?? input), outputPath);
}

if ((process.argv[1] ? pathToFileURL(process.argv[1]).href : "") === import.meta.url) {
  cli().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        authority: AUTHORITY,
      })}\n`,
    );
    process.exitCode = 1;
  });
}
