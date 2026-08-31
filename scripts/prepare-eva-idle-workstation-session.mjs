#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { compileEvaCoreMotionProductionPlan } from "../tools/eva_core_motion_production_plan_v1.mjs";
import { compileEvaIdleProductionSession } from "../tools/eva_idle_production_session_v1.mjs";

const MAX_JSON_BYTES = 16 * 1024 * 1024;

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function parseArgs(argv) {
  const value = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!["--suite-plan", "--reviewed-sources", "--reference-bindings", "--source-review-bridge", "--output-dir", "--session-id", "--generated-at"].includes(flag)) {
      fail("EVA_IDLE_WORKSTATION_OPTION_UNKNOWN", flag);
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) fail("EVA_IDLE_WORKSTATION_OPTION_VALUE_REQUIRED", flag);
    value[flag.slice(2).replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase())] = next;
    index += 1;
  }
  for (const required of ["suitePlan", "outputDir"]) {
    if (!value[required]) fail("EVA_IDLE_WORKSTATION_OPTION_REQUIRED", required);
  }
  if (value.sourceReviewBridge && (value.reviewedSources || value.referenceBindings)) {
    fail("EVA_IDLE_WORKSTATION_BRIDGE_INPUT_EXCLUSIVE");
  }
  if (!value.sourceReviewBridge && (!value.reviewedSources || !value.referenceBindings)) {
    fail("EVA_IDLE_WORKSTATION_SOURCE_INPUT_REQUIRED");
  }
  return value;
}

function readOrdinaryJson(filePath, label) {
  const absolute = path.resolve(filePath);
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    fail("EVA_IDLE_WORKSTATION_INPUT_NOT_ORDINARY", label);
  }
  if (stat.size < 2 || stat.size > MAX_JSON_BYTES) {
    fail("EVA_IDLE_WORKSTATION_INPUT_SIZE_INVALID", label);
  }
  const source = fs.readFileSync(absolute, "utf8");
  if (source.includes("\0")) fail("EVA_IDLE_WORKSTATION_INPUT_INVALID", label);
  return JSON.parse(source);
}

function arrayPayload(value, field, label) {
  const result = Array.isArray(value) ? value : value?.[field];
  if (!Array.isArray(result)) fail("EVA_IDLE_WORKSTATION_ARRAY_INPUT_INVALID", label);
  return result;
}

function writeCreateOnly(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

function safeFileName(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/gu, "_").slice(0, 180);
}

