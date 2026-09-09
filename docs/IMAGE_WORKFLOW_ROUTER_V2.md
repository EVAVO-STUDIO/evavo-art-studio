# Image Workflow Router v2

Image Workflow Router v2 is the preferred discovery and routing entry point for ChatGPT, Claude, Codex and compatible agents working with images in Art Studio.

It does **not** replace the underlying image tools. It decides which governed surface should be used, what evidence must exist before that surface is called, what privilege class the step requires, and where the workflow must stop for review.

Canonical capability manifest:

- `config/image-workflow-router-v2.capabilities.json`
- MCP entrypoint: `tools/image_workflow_router_v2_mcp.mjs`
- discovery tool: `evavo_image_workflow_router_v2_capabilities`
- routing tool: `evavo_route_image_workflow_v2`

## Position in the stack

```text
ChatGPT / Claude / Codex / operator
                |
                v
      Image Workflow Router v2
                |
      +---------+----------+--------------------+
      |                    |                    |
      v                    v                    v
review / QA          bounded editing       engine / delivery
      |                    |                    |
      +--------------------+--------------------+
                           |
                           v
                 re-review actual output
                           |
                           v
                  delivery preflight
                           |
                           v
                 finalization admission
                           |
                           v
                 explicit approval gate
```

Router v2 sits above and preserves both earlier contracts:

- `config/executable-image-pipeline.v1.json` remains the deterministic pixel-processing backend contract.
- `config/local-image-quality-routes-v1.json` remains the generation/model-quality routing contract.
- the original image agent router remains available for compatibility.

New agents should discover Router v2 first instead of memorising individual MCP names.

## Fifteen workflow goals

| Goal | Preferred route |
|---|---|
| `quality-review` | unified finishing packet, then specialist finishing evidence when needed |
| `frame-consistency` | ordered sequence finishing review; batch review only when temporal order is irrelevant |
| `reference-consistency` | approved-reference consistency review and optional diagnostic proof |
| `fake-transparency` | deterministic alpha mastering plus hostile-background proof |
| `natural-background-cutout` | governed segmentation/provider mask, bounded raster finishing, then proof/review |
| `local-technical-repair` | preservation-first or explicitly masked repair, followed by re-review |
| `semantic-repair` | governed provider/human candidate plus bounded mask and post-edit review |
| `resize-or-export` | deliberate derivative, finishing review, then delivery-integrity preflight |
| `learned-enhancement-review` | immutable source/candidate enhancement review session |
| `texture-review` | PBR/data-map review, preprocessing, UV checks and Godot material delivery |
| `runtime-effect` | bounded Godot sprite-effect planning/packaging |
| `raster-effect` | non-destructive raster/effect workflow with output re-review |
| `ai-artifact-assessment` | advisory artifact/generated-detail evidence plus provenance and visual review |
| `delivery-preflight` | read-only final container, alpha, colour, metadata and size-budget review |
| `finalize-image` | combined finishing + delivery admission before explicit approval |

## Privilege separation

Every routed step belongs to one of five privilege classes:

1. `read-only` - inspect, score, compare, plan or verify evidence without changing files.
2. `write-gated-create-only` - create a derivative/proof/pack while preserving the canonical source.
3. `candidate-and-mask-required` - a localized write may occur only with the explicit candidate and mask/coverage contract.
4. `provider-or-human-candidate-required` - semantic content changes require a reviewed candidate from a governed provider or person rather than an automatic filter pretending to solve the defect.
5. `execution-gated` - native tools such as Godot may be launched only through their explicit execution gate.

A read-only route must never silently escalate into a write or process launch.

## Finishing chain

The preferred finishing chain is:

```text
actual source/candidate
  -> finishing review packet
  -> reference / artifact / sequence evidence as relevant
  -> smallest safe repair route
  -> create-only or masked candidate
  -> re-review actual output
  -> delivery-integrity preflight
  -> finalization admission
  -> human / project / runtime approval
```

Finalization has four states:

- `blocked`
- `needs-image-finishing`
- `needs-delivery-review`
- `ready-for-approval-review`

`ready-for-approval-review` is intentionally **not approval**. It never authorizes automatic publication or promotion.

## Sequence rule

Use ordered sequence finishing for animation/frame work. It combines per-frame finishing decisions with technical continuity and neighboring-frame similarity. Duplicate/near-duplicate frames are evidence for review, not automatic failure, because legitimate animation holds exist.

Numeric continuity checks do not prove acting, pose arc, identity, style, anatomy or motion quality. Those remain visual/semantic review concerns.

## Delivery rule

Delivery-integrity review operates on the actual final encoded derivative and can enforce:

- intended encoded format
- required or forbidden alpha
- colour-space/container compatibility
- EXIF/XMP/orientation risk
- megapixel budget
- encoded byte budget
- effective print DPI when physical dimensions are supplied
- game data-map handling guidance

It is read-only. It does not silently colour-convert, strip metadata or rewrite the master.

## AI-artifact and provenance rule

Artifact signals can identify suspicious technical patterns such as ringing, posterisation, resampling artifacts, repeated local detail and detail-density imbalance. They are diagnostic evidence only.

Pixel heuristics are not a reliable proof that an image was generated by AI. When authorship matters, use trusted provenance, generation lineage, signed/content-credential evidence when available, source history and explicit human review.

## Agent operating rules

- Bind exact local paths, hashes, masks, references and receipts rather than relying on prose descriptions of prior images.
- Preserve canonical originals; create derivatives unless an explicitly governed workflow says otherwise.
- Re-review the actual output after every pixel-changing operation.
- Use approved references when identity/style consistency matters.
- Do not run photographic enhancement on numeric texture/data maps.
- Do not treat technical scores as creative approval.
- Do not promote an image simply because the router or finalization surface says it is ready for approval review.

## Validation

The repository-wide modern image surface doctor is:

```powershell
pnpm run image-agent-surfaces:check
```

Router v2 also has a focused doctor:

```powershell
node scripts/check-image-workflow-router-v2.mjs
```

The root repository `check` command already includes `image-agent-surfaces:check`, so the modern image contracts are part of normal validation rather than an optional side path.
