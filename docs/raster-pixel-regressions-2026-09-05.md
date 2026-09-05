# Raster mask and layer-stack regression repair

## Confirmed defects

A source review at `dc9805e5cad576e186678a8e9630db42ee633ed4` found two pixel-processing defects. The new regression suite failed 13 of its 15 cases against the original source and passed all 15 against the repair in the same sandbox runtime.

1. Each `composition.composite([overlay])` replaced Sharp's pending overlay list. Earlier layers, including a fitted base, could disappear while the receipt still listed them. The compositor now supplies one ordered overlay array and materializes the completed stack before final-format operations.
2. `extractChannel(3).png()` created a grayscale image, not a mask whose alpha carried the extracted values. Feeding that opaque image to `dest-in` could leave the entire subject opaque. Finishing and compositing now share `applyRasterMatte`: an alpha-bearing mask contributes its alpha; an RGB/grayscale mask without alpha contributes luminance. Coverage multiplies existing source alpha without replacing foreground RGB. The masked image is materialized before trim/resize, and the verified cleanup pixels are reused for subsequent operations.

The matte helper is intentionally bounded to single-frame images, 64 MiB per encoded input and 16,777,216 decoded pixels. Animation callers must process frames explicitly.

## Pixel assertions

`packages/media/test/raster-pixel-regressions.test.mjs` tests actual decoded output, not just receipt strings or the presence of a fourth channel. Cases cover all layers surviving, fitted-base survival, overlap order, alpha and grayscale masks in both APIs, existing partial-alpha multiplication, mask/trim/resize ordering, guarded destructive trims, transformed masks plus opacity, fully transparent masks, WebP transparency, JPEG flattening, and dimension mismatch rejection.

Run through the package's existing test glob, or directly after building:

```sh
pnpm --filter @evavo/art-media build
node --test packages/media/test/raster-pixel-regressions.test.mjs
```

## Validation boundary

Executed in this change's isolated Linux sandbox: Node 22.16.0, Sharp 0.34.1, TypeScript 5.8.3. Strict TypeScript compilation passed with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noImplicitOverride` and NodeNext module resolution. Original-source copies were checked against Git blob hashes `d3547345d6c233346a9c5e005dc4b68978fe002a` (finishing) and `e5d2992304349b870fa15b243255c7cd82c77fba` (compositing) before running the baseline suite.

This is not a claim that the full monorepo, the MSI workstation, or the repository-pinned Sharp 0.35.3 / TypeScript 5.9.2 suite ran. No dependencies or lockfiles were changed to accommodate the sandbox.

## Website artwork lesson

Cloudinary tags such as `transparent` and `finished-art` are descriptive metadata, not proof that the delivered image has transparent pixels. The 800x589 PWA detail image at version `1788579037` retained a white exterior in a green-background diagnostic. The repaired PWA and MVP derivatives were made from their existing catalogue source images without modifying those originals, without adding SVG headers, and without generative restoration after segmentation.

The reviewed green proofs are diagnostic-only assets, not website artwork. Their source IDs are recorded in the active detail assets' metadata. The repaired detail originals match the page's existing intrinsic dimensions (PWA 1129x831; MVP 933x1031), rather than replacing a high-resolution source with a smaller delivery thumbnail. Existing detail public IDs were retained with backup and CDN invalidation; the separate catalogue IDs were not overwritten or renamed.

Do not claim final browser rendering or cache convergence solely from a successful upload. Verify the actual delivered detail URL and inspect the page before making that claim.

## Reference

Sharp's composite API accepts an ordered array of overlays and applies other operations in the pipeline to the input before compositing. Keep explicit lossless stage boundaries where operation order matters.

- https://sharp.pixelplumbing.com/api-composite/
- https://sharp.pixelplumbing.com/api-channel/
