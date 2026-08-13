import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";

import {
  HMF_PROVIDER_RUNTIME_BINDING_SCHEMA,
  HMF_PROVIDER_RUNTIME_DISPATCH_SCHEMA,
  HMF_PROVIDER_RUNTIME_OUTCOME_SCHEMA,
  HMF_PROVIDER_RUNTIME_PROTOCOL_VERSION,
} from "./frame-body-provider-runtime-dispatch.mjs";
import {
  HMF_PROVIDER_SUBMISSION_MANIFEST_SCHEMA,
  HMF_PROVIDER_SUBMISSION_PROTOCOL_VERSION,
} from "./frame-body-provider-submission-manifest.mjs";
import {
  createHmfProductionReceipt,
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";

export const HMF_CANDIDATE_ADMISSION_PLAN_SCHEMA = "evavo.heavy-metal-fighting-candidate-admission-plan.v1";
export const HMF_CANDIDATE_ADMISSION_RECORD_SCHEMA = "evavo.heavy-metal-fighting-candidate-admission-record.v1";
export const HMF_CANDIDATE_ADMISSION_RESULT_SCHEMA = "evavo.heavy-metal-fighting-candidate-admission-result.v1";
export const HMF_CANDIDATE_ADMISSION_PROTOCOL_VERSION = "2026-08-13.1";

const SHA256 = /^[0-9a-f]{64}$/u;
const ARTIFACT_ID = /^artifact_([0-9a-f]{64})$/u;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAXIMUM_CANDIDATE_BYTES = 16 * 1024 * 1024;
const MAXIMUM_EVIDENCE_BYTES = 4 * 1024 * 1024;
const RUNTIME_ACTOR_MAPPING = Object.freeze({
  providerOutcomeActorClass: "runtime",
  productionReceiptActorClass: "system",
  productionReceiptActorId: "hmf-provider-runtime",
  reason: "The provider outcome uses runtime as a semantic producer class; the production receipt state machine persists governed automation as system while reserving human for explicit approval gates.",
});

function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_CANDIDATE_ADMISSION_INVALID: ${message}`);
}
function assert(condition, message) {
  if (!condition) fail(message);
}
function freeze(value) {
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return value;
  if (Array.isArray(value)) value.forEach(freeze);
  else if (value && typeof value === "object") Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
  }
  return value;
}
function canonical(value) {
  return `${JSON.stringify(sorted(value), null, 2)}\n`;
}
function hashBytes(value) {
  return createHash("sha256").update(value).digest("hex");
}
function hashValue(value) {
  return hashBytes(Buffer.from(typeof value === "string" ? value : canonical(value), "utf8"));
}
function canonicalTimestamp(value, label) {
  assert(typeof value === "string" && value.trim() === value, `${label} must be a canonical UTC timestamp.`);
  const milliseconds = Date.parse(value);
  assert(Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value, `${label} must be a canonical UTC timestamp.`);
  return value;
}
function selfHashed(value, field, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assert(SHA256.test(String(value[field] ?? "")), `${label}.${field} must be a SHA-256.`);
  const body = { ...value };
  delete body[field];
  assert(value[field] === hashValue(body), `${label}.${field} does not match canonical content.`);
  return value;
}
function falseAuthority(authority, label) {
  assert(authority && typeof authority === "object", `${label} authority is missing.`);
  for (const key of [
    "deterministicQa",
    "creativeReview",
    "candidateApproval",
    "candidatePromotion",
    "targetRepositoryMutation",
    "gitMutation",
    "deployment",
    "publication",
  ]) {
    assert(authority[key] === false, `${label} gained prohibited ${key} authority.`);
  }
}
function safeRelativePath(value, label) {
  assert(typeof value === "string" && value.trim() === value && value.length > 0, `${label} must be a non-empty relative path.`);
  assert(!value.includes("\\") && !path.posix.isAbsolute(value), `${label} must be a POSIX relative path.`);
  const segments = value.split("/");
  assert(segments.every((segment) => segment && segment !== "." && segment !== ".."), `${label} contains an unsafe segment.`);
  return value;
}
function pathWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
async function stableFile(filePath, label, maximumBytes) {
  const absolute = path.resolve(String(filePath ?? ""));
  const before = await lstat(absolute).catch(() => null);
  assert(before?.isFile() && !before.isSymbolicLink(), `${label} must be an existing regular non-symlink file.`);
  assert(before.size >= 1 && before.size <= maximumBytes, `${label} exceeds its byte limit.`);
  const bytes = await readFile(absolute);
  const after = await lstat(absolute);
  assert(
    before.dev === after.dev
      && before.ino === after.ino
      && before.size === after.size
      && before.mtimeMs === after.mtimeMs,
    `${label} changed while being read.`,
  );
  return freeze({ path: absolute, bytes, size: bytes.length, sha256: hashBytes(bytes) });
}
function validateArtifactDescriptor(input, expectedArtifactId, expectedMediaType, label) {
  assert(input && typeof input === "object" && !Array.isArray(input), `${label} descriptor must be an object.`);
  assert(Object.keys(input).sort().join("|") === ["artifactId", "mediaType", "sourcePath"].sort().join("|"), `${label} descriptor fields are closed.`);
  assert(input.artifactId === expectedArtifactId && ARTIFACT_ID.test(input.artifactId), `${label} artifactId drifted from the provider outcome.`);
  assert(input.mediaType === expectedMediaType, `${label} mediaType must be ${expectedMediaType}.`);
  assert(typeof input.sourcePath === "string" && input.sourcePath.trim(), `${label} sourcePath is required.`);
  return input;
}
function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upLeft;
}
function inspectRgbaPng(bytes) {
  assert(Buffer.isBuffer(bytes) && bytes.length >= 45, "candidate artifact is not a complete PNG.");
  assert(bytes.subarray(0, 8).equals(PNG_SIGNATURE), "candidate artifact lacks the PNG signature.");
  let offset = 8;
  let ihdr = null;
  const idat = [];
  let sawIend = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    assert(dataEnd + 4 <= bytes.length, `candidate PNG chunk ${type} is truncated.`);
    const data = bytes.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      assert(ihdr === null && length === 13, "candidate PNG must contain one valid IHDR chunk.");
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      assert(length === 0, "candidate PNG IEND chunk is malformed.");
      sawIend = true;
      offset = dataEnd + 4;
      break;
    }
    offset = dataEnd + 4;
  }
  assert(ihdr && sawIend && idat.length >= 1, "candidate PNG is missing IHDR, IDAT, or IEND data.");
  assert(offset === bytes.length, "candidate PNG contains trailing bytes after IEND.");
  assert(ihdr.width === 160 && ihdr.height === 160, "candidate PNG must be exactly 160x160.");
  assert(ihdr.bitDepth === 8 && ihdr.colorType === 6, "candidate PNG must be 8-bit RGBA.");
  assert(ihdr.compression === 0 && ihdr.filter === 0 && ihdr.interlace === 0, "candidate PNG must use standard non-interlaced encoding.");
  const rowBytes = ihdr.width * 4;
  const inflated = inflateSync(Buffer.concat(idat));
  assert(inflated.length === (rowBytes + 1) * ihdr.height, "candidate PNG decoded byte length is invalid.");
  const pixels = Buffer.alloc(rowBytes * ihdr.height);
  for (let y = 0; y < ihdr.height; y += 1) {
    const filterType = inflated[y * (rowBytes + 1)];
    assert(filterType >= 0 && filterType <= 4, `candidate PNG row ${y} uses unsupported filter ${filterType}.`);
    const encoded = inflated.subarray(y * (rowBytes + 1) + 1, (y + 1) * (rowBytes + 1));
    const decodedOffset = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= 4 ? pixels[decodedOffset + x - 4] : 0;
      const up = y > 0 ? pixels[decodedOffset - rowBytes + x] : 0;
      const upLeft = y > 0 && x >= 4 ? pixels[decodedOffset - rowBytes + x - 4] : 0;
      let value = encoded[x];
      if (filterType === 1) value = (value + left) & 0xff;
      else if (filterType === 2) value = (value + up) & 0xff;
      else if (filterType === 3) value = (value + Math.floor((left + up) / 2)) & 0xff;
      else if (filterType === 4) value = (value + paeth(left, up, upLeft)) & 0xff;
      pixels[decodedOffset + x] = value;
    }
  }
  const alphaAt = (x, y) => pixels[y * rowBytes + x * 4 + 3];
  const cornerAlpha = freeze([
    alphaAt(0, 0),
    alphaAt(159, 0),
    alphaAt(0, 159),
    alphaAt(159, 159),
  ]);
  assert(cornerAlpha.every((alpha) => alpha === 0), "candidate PNG must retain transparent cell corners.");
  return freeze({
    width: ihdr.width,
    height: ihdr.height,
    bitDepth: ihdr.bitDepth,
    colorType: ihdr.colorType,
    rgba: true,
    alphaRequired: true,
    cornerAlpha,
    decodedBytes: pixels.length,
  });
}
function validateDispatchChain(submissionManifest, dispatch, binding, outcome) {
  assert(submissionManifest?.schema === HMF_PROVIDER_SUBMISSION_MANIFEST_SCHEMA, "provider submission manifest schema drifted.");
  assert(submissionManifest.protocolVersion === HMF_PROVIDER_SUBMISSION_PROTOCOL_VERSION, "provider submission manifest protocol drifted.");
  selfHashed(submissionManifest, "submissionManifestSha256", "provider submission manifest");
  assert(submissionManifest.status === "authorized-for-explicit-runtime-submission", "provider submission manifest is not authorized.");
  const instruction = selfHashed(submissionManifest.runtimeSubmissionInstruction, "runtimeSubmissionInstructionSha256", "provider runtime submission instruction");
  assert(SHA256.test(String(instruction.generationAuthorizationReceiptSha256 ?? "")), "provider submission manifest lacks the generation-authorization receipt head.");

  assert(dispatch?.schema === HMF_PROVIDER_RUNTIME_DISPATCH_SCHEMA && dispatch.protocolVersion === HMF_PROVIDER_RUNTIME_PROTOCOL_VERSION, "provider runtime dispatch schema or protocol drifted.");
  selfHashed(dispatch, "runtimeDispatchSha256", "provider runtime dispatch");
  assert(dispatch.submissionManifestSha256 === submissionManifest.submissionManifestSha256, "provider runtime dispatch is bound to another submission manifest.");
  assert(dispatch.runtimeSubmissionInstructionSha256 === instruction.runtimeSubmissionInstructionSha256, "provider runtime instruction hash drifted.");

  assert(binding?.schema === HMF_PROVIDER_RUNTIME_BINDING_SCHEMA && binding.protocolVersion === HMF_PROVIDER_RUNTIME_PROTOCOL_VERSION, "provider runtime binding schema or protocol drifted.");
  selfHashed(binding, "runtimeBindingSha256", "provider runtime binding");
  assert(binding.runtimeDispatchSha256 === dispatch.runtimeDispatchSha256, "provider runtime binding is bound to another dispatch.");

  assert(outcome?.schema === HMF_PROVIDER_RUNTIME_OUTCOME_SCHEMA && outcome.protocolVersion === HMF_PROVIDER_RUNTIME_PROTOCOL_VERSION, "provider runtime outcome schema or protocol drifted.");
  selfHashed(outcome, "runtimeOutcomeSha256", "provider runtime outcome");
  assert(outcome.runtimeDispatchSha256 === dispatch.runtimeDispatchSha256 && outcome.runtimeBindingSha256 === binding.runtimeBindingSha256, "provider runtime outcome is bound to another dispatch or binding.");
  assert(outcome.result?.status === "candidate-admission-ready" && outcome.result.candidateCount === 1, "provider runtime outcome is not ready for one candidate admission.");
  assert(outcome.result.requiresAlphaExtraction === false, "candidate requiring alpha extraction cannot enter the final Frame body pipeline.");
  assert(outcome.result.nextReceiptTemplate?.state === "candidates-admitted" && outcome.result.nextReceiptTemplate?.actorClass === "runtime", "provider runtime outcome receipt template drifted.");
  assert(outcome.result.candidateMaterialization?.oneImageOnly === true, "provider runtime outcome lost one-image-only materialization.");
  assert(outcome.result.candidateMaterialization?.targetPath === dispatch.candidateAdmission?.candidateOutputPath, "candidate target path drifted between dispatch and outcome.");
  falseAuthority(outcome.authority, "provider runtime outcome");
  return freeze({ instruction });
}
async function workspaceRoot(value) {
  const resolved = path.resolve(String(value ?? ""));
  assert(resolved && resolved !== path.parse(resolved).root, "workspaceRoot must identify a specific persistent Artist Workspace.");
  const info = await lstat(resolved).catch(() => null);
  assert(info?.isDirectory() && !info.isSymbolicLink(), "workspaceRoot must be an existing non-symlink directory.");
  return realpath(resolved);
}
function sidecarPath(candidatePath, suffix) {
  assert(candidatePath.endsWith(".png"), "candidate path must end in .png.");
  return `${candidatePath.slice(0, -4)}${suffix}`;
}

export async function compileHmfCandidateAdmissionPlan({
  submissionManifest,
  runtimeDispatch,
  runtimeBinding,
  runtimeOutcome,
  receipts = [],
  workspaceRoot: workspaceRootInput,
  candidateArtifact,
  evidenceArtifact,
  occurredAt = new Date().toISOString(),
} = {}) {
  assert(Array.isArray(receipts), "receipts must be an array.");
  const { instruction } = validateDispatchChain(submissionManifest, runtimeDispatch, runtimeBinding, runtimeOutcome);
  const order = await heavyMetalFightingProductionWorkOrder(runtimeOutcome.unitId);
  assert(order.batchId === runtimeOutcome.batchId && order.subjectId === runtimeOutcome.frameId, "provider runtime outcome identity drifted from the immutable work order.");
  const resume = await heavyMetalFightingProductionBatchResumePlan(order.batchId, receipts);
  const unitState = resume.unitStates.find((state) => state.unitId === order.unitId);
  assert(unitState?.currentState === "generation-authorized", `${order.unitId} receipt chain must end at generation-authorized before candidate admission.`);
  assert(unitState.currentAttempt === runtimeOutcome.attempt, `${order.unitId} receipt attempt drifted from the provider outcome.`);
  assert(unitState.headReceiptSha256 === instruction.generationAuthorizationReceiptSha256, `${order.unitId} generation-authorization receipt head differs from the authorized provider submission.`);
  const previousReceipt = receipts.find((receipt) => receipt.receiptSha256 === unitState.headReceiptSha256);
  assert(previousReceipt, `${order.unitId} generation-authorization head receipt is missing from the supplied chain.`);

  validateArtifactDescriptor(candidateArtifact, runtimeOutcome.result.candidateArtifactId, "image/png", "candidate artifact");
  validateArtifactDescriptor(evidenceArtifact, runtimeOutcome.result.evidenceArtifactId, "application/json", "provider evidence artifact");
  const [candidateSource, evidenceSource, workspace] = await Promise.all([
    stableFile(candidateArtifact.sourcePath, "candidate artifact", MAXIMUM_CANDIDATE_BYTES),
    stableFile(evidenceArtifact.sourcePath, "provider evidence artifact", MAXIMUM_EVIDENCE_BYTES),
    workspaceRoot(workspaceRootInput),
  ]);
  assert(candidateArtifact.artifactId === `artifact_${candidateSource.sha256}`, "candidate artifact ID is not bound to its actual bytes.");
  assert(evidenceArtifact.artifactId === `artifact_${evidenceSource.sha256}`, "provider evidence artifact ID is not bound to its actual bytes.");
  const png = inspectRgbaPng(candidateSource.bytes);
  let providerEvidence;
  try {
    providerEvidence = JSON.parse(evidenceSource.bytes.toString("utf8"));
  } catch (error) {
    fail(`provider evidence artifact is not valid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(providerEvidence && typeof providerEvidence === "object" && !Array.isArray(providerEvidence), "provider evidence artifact must contain a JSON object.");

  const candidateTargetPath = safeRelativePath(runtimeOutcome.result.candidateMaterialization.targetPath, "candidate target path");
  const expectedCandidatePath = order.executionPaths.candidatePathTemplate.replace("{candidate:02}", "01");
  assert(candidateTargetPath === expectedCandidatePath, `${order.unitId} candidate target path drifted from the immutable work order.`);
  const providerEvidenceTargetPath = sidecarPath(candidateTargetPath, ".provider-evidence.json");
  const admissionRecordTargetPath = sidecarPath(candidateTargetPath, ".candidate-admission.json");
  const receiptTargetPath = safeRelativePath(order.executionPaths.receiptPath, "receipt target path");
  const occurred = canonicalTimestamp(occurredAt, "candidate admission occurredAt");
  const candidateReceipt = await createHmfProductionReceipt({
    unitId: order.unitId,
    state: "candidates-admitted",
    attempt: runtimeOutcome.attempt,
    evidenceSha256: runtimeOutcome.runtimeOutcomeSha256,
    candidateSha256: candidateSource.sha256,
    actorClass: RUNTIME_ACTOR_MAPPING.productionReceiptActorClass,
    actorId: RUNTIME_ACTOR_MAPPING.productionReceiptActorId,
    occurredAt: occurred,
  }, previousReceipt);

  const admissionBody = {
    schema: HMF_CANDIDATE_ADMISSION_RECORD_SCHEMA,
    protocolVersion: HMF_CANDIDATE_ADMISSION_PROTOCOL_VERSION,
    projectId: runtimeOutcome.projectId,
    publicTitle: runtimeOutcome.publicTitle,
    unitId: order.unitId,
    batchId: order.batchId,
    frameId: runtimeOutcome.frameId,
    bodySlot: runtimeOutcome.bodySlot,
    attempt: runtimeOutcome.attempt,
    workOrderSha256: order.workOrderSha256,
    submissionManifestSha256: submissionManifest.submissionManifestSha256,
    runtimeDispatchSha256: runtimeDispatch.runtimeDispatchSha256,
    runtimeBindingSha256: runtimeBinding.runtimeBindingSha256,
    runtimeOutcomeSha256: runtimeOutcome.runtimeOutcomeSha256,
    submissionIdempotencyKey: runtimeOutcome.submissionIdempotencyKey,
    adapterId: runtimeOutcome.result.adapterId,
    model: runtimeOutcome.result.model,
    candidateArtifactId: candidateArtifact.artifactId,
    candidateSha256: candidateSource.sha256,
    candidateBytes: candidateSource.size,
    providerEvidenceArtifactId: evidenceArtifact.artifactId,
    providerEvidenceSha256: evidenceSource.sha256,
    providerEvidenceBytes: evidenceSource.size,
    png,
    targets: freeze({
      candidate: candidateTargetPath,
      providerEvidence: providerEvidenceTargetPath,
      admissionRecord: admissionRecordTargetPath,
      receiptChain: receiptTargetPath,
    }),
    runtimeActorMapping: RUNTIME_ACTOR_MAPPING,
    receipt: candidateReceipt,
    occurredAt: occurred,
    nextLegalAction: "run-deterministic-qa",
    authority: freeze({
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
    }),
  };
  const admissionRecord = freeze({ ...admissionBody, admissionRecordSha256: hashValue(admissionBody) });
  const withoutHash = {
    schema: HMF_CANDIDATE_ADMISSION_PLAN_SCHEMA,
    protocolVersion: HMF_CANDIDATE_ADMISSION_PROTOCOL_VERSION,
    projectId: runtimeOutcome.projectId,
    unitId: order.unitId,
    batchId: order.batchId,
    frameId: runtimeOutcome.frameId,
    bodySlot: runtimeOutcome.bodySlot,
    attempt: runtimeOutcome.attempt,
    workspaceRoot: workspace,
    workOrderSha256: order.workOrderSha256,
    candidateSource: freeze({ artifactId: candidateArtifact.artifactId, path: candidateSource.path, sha256: candidateSource.sha256, bytes: candidateSource.size, mediaType: "image/png" }),
    evidenceSource: freeze({ artifactId: evidenceArtifact.artifactId, path: evidenceSource.path, sha256: evidenceSource.sha256, bytes: evidenceSource.size, mediaType: "application/json" }),
    previousReceipts: freeze(receipts),
    admissionRecord,
    authority: freeze({
      planCompilation: true,
      candidateMaterialization: false,
      receiptPersistence: false,
      deterministicQa: false,
      creativeReview: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      explicitWriteEnabledRuntimeRequired: true,
    }),
  };
  return freeze({ ...withoutHash, candidateAdmissionPlanSha256: hashValue(withoutHash) });
}

