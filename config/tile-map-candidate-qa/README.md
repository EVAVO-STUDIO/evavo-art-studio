# Tile Map candidate QA policies

These are reviewed baseline policies for distinct EVAVO tile-art production models. Pass one explicitly with `tile-map-candidate-qa --policy ...` or the PowerShell wrappers.

- `snes-topdown-rpg.v1.json` — strict binary alpha, small palette and strong seam discipline for 16×16-style RPG terrain.
- `1990s-isometric-simulation.v1.json` — larger palette and transparent network/structure silhouettes for transport and management games.
- `painted-isometric-crpg.v1.json` — permits painterly colour/alpha complexity while retaining seam, blank-output and near-duplicate gates.
- `mutable-isometric-dungeon.v1.json` — strict topology and readable state-transition silhouettes for dig/claim/build cells.
- `rts-1990s.v1.json` — restrained palette/noise with network and terrain continuity suitable for classic RTS presentation.

The values are technical admission thresholds, not creative-quality scores. A candidate that passes still requires explicit structural, visual and creative review.

A game may commit its own QA policy beside its Tile Map Studio binding when its art direction has genuinely different constraints. Such overrides should be reviewed and versioned; they should not be loosened merely to make failing generated art pass.
