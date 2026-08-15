# Project Art EVA source-repair intake

This intake is the strict bridge between Avatar Runtime's six quarantined EVA findings and Art Studio's existing one-candidate provider, candidate materialization, frame finisher, assurance, mastering and release boundaries.

It does not claim that the source pixels are available or repaired. It converts an exact Runtime handoff plus a sealed v2 materialization manifest into a provider-compatible plan and a blocked request template. Source bytes remain in the authenticated workstation or short-lived private artifact and never travel inside the intake JSON.

## Exact identity chain

The Runtime handoff binds:

- `evavo.avatar.eva-source-repair-plan.v1` and its plan fingerprint;
- the immutable six-task catalogue SHA-256;
- five exact source paths and their Git-blob SHA-1 identities;
- ten temporal reference Git blobs;
- the two endpoint Git blobs for the derived wave in-between;
- the Runtime repository commit, tree and package version;
- the pinned Art Studio repository commit, tree and consumer schemas;
- all-false source, provider, approval, repository, publication and activation authority.

The required `evavo.avatar.art-materialization-manifest.v2` records both SHA-256 and the actual Git-blob SHA-1 calculated from each PNG's bytes. Art Studio verifies the manifest fingerprint, exact Runtime commit, 191-frame inventory, source paths, Git identities and materialized byte identities before compiling any job. Source validation matches the repository's real non-interlaced, 8-bit PNG bank: mixed RGB and RGBA source encodings are accepted only when PNG colour type and alpha metadata agree, and the five known non-job dimension outliers remain truthful inventory evidence instead of being mistaken for production frames. Every source, temporal reference and endpoint actually bound to a provider job must independently match the exact 1024 x 1536 production canvas. This source compatibility does not relax the repair boundary. The five RGB redraws require true 8-bit RGBA source-space candidates with exact outside-mask invariance; they do not pretend to be production-alpha-ready. Alpha mastering is a separate downstream gate. The derived in-between and ordinary final-pass jobs retain the normal usable-transparency requirement.

This closes a gap that SHA-256-only materialization could not close on its own: every admitted local PNG is now provably the exact Git blob named by the source-repair plan.

## Compiled jobs

The intake produces exactly:

- five `provider-redraw` jobs restricted to hands, fingers and anatomy;
- one `provider-generated-inbetween` job restricted to the two verified endpoint blobs;
- a compatible `evavo.project-art-avatar-final-pass-plan.v1`;
- a compatible `evavo.project-art-avatar-final-pass-provider-request.v1` template;
- deterministic candidate paths under `scratch/avatar-final-pass/eva-source-repair-v1`;
- create-only targets under `workfiles/eva-source-repairs/v1`.

Every source-edit job carries the original Runtime policy: precise hands-only mask, face and pose preservation, wardrobe and canvas preservation, highest input fidelity, real RGBA alpha, checkerboard/matte/halo rejection and exact invariance outside the mask.

The mask is a first-class admitted artifact, not prompt prose. Every redraw remains blocked on `defect-mask-artifact-required` until a named human admits one exact same-canvas mask at the deterministic per-job `defect-mask.png` path. Art Studio retains the internal `edit-mask` role and maps it to the provider SDK's public `mask` role. The runtime adapter capability profile now uses the provider SDK's exact vocabulary, including `mask` and `cancellation`; mask-guided scope, high input fidelity and non-target invariance remain explicit request and assurance policies rather than pretending to be adapter capabilities. Before dispatch, the source-repair assurance tool independently verifies canonical binary mask pixels, two connected hand components and the exact per-frame bilateral hand envelopes described in `PROJECT_ART_EVA_SOURCE_REPAIR_CANDIDATE_ASSURANCE.md`. This follows the provider workflow supported by [ComfyUI inpainting](https://docs.comfy.org/tutorials/basic/inpaint) and its [GPT Image edit node](https://docs.comfy.org/tutorials/partner-nodes/openai/gpt-image-1): body-part repair is an inpainting task, and the image and mask must be the same size.

The request template deliberately contains no artifact admissions and no provider authorization. Passing it through the existing provider compiler therefore produces six blocked jobs with complete prompts and reference requirements. A named human must separately admit each exact artifact and record one run-once provider authorization before any job becomes submit-ready. Fallback and multiple candidates remain forbidden.

## Sealed provider package

Generate a fillable admissions template from the exact intake:

```text
node scripts/compile-project-art-eva-source-repair-provider-package.mjs template \
  --intake <create-only-intake.json> \
  --output <create-only-admissions-template.json>
```

The completed admissions document binds the intake SHA-256, exact ordered six-job set, per-job provider selection, every admitted source/reference/mask artifact, each redraw's complete self-hashed pre-dispatch mask assurance and a named-human authorization. The defect-mask binding's evidence SHA-256 must equal that assurance document's hash. A missing assurance, caller-declared source identity, failed bilateral envelope, failed protected-region gate or substituted mask identity prevents package compilation and dispatch. Authorization is limited to six total provider calls, one candidate per job, no fallback and a maximum 24-hour validity window.

After admissions are complete, compile one self-hashed provider package:

```text
node scripts/compile-project-art-eva-source-repair-provider-package.mjs compile \
  --intake <create-only-intake.json> \
  --admissions <sealed-admissions.json> \
  --output <create-only-provider-package.json> \
  --compiled-at <canonical-utc>
```

Compilation must produce exactly five ready redraws and one ready in-between with zero blockers. The package embeds the exact plan, finalized request and ready provider batch, but it still cannot execute a provider or approve, promote, publish or activate a candidate.

Compile a runtime dispatch directly from the verified package, without manually extracting or copying nested JSON:

```text
node scripts/avatar-final-pass-provider-runtime-cli.mjs dispatch-package \
  --package <create-only-provider-package.json> \
  --job-id <exact-job-id> \
  --output <create-only-runtime-dispatch.json> \
  --compiled-at <canonical-utc>
```

## Command

```text
node scripts/compile-project-art-eva-source-repair-intake.mjs \
  --handoff <runtime-handoff.json> \
  --manifest <materialized-bank/manifest.json> \
  --output <create-only-intake.json> \
  --compiled-at <canonical-utc>
```

The command reads bounded stable single-link JSON files and writes the complete intake create-only. Its nested provider plan and request template are ordinary inputs for the existing Avatar Final Pass provider compiler and its MCP/runtime/candidate/finisher chain.

## Remaining gates

Provider completion still produces unapproved candidates only. Each RGB redraw candidate must first pass exact source-space candidate assurance: the same source, mask and candidate byte identities, a meaningful edit inside the mask, and zero changed RGBA pixels outside it. It then requires a separate alpha-mastering phase with non-target and edge evidence. Only after that may the ordinary frame finisher compare the result against the exact source and both temporal neighbours and at least two independent inspectors review hands, fingers, anatomy, face identity, non-target invariance, alpha, canvas and temporal continuity.

Complete technical evidence unlocks creative review only. Creative approval, atlas regeneration, sequence sealing, browser playback re-verification, repository publication and runtime activation remain distinct. Top Hat Man production stays blocked until the repaired EVA release has independently passed every one of those gates.
