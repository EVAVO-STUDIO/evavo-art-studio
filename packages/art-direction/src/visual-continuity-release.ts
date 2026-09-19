import type {
  CompiledVisualContinuityBible,
  CompiledVisualContinuitySession,
  VisualStudioTarget,
} from "./visual-continuity-types.js";
import {
  VISUAL_CONTINUITY_APPROVAL_KIND,
  VISUAL_CONTINUITY_APPROVED_HANDOFF_KIND,
  compileApprovedVisualContinuityStudioHandoff as compileApprovedHandoffBase,
  compileVisualContinuityApprovalReceipt as compileApprovalBase,
  visualContinuityHardeningSummary as hardeningSummaryBase,
} from "./visual-continuity-hardening.js";
import type {
  ApprovedVisualContinuityStudioHandoff as BaseApprovedVisualContinuityStudioHandoff,
  VisualContinuityApprovalInput,
  VisualContinuityApprovalReceipt,
} from "./visual-continuity-hardening.js";
import {
  arrayValue,
  fail,
  freeze,
  hash,
  record,
} from "./visual-continuity-internal.js";
import { verifyVisualContinuityBible } from "./visual-continuity-bible.js";
import { verifyVisualContinuitySession } from "./visual-continuity-session.js";
import { VISUAL_CONTINUITY_PROTOCOL_VERSION } from "./visual-continuity-types.js";

export type {
  VisualContinuityApprovalInput,
  VisualContinuityApprovalReceipt,
} from "./visual-continuity-hardening.js";

export interface ApprovedVisualContinuityStudioHandoff
  extends Omit<
    BaseApprovedVisualContinuityStudioHandoff,
    "receiverRoute" | "handoffSha256"
  > {
  readonly receiverRoute: Readonly<{
    readonly status: "adapter-required" | "receiver-validation-required";
    readonly adapterId?: string;
    readonly receiverId?: string;
    readonly workerTaskId?: string;
    readonly instruction: string;
  }>;
  readonly handoffSha256: string;
}

function receiverRoute(
  target: VisualStudioTarget,
): ApprovedVisualContinuityStudioHandoff["receiverRoute"] {
  if (target === "3d-studio") {
    return {
      status: "adapter-required",
      adapterId: "asset-fabricator-reference-handoff",
      receiverId: "evavo-3d-art-reference-brief",
      workerTaskId: "creative-media-3d-art-reference-brief",
      instruction:
        "Convert the approved continuity sources into the governed Asset Fabricator multi-view handoff first. That adapter must supply front, back, left, right and three-quarter views, plus top view where required, exact file evidence, dimensions, anchors, rights, geometry, materials, rigging and delivery intent. Only the resulting verified multi-view handoff may be passed to evavo-3d-art-reference-brief. The generic continuity envelope is not itself the receiver schema.",
    };
  }
  return {
    status: "receiver-validation-required",
    instruction:
      "No direct receiver adapter is asserted for this target. The receiving studio must verify the handoff SHA-256, every source SHA-256, every approval receipt and every continuity lock before creating derivatives, and must emit its own receiver receipt before execution or promotion.",
  };
}

export function compileVisualContinuityApprovalReceipt(
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  value: unknown,
): VisualContinuityApprovalReceipt {
  return compileApprovalBase(bible, session, value);
}

export function verifyVisualContinuityApprovalReceipt(
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  receipt: VisualContinuityApprovalReceipt,
): void {
  verifyVisualContinuityBible(bible);
  verifyVisualContinuitySession(bible, session);
  const canonical = compileApprovalBase(bible, session, {
    schemaVersion: receipt.schemaVersion,
    kind: receipt.kind,
    workItemId: receipt.workItemId,
    candidateSha256: receipt.candidateSha256,
    attemptSha256: receipt.attemptSha256,
    decision: receipt.decision,
    reviewer: receipt.reviewer,
    reviewedAt: receipt.reviewedAt,
    evidenceSha256: receipt.evidenceSha256,
    note: receipt.note,
  } satisfies VisualContinuityApprovalInput);
  if (hash(canonical) !== hash(receipt)) {
    fail(
      "VISUAL_CONTINUITY_APPROVAL_HASH_MISMATCH",
      `Approval receipt ${receipt.workItemId} is not the canonical receipt for the current bible, session, accepted candidate and decision evidence.`,
    );
  }
}

