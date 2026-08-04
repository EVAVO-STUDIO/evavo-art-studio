import {
  canonicalBookJson,
  compileBookProjectProgramme,
  sha256BookText,
  validateAndNormalizeBookProject,
  type BookContentClass,
  type BookProjectProgrammeV1,
  type BookProjectV1,
  type BookVolumeV1,
} from "./book-studio-project-contracts";

export const BOOK_UNIVERSAL_READINESS_CONTRACT =
  "evavo_docs_book_universal_readiness_v1" as const;

export const SUPPORTED_BOOK_CONTENT_CLASSES: readonly BookContentClass[] = Object.freeze([
  "fiction",
  "memoir",
  "nonfiction",
  "academic",
  "textbook",
  "reference",
  "cookbook",
  "children",
  "graphic_novel",
  "poetry",
  "anthology",
  "workbook",
  "manual",
  "illustrated",
  "hybrid",
  "custom",
]);

export type BookUniversalReadinessStatus =
  | "blocked"
  | "needs_work"
  | "ready_for_automation";

export type BookReadinessSeverity = "blocker" | "warning";
export type BookReadinessScope = "project" | "volume" | "edition";
export type BookAutomationOwner =
  | "docs_suite"
  | "writing_studio"
  | "art_studio"
  | "human_or_external";

export type BookAutomationStageKind =
  | "source_coverage"
  | "writing_candidate"
  | "editorial_review"
  | "canonical_admission"
  | "cover_brief"
  | "cover_candidate"
  | "cover_quality"
  | "cover_selection"
  | "cover_promotion"
  | "cover_binding"
  | "illustration_brief"
  | "illustration_candidate"
  | "illustration_quality"
  | "illustration_selection"
  | "illustration_promotion"
  | "illustration_binding"
  | "edition_design"
  | "render_and_accessibility"
  | "metadata_rights_and_identifiers"
  | "external_previewer"
  | "physical_proof"
  | "release_approval";

export interface BookReadinessFindingV1 {
  findingId: string;
  code: string;
  severity: BookReadinessSeverity;
  scope: BookReadinessScope;
  scopeId: string;
  message: string;
  remediation: string;
}

export interface BookAutomationStageV1 {
  stageId: string;
  volumeId: string;
  kind: BookAutomationStageKind;
  owner: BookAutomationOwner;
  required: true;
  automaticExecutionAllowed: boolean;
  dependsOnStageIds: string[];
  gateIds: string[];
}

export interface BookCoverReadinessV1 {
  creativeRouteTarget: number;
  candidatesPerRoute: number;
  candidateTarget: number;
  manuscriptBoundBriefRequired: true;
  textFreeArtworkRequired: boolean;
  editableTypographyRequired: boolean;
  seriesIdentityRequired: boolean;
  immutablePromotionRequired: boolean;
  exactBookUseBindingRequired: boolean;
}

export interface BookIllustrationReadinessV1 {
  mode: BookVolumeV1["illustrationPlan"]["mode"];
  briefTarget: number;
  candidateTarget: number;
  fullPageTarget: number;
  smallOrInlineTarget: number;
  textWrapRequired: boolean;
  reflowFallback: BookVolumeV1["illustrationPlan"]["reflowFallback"];
  textFreeArtworkRequired: boolean;
  editableLabelsRequired: boolean;
  sourceEvidenceRequired: boolean;
  immutablePromotionRequired: true;
  exactBookUseBindingRequired: true;
}

export interface BookVolumeUniversalReadinessV1 {
  volumeId: string;
  title: string;
  contentClass: BookContentClass;
  status: BookUniversalReadinessStatus;
  enabledEditionIds: string[];
  enabledEditionFormats: string[];
  reviewProfileIds: string[];
  qualityGateIds: string[];
  cover: BookCoverReadinessV1;
  illustrations: BookIllustrationReadinessV1;
  automationStages: BookAutomationStageV1[];
  blockerIds: string[];
  warningIds: string[];
  findings: BookReadinessFindingV1[];
  readinessFingerprint: string;
}

export interface BookUniversalReadinessTotalsV1 {
  volumeCount: number;
  enabledEditionCount: number;
  coverBriefTarget: number;
  coverCandidateTarget: number;
  illustrationBriefTarget: number;
  artworkUseBindingTarget: number;
  automationStageCount: number;
  externalOrHumanGateCount: number;
}

