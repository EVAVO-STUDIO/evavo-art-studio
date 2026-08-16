# Web asset finishing and Cloudinary publication

This pipeline is the production bridge between chat or workspace media, Art Studio mastering, Cloudinary and an application repository. It deliberately reuses Art Studio's existing alpha-recovery and delivery-optimizer packages instead of creating a second image-processing implementation.

It accepts staged raster files from ChatGPT conversations, ChatGPT Library, chat attachments, local workspaces, EVAVO Storage or an existing Cloudinary download. It verifies the declared byte count and SHA-256 before decoding anything, preserves the original, and creates:

- a metadata-stripped, lossless PNG source master with the `source-master-lossless` profile;
- a bounded, high-quality WebP derivative with the `web-raster-1080p` profile;
- per-asset mastering evidence and a Cloudinary descriptor;
- one self-hashed, create-only publication plan;
- code-ready public IDs, alt text and object-fit data.

SVG is intentionally rejected. Work-page imagery must enter this contract as a real raster image. The pipeline never converts an SVG and pretends that the result has been visually mastered.

## Agent runbook

Use this order for every work-page image task:

1. Search Cloudinary first with `evavo_cloudinary_search_assets`. Prefer an existing independent raster when its subject, dimensions, alpha, metadata and page role are genuinely correct. Similarity alone is not enough.
2. If nothing suitable exists, resolve the selected chat attachment, ChatGPT Library item, generated image, EVAVO Storage object or workspace file into a regular file inside an allowed connector or workspace root, then call `evavo_web_asset_stage_source` to preserve it in the governed intake workspace.
3. Record the real source surface, original name, optional opaque origin reference, exact byte count and SHA-256 in a manifest. Never place credentials or image bytes in the manifest.
4. Choose `background.mode: preserve` when the authored background is intentional. Choose `recover-alpha` only when the asset is supposed to be a cutout and the source has genuine alpha, a painted transparency checkerboard or a provable border-connected matte.
5. Validate, prepare and inspect the full lossless master plus the web derivative. Preparation does not mean approval.
6. Publish the exact prepared plan only after visual review. Publication rehashes every selected file and stops if anything changed.
7. Use the receipt's public ID, alt text and object-fit value in the target repository. Let the site's Cloudinary helper add responsive sizing, `f_auto` and `q_auto`; do not bake one arbitrary transformed URL into content data.
8. Run the target repository's checks, commit only the intended files, push a non-forced update to its current `main`, and verify the deployment separately.

The ChatGPT or Library connector resolves the selected source to an allowed local file; Art Studio then makes the governed create-only staging copy. Art Studio never receives ChatGPT Library credentials and never transports image bytes through MCP JSON. This boundary lets the same manifest work for an attachment, an item from Library, a generated image or a normal workspace file.

## Build and configure

Build the existing Art Studio domain packages before preparing images:

```powershell
pnpm run build:domain
```

Configure the MCP process with trusted roots. On Windows, separate multiple roots with `;`; on POSIX systems use `:`.

```powershell
$env:EVAVO_WEB_ASSET_ALLOWED_ROOTS = "C:\EVAVO\asset-intake;C:\GitRepos"
$env:EVAVO_WEB_ASSET_ALLOW_WRITES = "true"
$env:EVAVO_WEB_ASSET_ALLOW_CLOUDINARY_WRITES = "false"
$env:CLOUDINARY_URL = "cloudinary://<api-key>:<api-secret>@<cloud-name>"
```

`CLOUDINARY_URL` is a server-side secret. Do not commit it, put it in an MCP argument, return it in a receipt or expose it to browser code.

There are two independent mutation gates:

- `EVAVO_WEB_ASSET_ALLOW_WRITES=true` permits create-only preparation files.
- `EVAVO_WEB_ASSET_ALLOW_CLOUDINARY_WRITES=true` permits Cloudinary creation.

The prepare MCP call additionally requires `confirmLocalWrite: true`. The publish MCP call requires `confirmCloudinaryWrite: true` for that exact call. Cloudinary inventory search is read-only and does not require either write gate.

## Search existing Cloudinary assets

The search tool uses Cloudinary's Admin Search API with server-side Basic Authentication. Results are bounded to 100 assets and include public IDs, dimensions, formats, byte sizes, tags, context and delivery URLs. Tier 2 structured metadata and image-analysis fields are opt-in with `includeTier2Fields: true` (or `--include-tier2-fields true`) so accounts without that entitlement still work. Credentials and original bytes are never returned.

Example CLI query:

```powershell
pnpm run web-asset:pipeline -- search `
  --expression 'resource_type:image AND (tags=react-commerce OR context.project="React Commerce")' `
  --max-results 30
```

Useful expression fields include `public_id`, `display_name`, `asset_folder`, `tags`, `context`, `format`, `width`, `height`, `bytes` and `created_at`. Search is eventually consistent, so a just-published asset may take a few seconds to appear.

## Stage chat, Library or workspace media

The staging operation copies exact bytes between two allowed roots, never moves or edits the connector's source, rejects symbolic links and SVGs, and fails if the destination already exists. Its result is the complete `source` block to insert into a manifest.

The destination parent must already exist:

```powershell
pnpm run web-asset:pipeline -- stage `
  --source-root C:\EVAVO\connector-downloads `
  --source-path generated\react-commerce.png `
  --workspace-root C:\EVAVO\asset-intake `
  --destination-path incoming\react-commerce-control-plane.png `
  --surface chatgpt-conversation `
  --original-name react-commerce.png `
  --origin-ref conversation:opaque-reference `
  --confirm-local-write true
```

For ChatGPT Library, use `--surface chatgpt-library`; for a direct chat upload use `attachment`; for a file already in a normal workspace use `workspace`. `originRef` is optional and must be an opaque provenance reference, never a token or signed download URL.

## Manifest

Start with [`config/web-asset-pipeline.example.json`](../config/web-asset-pipeline.example.json). Each source path is relative to `workspaceRoot`. It must be a regular non-symbolic file, and every existing path component is checked for symbolic links.

The manifest requires complete editorial metadata:

- meaningful `alt` and `accessibilityAlt` text;
- caption, title, project and asset role;
- a stable usage key plus a plain-language usage note;
- the target site area, review date, reviewer and explicit `approved` or `review-required` status;
- deterministic `fileStem`, `assetFolder`, `displayName` and extension-free `publicId`;
- explicit `objectFit` and the variants that may be published.

For deterministic naming, `publicId` must equal `assetFolder/fileStem`. The web variant uses that public ID. When the lossless master is also published it uses the same ID with `-master` appended. `overwrite=false` and `unique_filename=false` make collisions fail rather than silently replacing or randomly renaming an asset.

Custom Cloudinary `context` values may be supplied, but pipeline-owned editorial keys cannot be overridden. Custom `metadata` keys must already exist as structured-metadata external IDs in the Cloudinary product environment; otherwise Cloudinary will reject the upload. Leave `metadata` empty when no matching schema has been configured. Visual Search indexing is an account-dependent feature and is only requested when `indexForVisualSearch` is explicitly `true`.

## Validate and prepare

The output directory must not exist. Its parent must already exist inside the trusted workspace; this prevents an unexpected directory chain from being created by a typo.

```powershell
pnpm run web-asset:pipeline -- validate `
  --workspace-root C:\EVAVO\asset-intake `
  --manifest manifests\work-page-assets.json

pnpm run web-asset:pipeline -- prepare `
  --workspace-root C:\EVAVO\asset-intake `
  --manifest manifests\work-page-assets.json `
  --output-root prepared\work-page-assets-2026-08-16
```

Preparation writes only beneath the new output root. If processing fails, that newly created root is removed; sources are never changed, renamed, optimized in place or deleted.

For `recover-alpha`, Art Studio first classifies native alpha, painted checkerboards, declared chroma mattes and confidently inferred high-chroma mattes. It only removes border-connected background, decontaminates the edge, proves real transparency and retains recovery evidence. Optional spill suppression requires a declared or proven high-chroma matte. A fake checkerboard is never accepted as alpha.

Inspect at least these files before publication:

```text
prepared/<batch>/assets/<asset-id>/<file-stem>.master.png
prepared/<batch>/assets/<asset-id>/<file-stem>.web.webp
prepared/<batch>/assets/<asset-id>/<file-stem>.evidence.json
prepared/<batch>/assets/<asset-id>/<file-stem>.cloudinary.json
prepared/<batch>/publication-plan.json
prepared/<batch>/preparation-receipt.json
```

## Publish

After visual review, set the manifest's `reviewStatus` to `approved`, name the reviewer, prepare a new exact plan, then enable the independent Cloudinary write gate for the publisher process. Publication fails closed for every `review-required` asset.

```powershell
$env:EVAVO_WEB_ASSET_ALLOW_CLOUDINARY_WRITES = "true"

pnpm run web-asset:pipeline -- publish `
  --workspace-root C:\EVAVO\asset-intake `
  --plan prepared\work-page-assets-2026-08-16\publication-plan.json `
  --confirm-cloudinary-write true
```

Cloudinary receives the deterministic public ID, asset folder, display name, filename override, tags, contextual metadata and any configured structured metadata. Uploads are create-only and retain provider backups. The request also asks Cloudinary for perceptual hash, colour, quality and accessibility analysis. It requests Visual Search indexing only when the manifest explicitly opts in and the product environment supports it.

The success receipt contains only sanitized provider data, exact prepared hashes and code references. It never contains the API key, API secret, authorization header or source bytes.

If a later upload fails after earlier assets were created, the pipeline records `publication-receipt.partial.json` and stops. It does not guess at destructive rollback. Reconcile the listed public IDs in Cloudinary before planning another attempt.

## MCP tools

The stdio server is started with:

```powershell
pnpm run web-asset:mcp
```

It exposes:

- `evavo_web_asset_capabilities`
- `evavo_cloudinary_search_assets`
- `evavo_web_asset_stage_source`
- `evavo_web_asset_validate_manifest`
- `evavo_web_asset_prepare`
- `evavo_web_asset_publish`

The MCP returns metadata, paths, hashes and receipts only. Large binaries remain in the governed workspace, and provider credentials remain in the server process environment.

## Cloudinary references

The implementation follows Cloudinary's backend REST contracts:

- [Admin API and Search API](https://cloudinary.com/documentation/admin_api)
- [Search API expressions](https://cloudinary.com/documentation/search_method)
- [Upload API reference](https://cloudinary.com/documentation/image_upload_api_reference)
- [Uploading assets](https://cloudinary.com/documentation/upload_images)
