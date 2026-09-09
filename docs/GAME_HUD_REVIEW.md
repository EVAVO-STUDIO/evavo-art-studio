# Game HUD review

`game_hud_review.mjs` turns a HUD layout into a repeatable visibility and information-priority review. It is genre-aware through the supplied states and element purposes; it does not prescribe one visual style.

Model the HUD after defining the player decisions that must be made during play. Keep survival and navigation readable, group related information into peripheral instruments, and let urgent warnings replace routine messages. Permanent elements should form at most two clusters and contribute no more than eight percent weighted viewport coverage. Always review captures at the logical runtime resolution for cruise, dense combat, critical damage, navigation transitions, boss play, and any genre-specific interaction such as bombing or dialogue.

Each element declares its rectangle, opacity, persistence, priority and cluster. Each state declares exactly which elements are visible and links to a capture. The review blocks excessive permanent coverage, excessive persistent clusters, and critical information collisions. Missing capture evidence or a permanent top-edge display requires review.

```powershell
node tools/game_hud_review.mjs --input .\hud-review.json --output .\hud-review.result.json
```

Use the report alongside visual judgment. A passing geometry report does not establish legibility, art-direction fit, animation quality, correct font rendering, contrast over every environment, or controller usability.
