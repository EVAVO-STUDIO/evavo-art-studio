# Media role supervisor

The EVAVO media role supervisor prevents a technically valid asset from being used in the wrong production slot.

It is provider-neutral and read-only. It does not search Cloudinary, download files, edit assets or publish anything. An upstream agent discovers candidate assets and passes their metadata into the supervisor for deterministic ranking.

## Workflow

1. Discover relevant assets from Cloudinary, a project asset library or local catalog.
2. Preserve the provider metadata that describes each candidate:
   - public/local identifier
   - dimensions
   - byte size
   - format
   - known alpha state
   - tags
   - production status
   - asset role / usage
   - predominant white-field ratio when available
   - whether the source is shared with the catalogue
   - whether the catalogue source is locked
3. Select the target slot.
4. Rank the candidates.
5. Inspect the top eligible candidate visually when the decision affects production art.
6. Follow the returned action:
   - `keep` — role and delivery evidence are already appropriate
   - `finish` — same asset can be improved non-destructively
   - `derive` — preserve the source and create a role-specific derivative
   - `reject` — do not use this candidate in that slot
7. Run transparency proof or final-art QA when appropriate.
8. Publish only after the detail/catalogue role boundary is still intact.

## Supported roles

### `detail-hero`

Designed for full-width Work/product/case-study headers.

Rules include:

- live detail heroes reject SVG
- catalogue-only art rejects
- support/secondary objects are not silently promoted to full-width headers
- raster width defaults to at least 1200 px
- portrait/square media is penalized for wide hero use
- cover/header/canonical metadata is preferred
- shared catalogue art requires explicit approval or a dedicated derivative

### `detail-support`

Designed for contained sidebars, body proof, product objects and supporting visuals.

Rules include:

- catalogue-only art rejects
- canonical hero/social media is not casually reused as body support
- support/secondary metadata is preferred
- transparency can be requested as a preference
- predominantly white support art is sent to finishing review for dark EVAVO pages
- small sources receive a resolution warning
- shared catalogue sources are protected from overwrite

### `catalogue-tile`

Designed for the `/work` catalogue or equivalent browsable card presentation.

The supervisor treats locked/shared catalogue sources as important evidence. It does not recommend overwriting catalogue imagery merely because a detail page could look better with different art.

A candidate-like public ID does not automatically mean an asset is unapproved. Production metadata outranks historical naming. This is important for promoted assets such as older `candidate` paths that are now the reviewed production source.

### `social-seo`

Designed for Open Graph, Twitter and structured-image identity.

Rules include:

- raster delivery is preferred
- support-only art requires a canonical derivative
- source width defaults to at least 1200 px
- target aspect defaults near 1200×630
- canonical/cover/SEO metadata is preferred

### `motion-layer`

Designed for independently animated alpha layers.

Rules include:

- proven alpha is preferred
- JPEG receives a transparency warning
- opaque art is sent to finishing before motion use

## Candidate metadata example

```json
{
  "candidates": [
    {
      "id": "evavo/work/custom-web-applications/custom-application-interface-system-2026",
      "width": 1000,
      "height": 700,
      "bytes": 11978,
      "format": "webp",
      "status": "production",
      "assetRole": "sticky-aside-support",
      "tags": ["support-element", "finished-art", "detail-approved"],
      "predominantWhiteRatio": 0.01
    },
    {
      "id": "evavo/work/support-elements/custom-web-applications-interface-stack",
      "width": 1011,
      "height": 1556,
      "format": "jpg",
      "status": "production-catalogue-source",
      "assetRole": "governed Work catalogue presentation source and historical source evidence",
      "sharedWithCatalogue": true,
      "lockedCatalogueSource": true
    }
  ],
  "request": {
    "role": "detail-support",
    "targetAspectRatio": 1.42857
  }
}
```

The finished 1000×700 CWA derivative should rank above the padded catalogue/provenance source for the detail support slot. The catalogue source remains preserved.

## CLI

```text
node tools/rank_media_candidates.mjs --input media-ranking-request.json
```

## MCP

```text
evavo_media_role_supervisor_capabilities
evavo_rank_media_candidates
```

The MCP is deliberately read-only:

- no filesystem writes
- no provider fetches
- no provider mutations
- no publishing
- no secret material

Use the normal Cloudinary/local discovery tools first, then pass only the metadata needed for the decision.

## Work-page lessons encoded in the supervisor

The rules deliberately capture failures found during the EVAVO Work media audit:

- SVG artwork must not leak back into live Work headers
- an archived or superseded image is not production media
- a catalogue-only gear/network object should not be restored into the Automation detail page
- the padded CWA catalogue/provenance source should not replace its finished detail crop
- a `candidate` word in a public ID does not outweigh explicit production metadata
- hero/support duplication should be resolved with distinct role-specific media
- a white-box support image on a dark page should be finished rather than accepted because its filename sounds relevant
- a heavy raw file may be visually correct but still require optimized delivery
- a shared catalogue source should be preserved while a detail-specific derivative is improved independently
