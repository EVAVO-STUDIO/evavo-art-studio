/**
 * Dependency-light Book Studio project, series and programme contracts.
 *
 * These contracts are the first non-visual Book Studio product slice moved
 * from the Website compatibility runtime into EVAVO Docs Suite. They preserve
 * the Website universal project vocabulary while keeping provider execution,
 * canonical manuscript mutation and publication outside this module.
 */

export const BOOK_PROJECT_SCHEMA_VERSION = 1 as const;
export const BOOK_PROJECT_CONTRACT = "evavo_docs_book_project_v1" as const;

export type BookProjectKind =
  | "standalone"
  | "series"
  | "collection"
  | "shared_universe"
  | "mixed_catalogue";

export type BookContentClass =
  | "fiction"
  | "memoir"
  | "nonfiction"
  | "academic"
  | "textbook"
  | "reference"
  | "cookbook"
  | "children"
  | "graphic_novel"
  | "poetry"
  | "anthology"
  | "workbook"
  | "manual"
  | "illustrated"
  | "hybrid"
  | "custom";

export type BookVolumeRole =
  | "primary"
  | "companion"
  | "prequel"
  | "sequel"
  | "interquel"
  | "anthology"
  | "omnibus"
  | "reference"
  | "workbook"
  | "manual"
  | "custom";

export type BookVolumeStatus =
  | "source_only"
  | "outline"
  | "draft"
  | "revision"
  | "release_candidate"
  | "published_reference";

export type BookEditionFormat =
  | "kindle_reflowable"
  | "kindle_fixed_layout"
  | "paperback"
  | "hardcover"
  | "large_print"
  | "audiobook"
  | "web"
  | "custom";

export type BookColourMode =
  | "black_and_white"
  | "standard_colour"
  | "premium_colour"
  | "digital_rgb"
  | "audio"
  | "custom";

export type BookIllustrationMode =
  | "none"
  | "spot"
  | "mixed"
  | "full_page"
  | "technical"
  | "custom";

export type BookIllustrationReflowFallback =
  | "not_applicable"
  | "block_with_caption"
  | "separate_accessible_figure"
  | "fixed_layout_only";

export type BookProviderId = "chatgpt" | "claude" | "other_compatible_model";

export type BookJsonValue =
  | string
  | number
  | boolean
  | null
  | BookJsonValue[]
  | { [key: string]: BookJsonValue };

export interface BookEditionPlanV1 {
  editionId: string;
  format: BookEditionFormat;
  customFormat?: string;
  enabled: boolean;
  colourMode: BookColourMode;
  trimWidthInches?: number;
  trimHeightInches?: number;
  requiresExternalTemplate: boolean;
  requiresPreviewerEvidence: boolean;
  requiresPhysicalProof: boolean;
  outputFileRoleIds: string[];
}

export interface BookIllustrationIntentV1 {
  mode: BookIllustrationMode;
  customMode?: string;
  minimumCount: number;
  targetCount: number;
  maximumCount: number;
  fullPageTarget: number;
  smallOrInlineTarget: number;
  textWrapRequired: boolean;
  reflowFallback: BookIllustrationReflowFallback;
  textFreeGeneratedArtworkRequired: boolean;
  editableLabelsRequired: boolean;
  sourceEvidenceRequired: boolean;
}

export interface BookCoverIntentV1 {
  routeCount: number;
  candidatesPerRoute: number;
  textFreeGeneratedArtworkRequired: boolean;
  editableTypographyRequired: boolean;
  seriesIdentityRequired: boolean;
  manuscriptEvidenceRequired: boolean;
}

export interface BookVolumeV1 {
  volumeId: string;
  title: string;
  sequence: number;
  contentClass: BookContentClass;
  customContentClass?: string;
  role: BookVolumeRole;
  customRole?: string;
  status: BookVolumeStatus;
  language: string;
  targetWords: number;
  minimumWords: number;
  maximumWords: number;
  sourceAuthorityIds: string[];
  manuscriptVersionId?: string;
  manuscriptSha256?: string;
  dependsOnVolumeIds: string[];
  reviewProfileIds: string[];
  editionPlans: BookEditionPlanV1[];
  illustrationPlan: BookIllustrationIntentV1;
  coverPlan: BookCoverIntentV1;
  constraintIds: string[];
  namedApprovalRequired: boolean;
  extensions?: Record<string, BookJsonValue>;
}

export interface BookProviderPolicyV1 {
  providers: BookProviderId[];
  chatgptStrictJsonSchemaRequired: boolean;
  claudeForcedToolRequired: boolean;
  compatibleAdapterSchemaRequired: boolean;
  providerSubstitutionAllowed: boolean;
  exactProfileFingerprintRequired: boolean;
  exactPacketFingerprintRequired: boolean;
  strictResponseIdentityRequired: boolean;
  phraseOverlapBeforeCanonicalAdmission: boolean;
}

export interface BookQualityPolicyV1 {
  exactSourceCoverageRequired: boolean;
  currentVersionFullReadRequired: boolean;
  minimumMaterialAlternatives: number;
  independentReviewRequired: boolean;
  compareAndSwapCanonicalMutationRequired: boolean;
  automaticCanonicalAdmissionAllowed: false;
  antiGenericityReviewRequired: boolean;
  projectOwnedVoiceEvidenceRequired: boolean;
  defaultReviewProfileIds: string[];
}

export interface BookPublicationPolicyV1 {
  targetPlatformIds: string[];
  manualSubmissionOnly: true;
  metadataVerificationRequired: boolean;
  rightsVerificationRequired: boolean;
  aiDisclosureDecisionRequired: boolean;
  isbnEvidenceRequired: boolean;
  barcodeEvidenceRequired: boolean;
  previewerEvidenceRequired: boolean;
  physicalProofEvidenceRequired: boolean;
  namedReleaseApprovalRequired: boolean;
}

export interface BookArtIntentPolicyV1 {
  artStudioEnabled: boolean;
  generatedArtworkTextFreeRequired: boolean;
  editableTypographyRequired: boolean;
  credentialsServerSideOnly: boolean;
  remoteWritesDisabledByDefault: boolean;
  sourceAndModelProvenanceRequired: boolean;
}

export interface BookProjectV1 {
  outputKind: "evavo_docs_book_project";
  schemaVersion: typeof BOOK_PROJECT_SCHEMA_VERSION;
  contract: typeof BOOK_PROJECT_CONTRACT;
  projectId: string;
  programmeId: string;
  projectTitle: string;
  projectKind: BookProjectKind;
  contributorDisplayNames: string[];
  defaultLanguage: string;
  sourceAuthorityIds: string[];
  evidenceIds: string[];
  globalConstraintIds: string[];
  providerPolicy: BookProviderPolicyV1;
  qualityPolicy: BookQualityPolicyV1;
  publicationPolicy: BookPublicationPolicyV1;
  artPolicy: BookArtIntentPolicyV1;
  volumes: BookVolumeV1[];
  extensions?: Record<string, BookJsonValue>;
  canonicalManuscriptMutationPerformed: false;
  publicationPerformed: false;
}

