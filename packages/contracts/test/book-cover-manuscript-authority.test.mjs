import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOK_COVER_MANUSCRIPT_AUTHORITY_CONTRACT,
  BOOK_COVER_MANUSCRIPT_AUTHORITY_SCHEMA_VERSION,
  compileBookCoverManuscriptAuthority,
  validateBookCoverManuscriptAuthority,
} from "../dist/book-cover-manuscript-authority.js";

const sha = (char) => `sha256:${char.repeat(64)}`;

function fixture() {
  return {
    outputKind: "evavo_art_book_cover_manuscript_authority_input",
    schemaVersion: BOOK_COVER_MANUSCRIPT_AUTHORITY_SCHEMA_VERSION,
    contract: BOOK_COVER_MANUSCRIPT_AUTHORITY_CONTRACT,
    projectId: "dark-age-of-sorrows",
    bookId: "book-one",
    manuscriptRevisionId: "rev-440",
    manuscriptSha256: sha("a"),
    canonSnapshotFingerprint: sha("b"),
    seriesContextFingerprint: sha("c"),
    sourcePlanFingerprint: sha("d"),
    title: "The Law Under the Law",
    seriesTitle: "Dark Age of Sorrows",
    seriesPosition: 1,
    authorDisplayName: "Gregory R. Parker · Gillian R. Parker",
    approvedSpoilerCeiling: "minor",
    approvedAt: "2026-09-03T01:00:00Z",
    approvedBy: "named-editor",
    approvedByKind: "human",
    evidence: [
      {
        evidenceId: "evidence-bell",
        kind: "motif",
        label: "Iron bell and binding marks",
        sourceLocationIds: ["book-one:page-6", "book-one:page-34"],
        sourceExcerptSha256: sha("e"),
        canonFactIds: ["canon:wardenate-bell", "canon:binding-marks"],
        spoilerLevel: "none",
        approvedForCoverUse: true,
      },
      {
        evidenceId: "evidence-blackmere",
        kind: "setting",
        label: "Blackmere winter church and ridge",
        sourceLocationIds: ["book-one:page-31"],
        sourceExcerptSha256: sha("f"),
        canonFactIds: ["canon:blackmere", "canon:st-oswin"],
        spoilerLevel: "minor",
        approvedForCoverUse: true,
      },
    ],
  };
}

test("compiles exact manuscript and canon bound cover authority", () => {
  const authority = compileBookCoverManuscriptAuthority(fixture());
  assert.equal(authority.manuscriptSha256, sha("a"));
  assert.equal(authority.canonSnapshotFingerprint, sha("b"));
  assert.equal(authority.sourcePlanFingerprint, sha("d"));
  assert.equal(authority.blockedEvidenceIds.length, 0);
  assert.equal(authority.endingSpoilersExcluded, true);
  assert.equal(validateBookCoverManuscriptAuthority(authority).valid, true);
});

test("rejects ending spoilers even when marked approved", () => {
  const input = fixture();
  input.evidence[0].spoilerLevel = "ending";
  assert.throws(
    () => compileBookCoverManuscriptAuthority(input),
    /ending spoiler/,
  );
});

test("rejects evidence above the human-approved spoiler ceiling", () => {
  const input = fixture();
  input.approvedSpoilerCeiling = "none";
  assert.throws(
    () => compileBookCoverManuscriptAuthority(input),
    /exceeds the approved spoiler ceiling/,
  );
});

test("rejects unapproved cover evidence", () => {
  const input = fixture();
  input.evidence[0].approvedForCoverUse = false;
  assert.throws(
    () => compileBookCoverManuscriptAuthority(input),
    /not approved for cover use/,
  );
});

test("rejects evidence without exact source locations or canon facts", () => {
  const input = fixture();
  input.evidence[0].sourceLocationIds = [];
  input.evidence[0].canonFactIds = [];
  assert.throws(
    () => compileBookCoverManuscriptAuthority(input),
    /no exact source locations.*not bound to approved canon facts|not bound to approved canon facts.*no exact source locations/,
  );
});

test("detects authority tampering after compilation", () => {
  const authority = compileBookCoverManuscriptAuthority(fixture());
  const forged = structuredClone(authority);
  forged.manuscriptRevisionId = "rev-other";
  const review = validateBookCoverManuscriptAuthority(forged);
  assert.equal(review.valid, false);
  assert.ok(review.issues.includes("Authority fingerprint differs from canonical contents."));
});
