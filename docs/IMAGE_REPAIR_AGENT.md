# Image Repair Agent

Art Studio now exposes a review-first image repair surface for ChatGPT, Claude, Codex and compatible MCP agents. It turns the existing image review, preservation polish, localized edit and post-edit quality gates into an explicit repair decision and execution workflow without weakening the original non-destructive contracts.

## Repair routing

`planImageRepairDecision` returns one of six dispositions:

- `no-repair` — deterministic review found no technical repair to perform;
- `safe-local-repair` — the source is admitted for bounded preservation polish;
- `localized-repair` — a candidate may be composited only through an explicit mask;
- `semantic-edit` — a visual reviewer identified a semantic problem requiring a provider/human edit;
- `reacquire-or-regenerate` — the source is too soft/resampled for honest deterministic reconstruction;
- `human-review` — the evidence is ambiguous, too broad, or otherwise outside the bounded repair budget.

The router never mutates a source, never approves an output, and never treats pixel artifact heuristics as proof of AI authorship.

## MCP server

Build the media package, confine allowed paths, then start the server:

```powershell
pnpm --filter @evavo/art-media build
$env:EVAVO_IMAGE_REPAIR_ALLOWED_ROOTS = "C:\GitRepos;C:\EVAVO"
node tools/image_repair_mcp.mjs
```

Planning is read-only. To enable an exact repair call:

```powershell
$env:EVAVO_IMAGE_REPAIR_ALLOW_WRITES = "true"
```

Every write call also requires `confirmLocalWrite=true`.

### `evavo_plan_image_repair`

Reviews the actual source and chooses the smallest safe route. A capable visual agent may pass explicit `visualFindings` such as `malformed-text`, `identity-drift`, `style-mismatch` or `broken-anatomy`; these never become deterministic filter fixes.

### `evavo_apply_preservation_image_repair`

Only runs when a fresh source review admits `safe-local-repair`. It uses the existing preservation polish to clean transparent RGB and fringe contamination while protecting fully opaque RGB. Before any file is written it:

1. executes the candidate entirely in memory;
2. compares source and candidate with `reviewExistingImageEdit`;
3. rejects regressions/failures;
4. runs the full image-review orchestrator again;
5. writes a new PNG, review proof, difference proof and receipt using create-only paths.

The source is never overwritten. The receipt remains `approvalState: "unapproved"` even when the candidate is technically promotion-ready.

### `evavo_apply_masked_candidate_image_repair`

Takes a source, candidate and same-size explicit mask. The existing localized edit compositor copies source pixels outside the authorized mask, and this server additionally enforces a configurable mask-coverage budget (12% by default, maximum 35%). It performs the same post-edit quality/review admission before writing.

For semantic findings involving identity, style or wrong content, a `referencePath` is required and recorded in the receipt.

## Recommended agent loop

1. Run the finishing-artist reviewer or `evavo_plan_image_repair`.
2. If the route is `safe-local-repair`, call preservation repair with explicit write confirmation.
3. If the route is `localized-repair`, author/review a mask and candidate, then call the masked repair tool.
4. If the route is `semantic-edit`, use governed provider/human editing to create a candidate and explicit mask/reference first.
5. If the route is `reacquire-or-regenerate`, do not sharpen invented detail into the asset; replace the source.
6. Inspect generated proof files and keep the output unapproved until existing promotion gates pass.

This makes the image-enhancement layer an auditable finishing workflow instead of a vague one-click "enhance" operation.
