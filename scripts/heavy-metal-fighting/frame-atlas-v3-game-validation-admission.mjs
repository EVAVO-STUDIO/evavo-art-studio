import { types as utilTypes } from "node:util";

import {
  assert,
  freeze,
  hashBytes,
  hashValue,
  selfHashed,
  SHA256,
} from "./frame-body-named-human-approval-common.mjs";
import {
  assertExactApprovalKeys,
  snapshotApprovalJson,
} from "./frame-body-named-human-approval-snapshot.mjs";

export const STEEL_DOMINION_ATLAS_V3_LOCAL_VALIDATION_SCHEMA =
  "steel-dominion.hmf-atlas-v3-local-validation.v1";
export const HMF_ATLAS_V3_GAME_VALIDATION_ADMISSION_SCHEMA =
  "evavo.heavy-metal-fighting-atlas-v3-game-validation-admission.v1";
export const HMF_ATLAS_V3_GAME_VALIDATION_ADMISSION_PROTOCOL_VERSION = "2026-08-15.1";

export const HMF_ATLAS_V3_GAME_VALIDATION_MAXIMUM_RECEIPT_BYTES =
  1024 * 1024;
const GIT_SHA = /^[0-9a-f]{40}$/u;
const SAFE_BRANCH = /^(?:detached-head|[A-Za-z0-9][A-Za-z0-9._/-]{0,254})$/u;
const GODOT_462 = /^4\.6\.2(?:[.+ -]|$)/u;
const POWERSHELL_UTC = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?Z$/u;

const RECEIPT_FIELDS = Object.freeze([
  "schema",
  "status",
  "repository",
  "public_title",
  "branch",
  "head",
  "godot_exe",
  "godot_version",
  "started_at_utc",
  "completed_at_utc",
  "duration_seconds",
  "suite_count",
  "completed_suite_count",
  "suites",
  "source_tree_clean_before",
  "source_tree_clean_after",
  "github_actions_required",
  "image_generation",
  "error",
]);
const SUITE_FIELDS = Object.freeze([
  "id",
  "runner",
  "status",
  "started_at_utc",
  "completed_at_utc",
  "duration_seconds",
  "error",
]);
const ADMISSION_FIELDS = Object.freeze([
  "schema",
  "protocolVersion",
  "projectId",
  "publicTitle",
  "gameRepository",
  "expectedGameHead",
  "validatedGameHead",
  "branch",
  "godotVersion",
  "sourceReceipt",
  "validationWindow",
  "suites",
  "checks",
  "authority",
  "admissionSha256",
]);
const SOURCE_RECEIPT_FIELDS = Object.freeze([
  "schema",
  "bytes",
  "byteSha256",
  "canonicalSha256",
]);
const VALIDATION_WINDOW_FIELDS = Object.freeze([
  "startedAtUtc",
  "completedAtUtc",
  "durationSeconds",
]);
const ADMITTED_SUITE_FIELDS = Object.freeze([
  "id",
  "runner",
  "startedAtUtc",
  "completedAtUtc",
  "durationSeconds",
]);
const CHECK_FIELDS = Object.freeze([
  "exactReceiptContract",
  "exactGameHead",
  "exactGodotVersion",
  "allSixSuitesPassed",
  "cleanTreeBeforeAndAfter",
  "githubActionsNotRequired",
  "imageGenerationNotPerformed",
  "sourceReceiptByteBound",
]);
const AUTHORITY_FIELDS = Object.freeze([
  "sourceReceiptRead",
  "validationEvidenceAdmission",
  "gameRepositoryRead",
  "gameRepositoryMutation",
  "runtimeActivation",
  "gitMutation",
  "deployment",
  "publication",
  "forcePush",
]);

export const REQUIRED_GAME_VALIDATION_SUITES = Object.freeze([
  Object.freeze({ id: "atlas-v3-contract", runner: "run_production_fighter_atlas_v3_tests.ps1" }),
  Object.freeze({ id: "runtime-bridge", runner: "run_production_fighter_runtime_bridge_tests.ps1" }),
  Object.freeze({ id: "production-atlas-audit", runner: "run_production_fighter_atlas_audit_tests.ps1" }),
  Object.freeze({ id: "release-readiness", runner: "run_final_asset_readiness_tests.ps1" }),
  Object.freeze({ id: "release-preflight", runner: "run_final_asset_preflight_tests.ps1" }),
  Object.freeze({ id: "handoff-tooling", runner: "run_final_asset_handoff_tooling_tests.ps1" }),
]);

