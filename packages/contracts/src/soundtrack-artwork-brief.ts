import {
  isFiniteNumber,
  isNonEmptyString,
  isRecord,
  issue,
  type ValidationIssue,
  type ValidationResult,
} from "./validation-common.js";

export const SOUNDTRACK_ARTWORK_BRIEF_SCHEMA = "evavo_soundtrack_artwork_brief_v1" as const;

export type SoundtrackArtworkBrief = Readonly<Record<string, unknown>>;

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;
const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

function validateStringCountMap(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, path, "must be an object of non-negative integer counts.");
    return;
  }
  for (const [key, count] of Object.entries(value)) {
    if (!isNonEmptyString(key) || !isNonNegativeInteger(count)) {
      issue(issues, `${path}.${key}`, "count entries must use non-empty keys and non-negative integers.");
    }
  }
}

function validateMusicCreativeContext(value: unknown, issues: ValidationIssue[]): void {
  if (value === null || value === undefined) return;
  if (!isRecord(value)) {
    issue(issues, "musicCreativeContext", "must be null or an object.");
    return;
  }
  const source = value.source;
  if (!isRecord(source) || !isNonEmptyString(source.path) || !isNonEmptyString(source.sha256) || source.sha256.length !== 64 || !isPositiveInteger(source.bytes)) {
    issue(issues, "musicCreativeContext.source", "must bind a path, 64-character sha256 and positive byte length.");
  }
  if (!isPositiveInteger(value.trackCount)) {
    issue(issues, "musicCreativeContext.trackCount", "must be a positive integer.");
  }
  if (value.styleCoverageComplete !== true) {
    issue(issues, "musicCreativeContext.styleCoverageComplete", "must be true when creative context is supplied.");
  }
  validateStringCountMap(value.productionModeCounts, "musicCreativeContext.productionModeCounts", issues);
  validateStringCountMap(value.musicFamilyCounts, "musicCreativeContext.musicFamilyCounts", issues);
  validateStringCountMap(value.gameplayFunctionCounts, "musicCreativeContext.gameplayFunctionCounts", issues);
  if (!isNonNegativeInteger(value.adjacentContrastCount)) {
    issue(issues, "musicCreativeContext.adjacentContrastCount", "must be a non-negative integer.");
  }
  if (!Array.isArray(value.adjacentContrasts)) {
    issue(issues, "musicCreativeContext.adjacentContrasts", "must be an array.");
  } else {
    value.adjacentContrasts.forEach((row, index) => {
      if (!isRecord(row) || !isPositiveInteger(row.fromTrack) || !isPositiveInteger(row.toTrack) || !Array.isArray(row.changedDimensions) || !row.changedDimensions.every(isNonEmptyString)) {
        issue(issues, `musicCreativeContext.adjacentContrasts[${index}]`, "must contain positive track numbers and changedDimensions strings.");
      }
    });
    if (isNonNegativeInteger(value.adjacentContrastCount) && value.adjacentContrasts.length !== value.adjacentContrastCount) {
      issue(issues, "musicCreativeContext.adjacentContrasts", "length must equal adjacentContrastCount.");
    }
  }
  for (const [field, expected] of [
    ["useAsCreativeContextOnly", true],
    ["doNotForceLiteralAudioGenreIllustration", true],
    ["doNotTreatContrastAsVisualInconsistency", true],
    ["doesNotGrantMasteringOrDistributorMetadataAuthority", true],
  ] as const) {
    if (value[field] !== expected) issue(issues, `musicCreativeContext.${field}`, "must remain true.");
  }
}

