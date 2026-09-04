import { compileFxResidueArtWorkOrder, sha256Canonical } from './fx-residue-art-work-order-lib.mjs';

function handoff(overrides = {}) {
  const base = {
    format: 'evavo.fx-residue-handoff/v1',
    authority: 'candidate_instruction_only',
    sourceKind: 'impact',
    sourceStudio: 'particle-studio',
    residueStudio: 'evavo-art-studio',
    materialStudio: 'evavo-texture-studio',
    residueFamily: 'bullet-hole-plaster',
    surfaceFamily: 'plaster',
    persistent: true,
    residue: {
      scale: 1.05,
      rotationDegrees: 17,
      spread: 0.74,
      glossInitial: null,
      glossDry: null,
      drySeconds: null,
      wickStrength: null,
      runoffStrength: null,
    },
    requiredQa: ['material-match','scale-plausibility','edge-integration','source-event-lineage'],
    sourceSha256: 'a'.repeat(64),
    ...overrides,
  };
  const { handoffSha256: _ignored, ...withoutDigest } = base;
  return { ...withoutDigest, handoffSha256: sha256Canonical(withoutDigest) };
}

const impact = compileFxResidueArtWorkOrder(handoff());
if (impact.subject.residueFamily !== 'bullet-hole-plaster') throw new Error('impact family mismatch');
if (!impact.tasks.some((task) => task.id === 'edge-integration')) throw new Error('impact edge-integration task missing');
if (impact.delivery.status !== 'candidate') throw new Error('impact must remain candidate');
if (impact.authorityBoundary.mayPublish !== false) throw new Error('publication authority boundary missing');
if (!/^[a-f0-9]{64}$/.test(impact.workOrderSha256)) throw new Error('impact work order digest invalid');

const splatter = compileFxResidueArtWorkOrder(handoff({
  sourceKind: 'splatter',
  residueFamily: 'blood-splatter',
  surfaceFamily: 'stone',
  residue: {
    scale: 0.88,
    rotationDegrees: -28,
    spread: 0.82,
    glossInitial: 0.88,
    glossDry: 0.2,
    drySeconds: 95,
    wickStrength: 0.42,
    runoffStrength: 0.24,
  },
}));
if (!splatter.tasks.some((task) => task.id === 'wet-dry-variants')) throw new Error('splatter wet-dry task missing');
if (splatter.subject.glossInitial !== 0.88) throw new Error('splatter gloss evidence lost');

let rejected = false;
try {
  compileFxResidueArtWorkOrder({ ...handoff(), handoffSha256: '0'.repeat(64) });
} catch (error) {
  rejected = String(error).includes('handoffSha256 mismatch');
}
if (!rejected) throw new Error('tampered handoff was not rejected');

rejected = false;
try {
  compileFxResidueArtWorkOrder(handoff({ residueStudio: 'some-other-studio' }));
} catch (error) {
  rejected = String(error).includes('not addressed to Art Studio');
}
if (!rejected) throw new Error('wrong receiver was not rejected');

console.log(JSON.stringify({ ok: true, gate: 'evavo-fx-residue-art-work-order-v1' }));
