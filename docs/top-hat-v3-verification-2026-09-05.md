# Top Hat v3 verification — 5 September 2026

## Executed checks

Command: `node --test scripts/test-top-hat-v3-provider-plan-regression.mjs`

Environment: Node v22.16.0 in an isolated Linux container, not the MSI workstation.

Result: 42 tests; 41 passed, 0 failed, 1 skipped. The skipped case imports the built Art Studio provider package, which was not available in that environment. The executed tests use explicitly synthetic contract fixtures and real command-line subprocesses. They do not constitute image generation, visual QA, GPU/provider integration, or a full repository test run.

All four committed code/test blobs match the files used for the passing local run:

| File | Git blob SHA1 |
| --- | --- |
| scripts/project-art/top-hat-v3-suite-contract.mjs | dd2aedeb7fc369bbe9e0030fcc36c794bf3a2d61 |
| scripts/project-art/top-hat-v3-animation-provider-plan.mjs | 369beaa7828e5737091b0d229a505a4efaf37d5b |
| scripts/compile-top-hat-v3-provider-plan.mjs | a710c236693094a03df6f28cb32111b870fcb6c7 |
| scripts/test-top-hat-v3-provider-plan-regression.mjs | 62b64cf3d74eb33de973d61437235a7ad60bdb0f |

## Corrected production blockers

The suite validator now matches exact unique clip IDs rather than requiring catalogue order. Runtime generation plans preserve their production-priority ordering. The generic Art Studio compiler already appends the character-specific `hat-tip`; the earlier claim that its 24-entry base list omitted the signature clip was incorrect.

Provider family IDs are bounded deterministic hashes, with the full source-plan and job identities retained in metadata. The direct compiler verifies the source plan hash, exact clip matrix, pinned animation master, safe unique destinations, complete frame coverage, and temporal brackets referencing earlier waves. The `presentation-emphasis` foundation requires the approved `presentation-open` image reference.

Mouth and eye layer instructions no longer demand full-body output. Relaxed and energetic mouth variants carry distinct acting instructions.

Options now enforce the existing provider limits of 1–8 candidates and an unsigned 32-bit seed. Body-frame seed offsets wrap within that range. The CLI rejects missing or duplicate arguments and malformed seeds and preserves create-only output behaviour.

Run the standalone regression command above explicitly. This pass did not modify the repository-wide check script or execute the full repository suite.

## Existing master reference copy

One existing image was copied through the connected GitHub and Cloudinary tools. The private repository's temporary download URL was used for the transfer and is intentionally not persisted here.

Source repository: `EVAVO-STUDIO/evavo-avatar-runtime`

Source commit: `d212eb42a98d1e4f860d9edf8e336dfa2fdf89fd`

Source path: `assets/top-hat-man/candidates/top-hat-man-full-body-master-v5.alpha.png`

Expected source SHA256: `92cb290246a7629024dcb7768f4119f6a139d9c9f59e3d0545563e1f5b35575a`

Cloudinary asset ID: `5aa50c927c4ebff8134d4231628fe7f2`

Cloudinary public ID: `evavo/avatar-runtime/top-hat-man/references/full-body-master-v5-92cb290246a76290`

Cloudinary version: `1788583123`

The upload response reported 1024×1536 PNG and 647297 bytes, matching the repository metadata. The transferred bytes were not downloaded for independent SHA256 verification in this environment. The stored expected hash is provenance metadata, not proof of a completed binary readback.

This asset is tagged as an animation reference, not production, and an unapproved candidate. No creative approval or runtime activation was recorded. No new animation frames were generated and no existing playback assets were replaced.

## Remaining verification

The editor still needs the actual reference image as a usable image input. The next visual task is one registered closed-eye blink candidate, then identity/registration inspection, before expanding to the remaining foundation poses. Full v3 artwork generation, live provider execution, temporal/loop QA and production release remain unverified.
