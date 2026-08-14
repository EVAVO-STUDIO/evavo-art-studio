# Project Art reviewed avatar sequence release

This boundary begins after the avatar frame finisher has produced exact `final-frame-admitted` outcomes and after the existing Project Art loop-closure runner has produced a passed loop-closure receipt for every true loop.

It seals one owner-declared avatar sequence release. It does not redraw artwork, infer animation meaning, approve a frame, execute a provider, activate the runtime, mutate a repository, deploy the website or publish art.

## Contracts

```text
evavo.project-art-avatar-sequence-release-capabilities.v1
evavo.project-art-avatar-sequence-release-request.v1
evavo.project-art-avatar-sequence-release.v1
evavo.project-art-avatar-sequence-release-receipt.v1
evavo_avatar_sequence_pack_v2
```

The release request binds the existing mastering plan:

```text
evavo.project-art-avatar-sequence-mastering-plan.v1
```

It also binds existing evidence:

```text
evavo.project-art-avatar-final-pass-provider-frame-review-request.v1
evavo.project-art-avatar-final-pass-provider-frame-review-outcome.v1
evavo.project-art-loop-closure-plan.v1
evavo.project-art-loop-closure-review.v1
evavo.project-art-loop-closure-receipt.v1
```

## Required evidence

Every runtime frame must have exactly one final named-human admission.

The sealer requires:

- `status = final-frame-admitted`;
- an exact final frame SHA-256;
- a review request whose `reviewedTargetPath` is the mastering plan frame path;
- passed technical, hands and anatomy, face identity, silhouette and registration, adjacent-frame continuity, and applicable loop gates;
- a real reviewed target PNG whose bytes, dimensions and SHA-256 still match the plan;
- a human reviewer identity and exact review evidence.

A `frame-repair-required` or `frame-rejected` outcome blocks the release.

Every true `loop` clip must have one passed loop-closure receipt. The loop plan, review and receipt must bind the same review ID, project ID, final-to-first frame paths and hashes, thresholds, review hash and atomic output record. Both source-hash revalidation flags and `wholeRunAtomicPublication` must be true.

`once` and `ping-pong` clips do not receive a false wraparound requirement.

## Timing and approvals

The sealer computes an exact timing SHA-256 from the owner-declared clips, frame durations and defaults. It then computes one release basis SHA-256 from:

```text
mastering plan hash
reviewed frame paths and final hashes
clip order and timing
passed loop review and receipt hashes
default state mapping
```

Separate named-human approvals from art, animation and runtime disciplines must all bind that same timing hash and release basis hash. Runtime-discipline approval means the pack has been reviewed for release compatibility; runtime activation remains separate.

## Output bundle

A successful seal publishes one create-only directory atomically:

```text
sequence-release.json
runtime-pack.json
receipt.json
```

The release status is:

```text
sequence-release-sealed-awaiting-runtime-activation
```

`sequence-release.json` records exact frames, clips, loop evidence, approvals, timing, release basis, producer identities and the required next actions.

`runtime-pack.json` uses `evavo_avatar_sequence_pack_v2`, replaces the empty pre-release review with exact release evidence, and includes only passed loop closures. It deliberately keeps:

```text
runtimeActivationAllowed: false
```

`receipt.json` records atomic create-only publication and the exact output hashes. An exact retry with the same seal timestamp can reuse the complete matching bundle. A partial or different pre-existing directory fails closed.

## CLI

```powershell
node C:\GitRepos\evavo-art-studio\scripts\avatar-sequence-release-cli.mjs capabilities

node C:\GitRepos\evavo-art-studio\scripts\avatar-sequence-release-cli.mjs seal `
  --workspace-root C:\EVAVO\ArtWorkspaces\eva-avatar-final `
  --request requests\eva-sequence-release.json `
  --sealed-at 2026-08-13T09:30:00.000Z
```

## Callable MCP boundary

```powershell
$env:EVAVO_ART_AVATAR_SEQUENCE_RELEASE_ROOTS = "C:\EVAVO\ArtWorkspaces;C:\EVAVO\Evidence"
$env:EVAVO_ART_AVATAR_SEQUENCE_RELEASE_MCP_ALLOW_WRITE = "true"
node C:\GitRepos\evavo-art-studio\tools\project_art_avatar_sequence_release_mcp.mjs
```

Tools:

```text
evavo_art_avatar_sequence_release_capabilities
evavo_art_seal_avatar_sequence_release
```

The MCP server is path-only, configured-root confined and write-disabled by default. Image bytes stay in local files and do not flow through MCP JSON.

## Authority boundary

The write-enabled sealer may read exact evidence and persist only the release, runtime pack and receipt. It cannot:

```text
change owner-declared animation semantics
modify image bytes
call a provider
approve or promote a candidate
activate the avatar runtime
write EVAVO Storage
mutate a target repository
commit or push Git
force push
deploy
publish
```

After sealing, a separate runtime admission must inspect the pack and authorize activation. Repository or Storage publication must use a separately governed managed-path or normal non-force Git path. The website consumer must be updated only after the reviewed runtime pack is separately admitted.

## Honest production state

Adding this boundary does not mean that EVA or another avatar already has a reviewed release. Real frame corrections, generated anatomy-preserving in-betweens, named-human evidence, final timing, loop receipts and release approvals must exist before the sealer can succeed.
