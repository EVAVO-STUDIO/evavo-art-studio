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
  compileHmfCandidateAdmissionPlan,
  materializeHmfCandidateAdmission,
  verifyHmfCandidateAdmissionRuntime,
} from "./frame-body-candidate-admission.mjs";
import {
  compileHmfProviderRuntimeDispatch,
  compileHmfProviderRuntimeOutcome,
  validateHmfCompiledProviderRuntimeContract,
} from "./frame-body-provider-runtime-dispatch.mjs";
import {
  createHmfProviderSubmissionAuthorization,
  heavyMetalFightingProviderSubmissionManifest,
} from "./frame-body-provider-submission-manifest.mjs";
import { heavyMetalFightingProviderExecutionEnvelope } from "./frame-body-provider-execution-envelope.mjs";
import {
  createHmfProductionReceipt,
  heavyMetalFightingProductionBatchResumePlan,
} from "./work-orders.mjs";

const UNIT_ID = "hmf.frame-animation.bastion.slot-121";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

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
function rgbaPng({ width = 160, height = 160, opaqueCorner = false } = {}) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) raw[y * (rowBytes + 1)] = 0;
  if (width > 1 && height > 1) {
    const centre = Math.floor(height / 2) * (rowBytes + 1) + 1 + Math.floor(width / 2) * 4;
    raw[centre] = 180;
    raw[centre + 1] = 120;
    raw[centre + 2] = 70;
    raw[centre + 3] = 255;
  }
  if (opaqueCorner) raw[4] = 255;
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
function artifactBindings(envelope) {
  return envelope.referenceRequirements.map((requirement) => ({
    unitId: envelope.unitId,
    bindingKey: requirement.bindingKey,
    sourcePath: requirement.sourcePath,
    artifactId: `artifact_${sha256(Buffer.from(`${envelope.unitId}:${requirement.bindingKey}:${requirement.sourcePath}`))}`,
    evidenceSha256: sha256(Buffer.from(`candidate-admission-reference:${envelope.unitId}:${requirement.bindingKey}`)),
    actorClass: "human",
    actorId: "named-human-reviewer",
    occurredAt: "2026-08-13T06:00:00.000Z",
  }));
}
async function authorizedProviderEvidence(candidateArtifactId, evidenceArtifactId) {
  const blocked = await heavyMetalFightingProviderExecutionEnvelope(UNIT_ID);
  const referencesLocked = await createHmfProductionReceipt({
    unitId: UNIT_ID,
    state: "references-locked",
    attempt: 1,
    evidenceSha256: sha256(Buffer.from("candidate-admission-references-locked")),
    actorClass: "agent",
    actorId: "candidate-admission-agent",
    occurredAt: "2026-08-13T06:01:00.000Z",
  });
  const generationAuthorized = await createHmfProductionReceipt({
    unitId: UNIT_ID,
    state: "generation-authorized",
    attempt: 1,
    evidenceSha256: sha256(Buffer.from("candidate-admission-generation-authorized")),
    actorClass: "human",
    actorId: "named-human-reviewer",
    occurredAt: "2026-08-13T06:02:00.000Z",
  }, referencesLocked);
  const receipts = [referencesLocked, generationAuthorized];
  const artifactBindingsInput = artifactBindings(blocked);
  const envelope = await heavyMetalFightingProviderExecutionEnvelope(UNIT_ID, { receipts, artifactBindings: artifactBindingsInput });
  const submissionAuthorization = createHmfProviderSubmissionAuthorization(envelope, {
    actorClass: "human",
    actorId: "named-human-reviewer",
    occurredAt: "2026-08-13T06:03:00.000Z",
    evidenceSha256: sha256(Buffer.from("candidate-admission-provider-submission")),
    reason: "Authorize one exact provider submission for candidate-admission runtime validation.",
  });
  const submissionManifest = await heavyMetalFightingProviderSubmissionManifest(UNIT_ID, {
    receipts,
    artifactBindings: artifactBindingsInput,
    submissionAuthorization,
  });
  const runtimeDispatch = await compileHmfProviderRuntimeDispatch(UNIT_ID, {
    receipts,
    artifactBindings: artifactBindingsInput,
    submissionAuthorization,
  });
  const requestId = `provider_${sha256(Buffer.from(JSON.stringify(runtimeDispatch.providerCompiler.input))).slice(0, 40)}`;
  const request = Object.freeze({ ...runtimeDispatch.providerCompiler.input, protocolVersion: "2026-08-07.3", requestId });
  const compiledPrompt = `EVAVO ART STUDIO — GOVERNED CANDIDATE CONTRACT\n\n${request.creativeIntent}\n`;
  const compiled = Object.freeze({
    schemaVersion: "1.0",
    request,
    requestSha256: sha256(Buffer.from(`normalized:${requestId}`)),
    requiredAdapterCapabilities: Object.freeze(["generate", "reference-images", "identity-reference", "temporal-reference", "native-alpha", "custom-size", "candidate-count"]),
    compiledPrompt,
    compiledPromptSha256: sha256(Buffer.from(compiledPrompt)),
    runtimeJob: Object.freeze({
      queue: "provider",
      kind: "art.candidate.generate",
      idempotencyKey: `provider:${requestId}`,
      payload: request,
      requiredCapabilities: Object.freeze(["provider.generate", "provider.reference-lock", "provider.candidate-store", "evidence.bundle"]),
      requiredCapabilityProfile: Object.freeze(["generate", "reference-images", "identity-reference", "temporal-reference", "native-alpha", "custom-size", "candidate-count"]),
      maximumAttempts: 3,
      leaseDurationMs: 300_000,
      timeoutMs: 1_800_000,
      labels: Object.freeze({ providerRequestId: requestId, candidateFamilyId: request.candidateFamilyId, assetId: request.assetId, continuityPhase: request.continuityPhase }),
    }),
    executionMode: "submit-runtime-job",
  });
  const runtimeBinding = validateHmfCompiledProviderRuntimeContract(runtimeDispatch, compiled);
  const runtimeOutcome = compileHmfProviderRuntimeOutcome(runtimeDispatch, runtimeBinding, {
    kind: "candidate-run-result",
    submissionIdempotencyKey: runtimeBinding.submissionIdempotencyKey,
    providerCallCount: 1,
    completedAt: "2026-08-13T06:04:00.000Z",
    result: {
      schemaVersion: "1.0",
      protocolVersion: "2026-08-07.3",
      requestId: runtimeBinding.normalizedProviderRequestId,
      requestSha256: runtimeBinding.normalizedProviderRequestSha256,
      compiledPromptSha256: runtimeBinding.compiledPromptSha256,
      routingInspection: { outcome: "eligible", providerCallPerformedByInspection: false },
      adapterId: "test-adapter",
      model: "test-model",
      candidateArtifacts: [candidateArtifactId],
      evidenceArtifact: evidenceArtifactId,
      attempts: [{ adapterId: "test-adapter", model: "test-model", startedAt: "2026-08-13T06:03:30.000Z", completedAt: "2026-08-13T06:04:00.000Z", outcome: "succeeded" }],
      requiresAlphaExtraction: false,
    },
  });
  return { submissionManifest, runtimeDispatch, runtimeBinding, runtimeOutcome, receipts };
}
async function fixture({ candidate = rgbaPng(), evidenceObject = { provider: "test-adapter", result: "succeeded" } } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "hmf-candidate-admission-"));
  const providerRoot = await mkdtemp(path.join(os.tmpdir(), "hmf-provider-artifacts-"));
  const candidatePath = path.join(providerRoot, "candidate.png");
  const evidencePath = path.join(providerRoot, "evidence.json");
  const evidence = Buffer.from(`${JSON.stringify(evidenceObject, null, 2)}\n`, "utf8");
  await writeFile(candidatePath, candidate);
  await writeFile(evidencePath, evidence);
  const candidateArtifactId = `artifact_${sha256(candidate)}`;
  const evidenceArtifactId = `artifact_${sha256(evidence)}`;
  const governed = await authorizedProviderEvidence(candidateArtifactId, evidenceArtifactId);
  return {
    root,
    providerRoot,
    candidatePath,
    evidencePath,
    candidate,
    evidence,
    candidateArtifact: { artifactId: candidateArtifactId, sourcePath: candidatePath, mediaType: "image/png" },
    evidenceArtifact: { artifactId: evidenceArtifactId, sourcePath: evidencePath, mediaType: "application/json" },
    ...governed,
  };
}
async function cleanup(value) {
  await rm(value.root, { recursive: true, force: true });
  await rm(value.providerRoot, { recursive: true, force: true });
}

