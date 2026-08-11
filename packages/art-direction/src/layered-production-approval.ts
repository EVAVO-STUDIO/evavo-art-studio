import type {
  CompiledLayeredProductionPlan,
  CompiledLayeredProductionUnit,
} from "./layered-production-types.js";
import {
  exactKeys,
  fail,
  freeze,
  idValue,
  integerValue,
  record,
  sha256,
  stringValue,
} from "./layered-production-internal.js";
import {
  verifyLayeredProductionPlan,
} from "./layered-production-plan.js";

export const LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_PROTOCOL_VERSION =
  "2026-08-11.1" as const;
export const LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_REQUEST_KIND =
  "evavo.layered-production.style-proof-approval.request" as const;
export const LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_RECEIPT_KIND =
  "evavo.layered-production.style-proof-approval.receipt" as const;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ARTIFACT_ID_PATTERN = /^artifact_[0-9a-f]{64}$/;
const REVIEWED_AT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MAXIMUM_SOURCE_BYTES = 64 * 1024 * 1024;

export interface LayeredProductionStyleProofEvidenceInput {
  readonly unitId: string;
  readonly sourceArtifactId: string;
  readonly sourceSha256: string;
  readonly sourceBytes: number;
  readonly width: number;
  readonly height: number;
  readonly providerJobIdempotencyKey: string;
  readonly providerRequestSha256: string;
  readonly sealedReviewArtifactId: string;
  readonly sealedReviewReceiptSha256: string;
  readonly reviewBundleArtifactId: string;
  readonly reviewBundleSha256: string;
  readonly decision: "approved";
}

export interface LayeredProductionStyleProofCrossUnitReviewInput {
  readonly decision: "approved";
  readonly styleFingerprintSha256: string;
  readonly cameraConsistency: "approved";
  readonly lightingConsistency: "approved";
  readonly paletteConsistency: "approved";
  readonly pixelGrammarConsistency: "approved";
  readonly layerSeparation: "approved";
  readonly antiGenericQuality: "approved";
  readonly evidenceArtifactId: string;
  readonly evidenceSha256: string;
}

export interface LayeredProductionStyleProofApprovalRequestInput {
  readonly schemaVersion: "1.0";
  readonly kind: typeof LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_REQUEST_KIND;
  readonly planId: string;
  readonly pendingPlanSha256: string;
  readonly styleFingerprintSha256: string;
  readonly reviewer: string;
  readonly reviewedAt: string;
  readonly evidence: readonly LayeredProductionStyleProofEvidenceInput[];
  readonly crossUnitReview: LayeredProductionStyleProofCrossUnitReviewInput;
}

export interface LayeredProductionStyleProofApprovalReceipt {
  readonly schemaVersion: "1.0";
  readonly kind: typeof LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_RECEIPT_KIND;
  readonly protocolVersion: typeof LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_PROTOCOL_VERSION;
  readonly planId: string;
  readonly pendingPlanSha256: string;
  readonly requestSha256: string;
  readonly styleFingerprintSha256: string;
  readonly proofUnitIds: readonly string[];
  readonly approvedUnitIds: readonly string[];
  readonly reviewer: string;
  readonly reviewedAt: string;
  readonly evidence: readonly LayeredProductionStyleProofEvidenceInput[];
  readonly crossUnitReview: LayeredProductionStyleProofCrossUnitReviewInput;
  readonly evidenceSha256: string;
  readonly receiptSha256: string;
  readonly authority: Readonly<{
    readonly providerExecution: false;
    readonly sourceMutation: false;
    readonly creativeDecision: false;
    readonly automaticAssembly: false;
    readonly automaticPromotion: false;
    readonly targetRepositoryMutation: false;
    readonly gitCommit: false;
    readonly gitPush: false;
    readonly publication: false;
    readonly forcePush: false;
  }>;
}

type PendingStyleProof = CompiledLayeredProductionPlan["styleProof"];

export type ApprovedLayeredProductionPlan = Omit<
  CompiledLayeredProductionPlan,
  "styleProof"
> &
  Readonly<{
    styleProof: Omit<PendingStyleProof, "status" | "approval"> &
      Readonly<{
        status: "approved";
        approval: LayeredProductionStyleProofApprovalReceipt;
      }>;
  }>;

function sha256Value(value: unknown, label: string): string {
  const output = stringValue(value, label, 64);
  if (!SHA256_PATTERN.test(output)) {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
      `${label} must be a lowercase SHA-256.`,
    );
  }
  return output;
}