export interface BookReleaseWaveV1 {
  wave: number;
  volumeIds: string[];
}

export interface BookVolumeProgrammeV1 {
  volumeId: string;
  title: string;
  sequence: number;
  contentClass: BookContentClass;
  role: BookVolumeRole;
  dependencyVolumeIds: string[];
  stageIds: string[];
  reviewProfileIds: string[];
  editionIds: string[];
  illustrationTarget: number;
  coverCandidateTarget: number;
  namedApprovalRequired: boolean;
}

export interface BookProjectProgrammeV1 {
  outputKind: "evavo_docs_book_project_programme";
  schemaVersion: 1;
  contract: typeof BOOK_PROJECT_CONTRACT;
  status: "ready" | "blocked";
  project: BookProjectV1;
  projectId: string;
  programmeId: string;
  orderedVolumeIds: string[];
  releaseWaves: BookReleaseWaveV1[];
  volumePlans: BookVolumeProgrammeV1[];
  projectStageIds: string[];
  totalTargetWords: number;
  totalMaximumWords: number;
  totalEditionCount: number;
  totalIllustrationTarget: number;
  totalCoverCandidateTarget: number;
  blockers: string[];
  warnings: string[];
  projectFingerprint: string;
  programmeFingerprint: string;
  canonicalAdmissionAllowed: false;
  canonicalManuscriptMutationPerformed: false;
  publicationPerformed: false;
  websiteCompatibilityRuntimeStillAuthoritative: true;
  runtimeCutoverApproved: false;
}

export interface BookProjectValidationResultV1 {
  outputKind: "evavo_docs_book_project_validation";
  schemaVersion: 1;
  status: "ready" | "blocked";
  project?: BookProjectV1;
  blockers: string[];
  warnings: string[];
  projectFingerprint?: string;
  canonicalAdmissionAllowed: false;
  canonicalManuscriptMutationPerformed: false;
  publicationPerformed: false;
}

const SAFE_ID = /^[a-z][a-z0-9._:-]{1,127}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const LANGUAGE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const PROJECT_KINDS = new Set<BookProjectKind>(["standalone", "series", "collection", "shared_universe", "mixed_catalogue"]);
const CONTENT_CLASSES = new Set<BookContentClass>(["fiction", "memoir", "nonfiction", "academic", "textbook", "reference", "cookbook", "children", "graphic_novel", "poetry", "anthology", "workbook", "manual", "illustrated", "hybrid", "custom"]);
const VOLUME_ROLES = new Set<BookVolumeRole>(["primary", "companion", "prequel", "sequel", "interquel", "anthology", "omnibus", "reference", "workbook", "manual", "custom"]);
const VOLUME_STATUSES = new Set<BookVolumeStatus>(["source_only", "outline", "draft", "revision", "release_candidate", "published_reference"]);
const EDITION_FORMATS = new Set<BookEditionFormat>(["kindle_reflowable", "kindle_fixed_layout", "paperback", "hardcover", "large_print", "audiobook", "web", "custom"]);
const COLOUR_MODES = new Set<BookColourMode>(["black_and_white", "standard_colour", "premium_colour", "digital_rgb", "audio", "custom"]);
const ILLUSTRATION_MODES = new Set<BookIllustrationMode>(["none", "spot", "mixed", "full_page", "technical", "custom"]);
const REFLOW_FALLBACKS = new Set<BookIllustrationReflowFallback>(["not_applicable", "block_with_caption", "separate_accessible_figure", "fixed_layout_only"]);
const PROVIDERS = new Set<BookProviderId>(["chatgpt", "claude", "other_compatible_model"]);
const MAX_VOLUMES = 256;

const PROJECT_STAGE_IDS = [
  "preserve_original_sources",
  "reconcile_source_authority",
  "exact_ingest",
  "no_skipped_text_coverage",
  "build_project_state",
  "resolve_research",
  "compile_architecture",
  "bounded_content_production",
  "current_version_full_review",
  "canonical_compare_and_swap",
  "cross_volume_continuity",
  "visual_development",
  "edition_design",
  "rendered_file_qa",
  "metadata_rights_and_identifiers",
  "external_previewer_and_proof_evidence",
  "release_candidate_package",
  "manual_submission_handoff",
] as const;

const BASE_REVIEW_PROFILES = [
  "source_coverage",
  "developmental_structure",
  "line_edit",
  "anti_genericity",
  "copyedit",
  "proofread",
  "independent_review",
] as const;

const CONTENT_REVIEW_PROFILES: Readonly<Record<BookContentClass, readonly string[]>> = {
  fiction: ["character_psychology", "dialogue_and_voice", "scene_physics", "continuity_and_causality", "research_and_fact_integrity"],
  memoir: ["chronology_and_memory_uncertainty", "ethical_representation_and_privacy", "narrative_voice", "character_and_relationship_truth", "research_and_fact_integrity"],
  nonfiction: ["argument_structure", "source_and_claim_integrity", "factual_accuracy", "reader_accessibility", "examples_and_case_evidence"],
  academic: ["thesis_and_argument", "methodology_and_limitations", "source_and_citation_integrity", "data_and_evidence", "disciplinary_peer_review"],
  textbook: ["learning_objectives_and_scaffolding", "factual_and_source_integrity", "worked_examples_and_exercises", "assessment_and_answer_integrity", "accessibility_and_inclusive_pedagogy"],
  reference: ["information_architecture", "taxonomy_and_cross_reference", "procedure_and_usability", "factual_accuracy", "illustration_integration"],
  cookbook: ["recipe_test_evidence", "measurements_and_yield", "ingredient_and_method_clarity", "food_safety_and_allergen_review", "photography_and_layout_integration"],
  children: ["age_and_reading_level_fit", "emotional_and_content_safety", "page_turn_and_read_aloud_rhythm", "text_image_narrative", "accessibility_and_inclusive_representation"],
  graphic_novel: ["sequential_art_clarity", "panel_and_page_turn_pacing", "dialogue_caption_and_lettering", "visual_character_and_world_continuity", "accessibility_and_print_readability"],
  poetry: ["sequence_architecture", "image_and_rhythm", "voice_consistency", "repetition_intent", "typography_and_page"],
  anthology: ["selection_and_sequence_architecture", "individual_work_integrity", "contributor_and_permissions_integrity", "editorial_consistency_without_voice_flattening", "front_back_matter_and_metadata"],
  workbook: ["instructional_sequence", "exercise_and_prompt_usability", "answer_or_reflection_integrity", "fillable_layout_and_accessibility", "progression_and_completion_logic"],
  manual: ["technical_accuracy", "procedure_and_task_success", "safety_warning_integrity", "navigation_and_cross_reference", "diagram_and_illustration_integration"],
  illustrated: ["audience_fit", "page_turn_and_pacing", "text_image_narrative", "visual_continuity", "accessibility_and_safety"],
  hybrid: ["content_mode_coherence", "argument_or_story_structure", "voice_consistency", "factual_accuracy", "illustration_integration"],
  custom: [],
};

