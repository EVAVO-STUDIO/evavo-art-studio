import { createHash } from "node:crypto";

export const IMAGE_PROVENANCE_EVIDENCE_CONTRACT = "evavo.image-provenance-evidence.v1" as const;
export const IMAGE_PROVENANCE_RECORD_CONTRACT = "evavo.image-provenance-record.v1" as const;

export type ImageProvenanceStatus = "missing" | "hash-bound" | "conflicting" | "malformed" | "unverified";
export type ImageReportedOrigin = "human-authored" | "ai-generated" | "machine-assisted" | "mixed" | "unknown" | "not-reported";
export type ImageProvenanceEvidenceKind = "generation-record" | "human-authorship-record" | "transformation-receipt" | "import-record" | "review-record" | "unknown";

export interface ImageProvenanceRecordV1 {
  readonly contract: typeof IMAGE_PROVENANCE_RECORD_CONTRACT;
  readonly subjectSha256: string;
  readonly evidenceKind: ImageProvenanceEvidenceKind;
  readonly reportedOrigin?: Exclude<ImageReportedOrigin, "not-reported">;
  readonly producer?: string;
  readonly recordId?: string;
  readonly parentSha256?: string;
  readonly createdAt?: string;
}

export interface ImageProvenanceReviewSpec {
  /** Optional provenance/lineage sidecar parsed as JSON. */
  readonly evidence?: unknown;
  /**
   * Set only when the caller authenticated the evidence source outside this
   * function (for example through a trusted store or verified signature chain).
   * This function does not perform signature verification itself.
   */
  readonly externallyAuthenticated?: boolean;
}

export interface ImageProvenanceEvidenceReview {
  readonly contract: typeof IMAGE_PROVENANCE_EVIDENCE_CONTRACT;
  readonly subjectSha256: string;
  readonly status: ImageProvenanceStatus;
  readonly evidenceContract: string | null;
  readonly evidenceKind: ImageProvenanceEvidenceKind;
  readonly boundSha256: string | null;
  readonly hashBindingVerified: boolean;
  readonly externallyAuthenticated: boolean;
  readonly authenticationCheckedByThisReview: false;
  readonly reportedOrigin: ImageReportedOrigin;
  readonly originConclusion: ImageReportedOrigin | "not-determined";
  readonly aiGenerated: true | false | "not-determined";
  readonly producer: string | null;
  readonly recordId: string | null;
  readonly parentSha256: string | null;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly interpretation: string;
}

type NormalizedEvidence = Readonly<{
  contract: string | null;
  kind: ImageProvenanceEvidenceKind;
  boundSha256: string | null;
  reportedOrigin: ImageReportedOrigin;
  producer: string | null;
  recordId: string | null;
  parentSha256: string | null;
  recognized: boolean;
  malformed: boolean;
  warning?: string;
}>;

