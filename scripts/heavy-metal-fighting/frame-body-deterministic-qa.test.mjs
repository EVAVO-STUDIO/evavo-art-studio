import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  compileHmfFrameBodyDeterministicQaPlan,
  materializeHmfFrameBodyDeterministicQa,
  verifyHmfFrameBodyDeterministicQa,
} from "./frame-body-deterministic-qa.mjs";
import {
  HMF_CANDIDATE_ADMISSION_PROTOCOL_VERSION,
  HMF_CANDIDATE_ADMISSION_RECORD_SCHEMA,
} from "./frame-body-candidate-admission.mjs";
import {
  createHmfProductionReceipt,
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";

const UNIT_ID = "hmf.frame-animation.bastion.slot-121";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
  return value;
}
function canonical(value) {
  return `${JSON.stringify(sorted(value), null, 2)}\n`;
}
function hashValue(value) {
  return sha256(Buffer.from(canonical(value), "utf8"));
}
function selfHash(body, field) {
  return Object.freeze({ ...body, [field]: hashValue(body) });
}
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return output;
}
function frameBodyPng({ semiTransparent = false, unsafeTransparentRgb = false, cropLeft = false, greebles = 0 } = {}) {
  const width = 160;
  const height = 160;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) raw[y * (rowBytes + 1)] = 0;
  const minX = cropLeft ? 0 : 48;
  for (let y = 40; y <= 152; y += 1) {
    for (let x = minX; x <= 112; x += 1) {
      const offset = y * (rowBytes + 1) + 1 + x * 4;
      raw[offset] = 50 + ((x + y) % 5) * 25;
      raw[offset + 1] = 45 + ((x * 2 + y) % 4) * 20;
      raw[offset + 2] = 40 + ((x + y * 3) % 3) * 18;
      raw[offset + 3] = 255;
    }
  }
  if (semiTransparent) {
    const offset = 80 * (rowBytes + 1) + 1 + 80 * 4;
    raw[offset + 3] = 128;
  }
  if (unsafeTransparentRgb) {
    const offset = 10 * (rowBytes + 1) + 1 + 10 * 4;
    raw[offset] = 255;
  }
  for (let index = 0; index < greebles; index += 1) {
    const x = 4 + index * 3;
    const y = 5 + (index % 2) * 3;
    const offset = y * (rowBytes + 1) + 1 + x * 4;
    raw[offset] = 200;
    raw[offset + 1] = 180;
    raw[offset + 2] = 120;
    raw[offset + 3] = 255;
  }
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
async function ensureParent(root, relative) {
  await mkdir(path.dirname(path.join(root, ...relative.split("/"))), { recursive: true });
}
async function fixture({ candidate = frameBodyPng() } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "hmf-frame-body-qa-"));
  const order = await heavyMetalFightingProductionWorkOrder(UNIT_ID);
  const referencesLocked = await createHmfProductionReceipt({
    unitId: UNIT_ID,
    state: "references-locked",
    attempt: 1,
    evidenceSha256: sha256(Buffer.from("qa-references-locked")),
    actorClass: "agent",
    actorId: "qa-fixture-agent",
    occurredAt: "2026-08-13T07:00:00.000Z",
  });
  const generationAuthorized = await createHmfProductionReceipt({
    unitId: UNIT_ID,
    state: "generation-authorized",
    attempt: 1,
    evidenceSha256: sha256(Buffer.from("qa-generation-authorized")),
    actorClass: "human",
    actorId: "named-human-reviewer",
    occurredAt: "2026-08-13T07:01:00.000Z",
  }, referencesLocked);
  const candidateSha256 = sha256(candidate);
  const candidatesAdmitted = await createHmfProductionReceipt({
    unitId: UNIT_ID,
    state: "candidates-admitted",
    attempt: 1,
    evidenceSha256: sha256(Buffer.from("qa-candidate-admission")),
    candidateSha256,
    actorClass: "system",
    actorId: "hmf-provider-runtime",
    occurredAt: "2026-08-13T07:02:00.000Z",
  }, generationAuthorized);
  const candidatePath = order.executionPaths.candidatePathTemplate.replace("{candidate:02}", "01");
  const admissionPath = `${candidatePath.slice(0, -4)}.candidate-admission.json`;
  const receiptPath = order.executionPaths.receiptPath;
  const admissionBody = {
    schema: HMF_CANDIDATE_ADMISSION_RECORD_SCHEMA,
    protocolVersion: HMF_CANDIDATE_ADMISSION_PROTOCOL_VERSION,
    projectId: order.projectId,
    publicTitle: order.publicTitle,
    unitId: order.unitId,
    batchId: order.batchId,
    frameId: order.subjectId,
    bodySlot: 121,
    attempt: 1,
    workOrderSha256: order.workOrderSha256,
    submissionManifestSha256: "1".repeat(64),
    runtimeDispatchSha256: "2".repeat(64),
    runtimeBindingSha256: "3".repeat(64),
    runtimeOutcomeSha256: "4".repeat(64),
    submissionIdempotencyKey: "qa-fixture",
    adapterId: "test-adapter",
    model: "test-model",
    candidateArtifactId: `artifact_${candidateSha256}`,
    candidateSha256,
    candidateBytes: candidate.length,
    providerEvidenceArtifactId: `artifact_${"5".repeat(64)}`,
    providerEvidenceSha256: "5".repeat(64),
    providerEvidenceBytes: 2,
    png: { width: 160, height: 160, bitDepth: 8, colorType: 6, rgba: true, alphaRequired: true, cornerAlpha: [0, 0, 0, 0], decodedBytes: 102400 },
    targets: {
      candidate: candidatePath,
      providerEvidence: `${candidatePath.slice(0, -4)}.provider-evidence.json`,
      admissionRecord: admissionPath,
      receiptChain: receiptPath,
    },
    runtimeActorMapping: { providerOutcomeActorClass: "runtime", productionReceiptActorClass: "system", productionReceiptActorId: "hmf-provider-runtime", reason: "fixture" },
    receipt: candidatesAdmitted,
    occurredAt: "2026-08-13T07:02:00.000Z",
    nextLegalAction: "run-deterministic-qa",
    authority: {
      workspaceCandidateWrite: true,
      workspaceEvidenceWrite: true,
      receiptPersistence: true,
      deterministicQa: false,
      creativeReview: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
    },
  };
  const admissionRecord = selfHash(admissionBody, "admissionRecordSha256");
  for (const relative of [candidatePath, admissionPath, receiptPath, admissionBody.targets.providerEvidence]) await ensureParent(root, relative);
  await writeFile(path.join(root, ...candidatePath.split("/")), candidate);
  await writeFile(path.join(root, ...admissionPath.split("/")), canonical(admissionRecord));
  await writeFile(path.join(root, ...receiptPath.split("/")), canonical([referencesLocked, generationAuthorized, candidatesAdmitted]));
  await writeFile(path.join(root, ...admissionBody.targets.providerEvidence.split("/")), "{}\n");
  return { root, order, candidate, candidateSha256, admissionRecord, receipts: [referencesLocked, generationAuthorized, candidatesAdmitted] };
}
async function cleanup(value) {
  await rm(value.root, { recursive: true, force: true });
}
async function planFor(value, overrides = {}) {
  return compileHmfFrameBodyDeterministicQaPlan({
    admissionRecord: value.admissionRecord,
    workspaceRoot: value.root,
    occurredAt: "2026-08-13T07:03:00.000Z",
    ...overrides,
  });
}

