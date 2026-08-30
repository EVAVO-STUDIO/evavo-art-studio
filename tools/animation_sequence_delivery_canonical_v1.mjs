#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import * as base from "./animation_sequence_delivery_v1.mjs";
import {
  assertAnimationSequenceDeliverySemantics,
  assertPathFreeAnimationValue,
  assertVideoStudioAnimationIntakeSemantics,
} from "./animation_sequence_delivery_guard_v1.mjs";

export const DELIVERY_PROTOCOL_VERSION = base.DELIVERY_PROTOCOL_VERSION;
export const DELIVERY_KIND = base.DELIVERY_KIND;
export const CREATIVE_APPROVAL_KIND = base.CREATIVE_APPROVAL_KIND;
export const VIDEO_INTAKE_KIND = base.VIDEO_INTAKE_KIND;
export const PROFILE_PROTOCOL_VERSION = base.PROFILE_PROTOCOL_VERSION;
export const PROFILE_PLAN_KIND = base.PROFILE_PLAN_KIND;
export const PROFILE_REVIEW_KIND = base.PROFILE_REVIEW_KIND;
export const animationSequenceSha256 = base.animationSequenceSha256;

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

export function assertAnimationProductionProfileForDelivery(profile) {
  assertPathFreeAnimationValue(profile);
  return base.assertAnimationProductionProfileForDelivery(profile);
}

export function assertAcceptedAnimationReview(profile, decision) {
  assertPathFreeAnimationValue(profile);
  assertPathFreeAnimationValue(decision);
  return base.assertAcceptedAnimationReview(profile, decision);
}

export function assertAnimationSequenceCreativeApproval(profile, decision, artifacts, approval) {
  assertPathFreeAnimationValue(profile);
  assertPathFreeAnimationValue(decision);
  assertPathFreeAnimationValue(artifacts);
  assertPathFreeAnimationValue(approval);
  return base.assertAnimationSequenceCreativeApproval(profile, decision, artifacts, approval);
}

export function compileAnimationSequenceDelivery(input, now = new Date()) {
  assertPathFreeAnimationValue(input);
  const delivery = base.compileAnimationSequenceDelivery(input, now);
  base.assertAnimationSequenceDeliveryIntegrity(delivery);
  assertAnimationSequenceDeliverySemantics(delivery);
  return delivery;
}

export function assertAnimationSequenceDeliveryIntegrity(delivery) {
  assertPathFreeAnimationValue(delivery);
  base.assertAnimationSequenceDeliveryIntegrity(delivery);
  assertAnimationSequenceDeliverySemantics(delivery);
}

export function compileVideoStudioAnimationIntake(delivery, now = new Date()) {
  assertAnimationSequenceDeliveryIntegrity(delivery);
  const intake = base.compileVideoStudioAnimationIntake(delivery, now);
  base.assertVideoStudioAnimationIntakeIntegrity(intake);
  assertVideoStudioAnimationIntakeSemantics(intake);
  return intake;
}

export function assertVideoStudioAnimationIntakeIntegrity(intake) {
  assertPathFreeAnimationValue(intake);
  base.assertVideoStudioAnimationIntakeIntegrity(intake);
  assertVideoStudioAnimationIntakeSemantics(intake);
}

function safeWorkspacePath(input) {
  const root = process.cwd();
  const absolute = resolve(root, input);
  const rel = relative(root, absolute);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return absolute;
  fail("ANIMATION_DELIVERY_PATH_OUTSIDE_WORKSPACE", input);
}

async function emit(value, outputPath) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  if (!outputPath) process.stdout.write(body);
  else await writeFile(safeWorkspacePath(outputPath), body, { encoding: "utf8", flag: "wx" });
}

async function cli() {
  const [command, inputPath, outputPath] = process.argv.slice(2);
  if (!command || !inputPath || !["compile", "verify", "video", "verify-video"].includes(command)) {
    fail("ANIMATION_DELIVERY_USAGE", "node tools/animation_sequence_delivery_canonical_v1.mjs <compile|verify|video|verify-video> <input.json> [output.json]");
  }
  const input = JSON.parse(await readFile(safeWorkspacePath(inputPath), "utf8"));
  if (command === "compile") return emit(compileAnimationSequenceDelivery(input), outputPath);
  if (command === "verify") {
    assertAnimationSequenceDeliveryIntegrity(input);
    return emit({ status: "verified", contentDigest: input.contentDigest, totalDurationSeconds: input.timing.totalDurationSeconds }, outputPath);
  }
  if (command === "video") return emit(compileVideoStudioAnimationIntake(input), outputPath);
  assertVideoStudioAnimationIntakeIntegrity(input);
  return emit({ status: "verified", contentDigest: input.contentDigest, sourceDeliveryDigest: input.sourceDeliveryDigest }, outputPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  cli().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "error", message: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  });
}
