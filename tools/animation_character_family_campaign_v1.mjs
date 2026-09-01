#!/usr/bin/env node

import { createHash } from "node:crypto";
import process from "node:process";

import {
  assertAnimationCharacterFamilyClipEvidenceIntegrity,
  assertAnimationCharacterFamilyPlanIntegrity,
  assertAnimationCharacterFamilyReviewReceiptIntegrity,
  compileAnimationCharacterFamilyReviewInput,
  compileAnimationCharacterFamilyRuntimePlan,
  compileAnimationCharacterFamilyStatus,
} from "./animation_character_family_v1.mjs";

export const ANIMATION_CHARACTER_FAMILY_CAMPAIGN_PROTOCOL_VERSION = "2026-09-01.1";
export const ANIMATION_CHARACTER_FAMILY_CAMPAIGN_REQUEST_SCHEMA =
  "evavo.animation-character-family-campaign.request.v1";
export const ANIMATION_CHARACTER_FAMILY_CAMPAIGN_STATE_SCHEMA =
  "evavo.animation-character-family-campaign.state.v1";
export const ANIMATION_CHARACTER_FAMILY_CAMPAIGN_TASK_SCHEMA =
  "evavo.animation-character-family-campaign.task.v1";
export const ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_PLAN_SCHEMA =
  "evavo.animation-character-family-campaign.cycle-plan.v1";
export const ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPT_SCHEMA =
  "evavo.animation-character-family-campaign.task-receipt.v1";
export const ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_SCHEMA =
  "evavo.animation-character-family-campaign.cycle.v1";

export const ANIMATION_CHARACTER_FAMILY_CAMPAIGN_TASK_KINDS = Object.freeze([
  "produce-clip",
  "repair-clip",
  "repair-transition",
  "repair-family",
  "review-family",
]);

