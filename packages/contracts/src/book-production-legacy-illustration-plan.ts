import type { BookArtIdentityV1, BookArtPurpose } from "./book-production.js";
import type { BookArtProductionWorkOrderV1 } from "./book-production-profile.js";
import { compileBookArtProductionWorkOrder } from "./book-production-profile.js";

export interface LegacyWebsiteBookIllustrationPlanTranslationInputV1 {
  outputKind: "evavo_legacy_website_book_illustration_plan_translation_input";
  schemaVersion: 1;
  brief: unknown;
  legacyPlan: unknown;
  candidateId: string;
}

export interface LegacyWebsiteBookIllustrationPlanEvidenceV1 {
  sourceRepository: "EVAVO-STUDIO/Website";
  planOutputKind?: string;
  planVersion?: string;
  legacyProjectId?: string;
  legacyRunId?: string;
  legacyRequestedAt?: string;
  legacyProfile?: string;
  styleAuthorityDigestSha256?: string;
  styleFamily?: string;
  colourMode?: string;
  paperTone?: string;
  styleInkLayerMode?: string;
  pageAuthorityDigestSha256?: string;
  pageId?: string;
  pageRole?: string;
  narrativeMode?: string;
  directionDigestSha256?: string;
  layoutDigestSha256?: string;
  manuscriptAuthorityDigestSha256?: string;
  visualManuscriptAuthorityDigestSha256?: string;
  sharesPageWithLiveText?: boolean;
  protectedTextZoneCount?: number;
  legacyCandidateId?: string;
  variation?: string;
  promptDigestSha256?: string;
  idempotencyKey?: string;
  expectedWidthPx?: number;
  expectedHeightPx?: number;
  createTransparentInkLayer?: boolean;
  taskInkLayerMode?: string;
  taskState?: string;
  inputDigestSha256?: string;
  planDigestSha256?: string;
  rawLegacyPromptRetained: false;
  layoutGeometryRetained: false;
  sourceReferenceRetained: true;
  artifactBytesRead: false;
  artifactBytesRewritten: false;
}

