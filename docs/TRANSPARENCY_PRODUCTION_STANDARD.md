# Transparency production standard

Status: implemented prevention, recovery, artist refinement and delivery admission

## The rule

A transparency checkerboard is editor UI. It is never transparency and it is never valid image content. A PNG or WebP container also does not prove transparency: Art Studio decides from decoded pixels.

Every transparency-required asset now follows one path:

```text
provider or imported source
  -> immutable unapproved original
  -> native-alpha / painted-grid / flat-matte classification
  -> deterministic recovery on a working copy
  -> optional artist protect/remove masks
  -> solid hostile-background and alpha-mask proof
  -> decoded-pixel quality
  -> sheet/atlas transparency admission
  -> unapproved evidence-backed output
```

No step may turn a checkerboard preview into accepted alpha, hide a failure by changing policy, or overwrite the original.

## Prevent the problem at generation time

1. Use native alpha only when the provider adapter explicitly advertises file-level alpha support. Provider orchestration then verifies the encoded container and the decoded alpha plane before storing the candidate.
2. Otherwise request one exact, flat, high-chroma matte. Choose the colour with the least collision against the approved subject palette. Green, magenta and blue are common candidates, but none is universally safe.
3. Require that matte in every background pixel and all four corners. Forbid checkerboards, transparency-preview UI, scenery, gradients, shadows, texture, glow and colour spill.
4. Generate one frame or retained layer at a time. A provider-made contact sheet or packed atlas is not a source master.
5. Keep the provider bytes immutable. All cleanup happens in a working copy with evidence.

## Smart automatic recovery

`recoverBackgroundAlpha` distinguishes:

- meaningful native alpha with a completely transparent canvas edge;
- a painted two-colour checkerboard, including subtle, resampled, unusual-tile and token-alpha-rim variants;
- an explicitly declared high-chroma matte;
- a confidently inferred flat high-chroma border matte; and
- an ambiguous source, which fails closed.

Use `pnpm art -- inspect-alpha --input .\candidate.png` for a read-only machine-readable classification before deciding whether to preserve, master or reject a candidate. The MCP server exposes the same read-only decision as `inspect_transparency_candidate` for Codex and other trusted agents.

Matte removal is border-connected. It does not globally delete every matching green, magenta or blue pixel, so enclosed subject colours survive. Partial edges are unmixed against local matte and foreground estimates, complementary provider halos are repaired, recomposition is checked, alpha-zero RGB is canonicalized and bounded subject-colour bleed is rebuilt for texture filtering.

## Ambiguous natural-background recovery

Deterministic recovery remains the first choice because it is explainable and can prove exact matte ownership. A photograph, painted scene, hair/fur edge, smoke, translucent material or background whose colours overlap the subject may be genuinely ambiguous. In that case Art Studio must not increase a colour-distance threshold until the source happens to pass.

Use a governed semantic-mask lane instead:

1. Preserve the exact source and classify deterministic alpha/matte evidence first.
2. Run a pinned segmentation or high-resolution matting profile such as promptable SAM 2 or a reviewed BiRefNet profile through the shared `image-finishing` environment and its governed `image-segmentation` / `image-matting` slots. The exact reviewed-model manifest, workflow, checkpoint, runtime, preprocess settings and output mask must be hashed. Model weights are operator-installed; Art Studio does not silently download or float them.
3. Treat the model result as a soft mask candidate, never as approved alpha.
4. Combine it with known evidence: border-connected matte is definite background, an artist protect mask is definite foreground, an artist remove mask is definite background, and only the unresolved band may use model confidence.
5. Refine edges with bounded alpha morphology, feathering, defringing and colour decontamination. Do not globally erase a colour that also appears inside the subject.
6. Recompose against the original background where known, inspect the alpha mask, and proof the result over all hostile solid plates.
7. Retain the source, raw model mask, artist masks, mastered alpha and evidence as separate workspace versions.

