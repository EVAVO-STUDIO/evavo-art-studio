import { admitEnhancementStudioReviewManifest, type AdmittedEnhancementStudioReview, type EnhancementStudioReviewManifest } from "./enhancement-review-bridge.js";

export interface CreativeProductionReceiptLike {
  readonly kind: string;
  readonly schemaVersion: string;
  readonly status: string;
  readonly packetId: string;
  readonly sourceDigest: string;
  readonly studio: string;
  readonly repository: string;
  readonly operation: string;
  readonly artifactRevision: {
    readonly id: string;
    readonly digest: string;
    readonly derivativeOfDigest?: string;
    readonly boundCanonicalAssetDigest?: string;
  };
  readonly review: { readonly status: string; readonly reviewer?: string; readonly evidenceDigest?: string };
  readonly authority: {
    readonly executesProduction: boolean;
    readonly grantsCreativeApproval: boolean;
    readonly mutatesConsumerRepository: boolean;
    readonly publishes: boolean;
  };
}

export interface CreativeProductionArtifactManifestLike {
  readonly kind: string;
  readonly schemaVersion: string;
  readonly status: string;
  readonly packetId: string;
  readonly sourceDigest: string;
  readonly studio: string;
  readonly repository: string;
  readonly operation: string;
  readonly artifactRevision: {
    readonly id: string;
    readonly digest: string;
    readonly derivativeOfDigest?: string;
  };
  readonly deliveryRoot: string;
  readonly files: readonly {
    readonly path: string;
    readonly role: string;
    readonly mediaType: string;
    readonly digest: string;
    readonly byteLength: number;
    readonly canonicalRuntimeAsset: boolean;
    readonly reviewOnly: boolean;
  }[];
  readonly authority: {
    readonly importsIntoConsumer: boolean;
    readonly executesProduction: boolean;
    readonly mutatesConsumerRepository: boolean;
    readonly publishes: boolean;
  };
  readonly manifestDigest: string;
}

export interface EnhancementCreativeProductionLineageInput {
  readonly reviewManifest: EnhancementStudioReviewManifest;
  readonly enhancementReceipt: CreativeProductionReceiptLike;
  readonly sourceReceipt: CreativeProductionReceiptLike;
  readonly artifactManifest: CreativeProductionArtifactManifestLike;
  readonly candidateArtifactPath: string;
  readonly candidateByteLength: number;
}

export interface AdmittedEnhancementCreativeProductionLineage {
  readonly admittedReview: AdmittedEnhancementStudioReview;
  readonly packetId: string;
  readonly sourceDigest: string;
  readonly immediateSourceStudio: string;
  readonly immediateSourceRevisionId: string;
  readonly immediateSourceRevisionDigest: string;
  readonly enhancementRevisionId: string;
  readonly enhancementRevisionDigest: string;
  readonly derivativeOfDigest: string;
  readonly artifactManifestDigest: string;
  readonly deliveryRoot: string;
  readonly candidateArtifactPath: string;
  readonly candidateFileDigest: string;
  readonly candidateByteLength: number;
  readonly candidateReviewOnly: true;
  readonly candidateCanonicalRuntimeAsset: false;
  readonly mayReplaceCanonicalRuntimeAsset: false;
  readonly publicationAllowed: false;
  readonly automaticCreativeApproval: false;
}

const ENHANCEMENT_REPOSITORY = "EVAVO-STUDIO/evavo-image-enhancement-studio";
const ALLOWED_SOURCE_STUDIOS = new Set(["art-studio", "3d-studio", "texture-studio"]);
const SHA256_FILE = /^sha256:[0-9a-f]{64}$/u;
const SAFE_RELATIVE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[^\u0000]+$/u;

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function reviewedReceipt(receipt: CreativeProductionReceiptLike, label: string): void {
  if (!receipt || typeof receipt !== "object") throw new Error(`${label} is required.`);
  if (receipt.kind !== "creative-production-receipt" || receipt.schemaVersion !== "1.0.0" || receipt.status !== "completed-reviewed") throw new Error(`${label} must be a completed reviewed creative-production receipt v1.`);
  if (receipt.review?.status !== "reviewed") throw new Error(`${label} must carry reviewed evidence.`);
  if (receipt.authority?.executesProduction !== false || receipt.authority?.grantsCreativeApproval !== false || receipt.authority?.mutatesConsumerRepository !== false || receipt.authority?.publishes !== false) throw new Error(`${label} attempted to carry forbidden creative-production authority.`);
  nonEmpty(receipt.packetId, `${label}.packetId`);
  nonEmpty(receipt.sourceDigest, `${label}.sourceDigest`);
  nonEmpty(receipt.artifactRevision?.id, `${label}.artifactRevision.id`);
  nonEmpty(receipt.artifactRevision?.digest, `${label}.artifactRevision.digest`);
}

function enhancementReceipt(receipt: CreativeProductionReceiptLike): string {
  reviewedReceipt(receipt, "enhancementReceipt");
  if (receipt.studio !== "image-enhancement-studio" || receipt.repository !== ENHANCEMENT_REPOSITORY) throw new Error("enhancementReceipt must come from EVAVO Image Enhancement Studio.");
  return nonEmpty(receipt.artifactRevision.derivativeOfDigest, "enhancementReceipt.artifactRevision.derivativeOfDigest");
}