export interface LegacyWebsiteBookIllustrationPlanTranslationResultV1 {
  outputKind: "evavo_legacy_website_book_illustration_plan_translation_result";
  schemaVersion: 1;
  status: "blocked" | "ready_for_shadow_comparison";
  identity: BookArtIdentityV1;
  workOrder?: BookArtProductionWorkOrderV1;
  legacyEvidence: LegacyWebsiteBookIllustrationPlanEvidenceV1;
  blockers: string[];
  warnings: string[];
  shadowOnly: true;
  rawLegacyPromptTrustedAsAuthority: false;
  legacyLayoutTrustedAsArtAuthority: false;
  authoritativeWritesPerformed: false;
  providerCandidateMayBeFinal: false;
  promotionRequired: true;
  bookUseBindingRequired: true;
  artifactBytesRead: false;
  artifactBytesRewritten: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const INPUT_FIELDS = new Set(["outputKind", "schemaVersion", "brief", "legacyPlan", "candidateId"]);
const PLAN_FIELDS = new Set([
  "outputKind", "version", "status", "projectId", "runId", "requestedAt", "profile",
  "styleAuthority", "pageAuthority", "providerProfile", "maximumRefinementRounds", "tasks",
  "nextCandidateId", "completedCandidateIds", "hardErrors", "warnings", "executionRules",
  "blockedClaims", "inputSnapshot", "inputDigestSha256", "planDigestSha256",
]);
const STYLE_FIELDS = new Set([
  "outputKind", "version", "status", "projectId", "styleId", "compiledAt", "styleFamily",
  "colourMode", "paperTone", "inkLayerMode", "minimumLineWidthPt", "targetLineArtPpi",
  "profile", "projectVisualIdentity", "projectDirectives", "prohibitedTraits",
  "historicalReferenceDigestSha256", "approvedReviewIds", "hardErrors", "warnings",
  "requiredRevisions", "requiredHumanDecisions", "blockedClaims", "authorityDigestSha256",
]);
const PAGE_FIELDS = new Set([
  "outputKind", "version", "status", "projectId", "pageId", "compiledAt",
  "styleAuthorityDigestSha256", "pageRole", "narrativeMode", "manuscriptAuthorityDigestSha256",
  "visualManuscriptAuthorityDigestSha256", "manuscriptEvidenceSpanIds", "directionDigestSha256",
  "layoutDigestSha256", "editionFormats", "sharesPageWithLiveText", "protectedTextZoneCount",
  "hardErrors", "warnings", "requiredHumanDecisions", "blockedClaims", "authorityDigestSha256",
]);
const PROVIDER_FIELDS = new Set([
  "adapter", "model", "size", "quality", "outputFormat", "background",
  "maximumCandidatesPerRun", "maximumConcurrency", "automaticProviderRetries",
]);
const TASK_FIELDS = new Set([
  "candidateId", "order", "variation", "prompt", "promptDigestSha256", "expectedWidthPx",
  "expectedHeightPx", "flattenBackgroundHex", "createTransparentInkLayer", "inkLayerMode",
  "idempotencyKey", "state", "completedEvidence", "stopConditions",
]);
const PURPOSES = new Set<BookArtPurpose>([
  "interior_full_page_illustration", "interior_half_page_illustration",
  "interior_spot_illustration", "diagram", "map", "ornament",
]);
const PAGE_ROLES = new Set([
  "chapter_opener", "full_page_black_ink_plate", "spot_illustration", "vignette_illustration",
  "decorative_border_or_frame", "ornamental_divider", "drop_cap_ornament",
  "chapter_cartouche", "illustrated_page_layout",
]);
const VARIATIONS = new Set(["formal_plate", "documentary_study", "dramatic_shadow", "ornamental_restraint"]);
const INK_LAYER_MODES = new Set(["none", "binary_alpha", "grayscale_alpha"]);

export async function translateLegacyWebsiteBookIllustrationGenerationPlan(
  value: unknown,
): Promise<LegacyWebsiteBookIllustrationPlanTranslationResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const input = record(value);
  if (!input) return blocked(emptyIdentity(), emptyEvidence(), ["Legacy Website Book Illustration translation input must be one object."], warnings);
  rejectUnknown(input, INPUT_FIELDS, "Legacy Website Book Illustration translation input", blockers);
  if (input.outputKind !== "evavo_legacy_website_book_illustration_plan_translation_input" || input.schemaVersion !== 1) {
    blockers.push("Legacy Website Book Illustration translation kind or version is invalid.");
  }
  const candidateId = text(input.candidateId);
  if (!isSafeId(candidateId)) blockers.push("Legacy Website Book Illustration candidateId is invalid.");

  const compilation = await compileBookArtProductionWorkOrder(input.brief);
  blockers.push(...compilation.blockers);
  const identity = compilation.identity;
  const purpose = record(input.brief)?.purpose;
  if (typeof purpose !== "string" || !PURPOSES.has(purpose as BookArtPurpose)) {
    blockers.push("Legacy Website Book Illustration translation requires an illustration, diagram, map or ornament Book Art purpose.");
  }

  const plan = record(input.legacyPlan);
  const evidence = compileEvidence(plan, candidateId);
  if (!plan) blockers.push("Legacy Website Book Illustration generation plan must be an object.");
  else await validatePlan(plan, candidateId, identity, input.brief, compilation.workOrder, evidence, blockers, warnings);