async function planFor(value) {
  return compileHmfCandidateAdmissionPlan({
    submissionManifest: value.submissionManifest,
    runtimeDispatch: value.runtimeDispatch,
    runtimeBinding: value.runtimeBinding,
    runtimeOutcome: value.runtimeOutcome,
    receipts: value.receipts,
    workspaceRoot: value.root,
    candidateArtifact: value.candidateArtifact,
    evidenceArtifact: value.evidenceArtifact,
    occurredAt: "2026-08-13T06:05:00.000Z",
  });
}

test("candidate admission plan binds exact provider bytes, authorized receipt head and system receipt mapping", async () => {
  const value = await fixture();
  try {
    const plan = await planFor(value);
    assert.equal(plan.unitId, UNIT_ID);
    assert.equal(plan.candidateSource.artifactId, value.candidateArtifact.artifactId);
    assert.equal(plan.candidateSource.sha256, sha256(value.candidate));
    assert.equal(plan.evidenceSource.sha256, sha256(value.evidence));
    assert.equal(plan.admissionRecord.png.width, 160);
    assert.equal(plan.admissionRecord.png.height, 160);
    assert.equal(plan.admissionRecord.png.rgba, true);
    assert.deepEqual(plan.admissionRecord.png.cornerAlpha, [0, 0, 0, 0]);
    assert.equal(plan.admissionRecord.runtimeActorMapping.providerOutcomeActorClass, "runtime");
    assert.equal(plan.admissionRecord.runtimeActorMapping.productionReceiptActorClass, "system");
    assert.equal(plan.admissionRecord.receipt.state, "candidates-admitted");
    assert.equal(plan.admissionRecord.receipt.actorClass, "system");
    assert.equal(plan.admissionRecord.receipt.previousReceiptSha256, value.receipts.at(-1).receiptSha256);
    assert.equal(plan.authority.candidateMaterialization, false);
    assert.equal(plan.authority.explicitWriteEnabledRuntimeRequired, true);
  } finally {
    await cleanup(value);
  }
});

