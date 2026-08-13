import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { deflateSync } from "node:zlib";

import {
  admitHmfProviderCandidate,
  planHmfProviderCandidateAdmission,
  verifyHmfProviderCandidateAdmission,
} from "./frame-body-provider-candidate-admission.mjs";
import {
  HMF_PROVIDER_RUNTIME_BINDING_SCHEMA,
  HMF_PROVIDER_RUNTIME_DISPATCH_SCHEMA,
  HMF_PROVIDER_RUNTIME_OUTCOME_SCHEMA,
  HMF_PROVIDER_RUNTIME_PROTOCOL_VERSION,
} from "./frame-body-provider-runtime-dispatch.mjs";
import {
  createHmfProductionReceipt,
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";

const UNIT_ID = "hmf.frame-animation.bastion.slot-121";
const ARTIFACT_PROTOCOL_VERSION = "2026-07-29.1";
const ADAPTER_ID = "test-adapter";
const MODEL = "test-model";
const REQUEST_ID = `provider_${"1".repeat(40)}`;
const REQUEST_SHA = "2".repeat(64);
const PROMPT_SHA = "3".repeat(64);
const SUBMISSION_KEY = `hmf-provider-submit:${"4".repeat(40)}`;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sorted(value[key])]),
    );
  }
  return value;
}
function recordHash(value) {
  return sha256(`${JSON.stringify(sorted(value), null, 2)}\n`);
}
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
function selfHashed(body, field) {
  return Object.freeze({ ...body, [field]: recordHash(body) });
}
function portableJoin(root, relative) {
  return path.join(root, ...relative.split("/"));
}
function descriptorPath(artifactId) {
  const hex = artifactId.slice("artifact_".length);
  return `descriptors/sha256/${hex.slice(0, 2)}/${hex.slice(2, 4)}/${artifactId}.json`;
}
function objectPath(contentSha) {
  return `objects/sha256/${contentSha.slice(0, 2)}/${contentSha.slice(2, 4)}/${contentSha}`;
}
async function putArtifact(root, bytes, input) {
  const contentSha256 = sha256(bytes);
  const body = {
    schemaVersion: "1.0",
    protocolVersion: ARTIFACT_PROTOCOL_VERSION,
    contentHash: `sha256:${contentSha256}`,
    contentSha256,
    sizeBytes: bytes.byteLength,
    mediaType: input.mediaType,
    storageClass: input.storageClass,
    sourceArtifacts: Object.freeze([...new Set(input.sourceArtifacts ?? [])].sort()),
    labels: input.labels ?? {},
    ...(input.fileName === undefined ? {} : { fileName: input.fileName }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
  const digest = sha256(stableStringify(body));
  const artifactId = `artifact_${digest}`;
  const descriptor = {
    ...body,
    artifactId,
    descriptorSha256: digest,
    objectRelativePath: objectPath(contentSha256),
    descriptorRelativePath: descriptorPath(artifactId),
  };
  const objectTarget = portableJoin(root, descriptor.objectRelativePath);
  const descriptorTarget = portableJoin(root, descriptor.descriptorRelativePath);
  await mkdir(path.dirname(objectTarget), { recursive: true });
  await mkdir(path.dirname(descriptorTarget), { recursive: true });
  await writeFile(objectTarget, bytes);
  await writeFile(descriptorTarget, `${JSON.stringify(descriptor, null, 2)}\n`);
  return descriptor;
}

let crcTable;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, index) => {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      return value >>> 0;
    });
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}
function rgbaPng(width, height) {
  const rowBytes = width * 4;
  const raw = Buffer.alloc(height * (rowBytes + 1));
  const x = Math.floor(width / 2);
  const y = Math.max(0, height - 8);
  const pixel = y * (rowBytes + 1) + 1 + x * 4;
  raw[pixel] = 176;
  raw[pixel + 1] = 184;
  raw[pixel + 2] = 192;
  raw[pixel + 3] = 255;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
function falseAuthority(extra = {}) {
  return Object.freeze({
    candidateMaterialization: false,
    receiptPersistence: false,
    deterministicQa: false,
    creativeReview: false,
    candidateApproval: false,
    candidatePromotion: false,
    providerExecution: false,
    runtimeEnqueue: false,
    targetRepositoryMutation: false,
    gitMutation: false,
    deployment: false,
    publication: false,
    ...extra,
  });
}
function dispatchFor(order) {
  const body = {
    schema: HMF_PROVIDER_RUNTIME_DISPATCH_SCHEMA,
    protocolVersion: HMF_PROVIDER_RUNTIME_PROTOCOL_VERSION,
    projectId: order.projectId,
    publicTitle: order.publicTitle,
    unitId: order.unitId,
    batchId: order.batchId,
    frameId: order.subjectContract.id,
    bodySlot: 121,
    attempt: 1,
    submissionIdempotencyKey: SUBMISSION_KEY,
    candidateAdmission: Object.freeze({
      candidateOutputPath: order.executionPaths.candidatePathTemplate.replace(
        "{candidate:02}",
        "01",
      ),
      expectedMediaType: "image/png",
      expectedWidth: 160,
      expectedHeight: 160,
      expectedCandidateArtifacts: 1,
      expectedEvidenceArtifacts: 1,
      nextReceiptState: "candidates-admitted",
    }),
    authority: falseAuthority({ explicitWriteEnabledRuntimeRequired: true }),
  };
  return selfHashed(body, "runtimeDispatchSha256");
}
function bindingFor(dispatch) {
  const body = {
    schema: HMF_PROVIDER_RUNTIME_BINDING_SCHEMA,
    protocolVersion: HMF_PROVIDER_RUNTIME_PROTOCOL_VERSION,
    unitId: dispatch.unitId,
    batchId: dispatch.batchId,
    frameId: dispatch.frameId,
    bodySlot: dispatch.bodySlot,
    runtimeDispatchSha256: dispatch.runtimeDispatchSha256,
    submissionIdempotencyKey: dispatch.submissionIdempotencyKey,
    normalizedProviderRequestId: REQUEST_ID,
    normalizedProviderRequestSha256: REQUEST_SHA,
    compiledPromptSha256: PROMPT_SHA,
    candidateOutputPath: dispatch.candidateAdmission.candidateOutputPath,
    authority: falseAuthority(),
  };
  return selfHashed(body, "runtimeBindingSha256");
}
function outcomeFor(dispatch, binding, candidateArtifactId, evidenceArtifactId) {
  const body = {
    schema: HMF_PROVIDER_RUNTIME_OUTCOME_SCHEMA,
    protocolVersion: HMF_PROVIDER_RUNTIME_PROTOCOL_VERSION,
    projectId: dispatch.projectId,
    publicTitle: dispatch.publicTitle,
    unitId: dispatch.unitId,
    batchId: dispatch.batchId,
    frameId: dispatch.frameId,
    bodySlot: dispatch.bodySlot,
    attempt: dispatch.attempt,
    runtimeDispatchSha256: dispatch.runtimeDispatchSha256,
    runtimeBindingSha256: binding.runtimeBindingSha256,
    submissionIdempotencyKey: dispatch.submissionIdempotencyKey,
    providerCallCount: 1,
    completedAt: "2026-08-13T06:03:00.000Z",
    result: Object.freeze({
      status: "candidate-admission-ready",
      candidateCount: 1,
      candidateArtifactId,
      evidenceArtifactId,
      adapterId: ADAPTER_ID,
      model: MODEL,
      requiresAlphaExtraction: false,
      candidateMaterialization: Object.freeze({
        sourceArtifactId: candidateArtifactId,
        targetPath: dispatch.candidateAdmission.candidateOutputPath,
        expectedMediaType: "image/png",
        expectedWidth: 160,
        expectedHeight: 160,
        oneImageOnly: true,
      }),
      nextReceiptTemplate: Object.freeze({
        state: "candidates-admitted",
        attempt: dispatch.attempt,
        actorClass: "runtime",
        evidenceArtifactId,
        evidenceSha256Source: "provider-runtime-outcome-sha256",
      }),
    }),
    authority: falseAuthority(),
  };
  return selfHashed(body, "runtimeOutcomeSha256");
}
async function candidateArtifact(root, dispatch, binding, bytes) {
  return putArtifact(root, bytes, {
    mediaType: "image/png",
    storageClass: "intermediate",
    fileName: "hmf-bastion-body-01.png",
    sourceArtifacts: [],
    labels: {
      artifactRole: "provider-candidate",
      approvalState: "unapproved",
      providerAdapter: ADAPTER_ID,
      providerModel: MODEL,
      providerRequestId: binding.normalizedProviderRequestId,
      candidateFamilyId: "hmf:bastion:standing-heavy",
      candidateIndex: "1",
      assetId: dispatch.unitId,
      continuityPhase: "key-pose",
      frameId: dispatch.frameId,
    },
    metadata: {
      schemaVersion: "1.0",
      protocolVersion: "2026-08-07.3",
      finalDeliverable: false,
      requiresMastering: true,
      requiresBlockingQa: true,
      requestSha256: binding.normalizedProviderRequestSha256,
      compiledPromptSha256: binding.compiledPromptSha256,
      adapterVersion: "test-1",
      backgroundStrategy: "native-alpha",
      transparencyTarget: "required",
    },
  });
}
async function evidenceArtifact(root, dispatch, binding, candidate) {
  const evidence = {
    schemaVersion: "1.0",
    protocolVersion: "2026-08-07.3",
    requestId: binding.normalizedProviderRequestId,
    requestSha256: binding.normalizedProviderRequestSha256,
    compiledPromptSha256: binding.compiledPromptSha256,
    routingInspection: {
      outcome: "eligible",
      providerCallPerformedByInspection: false,
    },
    selection: {
      adapter: { id: ADAPTER_ID },
      model: MODEL,
    },
    attempts: [
      {
        adapterId: ADAPTER_ID,
        model: MODEL,
        startedAt: "2026-08-13T06:01:00.000Z",
        completedAt: "2026-08-13T06:03:00.000Z",
        outcome: "succeeded",
      },
    ],
    candidateArtifacts: [candidate.artifactId],
    requiresAlphaExtraction: false,
    outcome: "candidate-produced",
    completedAt: "2026-08-13T06:03:00.000Z",
  };
  return putArtifact(
    root,
    Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, "utf8"),
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: `${binding.normalizedProviderRequestId}.provider-evidence.json`,
      sourceArtifacts: [candidate.artifactId],
      labels: {
        artifactRole: "provider-candidate-evidence",
        providerRequestId: binding.normalizedProviderRequestId,
        candidateFamilyId: "hmf:bastion:standing-heavy",
        assetId: dispatch.unitId,
        outcome: "candidate-produced",
      },
      metadata: {
        requestSha256: binding.normalizedProviderRequestSha256,
        compiledPromptSha256: binding.compiledPromptSha256,
        routingOutcome: "eligible",
        attemptCount: 1,
        candidateCount: 1,
      },
    },
  );
}

