import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { admitWorkHeaderCandidatePreviewManifest } from "../dist/index.js";

const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
const textSha = (value) => sha(Buffer.from(value, "utf8"));

function fixture() {
  const buffers = {
    currentDesktop: Buffer.from("desktop-current"), candidateDesktop: Buffer.from("desktop-candidate"),
    currentMobile: Buffer.from("mobile-current"), candidateMobile: Buffer.from("mobile-candidate"),
    candidateContent: Buffer.from("exact-previewed-candidate-image"),
  };
  const candidateSrc = "https://res.cloudinary.com/dntogqtey/image/upload/v1/example.png";
  const candidateSha = sha(buffers.candidateContent);
  const response = (profile, protocol) => ({
    requestId: `${profile}-candidate-request`, url: candidateSrc, method: "GET", requestStartedAfterTrigger: true, exactTriggeredRequestBound: true,
    initiatorType: "script", documentUrl: "https://evavo.com.au/work/opportunity-agent", status: 200, mimeType: "image/png", sha256: candidateSha, byteLength: buffers.candidateContent.length,
    protocol, fromDiskCache: false, fromServiceWorker: false, encodedDataLength: buffers.candidateContent.length + 128, bodyBase64EncodedByCdp: true,
  });
  const capture = (profile, currentPath, candidatePath, currentBuffer, candidateBuffer) => ({
    profile, candidateRenderChanged: true, titleTextStable: true, subtitleTextStable: true,
    candidateResolvedSrc: candidateSrc, candidateResolvedSrcMatchesRequested: true,
    candidateHeader: { naturalWidth: 1600, naturalHeight: 900 }, browserCandidateResponse: response(profile, profile === "desktop" ? "h2" : "h3"),
    currentScreenshot: { path: currentPath, sha256: sha(currentBuffer), bytes: currentBuffer.length },
    candidateScreenshot: { path: candidatePath, sha256: sha(candidateBuffer), bytes: candidateBuffer.length },
  });
  const captures = [
    capture("desktop", "C:/evidence/desktop-current.png", "C:/evidence/desktop-candidate.png", buffers.currentDesktop, buffers.candidateDesktop),
    capture("mobile", "C:/evidence/mobile-current.png", "C:/evidence/mobile-candidate.png", buffers.currentMobile, buffers.candidateMobile),
  ];
  const artifactPath = "C:/evidence/candidate-source.bin";
  const manifest = {
    contract: "evavo.work-header-candidate-preview-capture.v8",
    route: "/work/opportunity-agent", candidateId: "candidate-a", candidateSrc,
    candidateSource: {
      requestedUrl: candidateSrc, requestedUrlSha256: textSha(candidateSrc), resolvedUrlDesktop: candidateSrc, resolvedUrlMobile: candidateSrc,
      resolvedSrcStableAcrossProfiles: true, naturalWidth: 1600, naturalHeight: 900, naturalDimensionsStableAcrossProfiles: true,
      contentSha256: candidateSha, contentByteLength: buffers.candidateContent.length, contentType: "image/png", fetchedFinalUrl: candidateSrc, contentStableAcrossCapture: true,
    },
    candidateContentArtifact: { path: artifactPath, sha256: candidateSha, bytes: buffers.candidateContent.length, contentType: "image/png", immutableEvidence: true },
    browserCandidateResponseIdentity: {
      desktopSha256: candidateSha, desktopByteLength: buffers.candidateContent.length,
      mobileSha256: candidateSha, mobileByteLength: buffers.candidateContent.length,
      matchesImmutableCandidateArtifact: true, stableAcrossProfiles: true, exactTriggeredRequestsBoundAcrossProfiles: true,
    },
    captures,
    pageRenderReviewInput: {
      pageSlug: "/work/opportunity-agent", candidateId: "candidate-a", candidateContentSha256: candidateSha, candidateContentByteLength: buffers.candidateContent.length,
      candidateContentArtifactPath: artifactPath, browserCandidateResponseSha256: candidateSha, browserCandidateResponseByteLength: buffers.candidateContent.length,
      browserCandidateRequestBindingRequired: true,
      currentDesktopPath: captures[0].currentScreenshot.path, candidateDesktopPath: captures[0].candidateScreenshot.path,
      currentMobilePath: captures[1].currentScreenshot.path, candidateMobilePath: captures[1].candidateScreenshot.path,
    },
    previewIntegrity: {
      desktopCandidateRenderChanged: true, mobileCandidateRenderChanged: true, titleTextStableAcrossSubstitution: true, subtitleTextStableAcrossSubstitution: true,
      candidateResolvedSrcMatchesRequested: true, candidateResolvedSrcStableAcrossProfiles: true, candidateNaturalDimensionsStableAcrossProfiles: true,
      candidateContentSha256AndLengthBound: true, candidateContentStableAcrossCapture: true, immutableCandidateContentArtifactPublished: true,
      browserResponseBodyCapturedOnEveryProfile: true, browserResponseBodyMatchesImmutableCandidateArtifact: true, browserResponseBodyStableAcrossProfiles: true,
      browserResponseBoundToExactTriggeredRequestOnEveryProfile: true, atomicEvidenceBundlePublished: true,
    },
    evidenceBundle: { createOnly: true, rollbackSafe: true, candidateContentArtifactIncluded: true, allScreenshotsCandidateContentAndManifestPublishedTogether: true },
    serverMutationPerformed: false, deploymentMutationPerformed: false, cloudinaryMutationPerformed: false, browserDomPreviewMutationOnly: true,
  };
  return { manifest, buffers };
}