function artifactIdValue(
  value: unknown,
  label: string,
  expectedSha256?: string,
): string {
  const output = stringValue(value, label, 73);
  if (!ARTIFACT_ID_PATTERN.test(output)) {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
      `${label} must use artifact_<sha256> format.`,
    );
  }
  if (expectedSha256 !== undefined && output !== `artifact_${expectedSha256}`) {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
      `${label} must identify the exact declared SHA-256.`,
    );
  }
  return output;
}

function approvedValue(value: unknown, label: string): "approved" {
  if (value !== "approved") {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
      `${label} must equal approved.`,
    );
  }
  return "approved";
}

function reviewedAtValue(value: unknown, label: string): string {
  const output = stringValue(value, label, 100);
  if (!REVIEWED_AT_PATTERN.test(output) || Number.isNaN(Date.parse(output))) {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
      `${label} must be a valid ISO UTC timestamp.`,
    );
  }
  return output;
}

function exactProofUnits(
  plan: CompiledLayeredProductionPlan,
): readonly CompiledLayeredProductionUnit[] {
  const units = new Map(
    plan.layers.flatMap((layer) => layer.units).map((unit) => [unit.id, unit]),
  );
  return plan.styleProof.unitIds.map((unitId) => {
    const unit = units.get(unitId);
    if (!unit) {
      fail(
        "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
        `Style-proof unit ${unitId} is missing from the exact pending plan.`,
      );
    }
    return unit;
  });
}

function normalizeEvidence(
  input: unknown,
  plan: CompiledLayeredProductionPlan,
): readonly LayeredProductionStyleProofEvidenceInput[] {
  if (!Array.isArray(input) || input.length !== plan.styleProof.unitIds.length) {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
      "Approval evidence must contain exactly one entry for every declared style-proof unit.",
    );
  }
  const proofUnits = exactProofUnits(plan);
  const proofUnitById = new Map(proofUnits.map((unit) => [unit.id, unit]));
  const evidenceByUnit = new Map<
    string,
    LayeredProductionStyleProofEvidenceInput
  >();

  for (const [index, value] of input.entries()) {
    const label = `approval.evidence[${index}]`;
    const entry = record(value, label);
    exactKeys(entry, label, [
      "unitId",
      "sourceArtifactId",
      "sourceSha256",
      "sourceBytes",
      "width",
      "height",
      "providerJobIdempotencyKey",
      "providerRequestSha256",
      "sealedReviewArtifactId",
      "sealedReviewReceiptSha256",
      "reviewBundleArtifactId",
      "reviewBundleSha256",
      "decision",
    ]);
    const unitId = idValue(entry.unitId, `${label}.unitId`);
    const unit = proofUnitById.get(unitId);
    if (!unit) {
      fail(
        "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
        `${label}.unitId is not in the exact style-proof set.`,
      );
    }
    if (evidenceByUnit.has(unitId)) {
      fail(
        "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
        `Duplicate style-proof evidence for unit ${unitId}.`,
      );
    }
    const sourceSha256 = sha256Value(
      entry.sourceSha256,
      `${label}.sourceSha256`,
    );
    const sealedReviewReceiptSha256 = sha256Value(
      entry.sealedReviewReceiptSha256,
      `${label}.sealedReviewReceiptSha256`,
    );
    const reviewBundleSha256 = sha256Value(
      entry.reviewBundleSha256,
      `${label}.reviewBundleSha256`,
    );
    const width = integerValue(entry.width, `${label}.width`, 1, 8192);
    const height = integerValue(entry.height, `${label}.height`, 1, 8192);
    if (width !== unit.dimensions.width || height !== unit.dimensions.height) {
      fail(
        "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
        `${label} dimensions do not match unit ${unitId}.`,
      );
    }
    const providerJobIdempotencyKey = sha256Value(
      entry.providerJobIdempotencyKey,
      `${label}.providerJobIdempotencyKey`,
    );
    if (providerJobIdempotencyKey !== unit.providerJob.idempotencyKey) {
      fail(
        "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
        `${label}.providerJobIdempotencyKey does not match the exact compiled unit job.`,
      );
    }
    evidenceByUnit.set(
      unitId,
      freeze({
        unitId,
        sourceArtifactId: artifactIdValue(
          entry.sourceArtifactId,
          `${label}.sourceArtifactId`,
          sourceSha256,
        ),
        sourceSha256,
        sourceBytes: integerValue(
          entry.sourceBytes,
          `${label}.sourceBytes`,
          1,
          MAXIMUM_SOURCE_BYTES,
        ),
        width,
        height,
        providerJobIdempotencyKey,
        providerRequestSha256: sha256Value(
          entry.providerRequestSha256,
          `${label}.providerRequestSha256`,
        ),
        sealedReviewArtifactId: artifactIdValue(
          entry.sealedReviewArtifactId,
          `${label}.sealedReviewArtifactId`,
          sealedReviewReceiptSha256,
        ),
        sealedReviewReceiptSha256,
        reviewBundleArtifactId: artifactIdValue(
          entry.reviewBundleArtifactId,
          `${label}.reviewBundleArtifactId`,
          reviewBundleSha256,
        ),
        reviewBundleSha256,
        decision: approvedValue(entry.decision, `${label}.decision`),
      }),
    );
  }

  const evidence = plan.styleProof.unitIds.map((unitId) => {
    const entry = evidenceByUnit.get(unitId);
    if (!entry) {
      fail(
        "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
        `Missing style-proof evidence for unit ${unitId}.`,
      );
    }
    return entry;
  });

  for (const [label, values] of [
    ["source artifacts", evidence.map((entry) => entry.sourceArtifactId)],
    ["provider requests", evidence.map((entry) => entry.providerRequestSha256)],
    [
      "sealed review receipts",
      evidence.map((entry) => entry.sealedReviewArtifactId),
    ],
    ["review bundles", evidence.map((entry) => entry.reviewBundleArtifactId)],
  ] as const) {
    if (new Set(values).size !== values.length) {
      fail(
        "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
        `Style-proof ${label} must be unique per proof unit.`,
      );
    }
  }

  return freeze(evidence);
}

