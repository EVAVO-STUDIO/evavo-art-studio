import { types as utilTypes } from "node:util";

import { assert, freeze } from "./frame-body-named-human-approval-common.mjs";

const DEFAULT_LIMITS = Object.freeze({
  maximumDepth: 64,
  maximumNodes: 50_000,
  maximumBytes: 2 * 1024 * 1024,
});

const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function failClosed(message) {
  assert(false, message);
}

function ownShape(value, label) {
  if (utilTypes.isProxy(value)) failClosed(`${label} may not be a Proxy.`);
  try {
    return {
      prototype: Object.getPrototypeOf(value),
      keys: Reflect.ownKeys(value),
      descriptors: Object.getOwnPropertyDescriptors(value),
    };
  } catch (error) {
    failClosed(
      `${label} could not be inspected without invoking caller-controlled behaviour: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function capture(value, label, state, depth) {
  state.nodes += 1;
  assert(state.nodes <= state.limits.maximumNodes, `${label} exceeds the immutable snapshot node limit.`);
  assert(depth <= state.limits.maximumDepth, `${label} exceeds the immutable snapshot depth limit.`);

  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    assert(Number.isFinite(value), `${label} contains a non-finite number.`);
    return value;
  }
  assert(typeof value === "object", `${label} contains a non-JSON value of type ${typeof value}.`);
  assert(!state.ancestors.has(value), `${label} contains a cyclic object graph.`);
  state.ancestors.add(value);

  try {
    const shape = ownShape(value, label);
    const symbols = shape.keys.filter((key) => typeof key === "symbol");
    assert(symbols.length === 0, `${label} contains symbolic properties.`);

    if (Array.isArray(value)) {
      assert(shape.prototype === Array.prototype, `${label} must use the ordinary Array prototype.`);
      const expectedNames = new Set(["length"]);
      for (let index = 0; index < value.length; index += 1) expectedNames.add(String(index));
      const names = shape.keys.map(String);
      assert(
        names.length === expectedNames.size && names.every((name) => expectedNames.has(name)),
        `${label} contains sparse or additional array properties.`,
      );
      const output = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = shape.descriptors[String(index)];
        assert(descriptor && "value" in descriptor, `${label}[${index}] may not be an accessor.`);
        assert(descriptor.enumerable === true, `${label}[${index}] must be enumerable JSON data.`);
        output.push(capture(descriptor.value, `${label}[${index}]`, state, depth + 1));
      }
      return Object.freeze(output);
    }

    assert(shape.prototype === Object.prototype, `${label} must use the ordinary Object prototype.`);
    const output = {};
    for (const key of shape.keys) {
      const name = String(key);
      assert(!DANGEROUS_KEYS.has(name), `${label} contains the unsafe property ${name}.`);
      const descriptor = shape.descriptors[name];
      assert(descriptor && "value" in descriptor, `${label}.${name} may not be an accessor.`);
      assert(descriptor.enumerable === true, `${label}.${name} must be enumerable JSON data.`);
      output[name] = capture(descriptor.value, `${label}.${name}`, state, depth + 1);
    }
    return Object.freeze(output);
  } finally {
    state.ancestors.delete(value);
  }
}

export function snapshotApprovalJson(value, label, limits = {}) {
  const normalizedLimits = {
    maximumDepth: limits.maximumDepth ?? DEFAULT_LIMITS.maximumDepth,
    maximumNodes: limits.maximumNodes ?? DEFAULT_LIMITS.maximumNodes,
    maximumBytes: limits.maximumBytes ?? DEFAULT_LIMITS.maximumBytes,
  };
  for (const [name, limit] of Object.entries(normalizedLimits)) {
    assert(Number.isInteger(limit) && limit >= 1, `${label} ${name} must be a positive integer.`);
  }
  const captured = capture(value, label, {
    ancestors: new WeakSet(),
    nodes: 0,
    limits: normalizedLimits,
  }, 0);
  const serialized = JSON.stringify(captured);
  assert(serialized !== undefined, `${label} could not be represented as JSON.`);
  assert(
    Buffer.byteLength(serialized, "utf8") <= normalizedLimits.maximumBytes,
    `${label} exceeds the immutable snapshot byte limit.`,
  );
  return freeze(captured);
}

function sortedKeys(value) {
  return Object.keys(value).sort();
}

export function assertExactApprovalKeys(value, expectedKeys, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  const actual = sortedKeys(value);
  const expected = [...expectedKeys].sort();
  assert(
    actual.length === expected.length && actual.every((key, index) => key === expected[index]),
    `${label} fields must be exactly: ${expected.join(", ")}.`,
  );
  return value;
}

export function assertAllowedApprovalKeys(value, allowedKeys, requiredKeys, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) assert(allowed.has(key), `${label} contains unsupported field ${key}.`);
  for (const key of requiredKeys) assert(Object.hasOwn(value, key), `${label}.${key} is required.`);
  return value;
}

export const HUMAN_APPROVAL_FIELDS = Object.freeze([
  "actorId",
  "occurredAt",
  "decision",
  "rationale",
  "attestations",
]);

export const HUMAN_APPROVAL_ATTESTATION_FIELDS = Object.freeze([
  "candidateSha256",
  "masterSha256",
  "masteringPlanSha256",
  "masteringRecordSha256",
  "masteredReceiptSha256",
  "exactMasterInspected",
  "masteringLineageAccepted",
  "independentNamedHumanApproval",
  "noMasterMutationPromotionDeliveryGitOrPublicationPerformed",
]);

export const MASTERING_PLAN_FIELDS = Object.freeze([
  "schema",
  "protocolVersion",
  "projectId",
  "unitId",
  "batchId",
  "frameId",
  "bodySlot",
  "attempt",
  "workspaceRoot",
  "workOrderSha256",
  "policySha256",
  "selectionDecision",
  "previousReceipts",
  "candidate",
  "masteringRecord",
  "receipt",
  "targets",
  "completedMasteringState",
  "nextLegalAction",
  "authority",
  "masteringPlanSha256",
]);

export const MASTERING_RECORD_FIELDS = Object.freeze([
  "schema",
  "protocolVersion",
  "projectId",
  "unitId",
  "batchId",
  "frameId",
  "bodySlot",
  "attempt",
  "workspaceRoot",
  "workOrderSha256",
  "policySha256",
  "selectionDecisionSha256",
  "selectionEvidenceSha256",
  "selectionReceiptSha256",
  "candidate",
  "master",
  "executor",
  "attestations",
  "occurredAt",
  "claims",
  "authority",
  "masteringRecordSha256",
]);

export const PRODUCTION_RECEIPT_FIELDS = Object.freeze([
  "schema",
  "protocolVersion",
  "unitId",
  "batchId",
  "workOrderSha256",
  "state",
  "attempt",
  "evidenceSha256",
  "candidateSha256",
  "outcome",
  "actorClass",
  "actorId",
  "occurredAt",
  "previousReceiptSha256",
  "receiptSha256",
]);

export const APPROVAL_PLAN_FIELDS = Object.freeze([
  "schema",
  "protocolVersion",
  "projectId",
  "unitId",
  "batchId",
  "frameId",
  "bodySlot",
  "attempt",
  "workspaceRoot",
  "workOrderSha256",
  "policySha256",
  "masteringPlan",
  "previousReceipts",
  "master",
  "approvalRecord",
  "receipt",
  "targets",
  "completedApprovalState",
  "nextLegalAction",
  "authority",
  "approvalPlanSha256",
]);

export const APPROVAL_RECORD_FIELDS = Object.freeze([
  "schema",
  "protocolVersion",
  "projectId",
  "unitId",
  "batchId",
  "frameId",
  "bodySlot",
  "attempt",
  "workspaceRoot",
  "workOrderSha256",
  "policySha256",
  "masteringPlanSha256",
  "masteringRecordSha256",
  "masteredReceiptSha256",
  "selectionDecisionSha256",
  "selectionReceiptSha256",
  "candidate",
  "master",
  "approver",
  "decision",
  "rationale",
  "attestations",
  "occurredAt",
  "claims",
  "authority",
  "approvalRecordSha256",
]);

export function snapshotHumanApproval(value) {
  const captured = snapshotApprovalJson(value, "humanApproval", { maximumBytes: 64 * 1024 });
  assertExactApprovalKeys(captured, HUMAN_APPROVAL_FIELDS, "humanApproval");
  assertExactApprovalKeys(
    captured.attestations,
    HUMAN_APPROVAL_ATTESTATION_FIELDS,
    "humanApproval.attestations",
  );
  return captured;
}

export function snapshotApprovalCompileRequest(value) {
  const captured = snapshotApprovalJson(value, "named-human approval compiler input");
  assertAllowedApprovalKeys(
    captured,
    ["masteringPlan", "workspaceRoot", "humanApproval"],
    ["masteringPlan", "humanApproval"],
    "named-human approval compiler input",
  );
  return freeze({
    masteringPlan: captured.masteringPlan,
    workspaceRoot: captured.workspaceRoot,
    humanApproval: snapshotHumanApproval(captured.humanApproval),
  });
}

export function snapshotApprovalDocumentRequest(value) {
  const captured = snapshotApprovalJson(value, "named-human approval document compiler input");
  assertExactApprovalKeys(
    captured,
    ["masteringPlan", "previousReceipts", "workspaceRoot", "master", "humanApproval"],
    "named-human approval document compiler input",
  );
  return freeze({
    ...captured,
    humanApproval: snapshotHumanApproval(captured.humanApproval),
  });
}

export function snapshotCompletedMasteringPlan(value) {
  const captured = snapshotApprovalJson(value, "completed selected-candidate mastering plan");
  assertExactApprovalKeys(captured, MASTERING_PLAN_FIELDS, "completed selected-candidate mastering plan");
  assertExactApprovalKeys(
    captured.masteringRecord,
    MASTERING_RECORD_FIELDS,
    "completed selected-candidate mastering record",
  );
  assertExactApprovalKeys(captured.receipt, PRODUCTION_RECEIPT_FIELDS, "mastered production receipt");
  return captured;
}

export function snapshotApprovalPlan(value) {
  const captured = snapshotApprovalJson(value, "Frame body named-human approval plan");
  assertExactApprovalKeys(captured, APPROVAL_PLAN_FIELDS, "Frame body named-human approval plan");
  assertExactApprovalKeys(
    captured.approvalRecord,
    APPROVAL_RECORD_FIELDS,
    "Frame body named-human approval record",
  );
  assertExactApprovalKeys(captured.receipt, PRODUCTION_RECEIPT_FIELDS, "named-human-approved receipt");
  return captured;
}
