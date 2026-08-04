import {
  canonicalBookJson,
  sha256BookText,
} from "./book-studio-project-contracts";
import {
  compileBookUniversalReadiness as compileBaseBookUniversalReadiness,
  type BookAutomationStageV1,
  type BookReadinessFindingV1,
  type BookUniversalReadinessResultV1,
  type BookUniversalReadinessStatus,
  type BookVolumeUniversalReadinessV1,
} from "./book-studio-universal-readiness";

type UnknownRecord = Record<string, unknown>;

/**
 * Public, fail-closed readiness compiler.
 *
 * The underlying project contract deliberately rejects unsafe authority policy.
 * This governed boundary preserves that rejection while also returning precise,
 * actionable quality blockers and strengthening the external proof ordering.
 */
export async function compileGovernedBookUniversalReadiness(
  input: unknown,
): Promise<BookUniversalReadinessResultV1> {
  const base = await compileBaseBookUniversalReadiness(input);
  const volumes = await Promise.all(base.volumes.map(hardenVolumeStageOrder));
  const findings = uniqueFindings([
    ...base.findings,
    ...compileGovernanceFindings(input, base.projectId),
  ]);
  const { resultFingerprint: _discarded, ...baseWithoutFingerprint } = base;
  const withoutFingerprint: Omit<BookUniversalReadinessResultV1, "resultFingerprint"> = {
    ...baseWithoutFingerprint,
    status: statusFor(findings),
    volumes,
    blockerIds: findings
      .filter((finding) => finding.severity === "blocker")
      .map((finding) => finding.findingId),
    warningIds: findings
      .filter((finding) => finding.severity === "warning")
      .map((finding) => finding.findingId),
    findings,
  };
  return {
    ...withoutFingerprint,
    resultFingerprint: await sha256BookText(canonicalBookJson(withoutFingerprint)),
  };
}

async function hardenVolumeStageOrder(
  volume: BookVolumeUniversalReadinessV1,
): Promise<BookVolumeUniversalReadinessV1> {
  const metadata = volume.automationStages.find(
    (stage) => stage.kind === "metadata_rights_and_identifiers",
  );
  const previewer = volume.automationStages.find(
    (stage) => stage.kind === "external_previewer",
  );
  const proof = volume.automationStages.find(
    (stage) => stage.kind === "physical_proof",
  );

  const automationStages = volume.automationStages.map((stage) => {
    let dependencies = [...stage.dependsOnStageIds];
    if (stage.kind === "external_previewer" && metadata) {
      dependencies = [metadata.stageId];
    } else if (stage.kind === "physical_proof") {
      if (previewer) dependencies = [previewer.stageId];
      else if (metadata) dependencies = [metadata.stageId];
    } else if (stage.kind === "release_approval") {
      dependencies = [
        ...(metadata ? [metadata.stageId] : []),
        ...(previewer ? [previewer.stageId] : []),
        ...(proof ? [proof.stageId] : []),
      ];
    }
    return {
      ...stage,
      dependsOnStageIds: unique(dependencies).sort(),
    } satisfies BookAutomationStageV1;
  });

  const { readinessFingerprint: _discarded, ...withoutFingerprint } = volume;
  const hardened: Omit<BookVolumeUniversalReadinessV1, "readinessFingerprint"> = {
    ...withoutFingerprint,
    automationStages,
  };
  return {
    ...hardened,
    readinessFingerprint: await sha256BookText(canonicalBookJson(hardened)),
  };
}

