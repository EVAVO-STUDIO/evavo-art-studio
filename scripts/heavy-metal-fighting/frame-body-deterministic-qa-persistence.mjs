import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import {
  HMF_FRAME_BODY_DETERMINISTIC_QA_PLAN_SCHEMA,
  HMF_FRAME_BODY_DETERMINISTIC_QA_PROTOCOL_VERSION,
  HMF_FRAME_BODY_DETERMINISTIC_QA_RESULT_SCHEMA,
  assert,
  canonical,
  freeze,
  hashBytes,
  hashValue,
  loadPolicy,
  pathWithin,
  safeRelativePath,
  safeWorkspacePath,
  selfHashed,
  stableWorkspaceFile,
  stableWorkspaceJson,
  workspaceRoot,
} from "./frame-body-deterministic-qa-common.mjs";
import { decodeRgbaPng } from "./frame-body-deterministic-qa-png.mjs";

async function ensureDirectory(root, relativeDirectory) {
  const safe = safeRelativePath(relativeDirectory, "workspace directory path");
  let current = root;
  for (const segment of safe.split("/")) {
    current = path.join(current, segment);
    const info = await lstat(current).catch(() => null);
    if (!info) {
      await mkdir(current, { mode: 0o700 });
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
    assert(existing.sha256 === expectedSha256 && existing.size === bytes.length, `existing output conflicts with the governed deterministic QA plan: ${filePath}`);
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
  assert(existing, "persisted receipt chain disappeared before deterministic QA materialization.");
  const text = existing.bytes.toString("utf8");
  if (text === expectedNext) return freeze({ status: "reused", chain: nextChain });
  assert(text === expectedPrevious, "persisted receipt chain differs from the validated candidates-admitted predecessor chain.");
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

export async function materializeHmfFrameBodyDeterministicQa(planInput) {
  const plan = selfHashed(planInput, "qaPlanSha256", "deterministic QA plan");
  assert(plan.schema === HMF_FRAME_BODY_DETERMINISTIC_QA_PLAN_SCHEMA && plan.protocolVersion === HMF_FRAME_BODY_DETERMINISTIC_QA_PROTOCOL_VERSION, "deterministic QA plan schema or protocol drifted.");
  assert(plan.authority?.explicitWriteEnabledRuntimeRequired === true && plan.authority?.reportPersistence === false && plan.authority?.receiptPersistence === false, "deterministic QA plan lost the explicit write-enabled boundary.");
  const report = selfHashed(plan.qaReport, "qaReportSha256", "deterministic QA report");
  const [currentOrder, currentPolicy] = await Promise.all([
    heavyMetalFightingProductionWorkOrder(plan.unitId),
    loadPolicy(),
  ]);
  assert(currentOrder.workOrderSha256 === plan.workOrderSha256, "deterministic QA plan is stale against the immutable work order.");
  assert(currentPolicy.policySha256 === report.policySha256 && report.qaEvidence?.policySha256 === currentPolicy.policySha256, "deterministic QA plan is stale against the governed QA policy.");
  assert(hashValue(report.qaEvidence) === report.qaEvidenceSha256, "deterministic QA evidence hash drifted from its canonical content.");
  const root = await workspaceRoot(plan.workspaceRoot);
  assert(root === plan.workspaceRoot, "deterministic QA workspace root changed after plan compilation.");
  const candidate = await stableWorkspaceFile(root, plan.candidate.path, "admitted candidate", 16 * 1024 * 1024);
  assert(candidate.sha256 === plan.candidate.sha256 && candidate.size === plan.candidate.bytes, "candidate changed after deterministic QA plan compilation.");
  decodeRgbaPng(candidate.bytes);
  const persistedAdmission = await stableWorkspaceJson(root, report.targets.admissionRecord, "persisted candidate admission record");
  assert(persistedAdmission.value.admissionRecordSha256 === plan.admissionRecordSha256, "candidate admission record changed after deterministic QA plan compilation.");
  const reportTarget = safeRelativePath(report.targets.qaReport, "deterministic QA report target");
  const receiptTarget = safeRelativePath(report.targets.receiptChain, "deterministic QA receipt target");
  const reportDirectory = await ensureDirectory(root, path.posix.dirname(reportTarget));
  const absolute = (relative) => {
    const resolved = path.resolve(root, ...relative.split("/"));
    assert(pathWithin(root, resolved), `deterministic QA output escaped the workspace: ${relative}`);
    return resolved;
  };
  const reportPath = absolute(reportTarget);
  const receiptPath = absolute(receiptTarget);
  assert(path.dirname(reportPath) === reportDirectory, "deterministic QA report escaped its governed review directory.");
  await safeWorkspacePath(root, path.posix.dirname(receiptTarget), "deterministic QA receipt directory", { file: false });
  const reportBytes = Buffer.from(canonical(report), "utf8");
  const reportStatus = await writeExactOrReuse(reportPath, reportBytes, hashBytes(reportBytes));
  let receiptStatus = "unchanged";
  let receiptChain = plan.previousReceipts;
  let currentState = "candidates-admitted";
  let nextLegalAction = report.operatorNextAction;
  if (report.status === "passed") {
    assert(report.receipt?.state === "deterministic-qa-passed", "passing deterministic QA report lacks its governed pass receipt.");
    const persisted = await writeReceiptChain(receiptPath, plan.previousReceipts, report.receipt);
    receiptStatus = persisted.status;
    receiptChain = persisted.chain;
    const resume = await heavyMetalFightingProductionBatchResumePlan(plan.batchId, receiptChain);
    const unitState = resume.unitStates.find((state) => state.unitId === plan.unitId);
    assert(unitState?.currentState === "deterministic-qa-passed" && unitState.nextAction === "run-creative-review", "deterministic QA pass did not advance the receipt chain to creative review.");
    currentState = unitState.currentState;
    nextLegalAction = unitState.nextAction;
  } else {
    assert(report.receipt === null, "failed deterministic QA may not fabricate a pass receipt.");
    const receiptFile = await stableWorkspaceJson(root, receiptTarget, "persisted production receipt chain");
    assert(canonical(receiptFile.value) === canonical(plan.previousReceipts), "failed deterministic QA must leave the production receipt chain unchanged.");
  }
  const body = {
    schema: HMF_FRAME_BODY_DETERMINISTIC_QA_RESULT_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_DETERMINISTIC_QA_PROTOCOL_VERSION,
    projectId: plan.projectId,
    unitId: plan.unitId,
    batchId: plan.batchId,
    frameId: plan.frameId,
    bodySlot: plan.bodySlot,
    attempt: plan.attempt,
    qaPlanSha256: plan.qaPlanSha256,
    qaReportSha256: report.qaReportSha256,
    qaEvidenceSha256: report.qaEvidenceSha256,
    candidateSha256: plan.candidate.sha256,
    status: report.status === "passed"
      ? (reportStatus === "reused" && receiptStatus === "reused" ? "already-qa-passed" : "qa-passed")
      : (reportStatus === "reused" ? "already-qa-failed" : "qa-failed"),
    materialization: freeze({ qaReport: reportStatus, receiptChain: receiptStatus }),
    currentState,
    nextLegalAction,
    failureCodes: report.qaEvidence.failureCodes,
    boundedRepairTemplateSha256: report.boundedRepairTemplate?.repairTemplateSha256 ?? null,
    authority: freeze({
      providerExecution: false,
      providerRetry: false,
      creativeReview: false,
      repairAuthorization: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
    }),
  };
  return freeze({ ...body, qaResultSha256: hashValue(body) });
}
