import { createHash } from "node:crypto";

import {
  normalizeJson,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";
import type { RuntimeFailureClassification } from "@evavo/art-runtime";
import {
  spritePlanSha256,
  type CompiledSpriteProductionPlan,
} from "@evavo/art-sprite-planner";

import {
  SPRITE_SUPERVISOR_PROTOCOL_VERSION,
  SpriteSupervisorError,
  type NormalizedSpriteSupervisorArtifactSelector,
  type NormalizedSpriteSupervisorCompileRequest,
  type NormalizedSpriteSupervisorFailurePolicy,
  type NormalizedSpriteSupervisorReviewResolution,
  type NormalizedSpriteSupervisorTask,
  type SpriteSupervisorArtifactBindingInput,
  type SpriteSupervisorCompileRequestInput,
  type SpriteSupervisorTaskInput,
} from "./types.js";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const RUNTIME_NAME = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const FAILURE_CLASSIFICATIONS = new Set<RuntimeFailureClassification>([
  "transient",
  "permanent",
  "cancelled",
  "lease-expired",
  "deadline-exceeded",
  "dependency-failed",
  "timeout",
]);
const ALLOWED_CHILD_KINDS = [
  "art.candidate.generate",
  "art.candidate.edit",
  "art.candidate.inpaint",
  "art.candidate.master-alpha",
  "art.candidate.select",
  "art.candidate.promote",
  "art.repair.plan",
  "art.repair.execute-provider-canvas",
  "art.repair.revise-family",
  "art.repair.prepare-revision-selection",
  "art.repair.rank-revisions",
  "art.repair.promote-revision",
  "sprite.family.verify",
  "sprite.atlas.build",
] as const;
const ALLOWED_CHILD_KIND_SET = new Set<string>(ALLOWED_CHILD_KINDS);
const FORBIDDEN_KEY_FRAGMENTS = [
  "apikey",
  "accesstoken",
  "refreshtoken",
  "password",
  "credential",
  "authorization",
  "bearertoken",
  "sharedsecret",
  "clientsecret",
] as const;
const FORBIDDEN_BYPASS_KEYS = new Set([
  "bypass",
  "bypassquality",
  "disablegate",
  "disablegates",
  "ignorequality",
  "allowrejected",
  "acceptfailed",
  "thresholdoverride",
  "relaxthresholds",
  "skipvalidation",
  "skipverification",
]);

function fail(code: string, message: string, details?: JsonValue): never {
  throw new SpriteSupervisorError(code, message, details);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) fail("SPRITE_SUPERVISOR_REQUEST_INVALID", `${name} must be an object.`);
  return value;
}

function text(
  value: unknown,
  name: string,
  fallback?: string,
  maximum = 4_096,
): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string") fail("SPRITE_SUPERVISOR_REQUEST_INVALID", `${name} must be a string.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || normalized.includes("\0")) {
    fail(
      "SPRITE_SUPERVISOR_REQUEST_INVALID",
      `${name} must contain 1 to ${maximum} safe characters.`,
    );
  }
  return normalized;
}

function identifier(value: unknown, name: string): string {
  const normalized = text(value, name, undefined, 128);
  if (!SAFE_ID.test(normalized)) {
    fail("SPRITE_SUPERVISOR_REQUEST_INVALID", `${name} must be a safe identifier.`);
  }
  return normalized;
}

function runtimeName(value: unknown, name: string): string {
  const normalized = text(value, name, undefined, 256);
  if (!RUNTIME_NAME.test(normalized)) {
    fail("SPRITE_SUPERVISOR_REQUEST_INVALID", `${name} must be a safe runtime name.`);
  }
  return normalized;
}

