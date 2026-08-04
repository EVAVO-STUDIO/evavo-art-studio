# Bulk game asset audit

The repository inspector now produces a bounded, deterministic media audit rather than a filename-only inventory. The same result is available through:

```powershell
pnpm art -- inspect --repo C:\GitRepos\Brass_Brine --output artifacts\brass-brine-art-audit.json
```

and the existing MCP tool:

```text
inspect_art_repository
```

## Evidence produced

For every recorded art, animation, source, metadata and engine-resource file the audit records:

- repository-relative path, extension, byte length and SHA-256;
- inferred game-art role;
- role-owned transparency policy;
- decoded dimensions and PNG alpha use when the bounded probe supports it;
- static Godot, C#, GDScript, JavaScript, TypeScript, JSON and resource references;
- a conservative runtime format and folder recommendation;
- blocking and review findings;
- numbered animation-family membership and frame index.

Repository-level output adds:

- exact duplicate groups;
- missing asset references;
- animation families, gaps, dimension consistency and initial timing guidance;
- review-only cleanup candidates;
- role and transparency-policy summaries.

The audit is read-only. It never changes, moves or deletes a source or runtime file.

## Role-aware transparency

A present RGBA channel is not treated as proof of transparency. Supported PNG layouts are decompressed and inspected to distinguish:

```text
none
opaque-channel
meaningful
fully-transparent
unknown
```

The role policy is deliberately asymmetric:

```text
dialogue close-up
  preserve the authored opaque or black presentation stage

standing character, crew cut-out, UI icon, ship profile, weather overlay
  require meaningful alpha

location background, port map, document plate
  preserve the authored opaque plate unless an explicit contract says otherwise
```

This prevents a black-backed dialogue portrait from being damaged by indiscriminate threshold removal while also preventing an all-opaque RGBA upload from masquerading as a transparent standing sprite.

Compressed WebP, GIF, SVG and other formats may declare alpha without allowing the bounded header probe to prove pixel use. Those files remain `unknown` and must pass the existing decoded-pixel frame-quality tool before promotion.

## Code demand and deletion safety

The inspector scans bounded text and Godot resource files for `res://` and repository-relative media paths. It reports both found demand and missing referenced assets.

A zero static reference is not deletion authority. Dynamic path construction, manifests, editor assignments, DLC catalogues and runtime discovery can own an asset without a literal path in source. Therefore:

- exact duplicates are only `review-exact-duplicate` candidates;
- apparently unused runtime files are only `review-unreferenced-runtime` candidates;
- every cleanup candidate requires human approval;
- RAW_ART and editable masters remain preserved until every migration decision, runtime replacement, duplicate review and visual acceptance is complete.

## Animation guidance

Numbered files are grouped deterministically by directory and stem. The audit reports missing indices and canvas consistency, then supplies a conservative initial timing profile:

- fog, water, glint and reflection: slow playback;
- rain and snow: ordinary short loops with varied starting phase;
- storm spray and foam: moderate playback with seam review;
- run, walk, talk and idle: motion-specific starting rates.

These rates are not final animation authority. Approved sequence manifests still own exact per-frame durations, frame order, pivots, baselines, ground contact, loop mode and deliberately linked cels.

## Runtime recommendations

Recommendations are non-destructive and follow these rules:

- retain editable or lossless source masters;
- use lossless WebP for alpha, icons, dialogue and document work;
- use visually lossless WebP for approved opaque backgrounds and maps;
- never silently upscale;
- never recursively compress a derivative;
- normalize runtime names to lowercase snake_case while retaining source identity and provenance.

The audit output is intended to drive the existing candidate, alpha-mastering, frame-quality, sequence-quality, atlas and Godot delivery stages. It does not bypass selection, promotion or human visual approval.