type UnknownRecord = Record<string, unknown>;

export async function validateAndNormalizeBookProject(
  input: unknown,
): Promise<BookProjectValidationResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const source = record(input, "Book project", blockers);
  rejectUnknown(source, new Set([
    "outputKind", "schemaVersion", "contract", "projectId", "programmeId", "projectTitle", "projectKind",
    "contributorDisplayNames", "defaultLanguage", "sourceAuthorityIds", "evidenceIds", "globalConstraintIds",
    "providerPolicy", "qualityPolicy", "publicationPolicy", "artPolicy", "volumes", "extensions",
    "canonicalManuscriptMutationPerformed", "publicationPerformed",
  ]), "Book project", blockers);

  const projectId = readId(source.projectId, "projectId", blockers);
  const programmeId = readId(source.programmeId, "programmeId", blockers);
  const projectTitle = readText(source.projectTitle, "projectTitle", blockers, 500);
  const projectKind = readEnum(source.projectKind, PROJECT_KINDS, "projectKind", blockers, "standalone");
  const contributorDisplayNames = readTextArray(source.contributorDisplayNames, "contributorDisplayNames", blockers, 128, 300, true);
  const defaultLanguage = readText(source.defaultLanguage, "defaultLanguage", blockers, 64);
  if (defaultLanguage && !LANGUAGE.test(defaultLanguage)) blockers.push("defaultLanguage must be a bounded BCP-47-like language tag.");
  const sourceAuthorityIds = readIdArray(source.sourceAuthorityIds, "sourceAuthorityIds", blockers, 2_048, true);
  const evidenceIds = readIdArray(source.evidenceIds, "evidenceIds", blockers, 4_096, false);
  const globalConstraintIds = readIdArray(source.globalConstraintIds, "globalConstraintIds", blockers, 2_048, false);
  const providerPolicy = parseProviderPolicy(source.providerPolicy, blockers);
  const qualityPolicy = parseQualityPolicy(source.qualityPolicy, blockers);
  const publicationPolicy = parsePublicationPolicy(source.publicationPolicy, blockers);
  const artPolicy = parseArtPolicy(source.artPolicy, blockers);
  const rawVolumes = Array.isArray(source.volumes) ? source.volumes : [];
  if (!Array.isArray(source.volumes) || rawVolumes.length < 1 || rawVolumes.length > MAX_VOLUMES) {
    blockers.push(`volumes must contain 1-${MAX_VOLUMES} records.`);
  }
  const volumes = rawVolumes.map((value, index) => parseVolume(value, index, blockers));
  const extensions = parseExtensions(source.extensions, "Book project extensions", blockers);

  const ids = volumes.map((volume) => volume.volumeId);
  const sequences = volumes.map((volume) => volume.sequence);
  addDuplicates(ids, "volume IDs", blockers);
  addDuplicates(sequences.map(String), "volume sequences", blockers);
  const volumeIdSet = new Set(ids);
  for (const volume of volumes) {
    for (const dependencyId of volume.dependsOnVolumeIds) {
      if (!volumeIdSet.has(dependencyId)) blockers.push(`Volume ${volume.volumeId} depends on unknown volume ${dependencyId}.`);
      if (dependencyId === volume.volumeId) blockers.push(`Volume ${volume.volumeId} cannot depend on itself.`);
    }
    for (const authorityId of volume.sourceAuthorityIds) {
      if (!sourceAuthorityIds.includes(authorityId)) blockers.push(`Volume ${volume.volumeId} source authority ${authorityId} is absent from the project authority set.`);
    }
  }
  const cycle = findDependencyCycle(volumes);
  if (cycle.length) blockers.push(`Volume dependency graph contains a cycle: ${cycle.join(" -> ")}.`);
  if (projectKind === "standalone" && volumes.length !== 1) blockers.push("A standalone project must contain exactly one volume.");
  if (projectKind !== "standalone" && volumes.length < 2) warnings.push("A non-standalone project currently contains fewer than two volumes.");

  if (source.outputKind !== undefined && source.outputKind !== "evavo_docs_book_project") blockers.push("Book project outputKind is invalid.");
  if (source.schemaVersion !== undefined && source.schemaVersion !== 1) blockers.push("Book project schemaVersion is invalid.");
  if (source.contract !== undefined && source.contract !== BOOK_PROJECT_CONTRACT) blockers.push("Book project contract is invalid.");
  if (source.canonicalManuscriptMutationPerformed !== undefined && source.canonicalManuscriptMutationPerformed !== false) blockers.push("Project contracts cannot claim canonical manuscript mutation.");
  if (source.publicationPerformed !== undefined && source.publicationPerformed !== false) blockers.push("Project contracts cannot claim publication.");

  const uniqueBlockers = unique(blockers);
  if (uniqueBlockers.length) {
    return {
      outputKind: "evavo_docs_book_project_validation",
      schemaVersion: 1,
      status: "blocked",
      blockers: uniqueBlockers,
      warnings: unique(warnings),
      canonicalAdmissionAllowed: false,
      canonicalManuscriptMutationPerformed: false,
      publicationPerformed: false,
    };
  }

  const project: BookProjectV1 = {
    outputKind: "evavo_docs_book_project",
    schemaVersion: 1,
    contract: BOOK_PROJECT_CONTRACT,
    projectId,
    programmeId,
    projectTitle,
    projectKind,
    contributorDisplayNames,
    defaultLanguage,
    sourceAuthorityIds,
    evidenceIds,
    globalConstraintIds,
    providerPolicy,
    qualityPolicy,
    publicationPolicy,
    artPolicy,
    volumes: [...volumes].sort((a, b) => a.sequence - b.sequence || a.volumeId.localeCompare(b.volumeId)),
    ...(extensions === undefined ? {} : { extensions }),
    canonicalManuscriptMutationPerformed: false,
    publicationPerformed: false,
  };
  const projectFingerprint = await fingerprintBookProject(project);
  return {
    outputKind: "evavo_docs_book_project_validation",
    schemaVersion: 1,
    status: "ready",
    project,
    blockers: [],
    warnings: unique(warnings),
    projectFingerprint,
    canonicalAdmissionAllowed: false,
    canonicalManuscriptMutationPerformed: false,
    publicationPerformed: false,
  };
}