test("write-enabled admission materializes one candidate, evidence, record and receipt then becomes idempotent", async () => {
  const value = await fixture();
  try {
    const plan = await planFor(value);
    const first = await materializeHmfCandidateAdmission(plan);
    assert.equal(first.status, "admitted");
    assert.equal(first.currentState, "candidates-admitted");
    assert.equal(first.nextLegalAction, "run-deterministic-qa");
    const candidatePath = path.join(value.root, ...plan.admissionRecord.targets.candidate.split("/"));
    const evidencePath = path.join(value.root, ...plan.admissionRecord.targets.providerEvidence.split("/"));
    const admissionPath = path.join(value.root, ...plan.admissionRecord.targets.admissionRecord.split("/"));
    const receiptPath = path.join(value.root, ...plan.admissionRecord.targets.receiptChain.split("/"));
    assert.deepEqual(await readFile(candidatePath), value.candidate);
    assert.deepEqual(await readFile(evidencePath), value.evidence);
    assert.equal(JSON.parse(await readFile(admissionPath, "utf8")).admissionRecordSha256, plan.admissionRecord.admissionRecordSha256);
    const receiptChain = JSON.parse(await readFile(receiptPath, "utf8"));
    assert.equal(receiptChain.length, 3);
    assert.equal(receiptChain.at(-1).state, "candidates-admitted");
    assert.equal(receiptChain.at(-1).candidateSha256, sha256(value.candidate));
    const resume = await heavyMetalFightingProductionBatchResumePlan(plan.batchId, receiptChain);
    assert.equal(resume.unitStates.find((state) => state.unitId === UNIT_ID).nextAction, "run-deterministic-qa");
    const second = await materializeHmfCandidateAdmission(plan);
    assert.equal(second.status, "already-admitted");
    assert.equal(second.receiptSha256, first.receiptSha256);
  } finally {
    await cleanup(value);
  }
});

test("candidate admission rejects wrong dimensions, opaque corners and content-address drift", async () => {
  const wrongSize = await fixture({ candidate: rgbaPng({ width: 159, height: 160 }) });
  try {
    await assert.rejects(planFor(wrongSize), /exactly 160x160/);
  } finally {
    await cleanup(wrongSize);
  }
  const opaque = await fixture({ candidate: rgbaPng({ opaqueCorner: true }) });
  try {
    await assert.rejects(planFor(opaque), /transparent cell corners/);
  } finally {
    await cleanup(opaque);
  }
  const drifted = await fixture();
  try {
    drifted.candidateArtifact = { ...drifted.candidateArtifact, artifactId: `artifact_${"f".repeat(64)}` };
    await assert.rejects(planFor(drifted), /artifactId drifted|not bound to its actual bytes/);
  } finally {
    await cleanup(drifted);
  }
});

test("candidate admission rejects stale authorization chains and conflicting existing outputs", async () => {
  const stale = await fixture();
  try {
    stale.receipts = [stale.receipts[0]];
    await assert.rejects(planFor(stale), /must end at generation-authorized/);
  } finally {
    await cleanup(stale);
  }
  const conflict = await fixture();
  try {
    const plan = await planFor(conflict);
    const candidatePath = path.join(conflict.root, ...plan.admissionRecord.targets.candidate.split("/"));
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, Buffer.from("conflicting candidate"));
    await assert.rejects(materializeHmfCandidateAdmission(plan), /existing output conflicts/);
  } finally {
    await cleanup(conflict);
  }
});

test("candidate admission rejects symlinked workspace output directories", { skip: process.platform === "win32" }, async () => {
  const value = await fixture();
  const external = await mkdtemp(path.join(os.tmpdir(), "hmf-candidate-admission-external-"));
  try {
    const plan = await planFor(value);
    const scratch = path.join(value.root, "scratch");
    await mkdir(scratch);
    await symlink(external, path.join(scratch, "provider"), "dir");
    await assert.rejects(materializeHmfCandidateAdmission(plan), /not a real directory/);
  } finally {
    await cleanup(value);
    await rm(external, { recursive: true, force: true });
  }
});

test("candidate admission verification remains provider-free, QA-free and promotion-free", async () => {
  const verification = await verifyHmfCandidateAdmissionRuntime();
  assert.equal(verification.status, "passed");
  assert.ok(verification.checks.every((check) => check.passed));
  assert.equal(verification.authority.providerExecution, false);
  assert.equal(verification.authority.candidateMaterialization, false);
  assert.equal(verification.authority.deterministicQa, false);
  assert.equal(verification.authority.candidatePromotion, false);
  assert.equal(verification.authority.targetRepositoryMutation, false);
});
