import assert from "node:assert/strict";
import test from "node:test";
import {
  SOUNDTRACK_ARTWORK_BRIEF_SCHEMA,
  validateSoundtrackArtworkBrief,
} from "../dist/soundtrack-artwork-brief.js";

const baseBrief = {
  schema: SOUNDTRACK_ARTWORK_BRIEF_SCHEMA,
  handoff: {
    repository: "EVAVO-STUDIO/evavo-art-studio",
    purpose: "soundtrack_cover_art_direction_and_production",
    returnToAudioStudioForFinalMediaValidation: true,
  },
  release: {
    releaseId: "example-ost",
    title: "Example Original Soundtrack",
    artist: "EVAVO",
    releaseType: "soundtrack",
    primaryGenre: "Soundtrack",
    releaseDate: "2026-08-28",
  },
  concept: "A restrained visual identity that reflects the soundtrack arc.",
  musicCreativeContext: null,
  visualNotes: [],
  referenceNotes: [],
  typography: {
    includeReleaseTitle: true,
    includeArtistName: false,
    keepCriticalTextInsideSafeArea: true,
    avoidTinyOrIllegibleText: true,
  },
  master: {
    aspectRatio: "1:1",
    preferredWorkingPixels: 3000,
    minimumAcceptedPixels: 640,
    maximumAcceptedPixels: 10000,
    colorSpace: "sRGB",
    acceptedFormats: ["png", "jpg", "tiff"],
    noArtificialUpscaling: true,
    retainLayeredEditableSource: true,
  },
  deliverables: [
    "layered_editable_master",
    "square_distribution_master",
    "small_thumbnail_legibility_preview",
    "artwork_review_contact_sheet_or_equivalent",
  ],
  review: {
    fitWithMusicAndGameIdentity: true,
    useValidatedMusicCreativeContextWhenSupplied: false,
    doNotForceLiteralAudioGenreIllustration: true,
    thumbnailLegibility: true,
    platformSafeCrop: true,
    rightsAndLicensingCheck: true,
    humanCreativeApprovalRequired: true,
  },
  authority: {
    artworkGenerationAuthority: false,
    artworkMutationAuthority: false,
    musicCreativeContextReinterpretationAuthority: false,
    distributorMetadataAuthority: false,
    finalArtworkApproval: false,
    publicationAuthority: false,
    handoffTarget: "EVAVO-STUDIO/evavo-art-studio",
  },
};

test("Art Studio accepts the Audio Studio soundtrack artwork brief without music context", () => {
  const result = validateSoundtrackArtworkBrief(baseBrief);
  assert.equal(result.success, true);
});

test("Art Studio accepts bounded validated soundtrack music creative context", () => {
  const brief = {
    ...baseBrief,
    musicCreativeContext: {
      source: { path: "review/style-coherence.json", sha256: "a".repeat(64), bytes: 1200 },
      trackCount: 3,
      styleCoverageComplete: true,
      productionModeCounts: { tracker_sampled_1993_1998: 1, modern_high_fidelity: 2 },
      musicFamilyCounts: { tracker_breakbeat: 1, orchestral_cinematic: 2 },
      gameplayFunctionCounts: { combat: 1, exploration: 1, credits: 1 },
      adjacentContrastCount: 2,
      adjacentContrasts: [
        { fromTrack: 1, toTrack: 2, changedDimensions: ["productionMode", "musicFamily", "gameplayFunction"] },
        { fromTrack: 2, toTrack: 3, changedDimensions: ["gameplayFunction"] },
      ],
      useAsCreativeContextOnly: true,
      doNotForceLiteralAudioGenreIllustration: true,
      doNotTreatContrastAsVisualInconsistency: true,
      doesNotGrantMasteringOrDistributorMetadataAuthority: true,
    },
    review: {
      ...baseBrief.review,
      useValidatedMusicCreativeContextWhenSupplied: true,
    },
  };
  const result = validateSoundtrackArtworkBrief(brief);
  assert.equal(result.success, true, result.success ? undefined : JSON.stringify(result.issues));
});

test("Art Studio rejects soundtrack context that gains distributor or reinterpretation authority", () => {
  const brief = {
    ...baseBrief,
    authority: {
      ...baseBrief.authority,
      distributorMetadataAuthority: true,
      musicCreativeContextReinterpretationAuthority: true,
    },
  };
  const result = validateSoundtrackArtworkBrief(brief);
  assert.equal(result.success, false);
  assert.ok(result.issues.some((entry) => entry.path === "authority"));
});

test("Art Studio rejects supplied music context when review refuses to use validated context", () => {
  const brief = {
    ...baseBrief,
    musicCreativeContext: {
      source: { path: "review/style-coherence.json", sha256: "a".repeat(64), bytes: 1200 },
      trackCount: 1,
      styleCoverageComplete: true,
      productionModeCounts: { modern_high_fidelity: 1 },
      musicFamilyCounts: { orchestral_cinematic: 1 },
      gameplayFunctionCounts: { credits: 1 },
      adjacentContrastCount: 0,
      adjacentContrasts: [],
      useAsCreativeContextOnly: true,
      doNotForceLiteralAudioGenreIllustration: true,
      doNotTreatContrastAsVisualInconsistency: true,
      doesNotGrantMasteringOrDistributorMetadataAuthority: true,
    },
    review: { ...baseBrief.review, useValidatedMusicCreativeContextWhenSupplied: false },
  };
  const result = validateSoundtrackArtworkBrief(brief);
  assert.equal(result.success, false);
  assert.ok(result.issues.some((entry) => entry.path === "review.useValidatedMusicCreativeContextWhenSupplied"));
});
