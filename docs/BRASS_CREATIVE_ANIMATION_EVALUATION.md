# Brass & Brine creative and animation evaluation

Art Studio consumes the game-owned contract:

```text
Brass_Brine/config/art/brass_art_direction_animation.v1.json
```

It does not invent separate canvases, animation timing or visual rules.

## Static candidates

```powershell
py -3 tools/evaluate_brass_creative_candidate.py `
  --game-root C:\GitRepos\Brass_Brine `
  --candidate-root C:\EVAVO-Evidence\Brass_Brine\staging `
  --candidate candidates\standing_character\london\character.png `
  --role standing_character `
  --style-bank C:\EVAVO-Evidence\Brass_Brine\style-bank.json `
  --runtime-scale-sheet C:\EVAVO-Evidence\Brass_Brine\creative\scales.png `
  --matte-sheet C:\EVAVO-Evidence\Brass_Brine\creative\mattes.png `
  --output C:\EVAVO-Evidence\Brass_Brine\creative\candidate.json
```

The evaluator opens the candidate through one descriptor-bound read, retains that
exact byte sequence, hashes it and decodes the evaluated pixels from those same
bytes. It never hashes one path state and reopens another. Symlinked path
components, replacement during the read, growth, truncation, multi-frame files
and post-read byte drift fail closed.

The retained source bytes are bound to the game contract, the role-specific
approved style profile and the evaluation contract. The evaluator checks canvas,
alpha, active bounds, semantic red use, value separation and role-style distance.
It creates real runtime-scale and black, white, grey and signal-red matte sheets.

A technical pass does not approve identity, historical correctness, composition,
creative quality, gameplay use or publication. Those remain explicit review
fields in the report.

## Animation sequences

The manifest schema is:

```text
evavo.brass-brine.animation-sequence-manifest.v1
```

Every frame records path, SHA-256, duration, pivot, baseline, ground contact and
pose tags. The sequence also records semantic identity, family, clip, variant,
direction, loop policy and intended Godot SpriteFrames destination.

```powershell
py -3 tools/evaluate_brass_animation_sequence.py `
  --game-root C:\GitRepos\Brass_Brine `
  --frame-root C:\EVAVO-Evidence\Brass_Brine\staging\frames `
  --manifest C:\EVAVO-Evidence\Brass_Brine\animation\manifest.json `
  --contact-sheet C:\EVAVO-Evidence\Brass_Brine\animation\sheet.png `
  --output C:\EVAVO-Evidence\Brass_Brine\animation\evaluation.json
```

Every frame uses the same descriptor-bound retained-byte rule as a static
candidate. The evaluator checks governed frame count and timing, exact frame
bytes, required pose phases, pivots, baselines, ground contact, adjacent
duplicate stutter, perceptual identity continuity, active-bounds pops and loop
seams or terminal holds.

It deliberately rejects automatic interpolation between unrelated sources and
does not treat a smooth loop as proof of correct acting, identity or history.

## Permanent verification

```powershell
py -3 tools/verify_brass_creative_evaluation.py
```

The permanent fixture proves a valid static candidate and idle sequence pass,
while a wrong canvas and adjacent duplicate animation frame fail closed. It also
replaces static and animation paths immediately after their descriptor reads and
proves the reports and contact sheets still derive from the retained original
bytes. A multi-frame image is rejected.

Evidence publication is genuinely create-only. Each complete temporary file is
flushed and synced, then atomically linked into a previously absent target. A
target that appears during publication is preserved and the operation fails;
`--replace` is the only explicit overwrite authority. Published bytes are read
back and verified against the exact staged SHA-256 and byte length before a
successful result is returned.

Hosted verification uses Python 3.13.5 and Pillow 12.2.0 exactly. The same Brass
race attacks are part of the exact-current-main validation receipt.

## Authority boundary

The tools write create-only evidence. They do not call an image provider,
overwrite or delete source art, mutate the game repository, create SpriteFrames,
approve art, run Godot, commit, push or publish.
