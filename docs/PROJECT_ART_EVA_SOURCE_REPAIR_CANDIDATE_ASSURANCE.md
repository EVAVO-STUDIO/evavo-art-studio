# Project Art EVA source-repair candidate assurance

This boundary validates the five exact EVA hand-repair masks before provider dispatch and validates each returned repair candidate before alpha mastering, creative review, promotion or Runtime activation.

It solves two independent risks:

- a mask that is nominally attached to the correct job but edits face, hair, torso, wardrobe, background or a canvas edge;
- a provider candidate that repairs a hand while silently repainting protected pixels elsewhere.

The five immutable source frames are 1024 x 1536, non-interlaced, 8-bit RGB PNGs with opaque black backgrounds. Therefore source repair and production alpha mastering are separate phases. Requiring transparent background pixels during a hands-only source repair would contradict exact invariance outside the mask. The provider contract uses `target.transparency: opaque` and `background.strategy: opaque-source` for only these five redraws, while still requiring an 8-bit RGBA candidate. The derived in-between and ordinary final-pass work retain the normal native-alpha contract.

## Canonical mask contract

Each mask must be one 1024 x 1536, non-interlaced, 8-bit RGBA PNG. Only two pixel values are valid:

- transparent black `(0, 0, 0, 0)` is protected;
- opaque white `(255, 255, 255, 255)` is editable.

Grey, partial alpha and hidden RGB under zero alpha are rejected. The editable set must have exactly two 4-connected components: one inside the reviewed left-hand envelope and one inside the reviewed right-hand envelope for the exact frame ID. Components outside those envelopes, on the canvas edge, below the minimum useful area, above the bounded area or fragmented into extra islands fail closed.

The envelopes are intentionally conservative anatomical admission limits, not automatic masks. An operator or agent still creates the smallest accurate masks around the defective fingers, hands and necessary wrist feather. The assurance tool proves only that a mask stays inside the admitted bilateral hand regions; it does not claim the anatomy is creatively correct.

## Pre-dispatch mask evidence

```text
node scripts/compile-project-art-eva-source-repair-candidate-assurance.mjs mask \
  --frame-id <exact-frame-id> \
  --intake <sealed-create-only-intake.json> \
  --source <local-immutable-source.png> \
  --mask <local-defect-mask.png> \
  --mask-path <canonical-mask-path> \
  --mask-sha256 <exact-mask-sha256> \
  --output <create-only-mask-assurance.json> \
  --inspected-at <canonical-utc>
```

The CLI revalidates the sealed EVA intake before reading its exact materialized source path, SHA-256 and catalogue-bound Git-blob SHA-1. The self-hashed evidence binds that intake SHA-256 and source identity to the independently verified local bytes, mask SHA-256, canvas, binary semantics, editable coverage, connected components, component bounds and reviewed per-hand envelopes. A caller cannot substitute an arbitrary source merely by supplying its hash on the command line. The lower-level unbound file helper is named `UnboundFileForTesting`, records caller-declared identity and never sets provider-dispatch readiness. The completed provider admissions record must embed this full assurance document, and the defect-mask artifact binding's evidence SHA-256 must equal `assuranceSha256`. Provider package compilation revalidates the document hash, sealed intake identity, source and mask identities, bilateral component order, all technical gates and all-false authority before a redraw can become dispatchable. The production CLI grants no provider, approval, publication or repository authority.

Art Studio keeps the internal admitted reference role `edit-mask`, but maps it to the provider protocol's public `mask` role. Its adapter capability profile is also derived using the provider SDK's exact vocabulary, including mandatory cancellation. This prevents a package that appears ready internally from failing when compiled by `@evavo/art-providers`.

## Post-provider source-space candidate evidence

```text
node scripts/compile-project-art-eva-source-repair-candidate-assurance.mjs candidate \
  --frame-id <exact-frame-id> \
  --intake <sealed-create-only-intake.json> \
  --source <local-immutable-source.png> \
  --mask <local-defect-mask.png> \
  --mask-path <canonical-mask-path> \
  --mask-sha256 <exact-mask-sha256> \
  --candidate <local-provider-candidate.png> \
  --candidate-path <canonical-candidate-path> \
  --candidate-sha256 <exact-candidate-sha256> \
  --output <create-only-candidate-assurance.json> \
  --inspected-at <canonical-utc>
```

The candidate must be a same-canvas, non-interlaced, 8-bit RGBA PNG. RGB source pixels are compared as RGBA with alpha 255. Every channel of every protected pixel must match exactly; a one-channel change in one protected pixel fails the candidate. A bounded meaningful number of editable pixels must change so an unchanged or token candidate cannot pass.

For these RGB sources, successful evidence records:

- `sourceSpaceAssurancePassed: true`;
- `changedProtectedPixels: 0`;
- `alphaMasteringRequired: true`;
- `productionAlphaReady: false`;
- creative review, approval, promotion, publication and Runtime activation all false.

The next stage must master alpha separately and produce its own non-target, matte/halo and edge evidence before the existing frame finisher and dual independent anatomy/identity inspections run. This assurance boundary never overwrites a source and writes evidence create-only with mode `0600`.

## Agent-sized control surface

The CLI exposes `mask` and `candidate` as separate, deterministic operations. A chat agent, Claude, CI worker or local operator can run only the phase it is authorized to run, pass exact file identities, and receive one machine-readable JSON result. No phase implies the authority of a later phase. This keeps automation granular without turning technical validation into an automatic creative approval.