let fixture;
before(async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hmf-candidate-admission-"));
  const artifactRoot = path.join(root, "artifacts");
  await mkdir(artifactRoot);
  const order = await heavyMetalFightingProductionWorkOrder(UNIT_ID);
  const referencesLocked = await createHmfProductionReceipt({
    unitId: UNIT_ID,
    state: "references-locked",
    attempt: 1,
    evidenceSha256: "5".repeat(64),
    actorClass: "agent",
    actorId: "candidate-admission-test",
    occurredAt: "2026-08-13T06:00:00.000Z",
  });
  const generationAuthorized = await createHmfProductionReceipt(
    {
      unitId: UNIT_ID,
      state: "generation-authorized",
      attempt: 1,
      evidenceSha256: "6".repeat(64),
      actorClass: "human",
      actorId: "named-human-reviewer",
      occurredAt: "2026-08-13T06:00:30.000Z",
    },
    referencesLocked,
  );
  const dispatch = dispatchFor(order);
  const binding = bindingFor(dispatch);
  const candidate = await candidateArtifact(
    artifactRoot,
    dispatch,
    binding,
    rgbaPng(160, 160),
  );
  const evidence = await evidenceArtifact(artifactRoot, dispatch, binding, candidate);
  fixture = {
    root,
    artifactRoot,
    order,
    receipts: [referencesLocked, generationAuthorized],
    dispatch,
    binding,
    candidate,
    evidence,
    outcome: outcomeFor(dispatch, binding, candidate.artifactId, evidence.artifactId),
  };
});
after(async () => {
  if (fixture?.root) await rm(fixture.root, { recursive: true, force: true });
});

