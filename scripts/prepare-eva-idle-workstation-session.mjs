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
    if (!["--suite-plan", "--reviewed-sources", "--reference-bindings", "--output-dir", "--session-id", "--generated-at"].includes(flag)) {
      fail("EVA_IDLE_WORKSTATION_OPTION_UNKNOWN", flag);
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) fail("EVA_IDLE_WORKSTATION_OPTION_VALUE_REQUIRED", flag);
    value[flag.slice(2).replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase())] = next;
    index += 1;
  }
  for (const required of ["suitePlan", "reviewedSources", "referenceBindings", "outputDir"]) {
    if (!value[required]) fail("EVA_IDLE_WORKSTATION_OPTION_REQUIRED", required);
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
  const value = JSON.parse(source);
  return value;
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputDir = path.resolve(options.outputDir);
  if (fs.existsSync(outputDir)) {
    fail("EVA_IDLE_WORKSTATION_OUTPUT_EXISTS", outputDir);
  }
  fs.mkdirSync(outputDir, { recursive: false });

  try {
    const suitePlan = readOrdinaryJson(options.suitePlan, "suite-plan");
    const reviewedSources = arrayPayload(
      readOrdinaryJson(options.reviewedSources, "reviewed-sources"),
      "reviewedSources",
      "reviewed-sources",
    );
    const referenceBindings = arrayPayload(
      readOrdinaryJson(options.referenceBindings, "reference-bindings"),
      "referenceBindings",
      "reference-bindings",
    );
    const generatedAt = options.generatedAt ?? new Date().toISOString();
    const corePlan = compileEvaCoreMotionProductionPlan(suitePlan, {
      generatedAt,
      profileState: "approved",
    });
    const idleProfileEntry = corePlan.byClip["idle-primary"];
    if (!idleProfileEntry) fail("EVA_IDLE_WORKSTATION_IDLE_PROFILE_MISSING");
    const session = await compileEvaIdleProductionSession(
      {
        profileEntry: idleProfileEntry,
        reviewedSources,
        referenceBindings,
        ...(options.sessionId ? { sessionId: options.sessionId } : {}),
      },
      new Date(generatedAt),
    );

    writeCreateOnly(path.join(outputDir, "core-motion-plan.json"), corePlan);
    writeCreateOnly(path.join(outputDir, "idle-profile.json"), idleProfileEntry.plan);
    writeCreateOnly(path.join(outputDir, "idle-ledger.json"), session.ledger);
    writeCreateOnly(path.join(outputDir, "idle-source-reconciliation.json"), session.reconciliation);
    writeCreateOnly(path.join(outputDir, "idle-first-batch.json"), session.firstBatch.batch);

    const handoffDir = path.join(outputDir, "cel-handoffs");
    for (const work of session.firstBatch.workOrders ?? []) {
      if (work.route !== "unresolved" || !work.celHandoff) continue;
      writeCreateOnly(
        path.join(handoffDir, `${safeFileName(work.drawingId)}.json`),
        work.celHandoff,
      );
    }

    const summary = Object.freeze({
      schema: "evavo.eva-idle-workstation-session-summary.v1",
      characterId: "eva-female",
      clipId: "idle-primary",
      generatedAt,
      sessionId: session.sessionId,
      profileId: session.profileId,
      profileDigest: session.profileDigest,
      ledgerDigest: session.ledger.contentDigest,
      reconciliationDigest: session.reconciliation.contentDigest,
      firstBatchStatus: session.firstBatch.status,
      reusedWorkOrderCount: session.firstBatch.reusedWorkOrderCount,
      unresolvedWorkOrderCount: session.firstBatch.unresolvedWorkOrderCount,
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