  if (blockers.length || !compilation.workOrder) return blocked(identity, evidence, unique(blockers), warnings);
  warnings.push("Legacy page geometry is retained only by digest and count for parity; Docs Suite remains authoritative for page layout and live text.");
  warnings.push("The raw legacy provider prompt is retained only by SHA-256 and is not trusted as the new Art Studio authority.");
  return {
    outputKind: "evavo_legacy_website_book_illustration_plan_translation_result",
    schemaVersion: 1,
    status: "ready_for_shadow_comparison",
    identity,
    workOrder: compilation.workOrder,
    legacyEvidence: evidence,
    blockers: [],
    warnings: unique([...compilation.warnings, ...warnings]),
    shadowOnly: true,
    rawLegacyPromptTrustedAsAuthority: false,
    legacyLayoutTrustedAsArtAuthority: false,
    authoritativeWritesPerformed: false,
    providerCandidateMayBeFinal: false,
    promotionRequired: true,
    bookUseBindingRequired: true,
    artifactBytesRead: false,
    artifactBytesRewritten: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

async function validatePlan(
  plan: Record<string, unknown>,
  candidateId: string,
  identity: BookArtIdentityV1,
  briefValue: unknown,
  workOrder: BookArtProductionWorkOrderV1 | undefined,
  evidence: LegacyWebsiteBookIllustrationPlanEvidenceV1,
  blockers: string[],
  warnings: string[],
): Promise<void> {
  rejectUnknown(plan, PLAN_FIELDS, "Legacy Website Book Illustration generation plan", blockers);
  if (plan.outputKind !== "book_illustration_generation_plan" || plan.version !== "book_illustration_generation_plan_v1") blockers.push("Legacy Website Book Illustration generation plan kind or version is invalid.");
  if (plan.status !== "ready_to_generate") blockers.push("Legacy Website Book Illustration generation plan must be ready_to_generate for shadow translation.");
  if (plan.projectId !== identity.projectId) blockers.push("Legacy Website Book Illustration generation plan belongs to a different project.");
  if (!isSafeId(plan.runId) || !isTimestamp(plan.requestedAt)) blockers.push("Legacy Website Book Illustration plan runId or requestedAt is invalid.");
  if (plan.profile !== "concept" && plan.profile !== "production") blockers.push("Legacy Website Book Illustration plan profile is invalid.");
  if (!Number.isInteger(plan.maximumRefinementRounds) || Number(plan.maximumRefinementRounds) < 0 || Number(plan.maximumRefinementRounds) > 3) blockers.push("Legacy Website Book Illustration maximumRefinementRounds is invalid.");
  blockers.push(...stringArray(plan.hardErrors).map((item) => `Legacy illustration plan blocker: ${item}`));
  warnings.push(...stringArray(plan.warnings).map((item) => `Legacy illustration plan warning: ${item}`));

  const inputSnapshot = plan.inputSnapshot;
  if (!isSha(plan.inputDigestSha256) || normalizeSha(text(plan.inputDigestSha256)) !== undefined && normalizeSha(text(plan.inputDigestSha256)) !== await hashValue(inputSnapshot)) blockers.push("Legacy Website Book Illustration input digest does not match its retained snapshot.");
  if (!isSha(plan.planDigestSha256)) blockers.push("Legacy Website Book Illustration plan digest is invalid.");
  else {
    const { planDigestSha256: _digest, ...withoutDigest } = plan;
    if (normalizeSha(text(plan.planDigestSha256)) !== await hashValue(withoutDigest)) blockers.push("Legacy Website Book Illustration plan digest does not match exact contents.");
  }

  const style = record(plan.styleAuthority);
  const page = record(plan.pageAuthority);
  const provider = record(plan.providerProfile);
  await validateStyle(style, identity.projectId, blockers, warnings);
  await validatePage(page, style, identity.projectId, briefValue, workOrder, blockers, warnings);
  validateProvider(provider, blockers);

  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const matching = tasks.filter((task) => record(task)?.candidateId === candidateId).map(record).filter((task): task is Record<string, unknown> => Boolean(task));
  if (matching.length !== 1) blockers.push("Legacy Website Book Illustration plan must contain the candidate exactly once.");
  else await validateTask(matching[0]!, plan, page, workOrder, candidateId, blockers);
  const taskIds = tasks.map((task) => text(record(task)?.candidateId));
  if (new Set(taskIds).size !== taskIds.length) blockers.push("Legacy Website Book Illustration plan contains duplicate candidate identities.");
  if (plan.nextCandidateId !== candidateId) blockers.push("Legacy Website Book Illustration candidate is not the exact next ready task.");
  if (evidence.pageRole && typeof briefValue === "object" && briefValue !== null) {
    const purpose = (briefValue as Record<string, unknown>).purpose;
    if (typeof purpose === "string" && !purposeMatchesPageRole(purpose as BookArtPurpose, evidence.pageRole)) blockers.push("Legacy Website Book Illustration page role does not match the canonical Book Art purpose.");
  }
}

async function validateStyle(
  style: Record<string, unknown> | undefined,
  projectId: string,
  blockers: string[],
  warnings: string[],
): Promise<void> {
  if (!style) { blockers.push("Legacy Website Book Illustration style authority must be an object."); return; }
  rejectUnknown(style, STYLE_FIELDS, "Legacy Website Book Illustration style authority", blockers);
  if (style.outputKind !== "book_illustration_style_authority" || style.version !== "book_illustration_style_authority_v1") blockers.push("Legacy Website Book Illustration style authority kind or version is invalid.");
  if (style.status !== "approved_for_page_design") blockers.push("Legacy Website Book Illustration requires an approved style authority.");
  if (style.projectId !== projectId || !isSafeId(style.styleId)) blockers.push("Legacy Website Book Illustration style identity is invalid.");
  if (!isSha(style.authorityDigestSha256)) blockers.push("Legacy Website Book Illustration style authority digest is invalid.");
  else {
    const { authorityDigestSha256: _digest, ...withoutDigest } = style;
    if (normalizeSha(text(style.authorityDigestSha256)) !== await hashValue(withoutDigest)) blockers.push("Legacy Website Book Illustration style authority digest does not match exact contents.");
  }
  blockers.push(...stringArray(style.hardErrors).map((item) => `Legacy illustration style blocker: ${item}`));
  blockers.push(...stringArray(style.requiredRevisions).map((item) => `Legacy illustration style unresolved revision: ${item}`));
  blockers.push(...stringArray(style.requiredHumanDecisions).map((item) => `Legacy illustration style unresolved decision: ${item}`));
  warnings.push(...stringArray(style.warnings).map((item) => `Legacy illustration style warning: ${item}`));
}

async function validatePage(
  page: Record<string, unknown> | undefined,
  style: Record<string, unknown> | undefined,
  projectId: string,
  briefValue: unknown,
  workOrder: BookArtProductionWorkOrderV1 | undefined,
  blockers: string[],
  warnings: string[],
): Promise<void> {
  if (!page) { blockers.push("Legacy Website Book Illustration page authority must be an object."); return; }
  rejectUnknown(page, PAGE_FIELDS, "Legacy Website Book Illustration page authority", blockers);
  if (page.outputKind !== "book_illustrated_page_authority" || page.version !== "book_illustrated_page_authority_v1") blockers.push("Legacy Website Book Illustration page authority kind or version is invalid.");
  if (page.status !== "ready_for_generation") blockers.push("Legacy Website Book Illustration requires a ready page authority.");
  if (page.projectId !== projectId || !isSafeId(page.pageId) || !PAGE_ROLES.has(text(page.pageRole))) blockers.push("Legacy Website Book Illustration page identity or role is invalid.");
  if (page.styleAuthorityDigestSha256 !== style?.authorityDigestSha256) blockers.push("Legacy Website Book Illustration page authority uses a different style authority.");
  for (const key of ["manuscriptAuthorityDigestSha256", "visualManuscriptAuthorityDigestSha256", "directionDigestSha256", "layoutDigestSha256", "authorityDigestSha256"] as const) {
    if (!isSha(page[key])) blockers.push(`Legacy Website Book Illustration page ${key} is invalid.`);
  }
  const brief = record(briefValue);
  const manuscript = record(brief?.manuscript);
  if (page.directionDigestSha256 !== manuscript?.artDirectionSha256) blockers.push("Legacy Website Book Illustration page uses stale or different art direction.");
  if (workOrder && page.directionDigestSha256 !== workOrder.sourceEvidence.artDirectionSha256) blockers.push("Legacy Website Book Illustration page direction differs from the Art Studio work order.");
  if (page.sharesPageWithLiveText === true && (!Number.isInteger(page.protectedTextZoneCount) || Number(page.protectedTextZoneCount) < 1)) blockers.push("Legacy Website Book Illustration live-text page lacks protected text zones.");
  if (typeof page.sharesPageWithLiveText !== "boolean" || !Number.isInteger(page.protectedTextZoneCount) || Number(page.protectedTextZoneCount) < 0) blockers.push("Legacy Website Book Illustration text-zone evidence is invalid.");
  if (isSha(page.authorityDigestSha256)) {
    const { authorityDigestSha256: _digest, ...withoutDigest } = page;
    if (normalizeSha(text(page.authorityDigestSha256)) !== await hashValue(withoutDigest)) blockers.push("Legacy Website Book Illustration page authority digest does not match exact contents.");
  }
  blockers.push(...stringArray(page.hardErrors).map((item) => `Legacy illustration page blocker: ${item}`));
  blockers.push(...stringArray(page.requiredHumanDecisions).map((item) => `Legacy illustration page unresolved decision: ${item}`));
  warnings.push(...stringArray(page.warnings).map((item) => `Legacy illustration page warning: ${item}`));
}

function validateProvider(provider: Record<string, unknown> | undefined, blockers: string[]): void {
  if (!provider) { blockers.push("Legacy Website Book Illustration provider profile must be an object."); return; }
  rejectUnknown(provider, PROVIDER_FIELDS, "Legacy Website Book Illustration provider profile", blockers);
  if (provider.outputFormat !== "png" || provider.maximumConcurrency !== 1 || provider.automaticProviderRetries !== 0) blockers.push("Legacy Website Book Illustration provider execution profile is invalid.");
}

async function validateTask(
  task: Record<string, unknown>,
  plan: Record<string, unknown>,
  page: Record<string, unknown> | undefined,
  workOrder: BookArtProductionWorkOrderV1 | undefined,
  candidateId: string,
  blockers: string[],
): Promise<void> {
  rejectUnknown(task, TASK_FIELDS, "Legacy Website Book Illustration generation task", blockers);
  if (task.candidateId !== candidateId || task.state !== "ready") blockers.push("Legacy Website Book Illustration generation task must be the exact ready candidate.");
  if (!VARIATIONS.has(text(task.variation))) blockers.push("Legacy Website Book Illustration task variation is invalid.");
  if (typeof task.prompt !== "string" || task.prompt.trim().length < 20 || !isSha(task.promptDigestSha256) || normalizeSha(text(task.promptDigestSha256)) !== await hashText(task.prompt)) blockers.push("Legacy Website Book Illustration task prompt or digest is invalid.");
  if (!isSha(task.idempotencyKey)) blockers.push("Legacy Website Book Illustration task idempotency key is invalid.");
  if (!Number.isInteger(task.expectedWidthPx) || Number(task.expectedWidthPx) < 64 || !Number.isInteger(task.expectedHeightPx) || Number(task.expectedHeightPx) < 64) blockers.push("Legacy Website Book Illustration task dimensions are invalid.");
  if (!INK_LAYER_MODES.has(text(task.inkLayerMode)) || typeof task.createTransparentInkLayer !== "boolean") blockers.push("Legacy Website Book Illustration task ink-layer policy is invalid.");
  if (task.createTransparentInkLayer === true && task.inkLayerMode === "none") blockers.push("Legacy Website Book Illustration transparent ink task cannot use none ink-layer mode.");
  if (task.createTransparentInkLayer === false && task.inkLayerMode !== "none") blockers.push("Legacy Website Book Illustration non-transparent task cannot declare an ink layer.");
  if (workOrder?.providerRequest.target.transparency === "required" && task.createTransparentInkLayer !== true) blockers.push("Legacy Website Book Illustration task lacks the transparent ink layer required by the canonical work order.");
  if (page?.pageRole === "drop_cap_ornament" && workOrder?.purpose !== "ornament") blockers.push("Legacy Website Book Illustration drop-cap ornament cannot be translated as a narrative illustration.");
  if (Array.isArray(plan.completedCandidateIds) && plan.completedCandidateIds.includes(candidateId)) blockers.push("Legacy Website Book Illustration next candidate is already recorded complete.");
}

function compileEvidence(
  plan: Record<string, unknown> | undefined,
  candidateId: string,
): LegacyWebsiteBookIllustrationPlanEvidenceV1 {
  const style = record(plan?.styleAuthority);
  const page = record(plan?.pageAuthority);
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  const task = tasks.map(record).find((item) => item?.candidateId === candidateId);
  return {
    sourceRepository: "EVAVO-STUDIO/Website",
    ...optionalString("planOutputKind", plan?.outputKind),
    ...optionalString("planVersion", plan?.version),
    ...optionalString("legacyProjectId", plan?.projectId),
    ...optionalString("legacyRunId", plan?.runId),
    ...optionalString("legacyRequestedAt", plan?.requestedAt),
    ...optionalString("legacyProfile", plan?.profile),
    ...optionalSha("styleAuthorityDigestSha256", style?.authorityDigestSha256),
    ...optionalString("styleFamily", style?.styleFamily),
    ...optionalString("colourMode", style?.colourMode),
    ...optionalString("paperTone", style?.paperTone),
    ...optionalString("styleInkLayerMode", style?.inkLayerMode),
    ...optionalSha("pageAuthorityDigestSha256", page?.authorityDigestSha256),
    ...optionalString("pageId", page?.pageId),
    ...optionalString("pageRole", page?.pageRole),
    ...optionalString("narrativeMode", page?.narrativeMode),
    ...optionalSha("directionDigestSha256", page?.directionDigestSha256),
    ...optionalSha("layoutDigestSha256", page?.layoutDigestSha256),
    ...optionalSha("manuscriptAuthorityDigestSha256", page?.manuscriptAuthorityDigestSha256),
    ...optionalSha("visualManuscriptAuthorityDigestSha256", page?.visualManuscriptAuthorityDigestSha256),
    ...(typeof page?.sharesPageWithLiveText === "boolean" ? { sharesPageWithLiveText: page.sharesPageWithLiveText } : {}),
    ...(Number.isInteger(page?.protectedTextZoneCount) ? { protectedTextZoneCount: Number(page?.protectedTextZoneCount) } : {}),
    ...(candidateId ? { legacyCandidateId: candidateId } : {}),
    ...optionalString("variation", task?.variation),
    ...optionalSha("promptDigestSha256", task?.promptDigestSha256),
    ...optionalSha("idempotencyKey", task?.idempotencyKey),
    ...(Number.isInteger(task?.expectedWidthPx) ? { expectedWidthPx: Number(task?.expectedWidthPx) } : {}),
    ...(Number.isInteger(task?.expectedHeightPx) ? { expectedHeightPx: Number(task?.expectedHeightPx) } : {}),
    ...(typeof task?.createTransparentInkLayer === "boolean" ? { createTransparentInkLayer: task.createTransparentInkLayer } : {}),
    ...optionalString("taskInkLayerMode", task?.inkLayerMode),
    ...optionalString("taskState", task?.state),
    ...optionalSha("inputDigestSha256", plan?.inputDigestSha256),
    ...optionalSha("planDigestSha256", plan?.planDigestSha256),
    rawLegacyPromptRetained: false,
    layoutGeometryRetained: false,
    sourceReferenceRetained: true,
    artifactBytesRead: false,
    artifactBytesRewritten: false,
  };
}

function purposeMatchesPageRole(purpose: BookArtPurpose, role: string): boolean {
  if (role === "full_page_black_ink_plate") return purpose === "interior_full_page_illustration" || purpose === "diagram" || purpose === "map";
  if (role === "chapter_opener" || role === "illustrated_page_layout") return purpose === "interior_full_page_illustration" || purpose === "interior_half_page_illustration" || purpose === "diagram" || purpose === "map";
  if (role === "spot_illustration" || role === "vignette_illustration") return purpose === "interior_spot_illustration" || purpose === "interior_half_page_illustration";
  return purpose === "ornament";
}

function blocked(
  identity: BookArtIdentityV1,
  evidence: LegacyWebsiteBookIllustrationPlanEvidenceV1,
  blockers: string[],
  warnings: string[],
): LegacyWebsiteBookIllustrationPlanTranslationResultV1 {
  return {
    outputKind: "evavo_legacy_website_book_illustration_plan_translation_result",
    schemaVersion: 1,
    status: "blocked",
    identity,
    legacyEvidence: evidence,
    blockers: unique(blockers),
    warnings: unique(warnings),
    shadowOnly: true,
    rawLegacyPromptTrustedAsAuthority: false,
    legacyLayoutTrustedAsArtAuthority: false,
    authoritativeWritesPerformed: false,
    providerCandidateMayBeFinal: false,
    promotionRequired: true,
    bookUseBindingRequired: true,
    artifactBytesRead: false,
    artifactBytesRewritten: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

function emptyIdentity(): BookArtIdentityV1 { return { workspaceId: "", projectId: "", bookId: "", requestId: "" }; }
function emptyEvidence(): LegacyWebsiteBookIllustrationPlanEvidenceV1 {
  return { sourceRepository: "EVAVO-STUDIO/Website", rawLegacyPromptRetained: false, layoutGeometryRetained: false, sourceReferenceRetained: true, artifactBytesRead: false, artifactBytesRewritten: false };
}
function record(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : []; }
function unique(values: string[]): string[] { return [...new Set(values.map((item) => item.trim()).filter(Boolean))]; }
function isSafeId(value: unknown): value is string { return typeof value === "string" && SAFE_ID.test(value) && !["__proto__", "constructor", "prototype"].includes(value); }
function isTimestamp(value: unknown): value is string { return typeof value === "string" && ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value)); }
function isSha(value: unknown): value is string { return typeof value === "string" && SHA256.test(value); }
function normalizeSha(value: string): string | undefined { const normalized = value.replace(/^sha256:/, ""); return /^[a-f0-9]{64}$/.test(normalized) ? normalized : undefined; }
function rejectUnknown(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string, blockers: string[]): void { const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort(); if (unknown.length) blockers.push(`${label} contains unknown fields: ${unknown.join(", ")}.`); }
function optionalString<K extends keyof LegacyWebsiteBookIllustrationPlanEvidenceV1>(key: K, value: unknown): Partial<LegacyWebsiteBookIllustrationPlanEvidenceV1> { const result = text(value).trim(); return result ? { [key]: result } as Partial<LegacyWebsiteBookIllustrationPlanEvidenceV1> : {}; }
function optionalSha<K extends keyof LegacyWebsiteBookIllustrationPlanEvidenceV1>(key: K, value: unknown): Partial<LegacyWebsiteBookIllustrationPlanEvidenceV1> { return isSha(value) ? { [key]: text(value) } as Partial<LegacyWebsiteBookIllustrationPlanEvidenceV1> : {}; }
function canonical(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])); return value; }
function canonicalJson(value: unknown): string { return JSON.stringify(canonical(value)); }
async function hashText(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function hashValue(value: unknown): Promise<string> { return hashText(canonicalJson(value)); }
