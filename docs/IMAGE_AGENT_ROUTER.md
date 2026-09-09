# Image Agent Router

The image router gives ChatGPT, Claude, Codex and other trusted agents one read-only discovery surface for Art Studio image work. It does not process image bytes and carries no approval authority; it selects the correct governed workflow and explains prerequisites, stop conditions and expected evidence.

Use `evavo_route_image_task` when the agent knows the goal but not the underlying Art Studio subsystem.

## Goals

- `quality-review`
- `frame-consistency`
- `fake-transparency`
- `natural-background-cutout`
- `local-technical-repair`
- `semantic-repair`
- `resize-or-export`
- `learned-enhancement-review`
- `texture-review`
- `runtime-effect`
- `raster-effect`
- `ai-artifact-assessment`
- `finalize-image`

## Important routing distinctions

**Fake transparency** uses deterministic alpha recovery and hostile-background proofs when the background is a painted checkerboard, native alpha or a proven matte. An ambiguous natural background instead routes to a reviewed segmentation/provider mask; chroma-key heuristics must not guess the subject boundary.

**Technical repair** routes to preservation polish or a bounded candidate/mask composite. **Semantic repair** covers anatomy, malformed text, wrong content, identity/style drift and similar problems; these require an authored/provider candidate, explicit mask and references where appropriate.

**Resize/export** is not treated as super-resolution. If the requested output materially exceeds source detail, the route stops at source reacquisition or a governed learned-enhancement candidate and review.

**AI artifact assessment** may report deterministic artifacts, suspicious detail, consistency problems and provenance state. It must never claim that pixels alone prove whether an image was AI-generated.

## Start

```powershell
pnpm --filter @evavo/art-media build
node tools/image_agent_router_mcp.mjs
```

The router needs no filesystem root or write environment because it never reads or writes assets.
