# Project Art avatar-sequence bundles

The avatar-sequence bundle writer materializes one sealed mastering plan into a stable directory of path-and-hash handoffs. It bridges explicit frame assignment and the existing downstream workspace, loop-review, runtime-review, and release tools without copying image bytes through model context or MCP.

It does not generate or edit images. It does not infer animation meaning. It does not apply workspace copies, execute loop review, approve a sequence, seal a runtime pack, mutate a repository, commit, push, deploy, publish, or activate an avatar.

## Input

The writer accepts exactly one:

```text
evavo.project-art-avatar-sequence-mastering-plan.v1
```

The plan must retain:

```text
assignment.mode: owner-declared-only
semanticInferencePerformed: false
timestampOrderingUsedAsSemantics: false
runtimeDraft.review: null
runtimeDraft.loopClosures: []
runtimeActivationAllowed: false
```

The plan file must be a bounded, single-link, non-symbolic UTF-8 JSON file inside the selected workspace. Its canonical `documentSha256` and stable filesystem identity are checked before work starts and again immediately before publication.

## Atomic bundle output

```powershell
node scripts/write-project-art-avatar-sequence-bundle.mjs `
  --workspace-root C:\GitRepos\evavo-avatar-runtime `
  --plan C:\EVAVO\staging\eva-sequence-mastering-plan.json `
  --output-root C:\EVAVO\staging\eva-sequence-bundle-v1 `
  --created-at 2026-08-12T00:00:00.000Z
```

The output root must not exist. The writer stages every JSON file with create-only `0600` permissions, revalidates the source plan, and atomically renames the complete staging directory into place. A failed run removes its staging directory and publishes no partial bundle.

The output contains:

```text
workspace-file-plan-request.json
runtime-draft.json
loop-closure/000-<clip-id>.request.json
loop-closure/001-<clip-id>.request.json
...
manifest.json
receipt.json
```

`manifest.json` uses:

```text
evavo.project-art-avatar-sequence-bundle.v1
```

`receipt.json` uses:

```text
evavo.project-art-avatar-sequence-bundle-receipt.v1
```

Both bind the exact source-plan file SHA-256, canonical plan SHA-256, output hashes, counts, finalization requirements, atomic-publication state, and all-false effects.

The receipt records `sourcePlanRevalidatedBeforePublication: true` and `wholeRunAtomicPublication: true`; this is the machine-readable whole-run atomic publication proof.

## Downstream use

1. Apply `workspace-file-plan-request.json` through the governed workspace writer when copy operations are present.
2. Compile and execute each loop request through the existing final-to-first loop-closure boundary.
3. Review the inactive `runtime-draft.json` with independent art, animation, and runtime reviewers.
4. Add the exact passed loop evidence and sealed review to a runtime sequence pack.
5. Use the separate runtime release boundary to approve and activate the reviewed pack.

The bundle itself never performs any of those later steps.

## Callable MCP surface

```powershell
$env:EVAVO_ART_AVATAR_SEQUENCE_BUNDLE_ROOTS = "C:\GitRepos\evavo-avatar-runtime;C:\EVAVO\staging"
$env:EVAVO_ART_AVATAR_SEQUENCE_BUNDLE_MCP_ALLOW_WRITE = "true"
node C:\GitRepos\evavo-art-studio\tools\project_art_avatar_sequence_bundle_mcp.mjs
```

The server exposes:

```text
evavo_art_avatar_sequence_bundle_capabilities
evavo_art_write_avatar_sequence_bundle
```

The write gate authorizes only atomic bundle creation. The child process uses `shell: false`, receives a credential-redacted environment, and returns a bounded JSON summary. Image bytes and raw command output do not flow through MCP.

## Fail-closed behavior

The writer rejects:

- unsupported, unsealed, or hash-mismatched mastering plans;
- inferred semantics or timestamp-derived animation meaning;
- stale, symlinked, hard-linked, moved, or modified-during-read plan files;
- workspace, canvas, frame, clip, default, operation, or count drift;
- reordered, substituted, or incorrectly hashed loop requests;
- active, reviewed, or loop-filled runtime drafts masquerading as mastering output;
- missing independent-review and release requirements;
- any source, image, provider, approval, repository, Git, deployment, publication, runtime-activation, or force-push authority;
- existing, escaped, or symlink-confined output roots;
- partial or non-atomic publication.

## Authority boundary

```text
sourceMutation: false
sourceDeletion: false
targetImageWrite: false
providerExecution: false
candidateApproval: false
candidatePromotion: false
targetRepositoryMutation: false
gitCommit: false
gitPush: false
publication: false
deployment: false
runtimeActivation: false
forcePush: false
```

The bundle writer organizes existing art-production contracts. It does not claim that any existing EVA source frame is reviewed, semantically assigned, animation-ready, or production-active.
