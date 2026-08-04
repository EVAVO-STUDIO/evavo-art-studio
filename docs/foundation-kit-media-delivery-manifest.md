# Foundation Kit media delivery manifest

The Foundation media planner determines which exact game-owned source files are ready for role-specific runtime preparation. The delivery-manifest compiler closes the next boundary by converting one reviewed Foundation media plan into a create-only manifest accepted by `@evavo/art-delivery-optimizer`.

It does not execute the delivery optimizer, change the target game repository, approve artwork, promote artifacts, commit Git changes, deploy, or publish.

## Exact input authorities

The command requires four explicit paths:

```text
--repo
--contract
--plan
--output
```

The target repository must be the exact canonical `GodotGameFoundationKit` checkout described by both authorities.

The contract must:

- use `evavo_godot_media_production_contract_v1`;
- remain inside the target repository;
- retain the game-owned runtime roots, role policies, Godot version, batch policy and MCP restrictions;
- match the exact SHA-256 already recorded in the media plan.

The production contract is a mixed image and audio contract. The compiler validates the legitimate image policies, `preserve-role-owned` policy, non-image `not-applicable` policy, PNG formats, and current WAV/OGG role formats without pretending every role is executable through the image delivery optimizer.

The plan must:

- use `evavo_godot_media_production_plan_v1`;
- name the same repository and contract path;
- bind the exact contract and audit SHA-256 values;
- bind its canonical audit root to the exact `--repo` directory;
- retain `publicationAuthority = false`;
- retain `deletionAuthority = false`;
- require human creative approval.

Every selected work item is checked again against the live source file. Path, byte length and SHA-256 must still match. Repository, contract, plan, source and output-parent symlinks are rejected. A source that changes during compilation or before the create-only write fails closed.

Duplicate scalar options and duplicate `--role` values are rejected rather than silently replacing authority.

## Compile a create-only delivery manifest

Build the delivery optimizer first, then compile the manifest:

```powershell
Set-Location C:\GitRepos\evavo-art-studio

pnpm --filter @evavo/art-delivery-optimizer... build

pnpm run foundation:delivery -- `
  --repo C:\GitRepos\GodotGameFoundationKit `
  --contract C:\GitRepos\GodotGameFoundationKit\examples\playable_foundation_hub\data\foundation_kit_media_production_contract_v1.json `
  --plan C:\EVAVO-Evidence\GodotGameFoundationKit\media-production-plan.json `
  --output C:\EVAVO-Evidence\GodotGameFoundationKit\delivery-manifest.json `
  --role shell-desktop-icon
```

Limit the manifest to one or more plan-owned image roles:

```powershell
pnpm run foundation:delivery -- `
  --repo C:\GitRepos\GodotGameFoundationKit `
  --contract C:\GitRepos\GodotGameFoundationKit\examples\playable_foundation_hub\data\foundation_kit_media_production_contract_v1.json `
  --plan C:\EVAVO-Evidence\GodotGameFoundationKit\media-production-plan.json `
  --output C:\EVAVO-Evidence\GodotGameFoundationKit\godz-character-delivery.json `
  --role godz-character-atlas
```

When a plan includes audio work, select only the image roles intended for this handoff. Selecting current WAV or OGG roles fails with `RUNTIME_FORMAT_UNSUPPORTED`; those roles remain owned by the separate governed audio pipeline.

The output must remain outside the target repository. It is written with create-only `wx` semantics and cannot replace an earlier authority file. The output file is flushed before close. Parent-directory synchronisation is attempted where the operating system supports it and tolerates the documented Windows directory-handle limitations without weakening create-only output.

## Readiness boundary

A selected item cannot enter the delivery manifest when it has:

- any plan blocker;
- `reviewRequired = true`;
- any retained audit finding;
- a missing or changed source file;
- a source byte-length or SHA-256 mismatch;
- a runtime target outside its role-owned root;
- a portable case-insensitive target collision;
- a Windows-reserved target such as `con`, `aux`, `com1`, or `lpt1`;
- a path segment with forbidden Windows characters or a trailing dot or space;
- an unsupported exact runtime format.