test("deterministic QA verification binds policy, Frame role and fail-closed authority", async () => {
  const verification = await verifyHmfFrameBodyDeterministicQa();
  assert.equal(verification.status, "passed");
  assert.ok(verification.checks.every((entry) => entry.passed));
  assert.equal(verification.authority.providerExecution, false);
  assert.equal(verification.authority.candidateApproval, false);
});

test("deterministic QA plan decodes admitted bytes and compiles one pass receipt without creative authority", async () => {
  const value = await fixture();
  try {
    const plan = await planFor(value);
    assert.equal(plan.qaReport.status, "passed");
    assert.equal(plan.qaReport.receipt.state, "deterministic-qa-passed");
    assert.equal(plan.qaReport.receipt.candidateSha256, value.candidateSha256);
    assert.equal(plan.qaReport.qaEvidence.metrics.semiTransparentPixels, 0);
    assert.equal(plan.qaReport.qaEvidence.metrics.unsafeTransparentRgbPixels, 0);
    assert.equal(plan.qaReport.qaEvidence.role.semanticId, "standing-heavy:hero-impact");
    assert.deepEqual(plan.qaReport.qaEvidence.failureCodes, []);
    assert.equal(plan.qaReport.authority.creativeReview, false);
    assert.equal(plan.authority.receiptPersistence, false);
  } finally {
    await cleanup(value);
  }
});

