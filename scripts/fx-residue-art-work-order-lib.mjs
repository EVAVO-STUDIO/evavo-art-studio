import { createHash } from 'node:crypto';

export const FX_RESIDUE_HANDOFF_FORMAT = 'evavo.fx-residue-handoff/v1';
export const FX_RESIDUE_ART_WORK_ORDER_FORMAT = 'evavo.fx-residue-art-work-order/v1';

function fail(message) {
  throw new Error(`fx-residue-art-work-order: ${message}`);
}

function canonicalize(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('non-finite number');
    if (Object.is(value, -0)) return '0';
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (!value || typeof value !== 'object') fail(`unsupported value type: ${typeof value}`);
  const entries = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`);
  return `{${entries.join(',')}}`;
}

export function sha256Canonical(value) {
  return createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}

function boundedNumber(value, name, min, max, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(`${name} must be between ${min} and ${max}`);
  }
  return value;
}

function boundedText(value, name, min = 1, max = 128) {
  if (typeof value !== 'string' || value.length < min || value.length > max) fail(`${name} invalid`);
  return value;
}

export function validateFxResidueHandoff(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('handoff must be object');
  if (input.format !== FX_RESIDUE_HANDOFF_FORMAT) fail('unexpected format');
  if (input.authority !== 'candidate_instruction_only') fail('handoff authority must remain candidate_instruction_only');
  if (!['impact', 'splatter'].includes(input.sourceKind)) fail('sourceKind must be impact or splatter');
  if (input.sourceStudio !== 'particle-studio') fail('sourceStudio must be particle-studio');
  if (input.residueStudio !== 'evavo-art-studio') fail('handoff is not addressed to Art Studio');
  if (input.materialStudio !== 'evavo-texture-studio') fail('materialStudio mismatch');
  if (input.persistent !== true) fail('residue handoff must be persistent');
  boundedText(input.residueFamily, 'residueFamily');
  boundedText(input.surfaceFamily, 'surfaceFamily');
  if (!input.residue || typeof input.residue !== 'object') fail('residue block missing');
  boundedNumber(input.residue.scale, 'residue.scale', 0.01, 32);
  boundedNumber(input.residue.rotationDegrees, 'residue.rotationDegrees', -360, 360);
  boundedNumber(input.residue.spread, 'residue.spread', 0, 4);
  boundedNumber(input.residue.glossInitial, 'residue.glossInitial', 0, 1, true);
  boundedNumber(input.residue.glossDry, 'residue.glossDry', 0, 1, true);
  boundedNumber(input.residue.drySeconds, 'residue.drySeconds', 0.01, 86_400, true);
  boundedNumber(input.residue.wickStrength, 'residue.wickStrength', 0, 1, true);
  boundedNumber(input.residue.runoffStrength, 'residue.runoffStrength', 0, 1, true);
  if (!Array.isArray(input.requiredQa) || input.requiredQa.length === 0 || input.requiredQa.length > 32) fail('requiredQa invalid');
  for (const item of input.requiredQa) boundedText(item, 'requiredQa item', 1, 96);
  if (typeof input.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.sourceSha256)) fail('sourceSha256 invalid');
  if (typeof input.handoffSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.handoffSha256)) fail('handoffSha256 invalid');
  const { handoffSha256, ...withoutDigest } = input;
  const actual = sha256Canonical(withoutDigest);
  if (actual !== handoffSha256) fail(`handoffSha256 mismatch: expected ${actual}`);
  return structuredClone(input);
}

function impactTasks(handoff) {
  const family = handoff.residueFamily;
  const surface = handoff.surfaceFamily;
  return [
    { id: 'decal-master', role: 'author-decoded-decal', instruction: `Author one ${family} decal appropriate to ${surface}; preserve source scale, rotation and material-specific damage language.` },
    { id: 'edge-integration', role: 'edge-and-alpha-mastering', instruction: 'Create true-alpha edges with no painted checkerboard, matte halo or floating debris; preserve chips/cracks only where supported by the substrate.' },
    { id: 'hostile-proof', role: 'proof-render', instruction: 'Render the candidate on light, dark and high-chroma hostile backgrounds plus a substrate-colour proof to expose bad alpha or implausible edge integration.' },
  ];
}

function splatterTasks(handoff) {
  return [
    { id: 'residue-master', role: 'author-decoded-decal', instruction: `Author one ${handoff.residueFamily} residue decal for ${handoff.surfaceFamily}, retaining the governed spread and source-event direction rather than inventing an unrelated splash.` },
    { id: 'wet-dry-variants', role: 'state-variant-mastering', instruction: 'Produce candidate wet and dry state variants when gloss/dry evidence is present; do not bake material response that belongs to Texture Studio into opaque colour alone.' },
    { id: 'gravity-surface-proof', role: 'proof-render', instruction: 'Review gravity direction, wicking/runoff edge behaviour and contact with the receiving surface; reject floating, mirrored or physically contradictory residue.' },
    { id: 'hostile-proof', role: 'proof-render', instruction: 'Render light/dark/high-chroma alpha proofs and a substrate-context proof before any promotion.' },
  ];
}

export function compileFxResidueArtWorkOrder(input) {
  const handoff = validateFxResidueHandoff(input);
  const tasks = handoff.sourceKind === 'impact' ? impactTasks(handoff) : splatterTasks(handoff);
  const withoutDigest = {
    format: FX_RESIDUE_ART_WORK_ORDER_FORMAT,
    authority: 'candidate_work_order_only',
    source: {
      studio: handoff.sourceStudio,
      handoffSha256: handoff.handoffSha256,
      sourceSha256: handoff.sourceSha256,
      sourceKind: handoff.sourceKind,
    },
    subject: {
      residueFamily: handoff.residueFamily,
      surfaceFamily: handoff.surfaceFamily,
      scale: handoff.residue.scale,
      rotationDegrees: handoff.residue.rotationDegrees,
      spread: handoff.residue.spread,
      glossInitial: handoff.residue.glossInitial,
      glossDry: handoff.residue.glossDry,
      drySeconds: handoff.residue.drySeconds,
      wickStrength: handoff.residue.wickStrength,
      runoffStrength: handoff.residue.runoffStrength,
    },
    tasks,
    requiredQa: [...new Set([
      ...handoff.requiredQa,
      'true-alpha-proof',
      'halo-check',
      'surface-contact-plausibility',
      'source-event-lineage',
    ])],
    delivery: {
      master: 'true-alpha-png',
      mask: 'lossless-mask-png',
      proof: 'hostile-background-proof',
      status: 'candidate',
      atlasEligibleAfterApproval: true,
    },
    authorityBoundary: {
      mayApproveSourceEvent: false,
      mayApproveOwnCandidateAutomatically: false,
      mayPublish: false,
      mayMutateDownstreamSceneAutomatically: false,
      materialResponseRemainsTextureStudioAuthority: true,
    },
  };
  return { ...withoutDigest, workOrderSha256: sha256Canonical(withoutDigest) };
}
