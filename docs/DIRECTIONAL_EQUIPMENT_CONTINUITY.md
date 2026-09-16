# Directional equipment continuity

Palette, silhouette, registration, and equipment-presence checks cannot prove that held equipment is physically correct. Every directional review for a shield, weapon, or articulated prop must also bind the exact frame hash to its camera direction, carrying side, visible face, attachment, grip, strap routing or joint construction, plane, and occlusion statement.

For a shield carried at the character's side, camera direction determines whether the inner or outer face is visible. An inner-face drawing must show a believable forearm-through-straps relationship and controlling grip. An outer face cannot expose inner straps. The rule follows the declared pose and camera; it does not assume that one face is correct for every direction.

Use `DirectionalEquipmentContinuityContract` after identity and technical screening and before animation-family approval or runtime promotion. Keep rejected candidates and their hashes as evidence. A repaired master must be propagated through every affected state, then reviewed as one family at runtime scale. The contract is review evidence and always carries `runtimeAuthority: false`; promotion remains a separate explicit decision.

## Measured v2 gate

Use `DirectionalEquipmentContinuityContractV2` for new production work. It keeps the v1 reviewer evidence but also binds each frame to a separate measurement hash and requires normalized subject/equipment bounds, centroids, grip and attachment landmarks, camera and equipment-plane vectors, rotation, scale, pivot, ground line, canonical construction details and style evidence. The validator independently derives the visible face and screen side instead of trusting those labels.

The v2 gate rejects camera/plane contradictions, equipment on the wrong side of the body, rotation outside the direction rule, disconnected grips, missing construction details, palette or line-density drift, body-scale or pivot drift, silhouette identity loss and frame-to-frame rotation or scale pops. Direction rules must be authored from the canonical character construction; they are not inferred from filenames or mirrored automatically.

Image-derived measurements and semantic landmarks serve different purposes. Bounds, centroids, scale, palette, line density, pivot and silhouette evidence should come from exact decoded pixels and masks. A named reviewer must still establish which anatomical hand owns the equipment, which surface is the canonical outer face, what details are legitimately occluded and whether the pose is physically believable. Neither evidence source can silently replace the other.

Direction rules that constrain the carrying hand now fail closed: every non-occluded equipment frame must include its carrying-hand landmark. When grip ownership is compared, the frame must also include the off-hand landmark. Omitting either landmark is a validation failure, so a wrong-side shield, reversed weapon grip or ambiguous hand assignment cannot pass by leaving the semantic evidence blank.

Mask-derived principal-axis rotation is compared modulo 180 degrees because the measured axis has no intrinsic arrow. Directed face ownership remains independently enforced by the reviewed camera vector and equipment outer-normal vector.

Per-frame rotation and frame-to-frame rotation/scale comparisons pause across an explicitly reviewed occlusion. A visible fragment cannot provide a comparable full-plane axis or area; the frame must still declare the occlusion, preserve canonical-detail accounting and pass character style and identity checks.