function normalizeCrossUnitReview(
  input: unknown,
  styleFingerprintSha256: string,
): LayeredProductionStyleProofCrossUnitReviewInput {
  const review = record(input, "approval.crossUnitReview");
  exactKeys(review, "approval.crossUnitReview", [
    "decision",
    "styleFingerprintSha256",
    "cameraConsistency",
    "lightingConsistency",
    "paletteConsistency",
    "pixelGrammarConsistency",
    "layerSeparation",
    "antiGenericQuality",
    "evidenceArtifactId",
    "evidenceSha256",
  ]);
  const boundStyleFingerprint = sha256Value(
    review.styleFingerprintSha256,
    "approval.crossUnitReview.styleFingerprintSha256",
  );
  if (boundStyleFingerprint !== styleFingerprintSha256) {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
      "Cross-unit review is not bound to the exact style fingerprint.",
    );
  }
  const evidenceSha256 = sha256Value(
    review.evidenceSha256,
    "approval.crossUnitReview.evidenceSha256",
  );
  return freeze({
    decision: approvedValue(
      review.decision,
      "approval.crossUnitReview.decision",
    ),
    styleFingerprintSha256: boundStyleFingerprint,
    cameraConsistency: approvedValue(
      review.cameraConsistency,
      "approval.crossUnitReview.cameraConsistency",
    ),
    lightingConsistency: approvedValue(
      review.lightingConsistency,
      "approval.crossUnitReview.lightingConsistency",
    ),
    paletteConsistency: approvedValue(
      review.paletteConsistency,
      "approval.crossUnitReview.paletteConsistency",
    ),
    pixelGrammarConsistency: approvedValue(
      review.pixelGrammarConsistency,
      "approval.crossUnitReview.pixelGrammarConsistency",
    ),
    layerSeparation: approvedValue(
      review.layerSeparation,
      "approval.crossUnitReview.layerSeparation",
    ),
    antiGenericQuality: approvedValue(
      review.antiGenericQuality,
      "approval.crossUnitReview.antiGenericQuality",
    ),
    evidenceArtifactId: artifactIdValue(
      review.evidenceArtifactId,
      "approval.crossUnitReview.evidenceArtifactId",
      evidenceSha256,
    ),
    evidenceSha256,
  });
}

function receiptEvidenceSha256(
  receipt: Pick<
    LayeredProductionStyleProofApprovalReceipt,
    | "planId"
    | "pendingPlanSha256"
    | "styleFingerprintSha256"
    | "proofUnitIds"
    | "evidence"
    | "crossUnitReview"
  >,
): string {
  return sha256({
    planId: receipt.planId,
    pendingPlanSha256: receipt.pendingPlanSha256,
    styleFingerprintSha256: receipt.styleFingerprintSha256,
    proofUnitIds: receipt.proofUnitIds,
    evidence: receipt.evidence,
    crossUnitReview: receipt.crossUnitReview,
  });
}

