# Artist Workspace agent suite

This is the canonical local MCP deployment for ChatGPT, Claude and trusted EVAVO agents working with persistent project artwork.

Use:

```text
config/mcp.project-art-workspace.windows.example.json
```

That one configuration now registers nine deliberately separate path-only servers.

The compatibility history remains additive. V2 registered five deliberately separate path-only servers. V3 retained all five and added the provider-runtime bridge as the sixth. V4 retained all six and added strict provider-candidate materialization as the seventh. V5 retained all seven and added deterministic frame finishing and final-frame admission as the eighth. V6 retains all eight and adds reviewed sequence release sealing as the ninth.

The v2 compatibility example keeps all five write gates set to `false`. The v3 compatibility example keeps all six write gates set to `false`. The v4 compatibility example keeps all seven write gates set to `false`. The v5 compatibility example keeps all eight write gates set to `false`. The current v6 canonical example keeps all nine write gates set to `false`.

```text
evavo-project-art-workspace
evavo-project-art-workspace-ingest
evavo-project-art-workspace-catalog
evavo-project-art-workspace-jobs
evavo-project-art-avatar-final-pass-provider
evavo-project-art-avatar-final-pass-provider-runtime
evavo-project-art-avatar-final-pass-provider-candidate
evavo-project-art-avatar-final-pass-provider-frame-finisher
evavo-project-art-avatar-sequence-release
```

The primary server owns project inspection, deterministic image operations, sprite and atlas work, persistent workspace creation, append-only snapshots and EVAVO Storage handoff preparation. The ingest server owns exact placement of mounted chat attachments, generated images and approved local files into an existing workspace. The catalog server gives agents a content-addressed, queryable view of what the workspace actually contains and whether it has drifted. The jobs server adds append-only, crash-resumable checkpoints. The avatar final-pass provider server compiles explicitly selected hand, finger, anatomy, identity and continuity redraws plus generated in-betweens into one-candidate requests. The provider-runtime bridge binds one ready request to the canonical `@evavo/art-providers` durable runtime contract and validates one successful candidate result or one explicit provider failure. The provider-candidate materializer then admits one exact successful unapproved PNG from the immutable artifact store into its governed scratch path and emits a hash-bound frame-finisher handoff. The frame-finisher preserves visible pixels and alpha while removing hidden transparent RGB, then requires named-human anatomy, identity and continuity review before admitting the exact final frame hash. The sequence-release server binds every admitted runtime frame, every required true-loop receipt, exact timing and three named-human release approvals into one atomic create-only release bundle while keeping runtime activation separate.

## End-to-end flow

```text
ChatGPT / Claude attachment, repository image or generated candidate
→ approved external source root
→ exact external-ingest plan
→ immutable original under sources/
→ editable working copy under working/
→ content-addressed workspace catalog
→ create-only resumable production job
→ deterministic cleanup, mastering, compositing, sprites or animation work
→ append-only success/failure checkpoint
→ exact output-evidence verification
→ append-only workspace snapshot
→ visual review and explicit creative decision
→ sealed avatar final-pass plan
→ named-human provider authorization and exact reference-artifact admission
→ one-candidate redraw or in-between batch
→ one exact provider-runtime dispatch
→ canonical generic runtime-contract compilation and binding
→ separately authorised runtime enqueue and one provider call
→ candidate-result or provider-failure normalization
→ immutable candidate and evidence artifact verification
→ strict non-animated RGBA PNG and exact-canvas admission
→ create-only unapproved candidate materialization
→ hash-bound frame-finisher request
→ rerun frame finishing, registration and loop closure
→ independent art, anatomy, identity and continuity review
→ final reviewed SHA-256 before dependent in-betweens or sequences
→ owner-declared avatar sequence mastering plan
→ passed final-to-first loop evidence for every true loop
→ named-human art, animation and runtime release approvals
→ atomic reviewed sequence release seal
→ separate runtime-pack inspection and activation
→ exact EVAVO Storage handoff
→ independently authorised Storage ingest
→ separately governed repository publication
```

The external file is never renamed, deleted or overwritten. Ingest publishes an immutable original and a separate editable working copy. Later operations publish new create-only candidates or versions rather than mutating the original.

## Canonical servers

### `evavo-project-art-workspace`

Entrypoint: `tools/project_art_workspace_mcp.mjs`

It provides project and repository art intelligence, deterministic image and sprite plans, cleanup, transparency repair, compositing, mastering, reference-derived work, temporary intake, atlases, persistent workspace creation, append-only snapshots and exact EVAVO Storage handoff preparation.

Write gate: `EVAVO_ART_WORKSPACE_MCP_ALLOW_WRITE=true`

### `evavo-project-art-workspace-ingest`

Entrypoint: `tools/project_art_workspace_ingest_mcp.mjs`

It provides exact external-source and destination-plan compilation, atomic ingest, immutable source-copy and editable working-copy creation, provenance receipts and rollback on late collision or byte mismatch.

Independent allowlists:

```text
EVAVO_ART_WORKSPACE_INGEST_ROOTS
EVAVO_ART_WORKSPACE_INGEST_SOURCE_ROOTS
```