function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_ATLAS_V3_GAME_VALIDATION_INVALID: ${message}`);
}

function inspectOrdinaryInput(input, expectedNames, label) {
  assert(input && typeof input === "object" && !Array.isArray(input), `${label} must be an object.`);
  if (utilTypes.isProxy(input)) fail(`${label} may not be a Proxy.`);
  let prototype;
  let keys;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(input);
    keys = Reflect.ownKeys(input);
    descriptors = Object.getOwnPropertyDescriptors(input);
  } catch (error) {
    fail(`${label} could not be inspected safely: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(prototype === Object.prototype, `${label} must use the ordinary Object prototype.`);
  assert(keys.every((key) => typeof key === "string"), `${label} may not contain symbolic properties.`);
  const names = keys.map(String).sort();
  const expected = [...expectedNames].sort();
  assert(
    names.length === expected.length && names.every((name, index) => name === expected[index]),
    `${label} fields must be exactly: ${expected.join(", ")}.`,
  );
  for (const name of names) {
    const descriptor = descriptors[name];
    assert(descriptor && "value" in descriptor, `${label}.${name} may not be an accessor.`);
    assert(descriptor.enumerable === true, `${label}.${name} must be enumerable data.`);
  }
  return descriptors;
}

function copyReceiptBytes(source) {
  if (source && typeof source === "object" && utilTypes.isProxy(source)) {
    fail("receiptBytes may not be a Proxy.");
  }
  assert(Buffer.isBuffer(source) || source instanceof Uint8Array, "receiptBytes must be a Buffer or Uint8Array.");
  if (typeof SharedArrayBuffer !== "undefined") {
    assert(!(source.buffer instanceof SharedArrayBuffer), "receiptBytes may not use shared memory.");
  }
  assert(
    source.byteLength >= 1 &&
      source.byteLength <= HMF_ATLAS_V3_GAME_VALIDATION_MAXIMUM_RECEIPT_BYTES,
    "receiptBytes exceeds the admitted byte bounds.",
  );
  return Buffer.from(source);
}

function captureInput(input) {
  const descriptors = inspectOrdinaryInput(input, ["receiptBytes", "expectedGameHead"], "admission input");
  const expectedGameHead = descriptors.expectedGameHead.value;
  assert(typeof expectedGameHead === "string" && GIT_SHA.test(expectedGameHead), "expectedGameHead must be a 40-character lowercase Git commit SHA.");
  return Object.freeze({
    expectedGameHead,
    receiptBytes: copyReceiptBytes(descriptors.receiptBytes.value),
  });
}

function captureVerificationInput(input) {
  const descriptors = inspectOrdinaryInput(
    input,
    ["admission", "receiptBytes", "expectedGameHead"],
    "game validation verifier input",
  );
  const expectedGameHead = descriptors.expectedGameHead.value;
  assert(typeof expectedGameHead === "string" && GIT_SHA.test(expectedGameHead), "expectedGameHead must be a 40-character lowercase Git commit SHA.");
  const admission = snapshotApprovalJson(
    descriptors.admission.value,
    "submitted HMF atlas-v3 game validation admission",
    {
      maximumDepth: 16,
      maximumNodes: 4096,
      maximumBytes: HMF_ATLAS_V3_GAME_VALIDATION_MAXIMUM_RECEIPT_BYTES,
    },
  );
  return Object.freeze({
    admission,
    expectedGameHead,
    receiptBytes: copyReceiptBytes(descriptors.receiptBytes.value),
  });
}