const TASK_OWNER = Object.freeze({
  "produce-clip": "art-studio",
  "repair-clip": "art-studio",
  "repair-transition": "art-studio",
  "repair-family": "art-studio",
  "review-family": "cel-animation-studio",
});
const RECEIPT_STATUSES = new Set(["completed", "unavailable", "failed", "blocked"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const CREDENTIAL_KEY =
  /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|authorization|cookie|private[_-]?key)/iu;
const CREDENTIAL_VALUE =
  /(?:bearer\s+[A-Za-z0-9._~+\/-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/iu;

export const animationCharacterFamilyCampaignAuthority = Object.freeze({
  providerExecution: false,
  localExecution: false,
  automaticCreativeApproval: false,
  creativeApproval: false,
  artifactPromotion: false,
  targetRepositoryMutation: false,
  gitCommit: false,
  gitPush: false,
  runtimeActivation: false,
  publication: false,
  deployment: false,
});

function fail(code, detail = "") {
  throw new Error(detail ? `${code}:${detail}` : code);
}
function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}
function array(value, code) {
  if (!Array.isArray(value)) fail(code);
  return value;
}
function safeId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code, String(value));
  return value;
}
function digest(value, code) {
  if (typeof value !== "string" || !DIGEST.test(value)) fail(code, String(value));
  return value;
}
function integer(value, minimum, maximum, code) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code);
  return value;
}
function timestamp(value, code) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) fail(code);
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}
export function animationCharacterFamilyCampaignSha256(value) {
  const bytes = Buffer.isBuffer(value)
    ? value
    : typeof value === "string"
      ? Buffer.from(value, "utf8")
      : Buffer.from(JSON.stringify(canonical(value)), "utf8");
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function body(value, digestKey) {
  const clone = structuredClone(value);
  delete clone[digestKey];
  return clone;
}
function scanCredentials(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((child, index) => scanCredentials(child, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (CREDENTIAL_KEY.test(key)) {
        fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CREDENTIAL_KEY_FORBIDDEN", `${path}.${key}`);
      }
      scanCredentials(child, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === "string" && CREDENTIAL_VALUE.test(value)) {
    fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CREDENTIAL_VALUE_FORBIDDEN", path);
  }
}
function assertAuthority(value, code) {
  const authority = object(value, code);
  const expected = Object.keys(animationCharacterFamilyCampaignAuthority).sort();
  if (JSON.stringify(Object.keys(authority).sort()) !== JSON.stringify(expected)) fail(code);
  if (Object.values(authority).some((entry) => entry !== false)) fail(code);
  return animationCharacterFamilyCampaignAuthority;
}
function familyStatus(input) {
  return compileAnimationCharacterFamilyStatus({
    plan: input.familyPlan,
    clips: input.clips,
    ...(input.reviewReceipt ? { reviewReceipt: input.reviewReceipt } : {}),
  });
}
function normalizedClips(values) {
  const clips = array(values, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CLIPS_INVALID").map((clip) => {
    assertAnimationCharacterFamilyClipEvidenceIntegrity(clip);
    return structuredClone(clip);
  });
  const bySlot = new Map();
  for (const clip of clips) {
    if (typeof clip.slotId !== "string" || !clip.slotId) {
      fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CLIP_SLOT_INVALID");
    }
    if (bySlot.has(clip.slotId)) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CLIP_SLOT_DUPLICATE", clip.slotId);
    bySlot.set(clip.slotId, clip);
  }
  return [...bySlot.values()].sort((left, right) => left.slotId.localeCompare(right.slotId));
}
function normalizeBudgets(value = {}) {
  const budgets = object(value, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_BUDGETS_INVALID");
  return Object.freeze({
    maximumCycles: integer(budgets.maximumCycles ?? 64, 1, 1000, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_MAXIMUM_CYCLES_INVALID"),
    maximumTasksPerCycle: integer(budgets.maximumTasksPerCycle ?? 8, 1, 128, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_MAXIMUM_TASKS_INVALID"),
    maximumAttemptsPerScope: integer(budgets.maximumAttemptsPerScope ?? 3, 1, 32, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_MAXIMUM_ATTEMPTS_INVALID"),
    maximumConsecutiveNoProgressCycles: integer(
      budgets.maximumConsecutiveNoProgressCycles ?? 3,
      1,
      32,
      "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_MAXIMUM_NO_PROGRESS_INVALID",
    ),
  });
}
function workScope(work) {
  const source = object(work, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_WORK_INVALID");
  if (!ANIMATION_CHARACTER_FAMILY_CAMPAIGN_TASK_KINDS.includes(source.kind)) {
    fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_TASK_KIND_INVALID", String(source.kind));
  }
  return Object.freeze(canonical(structuredClone(source)));
}
function scopeIdentity(work) {
  return animationCharacterFamilyCampaignSha256(workScope(work));
}
function taskAttempt(state, scopeDigest) {
  return (state.attemptsByScope[scopeDigest] ?? 0) + 1;
}

export function compileAnimationCharacterFamilyCampaignRequest(input) {
  scanCredentials(input);
  const source = object(input, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_REQUEST_INPUT_INVALID");
  const familyPlan = assertAnimationCharacterFamilyPlanIntegrity(source.familyPlan);
  const clips = normalizedClips(source.clips ?? []);
  if (clips.some((clip) => clip.planDigest !== familyPlan.planDigest)) {
    fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CLIP_PLAN_MISMATCH");
  }
  let reviewReceipt = null;
  if (source.reviewReceipt) {
    const reviewInput = compileAnimationCharacterFamilyReviewInput({ plan: familyPlan, clips });
    assertAnimationCharacterFamilyReviewReceiptIntegrity(source.reviewReceipt, reviewInput);
    reviewReceipt = structuredClone(source.reviewReceipt);
  }
  const budgets = normalizeBudgets(source.budgets ?? {});
  const campaignId = safeId(source.campaignId, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_ID_INVALID");
  const revision = integer(source.revision ?? 1, 1, 1000000, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_REVISION_INVALID");
  const initialFamilyStatus = compileAnimationCharacterFamilyStatus({
    plan: familyPlan,
    clips,
    ...(reviewReceipt ? { reviewReceipt } : {}),
  });
  const value = {
    schema: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_REQUEST_SCHEMA,
    protocolVersion: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_PROTOCOL_VERSION,
    campaignId,
    revision,
    familyPlan: structuredClone(familyPlan),
    familyPlanDigest: familyPlan.planDigest,
    clips,
    reviewReceipt,
    budgets,
    initialFamilyStatusDigest: initialFamilyStatus.statusDigest,
    authority: animationCharacterFamilyCampaignAuthority,
  };
  return Object.freeze({ ...value, requestDigest: animationCharacterFamilyCampaignSha256(value) });
}

export function assertAnimationCharacterFamilyCampaignRequestIntegrity(value) {
  scanCredentials(value);
  const request = object(value, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_REQUEST_INVALID");
  if (
    request.schema !== ANIMATION_CHARACTER_FAMILY_CAMPAIGN_REQUEST_SCHEMA ||
    request.protocolVersion !== ANIMATION_CHARACTER_FAMILY_CAMPAIGN_PROTOCOL_VERSION
  ) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_REQUEST_SCHEMA_INVALID");
  safeId(request.campaignId, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_ID_INVALID");
  integer(request.revision, 1, 1000000, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_REVISION_INVALID");
  digest(request.requestDigest, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_REQUEST_DIGEST_INVALID");
  assertAuthority(request.authority, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_REQUEST_AUTHORITY_INVALID");
  const familyPlan = assertAnimationCharacterFamilyPlanIntegrity(request.familyPlan);
  if (request.familyPlanDigest !== familyPlan.planDigest) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_FAMILY_PLAN_MISMATCH");
  const clips = normalizedClips(request.clips);
  if (clips.some((clip) => clip.planDigest !== familyPlan.planDigest)) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CLIP_PLAN_MISMATCH");
  if (request.reviewReceipt) {
    const reviewInput = compileAnimationCharacterFamilyReviewInput({ plan: familyPlan, clips });
    assertAnimationCharacterFamilyReviewReceiptIntegrity(request.reviewReceipt, reviewInput);
  }
  normalizeBudgets(request.budgets);
  const status = familyStatus(request);
  if (status.statusDigest !== request.initialFamilyStatusDigest) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_INITIAL_STATUS_MISMATCH");
  if (animationCharacterFamilyCampaignSha256(body(request, "requestDigest")) !== request.requestDigest) {
    fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_REQUEST_DIGEST_MISMATCH");
  }
  return request;
}

export function initializeAnimationCharacterFamilyCampaignState(input) {
  const source = object(input, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_STATE_INPUT_INVALID");
  const request = assertAnimationCharacterFamilyCampaignRequestIntegrity(source.request ?? source);
  const family = familyStatus(request);
  const createdAt = timestamp(source.createdAt ?? new Date().toISOString(), "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CREATED_AT_INVALID");
  const status = family.status === "delivery-ready" ? "delivery-ready" : family.status === "blocked" ? "blocked" : "work-ready";
  const value = {
    schema: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_STATE_SCHEMA,
    protocolVersion: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_PROTOCOL_VERSION,
    campaignId: request.campaignId,
    requestDigest: request.requestDigest,
    familyPlanDigest: request.familyPlanDigest,
    status,
    cycleCount: 0,
    consecutiveNoProgressCycles: 0,
    clips: structuredClone(request.clips),
    reviewReceipt: request.reviewReceipt ? structuredClone(request.reviewReceipt) : null,
    familyStatus: family,
    attemptsByScope: {},
    blocker: status === "blocked" ? { code: "FAMILY_STATUS_BLOCKED" } : null,
    createdAt,
    updatedAt: createdAt,
    authority: animationCharacterFamilyCampaignAuthority,
  };
  return Object.freeze({ ...value, stateDigest: animationCharacterFamilyCampaignSha256(value) });
}

export function assertAnimationCharacterFamilyCampaignStateIntegrity(value, requestValue) {
  scanCredentials(value);
  const state = object(value, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_STATE_INVALID");
  const request = assertAnimationCharacterFamilyCampaignRequestIntegrity(requestValue);
  if (
    state.schema !== ANIMATION_CHARACTER_FAMILY_CAMPAIGN_STATE_SCHEMA ||
    state.protocolVersion !== ANIMATION_CHARACTER_FAMILY_CAMPAIGN_PROTOCOL_VERSION ||
    state.campaignId !== request.campaignId ||
    state.requestDigest !== request.requestDigest ||
    state.familyPlanDigest !== request.familyPlanDigest
  ) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_STATE_LINEAGE_INVALID");
  if (!["work-ready", "review-ready", "delivery-ready", "blocked"].includes(state.status)) {
    fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_STATE_STATUS_INVALID");
  }
  integer(state.cycleCount, 0, request.budgets.maximumCycles, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_STATE_CYCLES_INVALID");
  integer(
    state.consecutiveNoProgressCycles,
    0,
    request.budgets.maximumConsecutiveNoProgressCycles,
    "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_STATE_NO_PROGRESS_INVALID",
  );
  const clips = normalizedClips(state.clips);
  if (clips.some((clip) => clip.planDigest !== request.familyPlanDigest)) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_STATE_CLIP_PLAN_MISMATCH");
  const attempts = object(state.attemptsByScope, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_STATE_ATTEMPTS_INVALID");
  for (const [key, count] of Object.entries(attempts)) {
    digest(key, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_STATE_SCOPE_DIGEST_INVALID");
    integer(count, 0, request.budgets.maximumAttemptsPerScope, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_STATE_ATTEMPT_INVALID");
  }
  const family = compileAnimationCharacterFamilyStatus({
    plan: request.familyPlan,
    clips,
    ...(state.reviewReceipt ? { reviewReceipt: state.reviewReceipt } : {}),
  });
  if (family.statusDigest !== state.familyStatus?.statusDigest) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_STATE_FAMILY_STATUS_DRIFT");
  if (state.status === "delivery-ready" && family.status !== "delivery-ready") fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_STATE_FALSE_READY");
  timestamp(state.createdAt, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CREATED_AT_INVALID");
  timestamp(state.updatedAt, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_UPDATED_AT_INVALID");
  assertAuthority(state.authority, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_STATE_AUTHORITY_INVALID");
  digest(state.stateDigest, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_STATE_DIGEST_INVALID");
  if (animationCharacterFamilyCampaignSha256(body(state, "stateDigest")) !== state.stateDigest) {
    fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_STATE_DIGEST_MISMATCH");
  }
  return state;
}

function compileTask(request, state, work, cycleNumber) {
  const scope = workScope(work);
  const scopeDigest = scopeIdentity(scope);
  const attempt = taskAttempt(state, scopeDigest);
  if (attempt > request.budgets.maximumAttemptsPerScope) return null;
  const kind = scope.kind;
  const seed = { campaignId: request.campaignId, requestDigest: request.requestDigest, cycleNumber, kind, scopeDigest, attempt };
  const taskId = `task:${animationCharacterFamilyCampaignSha256(seed).slice(7, 39)}`;
  const value = {
    schema: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_TASK_SCHEMA,
    protocolVersion: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_PROTOCOL_VERSION,
    taskId,
    campaignId: request.campaignId,
    requestDigest: request.requestDigest,
    familyPlanDigest: request.familyPlanDigest,
    cycleNumber,
    kind,
    ownerRole: TASK_OWNER[kind],
    scope,
    scopeDigest,
    attempt,
    expectedResult: kind === "review-family" ? "family-review-receipt" : "family-clip-evidence",
    authority: animationCharacterFamilyCampaignAuthority,
  };
  return Object.freeze({ ...value, taskDigest: animationCharacterFamilyCampaignSha256(value) });
}

export function assertAnimationCharacterFamilyCampaignTaskIntegrity(value, requestValue) {
  const task = object(value, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_TASK_INVALID");
  const request = assertAnimationCharacterFamilyCampaignRequestIntegrity(requestValue);
  if (
    task.schema !== ANIMATION_CHARACTER_FAMILY_CAMPAIGN_TASK_SCHEMA ||
    task.protocolVersion !== ANIMATION_CHARACTER_FAMILY_CAMPAIGN_PROTOCOL_VERSION ||
    task.campaignId !== request.campaignId ||
    task.requestDigest !== request.requestDigest ||
    task.familyPlanDigest !== request.familyPlanDigest ||
    !ANIMATION_CHARACTER_FAMILY_CAMPAIGN_TASK_KINDS.includes(task.kind) ||
    task.ownerRole !== TASK_OWNER[task.kind]
  ) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_TASK_LINEAGE_INVALID");
  safeId(task.taskId, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_TASK_ID_INVALID");
  integer(task.cycleNumber, 1, request.budgets.maximumCycles, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_TASK_CYCLE_INVALID");
  integer(task.attempt, 1, request.budgets.maximumAttemptsPerScope, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_TASK_ATTEMPT_INVALID");
  const scope = workScope(task.scope);
  if (scope.kind !== task.kind || scopeIdentity(scope) !== task.scopeDigest) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_TASK_SCOPE_MISMATCH");
  assertAuthority(task.authority, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_TASK_AUTHORITY_INVALID");
  digest(task.taskDigest, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_TASK_DIGEST_INVALID");
  if (animationCharacterFamilyCampaignSha256(body(task, "taskDigest")) !== task.taskDigest) {
    fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_TASK_DIGEST_MISMATCH");
  }
  return task;
}

export function planAnimationCharacterFamilyCampaignCycle(input) {
  const source = object(input, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_PLAN_INPUT_INVALID");
  const request = assertAnimationCharacterFamilyCampaignRequestIntegrity(source.request);
  const state = assertAnimationCharacterFamilyCampaignStateIntegrity(source.state, request);
  if (state.status === "blocked") fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_BLOCKED");
  const cycleNumber = state.cycleCount + 1;
  if (cycleNumber > request.budgets.maximumCycles) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_BUDGET_EXHAUSTED");
  const family = state.familyStatus;
  const tasks = [];
  if (family.status !== "delivery-ready") {
    for (const work of array(family.nextWork ?? [], "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_NEXT_WORK_INVALID")) {
      const task = compileTask(request, state, work, cycleNumber);
      if (task) tasks.push(task);
      if (tasks.length >= request.budgets.maximumTasksPerCycle) break;
    }
  }
  const action = family.status === "delivery-ready" ? "complete" : tasks.length ? "execute-tasks" : "block";
  const value = {
    schema: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_PLAN_SCHEMA,
    protocolVersion: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_PROTOCOL_VERSION,
    cycleId: `cycle:${request.campaignId}:${cycleNumber}`,
    cycleNumber,
    campaignId: request.campaignId,
    requestDigest: request.requestDigest,
    stateDigest: state.stateDigest,
    familyStatusDigest: family.statusDigest,
    action,
    tasks,
    plannedAt: timestamp(source.plannedAt ?? new Date().toISOString(), "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_PLANNED_AT_INVALID"),
    authority: animationCharacterFamilyCampaignAuthority,
  };
  return Object.freeze({ ...value, cyclePlanDigest: animationCharacterFamilyCampaignSha256(value) });
}

export function assertAnimationCharacterFamilyCampaignCyclePlanIntegrity(value, requestValue, stateValue) {
  const plan = object(value, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_PLAN_INVALID");
  const request = assertAnimationCharacterFamilyCampaignRequestIntegrity(requestValue);
  const state = assertAnimationCharacterFamilyCampaignStateIntegrity(stateValue, request);
  if (
    plan.schema !== ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_PLAN_SCHEMA ||
    plan.protocolVersion !== ANIMATION_CHARACTER_FAMILY_CAMPAIGN_PROTOCOL_VERSION ||
    plan.campaignId !== request.campaignId ||
    plan.requestDigest !== request.requestDigest ||
    plan.stateDigest !== state.stateDigest ||
    plan.familyStatusDigest !== state.familyStatus.statusDigest ||
    plan.cycleNumber !== state.cycleCount + 1
  ) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_PLAN_LINEAGE_INVALID");
  if (!["complete", "execute-tasks", "block"].includes(plan.action)) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_PLAN_ACTION_INVALID");
  const tasks = array(plan.tasks, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_PLAN_TASKS_INVALID");
  if (tasks.length > request.budgets.maximumTasksPerCycle) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_PLAN_TASK_BUDGET_EXCEEDED");
  tasks.forEach((task) => assertAnimationCharacterFamilyCampaignTaskIntegrity(task, request));
  timestamp(plan.plannedAt, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_PLANNED_AT_INVALID");
  assertAuthority(plan.authority, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_PLAN_AUTHORITY_INVALID");
  digest(plan.cyclePlanDigest, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_PLAN_DIGEST_INVALID");
  if (animationCharacterFamilyCampaignSha256(body(plan, "cyclePlanDigest")) !== plan.cyclePlanDigest) {
    fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_PLAN_DIGEST_MISMATCH");
  }
  return plan;
}

export function compileAnimationCharacterFamilyCampaignTaskReceipt(input) {
  scanCredentials(input);
  const source = object(input, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPT_INPUT_INVALID");
  const request = assertAnimationCharacterFamilyCampaignRequestIntegrity(source.request);
  const task = assertAnimationCharacterFamilyCampaignTaskIntegrity(source.task, request);
  const status = source.status;
  if (!RECEIPT_STATUSES.has(status)) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPT_STATUS_INVALID");
  const result = source.result == null ? null : structuredClone(source.result);
  if (status === "completed") {
    const output = object(result, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPT_RESULT_REQUIRED");
    if (task.kind === "review-family") {
      if (!output.reviewReceipt) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_REVIEW_RECEIPT_REQUIRED");
    } else {
      const clips = output.clips ?? (output.clip ? [output.clip] : []);
      if (!clips.length) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CLIP_EVIDENCE_REQUIRED");
      normalizedClips(clips);
    }
  }
  const startedAt = timestamp(source.startedAt, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPT_STARTED_AT_INVALID");
  const completedAt = timestamp(source.completedAt, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPT_COMPLETED_AT_INVALID");
  if (Date.parse(completedAt) < Date.parse(startedAt)) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPT_TIME_INVALID");
  const value = {
    schema: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPT_SCHEMA,
    protocolVersion: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_PROTOCOL_VERSION,
    receiptId: safeId(source.receiptId ?? `receipt:${task.taskId}`, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPT_ID_INVALID"),
    taskId: task.taskId,
    taskDigest: task.taskDigest,
    campaignId: request.campaignId,
    requestDigest: request.requestDigest,
    ownerRole: task.ownerRole,
    kind: task.kind,
    attempt: task.attempt,
    status,
    result,
    detail: source.detail == null ? null : String(source.detail).slice(0, 4096),
    startedAt,
    completedAt,
    authority: animationCharacterFamilyCampaignAuthority,
  };
  return Object.freeze({ ...value, receiptDigest: animationCharacterFamilyCampaignSha256(value) });
}

export function assertAnimationCharacterFamilyCampaignTaskReceiptIntegrity(value, requestValue, taskValue) {
  scanCredentials(value);
  const receipt = object(value, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPT_INVALID");
  const request = assertAnimationCharacterFamilyCampaignRequestIntegrity(requestValue);
  const task = assertAnimationCharacterFamilyCampaignTaskIntegrity(taskValue, request);
  if (
    receipt.schema !== ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPT_SCHEMA ||
    receipt.protocolVersion !== ANIMATION_CHARACTER_FAMILY_CAMPAIGN_PROTOCOL_VERSION ||
    receipt.taskId !== task.taskId ||
    receipt.taskDigest !== task.taskDigest ||
    receipt.campaignId !== request.campaignId ||
    receipt.requestDigest !== request.requestDigest ||
    receipt.ownerRole !== task.ownerRole ||
    receipt.kind !== task.kind ||
    receipt.attempt !== task.attempt ||
    !RECEIPT_STATUSES.has(receipt.status)
  ) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPT_LINEAGE_INVALID");
  timestamp(receipt.startedAt, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPT_STARTED_AT_INVALID");
  timestamp(receipt.completedAt, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPT_COMPLETED_AT_INVALID");
  assertAuthority(receipt.authority, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPT_AUTHORITY_INVALID");
  digest(receipt.receiptDigest, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPT_DIGEST_INVALID");
  if (animationCharacterFamilyCampaignSha256(body(receipt, "receiptDigest")) !== receipt.receiptDigest) {
    fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPT_DIGEST_MISMATCH");
  }
  return receipt;
}

function mergeClipEvidence(currentClips, incomingClips, request) {
  const map = new Map(currentClips.map((clip) => [clip.slotId, structuredClone(clip)]));
  let changed = false;
  for (const clip of normalizedClips(incomingClips)) {
    if (clip.planDigest !== request.familyPlanDigest) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RESULT_CLIP_PLAN_MISMATCH");
    const previous = map.get(clip.slotId);
    if (!previous || previous.clipDigest !== clip.clipDigest) changed = true;
    map.set(clip.slotId, structuredClone(clip));
  }
  return { clips: [...map.values()].sort((a, b) => a.slotId.localeCompare(b.slotId)), changed };
}

export function applyAnimationCharacterFamilyCampaignCycle(input) {
  const source = object(input, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_INPUT_INVALID");
  const request = assertAnimationCharacterFamilyCampaignRequestIntegrity(source.request);
  const state = assertAnimationCharacterFamilyCampaignStateIntegrity(source.state, request);
  const plan = assertAnimationCharacterFamilyCampaignCyclePlanIntegrity(source.cyclePlan, request, state);
  const receipts = array(source.receipts ?? [], "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPTS_INVALID");
  const receiptByTask = new Map();
  for (const receipt of receipts) {
    const task = plan.tasks.find((candidate) => candidate.taskId === receipt.taskId);
    if (!task) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPT_TASK_UNKNOWN", String(receipt.taskId));
    if (receiptByTask.has(task.taskId)) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPT_DUPLICATE", task.taskId);
    receiptByTask.set(task.taskId, assertAnimationCharacterFamilyCampaignTaskReceiptIntegrity(receipt, request, task));
  }
  if (plan.action === "execute-tasks" && receiptByTask.size !== plan.tasks.length) {
    fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPT_COUNT_MISMATCH");
  }

  let clips = structuredClone(state.clips);
  let reviewReceipt = state.reviewReceipt ? structuredClone(state.reviewReceipt) : null;
  let progress = false;
  const attemptsByScope = { ...state.attemptsByScope };
  for (const task of plan.tasks) {
    const receipt = receiptByTask.get(task.taskId);
    attemptsByScope[task.scopeDigest] = Math.max(attemptsByScope[task.scopeDigest] ?? 0, task.attempt);
    if (receipt.status !== "completed") continue;
    if (task.kind === "review-family") {
      const candidate = object(receipt.result, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_REVIEW_RESULT_INVALID").reviewReceipt;
      const reviewInput = compileAnimationCharacterFamilyReviewInput({ plan: request.familyPlan, clips });
      assertAnimationCharacterFamilyReviewReceiptIntegrity(candidate, reviewInput);
      if (!reviewReceipt || reviewReceipt.receiptDigest !== candidate.receiptDigest) progress = true;
      reviewReceipt = structuredClone(candidate);
    } else {
      const output = object(receipt.result, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CLIP_RESULT_INVALID");
      const incoming = output.clips ?? [output.clip];
      const merged = mergeClipEvidence(clips, incoming, request);
      clips = merged.clips;
      if (merged.changed) {
        progress = true;
        reviewReceipt = null;
      }
    }
  }

  const family = compileAnimationCharacterFamilyStatus({
    plan: request.familyPlan,
    clips,
    ...(reviewReceipt ? { reviewReceipt } : {}),
  });
  const consecutiveNoProgressCycles = progress ? 0 : state.consecutiveNoProgressCycles + 1;
  let status = family.status === "delivery-ready" ? "delivery-ready" : family.status === "review-required" ? "review-ready" : "work-ready";
  let blocker = null;
  if (plan.action === "block") {
    status = "blocked";
    blocker = { code: "NO_EXECUTABLE_FAMILY_WORK" };
  } else if (consecutiveNoProgressCycles >= request.budgets.maximumConsecutiveNoProgressCycles) {
    status = "blocked";
    blocker = { code: "NO_PROGRESS_BUDGET_EXHAUSTED" };
  } else if (plan.cycleNumber >= request.budgets.maximumCycles && family.status !== "delivery-ready") {
    status = "blocked";
    blocker = { code: "CYCLE_BUDGET_EXHAUSTED" };
  }
  const completedAt = timestamp(source.completedAt ?? new Date().toISOString(), "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_COMPLETED_AT_INVALID");
  const nextStateValue = {
    schema: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_STATE_SCHEMA,
    protocolVersion: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_PROTOCOL_VERSION,
    campaignId: request.campaignId,
    requestDigest: request.requestDigest,
    familyPlanDigest: request.familyPlanDigest,
    status,
    cycleCount: plan.cycleNumber,
    consecutiveNoProgressCycles,
    clips,
    reviewReceipt,
    familyStatus: family,
    attemptsByScope,
    blocker,
    createdAt: state.createdAt,
    updatedAt: completedAt,
    authority: animationCharacterFamilyCampaignAuthority,
  };
  const nextState = Object.freeze({ ...nextStateValue, stateDigest: animationCharacterFamilyCampaignSha256(nextStateValue) });
  const cycleValue = {
    schema: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_SCHEMA,
    protocolVersion: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_PROTOCOL_VERSION,
    cycleId: plan.cycleId,
    cycleNumber: plan.cycleNumber,
    campaignId: request.campaignId,
    requestDigest: request.requestDigest,
    priorStateDigest: state.stateDigest,
    cyclePlanDigest: plan.cyclePlanDigest,
    receiptDigests: receipts.map((receipt) => receipt.receiptDigest).sort(),
    progress,
    statusBefore: state.status,
    statusAfter: nextState.status,
    familyStatusBeforeDigest: state.familyStatus.statusDigest,
    familyStatusAfterDigest: family.statusDigest,
    nextStateDigest: nextState.stateDigest,
    completedAt,
    authority: animationCharacterFamilyCampaignAuthority,
  };
  const cycle = Object.freeze({ ...cycleValue, cycleDigest: animationCharacterFamilyCampaignSha256(cycleValue) });
  return Object.freeze({ state: nextState, cycle });
}

export function assertAnimationCharacterFamilyCampaignCycleIntegrity(value) {
  const cycle = object(value, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_INVALID");
  if (
    cycle.schema !== ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_SCHEMA ||
    cycle.protocolVersion !== ANIMATION_CHARACTER_FAMILY_CAMPAIGN_PROTOCOL_VERSION
  ) fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_SCHEMA_INVALID");
  safeId(cycle.cycleId, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_ID_INVALID");
  safeId(cycle.campaignId, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_ID_INVALID");
  integer(cycle.cycleNumber, 1, 1000, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_NUMBER_INVALID");
  array(cycle.receiptDigests, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_RECEIPTS_INVALID").forEach((entry) =>
    digest(entry, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_RECEIPT_DIGEST_INVALID"),
  );
  timestamp(cycle.completedAt, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_COMPLETED_AT_INVALID");
  assertAuthority(cycle.authority, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_AUTHORITY_INVALID");
  digest(cycle.cycleDigest, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_DIGEST_INVALID");
  if (animationCharacterFamilyCampaignSha256(body(cycle, "cycleDigest")) !== cycle.cycleDigest) {
    fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_DIGEST_MISMATCH");
  }
  return cycle;
}

export function compileAnimationCharacterFamilyCampaignRuntimePlan(input) {
  const source = object(input, "ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RUNTIME_INPUT_INVALID");
  const request = assertAnimationCharacterFamilyCampaignRequestIntegrity(source.request);
  const state = assertAnimationCharacterFamilyCampaignStateIntegrity(source.state, request);
  if (state.status !== "delivery-ready" || state.familyStatus.status !== "delivery-ready" || !state.reviewReceipt) {
    fail("ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RUNTIME_NOT_READY");
  }
  return compileAnimationCharacterFamilyRuntimePlan({ plan: request.familyPlan, clips: state.clips, reviewReceipt: state.reviewReceipt });
}

export function describeAnimationCharacterFamilyCampaignV1() {
  return Object.freeze({
    schema: "evavo.animation-character-family-campaign.description.v1",
    protocolVersion: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_PROTOCOL_VERSION,
    schemas: Object.freeze({
      request: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_REQUEST_SCHEMA,
      state: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_STATE_SCHEMA,
      task: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_TASK_SCHEMA,
      cyclePlan: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_PLAN_SCHEMA,
      receipt: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_RECEIPT_SCHEMA,
      cycle: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_CYCLE_SCHEMA,
    }),
    taskKinds: ANIMATION_CHARACTER_FAMILY_CAMPAIGN_TASK_KINDS,
    taskOwners: TASK_OWNER,
    oneBoundedCyclePerInvocation: true,
    authority: animationCharacterFamilyCampaignAuthority,
  });
}

if (process.argv[1]?.endsWith("animation_character_family_campaign_v1.mjs") && process.argv.length > 2) {
  const command = process.argv[2];
  if (command === "describe") process.stdout.write(`${JSON.stringify(describeAnimationCharacterFamilyCampaignV1(), null, 2)}\n`);
}
