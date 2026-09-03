import assert from "node:assert/strict";
import test from "node:test";

import {
  DOCS_BOOK_ART_RELEASE_V2_CONTRACT,
  compileDocsBookArtReleaseV2,
  validateDocsBookArtReleaseV2,
} from "../dist/book-production-docs-release-v2.js";

const sha = (char) => `sha256:${char.repeat(64)}`;

function fixture() {
  return {
    outputKind: "evavo_art_docs_book_release_v2_input",
    schemaVersion: 2,
    contract: DOCS_BOOK_ART_RELEASE_V2_CONTRACT,
    projectId: "dark-age-of-sorrows",
    bookId: "book-three",
    manuscriptRevisionId: "rev-book3",
    manuscriptSha256: sha("a"),
    docsReleaseContract: "evavo_docs_book_writing_art_release_v2",
    docsReleaseFingerprint: sha("b"),
    finalArtBriefFingerprint: sha("c"),
    coverManuscriptAuthorityContract: "evavo_art_book_cover_manuscript_authority_v1",
    coverManuscriptAuthorityFingerprint: sha("d"),
    writingCandidateEvidenceContract: "evavo_writing_book_fiction_quality_package_v1",
    writingCandidateEvidenceFingerprint: sha("e"),
    requiredEvidenceIds: ["theme:wound", "motif:bell", "setting:blackmere"],
    receivedAt: "2026-09-03T07:00:00Z",
    receivedBy: "art-studio-local-worker",
    sourceRepository: "EVAVO-STUDIO/evavo-docs-suite",
    targetRepository: "EVAVO-STUDIO/evavo-art-studio",
    crossRepositoryRuntimeSourceImportAllowed: false,
    authoritativeBookWritesAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    publicationAllowed: false,
  };
}

test("V2 authorizes candidate art production from exact contract fingerprints without whole-repo commit pinning", () => {
  const report = compileDocsBookArtReleaseV2(fixture());
  assert.equal(report.status, "ready_for_art_production");
  assert.equal(report.compatibility.wholeRepositoryCommitAllowlistRequired, false);
  assert.equal(report.compatibility.exactContractIdentityRequired, true);
  assert.equal(report.compatibility.exactAuthorityFingerprintRequired, true);
  assert.deepEqual(validateDocsBookArtReleaseV2(report), { valid: true, issues: [] });
});

test("V2 keeps Art Studio candidate-only and unable to mutate canonical book state", () => {
  const report = compileDocsBookArtReleaseV2(fixture());
  assert.equal(report.authority.canonicalBookState, "EVAVO-STUDIO/evavo-docs-suite");
  assert.equal(report.authority.authoritativeBookWritesAllowed, false);
  assert.equal(report.authority.automaticSelectionAllowed, false);
  assert.equal(report.authority.automaticPromotionAllowed, false);
  assert.equal(report.authority.publicationAllowed, false);
});

test("V2 rejects missing authority fingerprints", () => {
  const input = fixture();
  input.coverManuscriptAuthorityFingerprint = "missing";
  const report = compileDocsBookArtReleaseV2(input);
  assert.equal(report.status, "blocked");
  assert.match(report.blockers.join(" "), /coverManuscriptAuthorityFingerprint/);
});

test("V2 rejects attempts to restore automatic promotion or publication", () => {
  const input = fixture();
  input.automaticPromotionAllowed = true;
  input.publicationAllowed = true;
  const report = compileDocsBookArtReleaseV2(input);
  assert.equal(report.status, "blocked");
  assert.match(report.blockers.join(" "), /automaticPromotionAllowed/);
  assert.match(report.blockers.join(" "), /publicationAllowed/);
});

test("V2 authority tampering is detectable", () => {
  const report = compileDocsBookArtReleaseV2(fixture());
  const tampered = structuredClone(report);
  tampered.manuscriptRevisionId = "rev-stale";
  const validation = validateDocsBookArtReleaseV2(tampered);
  assert.equal(validation.valid, false);
  assert.match(validation.issues.join(" "), /canonical contents/);
});