function admissionOptions(overrides = {}) {
  return {
    receipts: fixture.receipts,
    artifactStoreRoot: fixture.artifactRoot,
    actorId: "provider-runtime:test-adapter",
    occurredAt: "2026-08-13T06:04:00.000Z",
    ...overrides,
  };
}

test("candidate admission plan validates immutable artifacts and receipt progression without writing", async () => {
  const plan = await planHmfProviderCandidateAdmission(
    fixture.dispatch,
    fixture.binding,
    fixture.outcome,
    admissionOptions(),
  );
  assert.equal(plan.status, "ready-for-explicit-materialization");
  assert.equal(plan.candidateArtifact.artifactId, fixture.candidate.artifactId);
  assert.equal(plan.evidenceArtifact.artifactId, fixture.evidence.artifactId);
  assert.deepEqual(
    { width: plan.image.width, height: plan.image.height, colourType: plan.image.colourType },
    { width: 160, height: 160, colourType: 6 },
  );
  assert.equal(plan.image.structuralValidationOnly, true);
  assert.equal(plan.image.deterministicQaPassed, false);
  assert.equal(plan.receiptActor.sourceRuntimeClass, "runtime");
  assert.equal(plan.receiptActor.canonicalActorClass, "agent");
  assert.equal(plan.receiptChain.receipts.at(-1).state, "candidates-admitted");
  assert.equal(plan.receiptChain.receipts.at(-1).actorClass, "agent");
  assert.equal(plan.authority.candidateMaterialization, false);
  assert.equal(plan.authority.receiptPersistence, false);
  assert.match(plan.admissionPlanSha256, /^[0-9a-f]{64}$/);

  const verification = await verifyHmfProviderCandidateAdmission();
  assert.equal(verification.status, "passed");
  assert.ok(verification.checks.every((check) => check.passed));
});