const SHA256 = /^[0-9a-f]{64}$/u;
const ORIGINS = new Set<ImageReportedOrigin>(["human-authored", "ai-generated", "machine-assisted", "mixed", "unknown"]);
const KINDS = new Set<ImageProvenanceEvidenceKind>(["generation-record", "human-authorship-record", "transformation-receipt", "import-record", "review-record", "unknown"]);

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function digest(value: unknown): string | null {
  return typeof value === "string" && SHA256.test(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeEvidence(value: unknown): NormalizedEvidence {
  const record = object(value);
  if (!record) {
    return Object.freeze({
      contract: null,
      kind: "unknown",
      boundSha256: null,
      reportedOrigin: "not-reported",
      producer: null,
      recordId: null,
      parentSha256: null,
      recognized: false,
      malformed: true,
      warning: "provenance-evidence-must-be-a-json-object",
    });
  }

  const contract = stringOrNull(record.contract);
  if (contract === IMAGE_PROVENANCE_RECORD_CONTRACT) {
    const boundSha256 = digest(record.subjectSha256);
    const kind = typeof record.evidenceKind === "string" && KINDS.has(record.evidenceKind as ImageProvenanceEvidenceKind)
      ? record.evidenceKind as ImageProvenanceEvidenceKind
      : null;
    const reportedOrigin = typeof record.reportedOrigin === "string" && ORIGINS.has(record.reportedOrigin as ImageReportedOrigin)
      ? record.reportedOrigin as ImageReportedOrigin
      : "not-reported";
    return Object.freeze({
      contract,
      kind: kind ?? "unknown",
      boundSha256,
      reportedOrigin,
      producer: stringOrNull(record.producer),
      recordId: stringOrNull(record.recordId),
      parentSha256: digest(record.parentSha256),
      recognized: true,
      malformed: boundSha256 === null || kind === null,
      ...(boundSha256 === null ? { warning: "provenance-record-subject-sha256-invalid" } : kind === null ? { warning: "provenance-record-evidence-kind-invalid" } : {}),
    });
  }

  // Image Repair v1.1 receipts bind the transformed output, exact source and,
  // for masked repairs, the admitted candidate/mask/reference inputs. The nested
  // canonical record must agree with the receipt hashes; paths alone never count.
  if (contract === "evavo.image-repair-receipt.v1") {
    const operation = stringOrNull(record.operation);
    const outputSha256 = digest(record.outputSha256);
    const sourceSha256 = digest(record.sourceSha256);
    const nested = object(record.provenance);
    const nestedContract = stringOrNull(nested?.contract);
    const nestedSubject = digest(nested?.subjectSha256);
    const nestedParent = digest(nested?.parentSha256);
    const nestedKind = stringOrNull(nested?.evidenceKind);
    const masked = operation === "evavo-masked-candidate-image-repair";
    const preservation = operation === "evavo-preservation-image-repair";
    const candidateValid = !masked || digest(record.candidateSha256) !== null;
    const maskValid = !masked || digest(record.maskSha256) !== null;
    const referenceValid = record.referenceSha256 === undefined || digest(record.referenceSha256) !== null;
    const provenanceValid = nestedContract === IMAGE_PROVENANCE_RECORD_CONTRACT
      && nestedSubject !== null
      && nestedSubject === outputSha256
      && nestedParent !== null
      && nestedParent === sourceSha256
      && nestedKind === "transformation-receipt";
    const malformed = (!masked && !preservation)
      || outputSha256 === null
      || sourceSha256 === null
      || !candidateValid
      || !maskValid
      || !referenceValid
      || !provenanceValid;
    return Object.freeze({
      contract,
      kind: "transformation-receipt",
      boundSha256: outputSha256,
      reportedOrigin: "not-reported",
      producer: stringOrNull(nested?.producer) ?? "EVAVO Image Repair",
      recordId: stringOrNull(nested?.recordId) ?? stringOrNull(record.receiptPath),
      parentSha256: sourceSha256,
      recognized: true,
      malformed,
      ...(malformed ? { warning: "image-repair-receipt-lineage-invalid" } : {}),
    });
  }

  // Existing Enhancement Studio manifests bind the review candidate and its
  // immutable source. learned_candidate means machine-assisted enhancement; it
  // does not prove that the whole image was generated by AI.
  if (contract === "evavo.enhancement-art-review.v1") {
    const boundSha256 = digest(record.candidate_sha256);
    const parentSha256 = digest(record.source_sha256);
    return Object.freeze({
      contract,
      kind: "review-record",
      boundSha256,
      reportedOrigin: record.learned_candidate === true ? "machine-assisted" : "not-reported",
      producer: "EVAVO Enhancement Studio",
      recordId: null,
      parentSha256,
      recognized: true,
      malformed: boundSha256 === null || parentSha256 === null,
      ...(boundSha256 === null || parentSha256 === null ? { warning: "enhancement-review-manifest-hash-invalid" } : {}),
    });
  }

  // Existing transparent-master receipts contain a transparency proof whose
  // input hash is the mastered output itself. This verifies content lineage;
  // the receipt does not report authorship/origin.
  if (record.operation === "evavo-master-transparent-asset") {
    const proof = object(record.transparencyProof);
    const boundSha256 = digest(proof?.inputSha256);
    return Object.freeze({
      contract: stringOrNull(record.schemaVersion) ? `evavo-master-transparent-asset@${String(record.schemaVersion)}` : "evavo-master-transparent-asset",
      kind: "transformation-receipt",
      boundSha256,
      reportedOrigin: "not-reported",
      producer: "EVAVO Raster Finishing",
      recordId: stringOrNull(record.receiptPath),
      parentSha256: null,
      recognized: true,
      malformed: boundSha256 === null,
      ...(boundSha256 === null ? { warning: "raster-finishing-receipt-output-hash-missing" } : {}),
    });
  }

  return Object.freeze({
    contract,
    kind: "unknown",
    boundSha256: null,
    reportedOrigin: "not-reported",
    producer: null,
    recordId: null,
    parentSha256: null,
    recognized: false,
    malformed: false,
    warning: "unrecognized-provenance-evidence-contract",
  });
}

/**
 * Review hash-bound provenance/lineage evidence for the exact image bytes.
 *
 * This deliberately does not inspect pixels for authorship and does not verify
 * signatures. A matching hash proves only that supplied evidence refers to
 * these exact bytes. Origin claims become usable only when the caller separately
 * authenticates the evidence source.
 */
export function reviewImageProvenanceEvidence(
  encoded: Buffer,
  spec: ImageProvenanceReviewSpec = {},
): ImageProvenanceEvidenceReview {
  if (!Buffer.isBuffer(encoded) || encoded.length === 0) throw new Error("Image provenance review input is empty.");
  const subjectSha256 = sha256(encoded);
  if (spec.evidence === undefined || spec.evidence === null) {
    return Object.freeze({
      contract: IMAGE_PROVENANCE_EVIDENCE_CONTRACT,
      subjectSha256,
      status: "missing",
      evidenceContract: null,
      evidenceKind: "unknown",
      boundSha256: null,
      hashBindingVerified: false,
      externallyAuthenticated: false,
      authenticationCheckedByThisReview: false,
      reportedOrigin: "not-reported",
      originConclusion: "not-determined",
      aiGenerated: "not-determined",
      producer: null,
      recordId: null,
      parentSha256: null,
      blockers: Object.freeze([]),
      warnings: Object.freeze(["provenance-evidence-missing"]),
      interpretation: "No provenance evidence was supplied. This is not an image-quality failure and does not imply AI authorship.",
    });
  }

  const normalized = normalizeEvidence(spec.evidence);
  const blockers: string[] = [];
  const warnings: string[] = [];
  let status: ImageProvenanceStatus;
  if (normalized.malformed) {
    status = "malformed";
    warnings.push(normalized.warning ?? "provenance-evidence-malformed");
  } else if (!normalized.recognized || normalized.boundSha256 === null) {
    status = "unverified";
    warnings.push(normalized.warning ?? "provenance-evidence-unverified");
  } else if (normalized.boundSha256 !== subjectSha256) {
    status = "conflicting";
    blockers.push("provenance-subject-hash-mismatch");
  } else {
    status = "hash-bound";
  }

  const externallyAuthenticated = spec.externallyAuthenticated === true && status === "hash-bound";
  if (spec.externallyAuthenticated === true && status !== "hash-bound") {
    warnings.push("external-provenance-authentication-ignored-without-valid-hash-binding");
  }
  if (status === "hash-bound" && !externallyAuthenticated) {
    warnings.push("provenance-hash-binding-does-not-authenticate-record-source");
  }
  if (status === "hash-bound" && normalized.reportedOrigin === "not-reported") {
    warnings.push("hash-bound-provenance-does-not-report-origin");
  }

  const originConclusion = externallyAuthenticated && normalized.reportedOrigin !== "not-reported"
    ? normalized.reportedOrigin
    : "not-determined";
  const aiGenerated: true | false | "not-determined" = originConclusion === "ai-generated"
    ? true
    : originConclusion === "human-authored"
      ? false
      : "not-determined";

  return Object.freeze({
    contract: IMAGE_PROVENANCE_EVIDENCE_CONTRACT,
    subjectSha256,
    status,
    evidenceContract: normalized.contract,
    evidenceKind: normalized.kind,
    boundSha256: normalized.boundSha256,
    hashBindingVerified: status === "hash-bound",
    externallyAuthenticated,
    authenticationCheckedByThisReview: false,
    reportedOrigin: normalized.reportedOrigin,
    originConclusion,
    aiGenerated,
    producer: normalized.producer,
    recordId: normalized.recordId,
    parentSha256: normalized.parentSha256,
    blockers: Object.freeze(blockers),
    warnings: Object.freeze(warnings),
    interpretation: externallyAuthenticated
      ? "The evidence source was declared externally authenticated by the caller and its subject hash matches these exact bytes. Any origin is provenance-reported, never pixel-inferred."
      : status === "hash-bound"
        ? "The supplied evidence is hash-bound to these exact bytes, but this review did not authenticate the evidence source or verify a signature."
        : "The supplied provenance evidence cannot establish a trusted origin claim for these exact bytes. Pixel artifact signals remain separate and do not identify authorship.",
  });
}