export async function compileBookProjectProgramme(input: unknown): Promise<BookProjectProgrammeV1> {
  const validation = await validateAndNormalizeBookProject(input);
  if (validation.status !== "ready" || !validation.project || !validation.projectFingerprint) {
    const blockedProject = blockedProjectFallback();
    const withoutFingerprint: Omit<BookProjectProgrammeV1, "programmeFingerprint"> = {
      outputKind: "evavo_docs_book_project_programme",
      schemaVersion: 1,
      contract: BOOK_PROJECT_CONTRACT,
      status: "blocked",
      project: blockedProject,
      projectId: blockedProject.projectId,
      programmeId: blockedProject.programmeId,
      orderedVolumeIds: [],
      releaseWaves: [],
      volumePlans: [],
      projectStageIds: [...PROJECT_STAGE_IDS],
      totalTargetWords: 0,
      totalMaximumWords: 0,
      totalEditionCount: 0,
      totalIllustrationTarget: 0,
      totalCoverCandidateTarget: 0,
      blockers: validation.blockers,
      warnings: validation.warnings,
      projectFingerprint: "sha256:" + "0".repeat(64),
      canonicalAdmissionAllowed: false,
      canonicalManuscriptMutationPerformed: false,
      publicationPerformed: false,
      websiteCompatibilityRuntimeStillAuthoritative: true,
      runtimeCutoverApproved: false,
    };
    return { ...withoutFingerprint, programmeFingerprint: await sha256BookText(canonicalBookJson(withoutFingerprint)) };
  }

  const project = validation.project;
  const releaseWaves = compileReleaseWaves(project.volumes);
  const orderedVolumeIds = releaseWaves.flatMap((wave) => wave.volumeIds);
  const volumePlans: BookVolumeProgrammeV1[] = orderedVolumeIds.map((volumeId) => {
    const volume = project.volumes.find((item) => item.volumeId === volumeId);
    if (!volume) throw new Error(`Missing normalized volume ${volumeId}.`);
    return {
      volumeId: volume.volumeId,
      title: volume.title,
      sequence: volume.sequence,
      contentClass: volume.contentClass,
      role: volume.role,
      dependencyVolumeIds: [...volume.dependsOnVolumeIds].sort(),
      stageIds: [...PROJECT_STAGE_IDS],
      reviewProfileIds: unique([...BASE_REVIEW_PROFILES, ...CONTENT_REVIEW_PROFILES[volume.contentClass], ...volume.reviewProfileIds]).sort(),
      editionIds: volume.editionPlans.filter((edition) => edition.enabled).map((edition) => edition.editionId).sort(),
      illustrationTarget: volume.illustrationPlan.targetCount,
      coverCandidateTarget: volume.coverPlan.routeCount * volume.coverPlan.candidatesPerRoute,
      namedApprovalRequired: volume.namedApprovalRequired,
    };
  });
  const withoutFingerprint: Omit<BookProjectProgrammeV1, "programmeFingerprint"> = {
    outputKind: "evavo_docs_book_project_programme",
    schemaVersion: 1,
    contract: BOOK_PROJECT_CONTRACT,
    status: "ready",
    project,
    projectId: project.projectId,
    programmeId: project.programmeId,
    orderedVolumeIds,
    releaseWaves,
    volumePlans,
    projectStageIds: [...PROJECT_STAGE_IDS],
    totalTargetWords: sum(project.volumes.map((volume) => volume.targetWords)),
    totalMaximumWords: sum(project.volumes.map((volume) => volume.maximumWords)),
    totalEditionCount: sum(project.volumes.map((volume) => volume.editionPlans.filter((edition) => edition.enabled).length)),
    totalIllustrationTarget: sum(project.volumes.map((volume) => volume.illustrationPlan.targetCount)),
    totalCoverCandidateTarget: sum(project.volumes.map((volume) => volume.coverPlan.routeCount * volume.coverPlan.candidatesPerRoute)),
    blockers: [],
    warnings: validation.warnings,
    projectFingerprint: validation.projectFingerprint,
    canonicalAdmissionAllowed: false,
    canonicalManuscriptMutationPerformed: false,
    publicationPerformed: false,
    websiteCompatibilityRuntimeStillAuthoritative: true,
    runtimeCutoverApproved: false,
  };
  return { ...withoutFingerprint, programmeFingerprint: await sha256BookText(canonicalBookJson(withoutFingerprint)) };
}

export async function fingerprintBookProject(project: BookProjectV1): Promise<string> {
  return sha256BookText(canonicalBookJson(project));
}

export function canonicalBookJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

