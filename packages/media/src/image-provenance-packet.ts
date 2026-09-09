import { createHash } from "node:crypto";

import {
  reviewImageProvenanceEvidence,
  type ImageReportedOrigin,
} from "./image-provenance-evidence.js";

export const IMAGE_PROVENANCE_PACKET_CONTRACT = "evavo.image-provenance-packet.v1" as const;

export type ImageProvenancePacketStatus = "verified" | "unverified" | "absent" | "invalid";
export type ImageProvenancePacketEvidenceKind = "source-binding" | "generation-receipt" | "content-credential" | "evavo-record";
export type ImageProvenancePacketVerificationStatus = "verified" | "unverified" | "invalid";

interface BaseEvidenceInput {
  readonly id: string;
  readonly kind: ImageProvenancePacketEvidenceKind;
  readonly note?: string;
}

export interface SourceBindingProvenanceInput extends BaseEvidenceInput {
  readonly kind: "source-binding";
  readonly assetSha256: string;
  readonly relation?: "immutable-source" | "candidate-review" | "derivative" | "approved-reference" | "other";
  readonly recordId?: string;
}

export interface ExternalProvenanceInput extends BaseEvidenceInput {
  readonly kind: "generation-receipt" | "content-credential";
  readonly assetSha256: string;
  readonly verificationStatus: ImageProvenancePacketVerificationStatus;
  readonly verifier?: string;
  readonly recordId?: string;
  readonly issuer?: string;
  readonly reportedOrigin?: Exclude<ImageReportedOrigin, "not-reported">;
}

export interface EvavoRecordProvenanceInput extends BaseEvidenceInput {
  readonly kind: "evavo-record";
  readonly record: unknown;
  readonly verificationStatus?: ImageProvenancePacketVerificationStatus;
  readonly verifier?: string;
  readonly verificationRecordId?: string;
}

export type ImageProvenancePacketEvidenceInput = SourceBindingProvenanceInput | ExternalProvenanceInput | EvavoRecordProvenanceInput;

export interface ImageProvenancePacketSpec {
  readonly evidence?: readonly ImageProvenancePacketEvidenceInput[];
}