function decodeReceipt(bytes) {
  const withoutBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
    ? bytes.subarray(3)
    : bytes;
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(withoutBom);
  } catch (error) {
    fail(`validation receipt is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail(`validation receipt is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return snapshotApprovalJson(parsed, "steel-dominion atlas-v3 local validation receipt", {
    maximumDepth: 16,
    maximumNodes: 4096,
    maximumBytes: HMF_ATLAS_V3_GAME_VALIDATION_MAXIMUM_RECEIPT_BYTES,
  });
}

function timestampMilliseconds(value, label) {
  assert(typeof value === "string", `${label} must be a UTC timestamp.`);
  const match = POWERSHELL_UTC.exec(value);
  assert(match, `${label} must use the PowerShell round-trip UTC timestamp shape.`);
  const milliseconds = (match[2] ?? "0").padEnd(3, "0").slice(0, 3);
  const normalized = `${match[1]}.${milliseconds}Z`;
  const instant = Date.parse(normalized);
  assert(Number.isFinite(instant) && new Date(instant).toISOString() === normalized, `${label} is not a valid UTC instant.`);
  return instant;
}

function durationSeconds(value, label) {
  assert(Number.isFinite(value) && value >= 0, `${label} must be a non-negative finite number.`);
  return value;
}

function assertDurationMatches(started, completed, duration, label) {
  const delta = (completed - started) / 1000;
  assert(Math.abs(delta - duration) <= 0.01, `${label} does not match its timestamp window.`);
}

function validateReceipt(receipt, expectedGameHead) {
  assertExactApprovalKeys(receipt, RECEIPT_FIELDS, "steel-dominion atlas-v3 local validation receipt");
  assert(receipt.schema === STEEL_DOMINION_ATLAS_V3_LOCAL_VALIDATION_SCHEMA, "validation receipt schema drifted.");
  assert(receipt.status === "passed", "validation receipt must record status passed.");
  assert(receipt.repository === "EVAVO-STUDIO/steel-dominion", "validation receipt repository drifted.");
  assert(receipt.public_title === "HEAVY METAL FIGHTING", "validation receipt public title drifted.");
  assert(typeof receipt.branch === "string" && SAFE_BRANCH.test(receipt.branch), "validation receipt branch is not a safe Git branch identifier.");
  assert(typeof receipt.head === "string" && GIT_SHA.test(receipt.head), "validation receipt head must be a lowercase Git commit SHA.");
  assert(receipt.head === expectedGameHead, "validation receipt head does not match expectedGameHead.");
  assert(typeof receipt.godot_exe === "string" && receipt.godot_exe.trim() === receipt.godot_exe && receipt.godot_exe.length >= 3, "validation receipt godot_exe is invalid.");
  assert(typeof receipt.godot_version === "string" && GODOT_462.test(receipt.godot_version), "validation receipt must prove Godot 4.6.2.");

  const started = timestampMilliseconds(receipt.started_at_utc, "validation receipt started_at_utc");
  const completed = timestampMilliseconds(receipt.completed_at_utc, "validation receipt completed_at_utc");
  assert(completed >= started, "validation receipt completed before it started.");
  const duration = durationSeconds(receipt.duration_seconds, "validation receipt duration_seconds");
  assertDurationMatches(started, completed, duration, "validation receipt duration_seconds");

  assert(receipt.suite_count === REQUIRED_GAME_VALIDATION_SUITES.length, "validation receipt suite_count must be six.");
  assert(receipt.completed_suite_count === REQUIRED_GAME_VALIDATION_SUITES.length, "validation receipt completed_suite_count must be six.");
  assert(Array.isArray(receipt.suites) && receipt.suites.length === REQUIRED_GAME_VALIDATION_SUITES.length, "validation receipt must contain exactly six suites.");

  let previousSuiteCompleted = started;
  const admittedSuites = receipt.suites.map((suite, index) => {
    const expected = REQUIRED_GAME_VALIDATION_SUITES[index];
    assertExactApprovalKeys(suite, SUITE_FIELDS, `validation receipt suites[${index}]`);
    assert(suite.id === expected.id && suite.runner === expected.runner, `validation receipt suite ${index} identity drifted.`);
    assert(suite.status === "passed" && suite.error === null, `validation receipt suite ${suite.id} did not pass cleanly.`);
    const suiteStarted = timestampMilliseconds(suite.started_at_utc, `validation receipt suite ${suite.id} started_at_utc`);
    const suiteCompleted = timestampMilliseconds(suite.completed_at_utc, `validation receipt suite ${suite.id} completed_at_utc`);
    assert(suiteCompleted >= suiteStarted, `validation receipt suite ${suite.id} completed before it started.`);
    assert(suiteStarted >= started && suiteCompleted <= completed, `validation receipt suite ${suite.id} escaped the overall validation window.`);
    assert(
      suiteStarted >= previousSuiteCompleted,
      `validation receipt suite ${suite.id} started before the previous required suite completed.`,
    );
    const suiteDuration = durationSeconds(suite.duration_seconds, `validation receipt suite ${suite.id} duration_seconds`);
    assertDurationMatches(suiteStarted, suiteCompleted, suiteDuration, `validation receipt suite ${suite.id} duration_seconds`);
    previousSuiteCompleted = suiteCompleted;
    return freeze({
      id: suite.id,
      runner: suite.runner,
      startedAtUtc: suite.started_at_utc,
      completedAtUtc: suite.completed_at_utc,
      durationSeconds: suiteDuration,
    });
  });

  assert(receipt.source_tree_clean_before === true, "validation receipt must prove a clean source tree before execution.");
  assert(receipt.source_tree_clean_after === true, "validation receipt must prove a clean source tree after execution.");
  assert(receipt.github_actions_required === false, "validation receipt must remain independent of GitHub Actions.");
  assert(receipt.image_generation === false, "validation receipt may not claim image generation.");
  assert(receipt.error === null, "validation receipt must not retain an error.");

  return freeze({
    receipt,
    admittedSuites,
    startedAtUtc: receipt.started_at_utc,
    completedAtUtc: receipt.completed_at_utc,
    durationSeconds: duration,
  });
}

function admissionAuthority() {
  return freeze({
    sourceReceiptRead: true,
    validationEvidenceAdmission: true,
    gameRepositoryRead: false,
    gameRepositoryMutation: false,
    runtimeActivation: false,
    gitMutation: false,
    deployment: false,
    publication: false,
    forcePush: false,
  });
}

function validateAdmissionShape(value, expectedGameHead = undefined) {
  const admission = snapshotApprovalJson(value, "HMF atlas-v3 game validation admission", {
    maximumDepth: 16,
    maximumNodes: 4096,
    maximumBytes: HMF_ATLAS_V3_GAME_VALIDATION_MAXIMUM_RECEIPT_BYTES,
  });
  assertExactApprovalKeys(admission, ADMISSION_FIELDS, "HMF atlas-v3 game validation admission");
  selfHashed(admission, "admissionSha256", "HMF atlas-v3 game validation admission");
  assert(admission.schema === HMF_ATLAS_V3_GAME_VALIDATION_ADMISSION_SCHEMA, "game validation admission schema drifted.");
  assert(admission.protocolVersion === HMF_ATLAS_V3_GAME_VALIDATION_ADMISSION_PROTOCOL_VERSION, "game validation admission protocol drifted.");
  assert(admission.projectId === "heavy-metal-fighting" && admission.publicTitle === "HEAVY METAL FIGHTING", "game validation admission project identity drifted.");
  assert(admission.gameRepository === "EVAVO-STUDIO/steel-dominion", "game validation admission repository drifted.");
  assert(GIT_SHA.test(admission.expectedGameHead) && admission.validatedGameHead === admission.expectedGameHead, "game validation admission head binding drifted.");
  if (expectedGameHead !== undefined) assert(admission.expectedGameHead === expectedGameHead, "game validation admission does not match the expected game head.");
  assert(typeof admission.branch === "string" && SAFE_BRANCH.test(admission.branch), "game validation admission branch drifted.");
  assert(typeof admission.godotVersion === "string" && GODOT_462.test(admission.godotVersion), "game validation admission Godot version drifted.");

  assertExactApprovalKeys(admission.sourceReceipt, SOURCE_RECEIPT_FIELDS, "game validation admission sourceReceipt");
  assert(admission.sourceReceipt.schema === STEEL_DOMINION_ATLAS_V3_LOCAL_VALIDATION_SCHEMA, "game validation admission source receipt schema drifted.");
  assert(
    Number.isInteger(admission.sourceReceipt.bytes) &&
      admission.sourceReceipt.bytes >= 1 &&
      admission.sourceReceipt.bytes <=
        HMF_ATLAS_V3_GAME_VALIDATION_MAXIMUM_RECEIPT_BYTES,
    "game validation admission source receipt byte count drifted.",
  );
  assert(SHA256.test(admission.sourceReceipt.byteSha256) && SHA256.test(admission.sourceReceipt.canonicalSha256), "game validation admission source receipt hashes are invalid.");

  assertExactApprovalKeys(admission.validationWindow, VALIDATION_WINDOW_FIELDS, "game validation admission validationWindow");
  timestampMilliseconds(admission.validationWindow.startedAtUtc, "game validation admission validationWindow.startedAtUtc");
  timestampMilliseconds(admission.validationWindow.completedAtUtc, "game validation admission validationWindow.completedAtUtc");
  durationSeconds(admission.validationWindow.durationSeconds, "game validation admission validationWindow.durationSeconds");

  assert(Array.isArray(admission.suites) && admission.suites.length === REQUIRED_GAME_VALIDATION_SUITES.length, "game validation admission must retain six suites.");
  admission.suites.forEach((suite, index) => {
    assertExactApprovalKeys(suite, ADMITTED_SUITE_FIELDS, `game validation admission suites[${index}]`);
    const expected = REQUIRED_GAME_VALIDATION_SUITES[index];
    assert(suite.id === expected.id && suite.runner === expected.runner, `game validation admission suite ${index} drifted.`);
    timestampMilliseconds(suite.startedAtUtc, `game validation admission suite ${suite.id} startedAtUtc`);
    timestampMilliseconds(suite.completedAtUtc, `game validation admission suite ${suite.id} completedAtUtc`);
    durationSeconds(suite.durationSeconds, `game validation admission suite ${suite.id} durationSeconds`);
  });

  assertExactApprovalKeys(admission.checks, CHECK_FIELDS, "game validation admission checks");
  for (const key of CHECK_FIELDS) assert(admission.checks[key] === true, `game validation admission check ${key} must remain true.`);
  assertExactApprovalKeys(admission.authority, AUTHORITY_FIELDS, "game validation admission authority");
  assert(admission.authority.sourceReceiptRead === true && admission.authority.validationEvidenceAdmission === true, "game validation admission lost bounded receipt authority.");
  for (const key of AUTHORITY_FIELDS.slice(2)) assert(admission.authority[key] === false, `game validation admission gained forbidden authority: ${key}.`);
  return freeze(admission);
}

export function admitHmfAtlasV3GameValidationReceipt(input) {
  const captured = captureInput(input);
  const receipt = decodeReceipt(captured.receiptBytes);
  const validated = validateReceipt(receipt, captured.expectedGameHead);
  const body = {
    schema: HMF_ATLAS_V3_GAME_VALIDATION_ADMISSION_SCHEMA,
    protocolVersion: HMF_ATLAS_V3_GAME_VALIDATION_ADMISSION_PROTOCOL_VERSION,
    projectId: "heavy-metal-fighting",
    publicTitle: "HEAVY METAL FIGHTING",
    gameRepository: "EVAVO-STUDIO/steel-dominion",
    expectedGameHead: captured.expectedGameHead,
    validatedGameHead: receipt.head,
    branch: receipt.branch,
    godotVersion: receipt.godot_version,
    sourceReceipt: {
      schema: receipt.schema,
      bytes: captured.receiptBytes.length,
      byteSha256: hashBytes(captured.receiptBytes),
      canonicalSha256: hashValue(receipt),
    },
    validationWindow: {
      startedAtUtc: validated.startedAtUtc,
      completedAtUtc: validated.completedAtUtc,
      durationSeconds: validated.durationSeconds,
    },
    suites: validated.admittedSuites,
    checks: {
      exactReceiptContract: true,
      exactGameHead: true,
      exactGodotVersion: true,
      allSixSuitesPassed: true,
      cleanTreeBeforeAndAfter: true,
      githubActionsNotRequired: true,
      imageGenerationNotPerformed: true,
      sourceReceiptByteBound: true,
    },
    authority: admissionAuthority(),
  };
  return validateAdmissionShape(
    freeze({ ...body, admissionSha256: hashValue(body) }),
    captured.expectedGameHead,
  );
}

export function verifyHmfAtlasV3GameValidationAdmission(input) {
  const captured = captureVerificationInput(input);
  const submitted = validateAdmissionShape(captured.admission, captured.expectedGameHead);
  const expected = admitHmfAtlasV3GameValidationReceipt({
    receiptBytes: captured.receiptBytes,
    expectedGameHead: captured.expectedGameHead,
  });
  assert(
    hashValue(submitted) === hashValue(expected),
    "submitted game validation admission does not match the exact source receipt bytes and expected game head.",
  );
  return submitted;
}
