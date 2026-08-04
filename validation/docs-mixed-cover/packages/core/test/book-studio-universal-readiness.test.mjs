import assert from "node:assert/strict";
import test from "node:test";

import {
  SUPPORTED_BOOK_CONTENT_CLASSES,
  compileBookUniversalReadiness,
} from "../src/book-studio-universal-readiness.ts";

function edition(editionId, format) {
  const print = ["paperback", "hardcover", "large_print"].includes(format);
  return {
    editionId,
    format,
    enabled: true,
    colourMode: format === "audiobook"
      ? "audio"
      : print
        ? "black_and_white"
        : "digital_rgb",
    ...(print ? { trimWidthInches: 6, trimHeightInches: 9 } : {}),
    requiresExternalTemplate: print,
    requiresPreviewerEvidence: format !== "audiobook",
    requiresPhysicalProof: print,
    outputFileRoleIds: format === "audiobook"
      ? [`${editionId}-audio-master`, `${editionId}-cover`]
      : [`${editionId}-interior`, `${editionId}-cover`],
  };
}

function volume(contentClass, volumeId = "volume-1", sequence = 1, dependencies = []) {
  return {
    volumeId,
    title: `Book ${sequence}`,
    sequence,
    contentClass,
    ...(contentClass === "custom" ? { customContentClass: "specialist_compendium" } : {}),
    role: sequence === 1 ? "primary" : "sequel",
    status: "source_only",
    language: "en-AU",
    targetWords: 80_000,
    minimumWords: 60_000,
    maximumWords: 100_000,
    sourceAuthorityIds: [`source-authority-${sequence}`],
    dependsOnVolumeIds: dependencies,
    reviewProfileIds: [],
    editionPlans: [
      edition(`kindle-${sequence}`, "kindle_reflowable"),
      edition(`paperback-${sequence}`, "paperback"),
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
  };
}

function project(contentClass = "fiction") {
  return {
    projectId: `universal-${contentClass.replaceAll("_", "-")}`,
    programmeId: "universal-programme",
    projectTitle: "Universal Book Readiness Fixture",
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
    volumes: [volume(contentClass)],
  };
}

function findingCodes(result) {
  return new Set(result.findings.map((item) => item.code));
}

test("supports every versioned Book content class with one deterministic quality pipeline", async () => {
  assert.equal(SUPPORTED_BOOK_CONTENT_CLASSES.length, 16);
  for (const contentClass of SUPPORTED_BOOK_CONTENT_CLASSES) {
    const result = await compileBookUniversalReadiness(project(contentClass));
    assert.equal(result.status, "ready_for_automation", `${contentClass}: ${result.findings.map((item) => item.message).join("\n")}`);
    assert.equal(result.blockerIds.length, 0);
    assert.equal(result.warningIds.length, 0);
    assert.equal(result.volumes[0]?.contentClass, contentClass);
    const minimumProfiles = contentClass === "custom" ? 7 : 12;
    assert.ok(result.volumes[0]?.reviewProfileIds.length >= minimumProfiles);
    assert.ok(result.volumes[0]?.automationStages.some((stage) => stage.kind === "writing_candidate" && stage.owner === "writing_studio"));
    assert.ok(result.volumes[0]?.automationStages.some((stage) => stage.kind === "cover_candidate" && stage.owner === "art_studio"));
    assert.ok(result.volumes[0]?.automationStages.some((stage) => stage.kind === "cover_binding" && stage.owner === "docs_suite"));
    assert.ok(result.volumes[0]?.automationStages.some((stage) => stage.kind === "release_approval" && stage.owner === "human_or_external"));
    assert.equal(result.providerCallPerformed, false);
    assert.equal(result.runtimeJobSubmitted, false);
    assert.equal(result.artifactBytesWritten, false);
    assert.equal(result.canonicalAdmissionAllowed, false);
    assert.equal(result.automaticPublicationAllowed, false);
  }
});

test("blocks contradictory book, cover, illustration, edition and release settings", async () => {
  const input = project("graphic_novel");
  const book = input.volumes[0];
  input.publicationPolicy.isbnEvidenceRequired = false;
  input.publicationPolicy.barcodeEvidenceRequired = false;
  input.artPolicy.artStudioEnabled = false;
  book.status = "release_candidate";
  book.namedApprovalRequired = false;
  book.coverPlan.editableTypographyRequired = false;
  book.coverPlan.manuscriptEvidenceRequired = false;
  book.illustrationPlan.mode = "none";
  book.illustrationPlan.minimumCount = 0;
  book.illustrationPlan.targetCount = 0;
  book.illustrationPlan.maximumCount = 0;
  book.illustrationPlan.fullPageTarget = 0;
  book.illustrationPlan.smallOrInlineTarget = 0;
  const paperback = book.editionPlans.find((item) => item.format === "paperback");
  delete paperback.trimWidthInches;
  delete paperback.trimHeightInches;
  paperback.colourMode = "digital_rgb";
  paperback.requiresExternalTemplate = false;
  paperback.requiresPreviewerEvidence = false;
  paperback.requiresPhysicalProof = false;
  paperback.outputFileRoleIds = [];

  const result = await compileBookUniversalReadiness(input);
  const codes = findingCodes(result);
  assert.equal(result.status, "blocked");
  for (const code of [
    "release_state_requires_manuscript_identity",
    "named_volume_approval_required",
    "visual_first_book_requires_illustrations",
    "art_studio_required_for_art_work",
    "cover_editable_typography_required",
    "cover_manuscript_evidence_required",
    "print_isbn_evidence_required",
    "print_barcode_evidence_required",
    "edition_output_roles_required",
    "print_trim_dimensions_required",
    "print_colour_mode_invalid",
    "kdp_print_template_required",
    "print_previewer_evidence_required",
    "physical_proof_evidence_required",
  ]) assert.ok(codes.has(code), `missing ${code}`);
});

test("blocks reflow, generated-text and empty-edition edge cases", async () => {
  const input = project("children");
  const book = input.volumes[0];
  book.illustrationPlan.reflowFallback = "fixed_layout_only";
  book.illustrationPlan.textFreeGeneratedArtworkRequired = false;
  book.illustrationPlan.editableLabelsRequired = true;
  const result = await compileBookUniversalReadiness(input);
  const codes = findingCodes(result);
  assert.equal(result.status, "blocked");
  assert.ok(codes.has("illustration_text_free_policy_mismatch"));
  assert.ok(codes.has("editable_labels_require_text_free_art"));
  assert.ok(codes.has("reflowable_edition_conflicts_with_fixed_layout_art"));

  const noEdition = project("fiction");
  for (const item of noEdition.volumes[0].editionPlans) item.enabled = false;
  const noEditionResult = await compileBookUniversalReadiness(noEdition);
  assert.equal(noEditionResult.status, "blocked");
  assert.ok(findingCodes(noEditionResult).has("enabled_edition_required"));
});

test("supports a typography-only cover path without inventing Art Studio work", async () => {
  const input = project("fiction");
  input.artPolicy.artStudioEnabled = false;
  const book = input.volumes[0];
  book.coverPlan.textFreeGeneratedArtworkRequired = false;
  book.illustrationPlan = {
    mode: "none",
    minimumCount: 0,
    targetCount: 0,
    maximumCount: 0,
    fullPageTarget: 0,
    smallOrInlineTarget: 0,
    textWrapRequired: false,
    reflowFallback: "not_applicable",
    textFreeGeneratedArtworkRequired: true,
    editableLabelsRequired: true,
    sourceEvidenceRequired: true,
  };
  const result = await compileBookUniversalReadiness(input);
  assert.equal(result.status, "ready_for_automation", result.findings.map((item) => item.message).join("\n"));
  const stages = result.volumes[0].automationStages;
  assert.ok(stages.some((stage) => stage.kind === "cover_brief" && stage.owner === "docs_suite"));
  assert.ok(stages.some((stage) => stage.kind === "cover_selection" && stage.owner === "human_or_external"));
  assert.equal(stages.some((stage) => stage.kind === "cover_candidate"), false);
  assert.equal(stages.some((stage) => stage.kind === "cover_binding"), false);
  assert.equal(result.totals.artworkUseBindingTarget, 0);
});

test("is deterministic across series input order and preserves bounded ownership", async () => {
  const firstInput = project("fiction");
  firstInput.projectId = "series-project";
  firstInput.projectKind = "series";
  firstInput.sourceAuthorityIds.push("source-authority-2");
  firstInput.volumes.push(volume("fiction", "volume-2", 2, ["volume-1"]));
  const secondInput = structuredClone(firstInput);
  secondInput.volumes.reverse();
  for (const item of secondInput.volumes) item.editionPlans.reverse();

  const first = await compileBookUniversalReadiness(firstInput);
  const second = await compileBookUniversalReadiness(secondInput);
  assert.equal(first.status, "ready_for_automation", first.findings.map((item) => item.message).join("\n"));
  assert.equal(first.resultFingerprint, second.resultFingerprint);
  assert.deepEqual(first.orderedVolumeIds, ["volume-1", "volume-2"]);
  assert.deepEqual(first.releaseWaves.map((wave) => wave.volumeIds), [["volume-1"], ["volume-2"]]);
  assert.equal(first.totals.volumeCount, 2);
  assert.equal(first.totals.coverBriefTarget, 6);
  assert.equal(first.totals.coverCandidateTarget, 12);
  assert.equal(first.totals.artworkUseBindingTarget, 6);
  for (const item of first.volumes) {
    assert.ok(item.automationStages.every((stage) => stage.required));
    assert.ok(item.automationStages.filter((stage) => stage.automaticExecutionAllowed).every((stage) => stage.owner !== "human_or_external"));
  }
});
