import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { admitWorkHeaderCandidatePreviewManifest } from "../dist/index.js";

const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
const textSha = (value) => sha(Buffer.from(value, "utf8"));

function fixture() {
  const buffers = {
    currentDesktop: Buffer.from("desktop-current"),
    candidateDesktop: Buffer.from("desktop-candidate"),
    currentMobile: Buffer.from("mobile-current"),
    candidateMobile: Buffer.from("mobile-candidate"),
  };
  const candidateSrc = "https://res.cloudinary.com/dntogqtey/image/upload/v1/example.png";
  const capture = (profile, currentPath, candidatePath, currentBuffer, candidateBuffer) => ({
    profile,
    candidateRenderChanged: true,
    titleTextStable: true,
    subtitleTextStable: true,
    candidateResolvedSrc: candidateSrc,
    candidateResolvedSrcMatchesRequested: true,
    candidateHeader: { naturalWidth: 1600, naturalHeight: 900 },
    currentScreenshot: { path: currentPath, sha256: sha(currentBuffer), bytes: currentBuffer.length },
    candidateScreenshot: { path: candidatePath, sha256: sha(candidateBuffer), bytes: candidateBuffer.length },
  });
  const captures = [
    capture("desktop", "C:/evidence/desktop-current.png", "C:/evidence/desktop-candidate.png", buffers.currentDesktop, buffers.candidateDesktop),
    capture("mobile", "C:/evidence/mobile-current.png", "C:/evidence/mobile-candidate.png", buffers.currentMobile, buffers.candidateMobile),
  ];
  const manifest = {
    contract: "evavo.work-header-candidate-preview-capture.v3",
    route: "/work/opportunity-agent",
    candidateId: "candidate-a",
    candidateSrc,
    candidateSource: {
      requestedUrl: candidateSrc,
      requestedUrlSha256: textSha(candidateSrc),
      resolvedUrlDesktop: candidateSrc,
      resolvedUrlMobile: candidateSrc,
      resolvedSrcStableAcrossProfiles: true,
      naturalWidth: 1600,
      naturalHeight: 900,
      naturalDimensionsStableAcrossProfiles: true,
    },
    captures,
    pageRenderReviewInput: {
      pageSlug: "/work/opportunity-agent",
      candidateId: "candidate-a",
      currentDesktopPath: captures[0].currentScreenshot.path,
      candidateDesktopPath: captures[0].candidateScreenshot.path,
      currentMobilePath: captures[1].currentScreenshot.path,
      candidateMobilePath: captures[1].candidateScreenshot.path,
    },
    previewIntegrity: {
      desktopCandidateRenderChanged: true,
      mobileCandidateRenderChanged: true,
      titleTextStableAcrossSubstitution: true,
      subtitleTextStableAcrossSubstitution: true,
      candidateResolvedSrcMatchesRequested: true,
      candidateResolvedSrcStableAcrossProfiles: true,
      candidateNaturalDimensionsStableAcrossProfiles: true,
    },
    serverMutationPerformed: false,
    deploymentMutationPerformed: false,
    cloudinaryMutationPerformed: false,
    browserDomPreviewMutationOnly: true,
  };
  return { manifest, buffers };
}

test("admits exact source-bound preview evidence for Art Studio review", () => {
  const { manifest, buffers } = fixture();
  const result = admitWorkHeaderCandidatePreviewManifest(manifest, buffers);
  assert.equal(result.route, "/work/opportunity-agent");
  assert.equal(result.candidateId, "candidate-a");
  assert.equal(result.screenshotHashesVerified, true);
  assert.equal(result.responsiveSourceIdentityVerified, true);
  assert.equal(result.browserOnlyPreviewVerified, true);
  assert.equal(result.publicationAllowed, false);
  assert.equal(result.websiteMutationAllowed, false);
});

test("rejects preview screenshot bytes after capture drift", () => {
  const { manifest, buffers } = fixture();
  buffers.candidateMobile = Buffer.from("changed-after-capture");
  assert.throws(() => admitWorkHeaderCandidatePreviewManifest(manifest, buffers), /mobile candidate screenshot bytes do not match/u);
});

test("rejects responsive candidate URL drift", () => {
  const { manifest, buffers } = fixture();
  manifest.candidateSource.resolvedUrlMobile = "https://res.cloudinary.com/dntogqtey/image/upload/v2/other.png";
  assert.throws(() => admitWorkHeaderCandidatePreviewManifest(manifest, buffers), /resolved URL does not match requested candidate source/u);
});

test("rejects preview manifests that carry mutation authority", () => {
  const { manifest, buffers } = fixture();
  manifest.serverMutationPerformed = true;
  assert.throws(() => admitWorkHeaderCandidatePreviewManifest(manifest, buffers), /non-destructive boundary/u);
});