function sourceReceipt(receipt: CreativeProductionReceiptLike): void {
  reviewedReceipt(receipt, "sourceReceipt");
  if (!ALLOWED_SOURCE_STUDIOS.has(receipt.studio)) throw new Error(`sourceReceipt studio ${JSON.stringify(receipt.studio)} is not a direct Image Enhancement production source.`);
  if (receipt.studio === "image-enhancement-studio") throw new Error("An Image Enhancement receipt cannot be its own immediate source receipt.");
}

function same(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) throw new Error(`${label} does not match the reviewed Enhancement receipt.`);
}

export function admitEnhancementCreativeProductionLineage(input: EnhancementCreativeProductionLineageInput): AdmittedEnhancementCreativeProductionLineage {
  if (!input || typeof input !== "object") throw new Error("Enhancement creative-production lineage input is required.");
  const admittedReview = admitEnhancementStudioReviewManifest(input.reviewManifest);
  const derivativeOfDigest = enhancementReceipt(input.enhancementReceipt);
  sourceReceipt(input.sourceReceipt);

  if (input.sourceReceipt.sourceDigest !== input.enhancementReceipt.sourceDigest) throw new Error("Immediate source and Enhancement receipts must belong to the same creative-production source digest.");
  if (derivativeOfDigest !== input.sourceReceipt.artifactRevision.digest) throw new Error("Enhancement derivativeOfDigest must equal the reviewed immediate source artifact revision digest.");

  const manifest = input.artifactManifest;
  if (!manifest || typeof manifest !== "object" || manifest.kind !== "creative-production-artifact-manifest" || manifest.schemaVersion !== "1.1.0" || manifest.status !== "revision-files-bound") throw new Error("artifactManifest must be a revision-files-bound creative-production artifact manifest v1.1.0.");
  same(manifest.packetId, input.enhancementReceipt.packetId, "artifactManifest.packetId");
  same(manifest.sourceDigest, input.enhancementReceipt.sourceDigest, "artifactManifest.sourceDigest");
  same(manifest.studio, input.enhancementReceipt.studio, "artifactManifest.studio");
  same(manifest.repository, input.enhancementReceipt.repository, "artifactManifest.repository");
  same(manifest.operation, input.enhancementReceipt.operation, "artifactManifest.operation");
  same(manifest.artifactRevision?.id, input.enhancementReceipt.artifactRevision.id, "artifactManifest.artifactRevision.id");
  same(manifest.artifactRevision?.digest, input.enhancementReceipt.artifactRevision.digest, "artifactManifest.artifactRevision.digest");
  same(manifest.artifactRevision?.derivativeOfDigest, derivativeOfDigest, "artifactManifest.artifactRevision.derivativeOfDigest");
  if (!/^artifacts\/image-enhancement-studio\/[0-9a-f]{24}$/u.test(manifest.deliveryRoot)) throw new Error("artifactManifest.deliveryRoot must be the deterministic Image Enhancement delivery namespace.");
  if (!SHA256_FILE.test(manifest.manifestDigest)) throw new Error("artifactManifest.manifestDigest must be a SHA-256 digest.");
  if (manifest.authority?.importsIntoConsumer !== false || manifest.authority?.executesProduction !== false || manifest.authority?.mutatesConsumerRepository !== false || manifest.authority?.publishes !== false) throw new Error("artifactManifest attempted to carry forbidden creative-production authority.");

  const candidateArtifactPath = nonEmpty(input.candidateArtifactPath, "candidateArtifactPath");
  if (!SAFE_RELATIVE_PATH.test(candidateArtifactPath)) throw new Error("candidateArtifactPath must be a safe manifest-local relative path.");
  if (!Number.isSafeInteger(input.candidateByteLength) || input.candidateByteLength < 1) throw new Error("candidateByteLength must be a positive safe integer.");
  const matches = manifest.files.filter((file) => file.path === candidateArtifactPath);
  if (matches.length !== 1) throw new Error("candidateArtifactPath must identify exactly one file in the Enhancement artifact manifest.");
  const candidate = matches[0]!;
  if (candidate.reviewOnly !== true || candidate.canonicalRuntimeAsset !== false) throw new Error("Enhancement candidate must remain review-only and non-canonical in the creative-production artifact manifest.");
  if (!candidate.mediaType.startsWith("image/")) throw new Error("Enhancement review candidate must be an image artifact.");
  const expectedCandidateDigest = `sha256:${admittedReview.candidateSha256}`;
  if (candidate.digest !== expectedCandidateDigest) throw new Error("Enhancement candidate bytes do not match the selected creative-production manifest file digest.");
  if (candidate.byteLength !== input.candidateByteLength) throw new Error("Enhancement candidate byte length does not match the selected creative-production manifest file.");

  return Object.freeze({
    admittedReview,
    packetId: input.enhancementReceipt.packetId,
    sourceDigest: input.enhancementReceipt.sourceDigest,
    immediateSourceStudio: input.sourceReceipt.studio,
    immediateSourceRevisionId: input.sourceReceipt.artifactRevision.id,
    immediateSourceRevisionDigest: input.sourceReceipt.artifactRevision.digest,
    enhancementRevisionId: input.enhancementReceipt.artifactRevision.id,
    enhancementRevisionDigest: input.enhancementReceipt.artifactRevision.digest,
    derivativeOfDigest,
    artifactManifestDigest: manifest.manifestDigest,
    deliveryRoot: manifest.deliveryRoot,
    candidateArtifactPath,
    candidateFileDigest: candidate.digest,
    candidateByteLength: candidate.byteLength,
    candidateReviewOnly: true,
    candidateCanonicalRuntimeAsset: false,
    mayReplaceCanonicalRuntimeAsset: false,
    publicationAllowed: false,
    automaticCreativeApproval: false,
  });
}
