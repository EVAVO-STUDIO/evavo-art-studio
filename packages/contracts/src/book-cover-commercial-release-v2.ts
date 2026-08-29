import { createHash } from "node:crypto";
import {
  BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT as LEGACY_BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT,
  compileBookCoverCommercialReleaseAuthority as compileLegacyBookCoverCommercialReleaseAuthority,
  type BookCoverCommercialReleaseAuthorityV1,
  type BookCoverCommercialReleaseInputV1,
  type BookCoverCommercialProofId,
  type BookCoverCommercialReleaseStatus,
  type BookCoverZeroCostExecutionV1,
} from "./book-cover-commercial-release.js";

export const BOOK_COVER_COMMERCIAL_RELEASE_SCHEMA_VERSION_V2 = 2 as const;
export const BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT_V2 =
  "evavo_art_book_cover_commercial_release_v2" as const;
export const BOOK_COVER_COMMERCIAL_RELEASE_LOCAL_COMMAND_V2 =
  "node scripts/run-book-cover-commercial-release-v2-local.mjs" as const;

export type BookCoverCommercialReleaseInputV2 = Omit<
  BookCoverCommercialReleaseInputV1,
  "outputKind" | "schemaVersion" | "contract"
> & {
  outputKind: "evavo_art_book_cover_commercial_release_input";
  schemaVersion: typeof BOOK_COVER_COMMERCIAL_RELEASE_SCHEMA_VERSION_V2;
  contract: typeof BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT_V2;
};

export interface BookCoverCommercialProofSummaryV2 {
  requiredProofIds: BookCoverCommercialProofId[];
  requiredArtStageProofIds: BookCoverCommercialProofId[];
  deferredToDocsSuiteProofIds: BookCoverCommercialProofId[];
  suppliedArtStageProofIds: BookCoverCommercialProofId[];
  passedArtStageProofCount: number;
  failedArtStageProofCount: number;
  missingArtStageProofIds: BookCoverCommercialProofId[];
  postCompositionProofsDeferred: true;
}

export type BookCoverCommercialReleaseAuthorityV2 = Omit<
  BookCoverCommercialReleaseAuthorityV1,
  "outputKind" | "schemaVersion" | "contract" | "proofSummary" | "authorityDigestSha256"
> & {
  outputKind: "evavo_art_book_cover_commercial_release_authority";
  schemaVersion: typeof BOOK_COVER_COMMERCIAL_RELEASE_SCHEMA_VERSION_V2;
  contract: typeof BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT_V2;
  supersedesContract: typeof LEGACY_BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT;
  proofSummary: BookCoverCommercialProofSummaryV2;
  authorityDigestSha256: string;
};

export interface BookCoverCommercialReleaseCompilationResultV2 {
  outputKind: "evavo_art_book_cover_commercial_release_compilation_result";
  schemaVersion: typeof BOOK_COVER_COMMERCIAL_RELEASE_SCHEMA_VERSION_V2;
  contract: typeof BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT_V2;
  status: BookCoverCommercialReleaseStatus;
  authority: BookCoverCommercialReleaseAuthorityV2;
  blockers: string[];
  warnings: string[];
  docsSuiteCompositionAuthorized: boolean;
  automaticSelectionPerformed: false;
  automaticPromotionPerformed: false;
  publicationPerformed: false;
}

const KNOWN_PROOF_IDS = new Set<BookCoverCommercialProofId>([
  "thumbnail_60px",
  "thumbnail_96px",
  "thumbnail_100px",
  "thumbnail_120px",
  "grayscale",
  "blur_squint",
  "retailer_light_dark",
  "retailer_search_tile",
  "kindle_library_tile",
  "mobile_grayscale",
  "three_second_glance",
  "series_shelf",
  "spine_shelf",
  "full_wrap",
  "full_size",
  "audiobook_square",
  "physical_print",
]);

const DOCS_SUITE_POST_COMPOSITION_PROOF_IDS = new Set<BookCoverCommercialProofId>([
  "thumbnail_60px",
  "thumbnail_96px",
  "thumbnail_100px",
  "thumbnail_120px",
  "retailer_search_tile",
  "kindle_library_tile",
  "mobile_grayscale",
  "three_second_glance",
  "series_shelf",
  "spine_shelf",
  "full_wrap",
  "audiobook_square",
  "physical_print",
]);

const SHA256 = /^sha256:[a-f0-9]{64}$/;

