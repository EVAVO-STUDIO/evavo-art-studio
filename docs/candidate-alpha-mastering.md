# Candidate alpha mastering

Status: implemented deterministic foundation

## Purpose

Provider image output is candidate material. A convincing green or magenta background is not transparency, and a provider-supplied alpha channel is not accepted without decoded-pixel evidence.

Art Studio therefore prevents fake alpha in the provider contract and classifies every candidate before alpha mastering:

```text
provider candidate
  -> immutable unapproved artifact
  -> native-alpha / checkerboard / matte classification
  -> native-alpha preservation or deterministic background recovery
  -> edge colour recovery
  -> transparent RGB bleed
  -> decoded-pixel sprite QA
  -> immutable mastered candidate + evidence
  -> later comparison, selection and approval
```

The mastering stage cannot update an approved artifact reference, write a final-delivery label or claim that identity and animation consistency have passed.

## Inpaint mask preflight

The OpenAI image adapter performs mask proof immediately before a remote inpaint request. It verifies:

- the base and mask are regular, decodable single-page raster images;
- both remain under the configured byte and pixel limits;
- dimensions match exactly;
- formats match;
- the mask uses a lossless PNG or WebP profile;
- the mask contains a real alpha channel;
- at least one pixel is transparent or partially transparent;
- the exact base and mask SHA-256 values are retained in adapter evidence.

The editable base remains the first `image[]` part and the mask is sent separately. Other identity, direction, motion and style references follow in stable role order.

The provider is never called when this proof fails. The public request validator still checks semantic reference roles; the worker-side preflight checks the real bytes.

OpenAI image-edit guidance is available at:

- <https://developers.openai.com/api/docs/guides/image-generation>
- <https://developers.openai.com/api/docs/models/gpt-image-2>

## Smart background classification

The recovery kernel uses evidence, not a global colour-delete guess:

1. Detect a visible periodic two-colour checkerboard from the border, including neutral or strongly chromatic grids, low-contrast white/grey provider previews, nonstandard or resampled tile sizes, foreground-heavy canvases and grids wrapped in a token transparent rim. Robust parity colour modes prevent a large character from averaging the grid signal away. If confidence is high, model its tile size, phase and both colours, recover the foreground alpha, and verify every originally visible recovered pixel by compositing it back over the detected grid.
2. Before trusting existing alpha, reject a token-alpha bypass when the declared matte—or a safely inferred high-chroma replacement—still dominates the visible border band. Composite the existing alpha over only that proven matte, re-extract it and retain recomposition evidence.
3. Otherwise preserve native alpha only when it has meaningful coverage and the complete canvas edge is transparent. Hidden RGB is canonicalized and only bounded subject-colour bleed is restored beside the silhouette.
4. Otherwise use the matte declared by the provider request.
5. If the provider ignored that matte, infer a replacement only when one flat, highly saturated colour confidently owns the visible border band. Black, white and grey are never inferred as destructive keys.
6. Fail closed when none of those classifications is sufficiently supported.

A checkerboard is never accepted as transparency merely because it looks familiar. It becomes eligible only after the painted RGB grid has been removed, real alpha exists, edge colours have been reconstructed, and the normal decoded-pixel QA no longer detects a grid or flat matte.

## Border-connected matte segmentation

A global colour deletion is unsafe because the subject may legitimately contain the same green, blue or magenta selected for extraction. The strict chroma primitive still accepts only an opaque intermediate. When the classifier proves a solid painted matte behind a token transparent rim, it first composites the source's existing alpha over that exact matte; this makes the bypass explicit and auditable without mixing unproved alpha into segmentation.

Art Studio instead:

1. Requires an explicitly declared high-chroma key; black, white and grey are rejected as unsafe destructive mattes.
2. Decodes the candidate into sRGB RGBA and requires every source pixel to be opaque. A provider result that already mixes alpha must use native-alpha QA instead of combining two background-removal paths.
3. Detects periodic painted checkerboards at the canvas border—including large tiles and chroma-coloured grids—before any pixel can be removed.
4. Measures every pixel against the declared matte colour.
5. Requires a configured fraction of border pixels to resemble that matte.
6. Flood-fills only matte-like pixels connected to the canvas border.
7. Preserves matching colours enclosed inside the subject.
8. Builds bounded distance fields around the connected matte and confident foreground. Foreground seeds are eroded farther inward on large plates, so a one-pixel generated fringe can never teach the solver that spill is subject colour.
9. Solves partial alpha against nearby inset foreground colour and the nearest confident local matte sample, so bounded provider noise, shading and resampling do not become an outline.
10. Recovers foreground RGB using the compositing equation, a physically valid alpha bound and a bounded nonlinear-raster allowance rather than leaving green, magenta or dark chroma contamination.
11. Detects complementary provider-painted edge colours that disagree with the inset subject reference. Chroma is projected along the axis opposite the local matte, so subtle magenta-on-green, yellow-on-blue, green-on-magenta and custom-matte fringes can be rejected even below the generic RGB-distance threshold. The repair covers both foreground-classified outliers and visible matte-connected antialias samples; the latter retain physically bounded coverage so cleanup does not erode the silhouette. Distance-triggered, matte-complement-triggered, foreground-edge and connected-matte-edge pixels are counted separately, replaced with audited inset subject colour instead of becoming a vivid outline, and excluded from exact source-plate recomposition proof.
12. Clears distant hidden matte colour.
13. Propagates bounded subject-colour bleed beneath nearby alpha-zero pixels for safer texture filtering.
14. Emits a deterministic lossless PNG and numeric evidence.

For observed colour `C`, local matte `M`, foreground estimate `F` and alpha `a`:

```text
C = aF + (1-a)M
```

The extractor estimates `a` by projecting `C-M` onto `F-M`, raises it to the minimum value that can reconstruct legal bounded RGB, then recovers foreground colour from the same equation. Every ordinary output pixel is recomposed against the same local matte field; any error beyond the declared allowance blocks the candidate. A provider-painted halo that is not a credible composite is repaired only inside the connected edge band, is counted separately, and retains its maximum source drift in evidence. Thresholds and evidence remain explicit; they are not silently lowered after a failure.

## Evidence

The recovery evidence records:

- input and output SHA-256;
- source format, dimensions, page count, alpha state and byte size;
- selected strategy (`native-alpha-preserved`, `checkerboard-recovery`, `declared-chroma-key` or `inferred-high-chroma-key`);
- native-alpha coverage, transparent-edge fraction and checkerboard fit evidence;
- declared or conservatively inferred matte RGB;
- connection, foreground, edge-search and bleed thresholds;
- border matte coverage;
- border-connected background count;
- confident foreground seed count;
- edge-band size;
- enclosed matte-like subject pixels preserved;
- transparent, partial and opaque output counts;
- edge pixels decontaminated;
- transparent RGB bleed pixels created;
- scale-aware foreground-seed inset;
- provider-painted halo repairs and their maximum source-channel drift;
- exact-recomposition pixel count, explicitly excluded halo-repair count, maximum observed error and maximum allowed error;
- checkerboard segmentation, edge recovery and recomposition error when a painted grid was repaired;
- visible border-band ownership and pre-existing non-opaque pixel counts when a solid-matte alpha-rim bypass was repaired.

The output is then passed to the existing frame-quality kernel, which proves:

- true decoded alpha;
- no baked checkerboard or flat matte;
- declared dimensions and PNG format;
- visible safe bounds;
- edge-halo fraction;
- transparent RGB behaviour.

A quality failure does not erase evidence. The processing job may complete with `qualityPassed: false`, while the artifact is labelled `qualityState: rejected` and remains ineligible for promotion.

## Durable job

Job kind:

```text
art.candidate.master-alpha
```

Required capabilities:

```text
media.chroma-extract
media.background-recovery
quality.sprite-frame
evidence.bundle
```

The candidate artifact must:

- be declared in `inputArtifacts`;
- pass immutable descriptor and content verification;
- use an image media type;
- use storage class `intermediate`;
- have `artifactRole=provider-candidate`;
- have `approvalState=unapproved`.

