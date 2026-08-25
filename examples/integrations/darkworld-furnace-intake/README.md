# Darkworld — Furnace Intake integration

This fixture is the producer-side companion to the canonical Furnace Intake request owned by `EVAVO-STUDIO/godot-462-darkworld-cinematic-platformer`.

## Authority boundary

Art Studio owns governed intake, workspace creation, mastering, review evidence and delivery optimisation for the five finished environment plates. Darkworld remains authoritative for gameplay geometry, camera framing, collision, cover, hazards, enemy placement and runtime QA.

The source request is:

`examples/cinematic_precision_platformer/showcase/furnace_art_studio_request.json`

in the Darkworld repository.

## Required outputs

- `assets/environments/furnace_intake/background.png`
- `assets/environments/furnace_intake/mid_structure.png`
- `assets/environments/furnace_intake/gameplay_skin.png`
- `assets/environments/furnace_intake/foreground.png`
- `assets/environments/furnace_intake/glow.png`

All plates are 1280x360. Background is opaque; the other four require useful alpha. The authored internal frame remains 640x360.

## Existing Art Studio capabilities to use

- `art.project.workspace`
- `art.project.mastering`
- `art.project.review`
- `art.delivery.optimize`

Do not create a second image pipeline specifically for Darkworld. Compile the external request into a bounded Project Art workspace, retain immutable source evidence, master reviewed candidates, produce review evidence, then return mastered files plus provenance to the consumer repository.

## Non-negotiable consumer constraints

- No character or HUD baked into environment plates.
- Do not move floor, cover, guard, crusher, room split or camera anchors to fit art.
- Do not convert the visual target into generic cyberpunk, neon sci-fi, clean industrial concept art or modern tactical imagery.
- The five output layers must register together without drift.
- Web/balanced variants may optimise delivery, but must not change composition or gameplay alignment.

## Return evidence

A completed handoff should identify:

- Darkworld job id;
- request/schema version;
- source and candidate hashes;
- exact mastered output path;
- review decision/evidence reference;
- mastering/delivery profile;
- any unresolved visual risk.

The consumer-side QA remains authoritative for final runtime admission.