export function listBookCoverCommercialReleaseCapabilitiesV2() {
  return Object.freeze({
    outputKind: "evavo_art_book_cover_commercial_release_capabilities",
    schemaVersion: BOOK_COVER_COMMERCIAL_RELEASE_SCHEMA_VERSION_V2,
    contract: BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT_V2,
    supersedesContract: LEGACY_BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT,
    capabilities: [
      "book.cover.art_stage_release.compile",
      "book.cover.art_stage_release.validate",
      "book.cover.docs_suite_composition.authorize",
      "book.cover.post_composition_proofs.defer",
    ] as const,
    localValidationAuthoritative: true as const,
    githubHostedActionsRequired: false as const,
    paidCiRequired: false as const,
    paidCrawlerRequired: false as const,
    paidImageApiRequiredForValidation: false as const,
    vercelBackgroundWorkerRequired: false as const,
    networkRequiredForValidation: false as const,
    workflowFilesAuthoritative: false as const,
    automaticSelectionAllowed: false as const,
    automaticPromotionAllowed: false as const,
    publicationAllowed: false as const,
  });
}

export function compileBookCoverCommercialReleaseAuthorityV2(
  value: unknown,
): BookCoverCommercialReleaseCompilationResultV2 {
  const source = isRecord(value)
    ? value as Partial<BookCoverCommercialReleaseInputV2>
    : {};
  const boundaryBlockers: string[] = [];
  if (!isRecord(value)) boundaryBlockers.push("Commercial-release V2 input must be one object.");
  if (
    source.outputKind !== "evavo_art_book_cover_commercial_release_input"
    || source.schemaVersion !== BOOK_COVER_COMMERCIAL_RELEASE_SCHEMA_VERSION_V2
    || source.contract !== BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT_V2
  ) boundaryBlockers.push("Commercial-release V2 input kind, version or contract is invalid.");

  const requiredProofIds = extractRequiredProofIds(source.designIntelligence, boundaryBlockers);
  const requiredArtStageProofIds = requiredProofIds.filter(
    (proofId) => !DOCS_SUITE_POST_COMPOSITION_PROOF_IDS.has(proofId),
  );
  const deferredToDocsSuiteProofIds = requiredProofIds.filter(
    (proofId) => DOCS_SUITE_POST_COMPOSITION_PROOF_IDS.has(proofId),
  );
  if (requiredArtStageProofIds.length < 2) {
    boundaryBlockers.push("At least two Art-stage visual proofs are required before Docs Suite composition.");
  }
  const suppliedProofIds = extractSuppliedProofIds(source.proofResults, boundaryBlockers);
  for (const proofId of suppliedProofIds) {
    if (DOCS_SUITE_POST_COMPOSITION_PROOF_IDS.has(proofId)) {
      boundaryBlockers.push(
        `Post-composition proof ${proofId} cannot be accepted before Docs Suite has composed exact typography and edition geometry.`,
      );
    }
    if (!requiredProofIds.includes(proofId)) {
      boundaryBlockers.push(`Supplied proof ${proofId} is absent from the exact design-intelligence proof plan.`);
    }
  }

  const legacyInput = toLegacyArtStageInput(
    source,
    new Set(requiredArtStageProofIds),
  );
  const legacyResult = compileLegacyBookCoverCommercialReleaseAuthority(legacyInput);
  const blockers = unique([...legacyResult.blockers, ...boundaryBlockers]).sort();
  const status: BookCoverCommercialReleaseStatus = blockers.length
    ? "blocked"
    : legacyResult.status;
  const docsSuiteCompositionAuthorized =
    status === "ready_for_docs_composition";
  const legacyProof = legacyResult.authority.proofSummary;
  const proofSummary: BookCoverCommercialProofSummaryV2 = {
    requiredProofIds: [...requiredProofIds].sort(),
    requiredArtStageProofIds: [...requiredArtStageProofIds].sort(),
    deferredToDocsSuiteProofIds: [...deferredToDocsSuiteProofIds].sort(),
    suppliedArtStageProofIds: legacyProof.suppliedProofIds
      .filter(isKnownProofId)
      .sort(),
    passedArtStageProofCount: legacyProof.passedProofCount,
    failedArtStageProofCount: legacyProof.failedProofCount,
    missingArtStageProofIds: legacyProof.missingProofIds
      .filter(isKnownProofId)
      .sort(),
    postCompositionProofsDeferred: true,
  };
  const allowedUse: BookCoverCommercialReleaseAuthorityV2["allowedUse"] =
    status === "ready_for_docs_composition"
      ? "docs_suite_composition"
      : status === "needs_human_review"
        ? "human_review_only"
        : status === "needs_retail_proofs"
          ? "art_revision_only"
          : status === "needs_market_research"
            ? "market_research_only"
            : "diagnostic_only";
  const requiredActions = unique([
    ...legacyResult.authority.requiredActions,
    ...boundaryBlockers.map((item) => `Resolve blocker: ${item}`),
  ]).sort();
  const unsigned: Omit<BookCoverCommercialReleaseAuthorityV2, "authorityDigestSha256"> = {
    ...omitLegacyAuthorityIdentity(legacyResult.authority),
    outputKind: "evavo_art_book_cover_commercial_release_authority",
    schemaVersion: BOOK_COVER_COMMERCIAL_RELEASE_SCHEMA_VERSION_V2,
    contract: BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT_V2,
    supersedesContract: LEGACY_BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT,
    status,
    allowedUse,
    proofSummary,
    docsSuiteCompositionAuthorized,
    blockers,
    requiredActions,
  };
  const authority: BookCoverCommercialReleaseAuthorityV2 = {
    ...unsigned,
    authorityDigestSha256: sha256(unsigned),
  };
  return {
    outputKind: "evavo_art_book_cover_commercial_release_compilation_result",
    schemaVersion: BOOK_COVER_COMMERCIAL_RELEASE_SCHEMA_VERSION_V2,
    contract: BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT_V2,
    status,
    authority,
    blockers,
    warnings: authority.warnings,
    docsSuiteCompositionAuthorized,
    automaticSelectionPerformed: false,
    automaticPromotionPerformed: false,
    publicationPerformed: false,
  };
}

