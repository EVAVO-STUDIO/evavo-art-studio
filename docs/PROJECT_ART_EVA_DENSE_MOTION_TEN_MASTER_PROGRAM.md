# EVA dense-motion ten-master production program

The v2 ten-master program closes a policy gap between the original EVA dense-motion work order and the later release-evidence standard.

## Why v2 exists

The original `evavo.project-art-eva-dense-motion-work-order.v1` correctly retained the live three-frame rig at ordinals 4, 5 and 6 while producing new mastering jobs for ordinals 1, 2, 3, 7, 8, 9 and 10. Later release evidence tightened the final production gate: **all ten ordinals require new deterministic dense masters**. The current identity-motion-v3 assets at 4, 5 and 6 are fallback provenance only and may not satisfy the final dense release.

The v1 work order remains immutable evidence. The v2 program supersedes its production policy without deleting or rewriting it.

## Production truth

The v2 program binds the same ten hash-pinned 1024×1536 source frames and reuses the canonical `frameJob()` mastering path for all ten ordinals.

- 10 new deterministic master jobs are required.
- Ordinals 1, 2, 3, 7, 8, 9 and 10 remain normal new-master jobs.
- Ordinals 4, 5 and 6 become `current-fallback-remaster-required` jobs.
- Existing 4/5/6 identity-motion-v3 assets remain available for rollback until the complete ten-master family is atomically activated.
- Existing fallback public IDs, asset IDs and image hashes cannot satisfy final release.
- Every final job targets the create-only `evavo/avatar-runtime/eva-female/dense-motion/eva-20260809-153620-frame-NN-master-v1` namespace.
- Partial promotion and mixed old/new family promotion remain forbidden.
- All 10 continuity edges are required, including 10 → 1 loop closure.

The target Runtime snapshot is `@evavo/avatar-runtime` 0.38.0 at commit `c736a6d6648d3f02ac5745458a4cea0e02eab00c`, tree `ab17548e5178acd4e33d74a9fb57569482381a33`. The older source-family Runtime pin remains provenance for the source bytes and is not rewritten.

## Compile

```bash
node scripts/compile-project-art-eva-dense-motion-ten-master.mjs \
  --program-id eva-dense-motion-ten-master-v2 \
  --actor-id <actor> \
  --created-at <iso-8601> \
  --output /trusted/eva-dense-motion-ten-master-v2.json
```

The output is create-only. Compilation grants no image mutation, Cloudinary upload, approval, sequence release, repository mutation or Runtime activation authority.

## Per-frame path

Every ordinal reuses the existing frame production path:

1. materialize the exact source read-only;
2. inspect source canvas and encoding;
3. compile dense candidate assurance;
4. author and review alpha matte;
5. master production straight-alpha RGBA;
6. run the canonical avatar frame finisher;
7. perform technical inspection;
8. record independent creative identity approval;
9. publish an immutable create-only Cloudinary master under separate authorization;
10. record Runtime frame evidence.

For 4/5/6, the old master is retained only inside `legacyFallback` metadata. The new Cloudinary target must differ from the old identity-motion-v3 public ID and must receive a new immutable asset ID and master SHA-256.

## Family release gate

No Runtime activation may occur until all ten new masters, all per-frame assurance/mastering/approvals, all ten unique immutable master identities, every adjacent continuity edge, final-to-first loop closure, regenerated sequence/release evidence and browser playback evidence are complete.

Until then the existing three-frame rig stays live as the rollback-safe presentation, and the website must continue using the quality-first high-resolution fallback rather than claiming complete authored animation.
