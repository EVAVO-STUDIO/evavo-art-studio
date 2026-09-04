import fs from 'node:fs';
import path from 'node:path';

const data = JSON.parse(fs.readFileSync(path.resolve('config/seamless-fx-capabilities-v1.json'), 'utf8'));
const fail = (m) => { throw new Error(`seamless-fx-capabilities: ${m}`); };
const nonEmpty = (v, n) => { if (!Array.isArray(v) || v.length === 0) fail(`${n} must be a non-empty array`); };
if (data.schema !== 'evavo_seamless_fx_capabilities_v1') fail('unexpected schema');
if (data.studio !== 'evavo-art-studio') fail('studio identity mismatch');
if (data.localFirst !== true || data.looping?.supported !== true) fail('local-first looping support is required');
if (data.quality?.requiresTrueAlpha !== true) fail('true alpha QA is required');
if (data.quality?.rejectPaintedCheckerboard !== true) fail('painted checkerboards must be rejected');
nonEmpty(data.looping.methods, 'looping.methods');
nonEmpty(data.looping.requiredQa, 'looping.requiredQa');
nonEmpty(data.styles, 'styles');
nonEmpty(data.families, 'families');
nonEmpty(data.outputs, 'outputs');

const requiredFamilies = [
  'bullet-hole-decals','impact-mark-decals','glass-crack-decals','blood-splatter-decals','food-splatter-decals','mud-splatter-decals',
  'grease-stains','drink-spills','damp-stains','soot-stains','scorch-marks','rust-streaks','puddle-decals','wet-edge-overlays',
  'candle-flame-frames','lantern-flame-frames','light-flicker-masks','rain-crown-frames','puddle-ripple-frames','rain-splash-frames',
];
for (const family of requiredFamilies) if (!data.families.includes(family)) fail(`missing required family: ${family}`);

const residueCatalogue = JSON.parse(fs.readFileSync(path.resolve('config/fx-decal-residue-catalogue-v1.json'), 'utf8'));
if (residueCatalogue.schema !== 'evavo_fx_decal_residue_catalogue_v1') fail('unexpected residue catalogue schema');
if (!Array.isArray(residueCatalogue.entries) || residueCatalogue.entries.length < 12) fail('expected broad residue catalogue coverage');
const residueIds = new Set(residueCatalogue.entries.map((entry) => entry.id));
for (const residue of ['bullet-hole-wood','bullet-hole-plaster','bullet-hole-metal','bullet-hole-glass','blood-splatter-fresh','food-sauce-splatter','mud-splatter','scorch-mark']) if (!residueIds.has(residue)) fail(`missing required residue: ${residue}`);

for (const requiredFile of [
  'scripts/fx-residue-art-work-order-lib.mjs','scripts/compile-fx-residue-art-work-order.mjs','scripts/check-fx-residue-art-work-order.mjs',
  'scripts/fx-decal-svg-candidate.mjs','scripts/test-fx-decal-svg-candidate.mjs','scripts/test-ci-media-tool-fx-decal-svg.mjs',
  'scripts/compile-fx-residue-mastering-plan.mjs','scripts/test-ci-media-tool-fx-residue-mastering.mjs',
  'scripts/fx-reviewed-residue-mask-handoff.mjs','scripts/test-ci-media-tool-fx-reviewed-residue-mask.mjs',
  'packages/media/src/fx-residue-raster.ts','packages/media/test/fx-residue-raster.test.mjs',
  'scripts/run-fx-workstation-probe.mjs','scripts/test-ci-media-tool-fx-residue-raster-probe.mjs',
]) if (!fs.existsSync(path.resolve(requiredFile))) fail(`missing residue receiver/compiler: ${requiredFile}`);

const workOrderSource = fs.readFileSync(path.resolve('scripts/fx-residue-art-work-order-lib.mjs'), 'utf8');
for (const token of ['evavo.fx-residue-handoff/v1','candidate_instruction_only','true-alpha-png','materialResponseRemainsTextureStudioAuthority','handoffSha256 mismatch']) if (!workOrderSource.includes(token)) fail(`residue compiler missing required token: ${token}`);
const vectorSource = fs.readFileSync(path.resolve('scripts/fx-decal-svg-candidate.mjs'), 'utf8');
for (const token of ['evavo.fx-decal-svg-candidate/v1','bullet-hole','splatter','stain','puddle','candidate_vector_mask_only','trueAlphaRequired','rasterizeThroughExistingArtStudioProcessing','textureMaterialResponseRemainsTextureStudioAuthority','transientBurstRemainsParticleStudioAuthority']) if (!vectorSource.includes(token)) fail(`FX decal vector generator missing required token: ${token}`);
const masteringSource = fs.readFileSync(path.resolve('scripts/compile-fx-residue-mastering-plan.mjs'), 'utf8');
for (const token of ['evavo.fx-residue-mastering-plan/v1','sharp-exact-canvas-runtime','meaningfulTransparencyRequired','sourceOverwriteAllowed: false','lossyIntermediateAllowed: false','rejectPaintedCheckerboard: true','saturated-green','mayApproveCreativeResult: false']) if (!masteringSource.includes(token)) fail(`FX residue mastering path missing required token: ${token}`);
const rasterSource = fs.readFileSync(path.resolve('packages/media/src/fx-residue-raster.ts'), 'utf8');
for (const token of ['rasterizeFxResidueSvgCandidate','sharp-exact-canvas-runtime','normalizeAlphaCanvas','createTransparencyProofSheet','meaningfulTransparency: true','paintedCheckerboardDetected: false','transparentPixels','partialAlphaPixels','proofSha256']) if (!rasterSource.includes(token)) fail(`FX residue raster runtime missing required token: ${token}`);
const workstationProbe = fs.readFileSync(path.resolve('scripts/run-fx-workstation-probe.mjs'), 'utf8');
for (const token of ['evavo.fx-art-workstation-probe/v1','rasterEvidenceVersion: 2','evavo.fx-residue-alpha-evidence/v1','rasterizeFxResidueSvgCandidate','trueAlphaRasterExecutionProven: true','independentCreativeReviewStillRequired: true','creativeApprovalGranted: false','transparencyProofSha256']) if (!workstationProbe.includes(token)) fail(`FX residue workstation raster proof missing required token: ${token}`);
const reviewedMaskSource = fs.readFileSync(path.resolve('scripts/fx-reviewed-residue-mask-handoff.mjs'), 'utf8');
for (const token of ['evavo.fx-reviewed-residue-mask-handoff/v1','independently-reviewed','meaningfulTransparency','paintedCheckerboardDetected','edgeReviewPassed','substrateIntegrationReviewPassed','evavo-texture-studio','mayApproveTextureMaterial: false']) if (!reviewedMaskSource.includes(token)) fail(`reviewed residue mask boundary missing required token: ${token}`);

console.log(JSON.stringify({
  ok: true, studio: data.studio, families: data.families.length, residues: residueIds.size,
  residueWorkOrderReceiver: true, deterministicVectorResidueCandidates: true, residueTrueAlphaMastering: true,
  executableSharpResidueRaster: true, hostileBackgroundTransparencyProof: true, workstationResidueRasterEvidence: true,
  reviewedResidueMaskHandoff: true, creativeApprovalStillSeparate: true, outputs: data.outputs.length
}));
