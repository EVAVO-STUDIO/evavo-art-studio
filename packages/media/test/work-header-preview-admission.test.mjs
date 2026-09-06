import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { admitWorkHeaderCandidatePreviewManifest } from "../dist/index.js";

const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
const textSha = (value) => sha(Buffer.from(value, "utf8"));
function fixture() {
  const buffers = { currentDesktop: Buffer.from("desktop-current"), candidateDesktop: Buffer.from("desktop-candidate"), currentMobile: Buffer.from("mobile-current"), candidateMobile: Buffer.from("mobile-candidate"), candidateContent: Buffer.from("immutable-candidate-content") };
  const candidateSrc = "https://res.cloudinary.com/dntogqtey/image/upload/v1/example.png";
  const contentSha = sha(buffers.candidateContent);
  const capture = (profile, currentPath, candidatePath, currentBuffer, candidateBuffer) => ({ profile, candidateRenderChanged: true, titleTextStable: true, subtitleTextStable: true, candidateResolvedSrc: candidateSrc, candidateResolvedSrcMatchesRequested: true, candidateHeader: { naturalWidth: 1600, naturalHeight: 900 }, currentScreenshot: { path: currentPath, sha256: sha(currentBuffer), bytes: currentBuffer.length }, candidateScreenshot: { path: candidatePath, sha256: sha(candidateBuffer), bytes: candidateBuffer.length } });
  const captures = [capture("desktop", "C:/evidence/desktop-current.png", "C:/evidence/desktop-candidate.png", buffers.currentDesktop, buffers.candidateDesktop), capture("mobile", "C:/evidence/mobile-current.png", "C:/evidence/mobile-candidate.png", buffers.currentMobile, buffers.candidateMobile)];
  const artifactPath = "C:/evidence/candidate-source.bin";
  const manifest = {
    contract: "evavo.work-header-candidate-preview-capture.v6", route: "/work/opportunity-agent", candidateId: "candidate-a", candidateSrc,
    candidateSource: { requestedUrl: candidateSrc, requestedUrlSha256: textSha(candidateSrc), resolvedUrlDesktop: candidateSrc, resolvedUrlMobile: candidateSrc, resolvedSrcStableAcrossProfiles: true, naturalWidth: 1600, naturalHeight: 900, naturalDimensionsStableAcrossProfiles: true, contentSha256: contentSha, contentByteLength: buffers.candidateContent.length, contentType: "image/png", fetchedFinalUrl: candidateSrc, contentStableAcrossCapture: true },
    candidateContentArtifact: { path: artifactPath, sha256: contentSha, bytes: buffers.candidateContent.length, contentType: "image/png", immutableEvidence: true },
    captures,
    pageRenderReviewInput: { pageSlug: "/work/opportunity-agent", candidateId: "candidate-a", candidateContentSha256: contentSha, candidateContentByteLength: buffers.candidateContent.length, candidateContentArtifactPath: artifactPath, currentDesktopPath: captures[0].currentScreenshot.path, candidateDesktopPath: captures[0].candidateScreenshot.path, currentMobilePath: captures[1].currentScreenshot.path, candidateMobilePath: captures[1].candidateScreenshot.path },
    previewIntegrity: { desktopCandidateRenderChanged: true, mobileCandidateRenderChanged: true, titleTextStableAcrossSubstitution: true, subtitleTextStableAcrossSubstitution: true, candidateResolvedSrcMatchesRequested: true, candidateResolvedSrcStableAcrossProfiles: true, candidateNaturalDimensionsStableAcrossProfiles: true, candidateContentSha256AndLengthBound: true, candidateContentStableAcrossCapture: true, immutableCandidateContentArtifactPublished: true, atomicEvidenceBundlePublished: true },
    evidenceBundle: { createOnly: true, rollbackSafe: true, candidateContentArtifactIncluded: true, allScreenshotsCandidateContentAndManifestPublishedTogether: true },
    serverMutationPerformed: false, deploymentMutationPerformed: false, cloudinaryMutationPerformed: false, browserDomPreviewMutationOnly: true,
  };
  return { manifest, buffers, artifactPath };
}

test("admits immutable candidate-content artifact evidence", () => {
  const { manifest, buffers, artifactPath } = fixture();
  const result = admitWorkHeaderCandidatePreviewManifest(manifest, buffers);
  assert.equal(result.candidateContentArtifactPath, artifactPath);
  assert.equal(result.immutableCandidateContentArtifactVerified, true);
  assert.equal(result.candidateContentBytesVerified, true);
  assert.equal(result.atomicEvidenceBundleVerified, true);
  assert.equal(result.publicationAllowed, false);
});

test("rejects immutable candidate artifact byte drift", () => {
  const { manifest, buffers } = fixture();
  buffers.candidateContent = Buffer.from("tampered-artifact");
  assert.throws(() => admitWorkHeaderCandidatePreviewManifest(manifest, buffers), /immutable candidate-content artifact bytes changed/u);
});

test("rejects artifact metadata drift", () => {
  const { manifest, buffers } = fixture();
  manifest.candidateContentArtifact.bytes += 1;
  assert.throws(() => admitWorkHeaderCandidatePreviewManifest(manifest, buffers), /artifact binding is invalid/u);
});

test("rejects page-render artifact path drift", () => {
  const { manifest, buffers } = fixture();
  manifest.pageRenderReviewInput.candidateContentArtifactPath = "C:/evidence/other.bin";
  assert.throws(() => admitWorkHeaderCandidatePreviewManifest(manifest, buffers), /candidate-byte\/artifact binding/u);
});

test("rejects mutation authority", () => {
  const { manifest, buffers } = fixture();
  manifest.cloudinaryMutationPerformed = true;
  assert.throws(() => admitWorkHeaderCandidatePreviewManifest(manifest, buffers), /non-destructive boundary/u);
});
