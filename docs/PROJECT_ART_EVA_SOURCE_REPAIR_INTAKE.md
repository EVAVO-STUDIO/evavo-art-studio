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

The required `evavo.avatar.art-materialization-manifest.v2` records both SHA-256 and the actual Git-blob SHA-1 calculated from each PNG's bytes. Art Studio verifies the manifest fingerprint, exact Runtime commit, 191-frame inventory, 1024 x 1536 alpha-capable PNG profile, source paths, Git identities and materialized byte identities before compiling any job.

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

The request template deliberately contains no artifact admissions and no provider authorization. Passing it through the existing provider compiler therefore produces six blocked jobs with complete prompts and reference requirements. A named human must separately admit each exact artifact and record one run-once provider authorization before any job becomes submit-ready. Fallback and multiple candidates remain forbidden.

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

Provider completion still produces unapproved candidates only. Each candidate must be materialized create-only, finished without source overwrite, compared against the exact source and both temporal neighbours, and passed by at least two independent inspectors for hands, fingers, anatomy, face identity, non-target invariance, alpha, canvas and temporal continuity.

Complete technical evidence unlocks creative review only. Creative approval, atlas regeneration, sequence sealing, browser playback re-verification, repository publication and runtime activation remain distinct. Top Hat Man production stays blocked until the repaired EVA release has independently passed every one of those gates.
