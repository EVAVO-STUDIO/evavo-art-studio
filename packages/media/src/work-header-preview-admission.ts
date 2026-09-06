import { createHash } from "node:crypto";

export const WORK_HEADER_PREVIEW_ADMISSION_CONTRACT = "evavo.work-header-preview-admission.v1" as const;
export const WORK_HEADER_PREVIEW_CAPTURE_CONTRACT = "evavo.work-header-candidate-preview-capture.v7" as const;

export interface WorkHeaderPreviewScreenshotBinding { readonly path: string; readonly sha256: string; readonly bytes: number }
export interface WorkHeaderBrowserResponseBinding {
  readonly url: string; readonly status: number; readonly mimeType: string; readonly sha256: string; readonly byteLength: number;
  readonly protocol?: string | null; readonly fromDiskCache?: boolean; readonly fromServiceWorker?: boolean;
  readonly encodedDataLength?: number; readonly bodyBase64EncodedByCdp?: boolean;
}
export interface WorkHeaderPreviewCapture {
  readonly profile: string; readonly candidateRenderChanged: boolean; readonly titleTextStable: boolean; readonly subtitleTextStable: boolean;
  readonly candidateResolvedSrc: string; readonly candidateResolvedSrcMatchesRequested: boolean;
  readonly candidateHeader: Readonly<{ naturalWidth: number; naturalHeight: number }>;
  readonly browserCandidateResponse: WorkHeaderBrowserResponseBinding;
  readonly currentScreenshot: WorkHeaderPreviewScreenshotBinding; readonly candidateScreenshot: WorkHeaderPreviewScreenshotBinding;
}
export interface WorkHeaderCandidatePreviewManifest {
  readonly contract: string; readonly route: string; readonly candidateId: string; readonly candidateSrc: string;
  readonly candidateSource: Readonly<{
    requestedUrl: string; requestedUrlSha256: string; resolvedUrlDesktop: string; resolvedUrlMobile: string; resolvedSrcStableAcrossProfiles: boolean;
    naturalWidth: number; naturalHeight: number; naturalDimensionsStableAcrossProfiles: boolean; contentSha256: string; contentByteLength: number;
    contentType: string; fetchedFinalUrl: string; contentStableAcrossCapture: boolean; etag?: string | null; lastModified?: string | null;
  }>;
  readonly candidateContentArtifact: Readonly<{ path: string; sha256: string; bytes: number; contentType: string; immutableEvidence: boolean }>;
  readonly browserCandidateResponseIdentity: Readonly<{
    desktopSha256: string; desktopByteLength: number; mobileSha256: string; mobileByteLength: number;
    matchesImmutableCandidateArtifact: boolean; stableAcrossProfiles: boolean;
  }>;
  readonly captures: readonly WorkHeaderPreviewCapture[];
  readonly pageRenderReviewInput: Readonly<{
    pageSlug: string; candidateId: string; candidateContentSha256: string; candidateContentByteLength: number; candidateContentArtifactPath: string;
    browserCandidateResponseSha256: string; browserCandidateResponseByteLength: number;
    currentDesktopPath: string; candidateDesktopPath: string; currentMobilePath: string; candidateMobilePath: string;
  }>;
  readonly previewIntegrity: Readonly<Record<string, boolean>>;
  readonly evidenceBundle: Readonly<{ createOnly: boolean; rollbackSafe: boolean; candidateContentArtifactIncluded: boolean; allScreenshotsCandidateContentAndManifestPublishedTogether: boolean }>;
  readonly serverMutationPerformed: boolean; readonly deploymentMutationPerformed: boolean; readonly cloudinaryMutationPerformed: boolean; readonly browserDomPreviewMutationOnly: boolean;
}
export interface WorkHeaderPreviewAdmissionBuffers {
  readonly currentDesktop: Buffer; readonly candidateDesktop: Buffer; readonly currentMobile: Buffer; readonly candidateMobile: Buffer; readonly candidateContent: Buffer;
}
export interface WorkHeaderPreviewAdmissionResult {
  readonly contract: typeof WORK_HEADER_PREVIEW_ADMISSION_CONTRACT; readonly route: string; readonly candidateId: string; readonly candidateSrc: string;
  readonly candidateSourceUrlSha256: string; readonly candidateContentSha256: string; readonly candidateContentByteLength: number; readonly candidateContentArtifactPath: string;
  readonly naturalWidth: number; readonly naturalHeight: number; readonly screenshotHashesVerified: boolean; readonly candidateContentBytesVerified: boolean;
  readonly immutableCandidateContentArtifactVerified: boolean; readonly browserResponseBodyIdentityVerified: boolean; readonly browserResponseMetadataBound: boolean;
  readonly browserResponseBindings: Readonly<{ desktop: WorkHeaderBrowserResponseBinding; mobile: WorkHeaderBrowserResponseBinding }>;
  readonly responsiveSourceIdentityVerified: boolean; readonly browserOnlyPreviewVerified: boolean; readonly atomicEvidenceBundleVerified: boolean;
  readonly candidateRenderDifferenceVerified: boolean; readonly titleSubtitleIdentityVerified: boolean;
  readonly pageRenderPaths: Readonly<{ currentDesktopPath: string; candidateDesktopPath: string; currentMobilePath: string; candidateMobilePath: string }>;
  readonly publicationAllowed: false; readonly cloudOverwriteAllowed: false; readonly websiteMutationAllowed: false;
}