function compileGovernanceFindings(
  input: unknown,
  projectId: string,
): BookReadinessFindingV1[] {
  const project = readRecord(input);
  if (!project) return [];
  const provider = readRecord(project.providerPolicy);
  const quality = readRecord(project.qualityPolicy);
  const publication = readRecord(project.publicationPolicy);
  const art = readRecord(project.artPolicy);
  const findings: BookReadinessFindingV1[] = [];
  const add = (code: string, message: string, remediation: string) => {
    findings.push({
      findingId: `project:${projectId}:${code}`,
      code,
      severity: "blocker",
      scope: "project",
      scopeId: projectId,
      message,
      remediation,
    });
  };

  const providerIds = Array.isArray(provider?.providers)
    ? provider.providers.filter((value): value is string => typeof value === "string")
    : [];
  if (
    providerIds.includes("chatgpt") &&
    provider?.chatgptStrictJsonSchemaRequired === false
  ) {
    add(
      "chatgpt_strict_schema_required",
      "ChatGPT is enabled without strict JSON Schema output.",
      "Require the native strict JSON Schema response contract before any ChatGPT candidate execution.",
    );
  }
  if (
    providerIds.includes("claude") &&
    provider?.claudeForcedToolRequired === false
  ) {
    add(
      "claude_forced_tool_required",
      "Claude is enabled without one forced named-tool response.",
      "Require exactly one native forced tool call using the governed candidate schema.",
    );
  }
  if (
    providerIds.includes("other_compatible_model") &&
    provider?.compatibleAdapterSchemaRequired === false
  ) {
    add(
      "compatible_adapter_schema_required",
      "Compatible-model execution is enabled without its strongest structured adapter contract.",
      "Require an adapter-native bounded structured response before candidate execution.",
    );
  }
  if (provider?.providerSubstitutionAllowed === true) {
    add(
      "provider_substitution_forbidden",
      "Provider substitution is permitted by the project policy.",
      "Bind every request and response to the exact requested provider and model; do not silently fall back.",
    );
  }
  requiredTrue(
    provider,
    "exactProfileFingerprintRequired",
    "exact_profile_fingerprint_required",
    "The provider policy does not require the exact craft-profile fingerprint.",
    "Bind every candidate to the exact approved craft profile.",
    add,
  );
  requiredTrue(
    provider,
    "exactPacketFingerprintRequired",
    "exact_packet_fingerprint_required",
    "The provider policy does not require the exact authoring-packet fingerprint.",
    "Bind every candidate to the exact immutable context packet.",
    add,
  );
  requiredTrue(
    provider,
    "strictResponseIdentityRequired",
    "strict_response_identity_required",
    "The provider policy does not require exact response identity.",
    "Reject provider, model, project, volume, unit, packet, profile, or continuation identity mismatches.",
    add,
  );
  requiredTrue(
    provider,
    "phraseOverlapBeforeCanonicalAdmission",
    "phrase_overlap_gate_required",
    "Phrase-overlap assurance is disabled before canonical admission.",
    "Run rights-tracked phrase-overlap checks before any candidate can enter canonical review.",
    add,
  );

  requiredTrue(
    quality,
    "exactSourceCoverageRequired",
    "exact_source_coverage_required",
    "Exact no-skipped-text source coverage is disabled.",
    "Require exact source partitioning, blank-span preservation, offsets, hashes, and complete coverage evidence.",
    add,
  );
  requiredTrue(
    quality,
    "currentVersionFullReadRequired",
    "current_version_full_read_required",
    "The current manuscript version is not required to receive a complete read.",
    "Require a complete current-version read before architecture, revision, or release decisions.",
    add,
  );
  if (
    typeof quality?.minimumMaterialAlternatives === "number" &&
    quality.minimumMaterialAlternatives < 3
  ) {
    add(
      "minimum_material_alternatives_insufficient",
      "The project requests fewer than three materially different alternatives.",
      "Require at least three genuinely different options for consequential creative or structural decisions.",
    );
  }
  requiredTrue(
    quality,
    "independentReviewRequired",
    "independent_review_required",
    "Independent review is disabled.",
    "Require an independent producer or reviewer who did not create the candidate under review.",
    add,
  );
  requiredTrue(
    quality,
    "compareAndSwapCanonicalMutationRequired",
    "canonical_compare_and_swap_required",
    "Canonical mutation is not protected by compare-and-swap identity.",
    "Require the exact current revision and fingerprint before any canonical transaction can commit.",
    add,
  );
  if (quality?.automaticCanonicalAdmissionAllowed === true) {
    add(
      "automatic_canonical_admission_forbidden",
      "The project permits automatic canonical admission.",
      "Keep provider output as an immutable candidate until all review, rights, continuity, evidence, and named approval gates pass.",
    );
  }
  requiredTrue(
    quality,
    "antiGenericityReviewRequired",
    "anti_genericity_review_required",
    "Anti-genericity review is disabled.",
    "Require concrete, project-specific language, scene, argument, voice, and evidence review before admission.",
    add,
  );
  requiredTrue(
    quality,
    "projectOwnedVoiceEvidenceRequired",
    "project_owned_voice_evidence_required",
    "Project-owned voice evidence is disabled.",
    "Use only project-owned or rights-cleared abstract craft evidence; never depend on named-author imitation.",
    add,
  );

  requiredTrue(
    publication,
    "manualSubmissionOnly",
    "manual_submission_required",
    "The project permits automatic publication submission.",
    "Keep Amazon and other platform submission behind exact external evidence and named manual approval.",
    add,
  );
  requiredTrue(
    publication,
    "metadataVerificationRequired",
    "publication_metadata_verification_required",
    "Publication metadata verification is disabled.",
    "Require exact title, contributor, edition, description, category, keyword, language, pricing, territory, and identifier review.",
    add,
  );
  requiredTrue(
    publication,
    "rightsVerificationRequired",
    "publication_rights_verification_required",
    "Rights verification is disabled.",
    "Require manuscript, quotation, image, font, dataset, map, contributor, and other third-party rights evidence.",
    add,
  );
  requiredTrue(
    publication,
    "aiDisclosureDecisionRequired",
    "publication_ai_disclosure_decision_required",
    "The platform-specific AI disclosure decision is disabled.",
    "Record the exact disclosure decision for writing, images, and other generated material for every edition.",
    add,
  );
  requiredTrue(
    publication,
    "namedReleaseApprovalRequired",
    "named_release_approval_required",
    "Named release approval is disabled.",
    "Require one named release authority to approve the exact files, metadata, rights, identifiers, previews, and proofs.",
    add,
  );

  const publicationNeeds = inspectPublicationNeeds(project);
  if (publicationNeeds.previewer && publication?.previewerEvidenceRequired === false) {
    add(
      "project_previewer_evidence_required",
      "An enabled digital or print edition lacks a project-level Previewer evidence requirement.",
      "Require current Kindle or print Previewer evidence for every applicable edition.",
    );
  }
  if (publicationNeeds.physicalProof && publication?.physicalProofEvidenceRequired === false) {
    add(
      "project_physical_proof_required",
      "An enabled print edition lacks a project-level physical-proof requirement.",
      "Require a current paperback or hardcover proof review before named release approval.",
    );
  }

  if (art?.artStudioEnabled === true) {
    requiredTrue(
      art,
      "generatedArtworkTextFreeRequired",
      "generated_artwork_text_free_required",
      "Generated artwork may contain baked-in text.",
      "Keep generated pixels text-free and place all publication text in editable Docs Suite layers.",
      add,
    );
    requiredTrue(
      art,
      "editableTypographyRequired",
      "editable_typography_required",
      "Editable typography is disabled for Art Studio work.",
      "Require editable title, author, series, spine, caption, label, ISBN, and barcode layers.",
      add,
    );
    requiredTrue(
      art,
      "credentialsServerSideOnly",
      "art_credentials_server_side_required",
      "Art provider credentials are not restricted to server-side execution.",
      "Keep every provider credential server-side and out of clients, manifests, evidence, and generated artifacts.",
      add,
    );
    requiredTrue(
      art,
      "remoteWritesDisabledByDefault",
      "art_remote_writes_disabled_by_default_required",
      "Art Studio remote writes are enabled by default.",
      "Keep remote writes disabled until an exact authenticated operation explicitly enables the bounded write.",
      add,
    );
    requiredTrue(
      art,
      "sourceAndModelProvenanceRequired",
      "art_provenance_required",
      "Source and model provenance is disabled for Art Studio work.",
      "Require source, rights, provider, model, prompt-digest, candidate, QA, selection, and promotion evidence.",
      add,
    );
  }

  return findings;
}