export function validateSoundtrackArtworkBrief(input: unknown): ValidationResult<SoundtrackArtworkBrief> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) return { success: false, issues: [{ path: "$", message: "brief must be an object." }] };
  if (input.schema !== SOUNDTRACK_ARTWORK_BRIEF_SCHEMA) issue(issues, "schema", `must equal ${SOUNDTRACK_ARTWORK_BRIEF_SCHEMA}.`);

  const handoff = input.handoff;
  if (!isRecord(handoff) || handoff.repository !== "EVAVO-STUDIO/evavo-art-studio" || handoff.purpose !== "soundtrack_cover_art_direction_and_production" || handoff.returnToAudioStudioForFinalMediaValidation !== true) {
    issue(issues, "handoff", "must target Art Studio for soundtrack cover production and return to Audio Studio for final media validation.");
  }
  const release = input.release;
  if (!isRecord(release) || !isNonEmptyString(release.title) || !isNonEmptyString(release.artist) || !isNonEmptyString(release.releaseType) || !isNonEmptyString(release.primaryGenre) || !isNonEmptyString(release.releaseDate)) {
    issue(issues, "release", "must contain title, artist, releaseType, primaryGenre and releaseDate.");
  }
  if (!isNonEmptyString(input.concept)) issue(issues, "concept", "is required.");
  if (!Array.isArray(input.visualNotes) || !input.visualNotes.every(isNonEmptyString)) issue(issues, "visualNotes", "must be an array of strings.");
  if (!Array.isArray(input.referenceNotes) || !input.referenceNotes.every(isNonEmptyString)) issue(issues, "referenceNotes", "must be an array of strings.");

  validateMusicCreativeContext(input.musicCreativeContext, issues);

  const typography = input.typography;
  if (!isRecord(typography) || !isBoolean(typography.includeReleaseTitle) || !isBoolean(typography.includeArtistName) || typography.keepCriticalTextInsideSafeArea !== true || typography.avoidTinyOrIllegibleText !== true) {
    issue(issues, "typography", "typography contract is invalid.");
  }
  const master = input.master;
  if (!isRecord(master) || master.aspectRatio !== "1:1" || !isFiniteNumber(master.preferredWorkingPixels) || !isFiniteNumber(master.minimumAcceptedPixels) || !isFiniteNumber(master.maximumAcceptedPixels) || master.preferredWorkingPixels <= 0 || master.minimumAcceptedPixels <= 0 || master.maximumAcceptedPixels < master.minimumAcceptedPixels || master.colorSpace !== "sRGB" || !Array.isArray(master.acceptedFormats) || !master.acceptedFormats.every(isNonEmptyString) || master.noArtificialUpscaling !== true || master.retainLayeredEditableSource !== true) {
    issue(issues, "master", "square soundtrack master contract is invalid.");
  }
  if (!Array.isArray(input.deliverables) || !input.deliverables.every(isNonEmptyString)) issue(issues, "deliverables", "must be a string array.");

  const review = input.review;
  if (!isRecord(review) || review.fitWithMusicAndGameIdentity !== true || review.doNotForceLiteralAudioGenreIllustration !== true || review.thumbnailLegibility !== true || review.platformSafeCrop !== true || review.rightsAndLicensingCheck !== true || review.humanCreativeApprovalRequired !== true) {
    issue(issues, "review", "review policy is invalid.");
  }
  if (input.musicCreativeContext !== null && input.musicCreativeContext !== undefined) {
    if (!isRecord(review) || review.useValidatedMusicCreativeContextWhenSupplied !== true) {
      issue(issues, "review.useValidatedMusicCreativeContextWhenSupplied", "must be true when musicCreativeContext is supplied.");
    }
  }

  const authority = input.authority;
  if (!isRecord(authority) || authority.artworkGenerationAuthority !== false || authority.artworkMutationAuthority !== false || authority.musicCreativeContextReinterpretationAuthority !== false || authority.distributorMetadataAuthority !== false || authority.finalArtworkApproval !== false || authority.publicationAuthority !== false || authority.handoffTarget !== "EVAVO-STUDIO/evavo-art-studio") {
    issue(issues, "authority", "Art Studio receiver must not inherit generation, mutation, reinterpretation, distributor, final-approval or publication authority from the brief.");
  }

  return issues.length === 0 ? { success: true, value: input } : { success: false, issues };
}

export function assertSoundtrackArtworkBrief(input: unknown): SoundtrackArtworkBrief {
  const result = validateSoundtrackArtworkBrief(input);
  if (!result.success) {
    const message = result.issues.map((entry) => `${entry.path}: ${entry.message}`).join("; ");
    throw new Error(`Invalid soundtrack artwork brief: ${message}`);
  }
  return result.value;
}
