import crypto from 'node:crypto';

export const FX_REVIEWED_RESIDUE_MASK_HANDOFF_FORMAT = 'evavo.fx-reviewed-residue-mask-handoff/v1';

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function digest(value) { return crypto.createHash('sha256').update(stable(value)).digest('hex'); }
function isSha(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function fail(message) { throw new Error(`fx-reviewed-residue-mask: ${message}`); }

export function compileReviewedResidueMaskHandoff(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('input must be object');
  for (const field of ['sourceResidueHandoffSha256', 'vectorCandidateSha256', 'masteringPlanSha256', 'pngSha256', 'reviewEvidenceSha256']) {
    if (!isSha(input[field])) fail(`${field} invalid`);
  }
  if (input.reviewStatus !== 'independently-reviewed') fail('independent review is required');
  if (typeof input.pngPath !== 'string' || !input.pngPath.endsWith('.png') || input.pngPath.includes('..')) fail('pngPath must be canonical PNG path');
  if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 16 || input.height < 16 || input.width > 8192 || input.height > 8192) fail('dimensions invalid');
  if (input.alphaAnalysis?.meaningfulTransparency !== true) fail('meaningful transparency evidence is required');
  if (input.alphaAnalysis?.paintedCheckerboardDetected !== false) fail('painted checkerboard must be explicitly absent');
  if (input.edgeReview?.passed !== true || input.substrateIntegrationReview?.passed !== true) fail('edge and substrate integration reviews must pass');
  const withoutDigest = {
    format: FX_REVIEWED_RESIDUE_MASK_HANDOFF_FORMAT,
    authority: 'reviewed_mask_evidence_only',
    sourceResidueHandoffSha256: input.sourceResidueHandoffSha256,
    vectorCandidateSha256: input.vectorCandidateSha256,
    masteringPlanSha256: input.masteringPlanSha256,
    png: {
      path: input.pngPath,
      sha256: input.pngSha256,
      width: input.width,
      height: input.height,
      alphaMode: 'straight',
      meaningfulTransparency: true,
      paintedCheckerboardDetected: false,
    },
    review: {
      status: 'independently-reviewed',
      evidenceSha256: input.reviewEvidenceSha256,
      edgeReviewPassed: true,
      substrateIntegrationReviewPassed: true,
    },
    receiver: {
      studio: 'evavo-texture-studio',
      purpose: 'bind-reviewed-residue-shape-mask-to-material-response',
    },
    authorityBoundary: {
      mayApproveTextureMaterial: false,
      mayPublish: false,
      materialResponseRemainsTextureStudioAuthority: true,
      maskShapeRemainsArtStudioAuthority: true,
    },
  };
  return { ...withoutDigest, handoffSha256: digest(withoutDigest) };
}

export function validateReviewedResidueMaskHandoff(value) {
  if (!value || value.format !== FX_REVIEWED_RESIDUE_MASK_HANDOFF_FORMAT) fail('format mismatch');
  if (!isSha(value.handoffSha256)) fail('handoffSha256 missing');
  const without = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'handoffSha256'));
  if (digest(without) !== value.handoffSha256) fail('handoffSha256 mismatch');
  if (value.authority !== 'reviewed_mask_evidence_only') fail('authority mismatch');
  if (value.receiver?.studio !== 'evavo-texture-studio') fail('receiver mismatch');
  if (value.review?.status !== 'independently-reviewed') fail('review evidence missing');
  if (value.png?.meaningfulTransparency !== true || value.png?.paintedCheckerboardDetected !== false) fail('alpha evidence invalid');
  return structuredClone(value);
}