test("admits preview only when browser-loaded bytes come from exact triggered GET requests", () => {
  const { manifest, buffers } = fixture();
  const result = admitWorkHeaderCandidatePreviewManifest(manifest, buffers);
  assert.equal(result.browserResponseBodyIdentityVerified, true);
  assert.equal(result.browserResponseMetadataBound, true);
  assert.equal(result.exactTriggeredBrowserRequestBindingVerified, true);
  assert.equal(result.browserResponseBindings.desktop.requestId, "desktop-candidate-request");
  assert.equal(result.browserResponseBindings.mobile.requestId, "mobile-candidate-request");
  assert.equal(result.browserResponseBindings.desktop.method, "GET");
  assert.equal(result.browserResponseBindings.desktop.protocol, "h2");
  assert.equal(result.browserResponseBindings.mobile.protocol, "h3");
  assert.equal(result.immutableCandidateContentArtifactVerified, true);
  assert.equal(result.publicationAllowed, false);
});

test("rejects a matching response that was not started after candidate substitution", () => {
  const { manifest, buffers } = fixture();
  manifest.captures[0].browserCandidateResponse.requestStartedAfterTrigger = false;
  assert.throws(() => admitWorkHeaderCandidatePreviewManifest(manifest, buffers), /exact GET request started by candidate substitution/u);
});

test("rejects non-GET candidate request evidence", () => {
  const { manifest, buffers } = fixture();
  manifest.captures[1].browserCandidateResponse.method = "POST";
  assert.throws(() => admitWorkHeaderCandidatePreviewManifest(manifest, buffers), /exact GET request started by candidate substitution/u);
});

test("rejects missing exact-trigger identity summary", () => {
  const { manifest, buffers } = fixture();
  manifest.browserCandidateResponseIdentity.exactTriggeredRequestsBoundAcrossProfiles = false;
  assert.throws(() => admitWorkHeaderCandidatePreviewManifest(manifest, buffers), /browser response-body\/request identity/u);
});

test("rejects page-render handoff that drops exact request binding", () => {
  const { manifest, buffers } = fixture();
  manifest.pageRenderReviewInput.browserCandidateRequestBindingRequired = false;
  assert.throws(() => admitWorkHeaderCandidatePreviewManifest(manifest, buffers), /browser-response\/request binding/u);
});

test("rejects browser-loaded byte mismatch", () => {
  const { manifest, buffers } = fixture();
  manifest.captures[1].browserCandidateResponse.sha256 = sha(Buffer.from("wrong-browser-response"));
  assert.throws(() => admitWorkHeaderCandidatePreviewManifest(manifest, buffers), /Chrome response-body identity/u);
});

test("rejects browser response summary drift", () => {
  const { manifest, buffers } = fixture();
  manifest.browserCandidateResponseIdentity.mobileByteLength += 1;
  assert.throws(() => admitWorkHeaderCandidatePreviewManifest(manifest, buffers), /browser response-body\/request identity/u);
});

test("rejects invalid Chrome response metadata", () => {
  const { manifest, buffers } = fixture();
  manifest.captures[0].browserCandidateResponse.encodedDataLength = -1;
  assert.throws(() => admitWorkHeaderCandidatePreviewManifest(manifest, buffers), /encoded response length is invalid/u);
});

test("normalizes cache and service-worker delivery metadata without changing byte authority", () => {
  const { manifest, buffers } = fixture();
  manifest.captures[0].browserCandidateResponse.fromDiskCache = true;
  manifest.captures[1].browserCandidateResponse.fromServiceWorker = true;
  const result = admitWorkHeaderCandidatePreviewManifest(manifest, buffers);
  assert.equal(result.browserResponseBindings.desktop.fromDiskCache, true);
  assert.equal(result.browserResponseBindings.mobile.fromServiceWorker, true);
  assert.equal(result.exactTriggeredBrowserRequestBindingVerified, true);
});

test("rejects immutable candidate artifact drift", () => {
  const { manifest, buffers } = fixture();
  buffers.candidateContent = Buffer.from("different-image-response");
  assert.throws(() => admitWorkHeaderCandidatePreviewManifest(manifest, buffers), /artifact bytes changed/u);
});

test("rejects screenshot drift", () => {
  const { manifest, buffers } = fixture();
  buffers.candidateMobile = Buffer.from("changed-after-capture");
  assert.throws(() => admitWorkHeaderCandidatePreviewManifest(manifest, buffers), /mobile candidate screenshot bytes do not match/u);
});
