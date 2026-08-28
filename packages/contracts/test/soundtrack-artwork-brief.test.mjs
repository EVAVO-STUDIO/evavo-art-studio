import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

const boundedMusicContext = {
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
};

test("Art Studio accepts the Audio Studio soundtrack artwork brief without music context", () => {
  const result = validateSoundtrackArtworkBrief(baseBrief);
  assert.equal(result.success, true);
});

test("Art Studio accepts bounded validated soundtrack music creative context", () => {
  const brief = {
    ...baseBrief,
    musicCreativeContext: boundedMusicContext,
    review: { ...baseBrief.review, useValidatedMusicCreativeContextWhenSupplied: true },
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

test("Art Studio rejects unknown authority-like fields instead of ignoring them", () => {
  const brief = {
    ...baseBrief,
    authority: { ...baseBrief.authority, automaticPublication: true },
  };
  const result = validateSoundtrackArtworkBrief(brief);
  assert.equal(result.success, false);
  assert.ok(result.issues.some((entry) => entry.path === "authority.automaticPublication"));
});

test("Art Studio rejects inconsistent soundtrack contrast counts", () => {
  const brief = {
    ...baseBrief,
    musicCreativeContext: { ...boundedMusicContext, adjacentContrastCount: 1 },
    review: { ...baseBrief.review, useValidatedMusicCreativeContextWhenSupplied: true },
  };
  const result = validateSoundtrackArtworkBrief(brief);
  assert.equal(result.success, false);
  assert.ok(result.issues.some((entry) => entry.path === "musicCreativeContext.adjacentContrasts"));
});

test("Art Studio rejects supplied music context when review refuses to use validated context", () => {
  const brief = {
    ...baseBrief,
    musicCreativeContext: { ...boundedMusicContext, trackCount: 1, productionModeCounts: { modern_high_fidelity: 1 }, musicFamilyCounts: { orchestral_cinematic: 1 }, gameplayFunctionCounts: { credits: 1 }, adjacentContrastCount: 0, adjacentContrasts: [] },
    review: { ...baseBrief.review, useValidatedMusicCreativeContextWhenSupplied: false },
  };
  const result = validateSoundtrackArtworkBrief(brief);
  assert.equal(result.success, false);
  assert.ok(result.issues.some((entry) => entry.path === "review.useValidatedMusicCreativeContextWhenSupplied"));
});

test("soundtrack artwork brief CLI emits machine-readable pass evidence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-soundtrack-brief-"));
  try {
    const input = path.join(root, "brief.json");
    fs.writeFileSync(input, JSON.stringify({ ...baseBrief, musicCreativeContext: boundedMusicContext, review: { ...baseBrief.review, useValidatedMusicCreativeContextWhenSupplied: true } }));
    const stdout = execFileSync(process.execPath, ["scripts/validate-soundtrack-artwork-brief.mjs", "--input", input], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
    const result = JSON.parse(stdout);
    assert.equal(result.status, "passed");
    assert.equal(result.hasMusicCreativeContext, true);
    assert.equal(result.distributorMetadataAuthority, false);
    assert.equal(result.publicationAuthority, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("soundtrack artwork brief CLI fails authority escalation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-soundtrack-brief-"));
  try {
    const input = path.join(root, "brief.json");
    fs.writeFileSync(input, JSON.stringify({ ...baseBrief, authority: { ...baseBrief.authority, distributorMetadataAuthority: true } }));
    const result = spawnSync(process.execPath, ["scripts/validate-soundtrack-artwork-brief.mjs", "--input", input], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
    assert.notEqual(result.status, 0);
    const payload = JSON.parse(result.stderr);
    assert.equal(payload.status, "failed");
    assert.ok(payload.issues.some((entry) => entry.path === "authority"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