function normalizedApprovalRequestFromReceipt(
  receipt: LayeredProductionStyleProofApprovalReceipt,
): LayeredProductionStyleProofApprovalRequestInput {
  return {
    schemaVersion: "1.0",
    kind: LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_REQUEST_KIND,
    planId: receipt.planId,
    pendingPlanSha256: receipt.pendingPlanSha256,
    styleFingerprintSha256: receipt.styleFingerprintSha256,
    reviewer: receipt.reviewer,
    reviewedAt: receipt.reviewedAt,
    evidence: receipt.evidence,
    crossUnitReview: receipt.crossUnitReview,
  };
}

export function compileLayeredProductionStyleProofApprovalReceipt(
  plan: CompiledLayeredProductionPlan,
  input: unknown,
): LayeredProductionStyleProofApprovalReceipt {
  verifyLayeredProductionPlan(plan);
  if (plan.styleProof.status !== "approval-required") {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
      "A style-proof approval receipt can be compiled only for an exact pending plan.",
    );
  }
  const approval = record(input, "approval");
  exactKeys(approval, "approval", [
    "schemaVersion",
    "kind",
    "planId",
    "pendingPlanSha256",
    "styleFingerprintSha256",
    "reviewer",
    "reviewedAt",
    "evidence",
    "crossUnitReview",
  ]);
  if (approval.schemaVersion !== "1.0") {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
      "approval.schemaVersion must equal 1.0.",
    );
  }
  if (approval.kind !== LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_REQUEST_KIND) {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
      `approval.kind must equal ${LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_REQUEST_KIND}.`,
    );
  }
  const planId = idValue(approval.planId, "approval.planId");
  if (planId !== plan.planId) {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
      "Approval planId does not match the exact pending plan.",
    );
  }
  const pendingPlanSha256 = sha256Value(
    approval.pendingPlanSha256,
    "approval.pendingPlanSha256",
  );
  if (pendingPlanSha256 !== plan.planSha256) {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
      "Approval pendingPlanSha256 does not match the exact pending plan.",
    );
  }
  const styleFingerprintSha256 = sha256Value(
    approval.styleFingerprintSha256,
    "approval.styleFingerprintSha256",
  );
  if (styleFingerprintSha256 !== plan.styleFingerprintSha256) {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
      "Approval styleFingerprintSha256 does not match the exact pending plan.",
    );
  }
  const evidence = normalizeEvidence(approval.evidence, plan);
  const crossUnitReview = normalizeCrossUnitReview(
    approval.crossUnitReview,
    styleFingerprintSha256,
  );
  const normalizedRequest = freeze({
    schemaVersion: "1.0" as const,
    kind: LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_REQUEST_KIND,
    planId,
    pendingPlanSha256,
    styleFingerprintSha256,
    reviewer: stringValue(approval.reviewer, "approval.reviewer", 300),
    reviewedAt: reviewedAtValue(approval.reviewedAt, "approval.reviewedAt"),
    evidence,
    crossUnitReview,
  });
  const requestSha256 = sha256(normalizedRequest);
  const partial = {
    schemaVersion: "1.0" as const,
    kind: LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_RECEIPT_KIND,
    protocolVersion: LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_PROTOCOL_VERSION,
    planId,
    pendingPlanSha256,
    requestSha256,
    styleFingerprintSha256,
    proofUnitIds: plan.styleProof.unitIds,
    approvedUnitIds: plan.styleProof.unitIds,
    reviewer: normalizedRequest.reviewer,
    reviewedAt: normalizedRequest.reviewedAt,
    evidence,
    crossUnitReview,
    evidenceSha256: receiptEvidenceSha256({
      planId,
      pendingPlanSha256,
      styleFingerprintSha256,
      proofUnitIds: plan.styleProof.unitIds,
      evidence,
      crossUnitReview,
    }),
    authority: freeze({
      providerExecution: false as const,
      sourceMutation: false as const,
      creativeDecision: false as const,
      automaticAssembly: false as const,
      automaticPromotion: false as const,
      targetRepositoryMutation: false as const,
      gitCommit: false as const,
      gitPush: false as const,
      publication: false as const,
      forcePush: false as const,
    }),
  };
  return freeze({ ...partial, receiptSha256: sha256(partial) });
}

