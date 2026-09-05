export const MEDIA_SLOT_ROLES = Object.freeze([
  "detail-hero",
  "detail-support",
  "catalogue-tile",
  "social-seo",
  "motion-layer",
] as const);

export type MediaSlotRole = (typeof MEDIA_SLOT_ROLES)[number];

export interface MediaAssetCandidate {
  readonly id: string;
  readonly width?: number;
  readonly height?: number;
  readonly bytes?: number;
  readonly format?: string;
  readonly hasAlpha?: boolean;
  readonly tags?: readonly string[];
  readonly status?: string;
  readonly assetRole?: string;
  readonly usage?: string;
  readonly predominantWhiteRatio?: number;
  readonly sharedWithCatalogue?: boolean;
  readonly lockedCatalogueSource?: boolean;
}

export interface MediaRoleRequest {
  readonly role: MediaSlotRole;
  readonly targetAspectRatio?: number;
  readonly transparentPreferred?: boolean;
  readonly minimumWidth?: number;
  readonly minimumHeight?: number;
  readonly allowSharedCatalogueSource?: boolean;
}

export interface MediaCandidateDecision {
  readonly id: string;
  readonly eligible: boolean;
  readonly score: number;
  readonly action: "keep" | "finish" | "derive" | "reject";
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
}