const sha256 = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex");
const textSha256 = (value: string): string => sha256(Buffer.from(value, "utf8"));
function captureByProfile(manifest: WorkHeaderCandidatePreviewManifest, profile: string): WorkHeaderPreviewCapture {
  const capture = manifest.captures.find((item) => item.profile === profile);
  if (!capture) throw new Error(`Candidate preview manifest is missing ${profile} capture evidence.`);
  return capture;
}
function verifyScreenshot(binding: WorkHeaderPreviewScreenshotBinding, buffer: Buffer, label: string): void {
  if (!binding || typeof binding.path !== "string" || !/^[0-9a-f]{64}$/u.test(binding.sha256) || !Number.isInteger(binding.bytes) || binding.bytes < 1) throw new Error(`${label} screenshot binding is malformed.`);
  if (!Buffer.isBuffer(buffer) || buffer.length < 1 || sha256(buffer) !== binding.sha256 || buffer.length !== binding.bytes) throw new Error(`${label} screenshot bytes do not match preview manifest SHA-256/length.`);
}
function verifyBrowserResponse(capture: WorkHeaderPreviewCapture, candidateSrc: string, sha: string, bytes: number): WorkHeaderBrowserResponseBinding {
  const response = capture.browserCandidateResponse;
  if (!response || response.url !== candidateSrc || response.sha256 !== sha || response.byteLength !== bytes) throw new Error(`${capture.profile} Chrome response-body identity does not match immutable candidate bytes.`);
  if (!Number.isFinite(response.status) || response.status < 200 || response.status >= 400 || !response.mimeType?.toLowerCase().startsWith("image/")) throw new Error(`${capture.profile} Chrome response metadata is invalid.`);
  if (response.encodedDataLength !== undefined && (!Number.isFinite(response.encodedDataLength) || response.encodedDataLength < 0)) throw new Error(`${capture.profile} Chrome encoded response length is invalid.`);
  return Object.freeze({
    url: response.url,
    status: response.status,
    mimeType: response.mimeType,
    sha256: response.sha256,
    byteLength: response.byteLength,
    protocol: response.protocol ?? null,
    fromDiskCache: response.fromDiskCache === true,
    fromServiceWorker: response.fromServiceWorker === true,
    encodedDataLength: Number(response.encodedDataLength ?? 0),
    bodyBase64EncodedByCdp: response.bodyBase64EncodedByCdp === true,
  });
}