export interface ImageProvenancePacketResult {
  readonly contract: typeof IMAGE_PROVENANCE_PACKET_CONTRACT;
  readonly status: ImageProvenancePacketStatus;
  readonly asset: Readonly<{ sha256: string; bytes: number }>;
  readonly evidence: readonly Readonly<{
    id: string;
    kind: ImageProvenancePacketEvidenceKind;
    effectiveStatus: Exclude<ImageProvenancePacketStatus, "absent">;
    assetSha256: string | null;
    assetHashMatches: boolean;
    hashBindingVerified: boolean;
    externalVerificationReported: ImageProvenancePacketVerificationStatus | "not-supplied";
    externalVerificationPerformedByArtStudio: false;
    verifier: string | null;
    recordId: string | null;
    issuer: string | null;
    reportedOrigin: ImageReportedOrigin;
    originClaimVerified: boolean;
    reason: string;
  }>[];
  readonly summary: Readonly<{
    supplied: number;
    verified: number;
    unverified: number;
    invalid: number;
    hashBindingsVerified: number;
    externalVerificationsReported: number;
    verifiedOriginClaims: number;
    contentCredentialsSupplied: number;
  }>;
  readonly contradictions: readonly string[];
  readonly verifiedReportedOrigins: readonly Readonly<{
    evidenceId: string;
    kind: "generation-receipt" | "content-credential" | "evavo-record";
    reportedOrigin: Exclude<ImageReportedOrigin, "not-reported">;
    verifier: string;
  }>[];
  readonly originAssessment: Readonly<{
    aiGenerated: "not-determined";
    humanAuthored: "not-determined";
    provenanceReportedOrigin: ImageReportedOrigin | "not-determined";
    pixelHeuristicsUsedForOrigin: false;
    reason: string;
  }>;
  readonly sourceModified: false;
  readonly automaticCreativeApproval: false;
  readonly publicationAllowed: false;
  readonly visualReviewRequired: true;
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const VERIFICATION_STATUSES = new Set<ImageProvenancePacketVerificationStatus>(["verified", "unverified", "invalid"]);

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function optionalString(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  return nonEmpty(value, label);
}

function digest(value: unknown, label: string): string {
  const normalized = nonEmpty(value, label);
  if (!SHA256_PATTERN.test(normalized)) throw new Error(`${label} must be a lowercase SHA-256 hex digest.`);
  return normalized;
}

function validateVerification(
  status: ImageProvenancePacketVerificationStatus | undefined,
  verifier: string | null,
  recordId: string | null,
  label: string,
): ImageProvenancePacketVerificationStatus | "not-supplied" {
  if (status === undefined) return "not-supplied";
  if (!VERIFICATION_STATUSES.has(status)) throw new Error(`${label} verificationStatus must be verified|unverified|invalid.`);
  if (status === "verified" && (!verifier || !recordId)) {
    throw new Error(`${label} cannot report verified external evidence without verifier and verification record id.`);
  }
  return status;
}

function reviewSourceBinding(
  imageSha256: string,
  input: SourceBindingProvenanceInput,
): ImageProvenancePacketResult["evidence"][number] {
  const id = nonEmpty(input.id, "provenance evidence id");
  const assetSha256 = digest(input.assetSha256, `${id} assetSha256`);
  const assetHashMatches = assetSha256 === imageSha256;
  const recordId = optionalString(input.recordId, `${id} recordId`);
  return Object.freeze({
    id,
    kind: input.kind,
    effectiveStatus: assetHashMatches ? "verified" : "invalid",
    assetSha256,
    assetHashMatches,
    hashBindingVerified: assetHashMatches,
    externalVerificationReported: "not-supplied",
    externalVerificationPerformedByArtStudio: false,
    verifier: null,
    recordId,
    issuer: null,
    reportedOrigin: "not-reported",
    originClaimVerified: false,
    reason: assetHashMatches
      ? `Exact local SHA-256 verifies this ${input.relation ?? "source"} byte binding. Byte identity is not authorship.`
      : "Supplied source/lineage SHA-256 does not match the actual image bytes.",
  });
}

function reviewExternalEvidence(
  imageSha256: string,
  input: ExternalProvenanceInput,
): ImageProvenancePacketResult["evidence"][number] {
  const id = nonEmpty(input.id, "provenance evidence id");
  const assetSha256 = digest(input.assetSha256, `${id} assetSha256`);
  const assetHashMatches = assetSha256 === imageSha256;
  const verifier = optionalString(input.verifier, `${id} verifier`);
  const recordId = optionalString(input.recordId, `${id} recordId`);
  const issuer = optionalString(input.issuer, `${id} issuer`);
  const verification = validateVerification(input.verificationStatus, verifier, recordId, id);
  if (verification === "not-supplied") throw new Error(`${id} requires verificationStatus.`);

  const effectiveStatus: "verified" | "unverified" | "invalid" = !assetHashMatches || verification === "invalid"
    ? "invalid"
    : verification === "verified"
      ? "verified"
      : "unverified";
  const originClaimVerified = effectiveStatus === "verified" && input.reportedOrigin !== undefined && input.reportedOrigin !== "unknown";
  return Object.freeze({
    id,
    kind: input.kind,
    effectiveStatus,
    assetSha256,
    assetHashMatches,
    hashBindingVerified: assetHashMatches,
    externalVerificationReported: verification,
    externalVerificationPerformedByArtStudio: false,
    verifier,
    recordId,
    issuer,
    reportedOrigin: input.reportedOrigin ?? "not-reported",
    originClaimVerified,
    reason: !assetHashMatches
      ? "External evidence is bound to a different asset SHA-256 than the actual image bytes."
      : verification === "invalid"
        ? `External verifier ${verifier ?? "(not identified)"} reported the evidence invalid.`
        : verification === "verified"
          ? `External verifier ${verifier} reported successful verification and the record is bound to these exact bytes. Art Studio did not perform that external cryptographic verification itself.`
          : "The record is bound to these exact bytes but external authenticity/signature verification has not succeeded.",
  });
}

function reviewEvavoRecord(
  image: Buffer,
  input: EvavoRecordProvenanceInput,
): ImageProvenancePacketResult["evidence"][number] {
  const id = nonEmpty(input.id, "provenance evidence id");
  const verifier = optionalString(input.verifier, `${id} verifier`);
  const verificationRecordId = optionalString(input.verificationRecordId, `${id} verificationRecordId`);
  const verification = validateVerification(input.verificationStatus, verifier, verificationRecordId, id);
  const legacy = reviewImageProvenanceEvidence(image, { evidence: input.record });
  const assetHashMatches = legacy.hashBindingVerified;
  let effectiveStatus: "verified" | "unverified" | "invalid";
  if (legacy.status === "conflicting" || legacy.status === "malformed" || verification === "invalid") {
    effectiveStatus = "invalid";
  } else if (!assetHashMatches) {
    effectiveStatus = "unverified";
  } else if (verification === "unverified") {
    effectiveStatus = "unverified";
  } else {
    effectiveStatus = "verified";
  }
  const originClaimVerified = effectiveStatus === "verified"
    && verification === "verified"
    && legacy.reportedOrigin !== "not-reported"
    && legacy.reportedOrigin !== "unknown";
  return Object.freeze({
    id,
    kind: input.kind,
    effectiveStatus,
    assetSha256: legacy.boundSha256,
    assetHashMatches,
    hashBindingVerified: legacy.hashBindingVerified,
    externalVerificationReported: verification,
    externalVerificationPerformedByArtStudio: false,
    verifier,
    recordId: verificationRecordId ?? legacy.recordId,
    issuer: legacy.producer,
    reportedOrigin: legacy.reportedOrigin,
    originClaimVerified,
    reason: legacy.status === "conflicting"
      ? "EVAVO provenance record is bound to different image bytes."
      : legacy.status === "malformed"
        ? "EVAVO provenance record is malformed."
        : !assetHashMatches
          ? "EVAVO provenance record could not be bound to these exact image bytes."
          : verification === "invalid"
            ? `External verifier ${verifier ?? "(not identified)"} reported the EVAVO record invalid.`
            : verification === "verified"
              ? `EVAVO record is hash-bound to these bytes and external verifier ${verifier} reported the record authenticated.`
              : verification === "unverified"
                ? "EVAVO record is hash-bound to these bytes but its external authenticity remains unverified."
                : "EVAVO record is locally hash-bound to these exact bytes. This verifies lineage byte identity, not record-source authenticity or authorship.",
  });
}

function incompatibleVerifiedOrigins(evidence: ImageProvenancePacketResult["evidence"]): readonly string[] {
  const origins = new Set(evidence.filter((item) => item.originClaimVerified).map((item) => item.reportedOrigin));
  if (origins.has("human-authored") && origins.has("ai-generated")) {
    return Object.freeze(["contradictory-verified-origin-claims:human-authored,ai-generated"]);
  }
  return Object.freeze([]);
}

export function createImageProvenancePacket(
  image: Buffer,
  spec: ImageProvenancePacketSpec = {},
): ImageProvenancePacketResult {
  if (!Buffer.isBuffer(image) || image.length < 1) throw new Error("Image provenance packet requires non-empty image bytes.");
  const inputs = spec.evidence ?? [];
  if (!Array.isArray(inputs) || inputs.length > 64) throw new Error("Image provenance packet accepts at most 64 evidence items.");
  const imageSha256 = sha256(image);
  const seen = new Set<string>();
  const evidence = inputs.map((input) => {
    if (!input || typeof input !== "object") throw new Error("Each provenance evidence item must be an object.");
    const id = nonEmpty(input.id, "provenance evidence id");
    if (seen.has(id)) throw new Error(`Duplicate provenance evidence id ${JSON.stringify(id)}.`);
    seen.add(id);
    if (input.kind === "source-binding") return reviewSourceBinding(imageSha256, input);
    if (input.kind === "generation-receipt" || input.kind === "content-credential") return reviewExternalEvidence(imageSha256, input);
    if (input.kind === "evavo-record") return reviewEvavoRecord(image, input);
    throw new Error(`Unsupported provenance evidence kind ${JSON.stringify((input as { kind?: unknown }).kind)}.`);
  });

  const contradictions = incompatibleVerifiedOrigins(evidence);
  const verified = evidence.filter((item) => item.effectiveStatus === "verified").length;
  const unverified = evidence.filter((item) => item.effectiveStatus === "unverified").length;
  const invalid = evidence.filter((item) => item.effectiveStatus === "invalid").length;
  const hashBindingsVerified = evidence.filter((item) => item.hashBindingVerified).length;
  const externalVerificationsReported = evidence.filter((item) => item.externalVerificationReported === "verified").length;
  const verifiedOriginClaims = evidence.filter((item) => item.originClaimVerified).length;
  const contentCredentialsSupplied = evidence.filter((item) => item.kind === "content-credential").length;
  const status: ImageProvenancePacketStatus = evidence.length === 0
    ? "absent"
    : invalid > 0 || contradictions.length > 0
      ? "invalid"
      : verified > 0
        ? "verified"
        : "unverified";

  const verifiedReportedOrigins = evidence
    .filter((item): item is typeof item & { kind: "generation-receipt" | "content-credential" | "evavo-record"; reportedOrigin: Exclude<ImageReportedOrigin, "not-reported">; verifier: string } =>
      item.originClaimVerified && item.reportedOrigin !== "not-reported" && item.verifier !== null)
    .map((item) => Object.freeze({
      evidenceId: item.id,
      kind: item.kind,
      reportedOrigin: item.reportedOrigin,
      verifier: item.verifier,
    }));
  const uniqueVerifiedOrigins = [...new Set(verifiedReportedOrigins.map((item) => item.reportedOrigin))];
  const provenanceReportedOrigin: ImageReportedOrigin | "not-determined" = uniqueVerifiedOrigins.length === 1
    ? uniqueVerifiedOrigins[0] ?? "not-determined"
    : "not-determined";

  return Object.freeze({
    contract: IMAGE_PROVENANCE_PACKET_CONTRACT,
    status,
    asset: Object.freeze({ sha256: imageSha256, bytes: image.length }),
    evidence: Object.freeze(evidence),
    summary: Object.freeze({
      supplied: evidence.length,
      verified,
      unverified,
      invalid,
      hashBindingsVerified,
      externalVerificationsReported,
      verifiedOriginClaims,
      contentCredentialsSupplied,
    }),
    contradictions,
    verifiedReportedOrigins: Object.freeze(verifiedReportedOrigins),
    originAssessment: Object.freeze({
      aiGenerated: "not-determined",
      humanAuthored: "not-determined",
      provenanceReportedOrigin,
      pixelHeuristicsUsedForOrigin: false,
      reason: "Art Studio reports byte-bound lineage and externally verified origin claims as evidence, but does not turn pixel heuristics or caller-supplied metadata into a definitive human/AI authorship verdict.",
    }),
    sourceModified: false,
    automaticCreativeApproval: false,
    publicationAllowed: false,
    visualReviewRequired: true,
  });
}
