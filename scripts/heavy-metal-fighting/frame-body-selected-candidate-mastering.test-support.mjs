import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  compileHmfFrameBodySelectionDecision,
  materializeHmfFrameBodySelectionDecision,
} from "./frame-body-selection-decision.mjs";
import {
  cleanup,
  humanDecisionFor,
  selectionFixture,
} from "./frame-body-selection-decision.test-support.mjs";

export { cleanup };

export async function masteringFixture({ failedCriterionId = null } = {}) {
  const value = await selectionFixture({ failedCriterionId });
  const selectionDecision = await compileHmfFrameBodySelectionDecision({
    creativeReviewDecision: value.creativeReviewDecision,
    workspaceRoot: value.root,
    humanDecision: humanDecisionFor(value.creativeReviewDecision),
  });
  const selectionResult = await materializeHmfFrameBodySelectionDecision(
    selectionDecision,
  );
  const receipts = JSON.parse(
    await readFile(path.join(value.root, ...value.receiptPath.split("/")), "utf8"),
  );
  return {
    ...value,
    selectionDecision,
    selectionResult,
    receipts,
  };
}

export function masteringRequestFor(selectionDecision, overrides = {}) {
  return {
    actorId: overrides.actorId ?? "evavo-art-studio-mastering",
    occurredAt: overrides.occurredAt ?? "2026-08-13T08:06:00.000Z",
    attestations: {
      candidateSha256: selectionDecision.selectionEvidence.candidateSha256,
      selectionDecisionSha256: selectionDecision.selectionDecisionSha256,
      selectionEvidenceSha256: selectionDecision.selectionEvidenceSha256,
      selectionReceiptSha256: selectionDecision.receipt.receiptSha256,
      exactByteMasteringOnly: true,
      noNamedHumanApprovalGameRepositoryMutationOrPublicationPerformed: true,
      ...(overrides.attestations ?? {}),
    },
  };
}