export function compileApprovedVisualContinuityStudioHandoff(
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  value: unknown,
): ApprovedVisualContinuityStudioHandoff {
  verifyVisualContinuityBible(bible);
  verifyVisualContinuitySession(bible, session);
  const input = record(value, "approvedHandoff");
  const receipts = arrayValue(
    input.approvalReceipts,
    "approvedHandoff.approvalReceipts",
    1,
    10_000,
  ) as readonly VisualContinuityApprovalReceipt[];
  receipts.forEach((receipt) =>
    verifyVisualContinuityApprovalReceipt(bible, session, receipt),
  );
  const base = compileApprovedHandoffBase(bible, session, value);
  const {
    receiverRoute: _receiverRoute,
    handoffSha256: _handoffSha256,
    ...baseWithoutReceiverAndDigest
  } = base;
  const unsigned = {
    ...baseWithoutReceiverAndDigest,
    receiverRoute: receiverRoute(base.targetStudio),
  };
  return freeze({
    ...unsigned,
    handoffSha256: hash(unsigned),
  });
}

export function verifyApprovedVisualContinuityStudioHandoff(
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  handoff: ApprovedVisualContinuityStudioHandoff,
): void {
  verifyVisualContinuityBible(bible);
  verifyVisualContinuitySession(bible, session);
  if (
    handoff.schemaVersion !== "1.0" ||
    handoff.kind !== VISUAL_CONTINUITY_APPROVED_HANDOFF_KIND ||
    handoff.protocolVersion !== VISUAL_CONTINUITY_PROTOCOL_VERSION ||
    handoff.bibleSha256 !== bible.bibleSha256 ||
    handoff.sessionSha256 !== session.sessionSha256 ||
    handoff.releaseStatus !== "approved-for-receiver-validation"
  ) {
    fail(
      "VISUAL_CONTINUITY_HANDOFF_STALE",
      "The approved handoff is not bound to the current protocol, bible and session.",
    );
  }
  handoff.approvalReceipts.forEach((receipt) =>
    verifyVisualContinuityApprovalReceipt(bible, session, receipt),
  );
  const canonical = compileApprovedVisualContinuityStudioHandoff(
    bible,
    session,
    {
      schemaVersion: "1.0",
      targetStudio: handoff.targetStudio,
      receiverProjectId: handoff.receiverProjectId,
      purpose: handoff.purpose,
      workItemIds: handoff.sources.map((source) => source.workItemId),
      requestedOutputs: handoff.requestedOutputs,
      notes: handoff.notes,
      approvalReceipts: handoff.approvalReceipts,
    },
  );
  if (hash(canonical) !== hash(handoff)) {
    fail(
      "VISUAL_CONTINUITY_HANDOFF_HASH_MISMATCH",
      "The approved continuity handoff is not the canonical source, continuity, approval and receiver-route package for the current session.",
    );
  }
}

export function visualContinuityHardeningSummary() {
  const base = hardeningSummaryBase();
  return freeze({
    ...base,
    receiverRouting: {
      directGenericReceiversClaimed: false as const,
      threeDimensionalRoute: {
        status: "adapter-required" as const,
        adapterId: "asset-fabricator-reference-handoff" as const,
        receiverId: "evavo-3d-art-reference-brief" as const,
        workerTaskId: "creative-media-3d-art-reference-brief" as const,
      },
      otherStudios:
        "receiver-validation-required" as const,
    },
    guarantees: [
      ...base.guarantees,
      "approval verification compares the entire canonical receipt rather than trusting caller-supplied derived fields",
      "approved handoff verification deterministically recompiles the complete source, continuity, approval and receiver-route package",
      "the live 3D receiver is reached only through its existing governed multi-view adapter schema",
      "no direct receiver is claimed for video, animation, texture, Godot, web or print until a matching validator exists",
    ] as const,
  });
}
