# RAW_ART visual catalog

The visual catalog closes the gap between a trustworthy technical inventory and an actual visual review. It lets ChatGPT, Codex, Claude and EVAVO agents inspect every PNG in a large `raw_Art` tree without overwriting an original or pretending that filenames and numeric metrics establish creative meaning.

## What it creates

Every create-only catalog contains:

```text
manifest.json
index.html
AGENT_REVIEW_QUEUE.md
thumbnails/*.png
contact-sheets/*.png
```

The manifest binds every original by relative path, byte length and SHA-256. It records dimensions, mode, alpha coverage, content bounds, luminance, saturation, a bounded palette sample, a perceptual hash and technical warnings. These values help find families and anomalies; they are not semantic or style approval.

The contact sheets are the high-density review surface. An agent must inspect every sheet, then open the original PNG before selecting it, repairing a working copy, using it as an approved style reference or admitting it to runtime production.

## Local build

Install the pinned image runtime once:

```powershell
python -m pip install -r requirements-image-pipeline.txt
```

Build a catalog outside the source folder:

```powershell
python tools/raw_art_visual_catalog.py build `
  --raw-art-root C:\GitRepos\steel-dominion\raw_Art `
  --output-root C:\GitRepos\steel-dominion\.art-workbench\raw-art-visual\20260815-210000 `
  --project-id steel-dominion `
  --packet-size 20
```

Verify all preview artifacts and re-open every source by hash:

```powershell
python tools/raw_art_visual_catalog.py verify `
  --output-root C:\GitRepos\steel-dominion\.art-workbench\raw-art-visual\20260815-210000 `
  --raw-art-root C:\GitRepos\steel-dominion\raw_Art
```

The output directory must not already exist and must be completely disjoint from `raw_Art`. A failed build removes only its uniquely named temporary output. It never deletes or rewrites source art.

## MCP for Chat and coding agents

Add both RAW_ART servers from `config/mcp.raw-art-folder.windows.example.json` to the client MCP configuration. The visual server exposes:

```text
evavo_raw_art_visual_capabilities
evavo_raw_art_visual_verify_catalog
evavo_raw_art_visual_build_catalog
```

Catalog creation requires all of:

```text
EVAVO_RAW_ART_VISUAL_MCP_MODE=read-write
EVAVO_RAW_ART_VISUAL_MCP_ALLOW_WRITES=true
an explicit allowed-root list
confirmWrite=true on the tool call
```

The MCP response returns paths to the HTML gallery, review queue and every contact sheet. Image bytes do not travel inside MCP JSON. Chat or Codex should open those paths through its image-viewing capability, inspect originals for shortlisted items, and write decisions into a separate reviewed workspace.

## Correct agent sequence

```text
materialise Git LFS objects
→ exact technical inventory
→ create visual catalog outside raw_Art
→ inspect every contact sheet
→ inspect shortlisted originals at full resolution
→ record subject, role, style traits, continuity family and provenance status
→ name approved style references
→ create working copies
→ modify or generate derivatives only in the working session
→ compare source, derivative and approved style bank
→ test at actual Godot scale and background
→ obtain named approval before runtime promotion
```

## What the catalog does not claim

- A uniform opaque border is reported only as a background candidate, not automatically called fake transparency.
- A perceptual-hash match is review evidence, not proof that two files are interchangeable.
- An aggregate palette is technical evidence, not a creative brief.
- A file in `raw_Art` is owner-supplied source evidence, not automatically a final runtime asset.
- Preview generation does not grant creative, provenance, provider, repository, Git, runtime or publication authority.