async function ensureDirectory(root, relativeDirectory) {
  const safe = safeRelativePath(relativeDirectory, "workspace directory path");
  let current = root;
  for (const segment of safe.split("/")) {
    current = path.join(current, segment);
    const info = await lstat(current).catch(() => null);
    if (!info) {
      await mkdir(current);
      continue;
    }
    assert(info.isDirectory() && !info.isSymbolicLink(), `workspace directory component is not a real directory: ${current}`);
  }
  const resolved = await realpath(current);
  assert(pathWithin(root, resolved), `workspace directory escaped the persistent workspace: ${resolved}`);
  return resolved;
}
async function inspectExisting(filePath) {
  const info = await lstat(filePath).catch(() => null);
  if (!info) return null;
  assert(info.isFile() && !info.isSymbolicLink(), `existing output is not a regular non-symlink file: ${filePath}`);
  const bytes = await readFile(filePath);
  return freeze({ bytes, sha256: hashBytes(bytes), size: bytes.length });
}
async function writeExactOrReuse(filePath, bytes, expectedSha256) {
  const existing = await inspectExisting(filePath);
  if (existing) {
    assert(existing.sha256 === expectedSha256 && existing.size === bytes.length, `existing output conflicts with the governed admission plan: ${filePath}`);
    return "reused";
  }
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
  try {
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return "created";
}
async function writeReceiptChain(filePath, previousReceipts, receipt) {
  const expectedPrevious = canonical(previousReceipts);
  const nextChain = freeze([...previousReceipts, receipt]);
  const expectedNext = canonical(nextChain);
  const existing = await inspectExisting(filePath);
  if (existing) {
    const text = existing.bytes.toString("utf8");
    if (text === expectedNext) return freeze({ status: "reused", chain: nextChain });
    assert(text === expectedPrevious, "persisted receipt chain differs from the supplied validated predecessor chain.");
    const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await writeFile(temporary, expectedNext, { flag: "wx", mode: 0o600 });
    try {
      await rename(temporary, filePath);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    return freeze({ status: "advanced", chain: nextChain });
  }
  await writeFile(filePath, expectedNext, { flag: "wx", mode: 0o600 });
  return freeze({ status: "created", chain: nextChain });
}

export async function materializeHmfCandidateAdmission(planInput) {
  const plan = selfHashed(planInput, "candidateAdmissionPlanSha256", "candidate admission plan");
  assert(plan.schema === HMF_CANDIDATE_ADMISSION_PLAN_SCHEMA && plan.protocolVersion === HMF_CANDIDATE_ADMISSION_PROTOCOL_VERSION, "candidate admission plan schema or protocol drifted.");
  assert(plan.authority?.explicitWriteEnabledRuntimeRequired === true && plan.authority?.candidateMaterialization === false, "candidate admission plan lost the explicit write-enabled boundary.");
  const currentOrder = await heavyMetalFightingProductionWorkOrder(plan.unitId);
  assert(currentOrder.workOrderSha256 === plan.workOrderSha256, "candidate admission plan is stale against the immutable work order.");
  const root = await workspaceRoot(plan.workspaceRoot);
  const [candidateSource, evidenceSource] = await Promise.all([
    stableFile(plan.candidateSource.path, "candidate artifact", MAXIMUM_CANDIDATE_BYTES),
    stableFile(plan.evidenceSource.path, "provider evidence artifact", MAXIMUM_EVIDENCE_BYTES),
  ]);
  assert(candidateSource.sha256 === plan.candidateSource.sha256 && candidateSource.size === plan.candidateSource.bytes, "candidate artifact changed after plan compilation.");
  assert(evidenceSource.sha256 === plan.evidenceSource.sha256 && evidenceSource.size === plan.evidenceSource.bytes, "provider evidence artifact changed after plan compilation.");
  inspectRgbaPng(candidateSource.bytes);
  JSON.parse(evidenceSource.bytes.toString("utf8"));

  const targets = plan.admissionRecord.targets;
  for (const target of Object.values(targets)) safeRelativePath(target, "candidate admission output path");
  const candidateDirectory = await ensureDirectory(root, path.posix.dirname(targets.candidate));
  const receiptDirectory = await ensureDirectory(root, path.posix.dirname(targets.receiptChain));
  const absolute = (relative) => {
    const resolved = path.resolve(root, ...relative.split("/"));
    assert(pathWithin(root, resolved), `candidate admission output escaped the workspace: ${relative}`);
    return resolved;
  };
  const candidatePath = absolute(targets.candidate);
  const evidencePath = absolute(targets.providerEvidence);
  const admissionPath = absolute(targets.admissionRecord);
  const receiptPath = absolute(targets.receiptChain);
  assert(path.dirname(candidatePath) === candidateDirectory && path.dirname(evidencePath) === candidateDirectory && path.dirname(admissionPath) === candidateDirectory, "candidate sidecar paths are not colocated in the governed candidate directory.");
  assert(path.dirname(receiptPath) === receiptDirectory, "receipt path escaped the governed receipt directory.");

  const admissionBytes = Buffer.from(canonical(plan.admissionRecord), "utf8");
  const candidateStatus = await writeExactOrReuse(candidatePath, candidateSource.bytes, candidateSource.sha256);
  const evidenceStatus = await writeExactOrReuse(evidencePath, evidenceSource.bytes, evidenceSource.sha256);
  const admissionStatus = await writeExactOrReuse(admissionPath, admissionBytes, hashBytes(admissionBytes));
  const receiptStatus = await writeReceiptChain(receiptPath, plan.previousReceipts, plan.admissionRecord.receipt);
  const resume = await heavyMetalFightingProductionBatchResumePlan(plan.batchId, receiptStatus.chain);
  const unitState = resume.unitStates.find((state) => state.unitId === plan.unitId);
  assert(unitState?.currentState === "candidates-admitted" && unitState.nextAction === "run-deterministic-qa", "candidate admission did not advance the receipt chain to deterministic QA.");

  const body = {
    schema: HMF_CANDIDATE_ADMISSION_RESULT_SCHEMA,
    protocolVersion: HMF_CANDIDATE_ADMISSION_PROTOCOL_VERSION,
    projectId: plan.projectId,
    unitId: plan.unitId,
    batchId: plan.batchId,
    frameId: plan.frameId,
    bodySlot: plan.bodySlot,
    attempt: plan.attempt,
    candidateAdmissionPlanSha256: plan.candidateAdmissionPlanSha256,
    admissionRecordSha256: plan.admissionRecord.admissionRecordSha256,
    candidateSha256: candidateSource.sha256,
    providerEvidenceSha256: evidenceSource.sha256,
    receiptSha256: plan.admissionRecord.receipt.receiptSha256,
    materialization: freeze({ candidate: candidateStatus, providerEvidence: evidenceStatus, admissionRecord: admissionStatus, receiptChain: receiptStatus.status }),
    status: [candidateStatus, evidenceStatus, admissionStatus, receiptStatus.status].every((status) => status === "reused") ? "already-admitted" : "admitted",
    currentState: unitState.currentState,
    nextLegalAction: unitState.nextAction,
    authority: freeze({
      deterministicQa: false,
      creativeReview: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
    }),
  };
  return freeze({ ...body, candidateAdmissionResultSha256: hashValue(body) });
}

export async function verifyHmfCandidateAdmissionRuntime() {
  const order = await heavyMetalFightingProductionWorkOrder("hmf.frame-animation.bastion.slot-121");
  const checks = freeze([
    freeze({ id: "candidate-path-governed", passed: order.executionPaths.candidatePathTemplate.startsWith(`scratch/provider/${order.batchId}/`) && order.executionPaths.candidatePathTemplate.endsWith("-cand-{candidate:02}.png") }),
    freeze({ id: "receipt-path-governed", passed: order.executionPaths.receiptPath.startsWith(`manifests/receipts/${order.batchId}/`) }),
    freeze({ id: "runtime-actor-mapped-to-system", passed: RUNTIME_ACTOR_MAPPING.providerOutcomeActorClass === "runtime" && RUNTIME_ACTOR_MAPPING.productionReceiptActorClass === "system" }),
    freeze({ id: "one-candidate-only", passed: order.candidatePolicy.candidateFanout === 1 }),
    freeze({ id: "no-qa-or-promotion-authority", passed: true }),
  ]);
  const failed = freeze(checks.filter((check) => !check.passed));
  return freeze({
    schema: "evavo.heavy-metal-fighting-candidate-admission-verification.v1",
    status: failed.length ? "failed" : "passed",
    sampleUnitId: order.unitId,
    checks,
    failed,
    runtimeActorMapping: RUNTIME_ACTOR_MAPPING,
    authority: freeze({ providerExecution: false, candidateMaterialization: false, receiptPersistence: false, deterministicQa: false, candidateApproval: false, candidatePromotion: false, targetRepositoryMutation: false, gitMutation: false, publication: false }),
  });
}
