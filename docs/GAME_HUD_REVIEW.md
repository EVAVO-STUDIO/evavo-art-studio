# Game HUD review

`game_hud_review.mjs` turns a HUD layout into a repeatable visibility and information-priority review. It is genre-aware through the supplied states and element purposes; it does not prescribe one visual style.

Model the HUD after defining the player decisions that must be made during play. Keep survival and navigation readable, group related information into peripheral instruments, and let urgent warnings replace routine messages. Permanent elements should form at most two clusters and contribute no more than eight percent weighted viewport coverage. Always review captures at the logical runtime resolution for cruise, dense combat, critical damage, navigation transitions, boss play, and any genre-specific interaction such as bombing or dialogue.

Each element declares its rectangle, opacity, persistence, priority, cluster and the `decisionIds` it supports. Declare the complete `criticalDecisions` list once; the review blocks a missing decision and flags duplicate permanent presentations across clusters. A permanent instrument may also declare `adaptiveHousing: { trigger: "gameplay-overlap", yieldOpacity: 0.12 }`, meaning its smoked backing fades while text and symbols stay legible. Each state declares exactly which elements are visible, links to a capture, and may name `gameplayOverlapElementIds` observed in that capture. The review blocks permanent UI that obscures gameplay without yielding.

Declare a `styleContract` with `visualPeriod`, `fiction`, `nativePixelGrid`, `typography`, `iconLanguage`, `framingLanguage`, an ordered `opacityHierarchy` of at least three values, and at least three named `semanticColors`. This prevents a geometrically clean HUD from passing while its art language remains generic or inconsistent with the game. The result emits `uxStudioObservations` for play-space occlusion, glanceability and visual-language coherence so the same evidence can enter UX Studio without translating one broad pass/fail value by hand.

Choose a `genreProfile` of `vertical-combat`, `side-scroller`, `strategy`, or `general`. The vertical-combat profile applies the strictest permanent-coverage budget because threats enter from the forward edge and can cross both lower corners. Profiles change measurable visibility limits; they do not impose a modern, fantasy, military, pixel, or cel visual style.

```powershell
node tools/game_hud_review.mjs --input .\hud-review.json --output .\hud-review.result.json
```

Use the report alongside native-resolution captures. Include cruise, dense combat, critical damage, navigation transitions, boss play, and every state where gameplay crosses a permanent instrument. A passing geometry report does not establish legibility, art-direction fit, animation quality, correct font rendering, contrast over every environment, or controller usability.
