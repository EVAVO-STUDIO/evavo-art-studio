import assert from "node:assert/strict";
import test from "node:test";

import {
  compileGovernedBookUniversalReadiness,
} from "../src/book-studio-universal-readiness-governance.ts";

function edition(editionId, format) {
  const print = ["paperback", "hardcover", "large_print"].includes(format);
  return {
    editionId,
    format,
    enabled: true,
    colourMode: print ? "black_and_white" : "digital_rgb",
    ...(print ? { trimWidthInches: 6, trimHeightInches: 9 } : {}),
    requiresExternalTemplate: print,
    requiresPreviewerEvidence: true,
    requiresPhysicalProof: print,
    outputFileRoleIds: [`${editionId}-interior`, `${editionId}-cover`],
  };
}

function project() {
  return {
    projectId: "governed-readiness-project",
    programmeId: "governed-readiness-programme",
    projectTitle: "Governed Readiness Fixture",
    projectKind: "standalone",
    contributorDisplayNames: ["Named author"],
    defaultLanguage: "en-AU",
    sourceAuthorityIds: ["source-authority-1"],
    evidenceIds: ["rights-evidence-1"],
    globalConstraintIds: ["source-grounded", "no-filler"],
    providerPolicy: {
      providers: ["chatgpt", "claude", "other_compatible_model"],
      chatgptStrictJsonSchemaRequired: true,
      claudeForcedToolRequired: true,
      compatibleAdapterSchemaRequired: true,
      providerSubstitutionAllowed: false,
      exactProfileFingerprintRequired: true,
      exactPacketFingerprintRequired: true,
      strictResponseIdentityRequired: true,
      phraseOverlapBeforeCanonicalAdmission: true,
    },
    qualityPolicy: {
      exactSourceCoverageRequired: true,
      currentVersionFullReadRequired: true,
      minimumMaterialAlternatives: 3,
      independentReviewRequired: true,
      compareAndSwapCanonicalMutationRequired: true,
      automaticCanonicalAdmissionAllowed: false,
      antiGenericityReviewRequired: true,
      projectOwnedVoiceEvidenceRequired: true,
      defaultReviewProfileIds: ["source-coverage", "independent-review"],
    },
    publicationPolicy: {
      targetPlatformIds: ["amazon-kdp"],
      manualSubmissionOnly: true,
      metadataVerificationRequired: true,
      rightsVerificationRequired: true,
      aiDisclosureDecisionRequired: true,
      isbnEvidenceRequired: true,
      barcodeEvidenceRequired: true,
      previewerEvidenceRequired: true,
      physicalProofEvidenceRequired: true,
      namedReleaseApprovalRequired: true,
    },
    artPolicy: {
      artStudioEnabled: true,
      generatedArtworkTextFreeRequired: true,
      editableTypographyRequired: true,
      credentialsServerSideOnly: true,
      remoteWritesDisabledByDefault: true,
      sourceAndModelProvenanceRequired: true,
    },
    volumes: [{
      volumeId: "volume-1",
      title: "Governed Book",
      sequence: 1,
      contentClass: "fiction",
      role: "primary",
      status: "source_only",
      language: "en-AU",
      targetWords: 80_000,
      minimumWords: 60_000,
      maximumWords: 100_000,
      sourceAuthorityIds: ["source-authority-1"],
      dependsOnVolumeIds: [],
      reviewProfileIds: [],
      editionPlans: [
        edition("kindle-1", "kindle_reflowable"),
        edition("paperback-1", "paperback"),
      ],
      illustrationPlan: {
        mode: "mixed",
        minimumCount: 1,
        targetCount: 2,
        maximumCount: 3,
        fullPageTarget: 1,
        smallOrInlineTarget: 1,
        textWrapRequired: false,
        reflowFallback: "separate_accessible_figure",
        textFreeGeneratedArtworkRequired: true,
        editableLabelsRequired: true,
        sourceEvidenceRequired: true,
      },
      coverPlan: {
        routeCount: 3,
        candidatesPerRoute: 2,
        textFreeGeneratedArtworkRequired: true,
        editableTypographyRequired: true,
        seriesIdentityRequired: true,
        manuscriptEvidenceRequired: true,
      },
      constraintIds: [],
      namedApprovalRequired: true,
    }],
  };
}

function codes(result) {
  return new Set(result.findings.map((finding) => finding.code));
}