export async function sha256BookText(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function parseVolume(value: unknown, index: number, blockers: string[]): BookVolumeV1 {
  const source = record(value, `Volume ${index + 1}`, blockers);
  rejectUnknown(source, new Set([
    "volumeId", "title", "sequence", "contentClass", "customContentClass", "role", "customRole", "status", "language",
    "targetWords", "minimumWords", "maximumWords", "sourceAuthorityIds", "manuscriptVersionId", "manuscriptSha256",
    "dependsOnVolumeIds", "reviewProfileIds", "editionPlans", "illustrationPlan", "coverPlan", "constraintIds",
    "namedApprovalRequired", "extensions",
  ]), `Volume ${index + 1}`, blockers);
  const volumeId = readId(source.volumeId, `Volume ${index + 1} volumeId`, blockers);
  const contentClass = readEnum(source.contentClass, CONTENT_CLASSES, `Volume ${volumeId || index + 1} contentClass`, blockers, "custom");
  const role = readEnum(source.role, VOLUME_ROLES, `Volume ${volumeId || index + 1} role`, blockers, "custom");
  const status = readEnum(source.status, VOLUME_STATUSES, `Volume ${volumeId || index + 1} status`, blockers, "source_only");
  const customContentClass = readOptionalText(source.customContentClass, `Volume ${volumeId || index + 1} customContentClass`, blockers, 300);
  const customRole = readOptionalText(source.customRole, `Volume ${volumeId || index + 1} customRole`, blockers, 300);
  if (contentClass === "custom" && !customContentClass) blockers.push(`Volume ${volumeId || index + 1} requires customContentClass.`);
  if (role === "custom" && !customRole) blockers.push(`Volume ${volumeId || index + 1} requires customRole.`);
  const targetWords = readInteger(source.targetWords, `Volume ${volumeId || index + 1} targetWords`, blockers, 1, 500_000);
  const minimumWords = readInteger(source.minimumWords, `Volume ${volumeId || index + 1} minimumWords`, blockers, 1, 500_000);
  const maximumWords = readInteger(source.maximumWords, `Volume ${volumeId || index + 1} maximumWords`, blockers, 1, 500_000);
  if (!(minimumWords <= targetWords && targetWords <= maximumWords)) blockers.push(`Volume ${volumeId || index + 1} word range must satisfy minimum <= target <= maximum.`);
  const language = readText(source.language, `Volume ${volumeId || index + 1} language`, blockers, 64);
  if (language && !LANGUAGE.test(language)) blockers.push(`Volume ${volumeId || index + 1} language must be a bounded BCP-47-like tag.`);
  const manuscriptVersionId = readOptionalId(source.manuscriptVersionId, `Volume ${volumeId || index + 1} manuscriptVersionId`, blockers);
  const manuscriptSha256 = readOptionalSha(source.manuscriptSha256, `Volume ${volumeId || index + 1} manuscriptSha256`, blockers);
  if ((manuscriptVersionId === undefined) !== (manuscriptSha256 === undefined)) blockers.push(`Volume ${volumeId || index + 1} must provide both manuscriptVersionId and manuscriptSha256, or neither.`);
  const rawEditions = Array.isArray(source.editionPlans) ? source.editionPlans : [];
  if (!Array.isArray(source.editionPlans) || rawEditions.length > 64) blockers.push(`Volume ${volumeId || index + 1} editionPlans must contain at most 64 records.`);
  const editionPlans = rawEditions.map((item, editionIndex) => parseEdition(item, volumeId || String(index + 1), editionIndex, blockers));
  addDuplicates(editionPlans.map((edition) => edition.editionId), `Volume ${volumeId || index + 1} edition IDs`, blockers);
  const illustrationPlan = parseIllustration(source.illustrationPlan, volumeId || String(index + 1), blockers);
  const coverPlan = parseCover(source.coverPlan, volumeId || String(index + 1), blockers);
  const extensions = parseExtensions(source.extensions, `Volume ${volumeId || index + 1} extensions`, blockers);
  return {
    volumeId,
    title: readText(source.title, `Volume ${volumeId || index + 1} title`, blockers, 500),
    sequence: readInteger(source.sequence, `Volume ${volumeId || index + 1} sequence`, blockers, 1, MAX_VOLUMES),
    contentClass,
    ...(customContentClass === undefined ? {} : { customContentClass }),
    role,
    ...(customRole === undefined ? {} : { customRole }),
    status,
    language,
    targetWords,
    minimumWords,
    maximumWords,
    sourceAuthorityIds: readIdArray(source.sourceAuthorityIds, `Volume ${volumeId || index + 1} sourceAuthorityIds`, blockers, 2_048, true),
    ...(manuscriptVersionId === undefined ? {} : { manuscriptVersionId }),
    ...(manuscriptSha256 === undefined ? {} : { manuscriptSha256 }),
    dependsOnVolumeIds: readIdArray(source.dependsOnVolumeIds, `Volume ${volumeId || index + 1} dependsOnVolumeIds`, blockers, MAX_VOLUMES, false).sort(),
    reviewProfileIds: readIdArray(source.reviewProfileIds, `Volume ${volumeId || index + 1} reviewProfileIds`, blockers, 512, false).sort(),
    editionPlans: [...editionPlans].sort((a, b) => a.editionId.localeCompare(b.editionId)),
    illustrationPlan,
    coverPlan,
    constraintIds: readIdArray(source.constraintIds, `Volume ${volumeId || index + 1} constraintIds`, blockers, 2_048, false).sort(),
    namedApprovalRequired: readBoolean(source.namedApprovalRequired, `Volume ${volumeId || index + 1} namedApprovalRequired`, blockers),
    ...(extensions === undefined ? {} : { extensions }),
  };
}

function parseEdition(value: unknown, volumeId: string, index: number, blockers: string[]): BookEditionPlanV1 {
  const source = record(value, `Volume ${volumeId} edition ${index + 1}`, blockers);
  rejectUnknown(source, new Set(["editionId", "format", "customFormat", "enabled", "colourMode", "trimWidthInches", "trimHeightInches", "requiresExternalTemplate", "requiresPreviewerEvidence", "requiresPhysicalProof", "outputFileRoleIds"]), `Volume ${volumeId} edition ${index + 1}`, blockers);
  const format = readEnum(source.format, EDITION_FORMATS, `Volume ${volumeId} edition ${index + 1} format`, blockers, "custom");
  const customFormat = readOptionalText(source.customFormat, `Volume ${volumeId} edition ${index + 1} customFormat`, blockers, 300);
  if (format === "custom" && !customFormat) blockers.push(`Volume ${volumeId} edition ${index + 1} requires customFormat.`);
  const trimWidthInches = readOptionalNumber(source.trimWidthInches, `Volume ${volumeId} edition ${index + 1} trimWidthInches`, blockers, 1, 30);
  const trimHeightInches = readOptionalNumber(source.trimHeightInches, `Volume ${volumeId} edition ${index + 1} trimHeightInches`, blockers, 1, 30);
  if ((trimWidthInches === undefined) !== (trimHeightInches === undefined)) blockers.push(`Volume ${volumeId} edition ${index + 1} must supply both trim dimensions or neither.`);
  const colourMode = readEnum(source.colourMode, COLOUR_MODES, `Volume ${volumeId} edition ${index + 1} colourMode`, blockers, "custom");
  if (format === "audiobook" && colourMode !== "audio") blockers.push(`Volume ${volumeId} audiobook edition must use audio colourMode.`);
  return {
    editionId: readId(source.editionId, `Volume ${volumeId} edition ${index + 1} editionId`, blockers),
    format,
    ...(customFormat === undefined ? {} : { customFormat }),
    enabled: readBoolean(source.enabled, `Volume ${volumeId} edition ${index + 1} enabled`, blockers),
    colourMode,
    ...(trimWidthInches === undefined ? {} : { trimWidthInches }),
    ...(trimHeightInches === undefined ? {} : { trimHeightInches }),
    requiresExternalTemplate: readBoolean(source.requiresExternalTemplate, `Volume ${volumeId} edition ${index + 1} requiresExternalTemplate`, blockers),
    requiresPreviewerEvidence: readBoolean(source.requiresPreviewerEvidence, `Volume ${volumeId} edition ${index + 1} requiresPreviewerEvidence`, blockers),
    requiresPhysicalProof: readBoolean(source.requiresPhysicalProof, `Volume ${volumeId} edition ${index + 1} requiresPhysicalProof`, blockers),
    outputFileRoleIds: readIdArray(source.outputFileRoleIds, `Volume ${volumeId} edition ${index + 1} outputFileRoleIds`, blockers, 128, false).sort(),
  };
}

function parseIllustration(value: unknown, volumeId: string, blockers: string[]): BookIllustrationIntentV1 {
  const source = record(value, `Volume ${volumeId} illustrationPlan`, blockers);
  rejectUnknown(source, new Set(["mode", "customMode", "minimumCount", "targetCount", "maximumCount", "fullPageTarget", "smallOrInlineTarget", "textWrapRequired", "reflowFallback", "textFreeGeneratedArtworkRequired", "editableLabelsRequired", "sourceEvidenceRequired"]), `Volume ${volumeId} illustrationPlan`, blockers);
  const mode = readEnum(source.mode, ILLUSTRATION_MODES, `Volume ${volumeId} illustration mode`, blockers, "custom");
  const customMode = readOptionalText(source.customMode, `Volume ${volumeId} custom illustration mode`, blockers, 300);
  if (mode === "custom" && !customMode) blockers.push(`Volume ${volumeId} requires customMode.`);
  const minimumCount = readInteger(source.minimumCount, `Volume ${volumeId} illustration minimumCount`, blockers, 0, 10_000);
  const targetCount = readInteger(source.targetCount, `Volume ${volumeId} illustration targetCount`, blockers, 0, 10_000);
  const maximumCount = readInteger(source.maximumCount, `Volume ${volumeId} illustration maximumCount`, blockers, 0, 10_000);
  const fullPageTarget = readInteger(source.fullPageTarget, `Volume ${volumeId} illustration fullPageTarget`, blockers, 0, 10_000);
  const smallOrInlineTarget = readInteger(source.smallOrInlineTarget, `Volume ${volumeId} illustration smallOrInlineTarget`, blockers, 0, 10_000);
  if (!(minimumCount <= targetCount && targetCount <= maximumCount)) blockers.push(`Volume ${volumeId} illustration counts must satisfy minimum <= target <= maximum.`);
  if (fullPageTarget + smallOrInlineTarget > maximumCount) blockers.push(`Volume ${volumeId} illustration sub-targets exceed maximumCount.`);
  if (mode === "none" && maximumCount !== 0) blockers.push(`Volume ${volumeId} illustration mode none requires zero counts.`);
  return {
    mode,
    ...(customMode === undefined ? {} : { customMode }),
    minimumCount,
    targetCount,
    maximumCount,
    fullPageTarget,
    smallOrInlineTarget,
    textWrapRequired: readBoolean(source.textWrapRequired, `Volume ${volumeId} illustration textWrapRequired`, blockers),
    reflowFallback: readEnum(source.reflowFallback, REFLOW_FALLBACKS, `Volume ${volumeId} reflowFallback`, blockers, "not_applicable"),
    textFreeGeneratedArtworkRequired: readBoolean(source.textFreeGeneratedArtworkRequired, `Volume ${volumeId} textFreeGeneratedArtworkRequired`, blockers),
    editableLabelsRequired: readBoolean(source.editableLabelsRequired, `Volume ${volumeId} editableLabelsRequired`, blockers),
    sourceEvidenceRequired: readBoolean(source.sourceEvidenceRequired, `Volume ${volumeId} sourceEvidenceRequired`, blockers),
  };
}

function parseCover(value: unknown, volumeId: string, blockers: string[]): BookCoverIntentV1 {
  const source = record(value, `Volume ${volumeId} coverPlan`, blockers);
  rejectUnknown(source, new Set(["routeCount", "candidatesPerRoute", "textFreeGeneratedArtworkRequired", "editableTypographyRequired", "seriesIdentityRequired", "manuscriptEvidenceRequired"]), `Volume ${volumeId} coverPlan`, blockers);
  return {
    routeCount: readInteger(source.routeCount, `Volume ${volumeId} cover routeCount`, blockers, 3, 8),
    candidatesPerRoute: readInteger(source.candidatesPerRoute, `Volume ${volumeId} cover candidatesPerRoute`, blockers, 1, 16),
    textFreeGeneratedArtworkRequired: readBoolean(source.textFreeGeneratedArtworkRequired, `Volume ${volumeId} cover textFreeGeneratedArtworkRequired`, blockers),
    editableTypographyRequired: readBoolean(source.editableTypographyRequired, `Volume ${volumeId} cover editableTypographyRequired`, blockers),
    seriesIdentityRequired: readBoolean(source.seriesIdentityRequired, `Volume ${volumeId} cover seriesIdentityRequired`, blockers),
    manuscriptEvidenceRequired: readBoolean(source.manuscriptEvidenceRequired, `Volume ${volumeId} cover manuscriptEvidenceRequired`, blockers),
  };
}

function parseProviderPolicy(value: unknown, blockers: string[]): BookProviderPolicyV1 {
  const source = record(value, "providerPolicy", blockers);
  rejectUnknown(source, new Set(["providers", "chatgptStrictJsonSchemaRequired", "claudeForcedToolRequired", "compatibleAdapterSchemaRequired", "providerSubstitutionAllowed", "exactProfileFingerprintRequired", "exactPacketFingerprintRequired", "strictResponseIdentityRequired", "phraseOverlapBeforeCanonicalAdmission"]), "providerPolicy", blockers);
  const providers = readEnumArray(source.providers, PROVIDERS, "providerPolicy.providers", blockers, true);
  return {
    providers,
    chatgptStrictJsonSchemaRequired: readBoolean(source.chatgptStrictJsonSchemaRequired, "providerPolicy.chatgptStrictJsonSchemaRequired", blockers),
    claudeForcedToolRequired: readBoolean(source.claudeForcedToolRequired, "providerPolicy.claudeForcedToolRequired", blockers),
    compatibleAdapterSchemaRequired: readBoolean(source.compatibleAdapterSchemaRequired, "providerPolicy.compatibleAdapterSchemaRequired", blockers),
    providerSubstitutionAllowed: readBoolean(source.providerSubstitutionAllowed, "providerPolicy.providerSubstitutionAllowed", blockers),
    exactProfileFingerprintRequired: readBoolean(source.exactProfileFingerprintRequired, "providerPolicy.exactProfileFingerprintRequired", blockers),
    exactPacketFingerprintRequired: readBoolean(source.exactPacketFingerprintRequired, "providerPolicy.exactPacketFingerprintRequired", blockers),
    strictResponseIdentityRequired: readBoolean(source.strictResponseIdentityRequired, "providerPolicy.strictResponseIdentityRequired", blockers),
    phraseOverlapBeforeCanonicalAdmission: readBoolean(source.phraseOverlapBeforeCanonicalAdmission, "providerPolicy.phraseOverlapBeforeCanonicalAdmission", blockers),
  };
}

function parseQualityPolicy(value: unknown, blockers: string[]): BookQualityPolicyV1 {
  const source = record(value, "qualityPolicy", blockers);
  rejectUnknown(source, new Set(["exactSourceCoverageRequired", "currentVersionFullReadRequired", "minimumMaterialAlternatives", "independentReviewRequired", "compareAndSwapCanonicalMutationRequired", "automaticCanonicalAdmissionAllowed", "antiGenericityReviewRequired", "projectOwnedVoiceEvidenceRequired", "defaultReviewProfileIds"]), "qualityPolicy", blockers);
  const automaticCanonicalAdmissionAllowed = readBoolean(source.automaticCanonicalAdmissionAllowed, "qualityPolicy.automaticCanonicalAdmissionAllowed", blockers);
  if (automaticCanonicalAdmissionAllowed !== false) blockers.push("qualityPolicy.automaticCanonicalAdmissionAllowed must remain false.");
  return {
    exactSourceCoverageRequired: readRequiredTrue(source.exactSourceCoverageRequired, "qualityPolicy.exactSourceCoverageRequired", blockers),
    currentVersionFullReadRequired: readRequiredTrue(source.currentVersionFullReadRequired, "qualityPolicy.currentVersionFullReadRequired", blockers),
    minimumMaterialAlternatives: readInteger(source.minimumMaterialAlternatives, "qualityPolicy.minimumMaterialAlternatives", blockers, 2, 16),
    independentReviewRequired: readRequiredTrue(source.independentReviewRequired, "qualityPolicy.independentReviewRequired", blockers),
    compareAndSwapCanonicalMutationRequired: readRequiredTrue(source.compareAndSwapCanonicalMutationRequired, "qualityPolicy.compareAndSwapCanonicalMutationRequired", blockers),
    automaticCanonicalAdmissionAllowed: false,
    antiGenericityReviewRequired: readRequiredTrue(source.antiGenericityReviewRequired, "qualityPolicy.antiGenericityReviewRequired", blockers),
    projectOwnedVoiceEvidenceRequired: readRequiredTrue(source.projectOwnedVoiceEvidenceRequired, "qualityPolicy.projectOwnedVoiceEvidenceRequired", blockers),
    defaultReviewProfileIds: readIdArray(source.defaultReviewProfileIds, "qualityPolicy.defaultReviewProfileIds", blockers, 512, true).sort(),
  };
}

function parsePublicationPolicy(value: unknown, blockers: string[]): BookPublicationPolicyV1 {
  const source = record(value, "publicationPolicy", blockers);
  rejectUnknown(source, new Set(["targetPlatformIds", "manualSubmissionOnly", "metadataVerificationRequired", "rightsVerificationRequired", "aiDisclosureDecisionRequired", "isbnEvidenceRequired", "barcodeEvidenceRequired", "previewerEvidenceRequired", "physicalProofEvidenceRequired", "namedReleaseApprovalRequired"]), "publicationPolicy", blockers);
  const manualSubmissionOnly = readBoolean(source.manualSubmissionOnly, "publicationPolicy.manualSubmissionOnly", blockers);
  if (manualSubmissionOnly !== true) blockers.push("publicationPolicy.manualSubmissionOnly must remain true during migration.");
  return {
    targetPlatformIds: readIdArray(source.targetPlatformIds, "publicationPolicy.targetPlatformIds", blockers, 128, true).sort(),
    manualSubmissionOnly: true,
    metadataVerificationRequired: readRequiredTrue(source.metadataVerificationRequired, "publicationPolicy.metadataVerificationRequired", blockers),
    rightsVerificationRequired: readRequiredTrue(source.rightsVerificationRequired, "publicationPolicy.rightsVerificationRequired", blockers),
    aiDisclosureDecisionRequired: readRequiredTrue(source.aiDisclosureDecisionRequired, "publicationPolicy.aiDisclosureDecisionRequired", blockers),
    isbnEvidenceRequired: readBoolean(source.isbnEvidenceRequired, "publicationPolicy.isbnEvidenceRequired", blockers),
    barcodeEvidenceRequired: readBoolean(source.barcodeEvidenceRequired, "publicationPolicy.barcodeEvidenceRequired", blockers),
    previewerEvidenceRequired: readBoolean(source.previewerEvidenceRequired, "publicationPolicy.previewerEvidenceRequired", blockers),
    physicalProofEvidenceRequired: readBoolean(source.physicalProofEvidenceRequired, "publicationPolicy.physicalProofEvidenceRequired", blockers),
    namedReleaseApprovalRequired: readRequiredTrue(source.namedReleaseApprovalRequired, "publicationPolicy.namedReleaseApprovalRequired", blockers),
  };
}

function parseArtPolicy(value: unknown, blockers: string[]): BookArtIntentPolicyV1 {
  const source = record(value, "artPolicy", blockers);
  rejectUnknown(source, new Set(["artStudioEnabled", "generatedArtworkTextFreeRequired", "editableTypographyRequired", "credentialsServerSideOnly", "remoteWritesDisabledByDefault", "sourceAndModelProvenanceRequired"]), "artPolicy", blockers);
  return {
    artStudioEnabled: readBoolean(source.artStudioEnabled, "artPolicy.artStudioEnabled", blockers),
    generatedArtworkTextFreeRequired: readRequiredTrue(source.generatedArtworkTextFreeRequired, "artPolicy.generatedArtworkTextFreeRequired", blockers),
    editableTypographyRequired: readRequiredTrue(source.editableTypographyRequired, "artPolicy.editableTypographyRequired", blockers),
    credentialsServerSideOnly: readRequiredTrue(source.credentialsServerSideOnly, "artPolicy.credentialsServerSideOnly", blockers),
    remoteWritesDisabledByDefault: readRequiredTrue(source.remoteWritesDisabledByDefault, "artPolicy.remoteWritesDisabledByDefault", blockers),
    sourceAndModelProvenanceRequired: readRequiredTrue(source.sourceAndModelProvenanceRequired, "artPolicy.sourceAndModelProvenanceRequired", blockers),
  };
}

function compileReleaseWaves(volumes: BookVolumeV1[]): BookReleaseWaveV1[] {
  const byId = new Map(volumes.map((volume) => [volume.volumeId, volume]));
  const remaining = new Set(volumes.map((volume) => volume.volumeId));
  const completed = new Set<string>();
  const waves: BookReleaseWaveV1[] = [];
  while (remaining.size) {
    const ready = [...remaining]
      .map((id) => byId.get(id))
      .filter((volume): volume is BookVolumeV1 => Boolean(volume))
      .filter((volume) => volume.dependsOnVolumeIds.every((dependencyId) => completed.has(dependencyId)))
      .sort((a, b) => a.sequence - b.sequence || a.volumeId.localeCompare(b.volumeId));
    if (!ready.length) return [];
    waves.push({ wave: waves.length + 1, volumeIds: ready.map((volume) => volume.volumeId) });
    for (const volume of ready) {
      remaining.delete(volume.volumeId);
      completed.add(volume.volumeId);
    }
  }
  return waves;
}

function findDependencyCycle(volumes: BookVolumeV1[]): string[] {
  const byId = new Map(volumes.map((volume) => [volume.volumeId, volume]));
  const visited = new Set<string>();
  const active = new Set<string>();
  const stack: string[] = [];
  const visit = (id: string): string[] => {
    if (active.has(id)) {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    if (visited.has(id)) return [];
    visited.add(id);
    active.add(id);
    stack.push(id);
    for (const dependencyId of byId.get(id)?.dependsOnVolumeIds ?? []) {
      if (!byId.has(dependencyId)) continue;
      const cycle = visit(dependencyId);
      if (cycle.length) return cycle;
    }
    stack.pop();
    active.delete(id);
    return [];
  };
  for (const volume of volumes) {
    const cycle = visit(volume.volumeId);
    if (cycle.length) return cycle;
  }
  return [];
}

function blockedProjectFallback(): BookProjectV1 {
  return {
    outputKind: "evavo_docs_book_project",
    schemaVersion: 1,
    contract: BOOK_PROJECT_CONTRACT,
    projectId: "blocked-project",
    programmeId: "blocked-programme",
    projectTitle: "Blocked project",
    projectKind: "standalone",
    contributorDisplayNames: ["Unresolved contributor"],
    defaultLanguage: "en",
    sourceAuthorityIds: ["unresolved-source"],
    evidenceIds: [],
    globalConstraintIds: [],
    providerPolicy: {
      providers: ["other_compatible_model"],
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
      minimumMaterialAlternatives: 2,
      independentReviewRequired: true,
      compareAndSwapCanonicalMutationRequired: true,
      automaticCanonicalAdmissionAllowed: false,
      antiGenericityReviewRequired: true,
      projectOwnedVoiceEvidenceRequired: true,
      defaultReviewProfileIds: ["source_coverage"],
    },
    publicationPolicy: {
      targetPlatformIds: ["manual-handoff"],
      manualSubmissionOnly: true,
      metadataVerificationRequired: true,
      rightsVerificationRequired: true,
      aiDisclosureDecisionRequired: true,
      isbnEvidenceRequired: false,
      barcodeEvidenceRequired: false,
      previewerEvidenceRequired: false,
      physicalProofEvidenceRequired: false,
      namedReleaseApprovalRequired: true,
    },
    artPolicy: {
      artStudioEnabled: false,
      generatedArtworkTextFreeRequired: true,
      editableTypographyRequired: true,
      credentialsServerSideOnly: true,
      remoteWritesDisabledByDefault: true,
      sourceAndModelProvenanceRequired: true,
    },
    volumes: [],
    canonicalManuscriptMutationPerformed: false,
    publicationPerformed: false,
  };
}

function record(value: unknown, label: string, blockers: string[]): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    blockers.push(`${label} must be an object.`);
    return {};
  }
  return value as UnknownRecord;
}
function rejectUnknown(value: UnknownRecord, allowed: Set<string>, label: string, blockers: string[]): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (unknown.length) blockers.push(`${label} contains unsupported fields: ${unknown.join(", ")}. Use the versioned extensions object for compatible custom metadata.`);
}
function readId(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !SAFE_ID.test(value) || ["__proto__", "constructor", "prototype"].includes(value)) {
    blockers.push(`${label} must be a safe lowercase identifier.`);
    return "invalid-id";
  }
  return value;
}
function readOptionalId(value: unknown, label: string, blockers: string[]): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return readId(value, label, blockers);
}
function readText(value: unknown, label: string, blockers: string[], maximum: number): string {
  if (typeof value !== "string" || value !== value.trim() || value.length < 1 || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    blockers.push(`${label} must be bounded, trimmed text.`);
    return "invalid";
  }
  return value;
}
function readOptionalText(value: unknown, label: string, blockers: string[], maximum: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return readText(value, label, blockers, maximum);
}
function readBoolean(value: unknown, label: string, blockers: string[]): boolean {
  if (value !== true && value !== false) {
    blockers.push(`${label} must be boolean.`);
    return false;
  }
  return value;
}
function readRequiredTrue(value: unknown, label: string, blockers: string[]): true {
  if (value !== true) blockers.push(`${label} must remain true.`);
  return true;
}
function readInteger(value: unknown, label: string, blockers: string[], minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    blockers.push(`${label} must be an integer from ${minimum} to ${maximum}.`);
    return minimum;
  }
  return Number(value);
}
function readOptionalNumber(value: unknown, label: string, blockers: string[], minimum: number, maximum: number): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    blockers.push(`${label} must be a finite number from ${minimum} to ${maximum}.`);
    return undefined;
  }
  return value;
}
function readOptionalSha(value: unknown, label: string, blockers: string[]): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !SHA256.test(value)) {
    blockers.push(`${label} must be an exact sha256: digest.`);
    return undefined;
  }
  return value;
}
function readTextArray(value: unknown, label: string, blockers: string[], maximumItems: number, maximumLength: number, required: boolean): string[] {
  if (!Array.isArray(value) || value.length > maximumItems || (required && value.length < 1)) {
    blockers.push(`${label} must contain ${required ? "1 or more" : "0 or more"} bounded strings and at most ${maximumItems} entries.`);
    return [];
  }
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item !== item.trim() || item.length < 1 || item.length > maximumLength || /[\u0000-\u001f\u007f]/.test(item)) blockers.push(`${label} contains invalid text.`);
    else result.push(item);
  }
  addDuplicates(result, label, blockers);
  return unique(result);
}
function readIdArray(value: unknown, label: string, blockers: string[], maximumItems: number, required: boolean): string[] {
  if (!Array.isArray(value) || value.length > maximumItems || (required && value.length < 1)) {
    blockers.push(`${label} must contain ${required ? "1 or more" : "0 or more"} identifiers and at most ${maximumItems} entries.`);
    return [];
  }
  const result = value.map((item) => readId(item, label, blockers));
  addDuplicates(result, label, blockers);
  return unique(result);
}
function readEnum<T extends string>(value: unknown, allowed: Set<T>, label: string, blockers: string[], fallback: T): T {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    blockers.push(`${label} is unsupported.`);
    return fallback;
  }
  return value as T;
}
function readEnumArray<T extends string>(value: unknown, allowed: Set<T>, label: string, blockers: string[], required: boolean): T[] {
  if (!Array.isArray(value) || (required && value.length < 1) || value.length > 32) {
    blockers.push(`${label} must be a bounded provider array.`);
    return [];
  }
  const result = value.map((item) => readEnum(item, allowed, label, blockers, [...allowed][0] as T));
  addDuplicates(result, label, blockers);
  return unique(result);
}
function parseExtensions(value: unknown, label: string, blockers: string[]): Record<string, BookJsonValue> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    blockers.push(`${label} must be an object.`);
    return undefined;
  }
  try {
    const json = JSON.stringify(value);
    if (json.length > 64_000) blockers.push(`${label} exceeds 64,000 serialized characters.`);
    const parsed = JSON.parse(json) as Record<string, BookJsonValue>;
    for (const key of Object.keys(parsed)) {
      if (!SAFE_ID.test(key)) blockers.push(`${label} key ${key} is not a safe identifier.`);
    }
    return canonical(parsed) as Record<string, BookJsonValue>;
  } catch {
    blockers.push(`${label} must be JSON-compatible.`);
    return undefined;
  }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}
function addDuplicates(values: string[], label: string, blockers: string[]): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) seen.has(value) ? duplicates.add(value) : seen.add(value);
  if (duplicates.size) blockers.push(`${label} contain duplicates: ${[...duplicates].sort().join(", ")}.`);
}
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function sum(values: number[]): number { return values.reduce((total, value) => total + value, 0); }
