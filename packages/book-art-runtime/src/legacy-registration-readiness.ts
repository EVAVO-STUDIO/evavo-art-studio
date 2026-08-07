import {
  normalizeJson,
  sha256,
  stableStringify,
} from "@evavo/art-artifacts";
import type {
  BookArtIdentityV1,
  BookArtPurpose,
} from "@evavo/art-contracts";
import {
  compileLegacyBookArtByteRegistration,
  type LegacyBookArtByteRegistrationCompilationResultV1,
} from "./legacy-registration.js";

export const LEGACY_BOOK_ART_DRY_RUN_READINESS_SCHEMA_VERSION = 1 as const;
export const LEGACY_BOOK_ART_DRY_RUN_READINESS_CONTRACT =
  "evavo_book_art_legacy_dry_run_readiness_v1" as const;

export interface LegacyBookArtDryRunReadinessReceiptV1 {
  outputKind: "evavo_legacy_book_art_dry_run_readiness_receipt";
  schemaVersion: typeof LEGACY_BOOK_ART_DRY_RUN_READINESS_SCHEMA_VERSION;
  contract: typeof LEGACY_BOOK_ART_DRY_RUN_READINESS_CONTRACT;
  status: "blocked" | "ready";
  identity: BookArtIdentityV1;
  purpose?: BookArtPurpose;
  registrationPlanFingerprintSha256?: string;
  stateImportFingerprintSha256?: string;
  sourceContentSha256?: string;
  sourceByteLength?: number;
  blockers: string[];
  warnings: string[];
  dryRunOnly: true;
  sourceArtifactWriteAttempted: false;
  evidenceArtifactWriteAttempted: false;
  providerCallPerformed: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  canonicalWriterChanged: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
  readinessFingerprintSha256: string;
}

/**
 * Fail-closed, compile-only readiness boundary for importing exact legacy
 * Website Book Art bytes into Art Studio.
 *
 * This function deliberately accepts no ArtifactStore or RuntimeRepository, so
 * a readiness check cannot persist bytes, submit jobs, call providers, select,
 * promote, bind artwork into a book, change the canonical writer or publish.
 */
export async function assessLegacyBookArtDryRunReadiness(
  value: unknown,
  bytes: Uint8Array,
): Promise<LegacyBookArtDryRunReadinessReceiptV1> {
  try {
    const compilation = await compileLegacyBookArtByteRegistration(value, bytes);
    return receiptFromCompilation(compilation);
  } catch {
    return blockedReceipt([
      "Legacy Book Art dry-run readiness input could not be inspected safely.",
    ]);
  }
}

function receiptFromCompilation(
  compilation: LegacyBookArtByteRegistrationCompilationResultV1,
): LegacyBookArtDryRunReadinessReceiptV1 {
  const plan = compilation.plan;
  const unsigned = {
    outputKind: "evavo_legacy_book_art_dry_run_readiness_receipt" as const,
    schemaVersion: LEGACY_BOOK_ART_DRY_RUN_READINESS_SCHEMA_VERSION,
    contract: LEGACY_BOOK_ART_DRY_RUN_READINESS_CONTRACT,
    status: compilation.status,
    identity: cloneIdentity(compilation.identity),
    ...(compilation.purpose === undefined ? {} : { purpose: compilation.purpose }),
    ...(plan === undefined ? {} : {
      registrationPlanFingerprintSha256: plan.registrationPlanFingerprintSha256,
      stateImportFingerprintSha256: plan.stateImportFingerprintSha256,
      sourceContentSha256: plan.contentSha256,
      sourceByteLength: plan.byteLength,
    }),
    blockers: unique(compilation.blockers),
    warnings: unique(compilation.warnings),
    dryRunOnly: true as const,
    sourceArtifactWriteAttempted: false as const,
    evidenceArtifactWriteAttempted: false as const,
    providerCallPerformed: false as const,
    selectionPerformed: false as const,
    promotionPerformed: false as const,
    bookUseBindingCreated: false as const,
    canonicalWriterChanged: false as const,
    runtimeCutoverApproved: false as const,
    publicationPerformed: false as const,
  };
  return {
    ...unsigned,
    readinessFingerprintSha256: fingerprint(unsigned),
  };
}

function blockedReceipt(
  blockers: string[],
): LegacyBookArtDryRunReadinessReceiptV1 {
  const unsigned = {
    outputKind: "evavo_legacy_book_art_dry_run_readiness_receipt" as const,
    schemaVersion: LEGACY_BOOK_ART_DRY_RUN_READINESS_SCHEMA_VERSION,
    contract: LEGACY_BOOK_ART_DRY_RUN_READINESS_CONTRACT,
    status: "blocked" as const,
    identity: emptyIdentity(),
    blockers: unique(blockers),
    warnings: [] as string[],
    dryRunOnly: true as const,
    sourceArtifactWriteAttempted: false as const,
    evidenceArtifactWriteAttempted: false as const,
    providerCallPerformed: false as const,
    selectionPerformed: false as const,
    promotionPerformed: false as const,
    bookUseBindingCreated: false as const,
    canonicalWriterChanged: false as const,
    runtimeCutoverApproved: false as const,
    publicationPerformed: false as const,
  };
  return {
    ...unsigned,
    readinessFingerprintSha256: fingerprint(unsigned),
  };
}

function fingerprint(value: unknown): string {
  return sha256(stableStringify(normalizeJson(value)));
}

function cloneIdentity(value: BookArtIdentityV1): BookArtIdentityV1 {
  return {
    workspaceId: value.workspaceId,
    projectId: value.projectId,
    bookId: value.bookId,
    ...(value.editionId === undefined ? {} : { editionId: value.editionId }),
    requestId: value.requestId,
  };
}

function emptyIdentity(): BookArtIdentityV1 {
  return {
    workspaceId: "",
    projectId: "",
    bookId: "",
    requestId: "",
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}
