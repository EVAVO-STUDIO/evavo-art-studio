import {
  normalizeJson,
  type ArtifactId,
  type ArtifactStore,
  type StoredArtifact,
} from "@evavo/art-artifacts";
import { createImageProvenancePacket } from "@evavo/art-media";

import { executeProviderCandidateRequest as executeProviderCandidateRequestRaw } from "./orchestrator.js";
import {
  ProviderError,
  type ExecuteProviderCandidateOptions,
  type NormalizedProviderCandidateRequest,
  type ProviderCandidateRunResult,
  type ProviderReferenceRole,
} from "./types.js";
import { validateProviderCandidateRequest } from "./validation.js";

export const PROVIDER_PROVENANCE_BUNDLE_CONTRACT = "evavo.provider-provenance-bundle.v1" as const;
export const PROVIDER_IMAGE_PROVENANCE_RECORD_CONTRACT = "evavo.image-provenance-record.v1" as const;

export interface ProviderCandidateRunWithProvenanceResult extends ProviderCandidateRunResult {
  readonly provenanceArtifact: ArtifactId;
}

type ProviderReportedOrigin = "ai-generated" | "machine-assisted" | "unknown";

type VerifiedReferenceBinding = Readonly<{
  artifactId: ArtifactId;
  role: ProviderReferenceRole;
  contentSha256: string;
  mediaType: string;
  sizeBytes: number;
  required: boolean;
}>;

async function verifiedArtifact(
  artifacts: ArtifactStore,
  artifactId: ArtifactId,
  label: string,
): Promise<StoredArtifact> {
  const artifact = await artifacts.get(artifactId);
  if (!artifact) {
    throw new ProviderError(
      "PROVIDER_PROVENANCE_ARTIFACT_MISSING",
      `${label} artifact is missing: ${artifactId}`,
      "permanent",
    );
  }
  const verification = await artifacts.verify(artifactId);
  if (!verification.descriptorValid || !verification.contentValid) {
    throw new ProviderError(
      "PROVIDER_PROVENANCE_ARTIFACT_INVALID",
      `${label} artifact failed immutable descriptor/content verification: ${artifactId}`,
      "permanent",
    );
  }
  return artifact;
}

function reportedOrigin(
  request: NormalizedProviderCandidateRequest,
  adapterId: string,
): ProviderReportedOrigin {
  if (adapterId === "fixture-image") return "unknown";
  if (request.operation === "generate") return "ai-generated";
  return "machine-assisted";
}

function evidenceKind(request: NormalizedProviderCandidateRequest): "generation-record" | "transformation-receipt" {
  return request.operation === "generate" ? "generation-record" : "transformation-receipt";
}

async function resolveReferenceBindings(
  request: NormalizedProviderCandidateRequest,
  candidate: StoredArtifact,
  artifacts: ArtifactStore,
): Promise<readonly VerifiedReferenceBinding[]> {
  const resolvedIds = new Set(candidate.sourceArtifacts);
  const bindings: VerifiedReferenceBinding[] = [];
  for (const reference of request.references) {
    if (!resolvedIds.has(reference.artifactId)) continue;
    const artifact = await verifiedArtifact(artifacts, reference.artifactId, `Provider ${reference.role} reference`);
    bindings.push(Object.freeze({
      artifactId: artifact.artifactId,
      role: reference.role,
      contentSha256: artifact.contentSha256,
      mediaType: artifact.mediaType,
      sizeBytes: artifact.sizeBytes,
      required: reference.required,
    }));
  }
  return Object.freeze(bindings);
}