The compiler therefore consumes a ready plan. It does not hide unresolved review work by translating it into an executable batch.

## Delivery profile mapping

The emitted JSON uses the normal delivery-optimizer schema:

```text
evavo.art-delivery-optimization.v1
```

Current governed mapping is deliberately narrow and exact:

```text
png-lossless or png-plus-fnt
  → godot-sprite-lossless

webp-lossless with require-meaningful-alpha
  → godot-cutout-webp-1080p

webp-lossless with preserve-authored-opaque
or preserve-authored-black-stage
  → godot-background-1080p
```

Substring matches are not accepted. A value merely containing `png` or `webp` is not a supported format.

The compiler uses `background.mode = preserve`. Alpha extraction, connected matte removal and luminance-to-alpha conversion are separate reviewed mastering decisions and are not guessed during this handoff.

`png-plus-fnt` produces the raster item through the delivery optimizer and retains `bitmap-font-metadata` as an explicit post-delivery sidecar requirement.

The output also records a `foundationAuthority` envelope with exact contract, plan, audit and source verification evidence. Extra authority fields do not change compatibility with the ordinary delivery-manifest validator.

## Staging and execution

The manifest records the intended command but does not authorize it:

```powershell
pnpm --filter @evavo/art-delivery-optimizer start -- batch `
  --manifest C:\EVAVO-Evidence\GodotGameFoundationKit\delivery-manifest.json `
  --source-root C:\GitRepos\GodotGameFoundationKit `
  --output-root C:\EVAVO-Staging\GodotGameFoundationKit `
  --apply
```

The staging root must remain outside the target repository. Produced derivatives are still unapproved candidates. They require decoded-pixel evidence, role checks and independent native validation before any reviewed files can be published.

The compiler receipt reports truthfully:

```text
deliveryManifestFileCreated = true
mutationPerformed = true
mutationScope = create-only-delivery-manifest
targetRepositoryMutationPerformed = false
providerCalled = false
selectionPerformed = false
promotionPerformed = false
publicationPerformed = false
```

`planFileCreated` is not emitted because this command consumes a plan and creates a delivery manifest.

## Independent gates

After deterministic delivery preparation:

1. Godot Game Test Lab verifies the exact contract, plan, source and derivative identities.
2. Godot import and native captures prove the role-owned runtime behavior.
3. Named human review approves visual quality, animation, registration and suite coherence.
4. EVAVO Development Studio performs the separately authorized Git/LFS publication transaction.
5. Audio roles continue through the governed EVAVO Audio Studio path rather than the image delivery optimizer.

The delivery manifest cannot satisfy any of those gates by itself.

## Permanent validation

Run:

```powershell
pnpm --filter @evavo/art-delivery-optimizer... build
pnpm run foundation:delivery:check
```

The focused checker validates:

- compiler, tests and workflow syntax;
- exact contract, plan, audit-root and source-byte binding;
- compatibility with the real mixed production-contract shape;
- image-role filtering when the same plan contains audio work;
- delivery-optimizer manifest compatibility;
- blocked and tampered-plan rejection;
- exact format allowlisting;
- collision and Windows-portability rejection;
- output isolation and create-only behavior;
- symlink rejection;
- clean authority boundaries.

The permanent `Foundation Media Delivery Authority` workflow repeats those checks with pinned Node and pnpm versions, runs the complete delivery-optimizer tests and uploads a bounded validation receipt.

## Truth boundary

A successful compile proves that a delivery-optimizer-compatible manifest was derived from exact, ready Foundation authorities and unchanged source bytes.

It does not prove:

- that delivery optimization was executed;
- that a derivative passed decoded-pixel comparison;
- that Godot imported or rendered it correctly;
- that a native capture was reviewed;
- that a human approved the art;
- that an artifact was selected or promoted;
- that an audio role was mastered or approved;
- that any game-repository commit, deployment or publication occurred.