function inspectPublicationNeeds(project: UnknownRecord): {
  previewer: boolean;
  physicalProof: boolean;
} {
  const volumes = Array.isArray(project.volumes) ? project.volumes : [];
  let previewer = false;
  let physicalProof = false;
  for (const candidate of volumes) {
    const volume = readRecord(candidate);
    const editions = Array.isArray(volume?.editionPlans) ? volume.editionPlans : [];
    for (const editionCandidate of editions) {
      const edition = readRecord(editionCandidate);
      if (!edition || edition.enabled !== true || typeof edition.format !== "string") continue;
      if (["kindle_reflowable", "kindle_fixed_layout", "paperback", "hardcover", "large_print"].includes(edition.format)) {
        previewer = true;
      }
      if (["paperback", "hardcover", "large_print"].includes(edition.format)) {
        physicalProof = true;
      }
    }
  }
  return { previewer, physicalProof };
}

function requiredTrue(
  source: UnknownRecord | undefined,
  field: string,
  code: string,
  message: string,
  remediation: string,
  add: (code: string, message: string, remediation: string) => void,
): void {
  if (source?.[field] === false) add(code, message, remediation);
}

function readRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function uniqueFindings(
  findings: BookReadinessFindingV1[],
): BookReadinessFindingV1[] {
  const byId = new Map<string, BookReadinessFindingV1>();
  for (const finding of findings) {
    const current = byId.get(finding.findingId);
    if (!current || (current.severity === "warning" && finding.severity === "blocker")) {
      byId.set(finding.findingId, finding);
    }
  }
  return [...byId.values()].sort((left, right) =>
    left.findingId.localeCompare(right.findingId),
  );
}

function statusFor(
  findings: BookReadinessFindingV1[],
): BookUniversalReadinessStatus {
  if (findings.some((finding) => finding.severity === "blocker")) return "blocked";
  if (findings.some((finding) => finding.severity === "warning")) return "needs_work";
  return "ready_for_automation";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
