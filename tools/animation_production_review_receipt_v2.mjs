#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assertPathFreeAnimationValue } from "./animation_sequence_delivery_guard_v1.mjs";

export const REVIEW_RECEIPT_PROTOCOL_VERSION = "2026-08-30.6";
export const REVIEW_RECEIPT_KIND = "evavo.animation-production-review-receipt.v2";
export const REVIEWER_ROLES = Object.freeze([
  "art-studio-supervisor",
  "cel-animation-studio-independent",
]);

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REVIEWER_CANDIDATES = [
  {
    role: "art-studio-supervisor",
    path: resolve(TOOL_DIR, "animation_production_profile_canonical_v1.mjs"),
  },
  {
    role: "cel-animation-studio-independent",
    path: resolve(TOOL_DIR, "animation_production_profile_review_canonical_v1.mjs"),
  },
];

let reviewerCache;

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

export function animationReviewReceiptSha256(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
}

function digest(value, code) {
  if (typeof value !== "string" || !DIGEST.test(value)) fail(code);
  return value;
}

function timestamp(value, code) {
  if (typeof value !== "string") fail(code);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) fail(code);
  return parsed;
}

function sortedUniqueStrings(value, code) {
  if (!Array.isArray(value)) fail(code);
  const result = value.map((entry) => {
    if (typeof entry !== "string" || !entry) fail(code);
    return entry;
  });
  if (new Set(result).size !== result.length) fail(`${code}_DUPLICATE`);
  return result.sort();
}

function bodyWithout(record, fields) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !fields.includes(key)),
  );
}

