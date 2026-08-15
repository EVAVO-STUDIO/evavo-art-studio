# Project Art avatar animation suite

The avatar animation suite turns one immutable Cloudinary identity source into a deterministic production plan for either `eva-female` or `top-hat-man`. It is a planning boundary: it never calls a provider, approves a candidate, mutates the source, activates the runtime or publishes files.

## Production matrix

Every plan contains 25 clips and 332 planned images:

- four anti-repeating idle loops plus attention, listening and thinking;
- six talk performances with explicit talk-in and talk-out transitions;
- single and double blinks, nod, wave, reactions, sleep and wake;
- an EVA greeting or a Top Hat hat-tip with identity-specific geometry locks;
- 315 full-character frames and 17 full-canvas, pixel-registered mouth and eye layers.

Talking body frames deliberately use a separated mouth underlay. Runtime visemes select registered mouth poses from exact audio timing, with a 64 ms minimum visible hold, instead of crossfading whole-character mouth shapes. This keeps the body performance smooth while allowing lip motion to follow the rendered audio clock.

## Transparency and continuity

Each frame job is conditioned on the canonical identity and its previous approved frame. Loop endings also reference the opening frame. All jobs preserve the same canvas, pivot and baseline.

Native provider alpha is preferred. If it is unavailable, the job declares one flat green, magenta or blue matte selected for low colour collision with the character. Mastering uses border-connected segmentation, edge-colour unmixing and hidden-RGB cleanup. Painted checkerboards, transparency grids, scenery, gradients and contact sheets are forbidden provider output and remain blocking even when they visually resemble transparency.

Frames require two independent inspectors at 0.95 confidence, adjacent-frame continuity evidence and loop-closure evidence before they can enter an approved atlas. Top Hat frames additionally block any crown, brim, band, face, moustache or costume drift.

## Compile a create-only plan

Prepare an exact `evavo.project-art-avatar-animation-suite-request.v1` JSON document with:

- a canonical request timestamp and safe session identifier;
- character ID `eva-female` or `top-hat-man`;
- an immutable Cloudinary source identity, dimensions and HTTPS delivery URL;
- target canvas `1024x1536`;
- exactly four idles, six talks, separate mouth and eye layers, exact audio timing, genuine transparency, no fake grid and professional frame assurance;
- every authority flag set to `false`.

Then run:

```bash
pnpm run project-art:avatar-animation:compile -- \
  --request /trusted/avatar-suite-request.json \
  --output /trusted/create-only-avatar-suite-plan.json \
  --compiled-at 2026-08-15T00:00:00Z
```

The output path must not already exist. The plan binds the normalized request and the full plan with SHA-256 hashes, retains lossless RGBA PNG masters and declares lossless WebP/PNG runtime delivery.

Trusted agents can expose the same compiler over stdio with `pnpm run project-art:avatar-animation:mcp`. File compilation remains root-confined and write-gated; the capabilities call is read-only.

## Verification

Run the focused contract, file-safety and MCP tests with:

```bash
pnpm run project-art:avatar-animation:check
```