const ARCHIVE_TOKENS = [
  "archive",
  "archived",
  "replaced",
  "superseded",
  "rollback",
  "legacy-header",
] as const;
const CANDIDATE_TOKENS = ["candidate", "review-candidate"] as const;
const SUPPORT_TOKENS = [
  "support",
  "support-element",
  "secondary",
  "page-secondary",
  "body support",
  "sticky",
] as const;
const HERO_TOKENS = [
  "header",
  "hero",
  "cover",
  "seo-image",
  "social",
  "structured-image",
  "canonical",
] as const;
const CATALOGUE_ONLY_TOKENS = [
  "catalogue-only",
  "catalogue only",
  "catalogue presentation only",
  "work index catalogue presentation art only",
] as const;

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${label} must be a string when provided.`);
  return value;
}

function text(candidate: MediaAssetCandidate): string {
  return [
    candidate.id,
    candidate.status,
    candidate.assetRole,
    candidate.usage,
    ...(candidate.tags ?? []),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function hasAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function finitePositive(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function boundedRatio(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("predominantWhiteRatio must be between 0 and 1.");
  }
  return value;
}

function aspect(candidate: MediaAssetCandidate): number | undefined {
  return finitePositive(candidate.width) && finitePositive(candidate.height)
    ? candidate.width / candidate.height
    : undefined;
}

function scoreAspect(actual: number | undefined, target: number | undefined): number {
  if (!actual || !target || !Number.isFinite(target) || target <= 0) return 0;
  const drift = Math.max(actual / target, target / actual);
  if (drift <= 1.08) return 10;
  if (drift <= 1.2) return 6;
  if (drift <= 1.45) return 1;
  if (drift <= 1.8) return -8;
  return -18;
}

function validateCandidate(candidate: MediaAssetCandidate): void {
  if (!candidate || typeof candidate !== "object") throw new Error("Media candidate must be an object.");
  if (typeof candidate.id !== "string" || !candidate.id.trim()) throw new Error("Media candidate id is required.");
  for (const [label, value] of [
    ["width", candidate.width],
    ["height", candidate.height],
    ["bytes", candidate.bytes],
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new Error(`Media candidate ${label} must be a non-negative finite number.`);
    }
  }
  if (candidate.tags !== undefined && (!Array.isArray(candidate.tags) || candidate.tags.some((tag) => typeof tag !== "string"))) {
    throw new Error("Media candidate tags must be an array of strings.");
  }
  optionalString(candidate.format, "Media candidate format");
  optionalString(candidate.status, "Media candidate status");
  optionalString(candidate.assetRole, "Media candidate assetRole");
  optionalString(candidate.usage, "Media candidate usage");
  if (candidate.hasAlpha !== undefined && typeof candidate.hasAlpha !== "boolean") {
    throw new Error("Media candidate hasAlpha must be boolean when provided.");
  }
  if (candidate.sharedWithCatalogue !== undefined && typeof candidate.sharedWithCatalogue !== "boolean") {
    throw new Error("Media candidate sharedWithCatalogue must be boolean when provided.");
  }
  if (candidate.lockedCatalogueSource !== undefined && typeof candidate.lockedCatalogueSource !== "boolean") {
    throw new Error("Media candidate lockedCatalogueSource must be boolean when provided.");
  }
  boundedRatio(candidate.predominantWhiteRatio);
}

function validateRequest(request: MediaRoleRequest): void {
  if (!request || typeof request !== "object") throw new Error("Media role request is required.");
  if (!MEDIA_SLOT_ROLES.includes(request.role)) {
    throw new Error(`Unknown media slot role ${JSON.stringify(request.role)}.`);
  }
  for (const [label, value] of [
    ["targetAspectRatio", request.targetAspectRatio],
    ["minimumWidth", request.minimumWidth],
    ["minimumHeight", request.minimumHeight],
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
      throw new Error(`${label} must be a positive finite number when provided.`);
    }
  }
  for (const [label, value] of [
    ["transparentPreferred", request.transparentPreferred],
    ["allowSharedCatalogueSource", request.allowSharedCatalogueSource],
  ] as const) {
    if (value !== undefined && typeof value !== "boolean") {
      throw new Error(`${label} must be boolean when provided.`);
    }
  }
}

function applyMinimumDimensions(
  candidate: MediaAssetCandidate,
  minimumWidth: number,
  minimumHeight: number,
  label: string,
  warnings: string[],
): number {
  let penalty = 0;
  if (!finitePositive(candidate.width) || candidate.width < minimumWidth) {
    penalty -= 15;
    warnings.push(`${label} source width should be at least ${minimumWidth}px`);
  }
  if (!finitePositive(candidate.height) || candidate.height < minimumHeight) {
    penalty -= 12;
    warnings.push(`${label} source height should be at least ${minimumHeight}px`);
  }
  return penalty;
}

export function evaluateMediaCandidate(
  candidate: MediaAssetCandidate,
  request: MediaRoleRequest,
): MediaCandidateDecision {
  validateCandidate(candidate);
  validateRequest(request);
  const role = request.role;
  const search = text(candidate);
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 50;
  let hardReject = false;
  let needsFinish = false;
  let needsDerivative = false;

  if (hasAny(search, ARCHIVE_TOKENS)) {
    hardReject = true;
    score -= 80;
    reasons.push("asset is archived, replaced, superseded or rollback-only");
  }

  const candidateNamed = hasAny(search, CANDIDATE_TOKENS);
  const productionApproved = /production-approved|production|approved|active-reference/u.test(search);
  if (candidateNamed && !productionApproved) {
    score -= 24;
    needsFinish = true;
    warnings.push("asset is still candidate/review state rather than approved production media");
  }

  const format = candidate.format?.toLowerCase();
  const isSvg = format === "svg" || /\.svg(?:$|[?#])/u.test(candidate.id.toLowerCase());
  const actualAspect = aspect(candidate);
  const whiteRatio = boundedRatio(candidate.predominantWhiteRatio);
  const supportLike = hasAny(search, SUPPORT_TOKENS);
  const heroLike = hasAny(search, HERO_TOKENS);
  const catalogueOnly = hasAny(search, CATALOGUE_ONLY_TOKENS);

  if (role === "detail-hero") {
    if (isSvg) {
      hardReject = true;
      score -= 100;
      reasons.push("live detail heroes must use raster media, not SVG");
    }
    if (catalogueOnly) {
      hardReject = true;
      score -= 80;
      reasons.push("catalogue-only artwork cannot own a detail-page hero");
    }
    if (supportLike && !heroLike) {
      score -= 35;
      needsDerivative = true;
      reasons.push("support/secondary object needs a dedicated wide hero derivative");
    }
    const minimumWidth = request.minimumWidth ?? 1200;
    const minimumHeight = request.minimumHeight ?? 630;
    if (!finitePositive(candidate.width) || candidate.width < minimumWidth) {
      score -= 30;
      needsDerivative = true;
      reasons.push(`hero source width should be at least ${minimumWidth}px`);
    }
    if (!finitePositive(candidate.height) || candidate.height < minimumHeight) {
      score -= 18;
      needsDerivative = true;
      reasons.push(`hero source height should be at least ${minimumHeight}px`);
    }
    if (actualAspect !== undefined && actualAspect < 1.35) {
      score -= 24;
      needsDerivative = true;
      reasons.push("hero source is too portrait/square for a wide header slot");
    }
    score += scoreAspect(actualAspect, request.targetAspectRatio ?? 1672 / 941);
    if (heroLike) {
      score += 16;
      reasons.push("asset metadata identifies it as cover/header/canonical media");
    }
    if (candidate.hasAlpha === true) warnings.push("transparent hero source should be reviewed against the intended page background");
  }

  if (role === "detail-support") {
    if (catalogueOnly) {
      hardReject = true;
      score -= 70;
      reasons.push("catalogue-only artwork cannot be restored into a detail support slot");
    }
    if (heroLike && !supportLike) {
      score -= 22;
      needsDerivative = true;
      reasons.push("canonical hero/SEO media should not be reused as the body support image");
    }
    if (supportLike) {
      score += 18;
      reasons.push("asset metadata identifies it as support/secondary media");
    }
    if (request.transparentPreferred === true) {
      if (candidate.hasAlpha === true) score += 12;
      else {
        needsFinish = true;
        score -= 8;
        warnings.push("support slot prefers transparency but asset is not known to have alpha");
      }
    }
    score += applyMinimumDimensions(
      candidate,
      request.minimumWidth ?? 600,
      request.minimumHeight ?? 400,
      "support",
      warnings,
    );
    if (whiteRatio !== undefined && whiteRatio > 0.45) {
      needsFinish = true;
      score -= 25;
      warnings.push("asset has a predominantly white field and needs finishing review for a dark support slot");
    }
    score += scoreAspect(actualAspect, request.targetAspectRatio);
  }

  if (role === "catalogue-tile") {
    if (candidate.lockedCatalogueSource === true || candidate.sharedWithCatalogue === true) {
      score += 25;
      reasons.push("asset is an approved/shared catalogue source");
    }
    if (candidateNamed && productionApproved) warnings.push("candidate-like public ID is historical naming; trust approved metadata rather than filename alone");
  }

  if (role === "social-seo") {
    if (isSvg) {
      score -= 30;
      needsDerivative = true;
      reasons.push("social/SEO identity should use a raster delivery source");
    }
    if (supportLike && !heroLike) {
      score -= 30;
      needsDerivative = true;
      reasons.push("support art is not the canonical social/SEO identity");
    }
    const minimumWidth = request.minimumWidth ?? 1200;
    const minimumHeight = request.minimumHeight ?? 630;
    if (!finitePositive(candidate.width) || candidate.width < minimumWidth) {
      score -= 25;
      needsDerivative = true;
      reasons.push(`social/SEO source width should be at least ${minimumWidth}px`);
    }
    if (!finitePositive(candidate.height) || candidate.height < minimumHeight) {
      score -= 15;
      needsDerivative = true;
      reasons.push(`social/SEO source height should be at least ${minimumHeight}px`);
    }
    score += scoreAspect(actualAspect, request.targetAspectRatio ?? 1200 / 630);
    if (heroLike) score += 12;
  }

  if (role === "motion-layer") {
    if (candidate.hasAlpha === true) {
      score += 20;
      reasons.push("known alpha source is appropriate for independent motion layering");
    } else {
      score -= 18;
      needsFinish = true;
      warnings.push("motion layer should normally have a proven alpha channel");
    }
    if (format === "jpeg" || format === "jpg") {
      score -= 15;
      needsFinish = true;
      warnings.push("JPEG cannot preserve transparency for a reusable motion layer");
    }
    if (request.minimumWidth !== undefined || request.minimumHeight !== undefined) {
      score += applyMinimumDimensions(
        candidate,
        request.minimumWidth ?? 1,
        request.minimumHeight ?? 1,
        "motion-layer",
        warnings,
      );
    }
  }

  if (
    candidate.sharedWithCatalogue === true &&
    role !== "catalogue-tile" &&
    request.allowSharedCatalogueSource !== true
  ) {
    needsDerivative = true;
    score -= 16;
    warnings.push("source is shared with the catalogue; derive detail media instead of overwriting the shared asset");
  }
  if (candidate.lockedCatalogueSource === true && role !== "catalogue-tile") {
    warnings.push("catalogue source is locked; it may be reused unchanged when explicitly approved, but any pixel change must create a separate derivative");
    if (request.allowSharedCatalogueSource !== true) needsDerivative = true;
  }

  if (finitePositive(candidate.bytes) && candidate.bytes > 2_000_000) {
    score -= 10;
    warnings.push("asset is heavier than 2 MB and should use responsive/optimized delivery");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const action: MediaCandidateDecision["action"] = hardReject
    ? "reject"
    : needsDerivative
      ? "derive"
      : needsFinish
        ? "finish"
        : "keep";

  return {
    id: candidate.id,
    eligible: !hardReject,
    score,
    action,
    reasons: Object.freeze(reasons),
    warnings: Object.freeze(warnings),
  };
}

export function rankMediaCandidates(
  candidates: readonly MediaAssetCandidate[],
  request: MediaRoleRequest,
): readonly MediaCandidateDecision[] {
  validateRequest(request);
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("At least one media candidate is required.");
  }
  if (candidates.length > 500) throw new Error("Media role supervision supports at most 500 candidates per request.");
  return Object.freeze(
    candidates
      .map((candidate) => evaluateMediaCandidate(candidate, request))
      .sort((left, right) => {
        if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
        if (left.score !== right.score) return right.score - left.score;
        return left.id.localeCompare(right.id, "en-AU");
      }),
  );
}