async function resolveReviewer() {
  if (reviewerCache) return reviewerCache;
  for (const candidate of REVIEWER_CANDIDATES) {
    try {
      await access(candidate.path);
      const source = await readFile(candidate.path);
      reviewerCache = {
        role: candidate.role,
        implementationDigest: `sha256:${createHash("sha256").update(source).digest("hex")}`,
        module: await import(pathToFileURL(candidate.path).href),
      };
      return reviewerCache;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
  }
  fail("ANIMATION_REVIEW_RECEIPT_REVIEWER_NOT_FOUND");
}

function normaliseFindings(value, code) {
  if (!Array.isArray(value)) fail(code);
  return value
    .map((entry) => canonical(object(entry, code)))
    .sort((left, right) =>
      `${left.code ?? ""}:${left.severity ?? ""}:${left.message ?? ""}`.localeCompare(
        `${right.code ?? ""}:${right.severity ?? ""}:${right.message ?? ""}`,
      ),
    );
}

function normaliseDrawingEvidence(value) {
  if (!Array.isArray(value)) fail("ANIMATION_REVIEW_RECEIPT_DRAWING_EVIDENCE_INVALID");
  const result = value.map((entry) => {
    object(entry, "ANIMATION_REVIEW_RECEIPT_DRAWING_EVIDENCE_ENTRY_INVALID");
    if (typeof entry.drawingId !== "string" || !entry.drawingId) fail("ANIMATION_REVIEW_RECEIPT_DRAWING_ID_INVALID");
    return {
      ...canonical(entry),
      findings: normaliseFindings(entry.findings ?? [], "ANIMATION_REVIEW_RECEIPT_DRAWING_FINDINGS_INVALID"),
    };
  });
  result.sort((left, right) => left.drawingId.localeCompare(right.drawingId));
  if (new Set(result.map((entry) => entry.drawingId)).size !== result.length) fail("ANIMATION_REVIEW_RECEIPT_DRAWING_ID_DUPLICATE");
  return result;
}

function normaliseSequenceEvidence(value) {
  if (value === undefined || value === null) return null;
  object(value, "ANIMATION_REVIEW_RECEIPT_SEQUENCE_EVIDENCE_INVALID");
  return {
    ...canonical(value),
    affectedDrawingIds: sortedUniqueStrings(value.affectedDrawingIds ?? [], "ANIMATION_REVIEW_RECEIPT_AFFECTED_IDS_INVALID"),
    findings: normaliseFindings(value.findings ?? [], "ANIMATION_REVIEW_RECEIPT_SEQUENCE_FINDINGS_INVALID"),
  };
}

function deterministicRepairInstruction(code) {
  return `Resolve ${code} for this drawing against immutable profile and evidence authority while preserving every accepted drawing, camera lock, identity lock and authored exposure.`;
}

function normaliseDecision(raw, reviewInputDigest) {
  object(raw, "ANIMATION_REVIEW_RECEIPT_DECISION_INVALID");
  const retryQueue = [...(raw.retryQueue ?? [])]
    .map((entry) => {
      object(entry, "ANIMATION_REVIEW_RECEIPT_RETRY_INVALID");
      const failureCodes = sortedUniqueStrings(entry.failureCodes ?? [], "ANIMATION_REVIEW_RECEIPT_FAILURE_CODES_INVALID");
      return {
        drawingId: entry.drawingId,
        currentAttempt: entry.currentAttempt,
        nextAttempt: entry.nextAttempt,
        failureCodes,
        repairInstructions: failureCodes.map(deterministicRepairInstruction),
        authoritativeDependencyDrawingIds: sortedUniqueStrings(entry.authoritativeDependencyDrawingIds ?? [], "ANIMATION_REVIEW_RECEIPT_DEPENDENCIES_INVALID"),
        preserveDrawingIds: sortedUniqueStrings(entry.preserveDrawingIds ?? [], "ANIMATION_REVIEW_RECEIPT_PRESERVE_IDS_INVALID"),
      };
    })
    .sort((left, right) => left.drawingId.localeCompare(right.drawingId));

  const body = {
    protocolVersion: raw.protocolVersion,
    kind: raw.kind,
    profileDigest: raw.profileDigest,
    reviewInputDigest,
    cycle: raw.cycle,
    status: raw.status,
    acceptedDrawingIds: sortedUniqueStrings(raw.acceptedDrawingIds ?? [], "ANIMATION_REVIEW_RECEIPT_ACCEPTED_IDS_INVALID"),
    reviewRequiredDrawingIds: sortedUniqueStrings(raw.reviewRequiredDrawingIds ?? [], "ANIMATION_REVIEW_RECEIPT_REQUIRED_IDS_INVALID"),
    rejectedDrawingIds: sortedUniqueStrings(raw.rejectedDrawingIds ?? [], "ANIMATION_REVIEW_RECEIPT_REJECTED_IDS_INVALID"),
    retryQueue,
    sequenceReviewRequired: raw.sequenceReviewRequired === true,
    sequenceFailureCodes: sortedUniqueStrings(raw.sequenceFailureCodes ?? [], "ANIMATION_REVIEW_RECEIPT_SEQUENCE_CODES_INVALID"),
    noProgressCycles: raw.noProgressCycles,
    blockers: sortedUniqueStrings(raw.blockers ?? [], "ANIMATION_REVIEW_RECEIPT_BLOCKERS_INVALID"),
    failureFingerprint: animationReviewReceiptSha256({
      profileDigest: raw.profileDigest,
      rejectedDrawingIds: [...(raw.rejectedDrawingIds ?? [])].sort(),
      sequenceFailureCodes: [...(raw.sequenceFailureCodes ?? [])].sort(),
      blockers: [...(raw.blockers ?? [])].sort(),
    }),
    authority: {
      providerExecution: false,
      automaticCreativeApproval: false,
      artifactPromotion: false,
      runtimeActivation: false,
      repositoryMutation: false,
      publication: false,
    },
  };
  return {
    ...body,
    decisionDigest: animationReviewReceiptSha256(body),
    decidedAt: raw.decidedAt,
  };
}

export function assertAnimationProductionReviewReceiptSelfIntegrity(receipt) {
  assertPathFreeAnimationValue(receipt);
  object(receipt, "ANIMATION_REVIEW_RECEIPT_INVALID");
  if (receipt.protocolVersion !== REVIEW_RECEIPT_PROTOCOL_VERSION || receipt.kind !== REVIEW_RECEIPT_KIND) fail("ANIMATION_REVIEW_RECEIPT_PROTOCOL_INVALID");
  if (!REVIEWER_ROLES.includes(receipt.reviewerRole)) fail("ANIMATION_REVIEW_RECEIPT_ROLE_INVALID");
  digest(receipt.reviewerImplementationDigest, "ANIMATION_REVIEW_RECEIPT_IMPLEMENTATION_DIGEST_INVALID");
  digest(receipt.profileDigest, "ANIMATION_REVIEW_RECEIPT_PROFILE_DIGEST_INVALID");
  digest(receipt.reviewInputDigest, "ANIMATION_REVIEW_RECEIPT_INPUT_DIGEST_INVALID");
  if (receipt.previousReceiptDigest !== null) digest(receipt.previousReceiptDigest, "ANIMATION_REVIEW_RECEIPT_PREVIOUS_RECEIPT_DIGEST_INVALID");
  if (receipt.previousDecisionDigest !== null) digest(receipt.previousDecisionDigest, "ANIMATION_REVIEW_RECEIPT_PREVIOUS_DECISION_DIGEST_INVALID");
  digest(receipt.receiptDigest, "ANIMATION_REVIEW_RECEIPT_DIGEST_INVALID");
  timestamp(receipt.issuedAt, "ANIMATION_REVIEW_RECEIPT_TIME_INVALID");
  object(receipt.evidenceSummary, "ANIMATION_REVIEW_RECEIPT_EVIDENCE_SUMMARY_INVALID");
  digest(receipt.evidenceSummary.drawingEvidenceDigest, "ANIMATION_REVIEW_RECEIPT_DRAWING_EVIDENCE_DIGEST_INVALID");
  if (receipt.evidenceSummary.sequenceEvidenceDigest !== null) digest(receipt.evidenceSummary.sequenceEvidenceDigest, "ANIMATION_REVIEW_RECEIPT_SEQUENCE_EVIDENCE_DIGEST_INVALID");
  object(receipt.decision, "ANIMATION_REVIEW_RECEIPT_DECISION_INVALID");
  digest(receipt.decision.decisionDigest, "ANIMATION_REVIEW_RECEIPT_DECISION_DIGEST_INVALID");
  timestamp(receipt.decision.decidedAt, "ANIMATION_REVIEW_RECEIPT_DECISION_TIME_INVALID");
  if (animationReviewReceiptSha256(bodyWithout(receipt.decision, ["decisionDigest", "decidedAt"])) !== receipt.decision.decisionDigest) fail("ANIMATION_REVIEW_RECEIPT_DECISION_DIGEST_MISMATCH");
  if (receipt.decision.reviewInputDigest !== receipt.reviewInputDigest || receipt.decision.profileDigest !== receipt.profileDigest) fail("ANIMATION_REVIEW_RECEIPT_DECISION_LINEAGE_MISMATCH");
  if (animationReviewReceiptSha256(bodyWithout(receipt, ["receiptDigest", "issuedAt"])) !== receipt.receiptDigest) fail("ANIMATION_REVIEW_RECEIPT_DIGEST_MISMATCH");
  if (
    receipt.authority?.providerExecution !== false ||
    receipt.authority?.automaticCreativeApproval !== false ||
    receipt.authority?.artifactPromotion !== false ||
    receipt.authority?.runtimeActivation !== false ||
    receipt.authority?.repositoryMutation !== false ||
    receipt.authority?.publication !== false
  ) fail("ANIMATION_REVIEW_RECEIPT_AUTHORITY_INVALID");
}

export async function compileAnimationProductionReviewReceipt(input, now = new Date()) {
  assertPathFreeAnimationValue(input);
  object(input, "ANIMATION_REVIEW_RECEIPT_INPUT_INVALID");
  const reviewer = await resolveReviewer();
  reviewer.module.assertAnimationProductionProfileIntegrity(input.profile);

  let previousReceiptDigest = null;
  let previousDecisionDigest = null;
  let previousDecision;
  if (input.previousReceipt !== undefined && input.previousReceipt !== null) {
    assertAnimationProductionReviewReceiptSelfIntegrity(input.previousReceipt);
    if (input.previousReceipt.reviewerRole !== reviewer.role) fail("ANIMATION_REVIEW_RECEIPT_PREVIOUS_ROLE_MISMATCH");
    if (input.previousReceipt.profileDigest !== input.profile.contentDigest) fail("ANIMATION_REVIEW_RECEIPT_PREVIOUS_PROFILE_MISMATCH");
    if (input.previousReceipt.decision.cycle >= input.cycle) fail("ANIMATION_REVIEW_RECEIPT_PREVIOUS_CYCLE_INVALID");
    previousReceiptDigest = input.previousReceipt.receiptDigest;
    previousDecisionDigest = input.previousReceipt.decision.decisionDigest;
    previousDecision = input.previousReceipt.decision;
  }

  const drawingEvidence = normaliseDrawingEvidence(input.drawingEvidence);
  const sequenceEvidence = normaliseSequenceEvidence(input.sequenceEvidence);
  const reviewInputIdentity = {
    profileDigest: input.profile.contentDigest,
    cycle: input.cycle,
    drawingEvidence,
    sequenceEvidence,
    previousDecisionDigest,
  };
  const reviewInputDigest = animationReviewReceiptSha256(reviewInputIdentity);
  const reviewerInput = {
    profile: input.profile,
    cycle: input.cycle,
    drawingEvidence,
    ...(sequenceEvidence ? { sequenceEvidence } : {}),
    ...(previousDecision ? { previousDecision } : {}),
  };
  const rawDecision = reviewer.module.reviewAnimationProductionProfile(reviewerInput, now);
  const decision = normaliseDecision(rawDecision, reviewInputDigest);
  const body = {
    protocolVersion: REVIEW_RECEIPT_PROTOCOL_VERSION,
    kind: REVIEW_RECEIPT_KIND,
    reviewerRole: reviewer.role,
    reviewerImplementationDigest: reviewer.implementationDigest,
    profileDigest: input.profile.contentDigest,
    reviewInputDigest,
    previousReceiptDigest,
    previousDecisionDigest,
    evidenceSummary: {
      drawingEvidenceCount: drawingEvidence.length,
      sequenceEvidencePresent: sequenceEvidence !== null,
      drawingEvidenceDigest: animationReviewReceiptSha256(drawingEvidence),
      sequenceEvidenceDigest: sequenceEvidence === null ? null : animationReviewReceiptSha256(sequenceEvidence),
    },
    decision,
    authority: {
      providerExecution: false,
      automaticCreativeApproval: false,
      artifactPromotion: false,
      runtimeActivation: false,
      repositoryMutation: false,
      publication: false,
    },
  };
  const receipt = {
    ...body,
    receiptDigest: animationReviewReceiptSha256(body),
    issuedAt: now.toISOString(),
  };
  assertAnimationProductionReviewReceiptSelfIntegrity(receipt);
  return receipt;
}

export async function assertAnimationProductionReviewReceiptAgainstInput(input, receipt) {
  assertAnimationProductionReviewReceiptSelfIntegrity(receipt);
  const expected = await compileAnimationProductionReviewReceipt(input, timestamp(receipt.issuedAt, "ANIMATION_REVIEW_RECEIPT_TIME_INVALID"));
  if (JSON.stringify(expected) !== JSON.stringify(receipt)) fail("ANIMATION_REVIEW_RECEIPT_INPUT_MISMATCH");
}

function safeWorkspacePath(input) {
  const root = process.cwd();
  const absolute = resolve(root, input);
  const rel = relative(root, absolute);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return absolute;
  fail("ANIMATION_REVIEW_RECEIPT_PATH_OUTSIDE_WORKSPACE", input);
}

async function emit(value, outputPath) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  if (!outputPath) process.stdout.write(body);
  else await writeFile(safeWorkspacePath(outputPath), body, { encoding: "utf8", flag: "wx" });
}

async function cli() {
  const [command, inputPath, outputPath] = process.argv.slice(2);
  if (!command || !inputPath || !["compile", "verify", "verify-input"].includes(command)) fail("ANIMATION_REVIEW_RECEIPT_USAGE", "node tools/animation_production_review_receipt_v2.mjs <compile|verify|verify-input> <input.json> [output.json]");
  const input = JSON.parse(await readFile(safeWorkspacePath(inputPath), "utf8"));
  if (command === "compile") return emit(await compileAnimationProductionReviewReceipt(input), outputPath);
  if (command === "verify") {
    assertAnimationProductionReviewReceiptSelfIntegrity(input);
    return emit({ status: "verified", receiptDigest: input.receiptDigest, reviewerRole: input.reviewerRole, reviewStatus: input.decision.status }, outputPath);
  }
  await assertAnimationProductionReviewReceiptAgainstInput(input.input, input.receipt);
  return emit({ status: "verified", receiptDigest: input.receipt.receiptDigest, reviewInputDigest: input.receipt.reviewInputDigest }, outputPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  cli().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "error", message: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  });
}