Outputs:

```text
provider-candidate-alpha-master      unapproved intermediate PNG
candidate-alpha-mastering-evidence   immutable JSON evidence
runtime-result                       immutable runtime result evidence
```

No named approved reference is changed.

Example:

```powershell
pnpm art -- runtime-submit `
  --input .\examples\runtime-alpha-mastering-job.json `
  --actor greg

pnpm worker:until-idle
pnpm art -- runtime-events --after 0
```

Replace the example artifact ID in both `payload.candidateArtifactId` and `inputArtifacts` with the same real candidate artifact ID.

## Direct local CLI

For deliberate local inspection without the runtime queue:

```powershell
pnpm art -- master-alpha `
  --input .\candidate.png `
  --output .\candidate.alpha.png `
  --evidence .\candidate.alpha.evidence.json `
  --expectations .\frame-quality.json
```

`--matte` is optional in automatic mode. Keep supplying it when the generation manifest declares a matte; the classifier can still recover if the provider returns real alpha, paints a checkerboard, or substitutes a different confidently flat high-chroma matte.

For `native-alpha` provider requests, orchestration validates both the encoded container and decoded pixels before candidate storage. PNG colour types without alpha, JPEG output, and WebP output without an alpha feature/chunk fail with `PROVIDER_NATIVE_ALPHA_MISSING`. Files that merely declare alpha but decode to a fully opaque alpha plane, a painted checkerboard, a token-transparent rim around a matte, an unsafe canvas edge, or any recovery strategy other than `native-alpha-preserved` fail with `PROVIDER_NATIVE_ALPHA_INVALID`. The provider bytes are not stored as a candidate and are never shown in a review preview; an explicitly allowed fallback provider may be tried instead. If a provider cannot supply genuine native alpha, route the request to an explicitly declared single-colour chroma-key job and master it through the separate recovery path—never ask it to imitate transparency with a checkerboard.

Optional controls:

```text
--connection-distance
--opaque-seed-distance
--edge-search-radius
--bleed-radius
--minimum-border-matte-fraction
--maximum-composite-channel-error
--checker-connection-distance
--checker-foreground-seed-distance
--checker-minimum-border-fraction
--checker-maximum-composite-channel-error
```

The CLI writes atomically, emits JSON on stdout and exits with code `3` when blocking sprite QA fails. The PNG and evidence remain available for diagnosis and are still marked unapproved.

## Matte selection rules

Choose a matte that:

- is absent or rare in the subject, costume, effect and intended antialiasing;
- remains exactly flat across the complete border;
- has no texture, gradient, shadow, checkerboard or lighting variation;
- does not share the subject's dominant luminance and hue;
- remains stable across every frame in the family.

Art Studio enforces high chroma at provider-request validation, provider-canvas preparation and ordinary alpha extraction. This prevents a caller or agent from quietly switching to black, white or grey and erasing EVA's clothing, pale highlights or other legitimate subject pixels. The separate delivery optimizer may opt into low-chroma removal only for an already-existing, explicitly declared legacy matte; its conservative border-connected thresholds and evidence remain mandatory. Provider generation never receives that override.

Green is not universally correct. Magenta, blue or another controlled colour may be safer for a green character or vegetation effect. The matte colour is part of the compiled production contract and evidence.

The generation prompt requires the exact matte in every pixel outside the subject, checks all four corners and the full edge, reserves transparent safety padding on every side, and explicitly forbids checkerboards, transparency-preview UI, texture, scenery, gradients, shadows, relighting, complementary rims, glow, chromatic aberration and key-colour spill. Native-alpha requests are sent only to adapters/models that advertise file-level alpha support; incompatible models use the matte path rather than pretending.

## Deliberate next gates

This stage proves extraction and deterministic frame QA. It does not yet prove:

- canonical face and body identity;
- costume or equipment consistency;
- pose accuracy;
- frame-to-frame motion continuity;
- layer registration or occlusion;
- final pixel-art resampling;
- candidate ranking and selection;
- approved-master promotion.

Those gates must consume this mastered intermediate rather than the raw provider candidate.
