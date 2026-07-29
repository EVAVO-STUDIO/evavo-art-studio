# Sprite continuity and layered production

EVAVO Art Studio treats a sprite sheet as a delivery derivative, not as the authoring unit. The authoring unit is a continuity blueprint containing a canonical identity, direction masters, key poses, per-frame timing, layer treatment, shot bounds, conditioning references, source retention and repair policy.

## Source-of-truth hierarchy

1. Canonical identity master.
2. Direction masters.
3. Approved motion extremes and key poses.
4. Neighbour-conditioned in-between frames.
5. Registered layer frames and engine sidecars.
6. Reconstructed colour composites.
7. Lossless individual frame masters.
8. Packed sheets, atlases, previews and engine resources.

A provider may create or edit one bounded frame or layer candidate. It may not define the hierarchy, independently reinvent later frames or write a packed sheet directly into the final-deliverable area.

## Choosing authored cels, a layered rig or a hybrid

Use **authored cels** when anatomy, cloth, engraved linework, low-resolution clusters or effects deform enough that a puppet would create mechanical motion or visible seams.

Use a **layered rig** when the art direction intentionally supports cutout motion, repeated runtime customisation, transform-driven parts and a stable rest-pose hierarchy. A rig must declare pivots, parents, z-order, overlap and hidden-art requirements.

Use a **hybrid** when the body and deforming cloth need authored cels but shadows, held items, equipment, face variants, effects or engine sidecars benefit from independent control.

Godot supports traditional `AnimatedSprite2D` cel animation alongside cutout animation, so a project does not need to force one method across every body part. See:

- https://docs.godotengine.org/en/4.6/classes/class_animatedsprite2d.html
- https://docs.godotengine.org/en/4.6/tutorials/animation/cutout_animation.html

## Separation test

Create a separate sprite or layer only when it provides at least one real production benefit:

- reuse or interchangeability;
- an independent pivot, material, blend mode, collision shape or timing curve;
- front/behind occlusion that must be controlled explicitly;
- linked-cel reuse across several frames;
- independent colour, alpha or repair work;
- engine-only data such as collision, normal or emission maps;
- repair without disturbing approved anatomy or identity.

Keep content baked into an authored cel when separation would create seams, require invented hidden artwork, break intentional pixel clusters, make cloth or anatomy move mechanically, or multiply files without improving reuse or control.

Negative phrases are never component declarations. “Do not crop weapons” does not create a weapon layer unless the brief positively declares a weapon or held-item component.

## Frame authoring

The planner compiles this dependency order:

```text
identity master
  -> direction masters
    -> key poses
      -> neighbour-conditioned in-betweens
        -> frame layout
          -> layer registration
            -> composite reconstruction
              -> alpha and edge mastering
                -> continuity and timing validation
                  -> editable source package
                    -> packed derivatives and engine resources
```

An in-between references the canonical identity, its direction master, the approved previous key pose and the approved next key pose. Repair is scoped to the smallest failed frame or layer. Passing sibling frames are not regenerated.

Image-conditioning adapters and structural controls are provider capabilities rather than domain assumptions. A compatible worker can combine identity/style image guidance with pose, edge, depth, silhouette or layout control. Current Diffusers references:

- https://huggingface.co/docs/diffusers/using-diffusers/ip_adapter
- https://huggingface.co/docs/diffusers/using-diffusers/controlnet

## Layer and cel source contract

The editable source retains:

- layers and hierarchy;
- cels and linked cels;
- animation tags;
- exact millisecond frame durations;
- slices and pivots;
- individual lossless composites;
- registered exported layers;
- source dimensions and safe bounds;
- packed derivatives and manifests.

Aseprite exposes layers, linked cels, tags, slices, pivots, per-frame duration and CLI layer/frame exports, so those concepts are retained rather than flattened away:

- https://www.aseprite.org/docs/sprite/
- https://www.aseprite.org/docs/linked-cels/
- https://www.aseprite.org/docs/slices/
- https://www.aseprite.org/docs/cli/

## Exact Godot timing

Aseprite records duration in milliseconds. Godot `SpriteFrames.add_frame()` stores a relative duration. The blueprint therefore retains both:

```text
base_frame_ms = 1000 / animation_fps
godot_relative_duration = aseprite_duration_ms / base_frame_ms
```

This preserves intentional holds and accents instead of reducing the animation to one approximate global frame rate. Godot reference:

- https://docs.godotengine.org/en/stable/classes/class_spriteframes.html

## Blocking continuity evidence

A sprite cannot be approved until the required evidence passes:

- identity and proportion comparison against the canonical master;
- cross-direction identity and equipment agreement;
- silhouette, palette, line-treatment and material consistency;
- exact canvas, pivot, baseline and ground contact;
- safe-bound and crop proof;
- complete direction, frame, tag and duration ordering;
- layer registration and occlusion;
- source-layer to approved-composite parity;
- real alpha, matte and transparent-pixel checks;
- loop closure where applicable;
- atlas padding, extrusion and manifest integrity;
- editable-source completeness and provenance.

Automatic approval never lowers thresholds. If bounded repair cannot pass a blocking gate, the run stops with a decision packet rather than accepting a weak frame.