export interface BookUniversalReadinessResultV1 {
  outputKind: "evavo_docs_book_universal_readiness";
  schemaVersion: 1;
  contract: typeof BOOK_UNIVERSAL_READINESS_CONTRACT;
  status: BookUniversalReadinessStatus;
  projectId: string;
  programmeId: string;
  projectFingerprint: string;
  programmeFingerprint: string;
  supportedContentClasses: BookContentClass[];
  orderedVolumeIds: string[];
  releaseWaves: Array<{ wave: number; volumeIds: string[] }>;
  volumes: BookVolumeUniversalReadinessV1[];
  totals: BookUniversalReadinessTotalsV1;
  blockerIds: string[];
  warningIds: string[];
  findings: BookReadinessFindingV1[];
  resultFingerprint: string;
  planningOnly: true;
  oneBoundedStagePerAutomationCallRequired: true;
  providerCallPerformed: false;
  runtimeJobSubmitted: false;
  artifactBytesWritten: false;
  canonicalAdmissionAllowed: false;
  canonicalManuscriptMutationPerformed: false;
  automaticPublicationAllowed: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

const PRINT_FORMATS = new Set(["paperback", "hardcover", "large_print"]);
const KINDLE_FORMATS = new Set(["kindle_reflowable", "kindle_fixed_layout"]);
const VISUAL_FIRST_CLASSES = new Set<BookContentClass>(["graphic_novel", "illustrated"]);
const VISUAL_RECOMMENDED_CLASSES = new Set<BookContentClass>([
  "children",
  "textbook",
  "reference",
  "cookbook",
  "workbook",
  "manual",
]);
const SOURCE_CRITICAL_CLASSES = new Set<BookContentClass>([
  "memoir",
  "nonfiction",
  "academic",
  "textbook",
  "reference",
  "cookbook",
  "manual",
]);
const SERIES_PROJECT_KINDS = new Set(["series", "shared_universe"]);
const SERIES_RECOMMENDED_PROJECT_KINDS = new Set(["collection", "mixed_catalogue"]);

export async function compileBookUniversalReadiness(
  input: unknown,
): Promise<BookUniversalReadinessResultV1> {
  const validation = await validateAndNormalizeBookProject(input);
  if (validation.status !== "ready" || !validation.project || !validation.projectFingerprint) {
    return sealReadiness({
      status: "blocked",
      projectId: "blocked-project",
      programmeId: "blocked-programme",
      projectFingerprint: "sha256:" + "0".repeat(64),
      programmeFingerprint: "sha256:" + "0".repeat(64),
      orderedVolumeIds: [],
      releaseWaves: [],
      volumes: [],
      findings: validation.blockers
        .slice()
        .sort()
        .map((message: string, index: number) => ({
          findingId: `project:blocked-project:project_contract_invalid_${index + 1}`,
          code: "project_contract_invalid",
          severity: "blocker",
          scope: "project",
          scopeId: "blocked-project",
          message,
          remediation: "Correct the versioned Book project contract before compiling production readiness.",
        })),
    });
  }

  const project = validation.project;
  const programme = await compileBookProjectProgramme(project);
  const projectFindings: BookReadinessFindingV1[] = validation.warnings
    .slice()
    .sort()
    .map((message: string, index: number) => finding({
      project,
      code: `project_contract_warning_${index + 1}`,
      severity: "warning",
      scope: "project",
      scopeId: project.projectId,
      message,
      remediation: "Review the project warning and record an explicit resolution or accepted exception.",
    }));

  if (programme.status !== "ready") {
    for (const message of programme.blockers) {
      projectFindings.push(finding({
        project,
        code: "project_programme_blocked",
        severity: "blocker",
        scope: "project",
        scopeId: project.projectId,
        message,
        remediation: "Resolve project programme blockers before Writing Studio or Art Studio automation.",
      }));
    }
  }

  addProjectFindings(project, projectFindings);

  const volumes: BookVolumeUniversalReadinessV1[] = [];
  for (const volumeId of programme.orderedVolumeIds) {
    const volume = project.volumes.find((candidate: BookVolumeV1) => candidate.volumeId === volumeId);
    const programmeVolume = programme.volumePlans.find((candidate: BookProjectProgrammeV1["volumePlans"][number]) => candidate.volumeId === volumeId);
    if (!volume || !programmeVolume) {
      projectFindings.push(finding({
        project,
        code: "project_programme_volume_missing",
        severity: "blocker",
        scope: "project",
        scopeId: project.projectId,
        message: `Compiled programme is missing normalized volume ${volumeId}.`,
        remediation: "Recompile the project after repairing its volume identities and dependency graph.",
      }));
      continue;
    }
    volumes.push(await compileVolumeReadiness(project, volume, programmeVolume.reviewProfileIds));
  }

  for (const volume of project.volumes) {
    if (!programme.orderedVolumeIds.includes(volume.volumeId)) {
      projectFindings.push(finding({
        project,
        code: "project_programme_order_missing_volume",
        severity: "blocker",
        scope: "project",
        scopeId: project.projectId,
        message: `Volume ${volume.volumeId} is absent from the deterministic release order.`,
        remediation: "Resolve dependency cycles and invalid volume identities before automation.",
      }));
    }
  }

  const allFindings = uniqueFindings([
    ...projectFindings,
    ...volumes.flatMap((volume) => volume.findings),
  ]);

  return sealReadiness({
    status: statusFor(allFindings),
    projectId: project.projectId,
    programmeId: project.programmeId,
    projectFingerprint: validation.projectFingerprint,
    programmeFingerprint: programme.programmeFingerprint,
    orderedVolumeIds: [...programme.orderedVolumeIds],
    releaseWaves: programme.releaseWaves.map((wave: BookProjectProgrammeV1["releaseWaves"][number]) => ({
      wave: wave.wave,
      volumeIds: [...wave.volumeIds],
    })),
    volumes,
    findings: allFindings,
  });
}

async function compileVolumeReadiness(
  project: BookProjectV1,
  volume: BookVolumeV1,
  reviewProfileIds: string[],
): Promise<BookVolumeUniversalReadinessV1> {
  const findings: BookReadinessFindingV1[] = [];
  addVolumeFindings(project, volume, findings);

  const enabledEditions = volume.editionPlans.filter((edition) => edition.enabled);
  const coverCandidateTarget = volume.coverPlan.routeCount * volume.coverPlan.candidatesPerRoute;
  const coverArtRequired =
    project.artPolicy.artStudioEnabled &&
    volume.coverPlan.textFreeGeneratedArtworkRequired;
  const illustrationTarget = volume.illustrationPlan.targetCount;
  const qualityGateIds = unique([
    ...reviewProfileIds,
    "exact_source_coverage",
    "current_version_full_read",
    "independent_review",
    "canonical_compare_and_swap",
    "metadata_and_rights",
    ...(coverArtRequired ? ["manuscript_bound_cover_art", "cover_technical_qa", "cover_named_selection"] : ["cover_design_and_named_selection"]),
    ...(illustrationTarget > 0
      ? ["manuscript_bound_illustration_art", "illustration_technical_qa", "illustration_named_selection"]
      : []),
    ...(enabledEditions.some((edition) => KINDLE_FORMATS.has(edition.format))
      ? ["kindle_previewer_evidence"]
      : []),
    ...(enabledEditions.some((edition) => PRINT_FORMATS.has(edition.format))
      ? ["print_previewer_evidence", "physical_proof_evidence"]
      : []),
  ]).sort();

  const stages = compileAutomationStages({
    volume,
    coverArtRequired,
    illustrationRequired: illustrationTarget > 0,
    previewerRequired:
      project.publicationPolicy.previewerEvidenceRequired ||
      enabledEditions.some((edition) => edition.requiresPreviewerEvidence),
    physicalProofRequired:
      project.publicationPolicy.physicalProofEvidenceRequired ||
      enabledEditions.some((edition) => edition.requiresPhysicalProof),
  });
  const normalizedFindings = uniqueFindings(findings);
  const withoutFingerprint: Omit<BookVolumeUniversalReadinessV1, "readinessFingerprint"> = {
    volumeId: volume.volumeId,
    title: volume.title,
    contentClass: volume.contentClass,
    status: statusFor(normalizedFindings),
    enabledEditionIds: enabledEditions.map((edition) => edition.editionId).sort(),
    enabledEditionFormats: enabledEditions.map((edition) => edition.format).sort(),
    reviewProfileIds: unique(reviewProfileIds).sort(),
    qualityGateIds,
    cover: {
      creativeRouteTarget: volume.coverPlan.routeCount,
      candidatesPerRoute: volume.coverPlan.candidatesPerRoute,
      candidateTarget: coverCandidateTarget,
      manuscriptBoundBriefRequired: true,
      textFreeArtworkRequired: volume.coverPlan.textFreeGeneratedArtworkRequired,
      editableTypographyRequired: volume.coverPlan.editableTypographyRequired,
      seriesIdentityRequired: volume.coverPlan.seriesIdentityRequired,
      immutablePromotionRequired: coverArtRequired,
      exactBookUseBindingRequired: coverArtRequired,
    },
    illustrations: {
      mode: volume.illustrationPlan.mode,
      briefTarget: illustrationTarget,
      candidateTarget: illustrationTarget,
      fullPageTarget: volume.illustrationPlan.fullPageTarget,
      smallOrInlineTarget: volume.illustrationPlan.smallOrInlineTarget,
      textWrapRequired: volume.illustrationPlan.textWrapRequired,
      reflowFallback: volume.illustrationPlan.reflowFallback,
      textFreeArtworkRequired: volume.illustrationPlan.textFreeGeneratedArtworkRequired,
      editableLabelsRequired: volume.illustrationPlan.editableLabelsRequired,
      sourceEvidenceRequired: volume.illustrationPlan.sourceEvidenceRequired,
      immutablePromotionRequired: true,
      exactBookUseBindingRequired: true,
    },
    automationStages: stages,
    blockerIds: normalizedFindings.filter((item) => item.severity === "blocker").map((item) => item.findingId),
    warningIds: normalizedFindings.filter((item) => item.severity === "warning").map((item) => item.findingId),
    findings: normalizedFindings,
  };
  return {
    ...withoutFingerprint,
    readinessFingerprint: await sha256BookText(canonicalBookJson(withoutFingerprint)),
  };
}

function addProjectFindings(project: BookProjectV1, findings: BookReadinessFindingV1[]): void {
  const add = (
    code: string,
    severity: BookReadinessSeverity,
    message: string,
    remediation: string,
  ) => findings.push(finding({
    project,
    code,
    severity,
    scope: "project",
    scopeId: project.projectId,
    message,
    remediation,
  }));

  if (!project.publicationPolicy.metadataVerificationRequired) {
    add(
      "publication_metadata_verification_required",
      "blocker",
      "The project disables publication metadata verification.",
      "Require title, contributor, description, category, keyword, language, edition, identifier, pricing and territorial metadata review before release.",
    );
  }
  if (!project.publicationPolicy.rightsVerificationRequired) {
    add(
      "publication_rights_verification_required",
      "blocker",
      "The project disables rights verification.",
      "Require manuscript, contributor, quotation, image, font, dataset, map and other third-party rights evidence before release.",
    );
  }
  if (!project.publicationPolicy.aiDisclosureDecisionRequired) {
    add(
      "publication_ai_disclosure_decision_required",
      "blocker",
      "The project disables the AI-origin disclosure decision gate.",
      "Record the platform- and edition-specific disclosure decision for writing, images and other generated material.",
    );
  }
  if (!project.publicationPolicy.namedReleaseApprovalRequired) {
    add(
      "named_release_approval_required",
      "blocker",
      "The project permits release without named approval.",
      "Require one named release authority to approve the exact package, identifiers, proofs, rights and disclosure evidence.",
    );
  }
  const titles = new Map<string, string[]>();
  for (const volume of project.volumes) {
    const key = volume.title.normalize("NFKC").toLocaleLowerCase("en-US");
    const current = titles.get(key) ?? [];
    current.push(volume.volumeId);
    titles.set(key, current);
  }
  for (const [title, volumeIds] of titles) {
    if (volumeIds.length > 1) {
      findings.push(finding({
        project,
        code: "duplicate_normalized_volume_title",
        severity: "warning",
        scope: "project",
        scopeId: project.projectId,
        message: `Volumes ${volumeIds.sort().join(", ")} share normalized title ${JSON.stringify(title)}.`,
        remediation: "Confirm that repeated titles are intentional and keep edition metadata and series numbering unambiguous.",
      }));
    }
  }

  const totalCoverCandidates = project.volumes.reduce(
    (total, volume) => total + volume.coverPlan.routeCount * volume.coverPlan.candidatesPerRoute,
    0,
  );
  if (totalCoverCandidates > 2_048) {
    findings.push(finding({
      project,
      code: "project_cover_candidate_volume_excessive",
      severity: "warning",
      scope: "project",
      scopeId: project.projectId,
      message: `The project requests ${totalCoverCandidates} cover candidates, which exceeds the bounded automatic review threshold of 2,048.`,
      remediation: "Split cover exploration into reviewed waves or reduce route and candidate counts before provider execution.",
    }));
  }
}

function addVolumeFindings(
  project: BookProjectV1,
  volume: BookVolumeV1,
  findings: BookReadinessFindingV1[],
): void {
  const add = (
    code: string,
    severity: BookReadinessSeverity,
    message: string,
    remediation: string,
    scope: BookReadinessScope = "volume",
    scopeId: string = volume.volumeId,
  ) => findings.push(finding({ project, code, severity, scope, scopeId, message, remediation }));

  const enabledEditions = volume.editionPlans.filter((edition) => edition.enabled);
  const printEditions = enabledEditions.filter((edition) => PRINT_FORMATS.has(edition.format));
  const kindleEditions = enabledEditions.filter((edition) => KINDLE_FORMATS.has(edition.format));
  const generatedCoverRequired = volume.coverPlan.textFreeGeneratedArtworkRequired;
  const illustrationRequired = volume.illustrationPlan.targetCount > 0;
  const amazonTarget = project.publicationPolicy.targetPlatformIds.some((target) =>
    ["amazon", "amazon-kdp", "kdp", "kindle"].includes(target.toLocaleLowerCase("en-US")),
  );

  if (!enabledEditions.length) {
    add(
      "enabled_edition_required",
      "blocker",
      `Volume ${volume.volumeId} has no enabled edition.`,
      "Enable at least one bounded edition plan before production automation.",
    );
  }
  if (["release_candidate", "published_reference"].includes(volume.status) && !volume.manuscriptVersionId) {
    add(
      "release_state_requires_manuscript_identity",
      "blocker",
      `Volume ${volume.volumeId} is ${volume.status} without an exact manuscript version and SHA-256.`,
      "Bind the release state to one immutable manuscript version and digest.",
    );
  }
  if (!volume.namedApprovalRequired) {
    add(
      "named_volume_approval_required",
      "blocker",
      `Volume ${volume.volumeId} permits production without a named volume approval gate.`,
      "Require a named approval before canonical admission and release handoff.",
    );
  }
  if (volume.language !== project.defaultLanguage) {
    add(
      "volume_language_override_requires_review",
      "warning",
      `Volume ${volume.volumeId} language ${volume.language} differs from project default ${project.defaultLanguage}.`,
      "Add locale-specific editorial, metadata, cover-copy, typography and accessibility review.",
    );
  }

  if (VISUAL_FIRST_CLASSES.has(volume.contentClass) && !illustrationRequired) {
    add(
      "visual_first_book_requires_illustrations",
      "blocker",
      `Content class ${volume.contentClass} requires a non-zero illustration programme.`,
      "Define manuscript-bound illustration briefs and candidate targets.",
    );
  } else if (VISUAL_RECOMMENDED_CLASSES.has(volume.contentClass) && !illustrationRequired) {
    add(
      "content_class_visual_plan_missing",
      "warning",
      `Content class ${volume.contentClass} has no illustration target.`,
      "Confirm that a text-only treatment is intentional or add diagrams, figures, photography, or illustrations with accessibility evidence.",
    );
  }

  if ((generatedCoverRequired || illustrationRequired) && !project.artPolicy.artStudioEnabled) {
    add(
      "art_studio_required_for_art_work",
      "blocker",
      `Volume ${volume.volumeId} requests generated or produced artwork while Art Studio is disabled.`,
      "Enable the protected Art Studio handoff or replace generated-art requirements with approved human or licensed artifacts.",
    );
  }
  if (generatedCoverRequired && !project.artPolicy.generatedArtworkTextFreeRequired) {
    add(
      "cover_text_free_policy_mismatch",
      "blocker",
      `Volume ${volume.volumeId} requests generated cover artwork while the project does not require text-free generated pixels.`,
      "Require text-free generated cover artwork and add title, author, series, spine, ISBN and barcode as editable Docs Suite layers.",
    );
  }
  if (project.artPolicy.editableTypographyRequired && !volume.coverPlan.editableTypographyRequired) {
    add(
      "cover_editable_typography_required",
      "blocker",
      `Volume ${volume.volumeId} cover plan does not require editable typography.`,
      "Require editable title, author, series, spine, back-cover, ISBN and barcode layers in Docs Suite.",
    );
  }
  if (!volume.coverPlan.manuscriptEvidenceRequired) {
    add(
      "cover_manuscript_evidence_required",
      "blocker",
      `Volume ${volume.volumeId} cover concepts are not bound to manuscript evidence.`,
      "Require exact manuscript, extracted-text, visual-canon and art-direction fingerprints for every cover brief.",
    );
  }
  if (SERIES_PROJECT_KINDS.has(project.projectKind) && !volume.coverPlan.seriesIdentityRequired) {
    add(
      "series_cover_identity_required",
      "blocker",
      `Volume ${volume.volumeId} is in a ${project.projectKind} project without required series cover identity.`,
      "Require a consistent series system while preserving volume-specific concept and manuscript evidence.",
    );
  } else if (SERIES_RECOMMENDED_PROJECT_KINDS.has(project.projectKind) && !volume.coverPlan.seriesIdentityRequired) {
    add(
      "collection_cover_identity_review",
      "warning",
      `Volume ${volume.volumeId} has no shared cover identity in a ${project.projectKind} project.`,
      "Confirm whether a shared visual system is intentionally omitted.",
    );
  }
  if (volume.coverPlan.candidatesPerRoute < 2) {
    add(
      "cover_route_comparison_insufficient",
      "warning",
      `Volume ${volume.volumeId} requests only one candidate per cover route.`,
      "Use at least two materially distinct candidates per route before named selection.",
    );
  }

  if (illustrationRequired && project.artPolicy.generatedArtworkTextFreeRequired && !volume.illustrationPlan.textFreeGeneratedArtworkRequired) {
    add(
      "illustration_text_free_policy_mismatch",
      "blocker",
      `Volume ${volume.volumeId} illustration plan conflicts with the project text-free generated artwork policy.`,
      "Keep generated illustration pixels text-free and add labels or captions as editable Docs Suite content.",
    );
  }
  if (illustrationRequired && project.artPolicy.sourceAndModelProvenanceRequired && !volume.illustrationPlan.sourceEvidenceRequired) {
    add(
      "illustration_source_evidence_required",
      "blocker",
      `Volume ${volume.volumeId} illustration plan omits required source evidence.`,
      "Require source, rights, model, prompt-digest and manuscript-binding evidence for every illustration candidate.",
    );
  }
  if (
    illustrationRequired &&
    SOURCE_CRITICAL_CLASSES.has(volume.contentClass) &&
    !volume.illustrationPlan.sourceEvidenceRequired
  ) {
    add(
      "source_critical_visual_evidence_required",
      "blocker",
      `Content class ${volume.contentClass} requires evidence-backed figures or illustrations.`,
      "Bind each visual to authoritative sources and factual review evidence.",
    );
  }
  if (volume.illustrationPlan.editableLabelsRequired && !volume.illustrationPlan.textFreeGeneratedArtworkRequired) {
    add(
      "editable_labels_require_text_free_art",
      "blocker",
      `Volume ${volume.volumeId} requires editable labels but permits generated text inside artwork.`,
      "Generate the visual without text and place all labels in editable, accessible Docs Suite layers.",
    );
  }
  if (
    illustrationRequired &&
    volume.illustrationPlan.reflowFallback === "fixed_layout_only" &&
    kindleEditions.some((edition) => edition.format === "kindle_reflowable")
  ) {
    add(
      "reflowable_edition_conflicts_with_fixed_layout_art",
      "blocker",
      `Volume ${volume.volumeId} enables Kindle reflowable output while illustration fallback is fixed-layout-only.`,
      "Provide an accessible reflow fallback or disable the incompatible edition.",
    );
  }
  if (
    illustrationRequired &&
    volume.illustrationPlan.textWrapRequired &&
    volume.illustrationPlan.reflowFallback === "not_applicable" &&
    kindleEditions.some((edition) => edition.format === "kindle_reflowable")
  ) {
    add(
      "reflow_accessibility_fallback_missing",
      "warning",
      `Volume ${volume.volumeId} wraps reflowable text around illustrations without an explicit fallback.`,
      "Use a captioned block or separate accessible figure fallback for reflowable editions.",
    );
  }

  if (printEditions.length) {
    if (!project.publicationPolicy.isbnEvidenceRequired) {
      add(
        "print_isbn_evidence_required",
        "blocker",
        `Volume ${volume.volumeId} has print editions without an ISBN evidence gate.`,
        "Require an ISBN allocation or an explicit platform-issued identifier receipt.",
      );
    }
    if (!project.publicationPolicy.barcodeEvidenceRequired) {
      add(
        "print_barcode_evidence_required",
        "blocker",
        `Volume ${volume.volumeId} has print editions without a barcode evidence gate.`,
        "Require exact barcode content, placement, quiet-zone and scan evidence.",
      );
    }
  }

  for (const edition of enabledEditions) {
    const editionScope = `${volume.volumeId}:${edition.editionId}`;
    const editionFinding = (
      code: string,
      severity: BookReadinessSeverity,
      message: string,
      remediation: string,
    ) => add(code, severity, message, remediation, "edition", editionScope);

    if (!edition.outputFileRoleIds.length) {
      editionFinding(
        "edition_output_roles_required",
        "blocker",
        `Edition ${edition.editionId} has no required output file roles.`,
        "Define the exact interior, cover, audio, metadata, or package outputs expected for the edition.",
      );
    }
    const roleIds = edition.outputFileRoleIds.map((value) => value.toLocaleLowerCase("en-US"));
    if (edition.format === "audiobook") {
      if (!roleIds.some((value) => value.includes("audio") || value.includes("narration"))) {
        editionFinding(
          "audiobook_output_role_review",
          "warning",
          `Audiobook edition ${edition.editionId} has no clearly identified audio or narration output role.`,
          "Name at least one output role for the mastered audio or narration package.",
        );
      }
      if (edition.trimWidthInches !== undefined || edition.trimHeightInches !== undefined) {
        editionFinding(
          "audiobook_trim_dimensions_forbidden",
          "blocker",
          `Audiobook edition ${edition.editionId} contains print trim dimensions.`,
          "Remove print geometry from the audiobook edition and keep cover-square requirements in the artwork/output contract.",
        );
      }
    } else if (edition.colourMode === "audio") {
      editionFinding(
        "non_audio_edition_uses_audio_colour_mode",
        "blocker",
        `Edition ${edition.editionId} is not an audiobook but uses audio colour mode.`,
        "Choose a print or digital colour intent appropriate to the edition.",
      );
    }

    if (edition.format !== "audiobook") {
      if (!roleIds.some((value) => value.includes("cover"))) {
        editionFinding(
          "edition_cover_output_role_review",
          "warning",
          `Edition ${edition.editionId} has no clearly identified cover output role.`,
          "Name an exact cover output role so package completeness can be checked deterministically.",
        );
      }
      if (!roleIds.some((value) => value.includes("interior") || value.includes("content") || value.includes("book"))) {
        editionFinding(
          "edition_interior_output_role_review",
          "warning",
          `Edition ${edition.editionId} has no clearly identified interior or content output role.`,
          "Name an exact interior/content output role so package completeness can be checked deterministically.",
        );
      }
    }

    if (PRINT_FORMATS.has(edition.format)) {
      if (["digital_rgb", "audio"].includes(edition.colourMode)) {
        editionFinding(
          "print_colour_mode_invalid",
          "blocker",
          `Print edition ${edition.editionId} uses ${edition.colourMode} colour mode.`,
          "Use black_and_white, standard_colour, premium_colour, or an explicitly reviewed custom print colour mode.",
        );
      }
      if (edition.trimWidthInches === undefined || edition.trimHeightInches === undefined) {
        editionFinding(
          "print_trim_dimensions_required",
          "blocker",
          `Print edition ${edition.editionId} has no exact trim dimensions.`,
          "Record exact trim width and height before cover geometry, interior pagination, and proofing.",
        );
      }
      if (amazonTarget && !edition.requiresExternalTemplate) {
        editionFinding(
          "kdp_print_template_required",
          "blocker",
          `Amazon/KDP print edition ${edition.editionId} does not require the current external cover template.`,
          "Require the current KDP template after final page count and paper choice are known.",
        );
      }
      if ((amazonTarget || project.publicationPolicy.previewerEvidenceRequired) && !edition.requiresPreviewerEvidence) {
        editionFinding(
          "print_previewer_evidence_required",
          "blocker",
          `Print edition ${edition.editionId} does not require Previewer evidence.`,
          "Require current rendered-file Previewer evidence before named release approval.",
        );
      }
      if (project.publicationPolicy.physicalProofEvidenceRequired && !edition.requiresPhysicalProof) {
        editionFinding(
          "physical_proof_evidence_required",
          "blocker",
          `Print edition ${edition.editionId} does not require a physical proof.`,
          "Require a current physical-proof review before release handoff.",
        );
      }
    }

    if (KINDLE_FORMATS.has(edition.format) && !edition.requiresPreviewerEvidence) {
      editionFinding(
        "kindle_previewer_evidence_required",
        "blocker",
        `Kindle edition ${edition.editionId} does not require Kindle Previewer evidence.`,
        "Require a current Kindle Previewer result for navigation, layout, typography, images, accessibility, and device behavior.",
      );
    }
  }
}

function compileAutomationStages(input: {
  volume: BookVolumeV1;
  coverArtRequired: boolean;
  illustrationRequired: boolean;
  previewerRequired: boolean;
  physicalProofRequired: boolean;
}): BookAutomationStageV1[] {
  const volumeId = input.volume.volumeId;
  const stages: BookAutomationStageV1[] = [];
  const stage = (
    kind: BookAutomationStageKind,
    owner: BookAutomationOwner,
    automaticExecutionAllowed: boolean,
    dependsOnStageIds: string[],
    gateIds: string[],
  ): string => {
    const stageId = `${volumeId}:${kind}`;
    stages.push({
      stageId,
      volumeId,
      kind,
      owner,
      required: true,
      automaticExecutionAllowed,
      dependsOnStageIds: [...dependsOnStageIds].sort(),
      gateIds: unique(gateIds).sort(),
    });
    return stageId;
  };

  const source = stage("source_coverage", "docs_suite", true, [], [
    "exact_source_coverage",
    "current_version_full_read",
  ]);
  const writing = stage("writing_candidate", "writing_studio", true, [source], [
    "project_owned_voice_evidence",
    "fact_and_source_integrity",
    "strict_response_identity",
  ]);
  const review = stage("editorial_review", "docs_suite", true, [writing], [
    "developmental_review",
    "line_edit",
    "anti_genericity",
    "copyedit",
    "proofread",
    "independent_review",
  ]);
  const canonical = stage("canonical_admission", "docs_suite", false, [review], [
    "phrase_overlap",
    "continuity",
    "factual_integrity",
    "named_canonical_approval",
    "compare_and_swap",
  ]);

  const bindingStages: string[] = [];
  const coverBrief = stage("cover_brief", "docs_suite", true, [canonical], [
    "manuscript_bound_cover_direction",
    "editable_typography",
    "title_author_series_spine_and_back_cover_hierarchy",
  ]);
  if (input.coverArtRequired) {
    const coverCandidate = stage("cover_candidate", "art_studio", true, [coverBrief], [
      "one_candidate_attempt",
      "text_free_generated_artwork",
      "source_and_model_provenance",
      "commercial_rights_evidence",
    ]);
    const coverQuality = stage("cover_quality", "art_studio", true, [coverCandidate], [
      "technical_raster_qa",
      "print_reproduction_qa",
      "generated_text_rejection",
    ]);
    const coverSelection = stage("cover_selection", "human_or_external", false, [coverQuality], [
      "material_route_comparison",
      "manuscript_fidelity",
      "series_and_market_fit",
      "named_selection",
    ]);
    const coverPromotion = stage("cover_promotion", "art_studio", false, [coverSelection], [
      "immutable_promotion_receipt",
    ]);
    bindingStages.push(stage("cover_binding", "docs_suite", false, [coverPromotion], [
      "exact_book_artwork_use_binding",
      "renderer_byte_verification",
    ]));
  } else {
    bindingStages.push(stage("cover_selection", "human_or_external", false, [coverBrief], [
      "typography_only_or_approved_external_art_route",
      "manuscript_fidelity",
      "market_and_audience_fit",
      "named_selection",
    ]));
  }

  if (input.illustrationRequired) {
    const illustrationBrief = stage("illustration_brief", "docs_suite", true, [canonical], [
      "manuscript_bound_art_direction",
      "spoiler_and_continuity_constraints",
      "editable_caption_and_label_layers",
    ]);
    const illustrationCandidate = stage("illustration_candidate", "art_studio", true, [illustrationBrief], [
      "one_candidate_attempt",
      "source_and_model_provenance",
      "commercial_rights_evidence",
    ]);
    const illustrationQuality = stage("illustration_quality", "art_studio", true, [illustrationCandidate], [
      "technical_raster_qa",
      "anatomy_perspective_and_material_review",
      "pseudo_text_rejection",
    ]);
    const illustrationSelection = stage("illustration_selection", "human_or_external", false, [illustrationQuality], [
      "page_context_review",
      "manuscript_fidelity",
      "named_selection",
    ]);
    const illustrationPromotion = stage("illustration_promotion", "art_studio", false, [illustrationSelection], [
      "immutable_promotion_receipt",
    ]);
    bindingStages.push(stage("illustration_binding", "docs_suite", false, [illustrationPromotion], [
      "exact_book_artwork_use_binding",
      "renderer_byte_verification",
      "caption_alt_text_and_accessibility",
    ]));
  }

  const editionDesign = stage("edition_design", "docs_suite", true, [canonical, ...bindingStages], [
    "editable_typography",
    "edition_geometry",
    "illustration_placement",
    "isbn_and_barcode_regions",
  ]);
  const render = stage("render_and_accessibility", "docs_suite", true, [editionDesign], [
    "rendered_file_inspection",
    "navigation_and_semantics",
    "alt_text_and_reading_order",
    "effective_image_resolution",
  ]);
  const metadata = stage("metadata_rights_and_identifiers", "docs_suite", true, [render], [
    "metadata_verification",
    "rights_verification",
    "ai_disclosure_decision",
    "isbn_and_barcode_evidence",
  ]);

  const finalDependencies = [metadata];
  if (input.previewerRequired) {
    finalDependencies.push(stage("external_previewer", "human_or_external", false, [render], [
      "current_previewer_result",
    ]));
  }
  if (input.physicalProofRequired) {
    finalDependencies.push(stage("physical_proof", "human_or_external", false, [render], [
      "current_physical_proof_review",
    ]));
  }
  stage("release_approval", "human_or_external", false, finalDependencies, [
    "named_release_approval",
    "manual_submission_handoff",
  ]);

  return stages.sort((left, right) => left.stageId.localeCompare(right.stageId));
}

function finding(input: {
  project: BookProjectV1;
  code: string;
  severity: BookReadinessSeverity;
  scope: BookReadinessScope;
  scopeId: string;
  message: string;
  remediation: string;
}): BookReadinessFindingV1 {
  return {
    findingId: `${input.scope}:${input.scopeId}:${input.code}`,
    code: input.code,
    severity: input.severity,
    scope: input.scope,
    scopeId: input.scopeId,
    message: input.message,
    remediation: input.remediation,
  };
}

function uniqueFindings(findings: BookReadinessFindingV1[]): BookReadinessFindingV1[] {
  const byId = new Map<string, BookReadinessFindingV1>();
  for (const item of findings) {
    const current = byId.get(item.findingId);
    if (!current || (current.severity === "warning" && item.severity === "blocker")) {
      byId.set(item.findingId, item);
    }
  }
  return [...byId.values()].sort((left, right) => left.findingId.localeCompare(right.findingId));
}

function statusFor(findings: BookReadinessFindingV1[]): BookUniversalReadinessStatus {
  if (findings.some((item) => item.severity === "blocker")) return "blocked";
  if (findings.some((item) => item.severity === "warning")) return "needs_work";
  return "ready_for_automation";
}

async function sealReadiness(input: {
  status: BookUniversalReadinessStatus;
  projectId: string;
  programmeId: string;
  projectFingerprint: string;
  programmeFingerprint: string;
  orderedVolumeIds: string[];
  releaseWaves: Array<{ wave: number; volumeIds: string[] }>;
  volumes: BookVolumeUniversalReadinessV1[];
  findings: BookReadinessFindingV1[];
}): Promise<BookUniversalReadinessResultV1> {
  const findings = uniqueFindings(input.findings);
  const volumes = [...input.volumes].sort((left, right) => left.volumeId.localeCompare(right.volumeId));
  const stages = volumes.flatMap((volume) => volume.automationStages);
  const withoutFingerprint: Omit<BookUniversalReadinessResultV1, "resultFingerprint"> = {
    outputKind: "evavo_docs_book_universal_readiness",
    schemaVersion: 1,
    contract: BOOK_UNIVERSAL_READINESS_CONTRACT,
    status: statusFor(findings),
    projectId: input.projectId,
    programmeId: input.programmeId,
    projectFingerprint: input.projectFingerprint,
    programmeFingerprint: input.programmeFingerprint,
    supportedContentClasses: [...SUPPORTED_BOOK_CONTENT_CLASSES],
    orderedVolumeIds: [...input.orderedVolumeIds],
    releaseWaves: input.releaseWaves.map((wave) => ({ wave: wave.wave, volumeIds: [...wave.volumeIds] })),
    volumes,
    totals: {
      volumeCount: volumes.length,
      enabledEditionCount: volumes.reduce((total, volume) => total + volume.enabledEditionIds.length, 0),
      coverBriefTarget: volumes.reduce(
        (total, volume) => total + volume.cover.creativeRouteTarget,
        0,
      ),
      coverCandidateTarget: volumes.reduce(
        (total, volume) => total + volume.cover.candidateTarget,
        0,
      ),
      illustrationBriefTarget: volumes.reduce((total, volume) => total + volume.illustrations.briefTarget, 0),
      artworkUseBindingTarget: volumes.reduce(
        (total, volume) =>
          total +
          (volume.automationStages.some((stage) => stage.kind === "cover_binding") ? 1 : 0) +
          volume.illustrations.briefTarget,
        0,
      ),
      automationStageCount: stages.length,
      externalOrHumanGateCount: stages.filter((stage) => stage.owner === "human_or_external").length,
    },
    blockerIds: findings.filter((item) => item.severity === "blocker").map((item) => item.findingId),
    warningIds: findings.filter((item) => item.severity === "warning").map((item) => item.findingId),
    findings,
    planningOnly: true,
    oneBoundedStagePerAutomationCallRequired: true,
    providerCallPerformed: false,
    runtimeJobSubmitted: false,
    artifactBytesWritten: false,
    canonicalAdmissionAllowed: false,
    canonicalManuscriptMutationPerformed: false,
    automaticPublicationAllowed: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
  return {
    ...withoutFingerprint,
    resultFingerprint: await sha256BookText(canonicalBookJson(withoutFingerprint)),
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
