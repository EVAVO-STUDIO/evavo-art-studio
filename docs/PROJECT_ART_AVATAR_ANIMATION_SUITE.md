# Project Art avatar animation suite

The avatar animation suite turns immutable identity references into a deterministic production plan for either `eva-female` or `top-hat-man`. The canonical Cloudinary portrait remains the face, character-design and style lock. A v2 request can additionally bind a full-body RGBA animation master by repository, commit, tree, asset path, asset SHA-256, manifest path and manifest SHA-256. It is a planning boundary: it never calls a provider, approves a candidate, mutates a source, activates the runtime or publishes files.

## Production matrix

Every v3 plan contains 25 clips and 749 planned images:

- four anti-repeating idle loops plus attention, listening and thinking;
- six talk performances with explicit talk-in and talk-out transitions;
- single and double blinks, nod, wave, reactions, sleep and wake;
- an EVA greeting or a Top Hat hat-tip with identity-specific geometry locks;
- 732 full-character frames and 17 full-canvas, pixel-registered mouth and eye layers.

Authored motion now has a 24 fps floor and a 30 fps preferred cadence. The runtime presents those approved frames on a refresh-synchronised 60 fps display clock. It may use a bounded 42–96 ms alpha crossfade between adjacent approved body frames, but never fabricates provider frames, never crossfades whole-body viseme substitutions, and keeps a registered mouth layer independent from body cadence. Reduced-motion presentation remains locked to the reviewed neutral frame.

Talking body frames deliberately use a separated mouth underlay. Runtime visemes select registered mouth poses from exact audio timing, with a 64 ms minimum visible hold, instead of crossfading whole-character mouth shapes. This keeps the 24–30 fps authored body performance moving independently while the browser compositor presents it at 60 fps and lip motion follows the rendered audio clock.

## Transparency and continuity

Each frame job is conditioned on the canonical identity and its previous approved frame. When a full-body animation master is present, every one of the 315 frame jobs and 17 registered pose jobs also names the `animation-identity-master` role and carries the same SHA-256 identity-reference-set binding. Loop endings additionally reference the opening frame. All jobs preserve the same canvas, pivot and baseline.

Top Hat v2 requests require the full-body master. The repository source is accepted only from `EVAVO-STUDIO/evavo-avatar-runtime`, only from the character's bounded candidate directory, only with full Git object IDs and SHA-256 values, and only when it exactly matches the `1024x1536` target canvas. Its lifecycle must remain `unapproved`, non-production and non-activatable while `maySeedAnimationGeneration` permits controlled key-pose work. The master cannot grant approval or runtime authority.

Native provider alpha is preferred. If it is unavailable, the job declares one flat green, magenta or blue matte selected for low colour collision with the character. Mastering uses border-connected segmentation, edge-colour unmixing and hidden-RGB cleanup. Painted checkerboards, transparency grids, scenery, gradients and contact sheets are forbidden provider output and remain blocking even when they visually resemble transparency.

Frames require two independent inspectors at 0.95 confidence, adjacent-frame continuity evidence and loop-closure evidence before they can enter an approved atlas. Top Hat frames additionally block any crown, brim, band, face, moustache or costume drift.

Provider sheets rendered against a declared high-chroma matte must pass `master-alpha --suppress-chroma-spill` before frame extraction. This explicit post-recovery gate unmixes residual key colour, reduces contaminated edge alpha and records deterministic suppression evidence; it never treats a painted checkerboard as transparency. Rows that touch the provider canvas edge are excluded rather than promoted with cropped hats, hands or shoes.

## Compile a create-only plan

Prepare an exact `evavo.project-art-avatar-animation-suite-request.v2` JSON document with:

- a canonical request timestamp and safe session identifier;
- character ID `eva-female` or `top-hat-man`;
- an immutable Cloudinary source identity, dimensions and HTTPS delivery URL;
- `animationIdentityMaster`: `null` for a character that does not yet have one, or a hash-bound repository alpha candidate. It is mandatory for Top Hat v2 requests;
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

The output path must not already exist. The plan binds the normalized request and the full plan with SHA-256 hashes, retains lossless RGBA PNG masters and declares lossless WebP/PNG runtime delivery. New compiles emit `evavo.project-art-avatar-animation-suite-plan.v3`; v1 and v2 plans remain accepted for deterministic inspection.

Legacy Cloudinary-only v1 requests and their v1 plan identifier remain permanently discoverable for deterministic compatibility, but they do not claim a full-body animation-master reference. New Top Hat production handoffs compile to v2.

Trusted agents can expose the same compiler over stdio with `pnpm run project-art:avatar-animation:mcp`. File compilation remains root-confined and write-gated; the capabilities call is read-only.

## Verification

Run the focused contract, file-safety and MCP tests with:

```bash
pnpm run project-art:avatar-animation:check
```

