#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import * as base from "./animation_production_review_receipt_v1.mjs";
import { assertPathFreeAnimationValue } from "./animation_sequence_delivery_guard_v1.mjs";

export const REVIEW_RECEIPT_PROTOCOL_VERSION = base.REVIEW_RECEIPT_PROTOCOL_VERSION;
export const REVIEW_RECEIPT_KIND = base.REVIEW_RECEIPT_KIND;
export const REVIEWER_ROLES = base.REVIEWER_ROLES;
export const animationReviewReceiptSha256 = base.animationReviewReceiptSha256;

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

export function assertAnimationProductionReviewReceiptSelfIntegrity(receipt) {
  assertPathFreeAnimationValue(receipt);
  return base.assertAnimationProductionReviewReceiptSelfIntegrity(receipt);
}

export async function compileAnimationProductionReviewReceipt(input, now = new Date()) {
  assertPathFreeAnimationValue(input);
  const receipt = await base.compileAnimationProductionReviewReceipt(input, now);
  assertAnimationProductionReviewReceiptSelfIntegrity(receipt);
  return receipt;
}

export async function assertAnimationProductionReviewReceiptAgainstInput(input, receipt) {
  assertPathFreeAnimationValue(input);
  assertAnimationProductionReviewReceiptSelfIntegrity(receipt);
  return base.assertAnimationProductionReviewReceiptAgainstInput(input, receipt);
}

function safeWorkspacePath(input) {
  const root = process.cwd();
  const absolute = resolve(root, input);
  const rel = relative(root, absolute);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return absolute;
  fail("ANIMATION_REVIEW_RECEIPT_PATH_OUTSIDE_WORKSPACE", input);
}

async function emit(value, outputPath) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  if (!outputPath) process.stdout.write(body);
  else await writeFile(safeWorkspacePath(outputPath), body, { encoding: "utf8", flag: "wx" });
}

async function cli() {
  const [command, inputPath, outputPath] = process.argv.slice(2);
  if (!command || !inputPath || !["compile", "verify", "verify-input"].includes(command)) {
    fail("ANIMATION_REVIEW_RECEIPT_USAGE", "node tools/animation_production_review_receipt_canonical_v1.mjs <compile|verify|verify-input> <input.json> [output.json]");
  }
  const input = JSON.parse(await readFile(safeWorkspacePath(inputPath), "utf8"));
  if (command === "compile") return emit(await compileAnimationProductionReviewReceipt(input), outputPath);
  if (command === "verify") {
    assertAnimationProductionReviewReceiptSelfIntegrity(input);
    return emit({ status: "verified", receiptDigest: input.receiptDigest, reviewerRole: input.reviewerRole, reviewStatus: input.decision.status }, outputPath);
  }
  await assertAnimationProductionReviewReceiptAgainstInput(input.input, input.receipt);
  return emit({ status: "verified", receiptDigest: input.receipt.receiptDigest, reviewInputDigest: input.receipt.reviewInputDigest }, outputPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  cli().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "error", message: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  });
}