export function verifyLayeredProductionStyleProofApprovalReceipt(
  receipt: LayeredProductionStyleProofApprovalReceipt,
): true {
  const value = record(receipt, "styleProofApprovalReceipt");
  exactKeys(value, "styleProofApprovalReceipt", [
    "schemaVersion",
    "kind",
    "protocolVersion",
    "planId",
    "pendingPlanSha256",
    "requestSha256",
    "styleFingerprintSha256",
    "proofUnitIds",
    "approvedUnitIds",
    "reviewer",
    "reviewedAt",
    "evidence",
    "crossUnitReview",
    "evidenceSha256",
    "receiptSha256",
    "authority",
  ]);
  if (
    receipt.schemaVersion !== "1.0" ||
    receipt.kind !== LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_RECEIPT_KIND ||
    receipt.protocolVersion !==
      LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_PROTOCOL_VERSION
  ) {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_RECEIPT_INVALID",
      "Style-proof approval receipt protocol identity is invalid.",
    );
  }
  idValue(receipt.planId, "styleProofApprovalReceipt.planId");
  sha256Value(
    receipt.pendingPlanSha256,
    "styleProofApprovalReceipt.pendingPlanSha256",
  );
  sha256Value(
    receipt.requestSha256,
    "styleProofApprovalReceipt.requestSha256",
  );
  sha256Value(
    receipt.styleFingerprintSha256,
    "styleProofApprovalReceipt.styleFingerprintSha256",
  );
  sha256Value(
    receipt.evidenceSha256,
    "styleProofApprovalReceipt.evidenceSha256",
  );
  sha256Value(
    receipt.receiptSha256,
    "styleProofApprovalReceipt.receiptSha256",
  );
  stringValue(receipt.reviewer, "styleProofApprovalReceipt.reviewer", 300);
  reviewedAtValue(
    receipt.reviewedAt,
    "styleProofApprovalReceipt.reviewedAt",
  );
  if (
    !Array.isArray(receipt.proofUnitIds) ||
    receipt.proofUnitIds.length < 3 ||
    new Set(receipt.proofUnitIds).size !== receipt.proofUnitIds.length
  ) {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_RECEIPT_INVALID",
      "Style-proof approval receipt proofUnitIds are invalid.",
    );
  }
  for (const [index, unitId] of receipt.proofUnitIds.entries()) {
    idValue(unitId, `styleProofApprovalReceipt.proofUnitIds[${index}]`);
  }
  if (
    !Array.isArray(receipt.approvedUnitIds) ||
    receipt.approvedUnitIds.length !== receipt.proofUnitIds.length ||
    !receipt.proofUnitIds.every(
      (unitId, index) => receipt.approvedUnitIds[index] === unitId,
    )
  ) {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_RECEIPT_INVALID",
      "Style-proof approval receipt approvedUnitIds are not the exact proof set.",
    );
  }
  if (
    !Array.isArray(receipt.evidence) ||
    receipt.evidence.length !== receipt.proofUnitIds.length
  ) {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_RECEIPT_INVALID",
      "Style-proof approval receipt evidence count is invalid.",
    );
  }
  for (const [index, evidence] of receipt.evidence.entries()) {
    const label = `styleProofApprovalReceipt.evidence[${index}]`;
    if (evidence.unitId !== receipt.proofUnitIds[index]) {
      fail(
        "LAYERED_PRODUCTION_STYLE_PROOF_RECEIPT_INVALID",
        `${label}.unitId is not in canonical proof order.`,
      );
    }
    sha256Value(evidence.sourceSha256, `${label}.sourceSha256`);
    artifactIdValue(
      evidence.sourceArtifactId,
      `${label}.sourceArtifactId`,
      evidence.sourceSha256,
    );
    integerValue(
      evidence.sourceBytes,
      `${label}.sourceBytes`,
      1,
      MAXIMUM_SOURCE_BYTES,
    );
    integerValue(evidence.width, `${label}.width`, 1, 8192);
    integerValue(evidence.height, `${label}.height`, 1, 8192);
    sha256Value(
      evidence.providerJobIdempotencyKey,
      `${label}.providerJobIdempotencyKey`,
    );
    sha256Value(
      evidence.providerRequestSha256,
      `${label}.providerRequestSha256`,
    );
    sha256Value(
      evidence.sealedReviewReceiptSha256,
      `${label}.sealedReviewReceiptSha256`,
    );
    artifactIdValue(
      evidence.sealedReviewArtifactId,
      `${label}.sealedReviewArtifactId`,
      evidence.sealedReviewReceiptSha256,
    );
    sha256Value(
      evidence.reviewBundleSha256,
      `${label}.reviewBundleSha256`,
    );
    artifactIdValue(
      evidence.reviewBundleArtifactId,
      `${label}.reviewBundleArtifactId`,
      evidence.reviewBundleSha256,
    );
    approvedValue(evidence.decision, `${label}.decision`);
  }
  normalizeCrossUnitReview(
    receipt.crossUnitReview,
    receipt.styleFingerprintSha256,
  );
  const authority = record(
    receipt.authority,
    "styleProofApprovalReceipt.authority",
  );
  exactKeys(authority, "styleProofApprovalReceipt.authority", [
    "providerExecution",
    "sourceMutation",
    "creativeDecision",
    "automaticAssembly",
    "automaticPromotion",
    "targetRepositoryMutation",
    "gitCommit",
    "gitPush",
    "publication",
    "forcePush",
  ]);
  if (Object.values(authority).some((entry) => entry !== false)) {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_RECEIPT_INVALID",
      "Style-proof approval receipt authority must remain entirely false.",
    );
  }
  if (receipt.evidenceSha256 !== receiptEvidenceSha256(receipt)) {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_RECEIPT_INVALID",
      "Style-proof approval receipt evidenceSha256 does not match its evidence payload.",
    );
  }
  if (
    receipt.requestSha256 !==
    sha256(normalizedApprovalRequestFromReceipt(receipt))
  ) {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_RECEIPT_INVALID",
      "Style-proof approval receipt requestSha256 does not match its normalized request.",
    );
  }
  const { receiptSha256, ...withoutReceiptSha256 } = receipt;
  if (sha256(withoutReceiptSha256) !== receiptSha256) {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_RECEIPT_INVALID",
      "Style-proof approval receipt receiptSha256 does not match its canonical payload.",
    );
  }
  return true;
}