test("explicit write-enabled admission creates candidate first, persists the receipt bundle, and replays idempotently", async () => {
  const workspaceRoot = path.join(fixture.root, "workspace-success");
  await mkdir(workspaceRoot);
  await assert.rejects(
    admitHmfProviderCandidate(
      fixture.dispatch,
      fixture.binding,
      fixture.outcome,
      admissionOptions({ workspaceRoot }),
    ),
    /requires writeEnabled true/,
  );

  const first = await admitHmfProviderCandidate(
    fixture.dispatch,
    fixture.binding,
    fixture.outcome,
    admissionOptions({ workspaceRoot, writeEnabled: true }),
  );
  assert.equal(first.status, "candidate-admitted");
  assert.deepEqual(first.writes, { candidate: "created", receiptBundle: "created" });
  assert.equal(first.authority.candidateMaterialization, true);
  assert.equal(first.authority.receiptPersistence, true);
  assert.equal(first.authority.deterministicQa, false);
  assert.equal(first.authority.candidateApproval, false);

  const candidateBytes = await readFile(portableJoin(workspaceRoot, first.candidateRelativePath));
  assert.equal(sha256(candidateBytes), fixture.candidate.contentSha256);
  const bundle = JSON.parse(
    await readFile(portableJoin(workspaceRoot, first.receiptRelativePath), "utf8"),
  );
  assert.equal(bundle.headReceiptSha256, first.headReceiptSha256);
  assert.equal(bundle.candidateSha256, fixture.candidate.contentSha256);
  assert.equal(bundle.receipts.at(-1).state, "candidates-admitted");
  assert.equal(bundle.receipts.at(-1).actorClass, "agent");
  assert.equal(bundle.receipts.at(-1).evidenceSha256, fixture.outcome.runtimeOutcomeSha256);
  assert.equal(bundle.authority.deterministicQa, false);

  const resume = await heavyMetalFightingProductionBatchResumePlan(
    fixture.order.batchId,
    bundle.receipts,
  );
  const state = resume.unitStates.find((entry) => entry.unitId === UNIT_ID);
  assert.equal(state.currentState, "candidates-admitted");
  assert.equal(state.nextAction, "run-deterministic-qa");

  const replay = await admitHmfProviderCandidate(
    fixture.dispatch,
    fixture.binding,
    fixture.outcome,
    admissionOptions({ workspaceRoot, writeEnabled: true }),
  );
  assert.deepEqual(replay.writes, { candidate: "reused", receiptBundle: "reused" });
  assert.equal(replay.admissionPlanSha256, first.admissionPlanSha256);
  assert.equal(replay.receiptBundleSha256, first.receiptBundleSha256);
});

