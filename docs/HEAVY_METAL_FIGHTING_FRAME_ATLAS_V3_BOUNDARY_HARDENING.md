# HEAVY METAL FIGHTING — Frame atlas-v3 compiler boundary hardening

Status: governed immutable-input and create-only plan-publication boundary  
Source authority: delivery-ready Frame body receipt chains and named-human-approved style proof  
Target-repository mutation: prohibited

## Why this boundary exists

The atlas-v3 compiler already derives one fixed 224-source plan and refuses to claim game activation authority. Two caller and filesystem boundaries still required explicit governance:

1. the compiler retained caller-owned receipt and approval arrays across asynchronous repository, style-proof and workspace checks;
2. plan-file output used a direct create-only write, without an owned immutable publication request, same-directory staging, atomic no-replace publication or exact post-write readback.

This hardening closes both gaps without changing atlas geometry, source semantics, target paths or activation authority.

## Immutable compiler admission

The stable `frame-atlas-v3-delivery.mjs` entrypoint now captures the complete compile request synchronously before its first asynchronous operation.

Accepted input is bounded ordinary JSON only. Admission rejects:

```text
Proxy objects
accessor properties, without invoking getters or setters
symbolic properties
cycles
sparse or extended arrays
exotic prototypes
unsafe prototype keys
functions, undefined and bigint
NaN and infinities
excessive nesting, nodes or retained bytes
unsupported top-level fields
```

After capture, later caller mutation cannot change the Frame id, workspace root, delivery-ready receipt evidence, style-proof evidence or compile timestamp used by the core compiler.

## Closed plan re-admission

Before a plan can be written, the publication boundary re-admits its complete top-level contract and self-hash. It also proves:

- exactly 224 contiguous fixed-grid sources;
- exact 160×160 source geometry and slot coordinates;
- 26 body-batch evidence records covering all 224 unit receipt heads exactly once;
- reserved slots 224–255;
- the canonical production-master-v3 target;
- `activationReady: false` with retained activation blockers;
- source mutation, target-repository mutation, Git mutation, deployment, publication and force-push authority remain false.

A caller cannot add an authority claim, recompute `planSha256`, and make that claim admissible.

## Governed plan-file publication

`compile ... --output <plan.json>` now requires a new `.json` destination inside the persistent Artist Workspace.

Publication performs:

1. complete immutable plan re-admission;
2. workspace and output-directory path-chain validation;
3. rejection of symbolic directory components and existing destinations;
4. exclusive mode-`0600` same-directory staging;
5. exact UTF-8 write and file synchronisation;
6. atomic no-replace hard-link publication;
7. stage-link removal and directory synchronisation;
8. exact file identity, one-link, byte-count, SHA-256 and byte-for-byte readback verification;
9. transaction-owned cleanup only if the operation fails.

The output is never truncated or replaced. A second invocation against the same destination fails closed.

## Compatibility

The original deterministic implementation now lives in:

```text
scripts/heavy-metal-fighting/frame-atlas-v3-delivery-core.mjs
```

The established public path remains:

```text
scripts/heavy-metal-fighting/frame-atlas-v3-delivery.mjs
```

That stable path wraps the core with immutable admission and governed publication, so existing CLI and module imports receive the hardened behavior without changing the atlas plan schema or protocol version.

## Authority boundary

This tranche may read approved workspace evidence, compile one deterministic plan and write one new plan file inside the Artist Workspace.

It may not:

```text
change source or master pixels
approve art
promote candidates or masters
build or activate the game-side atlas
mutate steel-dominion
commit or push through the runtime
deploy
publish
force-push
```
