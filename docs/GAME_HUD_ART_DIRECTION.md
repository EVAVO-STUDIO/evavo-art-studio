# Game HUD art direction and review

Use this workflow for persistent in-game HUDs before producing frames, icons or type assets. A HUD is part of the playfield composition. Review it over representative gameplay captures, at native output size, with the busiest threat and effect states present.

## Lock the play contract first

Record the genre, camera, native viewport, supported display sizes, input methods, visual period, technology level and the decisions a player must make under pressure. List critical state in the order it must be read. Keep persistent display to state that changes a near-term decision; route history, explanations and low-frequency detail to pause, briefing or requested panels.

For action games, reserve the player's maneuver envelope, threat approach corridors, aiming space, objective route and warning silhouettes before placing instruments. Use edge clusters with a stable reading order. Avoid a full-width bar merely because the canvas has an edge.

## Build one instrument grammar

Define one native pixel grid, type scale, numeral treatment, icon stroke and fill language, corner/radius vocabulary, spacing rhythm, opacity hierarchy and semantic palette. Style must name the game's period and fiction. A late-1990s military display should use plausible avionics grouping, restrained phosphor/accent color, compact pixel typography and hard functional framing; generic glass panels, ornamental neon and unrelated sci-fi glyphs are outliers.

Use shape and location as the first state channel, value/contrast as the second, and color as reinforcement. Critical warnings may break the normal palette temporarily. Transparent panels still need controlled local contrast; reducing opacity until the HUD disappears over one environment is not a solution.

## Consolidate related state

Prefer one multi-purpose instrument when its parts share a decision. A vehicle silhouette can carry mounted-weapon state and sectional damage while its surrounding scope carries radar contacts. A paired cluster can hold speed, throttle, altitude, form and engagement state. Do not repeat the same value in a top bar, corner panel and reticle.

Keep persistent labels short. Reveal full names on selection, change or warning. Let icons, bars and the vehicle schematic carry steady state. Transient alerts should appear beside the affected instrument and clear when the condition ends.

## Required evidence set

Review at least these native-resolution captures:

1. quiet navigation;
2. dense combat with projectiles crossing every edge;
3. critical damage plus missile warning;
4. every environment value extreme, including snow, cloud, water, night and bright effects;
5. minimum and maximum HUD scale;
6. every claimed aspect ratio and safe area;
7. reduced-motion and high-contrast/accessibility variants;
8. a transition state such as altitude change, transformation or boss phase.

Judge the composite and each isolated HUD layer. Retain a mask showing persistent HUD coverage and reserved play corridors. Record evidence for the three UX Studio observations `gameplay_hud_occlusion_acceptable`, `critical_hud_state_glanceable` and `hud_visual_language_coherent`. Missing evidence stays unknown.

## Acceptance questions

- Can a player see threats and objective cues before they become unavoidable?
- Can damage, active weapon, threat direction, altitude/form and speed be found in one brief glance?
- Does every persistent element change an immediate decision?
- Are warnings distinct without covering the target or aircraft?
- Do type, icons, frames and motion belong to the same game, period and technology?
- Does the HUD remain readable over every environment without turning into an opaque wall?
- Does the native pixel treatment survive scaling without uneven strokes or filtering?

Approve HUD art only after the runtime composite passes these checks. A clean isolated mockup is supporting evidence, not final approval.