test("candidate admission fails closed on provider failure, invalid native geometry and pre-existing byte conflicts", async () => {
  const failureBody = {
    ...fixture.outcome,
    result: {
      status: "provider-failure-record-ready",
      candidateCount: 0,
      failure: {
        code: "PROVIDER_TIMEOUT",
        classification: "transient",
        message: "Timed out.",
        attemptCount: 1,
      },
    },
  };
  delete failureBody.runtimeOutcomeSha256;
  const failure = selfHashed(failureBody, "runtimeOutcomeSha256");
  await assert.rejects(
    planHmfProviderCandidateAdmission(
      fixture.dispatch,
      fixture.binding,
      failure,
      admissionOptions(),
    ),
    /not a successful candidate admission/,
  );

  const wrongCandidate = await candidateArtifact(
    fixture.artifactRoot,
    fixture.dispatch,
    fixture.binding,
    rgbaPng(32, 32),
  );
  const wrongEvidence = await evidenceArtifact(
    fixture.artifactRoot,
    fixture.dispatch,
    fixture.binding,
    wrongCandidate,
  );
  const wrongOutcome = outcomeFor(
    fixture.dispatch,
    fixture.binding,
    wrongCandidate.artifactId,
    wrongEvidence.artifactId,
  );
  await assert.rejects(
    planHmfProviderCandidateAdmission(
      fixture.dispatch,
      fixture.binding,
      wrongOutcome,
      admissionOptions(),
    ),
    /must be exactly 160x160/,
  );

  const workspaceRoot = path.join(fixture.root, "workspace-conflict");
  await mkdir(workspaceRoot);
  const target = portableJoin(
    workspaceRoot,
    fixture.dispatch.candidateAdmission.candidateOutputPath,
  );
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from("wrong-candidate-bytes"));
  await assert.rejects(
    admitHmfProviderCandidate(
      fixture.dispatch,
      fixture.binding,
      fixture.outcome,
      admissionOptions({ workspaceRoot, writeEnabled: true }),
    ),
    /already exists with different bytes/,
  );
  await assert.rejects(
    access(portableJoin(workspaceRoot, fixture.order.executionPaths.receiptPath)),
  );
});
