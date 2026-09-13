# Directional equipment continuity

Palette, silhouette, registration, and equipment-presence checks cannot prove that held equipment is physically correct. Every directional review for a shield, weapon, or articulated prop must also bind the exact frame hash to its camera direction, carrying side, visible face, attachment, grip, strap routing or joint construction, plane, and occlusion statement.

For a shield carried at the character's side, camera direction determines whether the inner or outer face is visible. An inner-face drawing must show a believable forearm-through-straps relationship and controlling grip. An outer face cannot expose inner straps. The rule follows the declared pose and camera; it does not assume that one face is correct for every direction.

Use `DirectionalEquipmentContinuityContract` after identity and technical screening and before animation-family approval or runtime promotion. Keep rejected candidates and their hashes as evidence. A repaired master must be propagated through every affected state, then reviewed as one family at runtime scale. The contract is review evidence and always carries `runtimeAuthority: false`; promotion remains a separate explicit decision.