export function validateBookCoverCommercialReleaseAuthorityV2(
  value: unknown,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!isRecord(value)) return { valid: false, issues: ["Commercial-release V2 authority must be one object."] };
  const authority = value as Partial<BookCoverCommercialReleaseAuthorityV2>;
  if (
    authority.outputKind !== "evavo_art_book_cover_commercial_release_authority"
    || authority.schemaVersion !== BOOK_COVER_COMMERCIAL_RELEASE_SCHEMA_VERSION_V2
    || authority.contract !== BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT_V2
    || authority.supersedesContract !== LEGACY_BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT
  ) issues.push("Commercial-release V2 authority identity is invalid.");
  if (!SHA256.test(String(authority.authorityDigestSha256 ?? ""))) issues.push("Commercial-release V2 authority digest is invalid.");
  const proof = authority.proofSummary;
  if (!proof) issues.push("Commercial-release V2 proof summary is missing.");
  else {
    const required = unique(proof.requiredProofIds ?? []).sort();
    const expectedArt = required.filter(
      (proofId) => !DOCS_SUITE_POST_COMPOSITION_PROOF_IDS.has(proofId),
    ).sort();
    const expectedDeferred = required.filter(
      (proofId) => DOCS_SUITE_POST_COMPOSITION_PROOF_IDS.has(proofId),
    ).sort();
    if (canonical(proof.requiredArtStageProofIds ?? []) !== canonical(expectedArt)) issues.push("Commercial-release V2 Art-stage proof partition is invalid.");
    if (canonical(proof.deferredToDocsSuiteProofIds ?? []) !== canonical(expectedDeferred)) issues.push("Commercial-release V2 Docs Suite proof partition is invalid.");
    if (proof.postCompositionProofsDeferred !== true) issues.push("Commercial-release V2 must defer post-composition proofs.");
    if ((proof.suppliedArtStageProofIds ?? []).some((proofId) => DOCS_SUITE_POST_COMPOSITION_PROOF_IDS.has(proofId))) issues.push("Commercial-release V2 includes premature post-composition proof evidence.");
  }
  const ready = authority.status === "ready_for_docs_composition";
  if (authority.docsSuiteCompositionAuthorized !== ready) issues.push("Docs Suite composition authorization differs from V2 authority status.");
  if (ready) {
    if ((authority.blockers ?? []).length || (authority.requiredActions ?? []).length) issues.push("Ready V2 authority retains blockers or required actions.");
    if ((proof?.failedArtStageProofCount ?? 1) !== 0) issues.push("Ready V2 authority retains failed Art-stage proofs.");
    if ((proof?.missingArtStageProofIds ?? ["missing"]).length !== 0) issues.push("Ready V2 authority retains missing Art-stage proofs.");
    if (authority.allowedUse !== "docs_suite_composition") issues.push("Ready V2 authority has the wrong allowed use.");
  }
  if (
    authority.automaticSelectionAllowed !== false
    || authority.automaticPromotionAllowed !== false
    || authority.publicationAllowed !== false
  ) issues.push("Commercial-release V2 automatic or publication flags are invalid.");
  if (authority.execution) validateZeroCostExecution(authority.execution, issues);
  else issues.push("Commercial-release V2 zero-cost execution policy is missing.");
  if (SHA256.test(String(authority.authorityDigestSha256 ?? ""))) {
    const { authorityDigestSha256: _discarded, ...unsigned } = authority as BookCoverCommercialReleaseAuthorityV2;
    if (sha256(unsigned) !== authority.authorityDigestSha256) issues.push("Commercial-release V2 authority digest differs from its canonical contents.");
  }
  return { valid: issues.length === 0, issues: unique(issues).sort() };
}

