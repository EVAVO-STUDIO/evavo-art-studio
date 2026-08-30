# Animation Frame Work Ledger V1

The Animation Frame Work Ledger turns one approved camera-aware animation profile into resumable, content-addressed frame production. It exists between profile planning and independent moving-sequence review.

It does not replace the profile, reviewer, provider adapter, artifact store, creative approval or delivery compiler. It records exactly what was asked for, what candidate returned, which revision it belongs to and what may be retried.

## Ownership

| Operation | Owner |
|---|---|
| Create ledger from an approved profile | Art Studio |
| Compile dependency-safe frame work | Art Studio |
| Execute a renderer or image provider | External governed adapter |
| Bind a returned candidate to its work order | Art Studio |
| Apply one complete same-revision candidate batch | Art Studio |
| Independently review the moving sequence | Cel Animation Studio |
| Authorise a targeted repair | Cel review decision |
| Creative acceptance and release | Separate authorised reviewer and release system |

## Production order

```text
approved production profile
→ immutable frame ledger
→ identity and direction reference binding
→ key-pose work batch
→ candidate receipts
→ breakdown and in-between batches
→ independent whole-sequence review
→ targeted repair batch when required
→ accepted ledger
→ existing review receipt and sequence delivery path
```

A provider result is always a candidate. Candidate admission does not approve the drawing.

## Event-sourced resume

The ledger stores an append-only history of:

- complete candidate batches admitted against one exact ledger revision;
- independent review decisions reproduced from exact evidence.

Every event contains its prior ledger digest and its own digest. Verification reconstructs the initial ledger from the approved profile and replays every event. Changed state, missing events, reordered events, stale work orders and altered receipts fail verification.

The current ledger JSON can therefore be retained by a local agent, copied to another governed workspace and resumed with the same profile. No in-memory chat context is required.

## Work batches

A work batch contains one or more work orders sharing the same ledger revision. The batch must be applied atomically. A partial receipt set is rejected, preventing half-applied concurrent batches from creating ambiguous dependency state.

Each work order binds:

- profile, ledger, drawing and attempt identity;
- deterministic idempotency key;
- key-pose, breakdown or in-between role;
- pose intent, phase, contacts, root offset and exposure;
- camera, identity, performance, style and delivery locks;
- exact content-addressed identity and direction references;
- exact dependency and neighbouring candidate references;
- accepted drawings that must remain unchanged;
- retry failure codes and repair instructions where applicable;
- output canvas, alpha, pivot and candidate-only status;
- drawing and whole-sequence review requirements.

Identity and direction-master references must include immutable content digests before work becomes ready. Dependency drawings are resolved from candidate receipts already present in the ledger.

## Targeted repair

Only drawing IDs in the current independent review retry queue become repair work orders. Accepted drawings are listed in `preserveDrawingIds` and remain immutable. A repair uses the next attempt number and carries the exact failure codes, remediation and authoritative dependencies from the review decision.

The profile's attempt, review-cycle and no-progress limits remain authoritative. The ledger does not weaken them.

## MCP roles

Both repositories register `evavo-animation-frame-ledger-v1`.

Art Studio tools:

- `create_animation_frame_ledger_v1`
- `verify_animation_frame_ledger_v1`
- `summarize_animation_frame_ledger_v1`
- `compile_next_animation_frame_work_batch_v1`
- `compile_animation_frame_candidate_receipt_v1`
- `apply_animation_frame_candidate_batch_v1`

Cel Animation Studio tools:

- `verify_animation_frame_ledger_v1`
- `summarize_animation_frame_ledger_v1`
- `review_animation_frame_ledger_v1`

The server refuses to start when provider execution, automatic creative approval, artifact promotion, repository mutation, Git commit, Git push, runtime activation or publication is enabled. It performs no provider call, network request, artifact promotion or repository mutation.

## CLI

```powershell
node tools/animation_frame_work_ledger_v1.mjs create create-input.json ledger.json
node tools/animation_frame_work_ledger_v1.mjs verify verify-input.json
node tools/animation_frame_work_ledger_v1.mjs next-work next-work-input.json work-batch.json
node tools/animation_frame_work_ledger_v1.mjs candidate-receipt candidate-input.json receipt.json
node tools/animation_frame_work_ledger_v1.mjs apply-candidates apply-input.json next-ledger.json
node tools/animation_frame_work_ledger_v1.mjs review review-input.json reviewed-ledger.json
node tools/animation_frame_work_ledger_v1.mjs summary ledger.json
```

Output files are create-only. Existing evidence is never overwritten.

## Portability and safety

The ledger, work orders and receipts are path-free. Absolute paths, filesystem-path fields, URLs, URIs and credential-like fields are rejected. Media is identified by artifact ID, content SHA-256, byte length, media type and dimensions.

The shared source, MCP server, JSON schema and lock are byte-identical between Art Studio and Cel Animation Studio. Repository tests verify those hashes and role boundaries.