Write gate: `EVAVO_ART_WORKSPACE_INGEST_MCP_ALLOW_WRITE=true`

### `evavo-project-art-workspace-catalog`

Entrypoint: `tools/project_art_workspace_catalog_mcp.mjs`

It provides create-only content-addressed inventories, exact SHA-256 and byte-length identity, image metadata, duplicate groups, bounded queries and missing/changed/unexpected drift verification. A catalog is technical evidence, not creative approval.

Write gate: `EVAVO_PERSISTENT_CATALOG_MCP_ALLOW_WRITE=true`

### `evavo-project-art-workspace-jobs`

Entrypoint: `tools/project_art_workspace_jobs_mcp.mjs`

It provides create-only plans, validated dependencies, append-only hash-chained checkpoints, short-lived claims, stale-lease recovery, exact next-step inspection, retryable failure evidence and output-drift verification. The job layer records governed work; it does not execute providers or arbitrary shell commands.

Canonical tools:

```text
evavo_art_workspace_job_capabilities
evavo_art_compile_workspace_job
evavo_art_create_workspace_job
evavo_art_inspect_workspace_job
evavo_art_checkpoint_workspace_job
```

Write gate: `EVAVO_ART_WORKSPACE_JOBS_MCP_ALLOW_WRITE=true`

### `evavo-project-art-avatar-final-pass-provider`

Entrypoint: `tools/project_art_avatar_final_pass_provider_mcp.mjs`

Canonical tools:

```text
evavo_art_avatar_final_pass_provider_capabilities
evavo_art_compile_avatar_final_pass_provider_batch
```

The server consumes a sealed final-pass plan and explicit job selection. A redraw requires exact `canonical-identity` and `base-image` references. A generated in-between requires exact `canonical-identity`, `previous-key-pose` and `next-key-pose` references. Every job requires named-human `run-provider-once` authorization. An in-between remains blocked until each endpoint has a final reviewed SHA-256.

Every ready envelope remains one candidate, no fallback, transparent PNG, with provider execution and all approval authority false.

Write gate: `EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_MCP_ALLOW_WRITE=true`

### `evavo-project-art-avatar-final-pass-provider-runtime`

Entrypoint: `tools/project_art_avatar_final_pass_provider_runtime_mcp.mjs`

Canonical tools:

```text
evavo_art_avatar_final_pass_provider_runtime_capabilities
evavo_art_compile_avatar_final_pass_provider_runtime_dispatch
evavo_art_bind_avatar_final_pass_provider_runtime_contract
evavo_art_compile_avatar_final_pass_provider_runtime_outcome
```

The bridge selects one exact ready job from the sealed provider batch. Its dispatch binds the immutable provider request to:

```text
package        @evavo/art-providers
export         compileProviderCandidateRuntimeContract
queue          provider
kind           art.candidate.edit | art.candidate.generate
attempts       3 durable retries of the same idempotent request
lease          300000 ms
timeout        1800000 ms
candidateCount 1
```

Durable retries must retain the same deterministic provider request and cannot become creative fallback variations. The binding step independently validates the normalized request, prompt hash, capability profile, queue, job kind, idempotency key, retry policy, lease and timeout. The outcome step accepts only one successful candidate result or one explicit provider failure.

A successful result produces `candidate-materialization-required`. A failure produces `provider-failure-record-required` and requires fresh named-human authorization before another provider attempt. The runtime bridge does not approve or promote a candidate.

Write gate: `EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_MCP_ALLOW_WRITE=true`

The gate permits private create-only JSON dispatch, binding and outcome records inside configured roots. It does not compile the generic package, enqueue a runtime job, call a provider, materialize image bytes, approve a candidate or activate the avatar.

### `evavo-project-art-avatar-final-pass-provider-candidate`

Entrypoint: `tools/project_art_avatar_final_pass_provider_candidate_mcp.mjs`

Canonical tools:

```text
evavo_art_avatar_final_pass_provider_candidate_capabilities
evavo_art_materialize_avatar_final_pass_provider_candidate
```

This server starts from a successful `candidate-materialization-required` outcome. It independently revalidates the dispatch, binding and outcome hashes, then verifies the immutable candidate and provider evidence artifacts through `LocalArtifactStore`.

The candidate must remain one unapproved `image/png` intermediate artifact with exact provider request, prompt, candidate-family, asset and continuity identities. The evidence must bind the same candidate, one successful provider attempt, the same adapter and model, fallback disabled, and native alpha.

Before publication the server validates:

```text
PNG CRC for every chunk
one IHDR / consecutive IDAT / one terminal IEND
no APNG chunks
8-bit RGBA
non-interlaced
exact expected canvas
at least one visible pixel
at least one transparent pixel
```

It publishes these three files create-only as one rollback-safe bundle:

```text
candidate-01.png
candidate-01.materialization.json
candidate-01.finisher-request.json
```

The receipt records exact artifact, evidence, output, alpha and SHA-256 identities. The finisher request preserves the required next path:

```text
avatar frame finisher
→ native-scale and contact-sheet inspection
→ hands and anatomy review
→ face identity review
→ continuity and loop-closure review
→ final reviewed SHA-256
```

The server permits no creative approval, candidate promotion, repository mutation, deployment, publication or runtime activation.

Independent allowlists:

```text
EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_CANDIDATE_ROOTS
EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ARTIFACT_ROOTS
```

Write gate:

```text
EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_CANDIDATE_MCP_ALLOW_WRITE=true
```

### `evavo-project-art-avatar-final-pass-provider-frame-finisher`

Entrypoint: `tools/project_art_avatar_final_pass_provider_frame_finisher_mcp.mjs`

Canonical tools:

```text
evavo_art_avatar_final_pass_provider_frame_finisher_capabilities
evavo_art_finish_avatar_final_pass_provider_candidate
evavo_art_review_avatar_final_pass_provider_frame
```

The finisher starts from the exact materialized candidate and hash-bound finisher request. It independently validates the source PNG and clears only hidden RGB beneath fully transparent pixels. Visible pixels, alpha, canvas dimensions, silhouette registration and the reviewed target path must remain unchanged.

The review boundary then requires a named-human decision with native-scale and contact-sheet evidence plus explicit gates for hands and anatomy, face identity, silhouette registration, adjacent-frame continuity and applicable loop closure.

Only `final-frame-admitted` permits the exact final frame SHA-256 to enter a sequence draft or serve as an in-between endpoint. `frame-repair-required` and `frame-rejected` remain blocked. Frame admission does not grant sequence release or runtime activation.

Write gate:

```text
EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_MCP_ALLOW_WRITE=true
```

### `evavo-project-art-avatar-sequence-release`

Entrypoint: `tools/project_art_avatar_sequence_release_mcp.mjs`

Canonical tools:

```text
evavo_art_avatar_sequence_release_capabilities
evavo_art_seal_avatar_sequence_release
```

The release boundary consumes one exact owner-declared mastering plan, one final-frame-admitted review outcome for every runtime frame, and one passed loop plan, review and receipt chain for every true loop. `once` and `ping-pong` clips do not require false wraparound evidence.

It independently recomputes the sequence timing hash and release-basis hash, then requires named-human art, animation and runtime release approvals bound to those same identities. Approval times must follow all final-frame admissions and cannot postdate the seal.

A successful seal publishes exactly three create-only files as one atomic bundle:

```text
sequence-release.json
runtime-pack.json
receipt.json
```

The runtime pack uses `evavo_avatar_sequence_pack_v2`. It remains `sequence-release-sealed-awaiting-runtime-activation`; runtime activation remains separate. Repository publication must use EVAVO Storage managed paths or a reviewed normal non-force Git path. The release server cannot mutate a target repository, commit or push Git, deploy, publish, activate the runtime or force push.

Independent roots and write gate:

```text
EVAVO_ART_AVATAR_SEQUENCE_RELEASE_ROOTS
EVAVO_ART_AVATAR_SEQUENCE_RELEASE_MCP_ALLOW_WRITE=true
```

## Safe deployment defaults

The canonical example keeps all nine write gates set to `false`. Enable only the server needed for the current operation and only on the trusted local workstation.

Workspace roots control plans, evidence, catalogs, journals, workspaces, candidate scratch outputs, finished-frame records and sealed release bundles. Ingest source roots separately control external reads. Provider roots separately control sealed plans and batches. Runtime roots separately control dispatch, compiled-contract evidence and outcome records. Candidate artifact roots separately control immutable artifact reads. Sequence-release roots separately control mastering plans, review evidence, loop evidence and release outputs. Keep allowlists explicit rather than granting broad drive access.

Image bytes remain in local files and the artifact store. MCP carries bounded paths, hashes, dimensions, identifiers, plans, state and receipts; it does not transport image payloads through the language-model context.

## EVAVO Storage

`evavo_art_prepare_storage_handoff` creates an exact self-hashed request for selected workspace files. It does not perform the Storage write. Provider compilation, runtime binding, outcome normalization, candidate materialization, frame finishing, sequence release sealing, workspace processing or job completion is not Storage admission.

## Creative and publication authority

Technical processing, catalog verification, job completion, provider-request compilation, runtime-contract binding, outcome normalization, unapproved candidate materialization, deterministic frame finishing and release-envelope sealing do not grant creative approval or runtime activation.

The default suite performs no automatic:

```text
runtime enqueue
provider execution
alpha extraction
deterministic QA completion
creative review
candidate approval
candidate promotion
sequence release approval
EVAVO Storage write
target-repository mutation
Git commit or push
deployment
publication
runtime activation
force push
```

A write-enabled candidate materializer may create only the exact unapproved scratch candidate, materialization receipt and frame-finisher request. A write-enabled frame finisher may create only the bounded finished-frame and review records. A write-enabled sequence-release server may create only the exact three-file release bundle after every governed evidence requirement passes. None can turn a technical write into approval, repository publication or production activation.

Those later actions retain separate authority, evidence and confirmation boundaries.