function integer(
  value: unknown,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const resolved = value === undefined ? fallback : value;
  if (
    typeof resolved !== "number" ||
    !Number.isInteger(resolved) ||
    resolved < minimum ||
    resolved > maximum
  ) {
    fail(
      "SPRITE_SUPERVISOR_REQUEST_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return resolved;
}

function finite(
  value: unknown,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const resolved = value === undefined ? fallback : value;
  if (
    typeof resolved !== "number" ||
    !Number.isFinite(resolved) ||
    resolved < minimum ||
    resolved > maximum
  ) {
    fail(
      "SPRITE_SUPERVISOR_REQUEST_INVALID",
      `${name} must be between ${minimum} and ${maximum}.`,
    );
  }
  return resolved;
}

function booleanValue(value: unknown, name: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    fail("SPRITE_SUPERVISOR_REQUEST_INVALID", `${name} must be a boolean.`);
  }
  return value;
}

function uniqueStrings(
  value: unknown,
  name: string,
  maximumItems: number,
): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximumItems) {
    fail(
      "SPRITE_SUPERVISOR_REQUEST_INVALID",
      `${name} must contain no more than ${maximumItems} strings.`,
    );
  }
  const result = value.map((entry, index) =>
    runtimeName(entry, `${name}[${index}]`),
  );
  if (new Set(result).size !== result.length) {
    fail("SPRITE_SUPERVISOR_REQUEST_INVALID", `${name} must not contain duplicates.`);
  }
  return result;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const source = value as Record<string, unknown>;
  return `{${Object.keys(source)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(source[key])}`)
    .join(",")}}`;
}

export function spriteSupervisorSha256(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function assertNoSecretsOrBypasses(value: unknown, path = "request", depth = 0): void {
  if (depth > 64) {
    fail(
      "SPRITE_SUPERVISOR_REQUEST_DEPTH_EXCEEDED",
      "Supervisor request nesting exceeds the maximum depth of 64.",
    );
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoSecretsOrBypasses(entry, `${path}[${index}]`, depth + 1),
    );
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    const compact = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (FORBIDDEN_KEY_FRAGMENTS.some((fragment) => compact.includes(fragment))) {
      fail(
        "SPRITE_SUPERVISOR_SECRET_FIELD_REJECTED",
        `Secret-like field is not allowed in supervisor input: ${path}.${key}`,
      );
    }
    if (FORBIDDEN_BYPASS_KEYS.has(compact)) {
      fail(
        "SPRITE_SUPERVISOR_QUALITY_BYPASS_REJECTED",
        `Quality-bypass field is not allowed in supervisor input: ${path}.${key}`,
      );
    }
    assertNoSecretsOrBypasses(entry, `${path}.${key}`, depth + 1);
  }
}

function verifySpritePlan(value: unknown): CompiledSpriteProductionPlan {
  const plan = record(value, "spritePlan") as unknown as CompiledSpriteProductionPlan;
  if (
    plan.schemaVersion !== "1.0" ||
    typeof plan.protocolVersion !== "string" ||
    typeof plan.planId !== "string" ||
    !SAFE_ID.test(plan.planId) ||
    typeof plan.planSha256 !== "string" ||
    !SHA256.test(plan.planSha256) ||
    !Array.isArray(plan.workItems) ||
    !Array.isArray(plan.frames) ||
    !Array.isArray(plan.clips) ||
    !Array.isArray(plan.directions) ||
    !isRecord(plan.project) ||
    !isRecord(plan.asset)
  ) {
    fail(
      "SPRITE_SUPERVISOR_PLAN_INVALID",
      "spritePlan must be a complete compiled sprite-production plan.",
    );
  }
  const { planSha256, ...hashBody } = plan;
  const calculated = spritePlanSha256(hashBody);
  if (calculated !== planSha256) {
    fail(
      "SPRITE_SUPERVISOR_PLAN_HASH_MISMATCH",
      "The compiled sprite plan does not match its declared SHA-256.",
      normalizeJson({ declared: planSha256, calculated }),
    );
  }
  return plan;
}

function artifactId(value: unknown, name: string): ArtifactId {
  const normalized = text(value, name, undefined, 80);
  if (!ARTIFACT_ID.test(normalized)) {
    fail(
      "SPRITE_SUPERVISOR_REQUEST_INVALID",
      `${name} must use artifact_<sha256> format.`,
    );
  }
  return normalized as ArtifactId;
}

function normalizeBindings(
  value: unknown,
  name: string,
): readonly SpriteSupervisorArtifactBindingInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 2_048) {
    fail(
      "SPRITE_SUPERVISOR_REQUEST_INVALID",
      `${name} must contain no more than 2048 bindings.`,
    );
  }
  const roles = new Set<string>();
  return value.map((entry, index) => {
    const item = record(entry, `${name}[${index}]`);
    const role = runtimeName(item.role, `${name}[${index}].role`);
    if (roles.has(role)) {
      fail(
        "SPRITE_SUPERVISOR_REQUEST_INVALID",
        `${name} contains duplicate role ${role}.`,
      );
    }
    roles.add(role);
    if (!Array.isArray(item.artifactIds) || item.artifactIds.length < 1 || item.artifactIds.length > 10_000) {
      fail(
        "SPRITE_SUPERVISOR_REQUEST_INVALID",
        `${name}[${index}].artifactIds must contain 1 to 10000 artifact IDs.`,
      );
    }
    const artifactIds = item.artifactIds.map((candidate, artifactIndex) =>
      artifactId(candidate, `${name}[${index}].artifactIds[${artifactIndex}]`),
    );
    return { role, artifactIds: [...new Set(artifactIds)].sort() };
  });
}

function normalizeSelector(
  value: unknown,
  name: string,
): NormalizedSpriteSupervisorArtifactSelector {
  const item = record(value, name);
  const role = runtimeName(item.role, `${name}.role`);
  const source = item.source;
  if (
    source !== "output-artifact-labels" &&
    source !== "runtime-result-json" &&
    source !== "failure-details"
  ) {
    fail("SPRITE_SUPERVISOR_REQUEST_INVALID", `${name}.source is unsupported.`);
  }
  const labelsInput = item.labels === undefined ? {} : record(item.labels, `${name}.labels`);
  const labels: Record<string, string> = {};
  for (const [key, candidate] of Object.entries(labelsInput)) {
    labels[runtimeName(key, `${name}.labels key`)] = text(
      candidate,
      `${name}.labels.${key}`,
      undefined,
      512,
    );
  }
  const pointer =
    item.pointer === undefined || item.pointer === ""
      ? ""
      : text(item.pointer, `${name}.pointer`, undefined, 1_024);
  if (pointer && !pointer.startsWith("/")) {
    fail(
      "SPRITE_SUPERVISOR_REQUEST_INVALID",
      `${name}.pointer must be an RFC 6901 JSON pointer beginning with '/'.`,
    );
  }
  if (source === "output-artifact-labels" && Object.keys(labels).length === 0) {
    fail(
      "SPRITE_SUPERVISOR_REQUEST_INVALID",
      `${name}.labels is required for output-artifact-labels selectors.`,
    );
  }
  if (source !== "output-artifact-labels" && !pointer) {
    fail(
      "SPRITE_SUPERVISOR_REQUEST_INVALID",
      `${name}.pointer is required for ${source} selectors.`,
    );
  }
  const cardinality = item.cardinality === undefined ? "one" : item.cardinality;
  if (cardinality !== "one" && cardinality !== "many") {
    fail("SPRITE_SUPERVISOR_REQUEST_INVALID", `${name}.cardinality is unsupported.`);
  }
  return {
    role,
    source,
    labels,
    pointer,
    cardinality,
    required: booleanValue(item.required, `${name}.required`, true),
  };
}

function normalizeFailurePolicy(
  value: unknown,
  name: string,
  defaults: Readonly<{
    maxRedrives: number;
    maxRepairCycles: number;
    reviewOnUnclassified: boolean;
  }>,
): NormalizedSpriteSupervisorFailurePolicy {
  const item = value === undefined ? {} : record(value, name);
  const classifications = uniqueStrings(
    item.redriveClassifications,
    `${name}.redriveClassifications`,
    16,
  );
  for (const classification of classifications) {
    if (!FAILURE_CLASSIFICATIONS.has(classification as RuntimeFailureClassification)) {
      fail(
        "SPRITE_SUPERVISOR_REQUEST_INVALID",
        `${name}.redriveClassifications contains unsupported value ${classification}.`,
      );
    }
  }
  const repairTaskId =
    item.repairTaskId === undefined
      ? undefined
      : identifier(item.repairTaskId, `${name}.repairTaskId`);
  return {
    redriveClassifications: classifications as RuntimeFailureClassification[],
    redriveCodePrefixes: uniqueStrings(
      item.redriveCodePrefixes,
      `${name}.redriveCodePrefixes`,
      128,
    ),
    maxRedrives: integer(
      item.maxRedrives,
      `${name}.maxRedrives`,
      defaults.maxRedrives,
      0,
      100,
    ),
    ...(repairTaskId === undefined ? {} : { repairTaskId }),
    maxRepairCycles: integer(
      item.maxRepairCycles,
      `${name}.maxRepairCycles`,
      defaults.maxRepairCycles,
      0,
      100,
    ),
    reviewCodePrefixes: uniqueStrings(
      item.reviewCodePrefixes,
      `${name}.reviewCodePrefixes`,
      128,
    ),
    abortCodePrefixes: uniqueStrings(
      item.abortCodePrefixes,
      `${name}.abortCodePrefixes`,
      128,
    ),
    reviewOnUnclassified: booleanValue(
      item.reviewOnUnclassified,
      `${name}.reviewOnUnclassified`,
      defaults.reviewOnUnclassified,
    ),
  };
}

function normalizeTask(
  value: unknown,
  index: number,
  defaults: Readonly<{
    maxRedrives: number;
    maxRepairCycles: number;
    reviewOnUnclassified: boolean;
  }>,
): NormalizedSpriteSupervisorTask {
  const name = `tasks[${index}]`;
  const item = record(value, name);
  const id = identifier(item.id, `${name}.id`);
  const kind = runtimeName(item.kind, `${name}.kind`);
  if (!ALLOWED_CHILD_KIND_SET.has(kind)) {
    fail(
      "SPRITE_SUPERVISOR_CHILD_KIND_REJECTED",
      `${kind} is not an allowed bounded Art Studio child job kind.`,
    );
  }
  const selectorsInput = item.outputBindings;
  const outputBindings = selectorsInput === undefined
    ? []
    : (() => {
        if (!Array.isArray(selectorsInput) || selectorsInput.length > 256) {
          fail(
            "SPRITE_SUPERVISOR_REQUEST_INVALID",
            `${name}.outputBindings must contain no more than 256 selectors.`,
          );
        }
        return selectorsInput.map((entry, selectorIndex) =>
          normalizeSelector(entry, `${name}.outputBindings[${selectorIndex}]`),
        );
      })();
  const bindingKeys = new Set<string>();
  for (const selector of outputBindings) {
    const key = `${selector.source}:${selector.role}:${selector.pointer}:${stable(selector.labels)}`;
    if (bindingKeys.has(key)) {
      fail(
        "SPRITE_SUPERVISOR_REQUEST_INVALID",
        `${name}.outputBindings contains a duplicate selector for ${selector.role}.`,
      );
    }
    bindingKeys.add(key);
  }
  const staticInputArtifacts = item.staticInputArtifacts === undefined
    ? []
    : (() => {
        if (!Array.isArray(item.staticInputArtifacts) || item.staticInputArtifacts.length > 10_000) {
          fail(
            "SPRITE_SUPERVISOR_REQUEST_INVALID",
            `${name}.staticInputArtifacts must contain no more than 10000 artifact IDs.`,
          );
        }
        return item.staticInputArtifacts.map((entry, artifactIndex) =>
          artifactId(entry, `${name}.staticInputArtifacts[${artifactIndex}]`),
        );
      })();
  const retry = item.retryPolicy === undefined ? {} : record(item.retryPolicy, `${name}.retryPolicy`);
  const triggeredByFailureOfTaskId =
    item.triggeredByFailureOfTaskId === undefined
      ? undefined
      : identifier(
          item.triggeredByFailureOfTaskId,
          `${name}.triggeredByFailureOfTaskId`,
        );
  return {
    id,
    stage: runtimeName(item.stage, `${name}.stage`),
    title: text(item.title, `${name}.title`, undefined, 512),
    queue: runtimeName(item.queue, `${name}.queue`),
    kind,
    payloadTemplate: normalizeJson(item.payloadTemplate),
    requiredCapabilities: uniqueStrings(
      item.requiredCapabilities,
      `${name}.requiredCapabilities`,
      128,
    ),
    dependencyTaskIds: uniqueStrings(
      item.dependencyTaskIds,
      `${name}.dependencyTaskIds`,
      512,
    ),
    requiredArtifactRoles: uniqueStrings(
      item.requiredArtifactRoles,
      `${name}.requiredArtifactRoles`,
      512,
    ),
    staticInputArtifacts: [...new Set(staticInputArtifacts)].sort(),
    outputBindings,
    ...(triggeredByFailureOfTaskId === undefined
      ? {}
      : { triggeredByFailureOfTaskId }),
    required: booleanValue(item.required, `${name}.required`, true),
    priority: integer(item.priority, `${name}.priority`, 0, -1_000_000, 1_000_000),
    maximumAttempts: integer(
      item.maximumAttempts,
      `${name}.maximumAttempts`,
      3,
      1,
      100,
    ),
    retryPolicy: {
      baseDelayMs: integer(
        retry.baseDelayMs,
        `${name}.retryPolicy.baseDelayMs`,
        15_000,
        0,
        86_400_000,
      ),
      maximumDelayMs: integer(
        retry.maximumDelayMs,
        `${name}.retryPolicy.maximumDelayMs`,
        300_000,
        0,
        604_800_000,
      ),
      multiplier: finite(
        retry.multiplier,
        `${name}.retryPolicy.multiplier`,
        2,
        1,
        100,
      ),
      jitterFraction: finite(
        retry.jitterFraction,
        `${name}.retryPolicy.jitterFraction`,
        0.15,
        0,
        1,
      ),
    },
    leaseDurationMs: integer(
      item.leaseDurationMs,
      `${name}.leaseDurationMs`,
      300_000,
      1_000,
      86_400_000,
    ),
    timeoutMs: integer(
      item.timeoutMs,
      `${name}.timeoutMs`,
      1_800_000,
      1_000,
      86_400_000,
    ),
    failurePolicy: normalizeFailurePolicy(
      item.failurePolicy,
      `${name}.failurePolicy`,
      defaults,
    ),
  };
}

function normalizeResolution(
  value: unknown,
  index: number,
): NormalizedSpriteSupervisorReviewResolution {
  const name = `reviewResolutions[${index}]`;
  const item = record(value, name);
  const resolutionId = identifier(item.resolutionId, `${name}.resolutionId`);
  const expectedStateTick = integer(
    item.expectedStateTick,
    `${name}.expectedStateTick`,
    -1,
    0,
    1_000_000,
  );
  const taskId = item.taskId === "$release"
    ? "$release"
    : identifier(item.taskId, `${name}.taskId`);
  const action = item.action;
  if (
    action !== "retry" &&
    action !== "skip" &&
    action !== "abort" &&
    action !== "approve-release"
  ) {
    fail("SPRITE_SUPERVISOR_REQUEST_INVALID", `${name}.action is unsupported.`);
  }
  if (action === "approve-release" && taskId !== "$release") {
    fail(
      "SPRITE_SUPERVISOR_REQUEST_INVALID",
      `${name}.approve-release must target $release.`,
    );
  }
  if (action !== "approve-release" && taskId === "$release") {
    fail(
      "SPRITE_SUPERVISOR_REQUEST_INVALID",
      `${name} may target $release only with approve-release.`,
    );
  }
  return {
    resolutionId,
    expectedStateTick,
    taskId,
    action,
    approver: text(item.approver, `${name}.approver`, undefined, 256),
    reason: text(item.reason, `${name}.reason`, undefined, 2_048),
    artifactBindings: normalizeBindings(
      item.artifactBindings,
      `${name}.artifactBindings`,
    ),
  };
}

function assertTaskGraph(
  tasks: readonly NormalizedSpriteSupervisorTask[],
  initialBindings: readonly SpriteSupervisorArtifactBindingInput[],
  plan: CompiledSpriteProductionPlan,
  requireAllStages: boolean,
  requiredReleaseRoles: readonly string[],
): void {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  if (byId.size !== tasks.length) {
    fail("SPRITE_SUPERVISOR_TASK_DUPLICATE", "Task identifiers must be unique.");
  }
  for (const task of tasks) {
    for (const dependencyId of task.dependencyTaskIds) {
      if (!byId.has(dependencyId)) {
        fail(
          "SPRITE_SUPERVISOR_TASK_DEPENDENCY_MISSING",
          `Task ${task.id} depends on unknown task ${dependencyId}.`,
        );
      }
      if (dependencyId === task.id) {
        fail(
          "SPRITE_SUPERVISOR_TASK_DEPENDENCY_CYCLE",
          `Task ${task.id} cannot depend on itself.`,
        );
      }
    }
    if (
      task.triggeredByFailureOfTaskId !== undefined &&
      !byId.has(task.triggeredByFailureOfTaskId)
    ) {
      fail(
        "SPRITE_SUPERVISOR_REPAIR_SOURCE_MISSING",
        `Task ${task.id} is triggered by unknown task ${task.triggeredByFailureOfTaskId}.`,
      );
    }
    const repairTaskId = task.failurePolicy.repairTaskId;
    if (repairTaskId !== undefined) {
      const repairTask = byId.get(repairTaskId);
      if (!repairTask) {
        fail(
          "SPRITE_SUPERVISOR_REPAIR_TASK_MISSING",
          `Task ${task.id} references unknown repair task ${repairTaskId}.`,
        );
      }
      if (repairTask.triggeredByFailureOfTaskId !== task.id) {
        fail(
          "SPRITE_SUPERVISOR_REPAIR_TASK_INVALID",
          `Repair task ${repairTaskId} must declare triggeredByFailureOfTaskId=${task.id}.`,
        );
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (taskId: string, stack: readonly string[]): void => {
    if (visited.has(taskId)) return;
    if (visiting.has(taskId)) {
      fail(
        "SPRITE_SUPERVISOR_TASK_DEPENDENCY_CYCLE",
        `Task dependency cycle detected: ${[...stack, taskId].join(" -> ")}`,
      );
    }
    visiting.add(taskId);
    const task = byId.get(taskId)!;
    for (const dependencyId of task.dependencyTaskIds) {
      visit(dependencyId, [...stack, taskId]);
    }
    visiting.delete(taskId);
    visited.add(taskId);
  };
  for (const taskId of [...byId.keys()].sort()) visit(taskId, []);

  if (requireAllStages) {
    const covered = new Set(tasks.map((task) => task.stage));
    const missing = [
      ...new Set(
        plan.workItems
          .filter((item) => item.units > 0)
          .map((item) => item.stage),
      ),
    ].filter((stage) => !covered.has(stage));
    if (missing.length) {
      fail(
        "SPRITE_SUPERVISOR_PLAN_STAGE_UNCOVERED",
        `Supervisor tasks do not cover required sprite-plan stages: ${missing.join(", ")}`,
        normalizeJson({ missingStages: missing }),
      );
    }
  }

  const availableRoles = new Set(initialBindings.map((binding) => binding.role));
  for (const task of tasks) {
    for (const selector of task.outputBindings) availableRoles.add(selector.role);
  }
  const missingRoles = [
    ...new Set([
      ...tasks.flatMap((task) => task.requiredArtifactRoles),
      ...requiredReleaseRoles,
    ]),
  ].filter((role) => !availableRoles.has(role));
  if (missingRoles.length) {
    fail(
      "SPRITE_SUPERVISOR_ARTIFACT_ROLE_UNBOUND",
      `Supervisor workflow references artifact roles that are never seeded or produced: ${missingRoles.join(", ")}`,
      normalizeJson({ missingRoles }),
    );
  }
}

export function validateSpriteSupervisorCompileRequest(
  input: SpriteSupervisorCompileRequestInput | unknown,
): NormalizedSpriteSupervisorCompileRequest {
  assertNoSecretsOrBypasses(input);
  const root = record(input, "request");
  if (root.schemaVersion !== "1.0") {
    fail(
      "SPRITE_SUPERVISOR_REQUEST_INVALID",
      'schemaVersion must be "1.0".',
    );
  }
  const runId = identifier(root.runId, "runId");
  const spritePlan = verifySpritePlan(root.spritePlan);
  const initialArtifactBindings = normalizeBindings(
    root.initialArtifactBindings,
    "initialArtifactBindings",
  );
  const policyInput = root.policy === undefined ? {} : record(root.policy, "policy");
  const policy = {
    tickDelayMs: integer(
      policyInput.tickDelayMs,
      "policy.tickDelayMs",
      5_000,
      250,
      3_600_000,
    ),
    maximumTicks: integer(
      policyInput.maximumTicks,
      "policy.maximumTicks",
      10_000,
      1,
      1_000_000,
    ),
    maximumActiveChildren: integer(
      policyInput.maximumActiveChildren,
      "policy.maximumActiveChildren",
      16,
      1,
      1_000,
    ),
    defaultMaximumRedrives: integer(
      policyInput.defaultMaximumRedrives,
      "policy.defaultMaximumRedrives",
      2,
      0,
      100,
    ),
    defaultMaximumRepairCycles: integer(
      policyInput.defaultMaximumRepairCycles,
      "policy.defaultMaximumRepairCycles",
      2,
      0,
      100,
    ),
    cancelChildrenOnAbort: booleanValue(
      policyInput.cancelChildrenOnAbort,
      "policy.cancelChildrenOnAbort",
      true,
    ),
    reviewOnUnclassifiedFailure: booleanValue(
      policyInput.reviewOnUnclassifiedFailure,
      "policy.reviewOnUnclassifiedFailure",
      true,
    ),
    requireAllPlanStagesCovered: booleanValue(
      policyInput.requireAllPlanStagesCovered,
      "policy.requireAllPlanStagesCovered",
      true,
    ),
    requireFinalHumanApproval: booleanValue(
      policyInput.requireFinalHumanApproval,
      "policy.requireFinalHumanApproval",
      false,
    ),
    requiredReleaseArtifactRoles: uniqueStrings(
      policyInput.requiredReleaseArtifactRoles,
      "policy.requiredReleaseArtifactRoles",
      2_048,
    ),
  };
  if (!Array.isArray(root.tasks) || root.tasks.length < 1 || root.tasks.length > 10_000) {
    fail(
      "SPRITE_SUPERVISOR_REQUEST_INVALID",
      "tasks must contain 1 to 10000 task definitions.",
    );
  }
  const taskDefaults = {
    maxRedrives: policy.defaultMaximumRedrives,
    maxRepairCycles: policy.defaultMaximumRepairCycles,
    reviewOnUnclassified: policy.reviewOnUnclassifiedFailure,
  };
  const tasks = root.tasks.map((task, index) =>
    normalizeTask(task, index, taskDefaults),
  );
  const reviewResolutions = root.reviewResolutions === undefined
    ? []
    : (() => {
        if (!Array.isArray(root.reviewResolutions) || root.reviewResolutions.length > 10_000) {
          fail(
            "SPRITE_SUPERVISOR_REQUEST_INVALID",
            "reviewResolutions must contain no more than 10000 entries.",
          );
        }
        return root.reviewResolutions.map((resolution, index) =>
          normalizeResolution(resolution, index),
        );
      })();
  const resolutionIds = new Set<string>();
  const resolutionTargets = new Set<string>();
  for (const resolution of reviewResolutions) {
    if (resolutionIds.has(resolution.resolutionId)) {
      fail(
        "SPRITE_SUPERVISOR_REQUEST_INVALID",
        `Duplicate review resolution ID ${resolution.resolutionId}.`,
      );
    }
    resolutionIds.add(resolution.resolutionId);
    const targetKey = `${resolution.taskId}:${resolution.action}`;
    if (resolutionTargets.has(targetKey)) {
      fail(
        "SPRITE_SUPERVISOR_REQUEST_INVALID",
        `Duplicate review resolution target ${targetKey}.`,
      );
    }
    resolutionTargets.add(targetKey);
    if (
      resolution.taskId !== "$release" &&
      !tasks.some((task) => task.id === resolution.taskId)
    ) {
      fail(
        "SPRITE_SUPERVISOR_REQUEST_INVALID",
        `Review resolution references unknown task ${resolution.taskId}.`,
      );
    }
  }

  assertTaskGraph(
    tasks,
    initialArtifactBindings,
    spritePlan,
    policy.requireAllPlanStagesCovered,
    policy.requiredReleaseArtifactRoles,
  );

  return {
    schemaVersion: "1.0",
    protocolVersion: SPRITE_SUPERVISOR_PROTOCOL_VERSION,
    runId,
    spritePlan,
    initialArtifactBindings,
    tasks,
    policy,
    reviewResolutions,
    ...(root.metadata === undefined ? {} : { metadata: normalizeJson(root.metadata) }),
  };
}

export function spriteSupervisorRequestSha256(
  request: NormalizedSpriteSupervisorCompileRequest,
): string {
  return spriteSupervisorSha256(request);
}