test("returns precise blockers while the strict project contract remains fail-closed", async () => {
  const input = project();
  input.providerPolicy.chatgptStrictJsonSchemaRequired = false;
  input.providerPolicy.claudeForcedToolRequired = false;
  input.providerPolicy.compatibleAdapterSchemaRequired = false;
  input.providerPolicy.providerSubstitutionAllowed = true;
  input.providerPolicy.exactProfileFingerprintRequired = false;
  input.providerPolicy.exactPacketFingerprintRequired = false;
  input.providerPolicy.strictResponseIdentityRequired = false;
  input.providerPolicy.phraseOverlapBeforeCanonicalAdmission = false;
  input.qualityPolicy.exactSourceCoverageRequired = false;
  input.qualityPolicy.currentVersionFullReadRequired = false;
  input.qualityPolicy.minimumMaterialAlternatives = 2;
  input.qualityPolicy.independentReviewRequired = false;
  input.qualityPolicy.compareAndSwapCanonicalMutationRequired = false;
  input.qualityPolicy.automaticCanonicalAdmissionAllowed = true;
  input.qualityPolicy.antiGenericityReviewRequired = false;
  input.qualityPolicy.projectOwnedVoiceEvidenceRequired = false;
  input.publicationPolicy.manualSubmissionOnly = false;
  input.publicationPolicy.metadataVerificationRequired = false;
  input.publicationPolicy.rightsVerificationRequired = false;
  input.publicationPolicy.aiDisclosureDecisionRequired = false;
  input.publicationPolicy.previewerEvidenceRequired = false;
  input.publicationPolicy.physicalProofEvidenceRequired = false;
  input.publicationPolicy.namedReleaseApprovalRequired = false;
  input.artPolicy.generatedArtworkTextFreeRequired = false;
  input.artPolicy.editableTypographyRequired = false;
  input.artPolicy.credentialsServerSideOnly = false;
  input.artPolicy.remoteWritesDisabledByDefault = false;
  input.artPolicy.sourceAndModelProvenanceRequired = false;

  const result = await compileGovernedBookUniversalReadiness(input);
  const actual = codes(result);
  assert.equal(result.status, "blocked");
  assert.ok(actual.has("project_contract_invalid"));
  for (const code of [
    "chatgpt_strict_schema_required",
    "claude_forced_tool_required",
    "compatible_adapter_schema_required",
    "provider_substitution_forbidden",
    "exact_profile_fingerprint_required",
    "exact_packet_fingerprint_required",
    "strict_response_identity_required",
    "phrase_overlap_gate_required",
    "exact_source_coverage_required",
    "current_version_full_read_required",
    "minimum_material_alternatives_insufficient",
    "independent_review_required",
    "canonical_compare_and_swap_required",
    "automatic_canonical_admission_forbidden",
    "anti_genericity_review_required",
    "project_owned_voice_evidence_required",
    "manual_submission_required",
    "publication_metadata_verification_required",
    "publication_rights_verification_required",
    "publication_ai_disclosure_decision_required",
    "named_release_approval_required",
    "project_previewer_evidence_required",
    "project_physical_proof_required",
    "generated_artwork_text_free_required",
    "editable_typography_required",
    "art_credentials_server_side_required",
    "art_remote_writes_disabled_by_default_required",
    "art_provenance_required",
  ]) assert.ok(actual.has(code), `missing ${code}`);
  assert.equal(result.canonicalAdmissionAllowed, false);
  assert.equal(result.automaticPublicationAllowed, false);
  assert.equal(result.publicationPerformed, false);
});

test("orders metadata, Previewer, physical proof and release approval deterministically", async () => {
  const input = project();
  const first = await compileGovernedBookUniversalReadiness(input);
  const second = await compileGovernedBookUniversalReadiness(structuredClone(input));
  assert.equal(first.status, "ready_for_automation", first.findings.map((finding) => finding.message).join("\n"));
  assert.equal(first.resultFingerprint, second.resultFingerprint);

  const stages = first.volumes[0].automationStages;
  const metadata = stages.find((stage) => stage.kind === "metadata_rights_and_identifiers");
  const previewer = stages.find((stage) => stage.kind === "external_previewer");
  const proof = stages.find((stage) => stage.kind === "physical_proof");
  const release = stages.find((stage) => stage.kind === "release_approval");
  assert.ok(metadata && previewer && proof && release);
  assert.deepEqual(previewer.dependsOnStageIds, [metadata.stageId]);
  assert.deepEqual(proof.dependsOnStageIds, [previewer.stageId]);
  assert.deepEqual(release.dependsOnStageIds, [
    metadata.stageId,
    previewer.stageId,
    proof.stageId,
  ].sort());
  assert.equal(previewer.automaticExecutionAllowed, false);
  assert.equal(proof.automaticExecutionAllowed, false);
  assert.equal(release.automaticExecutionAllowed, false);
});