test("write-enabled deterministic QA persists report, advances only a pass receipt and becomes idempotent", async () => {
  const value = await fixture();
  try {
    const plan = await planFor(value);
    const first = await materializeHmfFrameBodyDeterministicQa(plan);
    assert.equal(first.status, "qa-passed");
    assert.equal(first.currentState, "deterministic-qa-passed");
    assert.equal(first.nextLegalAction, "run-creative-review");
    const reportPath = path.join(value.root, ...plan.qaReport.targets.qaReport.split("/"));
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(report.qaReportSha256, plan.qaReport.qaReportSha256);
    const receiptPath = path.join(value.root, ...plan.qaReport.targets.receiptChain.split("/"));
    const receipts = JSON.parse(await readFile(receiptPath, "utf8"));
    assert.equal(receipts.length, 4);
    assert.equal(receipts.at(-1).state, "deterministic-qa-passed");
    const resume = await heavyMetalFightingProductionBatchResumePlan(value.order.batchId, receipts);
    assert.equal(resume.unitStates.find((entry) => entry.unitId === UNIT_ID).nextAction, "run-creative-review");
    const second = await materializeHmfFrameBodyDeterministicQa(plan);
    assert.equal(second.status, "already-qa-passed");
    assert.equal(second.qaReportSha256, first.qaReportSha256);
  } finally {
    await cleanup(value);
  }
});

test("failed deterministic QA persists bounded evidence but never fabricates a pass receipt", async () => {
  const value = await fixture({ candidate: frameBodyPng({ semiTransparent: true, unsafeTransparentRgb: true }) });
  try {
    const plan = await planFor(value);
    assert.equal(plan.qaReport.status, "failed");
    assert.equal(plan.qaReport.receipt, null);
    assert.ok(plan.qaReport.qaEvidence.failureCodes.includes("alpha-contamination"));
    assert.ok(plan.qaReport.qaEvidence.failureCodes.includes("unsafe-transparent-rgb"));
    assert.equal(plan.qaReport.boundedRepairTemplate.failedCandidateSha256, value.candidateSha256);
    assert.equal(plan.qaReport.operatorNextAction, "request-named-human-bounded-repair-authorization");
    const result = await materializeHmfFrameBodyDeterministicQa(plan);
    assert.equal(result.status, "qa-failed");
    assert.equal(result.currentState, "candidates-admitted");
    assert.equal(result.materialization.receiptChain, "unchanged");
    const receiptPath = path.join(value.root, ...plan.qaReport.targets.receiptChain.split("/"));
    const receipts = JSON.parse(await readFile(receiptPath, "utf8"));
    assert.equal(receipts.length, 3);
    assert.equal(receipts.at(-1).state, "candidates-admitted");
    const second = await materializeHmfFrameBodyDeterministicQa(plan);
    assert.equal(second.status, "already-qa-failed");
  } finally {
    await cleanup(value);
  }
});

test("deterministic QA catches crop risk, disconnected greebles and duplicate candidate content", async () => {
  const value = await fixture({ candidate: frameBodyPng({ cropLeft: true, greebles: 10 }) });
  try {
    const duplicateBody = { ...value.admissionRecord, unitId: "hmf.frame-animation.bastion.slot-122" };
    delete duplicateBody.admissionRecordSha256;
    const duplicate = selfHash(duplicateBody, "admissionRecordSha256");
    const plan = await planFor(value, { comparisonAdmissionRecords: [duplicate] });
    assert.equal(plan.qaReport.status, "failed");
    assert.ok(plan.qaReport.qaEvidence.failureCodes.includes("crop-risk"));
    assert.ok(plan.qaReport.qaEvidence.failureCodes.includes("random-greebles"));
    assert.ok(plan.qaReport.qaEvidence.failureCodes.includes("duplicate-candidate"));
    assert.deepEqual(plan.qaReport.qaEvidence.duplicateComparison.duplicateUnitIds, ["hmf.frame-animation.bastion.slot-122"]);
  } finally {
    await cleanup(value);
  }
});

test("deterministic QA rejects candidate drift and symlinked governed inputs", async () => {
  const drift = await fixture();
  try {
    const candidatePath = path.join(drift.root, ...drift.admissionRecord.targets.candidate.split("/"));
    await writeFile(candidatePath, frameBodyPng({ unsafeTransparentRgb: true }));
    await assert.rejects(planFor(drift), /candidate bytes drifted/);
  } finally {
    await cleanup(drift);
  }
  if (process.platform !== "win32") {
    const linked = await fixture();
    try {
      const candidatePath = path.join(linked.root, ...linked.admissionRecord.targets.candidate.split("/"));
      const moved = `${candidatePath}.real`;
      await writeFile(moved, linked.candidate);
      await rm(candidatePath);
      await symlink(moved, candidatePath);
      await assert.rejects(planFor(linked), /symlinked component/);
    } finally {
      await cleanup(linked);
    }
  }
});