async function storeProviderProvenanceBundle(
  request: NormalizedProviderCandidateRequest,
  result: ProviderCandidateRunResult,
  artifacts: ArtifactStore,
): Promise<StoredArtifact> {
  const providerEvidence = await verifiedArtifact(artifacts, result.evidenceArtifact, "Provider execution evidence");
  const candidates: StoredArtifact[] = [];
  for (const artifactId of result.candidateArtifacts) {
    candidates.push(await verifiedArtifact(artifacts, artifactId, "Provider candidate"));
  }
  if (candidates.length < 1) {
    throw new ProviderError(
      "PROVIDER_PROVENANCE_CANDIDATE_MISSING",
      "Successful provider execution returned no candidate artifacts to provenance-bind.",
      "permanent",
    );
  }

  const referenceBindings = await resolveReferenceBindings(request, candidates[0]!, artifacts);
  const baseBindings = referenceBindings.filter((entry) => entry.role === "base-image");
  const parentSha256 = baseBindings.length === 1 ? baseBindings[0]!.contentSha256 : undefined;
  const completedAt = [...result.attempts]
    .reverse()
    .find((attempt) => attempt.outcome === "succeeded" && attempt.adapterId === result.adapterId)?.completedAt;
  const origin = reportedOrigin(request, result.adapterId);
  const records = await Promise.all(candidates.map(async (candidate, index) => {
    const record = Object.freeze({
      contract: PROVIDER_IMAGE_PROVENANCE_RECORD_CONTRACT,
      subjectSha256: candidate.contentSha256,
      evidenceKind: evidenceKind(request),
      reportedOrigin: origin,
      producer: `EVAVO Provider Orchestrator:${result.adapterId}/${result.model}`,
      recordId: `${request.requestId}:candidate:${index + 1}`,
      ...(parentSha256 ? { parentSha256 } : {}),
      ...(completedAt ? { createdAt: completedAt } : {}),
    });
    const candidateBytes = await artifacts.read(candidate.artifactId);
    const localReview = createImageProvenancePacket(candidateBytes, {
      evidence: [{ id: "provider-record", kind: "evavo-record", record }],
    });
    if (localReview.status !== "verified" || localReview.summary.hashBindingsVerified !== 1) {
      throw new ProviderError(
        "PROVIDER_PROVENANCE_BINDING_FAILED",
        `Provider provenance record did not bind to candidate ${candidate.artifactId}.`,
        "permanent",
      );
    }
    return Object.freeze({
      candidateArtifactId: candidate.artifactId,
      candidateIndex: index + 1,
      mediaType: candidate.mediaType,
      sizeBytes: candidate.sizeBytes,
      record,
      localBindingReview: Object.freeze({
        packetContract: localReview.contract,
        status: localReview.status,
        assetSha256: localReview.asset.sha256,
        hashBindingsVerified: localReview.summary.hashBindingsVerified,
        externalCryptographicVerificationPerformedByArtStudio: false,
        originClaimExternallyVerified: false,
      }),
    });
  }));

  const bundle = Object.freeze({
    schemaVersion: "1.0",
    contract: PROVIDER_PROVENANCE_BUNDLE_CONTRACT,
    providerProtocolVersion: result.protocolVersion,
    requestId: result.requestId,
    requestSha256: result.requestSha256,
    compiledPromptSha256: result.compiledPromptSha256,
    operation: request.operation,
    adapterId: result.adapterId,
    model: result.model,
    providerEvidenceArtifactId: providerEvidence.artifactId,
    referenceBindings,
    baseImageParentBinding: Object.freeze({
      status: baseBindings.length === 0 ? "absent" : baseBindings.length === 1 ? "single" : "ambiguous",
      count: baseBindings.length,
      ...(parentSha256 ? { parentSha256 } : {}),
    }),
    candidateRecords: Object.freeze(records),
    trustBoundary: Object.freeze({
      recordsCreatedByEvavoProviderOrchestrator: true,
      exactCandidateSha256VerifiedLocally: true,
      exactReferenceSha256VerifiedLocally: true,
      providerOrContentCredentialSignatureVerifiedHere: false,
      providerReportedOriginIsExternallyAuthenticated: false,
      pixelOriginInferenceUsed: false,
      automaticCreativeApproval: false,
      publicationAllowed: false,
    }),
  });

  return artifacts.put(`${JSON.stringify(bundle, null, 2)}\n`, {
    mediaType: "application/json",
    storageClass: "evidence",
    fileName: `${request.requestId}.provider-provenance.json`,
    sourceArtifacts: Object.freeze([
      providerEvidence.artifactId,
      ...candidates.map((candidate) => candidate.artifactId),
      ...new Set(referenceBindings.map((entry) => entry.artifactId)),
    ]),
    labels: {
      artifactRole: "provider-candidate-provenance",
      providerRequestId: request.requestId,
      candidateFamilyId: request.candidateFamilyId,
      assetId: request.assetId,
      operation: request.operation,
      approvalState: "unapproved",
    },
    metadata: normalizeJson({
      contract: PROVIDER_PROVENANCE_BUNDLE_CONTRACT,
      requestSha256: result.requestSha256,
      candidateCount: candidates.length,
      referenceBindingCount: referenceBindings.length,
      providerOriginReported: origin,
      externalAuthenticationPerformed: false,
      publicationAllowed: false,
    }),
  });
}

/**
 * Public provider execution boundary. Successful provider calls are not returned
 * until immutable candidate/evidence artifacts have also been bound into a
 * provenance bundle. The underlying raw orchestrator remains an internal module.
 */
export async function executeProviderCandidateRequest(
  input: unknown,
  options: ExecuteProviderCandidateOptions,
): Promise<ProviderCandidateRunWithProvenanceResult> {
  const request = validateProviderCandidateRequest(input);
  const result = await executeProviderCandidateRequestRaw(request, options);
  try {
    const provenance = await storeProviderProvenanceBundle(request, result, options.artifacts);
    return Object.freeze({
      ...result,
      provenanceArtifact: provenance.artifactId,
    });
  } catch (error: unknown) {
    throw new ProviderError(
      "PROVIDER_PROVENANCE_EMISSION_FAILED",
      `Provider candidates were created but their mandatory provenance bundle could not be stored: ${error instanceof Error ? error.message : String(error)}`,
      "permanent",
      {
        details: normalizeJson({
          candidateArtifacts: result.candidateArtifacts,
          evidenceArtifactId: result.evidenceArtifact,
          requestId: result.requestId,
          causeCode: error instanceof ProviderError ? error.code : null,
        }),
      },
    );
  }
}
