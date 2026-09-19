# Visual Continuity Storage

Visual continuity state is stored in the existing EVAVO content-addressed artifact store. The server operator fixes the root through `EVAVO_ART_ARTIFACT_ROOT`; callers cannot replace that root. Writes additionally require `EVAVO_ART_ALLOW_WRITES=true`.

## Why this is separate from chat

A long art programme must survive model changes, conversation limits, workstation restarts and work performed by different agents. The current visual bible, session, approvals and handoffs therefore live as immutable JSON artifacts with named references rather than as remembered chat state.

Each stored object has:

- immutable content bytes;
- a content SHA-256 and content-addressed artifact ID;
- a canonical descriptor and descriptor SHA-256;
- a storage class and media type;
- source-artifact lineage;
- exact labels for project, bible, session, work item and destination;
- a named reference with generation, previous artifact and update actor.

## Namespace and keys

The logical address is the exact project ID and bible ID supplied to the tools. Physical reference path segments are bounded, readable prefixes plus deterministic SHA-256 suffixes:

```text
visual-continuity/
  project-<project-prefix>-<digest>/
  bible-<bible-prefix>-<digest>/
```

Named references inside that namespace use the same bounded-key rule:

```text
bible
session-<session-prefix>-<digest>
approval-<work-item-prefix>-<session-and-item-digest>
handoff-<target-studio-prefix>-<session-target-receiver-digest>
```

This avoids path-length and safe-segment failures even when valid protocol IDs use their maximum length. The exact unshortened IDs remain in artifact labels and JSON content; the digest prevents prefix collisions. Callers never construct physical keys themselves.

## Write ordering

The required order is:

1. `persist_visual_continuity_bible`
2. `persist_visual_continuity_session`
3. `persist_visual_continuity_approval` for every approved work item
4. `persist_approved_visual_continuity_handoff`

A dependent write verifies both the supplied document and the current stored lineage. A session cannot be stored against a different bible. An approval cannot be stored until the exact session is current. An approved handoff cannot be stored until every receipt is present and matches the handoff.

## Optimistic concurrency

Every persistence request supplies:

```json
{
  "expectedGeneration": 0,
  "actor": "chatgpt"
}
```

Generation `0` means the named reference must not exist. Subsequent updates must use the generation returned by the latest load or persistence response. If another worker advanced the reference, the store returns `ARTIFACT_REFERENCE_CONFLICT`; the stale worker must load the current state, reconcile it and compile a new deterministic session rather than overwriting newer work.

Writing identical bytes is idempotent. It returns the existing reference without creating a new generation.

## Resume flow

Use `load_visual_continuity_workspace` with project, bible and optional session identifiers. The tool derives the physical keys, verifies immutable object bytes, descriptor identity, bible hash and session hash, and then returns the current documents and reference generations.

A resuming agent must:

1. load the current bible and session;
2. retain the returned reference generations;
3. compile the next work packet from those exact documents;
4. evaluate the complete packet;
5. persist the new session with the previously read generation;
6. reload on any conflict and never force an overwrite.

`load_visual_continuity_artifact` reads one exact immutable artifact by `artifact_<sha256>` ID. It is useful for reviewing previous generations and source lineage without changing the current named reference.

## Authority boundary

Storage proves identity, lineage and concurrency. It does not call an image provider, inspect visual quality, make a creative decision, mutate source art, change canon, write to a target repository, activate runtime assets or publish anything. Those actions remain separate and evidence-gated.
