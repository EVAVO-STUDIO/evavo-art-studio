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

The evaluator binds exact candidate bytes, the game contract, the role-specific
approved style profile and the evaluation contract. It checks canvas, alpha,
active bounds, semantic red use, value separation and role-style distance. It
creates real runtime-scale and black, white, grey and signal-red matte sheets.

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

The evaluator checks governed frame count and timing, exact frame bytes,
required pose phases, pivots, baselines, ground contact, adjacent duplicate
stutter, perceptual identity continuity, active-bounds pops and loop seams or
terminal holds.

It deliberately rejects automatic interpolation between unrelated sources and
does not treat a smooth loop as proof of correct acting, identity or history.

## Permanent verification

```powershell
py -3 tools/verify_brass_creative_evaluation.py
```

The permanent fixture proves a valid static candidate and idle sequence pass,
while a wrong canvas and adjacent duplicate animation frame fail closed.

## Authority boundary

The tools write create-only evidence. They do not call an image provider,
overwrite or delete source art, mutate the game repository, create SpriteFrames,
approve art, run Godot, commit, push or publish.
