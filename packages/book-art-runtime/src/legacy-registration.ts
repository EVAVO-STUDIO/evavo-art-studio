import path from "node:path";

import {
  normalizeJson,
  sha256,
  stableStringify,
  type ArtifactStore,
  type JsonValue,
  type StoredArtifact,
} from "@evavo/art-artifacts";
import {
  importLegacyWebsiteBookArtState,
  validateLegacyCompatibleBookArtArtifactReceipt,
  type BookArtArtifactReceiptV1,
  type BookArtIdentityV1,
  type BookArtPurpose,
  type LegacyBookArtReferenceTranslationV1,
  type LegacyWebsiteBookArtSourceEvidenceV1,
  type LegacyWebsiteBookArtStateImportInputV1,
  type LegacyWebsiteBookArtStateImportResultV1,
} from "@evavo/art-contracts";
import { decodeSpriteFrame } from "@evavo/art-quality";

export const LEGACY_BOOK_ART_BYTE_REGISTRATION_SCHEMA_VERSION = 1 as const;
export const LEGACY_BOOK_ART_BYTE_REGISTRATION_CONTRACT =
  "evavo_book_art_legacy_byte_registration_v1" as const;

export interface LegacyBookArtByteRegistrationInputV1 {
  outputKind: "evavo_legacy_book_art_byte_registration_input";
  schemaVersion: typeof LEGACY_BOOK_ART_BYTE_REGISTRATION_SCHEMA_VERSION;
  registrationId: string;
  registeredAt: string;
  purpose: BookArtPurpose;
  sourceRepository: "EVAVO-STUDIO/Website";
  sourceCommitSha: string;
  sourcePath: string;
  stateImportInput: LegacyWebsiteBookArtStateImportInputV1;
}

