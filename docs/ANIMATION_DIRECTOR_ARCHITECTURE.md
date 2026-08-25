# EVAVO Animation Director

The Animation Director is the orchestration layer for deterministic 2D animation planning in Art Studio. It converts a high-level motion request into an explicit frame plan before provider execution.

The implementation must remain evidence-driven and provider-neutral. It does not treat generated imagery as approved art, does not hide timing decisions inside prompts, and does not duplicate Cel Animation Studio's X-sheet authority.

## First vertical slice

The first production proof is a walk-cycle planner with explicit contact, down, passing and up poses. It defines loop semantics, frame durations, planted-foot constraints, canonical identity requirements, neighbouring-frame dependencies and provider control roles. The planner is intended to feed existing Art Studio provider, mastering, sequence-review, atlas and Godot delivery paths.