function toLegacyArtStageInput(
  source: Partial<BookCoverCommercialReleaseInputV2>,
  artProofIds: Set<BookCoverCommercialProofId>,
): unknown {
  const cloned = structuredClone(source) as Record<string, unknown>;
  cloned.outputKind = "evavo_art_book_cover_commercial_release_input";
  cloned.schemaVersion = 1;
  cloned.contract = LEGACY_BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT;
  const design = isRecord(cloned.designIntelligence)
    ? cloned.designIntelligence
    : undefined;
  const direction = design && isRecord(design.direction)
    ? design.direction
    : undefined;
  const plan = direction && isRecord(direction.retailProofPlan)
    ? direction.retailProofPlan
    : undefined;
  if (plan && Array.isArray(plan.requiredProofs)) {
    plan.requiredProofs = plan.requiredProofs.filter(
      (proof) => isRecord(proof) && artProofIds.has(String(proof.proofId) as BookCoverCommercialProofId),
    );
  }
  if (Array.isArray(cloned.proofResults)) {
    cloned.proofResults = cloned.proofResults.filter(
      (proof) => isRecord(proof) && artProofIds.has(String(proof.proofId) as BookCoverCommercialProofId),
    );
  }
  return cloned;
}

function extractRequiredProofIds(
  designValue: unknown,
  blockers: string[],
): BookCoverCommercialProofId[] {
  const design = isRecord(designValue) ? designValue : {};
  const direction = isRecord(design.direction) ? design.direction : {};
  const plan = isRecord(direction.retailProofPlan) ? direction.retailProofPlan : {};
  if (!Array.isArray(plan.requiredProofs)) {
    blockers.push("Design intelligence must include one required proof plan.");
    return [];
  }
  const output: BookCoverCommercialProofId[] = [];
  for (const proof of plan.requiredProofs) {
    const proofId = isRecord(proof) ? String(proof.proofId ?? "") : "";
    if (!isKnownProofId(proofId)) blockers.push(`Design intelligence contains unsupported proof ${proofId || "<missing>"}.`);
    else output.push(proofId);
  }
  return unique(output);
}

function extractSuppliedProofIds(
  proofValue: unknown,
  blockers: string[],
): BookCoverCommercialProofId[] {
  if (!Array.isArray(proofValue)) {
    blockers.push("Commercial-release V2 proofResults must be an array.");
    return [];
  }
  const output: BookCoverCommercialProofId[] = [];
  for (const proof of proofValue) {
    const proofId = isRecord(proof) ? String(proof.proofId ?? "") : "";
    if (!isKnownProofId(proofId)) blockers.push(`Commercial-release V2 contains unsupported supplied proof ${proofId || "<missing>"}.`);
    else output.push(proofId);
  }
  if (new Set(output).size !== output.length) blockers.push("Commercial-release V2 supplied proof IDs must be unique.");
  return unique(output);
}

function omitLegacyAuthorityIdentity(
  authority: BookCoverCommercialReleaseAuthorityV1,
): Omit<BookCoverCommercialReleaseAuthorityV1, "outputKind" | "schemaVersion" | "contract" | "proofSummary" | "authorityDigestSha256"> {
  const {
    outputKind: _outputKind,
    schemaVersion: _schemaVersion,
    contract: _contract,
    proofSummary: _proofSummary,
    authorityDigestSha256: _authorityDigestSha256,
    ...rest
  } = authority;
  return rest;
}

function validateZeroCostExecution(
  execution: BookCoverZeroCostExecutionV1,
  issues: string[],
): void {
  if (execution.mode !== "local_first_zero_cost") issues.push("Commercial-release V2 execution mode is not local-first.");
  for (const flag of [
    "githubHostedActionsRequired",
    "paidCiRequired",
    "paidCrawlerRequired",
    "paidImageApiRequiredForValidation",
    "vercelBackgroundWorkerRequired",
    "requestTimeMarketplaceBrowsingAllowed",
    "networkRequiredForValidation",
    "workflowFilesAuthoritative",
  ] as const) if (execution[flag] !== false) issues.push(`Commercial-release V2 execution ${flag} must remain false.`);
}

function isKnownProofId(value: unknown): value is BookCoverCommercialProofId {
  return typeof value === "string" && KNOWN_PROOF_IDS.has(value as BookCoverCommercialProofId);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
}
function sha256(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
}