The exact soft mask enters Project Art as an ordinary immutable image source. Apply it on a transparent `image-composite` canvas, then run `master-alpha` on that native-alpha working result with optional protect/remove masks. This keeps semantic inference separate from deterministic alpha cleanup and makes every mask replaceable without changing the original image.

For video, propagate or track a mask only as reference evidence, then review temporal alpha stability frame by frame. One good mask on frame zero does not prove the silhouette on later frames. A semantic model may help locate the subject, but it cannot grant creative approval, delivery admission or atlas admission.

This gives recovery several independent routes without confusing them:

| Source condition | Primary route | Required fallback/control |
|---|---|---|
| proven native alpha | preserve and inspect | protect/remove masks only for a demonstrated defect |
| declared low-collision flat matte | border-connected extraction and unmixing | artist masks for collisions or retained islands |
| confidently inferred flat border matte | evidence-backed connected extraction | reject if confidence or recomposition proof is insufficient |
| painted transparency checker | periodic-grid reconstruction only when conclusive | otherwise reject/regenerate; never accept the grid |
| natural or overlapping background | pinned semantic soft mask | protect/remove masks, edge refinement and hostile proofs |
| hair, fur, smoke, glass or glow | semantic/trimap candidate plus soft-alpha refinement | full-resolution artist review; never force binary alpha |

## Artist-guided correction

Automatic evidence stays authoritative, but an artist can refine the recovered silhouette with two ordinary lossless masks:

- `--protect-mask`: white or opaque areas restore alpha and source RGB where automatic recovery removed real art;
- `--remove-mask`: white or opaque areas reduce alpha where background remains.

Masks may use alpha-painted strokes or opaque grayscale. They must match the source dimensions. Strong protect/remove overlap is rejected because contradictory intent is unsafe. Unmasked alpha is unchanged, fully removed pixels are canonicalized, and bounded transparent RGB bleed is rebuilt.

```powershell
pnpm art -- master-alpha `
  --input .\candidate.png `
  --output .\candidate.alpha.png `
  --protect-mask .\keep.png `
  --remove-mask .\erase.png `
  --proof .\candidate.alpha.proof.png `
  --evidence .\candidate.alpha.evidence.json `
  --expectations .\frame-quality.json
```

The Project Art sandbox supplies additional deterministic artist controls, including alpha erode/dilate, feather, threshold, defringe, edge decontamination, hidden-RGB rebuild, curves, masks, compositing and pixel-safe transforms. Those operations never replace the final transparency admission gate.

## Proof views

Use solid black, white, middle-grey, green and magenta plates plus an explicit black/white alpha-mask view. These reveal pale fringes, dark fringes, chroma spill, holes and silhouette erosion. Do not use a checkerboard proof: its alternating edges can camouflage the same painted-grid and halo defects being reviewed.

## Sheet and atlas admission

Both atlas implementations and the Project Art slice/assemble tools now default to `alphaPolicy: required`.

| Policy | Intended use | Admission |
|---|---|---|
| `required` | sprites, cut-outs, effects, UI overlays | real encoded alpha, meaningful non-opaque pixels, fully transparent canvas edge, no painted grid or matte |
| `preferred` | mixed inventories | accepts proven native alpha or an unrecognized ordinary opaque image, but rejects a painted grid or detected matte |
| `opaque` | deliberately opaque backgrounds and plates | alpha is not required, but a painted transparency grid is still forbidden |

Admission happens before trimming, slicing or packing. Evidence is retained per source frame and in sheet/atlas manifests. A failed frame must be mastered and admitted again; changing to `opaque` is not a transparency repair.

## Failure handling

- Preserve the exact failing bytes and evidence.
- Do not lower checker, matte, edge or recomposition thresholds merely to pass.
- Prefer a safer provider matte when regenerating.
- Use protect/remove masks for bounded hand correction.
- Re-run decoded-pixel QA and transparency admission after every correction.
- Keep all results unapproved until the existing comparison, sequence, human-review and promotion boundaries pass.
