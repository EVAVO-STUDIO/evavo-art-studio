# Candidate alpha mastering

Status: implemented deterministic foundation

## Purpose

Provider image output is candidate material. A convincing green or magenta background is not transparency, and a provider-supplied alpha channel is not accepted without decoded-pixel evidence.

Art Studio therefore separates candidate creation from alpha mastering:

```text
provider candidate
  -> immutable unapproved artifact
  -> mask or matte contract proof
  -> deterministic alpha extraction
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

## Border-connected matte segmentation

A global colour deletion is unsafe because the subject may legitimately contain the same green, blue or magenta selected for extraction.

Art Studio instead:

1. Requires an explicitly declared high-chroma key; black, white and grey are rejected as unsafe destructive mattes.
2. Decodes the candidate into sRGB RGBA and requires every source pixel to be opaque. A provider result that already mixes alpha must use native-alpha QA instead of combining two background-removal paths.
3. Detects periodic painted checkerboards at the canvas border—including large tiles and chroma-coloured grids—before any pixel can be removed.
4. Measures every pixel against the declared matte colour.
5. Requires a configured fraction of border pixels to resemble that matte.
6. Flood-fills only matte-like pixels connected to the canvas border.
7. Preserves matching colours enclosed inside the subject.
8. Builds bounded distance fields around the connected matte and confident foreground.
9. Solves partial alpha against nearby foreground colour for antialiased edge pixels.
10. Recovers foreground RGB using the compositing equation rather than leaving green or magenta contamination.
11. Clears distant hidden matte colour.
12. Propagates bounded subject-colour bleed beneath nearby alpha-zero pixels for safer texture filtering.
13. Emits a deterministic lossless PNG and numeric evidence.

For observed colour `C`, matte `M`, foreground estimate `F` and alpha `a`:

```text
C = aF + (1-a)M
```

The extractor estimates `a` by projecting `C-M` onto `F-M`, then recovers foreground colour from the same equation. Thresholds and evidence remain explicit; they are not silently lowered after a failure.

## Evidence

The extraction evidence records:

- input and output SHA-256;
- source format, dimensions, page count, alpha state and byte size;
- declared matte RGB;
- connection, foreground, edge-search and bleed thresholds;
- border matte coverage;
- border-connected background count;
- confident foreground seed count;
- edge-band size;
- enclosed matte-like subject pixels preserved;
- transparent, partial and opaque output counts;
- edge pixels decontaminated;
- transparent RGB bleed pixels created.

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
  --matte "#00ff00" `
  --output .\candidate.alpha.png `
  --evidence .\candidate.alpha.evidence.json `
  --expectations .\frame-quality.json
```

Optional controls:

```text
--connection-distance
--opaque-seed-distance
--edge-search-radius
--bleed-radius
--minimum-border-matte-fraction
```

The CLI writes atomically, emits JSON on stdout and exits with code `3` when blocking sprite QA fails. The PNG and evidence remain available for diagnosis and are still marked unapproved.

## Matte selection rules

Choose a matte that:

- is absent or rare in the subject, costume, effect and intended antialiasing;
- remains exactly flat across the complete border;
- has no texture, gradient, shadow, checkerboard or lighting variation;
- does not share the subject's dominant luminance and hue;
- remains stable across every frame in the family.

Art Studio enforces high chroma at provider-request validation, provider-canvas preparation and alpha extraction. This prevents a caller or agent from quietly switching to black, white or grey and erasing EVA's clothing, pale highlights or other legitimate subject pixels.

Green is not universally correct. Magenta, blue or another controlled colour may be safer for a green character or vegetation effect. The matte colour is part of the compiled production contract and evidence.

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