function validateReceiptAgainstPlan(
  plan: CompiledLayeredProductionPlan,
  receipt: LayeredProductionStyleProofApprovalReceipt,
): void {
  verifyLayeredProductionPlan(plan);
  verifyLayeredProductionStyleProofApprovalReceipt(receipt);
  if (plan.styleProof.status !== "approval-required") {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
      "Style-proof approval may be applied only to an exact pending plan.",
    );
  }
  if (
    receipt.planId !== plan.planId ||
    receipt.pendingPlanSha256 !== plan.planSha256 ||
    receipt.styleFingerprintSha256 !== plan.styleFingerprintSha256
  ) {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
      "Style-proof approval receipt is not bound to this exact pending plan.",
    );
  }
  if (
    receipt.proofUnitIds.length !== plan.styleProof.unitIds.length ||
    !plan.styleProof.unitIds.every(
      (unitId, index) => receipt.proofUnitIds[index] === unitId,
    )
  ) {
    fail(
      "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
      "Style-proof approval receipt does not cover the exact canonical proof unit order.",
    );
  }
  const proofUnits = exactProofUnits(plan);
  for (const [index, unit] of proofUnits.entries()) {
    const evidence = receipt.evidence[index];
    if (
      evidence === undefined ||
      evidence.unitId !== unit.id ||
      evidence.width !== unit.dimensions.width ||
      evidence.height !== unit.dimensions.height ||
      evidence.providerJobIdempotencyKey !== unit.providerJob.idempotencyKey
    ) {
      fail(
        "LAYERED_PRODUCTION_STYLE_PROOF_APPROVAL_INVALID",
        `Style-proof evidence no longer matches exact unit ${unit.id}.`,
      );
    }
  }
}

export function applyLayeredProductionStyleProofApproval(
  plan: CompiledLayeredProductionPlan,
  receipt: LayeredProductionStyleProofApprovalReceipt,
): ApprovedLayeredProductionPlan {
  validateReceiptAgainstPlan(plan, receipt);
  const { planSha256: _pendingPlanSha256, ...pendingWithoutHash } = plan;
  const partial = {
    ...pendingWithoutHash,
    styleProof: freeze({
      ...plan.styleProof,
      status: "approved" as const,
      approval: receipt,
    }),
  };
  const approvedPlan = freeze({
    ...partial,
    planSha256: sha256(partial),
  }) as ApprovedLayeredProductionPlan;
  verifyLayeredProductionPlan(approvedPlan);
  return approvedPlan;
}
