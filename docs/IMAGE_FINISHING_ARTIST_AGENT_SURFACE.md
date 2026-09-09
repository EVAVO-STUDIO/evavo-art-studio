# Image Finishing Artist agent surface

Art Studio already contains deterministic raster finishing, real-alpha recovery, granular Project Art editing, defect detection, artifact signals, image-review profiles, similarity checks and frame/sequence QA. This bridge makes the review/planning half of that stack simple for ChatGPT, Claude, Codex and other MCP-compatible agents to call before they authorise edits.

## Why this exists

Agents should not jump directly from “this image looks wrong” to destructive image processing. The finishing-artist bridge provides a read-only first pass that:

- selects a role-aware review profile;
- scores technical image quality and reports concrete defects;
- segments connected defect regions and returns the existing preservation-first finishing plan;
- surfaces ringing, posterisation, suspicious resampling, halo, alpha, blockiness and related artifact signals;
- compares optional references for exact/near duplication;
- reviews whole frame/reference sets for technical continuity outliers;
- ranks which frames deserve human attention first;
- keeps semantic, identity, anatomy, typography and art-direction judgement explicitly in visual review;
- never claims pixel heuristics can prove an image was AI-generated.

The output is evidence and a repair plan, not an approval. Actual changes continue through the governed raster-finishing, Project Art workspace, provider edit/inpaint and promotion paths.

## Start the server

Build the domain packages first so `packages/media/dist` exists:

```powershell
pnpm run build:domain
$env:EVAVO_IMAGE_REVIEW_ALLOWED_ROOTS = "C:\GitRepos;C:\EVAVO"
node tools/image_finishing_artist_mcp.mjs
```

The server uses MCP stdio protocol `2025-03-26`. It reads image bytes only from canonical paths admitted by `EVAVO_IMAGE_REVIEW_ALLOWED_ROOTS`. It has no write operation and returns JSON evidence rather than image bytes.

## Agent tools

### `evavo_image_finishing_artist_capabilities`

Machine-readable discovery for agents. It explains review signals, limitations, downstream editing routes and whether allowed roots are configured.

### `evavo_review_image_for_finishing`

Review one image. Useful before resize/export, background removal, alpha cleanup, localized repair, provider inpaint, animation admission or publication. Optional `compareAgainst` paths identify duplicates/near-duplicates without placing image bytes in MCP arguments.

Recommended inputs:

```json
{
  "inputPath": "C:\\GitRepos\\game\\art\\hero.png",
  "intendedRole": "sprite",
  "compareAgainst": [
    { "id": "approved-reference", "path": "C:\\GitRepos\\game\\art\\hero-approved.png" }
  ]
}
```

### `evavo_review_image_set_consistency`

Review 2–128 images as one technical set. The tool computes a robust median baseline and flags outliers in canvas/aspect ratio, alpha state, quality score, luminance, contrast, sharpness and visible mass. It ranks problematic items first.

This is deliberately a **technical continuity** test. Large pose changes may legitimately change silhouette mass and visual metrics. Identity, costume, anatomy, perspective, animation arcs and style still require the existing visual/model-assisted review path.

## AI-generated imagery

Do not expose a boolean “AI generated / not AI generated” verdict based on pixels. Such classifiers are not reliable enough for production governance and can mislabel compressed, retouched, illustrated or synthetic-looking human work.

Art Studio instead separates three questions:

1. **Provenance:** do trusted generation/edit records, content credentials or source lineage exist?
2. **Technical artifacts:** are there halos, impossible alpha, posterisation, ringing, suspicious scaling, blockiness, defect regions or inconsistent frames?
3. **Visual quality:** does the actual image have broken anatomy, gibberish text, repeated structures, poor composition, generic detail, identity drift or style mismatch?

Only the first can establish trusted origin. The second is deterministic evidence. The third requires a capable visual reviewer and, for high-value work, human approval.

## Finishing workflow

A strong default agent loop is:

1. review the image or set with this bridge;
2. inspect the highest-priority visual issues;
3. route deterministic defects to raster finishing or Project Art granular operations;
4. route semantic defects to governed provider edit/inpaint with explicit masks/references;
5. rerun review against the edited candidate;
6. compare with approved references/adjacent frames;
7. create hostile-background alpha proofs when transparency is involved;
8. promote only after visual review and the existing quality gates pass.

This keeps originals immutable and makes “finishing artist” automation iterative instead of destructive.