export interface LegacyBookArtByteRegistrationPlanV1 {
  outputKind: "evavo_legacy_book_art_byte_registration_plan";
  schemaVersion: typeof LEGACY_BOOK_ART_BYTE_REGISTRATION_SCHEMA_VERSION;
  contract: typeof LEGACY_BOOK_ART_BYTE_REGISTRATION_CONTRACT;
  registrationId: string;
  registeredAt: string;
  identity: BookArtIdentityV1;
  purpose: BookArtPurpose;
  sourceRepository: "EVAVO-STUDIO/Website";
  sourceCommitSha: string;
  sourcePath: string;
  sourceFileName: string;
  legacyReceipt: BookArtArtifactReceiptV1;
  sourceEvidence: LegacyWebsiteBookArtSourceEvidenceV1;
  legacyReferenceTranslations: LegacyBookArtReferenceTranslationV1[];
  stateImportFingerprintSha256: string;
  contentSha256: string;
  byteLength: number;
  mimeType: string;
  widthPx: number;
  heightPx: number;
  registrationPlanFingerprintSha256: string;
  exactSourceBytesPreserved: true;
  artifactBytesRewritten: false;
  legacyApprovalPromotedAutomatically: false;
  technicalQaRequired: true;
  selectionRequired: true;
  promotionRequired: true;
  bookUseBindingRequired: true;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export interface LegacyBookArtByteRegistrationCompilationResultV1 {
  outputKind: "evavo_legacy_book_art_byte_registration_compilation_result";
  schemaVersion: typeof LEGACY_BOOK_ART_BYTE_REGISTRATION_SCHEMA_VERSION;
  status: "blocked" | "ready";
  identity: BookArtIdentityV1;
  purpose?: BookArtPurpose;
  plan?: LegacyBookArtByteRegistrationPlanV1;
  blockers: string[];
  warnings: string[];
  sourceArtifactWritten: false;
  evidenceArtifactWritten: false;
  exactSourceBytesPreserved: false;
  artifactBytesRewritten: false;
  legacyApprovalPromotedAutomatically: false;
  technicalQaRequired: true;
  selectionRequired: true;
  promotionRequired: true;
  bookUseBindingRequired: true;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export interface LegacyBookArtByteRegistrationEvidenceV1 {
  outputKind: "evavo_legacy_book_art_byte_registration_evidence";
  schemaVersion: typeof LEGACY_BOOK_ART_BYTE_REGISTRATION_SCHEMA_VERSION;
  contract: typeof LEGACY_BOOK_ART_BYTE_REGISTRATION_CONTRACT;
  registrationPlanFingerprintSha256: string;
  registrationFingerprintSha256: string;
  registrationId: string;
  registeredAt: string;
  registeredBy: string;
  identity: BookArtIdentityV1;
  purpose: BookArtPurpose;
  sourceRepository: "EVAVO-STUDIO/Website";
  sourceCommitSha: string;
  sourcePath: string;
  stateImportFingerprintSha256: string;
  legacyCandidateId: string;
  legacyArtifactReference: string;
  sourceBriefFingerprint: string;
  sourceContentSha256: string;
  sourceByteLength: number;
  sourceMimeType: string;
  sourceWidthPx: number;
  sourceHeightPx: number;
  registeredArtifactId: string;
  registeredArtifactReference: string;
  registeredContentHash: string;
  registeredDescriptorSha256: string;
  artifactVerificationPassed: true;
  exactSourceBytesPreserved: true;
  artifactBytesRewritten: false;
  legacyApprovalPromotedAutomatically: false;
  technicalQaRequired: true;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export interface LegacyBookArtByteRegistrationResultV1 {
  outputKind: "evavo_legacy_book_art_byte_registration_result";
  schemaVersion: typeof LEGACY_BOOK_ART_BYTE_REGISTRATION_SCHEMA_VERSION;
  status: "blocked" | "registered";
  identity: BookArtIdentityV1;
  purpose?: BookArtPurpose;
  plan?: LegacyBookArtByteRegistrationPlanV1;
  sourceArtifact?: StoredArtifact;
  evidenceArtifact?: StoredArtifact;
  registeredArtifactReference?: string;
  registrationFingerprintSha256?: string;
  blockers: string[];
  warnings: string[];
  sourceArtifactWritten: boolean;
  evidenceArtifactWritten: boolean;
  exactSourceBytesPreserved: boolean;
  artifactBytesRewritten: false;
  legacyApprovalPromotedAutomatically: false;
  technicalQaRequired: true;
  selectionRequired: true;
  promotionRequired: true;
  bookUseBindingRequired: true;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export class LegacyBookArtByteRegistrationError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "LegacyBookArtByteRegistrationError";
    this.code = code;
  }
}

const MAXIMUM_SOURCE_BYTES = 512 * 1024 * 1024;
const MAXIMUM_SOURCE_PIXELS = 50_000_000;
const REGISTRATION_ID = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,199}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const PURPOSES = new Set<BookArtPurpose>([
  "front_cover_art",
  "full_wrap_art",
]);
const INPUT_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "registrationId",
  "registeredAt",
  "purpose",
  "sourceRepository",
  "sourceCommitSha",
  "sourcePath",
  "stateImportInput",
]);
const FORMAT_TO_MIME = new Map<string, string>([
  ["png", "image/png"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
  ["tiff", "image/tiff"],
]);

export async function compileLegacyBookArtByteRegistration(
  value: unknown,
  bytes: Uint8Array,
): Promise<LegacyBookArtByteRegistrationCompilationResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const input = record(value);
  if (!input) {
    return blockedCompilation(
      emptyIdentity(),
      undefined,
      ["Legacy Book Art byte-registration input must be one object."],
      warnings,
    );
  }
  rejectUnknown(
    input,
    INPUT_FIELDS,
    "Legacy Book Art byte-registration input",
    blockers,
  );
  if (
    input.outputKind !== "evavo_legacy_book_art_byte_registration_input" ||
    input.schemaVersion !== LEGACY_BOOK_ART_BYTE_REGISTRATION_SCHEMA_VERSION
  ) {
    blockers.push("Legacy Book Art byte-registration kind or version is invalid.");
  }

  const registrationId = text(input.registrationId);
  if (!isRegistrationId(registrationId)) {
    blockers.push("Legacy Book Art byte-registration registrationId is invalid.");
  }
  const registeredAt = text(input.registeredAt);
  if (!isTimestamp(registeredAt)) {
    blockers.push(
      "Legacy Book Art byte-registration registeredAt must be canonical UTC ISO-8601.",
    );
  }
  const purpose = text(input.purpose) as BookArtPurpose;
  if (!PURPOSES.has(purpose)) {
    blockers.push("Legacy Book Art byte-registration purpose is invalid.");
  }
  if (input.sourceRepository !== "EVAVO-STUDIO/Website") {
    blockers.push(
      "Legacy Book Art byte-registration sourceRepository must be EVAVO-STUDIO/Website.",
    );
  }
  const sourceCommitSha = text(input.sourceCommitSha);
  if (!COMMIT_SHA.test(sourceCommitSha)) {
    blockers.push(
      "Legacy Book Art byte-registration sourceCommitSha must be one exact lowercase 40-character commit SHA.",
    );
  }
  const sourcePath = text(input.sourcePath);
  const normalizedSourcePath = normalizeSourcePath(sourcePath);
  if (normalizedSourcePath === undefined) {
    blockers.push(
      "Legacy Book Art byte-registration sourcePath must be one normalized relative repository path.",
    );
  }

  const stateInputRecord = record(input.stateImportInput);
  let stateImport: LegacyWebsiteBookArtStateImportResultV1 | undefined;
  if (!stateInputRecord) {
    blockers.push(
      "Legacy Book Art byte-registration stateImportInput must be one object.",
    );
  } else {
    try {
      stateImport = importLegacyWebsiteBookArtState(
        input.stateImportInput as LegacyWebsiteBookArtStateImportInputV1,
      );
    } catch (error: unknown) {
      blockers.push(
        message(error, "Legacy Website Book Art state import failed."),
      );
    }
  }
  const receiptRecord = record(stateImport?.receipt);
  const receipt = receiptRecord as unknown as BookArtArtifactReceiptV1;
  const identity = cloneIdentity(receiptRecord?.identity ?? stateImport?.identity);
  const sourceEvidenceRecord = record(stateImport?.sourceEvidence);
  const sourceEvidence = cloneSourceEvidence(sourceEvidenceRecord);

  if (stateImport) {
    if (!sourceEvidenceRecord) {
      blockers.push(
        "Legacy Website Book Art state-import sourceEvidence must be one object.",
      );
    }
    if (
      stateImport.outputKind !==
        "evavo_legacy_website_book_art_state_import_result" ||
      stateImport.schemaVersion !== 1
    ) {
      blockers.push(
        "Legacy Website Book Art state-import result kind or version is invalid.",
      );
    }
    if (
      stateImport.status !== "candidate_imported" &&
      stateImport.status !== "selection_evidence_imported"
    ) {
      blockers.push(
        "Legacy Website Book Art state-import result must contain an eligible imported candidate.",
      );
    }
    if (stateImport.blockers.length !== 0) {
      blockers.push(
        "Legacy Website Book Art state-import result still contains blockers.",
      );
      blockers.push(...stateImport.blockers);
    }
    warnings.push(...stateImport.warnings);
    if (
      stateImport.promotionRequired !== true ||
      stateImport.legacyApprovalPromotedAutomatically !== false ||
      stateImport.artifactBytesRewritten !== false ||
      stateImport.publicationPerformed !== false
    ) {
      blockers.push(
        "Legacy Website Book Art state-import result lost its non-authoritative migration boundary.",
      );
    }
  }

  let referenceTranslations: LegacyBookArtReferenceTranslationV1[] = [];
  if (!receiptRecord) {
    blockers.push("Legacy Book Art byte-registration requires one imported artifact receipt.");
  } else {
    const validation = validateLegacyCompatibleBookArtArtifactReceipt(receipt);
    blockers.push(...validation.issues);
    referenceTranslations = validation.referenceTranslations.map((entry) => ({ ...entry }));
    if (receipt.status !== "candidate" && receipt.status !== "review_required") {
      blockers.push(
        "Legacy Book Art byte-registration accepts only candidate or review_required legacy state.",
      );
    }
    if (
      (stateImport?.status === "candidate_imported" && receipt.status !== "candidate") ||
      (stateImport?.status === "selection_evidence_imported" &&
        receipt.status !== "review_required")
    ) {
      blockers.push(
        "Legacy Book Art byte-registration state-import status and receipt status differ.",
      );
    }
    if (
      receipt.promotionReceiptSha256 !== undefined ||
      receipt.promotedBy !== undefined ||
      receipt.promotedAt !== undefined
    ) {
      blockers.push(
        "Legacy Book Art byte-registration cannot import legacy promotion as Art Studio approval.",
      );
    }
    if (receipt.provenance?.rightsStatus === "blocked") {
      blockers.push("Rights-blocked legacy artwork cannot be registered for migration.");
    }
    if (!identitiesEqual(identity, cloneIdentity(stateImport?.identity))) {
      blockers.push(
        "Legacy Book Art byte-registration state-import and receipt identities differ.",
      );
    }
  }

  const sourceBytes = Buffer.from(bytes);
  if (sourceBytes.byteLength <= 0 || sourceBytes.byteLength > MAXIMUM_SOURCE_BYTES) {
    blockers.push(
      `Legacy Book Art source bytes must contain 1 to ${MAXIMUM_SOURCE_BYTES} bytes.`,
    );
  }
  const actualContentSha256 = sha256(sourceBytes);
  if (receiptRecord) {
    if (normalizeSha(receipt.contentSha256) !== actualContentSha256) {
      blockers.push(
        "Legacy Book Art source bytes do not match the imported receipt contentSha256.",
      );
    }
    if (receipt.byteLength !== sourceBytes.byteLength) {
      blockers.push(
        "Legacy Book Art source byte length does not match the imported receipt.",
      );
    }
    if (normalizeSha(receipt.artifactFingerprint) !== actualContentSha256) {
      blockers.push(
        "Legacy Book Art imported artifactFingerprint does not identify the exact source bytes.",
      );
    }
  }

  let actualMimeType = "";
  let actualWidthPx = 0;
  let actualHeightPx = 0;
  if (blockers.length === 0) {
    try {
      const decoded = await decodeSpriteFrame(sourceBytes, {
        maximumInputBytes: MAXIMUM_SOURCE_BYTES,
        maximumPixels: MAXIMUM_SOURCE_PIXELS,
      });
      actualMimeType = FORMAT_TO_MIME.get(decoded.sourceFormat) ?? "";
      actualWidthPx = decoded.width;
      actualHeightPx = decoded.height;
      if (!actualMimeType) {
        blockers.push(
          `Legacy Book Art source format ${decoded.sourceFormat || "unknown"} is unsupported.`,
        );
      }
      if (receipt.mimeType !== actualMimeType) {
        blockers.push(
          "Legacy Book Art decoded MIME type does not match the imported receipt.",
        );
      }
      if (
        receipt.widthPx !== actualWidthPx ||
        receipt.heightPx !== actualHeightPx
      ) {
        blockers.push(
          "Legacy Book Art decoded dimensions do not match the imported receipt.",
        );
      }
    } catch (error: unknown) {
      blockers.push(message(error, "Legacy Book Art source image decoding failed."));
    }
  }

  if (
    blockers.length ||
    !receiptRecord ||
    normalizedSourcePath === undefined ||
    !PURPOSES.has(purpose)
  ) {
    return blockedCompilation(identity, PURPOSES.has(purpose) ? purpose : undefined, blockers, warnings);
  }

  const sourceFileName = path.posix.basename(normalizedSourcePath);
  const withoutFingerprint = {
    outputKind: "evavo_legacy_book_art_byte_registration_plan" as const,
    schemaVersion: LEGACY_BOOK_ART_BYTE_REGISTRATION_SCHEMA_VERSION,
    contract: LEGACY_BOOK_ART_BYTE_REGISTRATION_CONTRACT,
    registrationId,
    registeredAt,
    identity,
    purpose,
    sourceRepository: "EVAVO-STUDIO/Website" as const,
    sourceCommitSha,
    sourcePath: normalizedSourcePath,
    sourceFileName,
    legacyReceipt: cloneReceipt(receipt),
    sourceEvidence,
    legacyReferenceTranslations: referenceTranslations,
    stateImportFingerprintSha256: fingerprint(stateImport),
    contentSha256: actualContentSha256,
    byteLength: sourceBytes.byteLength,
    mimeType: actualMimeType,
    widthPx: actualWidthPx,
    heightPx: actualHeightPx,
    exactSourceBytesPreserved: true as const,
    artifactBytesRewritten: false as const,
    legacyApprovalPromotedAutomatically: false as const,
    technicalQaRequired: true as const,
    selectionRequired: true as const,
    promotionRequired: true as const,
    bookUseBindingRequired: true as const,
    runtimeCutoverApproved: false as const,
    publicationPerformed: false as const,
  };
  const plan: LegacyBookArtByteRegistrationPlanV1 = {
    ...withoutFingerprint,
    registrationPlanFingerprintSha256: fingerprint(withoutFingerprint),
  };
  warnings.push(
    "Registration preserves the exact legacy bytes as an unapproved source artifact; technical QA, selection, promotion and Book use binding remain separate.",
  );
  return {
    outputKind: "evavo_legacy_book_art_byte_registration_compilation_result",
    schemaVersion: LEGACY_BOOK_ART_BYTE_REGISTRATION_SCHEMA_VERSION,
    status: "ready",
    identity,
    purpose,
    plan,
    blockers: [],
    warnings: unique(warnings),
    sourceArtifactWritten: false,
    evidenceArtifactWritten: false,
    exactSourceBytesPreserved: false,
    artifactBytesRewritten: false,
    legacyApprovalPromotedAutomatically: false,
    technicalQaRequired: true,
    selectionRequired: true,
    promotionRequired: true,
    bookUseBindingRequired: true,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

export async function registerLegacyBookArtBytes(
  value: unknown,
  bytes: Uint8Array,
  options: Readonly<{
    artifacts: ArtifactStore;
    actor: string;
  }>,
): Promise<LegacyBookArtByteRegistrationResultV1> {
  const compilation = await compileLegacyBookArtByteRegistration(value, bytes);
  if (compilation.status !== "ready" || !compilation.plan) {
    return blockedRegistration(compilation);
  }
  const actor = options.actor.trim();
  if (!actor || actor.length > 256 || actor.includes("\0")) {
    return {
      ...blockedRegistration(compilation),
      purpose: compilation.plan.purpose,
      plan: compilation.plan,
      blockers: ["Legacy Book Art byte-registration actor is invalid."],
    };
  }

  const plan = compilation.plan;
  const sourceBytes = Buffer.from(bytes);
  const sourceArtifact = await options.artifacts.put(sourceBytes, {
    mediaType: plan.mimeType,
    storageClass: "source",
    fileName: plan.sourceFileName,
    labels: {
      artifactRole: "book-art-legacy-source",
      approvalState: "unapproved",
      migrationMode: "legacy-byte-registration",
      registrationId: plan.registrationId,
      registrationPlanFingerprint: plan.registrationPlanFingerprintSha256,
      workspaceId: plan.identity.workspaceId,
      projectId: plan.identity.projectId,
      bookId: plan.identity.bookId,
      requestId: plan.identity.requestId,
      ...(plan.identity.editionId === undefined
        ? {}
        : { editionId: plan.identity.editionId }),
      purpose: plan.purpose,
      sourceRepository: plan.sourceRepository,
      sourceCommitSha: plan.sourceCommitSha,
      sourceBriefFingerprint: normalizeSha(plan.legacyReceipt.sourceBriefFingerprint),
      legacyCandidateId: plan.legacyReceipt.artifactId,
      legacyArtifactReferenceSha256: sha256(plan.legacyReceipt.artifactReference),
      sourcePathSha256: sha256(plan.sourcePath),
      exactBytesPreserved: "true",
      finalDeliverable: "false",
      requiresBlockingQa: "true",
      selectionRequired: "true",
      promotionRequired: "true",
      bookUseBindingRequired: "true",
    },
    metadata: normalizeJson({
      contract: LEGACY_BOOK_ART_BYTE_REGISTRATION_CONTRACT,
      registrationId: plan.registrationId,
      registrationPlanFingerprintSha256: plan.registrationPlanFingerprintSha256,
      registeredAt: plan.registeredAt,
      registeredBy: actor,
      identity: plan.identity,
      purpose: plan.purpose,
      source: {
        repository: plan.sourceRepository,
        commitSha: plan.sourceCommitSha,
        path: plan.sourcePath,
      },
      legacyReceipt: plan.legacyReceipt,
      sourceEvidence: plan.sourceEvidence,
      legacyReferenceTranslations: plan.legacyReferenceTranslations,
      stateImportFingerprintSha256: plan.stateImportFingerprintSha256,
      exactSourceBytesPreserved: true,
      artifactBytesRewritten: false,
      legacyApprovalPromotedAutomatically: false,
      technicalQaRequired: true,
      selectionRequired: true,
      promotionRequired: true,
      bookUseBindingRequired: true,
      runtimeCutoverApproved: false,
      publicationPerformed: false,
    }),
  });
  const verification = await options.artifacts.verify(sourceArtifact.artifactId);
  const storedBytes = await options.artifacts.read(sourceArtifact.artifactId);
  if (
    !verification.exists ||
    !verification.descriptorValid ||
    !verification.contentValid ||
    verification.actualContentSha256 !== plan.contentSha256 ||
    verification.actualSizeBytes !== plan.byteLength ||
    !storedBytes.equals(sourceBytes)
  ) {
    throw new LegacyBookArtByteRegistrationError(
      "LEGACY_BOOK_ART_SOURCE_VERIFICATION_FAILED",
      "Registered legacy Book Art bytes failed immutable round-trip verification.",
    );
  }

  const registeredArtifactReference =
    `book-artifact://legacy/registered/${sourceArtifact.artifactId}`;
  const evidenceWithoutFingerprint = {
    outputKind: "evavo_legacy_book_art_byte_registration_evidence" as const,
    schemaVersion: LEGACY_BOOK_ART_BYTE_REGISTRATION_SCHEMA_VERSION,
    contract: LEGACY_BOOK_ART_BYTE_REGISTRATION_CONTRACT,
    registrationPlanFingerprintSha256: plan.registrationPlanFingerprintSha256,
    registrationId: plan.registrationId,
    registeredAt: plan.registeredAt,
    registeredBy: actor,
    identity: plan.identity,
    purpose: plan.purpose,
    sourceRepository: plan.sourceRepository,
    sourceCommitSha: plan.sourceCommitSha,
    sourcePath: plan.sourcePath,
    stateImportFingerprintSha256: plan.stateImportFingerprintSha256,
    legacyCandidateId: plan.legacyReceipt.artifactId,
    legacyArtifactReference: plan.legacyReceipt.artifactReference,
    sourceBriefFingerprint: normalizeSha(plan.legacyReceipt.sourceBriefFingerprint),
    sourceContentSha256: plan.contentSha256,
    sourceByteLength: plan.byteLength,
    sourceMimeType: plan.mimeType,
    sourceWidthPx: plan.widthPx,
    sourceHeightPx: plan.heightPx,
    registeredArtifactId: sourceArtifact.artifactId,
    registeredArtifactReference,
    registeredContentHash: sourceArtifact.contentHash,
    registeredDescriptorSha256: sourceArtifact.descriptorSha256,
    artifactVerificationPassed: true as const,
    exactSourceBytesPreserved: true as const,
    artifactBytesRewritten: false as const,
    legacyApprovalPromotedAutomatically: false as const,
    technicalQaRequired: true as const,
    selectionPerformed: false as const,
    promotionPerformed: false as const,
    bookUseBindingCreated: false as const,
    runtimeCutoverApproved: false as const,
    publicationPerformed: false as const,
  };
  const registrationFingerprintSha256 = fingerprint(evidenceWithoutFingerprint);
  const evidence: LegacyBookArtByteRegistrationEvidenceV1 = {
    ...evidenceWithoutFingerprint,
    registrationFingerprintSha256,
  };
  const evidenceArtifact = await options.artifacts.put(
    `${JSON.stringify(evidence, null, 2)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: `${plan.registrationId}.legacy-byte-registration.json`,
      sourceArtifacts: [sourceArtifact.artifactId],
      labels: {
        artifactRole: "book-art-legacy-byte-registration-evidence",
        qualityState: "passed",
        approvalState: "unapproved",
        migrationMode: "legacy-byte-registration",
        registrationId: plan.registrationId,
        registrationFingerprint: registrationFingerprintSha256,
        registeredArtifactId: sourceArtifact.artifactId,
        sourceContentSha256: plan.contentSha256,
        exactBytesPreserved: "true",
        artifactBytesRewritten: "false",
        promotionRequired: "true",
        runtimeCutoverApproved: "false",
      },
      metadata: normalizeJson({
        contract: LEGACY_BOOK_ART_BYTE_REGISTRATION_CONTRACT,
        registrationPlanFingerprintSha256: plan.registrationPlanFingerprintSha256,
        stateImportFingerprintSha256: plan.stateImportFingerprintSha256,
        registrationFingerprintSha256,
        sourceArtifactId: sourceArtifact.artifactId,
        registeredArtifactReference,
        exactSourceBytesPreserved: true,
        artifactBytesRewritten: false,
        legacyApprovalPromotedAutomatically: false,
        technicalQaRequired: true,
        selectionPerformed: false,
        promotionPerformed: false,
        bookUseBindingCreated: false,
        runtimeCutoverApproved: false,
        publicationPerformed: false,
      }),
    },
  );
  const evidenceVerification = await options.artifacts.verify(
    evidenceArtifact.artifactId,
  );
  if (
    !evidenceVerification.exists ||
    !evidenceVerification.descriptorValid ||
    !evidenceVerification.contentValid
  ) {
    throw new LegacyBookArtByteRegistrationError(
      "LEGACY_BOOK_ART_EVIDENCE_VERIFICATION_FAILED",
      "Legacy Book Art registration evidence failed immutable verification.",
    );
  }

  return {
    outputKind: "evavo_legacy_book_art_byte_registration_result",
    schemaVersion: LEGACY_BOOK_ART_BYTE_REGISTRATION_SCHEMA_VERSION,
    status: "registered",
    identity: plan.identity,
    purpose: plan.purpose,
    plan,
    sourceArtifact,
    evidenceArtifact,
    registeredArtifactReference,
    registrationFingerprintSha256,
    blockers: [],
    warnings: compilation.warnings,
    sourceArtifactWritten: true,
    evidenceArtifactWritten: true,
    exactSourceBytesPreserved: true,
    artifactBytesRewritten: false,
    legacyApprovalPromotedAutomatically: false,
    technicalQaRequired: true,
    selectionRequired: true,
    promotionRequired: true,
    bookUseBindingRequired: true,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

function blockedCompilation(
  identity: BookArtIdentityV1,
  purpose: BookArtPurpose | undefined,
  blockers: string[],
  warnings: string[],
): LegacyBookArtByteRegistrationCompilationResultV1 {
  return {
    outputKind: "evavo_legacy_book_art_byte_registration_compilation_result",
    schemaVersion: LEGACY_BOOK_ART_BYTE_REGISTRATION_SCHEMA_VERSION,
    status: "blocked",
    identity,
    ...(purpose === undefined ? {} : { purpose }),
    blockers: unique(blockers),
    warnings: unique(warnings),
    sourceArtifactWritten: false,
    evidenceArtifactWritten: false,
    exactSourceBytesPreserved: false,
    artifactBytesRewritten: false,
    legacyApprovalPromotedAutomatically: false,
    technicalQaRequired: true,
    selectionRequired: true,
    promotionRequired: true,
    bookUseBindingRequired: true,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

function blockedRegistration(
  compilation: LegacyBookArtByteRegistrationCompilationResultV1,
): LegacyBookArtByteRegistrationResultV1 {
  return {
    outputKind: "evavo_legacy_book_art_byte_registration_result",
    schemaVersion: LEGACY_BOOK_ART_BYTE_REGISTRATION_SCHEMA_VERSION,
    status: "blocked",
    identity: compilation.identity,
    ...(compilation.purpose === undefined ? {} : { purpose: compilation.purpose }),
    ...(compilation.plan === undefined ? {} : { plan: compilation.plan }),
    blockers: compilation.blockers,
    warnings: compilation.warnings,
    sourceArtifactWritten: false,
    evidenceArtifactWritten: false,
    exactSourceBytesPreserved: false,
    artifactBytesRewritten: false,
    legacyApprovalPromotedAutomatically: false,
    technicalQaRequired: true,
    selectionRequired: true,
    promotionRequired: true,
    bookUseBindingRequired: true,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

function fingerprint(value: unknown): string {
  return sha256(stableStringify(normalizeJson(value)));
}

function normalizeSha(value: unknown): string {
  return text(value).toLowerCase().replace(/^sha256:/, "");
}

function isRegistrationId(value: string): boolean {
  return REGISTRATION_ID.test(value) &&
    !["__proto__", "constructor", "prototype"].includes(value);
}

function isTimestamp(value: string): boolean {
  return ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));
}

function normalizeSourcePath(value: string): string | undefined {
  if (
    !value ||
    value.length > 1_024 ||
    value.includes("\0") ||
    value.includes("\\") ||
    value.startsWith("/")
  ) {
    return undefined;
  }
  const segments = value.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.length > 255,
    )
  ) {
    return undefined;
  }
  const normalized = path.posix.normalize(value);
  return normalized === value ? normalized : undefined;
}

function cloneReceipt(value: BookArtArtifactReceiptV1): BookArtArtifactReceiptV1 {
  return JSON.parse(JSON.stringify(value)) as BookArtArtifactReceiptV1;
}

function cloneSourceEvidence(
  value: Record<string, unknown> | undefined,
): LegacyWebsiteBookArtSourceEvidenceV1 {
  return value
    ? JSON.parse(JSON.stringify(value)) as LegacyWebsiteBookArtSourceEvidenceV1
    : {};
}

function cloneIdentity(value: unknown): BookArtIdentityV1 {
  const source = record(value);
  return {
    workspaceId: text(source?.workspaceId),
    projectId: text(source?.projectId),
    bookId: text(source?.bookId),
    ...(source?.editionId === undefined
      ? {}
      : { editionId: text(source.editionId) }),
    requestId: text(source?.requestId),
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

function identitiesEqual(
  left: BookArtIdentityV1,
  right: BookArtIdentityV1,
): boolean {
  return stableStringify(normalizeJson(left)) ===
    stableStringify(normalizeJson(right));
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function rejectUnknown(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
  blockers: string[],
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (unknown.length) {
    blockers.push(`${label} contains unknown fields: ${unknown.join(", ")}.`);
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : fallback;
}