export function admitWorkHeaderCandidatePreviewManifest(manifest: WorkHeaderCandidatePreviewManifest, buffers: WorkHeaderPreviewAdmissionBuffers): WorkHeaderPreviewAdmissionResult {
  if (!manifest || typeof manifest !== "object") throw new Error("Work-header candidate preview manifest is required.");
  if (manifest.contract !== WORK_HEADER_PREVIEW_CAPTURE_CONTRACT) throw new Error(`Unsupported Work-header preview contract ${JSON.stringify(manifest.contract)}.`);
  if (!/^\/work\/[a-z0-9-]+$/u.test(manifest.route)) throw new Error("Work-header preview route must be a Work detail route.");
  if (!manifest.candidateId?.trim() || !/^https?:\/\//u.test(manifest.candidateSrc)) throw new Error("Work-header preview candidate identity is invalid.");
  if (manifest.serverMutationPerformed !== false || manifest.deploymentMutationPerformed !== false || manifest.cloudinaryMutationPerformed !== false || manifest.browserDomPreviewMutationOnly !== true) throw new Error("Work-header preview manifest violated the browser-only non-destructive boundary.");
  if (manifest.evidenceBundle?.createOnly !== true || manifest.evidenceBundle?.rollbackSafe !== true || manifest.evidenceBundle?.candidateContentArtifactIncluded !== true || manifest.evidenceBundle?.allScreenshotsCandidateContentAndManifestPublishedTogether !== true) throw new Error("Work-header preview manifest does not prove one rollback-safe bundle containing screenshots, immutable candidate content and manifest.");

  const source = manifest.candidateSource;
  if (!source || source.requestedUrl !== manifest.candidateSrc || source.requestedUrlSha256 !== textSha256(manifest.candidateSrc)) throw new Error("Work-header preview candidate source identity digest is invalid.");
  if (source.resolvedSrcStableAcrossProfiles !== true || source.naturalDimensionsStableAcrossProfiles !== true || source.resolvedUrlDesktop !== manifest.candidateSrc || source.resolvedUrlMobile !== manifest.candidateSrc) throw new Error("Work-header preview responsive candidate source identity is not stable.");
  if (!Number.isInteger(source.naturalWidth) || source.naturalWidth < 1 || !Number.isInteger(source.naturalHeight) || source.naturalHeight < 1) throw new Error("Work-header preview candidate natural dimensions are invalid.");
  if (!/^[0-9a-f]{64}$/u.test(source.contentSha256) || !Number.isInteger(source.contentByteLength) || source.contentByteLength < 1 || !source.contentType?.toLowerCase().startsWith("image/") || source.contentStableAcrossCapture !== true) throw new Error("Work-header preview candidate response-byte provenance is invalid.");

  const artifact = manifest.candidateContentArtifact;
  if (!artifact || typeof artifact.path !== "string" || !artifact.path || artifact.sha256 !== source.contentSha256 || artifact.bytes !== source.contentByteLength || artifact.contentType !== source.contentType || artifact.immutableEvidence !== true) throw new Error("Work-header preview immutable candidate-content artifact binding is invalid.");
  if (!Buffer.isBuffer(buffers.candidateContent) || buffers.candidateContent.length < 1 || sha256(buffers.candidateContent) !== artifact.sha256 || buffers.candidateContent.length !== artifact.bytes) throw new Error("Work-header preview immutable candidate-content artifact bytes changed after capture.");

  const browserIdentity = manifest.browserCandidateResponseIdentity;
  if (!browserIdentity || browserIdentity.desktopSha256 !== source.contentSha256 || browserIdentity.mobileSha256 !== source.contentSha256 || browserIdentity.desktopByteLength !== source.contentByteLength || browserIdentity.mobileByteLength !== source.contentByteLength || browserIdentity.matchesImmutableCandidateArtifact !== true || browserIdentity.stableAcrossProfiles !== true) throw new Error("Work-header preview browser response-body identity is invalid or does not match immutable candidate bytes.");

  const desktop = captureByProfile(manifest, "desktop");
  const mobile = captureByProfile(manifest, "mobile");
  for (const capture of [desktop, mobile]) {
    if (capture.candidateRenderChanged !== true || capture.titleTextStable !== true || capture.subtitleTextStable !== true) throw new Error(`${capture.profile} preview failed candidate-render/title identity checks.`);
    if (capture.candidateResolvedSrcMatchesRequested !== true || capture.candidateResolvedSrc !== manifest.candidateSrc) throw new Error(`${capture.profile} preview resolved an unexpected candidate source.`);
    if (capture.candidateHeader?.naturalWidth !== source.naturalWidth || capture.candidateHeader?.naturalHeight !== source.naturalHeight) throw new Error(`${capture.profile} preview candidate dimensions drift from source identity.`);
  }
  const desktopBrowserResponse = verifyBrowserResponse(desktop, manifest.candidateSrc, source.contentSha256, source.contentByteLength);
  const mobileBrowserResponse = verifyBrowserResponse(mobile, manifest.candidateSrc, source.contentSha256, source.contentByteLength);
  verifyScreenshot(desktop.currentScreenshot, buffers.currentDesktop, "desktop current");
  verifyScreenshot(desktop.candidateScreenshot, buffers.candidateDesktop, "desktop candidate");
  verifyScreenshot(mobile.currentScreenshot, buffers.currentMobile, "mobile current");
  verifyScreenshot(mobile.candidateScreenshot, buffers.candidateMobile, "mobile candidate");

  const integrity = manifest.previewIntegrity ?? {};
  for (const key of ["desktopCandidateRenderChanged", "mobileCandidateRenderChanged", "titleTextStableAcrossSubstitution", "subtitleTextStableAcrossSubstitution", "candidateResolvedSrcMatchesRequested", "candidateResolvedSrcStableAcrossProfiles", "candidateNaturalDimensionsStableAcrossProfiles", "candidateContentSha256AndLengthBound", "candidateContentStableAcrossCapture", "immutableCandidateContentArtifactPublished", "browserResponseBodyCapturedOnEveryProfile", "browserResponseBodyMatchesImmutableCandidateArtifact", "browserResponseBodyStableAcrossProfiles", "atomicEvidenceBundlePublished"]) if (integrity[key] !== true) throw new Error(`Work-header preview integrity flag ${key} is not verified.`);

  const input = manifest.pageRenderReviewInput;
  if (!input || input.pageSlug !== manifest.route || input.candidateId !== manifest.candidateId) throw new Error("Work-header page-render input identity does not match preview manifest.");
  if (input.candidateContentSha256 !== source.contentSha256 || input.candidateContentByteLength !== source.contentByteLength || input.candidateContentArtifactPath !== artifact.path) throw new Error("Work-header page-render candidate-byte/artifact binding does not match preview evidence.");
  if (input.browserCandidateResponseSha256 !== source.contentSha256 || input.browserCandidateResponseByteLength !== source.contentByteLength) throw new Error("Work-header page-render browser-response binding does not match preview evidence.");
  if (input.currentDesktopPath !== desktop.currentScreenshot.path || input.candidateDesktopPath !== desktop.candidateScreenshot.path || input.currentMobilePath !== mobile.currentScreenshot.path || input.candidateMobilePath !== mobile.candidateScreenshot.path) throw new Error("Work-header page-render paths do not match preview screenshot evidence.");

  return Object.freeze({
    contract: WORK_HEADER_PREVIEW_ADMISSION_CONTRACT, route: manifest.route, candidateId: manifest.candidateId, candidateSrc: manifest.candidateSrc,
    candidateSourceUrlSha256: source.requestedUrlSha256, candidateContentSha256: source.contentSha256, candidateContentByteLength: source.contentByteLength,
    candidateContentArtifactPath: artifact.path, naturalWidth: source.naturalWidth, naturalHeight: source.naturalHeight,
    screenshotHashesVerified: true, candidateContentBytesVerified: true, immutableCandidateContentArtifactVerified: true,
    browserResponseBodyIdentityVerified: true, browserResponseMetadataBound: true,
    browserResponseBindings: Object.freeze({ desktop: desktopBrowserResponse, mobile: mobileBrowserResponse }),
    responsiveSourceIdentityVerified: true, browserOnlyPreviewVerified: true, atomicEvidenceBundleVerified: true,
    candidateRenderDifferenceVerified: true, titleSubtitleIdentityVerified: true,
    pageRenderPaths: Object.freeze({ currentDesktopPath: desktop.currentScreenshot.path, candidateDesktopPath: desktop.candidateScreenshot.path, currentMobilePath: mobile.currentScreenshot.path, candidateMobilePath: mobile.candidateScreenshot.path }),
    publicationAllowed: false, cloudOverwriteAllowed: false, websiteMutationAllowed: false,
  });
}