function sourceInputs(options) {
  if (options.sourceReviewBridge) {
    const bridge = readOrdinaryJson(options.sourceReviewBridge, "source-review-bridge");
    if (
      bridge.schema !== "evavo.eva-idle-source-review-bridge.v1" ||
      bridge.characterId !== "eva-female" ||
      bridge.clipId !== "idle-primary" ||
      !Array.isArray(bridge.reviewedSources) ||
      !Array.isArray(bridge.referenceBindings) ||
      !bridge.supplementalReferencesByDrawing ||
      typeof bridge.supplementalReferencesByDrawing !== "object"
    ) {
      fail("EVA_IDLE_WORKSTATION_SOURCE_REVIEW_BRIDGE_INVALID");
    }
    return {
      reviewedSources: bridge.reviewedSources,
      referenceBindings: bridge.referenceBindings,
      supplementalReferencesByDrawing: bridge.supplementalReferencesByDrawing,
      sourceReviewBridge: bridge,
    };
  }
  return {
    reviewedSources: arrayPayload(
      readOrdinaryJson(options.reviewedSources, "reviewed-sources"),
      "reviewedSources",
      "reviewed-sources",
    ),
    referenceBindings: arrayPayload(
      readOrdinaryJson(options.referenceBindings, "reference-bindings"),
      "referenceBindings",
      "reference-bindings",
    ),
    supplementalReferencesByDrawing: {},
    sourceReviewBridge: null,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputDir = path.resolve(options.outputDir);
  if (fs.existsSync(outputDir)) {
    fail("EVA_IDLE_WORKSTATION_OUTPUT_EXISTS", outputDir);
  }
  fs.mkdirSync(outputDir, { recursive: false });

  try {
    const suitePlan = readOrdinaryJson(options.suitePlan, "suite-plan");
    const sources = sourceInputs(options);
    const generatedAt = options.generatedAt ?? new Date().toISOString();
    const corePlan = compileEvaCoreMotionProductionPlan(suitePlan, {
      generatedAt,
      profileState: "approved",
    });
    const idleProfileEntry = corePlan.byClip["idle-primary"];
    if (!idleProfileEntry) fail("EVA_IDLE_WORKSTATION_IDLE_PROFILE_MISSING");
    if (
      sources.sourceReviewBridge &&
      (sources.sourceReviewBridge.profileId !== idleProfileEntry.plan.profileId ||
        sources.sourceReviewBridge.profileDigest !== idleProfileEntry.plan.contentDigest)
    ) {
      fail("EVA_IDLE_WORKSTATION_SOURCE_REVIEW_PROFILE_MISMATCH");
    }
    const session = await compileEvaIdleProductionSession(
      {
        profileEntry: idleProfileEntry,
        reviewedSources: sources.reviewedSources,
        referenceBindings: sources.referenceBindings,
        supplementalReferencesByDrawing: sources.supplementalReferencesByDrawing,
        ...(options.sessionId ? { sessionId: options.sessionId } : {}),
      },
      new Date(generatedAt),
    );

    writeCreateOnly(path.join(outputDir, "core-motion-plan.json"), corePlan);
    writeCreateOnly(path.join(outputDir, "idle-profile.json"), idleProfileEntry.plan);
    writeCreateOnly(path.join(outputDir, "idle-ledger.json"), session.ledger);
    writeCreateOnly(path.join(outputDir, "idle-source-reconciliation.json"), session.reconciliation);
    writeCreateOnly(path.join(outputDir, "idle-first-batch.json"), session.firstBatch.batch);
    if (sources.sourceReviewBridge) {
      writeCreateOnly(path.join(outputDir, "idle-source-review-bridge.json"), sources.sourceReviewBridge);
    }

    const handoffDir = path.join(outputDir, "cel-handoffs");
    for (const work of session.firstBatch.workOrders ?? []) {
      if (work.route !== "unresolved" || !work.productionHandoff) continue;
      writeCreateOnly(
        path.join(handoffDir, `${safeFileName(work.drawingId)}.json`),
        work.productionHandoff,
      );
    }

    const summary = Object.freeze({
      schema: "evavo.eva-idle-workstation-session-summary.v2",
      characterId: "eva-female",
      clipId: "idle-primary",
      generatedAt,
      sessionId: session.sessionId,
      profileId: session.profileId,
      profileDigest: session.profileDigest,
      ledgerDigest: session.ledger.contentDigest,
      reconciliationDigest: session.reconciliation.contentDigest,
      sourceReviewBridgeUsed: Boolean(sources.sourceReviewBridge),
      sourceReviewBridgeDigest: sources.sourceReviewBridge?.contentDigest ?? null,
      firstBatchStatus: session.firstBatch.status,
      reusedWorkOrderCount: session.firstBatch.reusedWorkOrderCount,
      unresolvedWorkOrderCount: session.firstBatch.unresolvedWorkOrderCount,
      supplementalReferenceCount: session.firstBatch.supplementalReferenceCount ?? 0,
      productionHandoffCount: (session.firstBatch.workOrders ?? []).filter(
        (work) => work.route === "unresolved" && work.productionHandoff,
      ).length,
      nextAction: session.nextAction,
      executionPerformed: false,
      creativeApprovalGranted: false,
      runtimeActivationGranted: false,
      publicationGranted: false,
    });
    writeCreateOnly(path.join(outputDir, "summary.json"), summary);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } catch (error) {
    fs.rmSync(outputDir, { recursive: true, force: true });
    throw error;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
