import { createHash } from "node:crypto";

export const WORK_HEADER_PREVIEW_ADMISSION_CONTRACT = "evavo.work-header-preview-admission.v1" as const;
export const WORK_HEADER_PREVIEW_CAPTURE_CONTRACT = "evavo.work-header-candidate-preview-capture.v3" as const;

export interface WorkHeaderPreviewScreenshotBinding {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface WorkHeaderPreviewCapture {
  readonly profile: string;
  readonly candidateRenderChanged: boolean;
  readonly titleTextStable: boolean;
  readonly subtitleTextStable: boolean;
  readonly candidateResolvedSrc: string;
  readonly candidateResolvedSrcMatchesRequested: boolean;
  readonly candidateHeader: Readonly<{ naturalWidth: number; naturalHeight: number }>;
  readonly currentScreenshot: WorkHeaderPreviewScreenshotBinding;
  readonly candidateScreenshot: WorkHeaderPreviewScreenshotBinding;
}

export interface WorkHeaderCandidatePreviewManifest {
  readonly contract: string;
  readonly route: string;
  readonly candidateId: string;
  readonly candidateSrc: string;
  readonly candidateSource: Readonly<{
    requestedUrl: string;
    requestedUrlSha256: string;
    resolvedUrlDesktop: string;
    resolvedUrlMobile: string;
    resolvedSrcStableAcrossProfiles: boolean;
    naturalWidth: number;
    naturalHeight: number;
    naturalDimensionsStableAcrossProfiles: boolean;
  }>;
  readonly captures: readonly WorkHeaderPreviewCapture[];
  readonly pageRenderReviewInput: Readonly<{
    pageSlug: string;
    candidateId: string;
    currentDesktopPath: string;
    candidateDesktopPath: string;
    currentMobilePath: string;
    candidateMobilePath: string;
  }>;
  readonly previewIntegrity: Readonly<Record<string, boolean>>;
  readonly serverMutationPerformed: boolean;
  readonly deploymentMutationPerformed: boolean;
  readonly cloudinaryMutationPerformed: boolean;
  readonly browserDomPreviewMutationOnly: boolean;
}

export interface WorkHeaderPreviewAdmissionBuffers {
  readonly currentDesktop: Buffer;
  readonly candidateDesktop: Buffer;
  readonly currentMobile: Buffer;
  readonly candidateMobile: Buffer;
}

export interface WorkHeaderPreviewAdmissionResult {
  readonly contract: typeof WORK_HEADER_PREVIEW_ADMISSION_CONTRACT;
  readonly route: string;
  readonly candidateId: string;
  readonly candidateSrc: string;
  readonly candidateSourceUrlSha256: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly screenshotHashesVerified: boolean;
  readonly responsiveSourceIdentityVerified: boolean;
  readonly browserOnlyPreviewVerified: boolean;
  readonly candidateRenderDifferenceVerified: boolean;
  readonly titleSubtitleIdentityVerified: boolean;
  readonly pageRenderPaths: Readonly<{
    currentDesktopPath: string;
    candidateDesktopPath: string;
    currentMobilePath: string;
    candidateMobilePath: string;
  }>;
  readonly publicationAllowed: false;
  readonly cloudOverwriteAllowed: false;
  readonly websiteMutationAllowed: false;
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function textSha256(value: string): string {
  return sha256(Buffer.from(value, "utf8"));
}

function captureByProfile(manifest: WorkHeaderCandidatePreviewManifest, profile: string): WorkHeaderPreviewCapture {
  const capture = manifest.captures.find((item) => item.profile === profile);
  if (!capture) throw new Error(`Candidate preview manifest is missing ${profile} capture evidence.`);
  return capture;
}

function verifyScreenshot(binding: WorkHeaderPreviewScreenshotBinding, buffer: Buffer, label: string): void {
  if (!binding || typeof binding.path !== "string" || !/^[0-9a-f]{64}$/u.test(binding.sha256)) throw new Error(`${label} screenshot binding is malformed.`);
  if (!Buffer.isBuffer(buffer) || buffer.length < 1) throw new Error(`${label} screenshot bytes are required.`);
  if (sha256(buffer) !== binding.sha256) throw new Error(`${label} screenshot bytes do not match preview manifest SHA-256.`);
  if (buffer.length !== binding.bytes) throw new Error(`${label} screenshot byte length does not match preview manifest.`);
}

export function admitWorkHeaderCandidatePreviewManifest(
  manifest: WorkHeaderCandidatePreviewManifest,
  buffers: WorkHeaderPreviewAdmissionBuffers,
): WorkHeaderPreviewAdmissionResult {
  if (!manifest || typeof manifest !== "object") throw new Error("Work-header candidate preview manifest is required.");
  if (manifest.contract !== WORK_HEADER_PREVIEW_CAPTURE_CONTRACT) throw new Error(`Unsupported Work-header preview contract ${JSON.stringify(manifest.contract)}.`);
  if (!/^\/work\/[a-z0-9-]+$/u.test(manifest.route)) throw new Error("Work-header preview route must be a Work detail route.");
  if (!manifest.candidateId?.trim()) throw new Error("Work-header preview candidateId is required.");
  if (!/^https?:\/\//u.test(manifest.candidateSrc)) throw new Error("Work-header preview candidateSrc must be an absolute http/https URL.");
  if (manifest.serverMutationPerformed !== false || manifest.deploymentMutationPerformed !== false || manifest.cloudinaryMutationPerformed !== false || manifest.browserDomPreviewMutationOnly !== true) {
    throw new Error("Work-header preview manifest violated the browser-only non-destructive boundary.");
  }

  const source = manifest.candidateSource;
  if (!source || source.requestedUrl !== manifest.candidateSrc || source.requestedUrlSha256 !== textSha256(manifest.candidateSrc)) throw new Error("Work-header preview candidate source identity digest is invalid.");
  if (source.resolvedSrcStableAcrossProfiles !== true || source.naturalDimensionsStableAcrossProfiles !== true) throw new Error("Work-header preview candidate source/dimensions are not stable across responsive profiles.");
  if (!Number.isInteger(source.naturalWidth) || source.naturalWidth < 1 || !Number.isInteger(source.naturalHeight) || source.naturalHeight < 1) throw new Error("Work-header preview candidate natural dimensions are invalid.");
  if (source.resolvedUrlDesktop !== manifest.candidateSrc || source.resolvedUrlMobile !== manifest.candidateSrc) throw new Error("Work-header preview resolved URL does not match requested candidate source on every profile.");

  const desktop = captureByProfile(manifest, "desktop");
  const mobile = captureByProfile(manifest, "mobile");
  for (const capture of [desktop, mobile]) {
    if (capture.candidateRenderChanged !== true) throw new Error(`${capture.profile} preview does not prove the candidate changed the page render.`);
    if (capture.titleTextStable !== true || capture.subtitleTextStable !== true) throw new Error(`${capture.profile} preview changed title/subtitle text during image substitution.`);
    if (capture.candidateResolvedSrcMatchesRequested !== true || capture.candidateResolvedSrc !== manifest.candidateSrc) throw new Error(`${capture.profile} preview resolved an unexpected candidate source.`);
    if (capture.candidateHeader?.naturalWidth !== source.naturalWidth || capture.candidateHeader?.naturalHeight !== source.naturalHeight) throw new Error(`${capture.profile} preview candidate dimensions drift from manifest source identity.`);
  }

  verifyScreenshot(desktop.currentScreenshot, buffers.currentDesktop, "desktop current");
  verifyScreenshot(desktop.candidateScreenshot, buffers.candidateDesktop, "desktop candidate");
  verifyScreenshot(mobile.currentScreenshot, buffers.currentMobile, "mobile current");
  verifyScreenshot(mobile.candidateScreenshot, buffers.candidateMobile, "mobile candidate");

  const integrity = manifest.previewIntegrity ?? {};
  for (const key of [
    "desktopCandidateRenderChanged",
    "mobileCandidateRenderChanged",
    "titleTextStableAcrossSubstitution",
    "subtitleTextStableAcrossSubstitution",
    "candidateResolvedSrcMatchesRequested",
    "candidateResolvedSrcStableAcrossProfiles",
    "candidateNaturalDimensionsStableAcrossProfiles",
  ]) {
    if (integrity[key] !== true) throw new Error(`Work-header preview integrity flag ${key} is not verified.`);
  }

  const input = manifest.pageRenderReviewInput;
  if (!input || input.pageSlug !== manifest.route || input.candidateId !== manifest.candidateId) throw new Error("Work-header page-render input identity does not match preview manifest.");
  if (input.currentDesktopPath !== desktop.currentScreenshot.path || input.candidateDesktopPath !== desktop.candidateScreenshot.path || input.currentMobilePath !== mobile.currentScreenshot.path || input.candidateMobilePath !== mobile.candidateScreenshot.path) {
    throw new Error("Work-header page-render input paths do not match preview screenshot evidence.");
  }

  return Object.freeze({
    contract: WORK_HEADER_PREVIEW_ADMISSION_CONTRACT,
    route: manifest.route,
    candidateId: manifest.candidateId,
    candidateSrc: manifest.candidateSrc,
    candidateSourceUrlSha256: source.requestedUrlSha256,
    naturalWidth: source.naturalWidth,
    naturalHeight: source.naturalHeight,
    screenshotHashesVerified: true,
    responsiveSourceIdentityVerified: true,
    browserOnlyPreviewVerified: true,
    candidateRenderDifferenceVerified: true,
    titleSubtitleIdentityVerified: true,
    pageRenderPaths: Object.freeze({
      currentDesktopPath: desktop.currentScreenshot.path,
      candidateDesktopPath: desktop.candidateScreenshot.path,
      currentMobilePath: mobile.currentScreenshot.path,
      candidateMobilePath: mobile.candidateScreenshot.path,
    }),
    publicationAllowed: false,
    cloudOverwriteAllowed: false,
    websiteMutationAllowed: false,
  });
}
