import { fingerprintBookIllustrationValue } from "./book-illustration-intelligence.js";
import {
  BOOK_ART_CANDIDATE_SET_CONTRACT,
  BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION,
  compileBookArtCandidateSetWorkOrder as compileUncanonicalBookArtCandidateSetWorkOrder,
  validateBookArtCandidateSetWorkOrder as validateUncanonicalBookArtCandidateSetWorkOrder,
  type BookArtCandidateSetWorkOrderCompilationResultV1,
} from "./book-art-candidate-set.js";

export async function compileBookArtCandidateSetWorkOrder(
  value: unknown,
): Promise<BookArtCandidateSetWorkOrderCompilationResultV1> {
  const result = await compileUncanonicalBookArtCandidateSetWorkOrder(value);
  if (result.status !== "ready" || !result.workOrder) return result;

  const workOrder = structuredClone(result.workOrder);
  const canonicalSourceBriefFingerprint = normalizeDigest(
    workOrder.sourceBriefFingerprint,
  );
  workOrder.sourceBriefFingerprint = canonicalSourceBriefFingerprint;
  workOrder.providerRequest.metadata.sourceBriefFingerprint =
    canonicalSourceBriefFingerprint;

  const { workOrderFingerprintSha256: _discarded, ...unsigned } = workOrder;
  workOrder.workOrderFingerprintSha256 =
    fingerprintBookIllustrationValue(unsigned);

  const blockers = await validateBookArtCandidateSetWorkOrder(workOrder);
  if (blockers.length) {
    return {
      outputKind: "evavo_book_art_candidate_set_work_order_compilation_result",
      schemaVersion: BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION,
      contract: BOOK_ART_CANDIDATE_SET_CONTRACT,
      status: "blocked",
      identity: structuredClone(result.identity),
      blockers,
      warnings: [...result.warnings],
      providerCallPerformed: false,
      candidateArtifactsWritten: false,
      selectionPerformed: false,
      promotionPerformed: false,
      publicationPerformed: false,
    };
  }

  return {
    ...result,
    workOrder,
    blockers: [],
  };
}

export async function validateBookArtCandidateSetWorkOrder(
  value: unknown,
): Promise<string[]> {
  const issues = await validateUncanonicalBookArtCandidateSetWorkOrder(value);
  const workOrder = record(value);
  const identity = record(workOrder?.identity);
  const metadata = record(record(workOrder?.providerRequest)?.metadata);
  if (!workOrder || !identity || !metadata) return unique(issues);

  const sourceBriefFingerprint = digest(workOrder.sourceBriefFingerprint);
  const metadataSourceBriefFingerprint = digest(metadata.sourceBriefFingerprint);
  if (
    !sourceBriefFingerprint ||
    !metadataSourceBriefFingerprint ||
    sourceBriefFingerprint !== metadataSourceBriefFingerprint ||
    metadata.sourceBriefFingerprint !== sourceBriefFingerprint
  ) {
    issues.push(
      "Candidate-set provider metadata sourceBriefFingerprint must use the exact canonical work-order digest.",
    );
  }

  const identityDiffers =
    metadata.workspaceId !== identity.workspaceId ||
    metadata.projectId !== identity.projectId ||
    metadata.bookId !== identity.bookId ||
    metadata.bookRequestId !== identity.requestId ||
    metadata.purpose !== workOrder.purpose;
  const editionDiffers =
    identity.editionId === undefined
      ? metadata.editionId !== undefined
      : metadata.editionId !== identity.editionId;
  if (identityDiffers || editionDiffers) {
    issues.push(
      "Candidate-set provider metadata identity differs from the exact work order.",
    );
  }

  return unique(issues);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeDigest(value: string): string {
  return value.startsWith("sha256:") ? value : `sha256:${value}`;
}

function digest(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeDigest(value);
  return /^sha256:[a-f0-9]{64}$/u.test(normalized) ? normalized : undefined;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((entry) => entry.trim()).filter(Boolean))];
}
