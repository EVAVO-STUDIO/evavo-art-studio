# Project Art avatar final pass

This boundary connects the repository-owned EVA PNG bank to one complete, reviewable Art Studio production session.

It begins after `evavo-avatar-runtime` has materialized the exact repository bytes into a local, commit-addressed workspace. It compiles the work needed to inspect, repair, redraw, generate deliberate in-between frames, master, time, loop-check, atlas, review, release and publish an avatar sequence.

It does **not** infer animation meaning from filenames, timestamps or generation order. It does not edit an image, call a provider, approve a candidate, activate the runtime, mutate a repository or push to GitHub by itself.

## Contracts

```text
evavo.project-art-avatar-final-pass-request.v1
evavo.project-art-avatar-final-pass-plan.v1
evavo.project-art-avatar-frame-quality-report.v1
evavo.project-art-avatar-frame-repair-request.v1
evavo.project-art-avatar-inbetween-request.v1
```

The plan also creates templates for the existing downstream contracts:

```text
evavo.project-art-avatar-sequence-request.v1
evavo.project-art-atlas-request.v1
evavo.project-art-loop-closure-request.v1
evavo_avatar_sequence_pack_v2
```

## Source binding

The compiler consumes the exact `evavo.avatar.art-materialization-manifest.v1` produced by Avatar Runtime.

For every selected source frame it revalidates:

- repository commit SHA;
- materialization manifest SHA-256;
- canonical materialized path;
- single-link regular-file status;
- stable device, inode, size and timestamps before and after reading;
- exact source SHA-256 and byte count;
- non-interlaced 8-bit alpha PNG profile;
- declared canvas dimensions.

Source image bytes remain in the local workspace. They are not embedded in the plan or MCP messages.

## Frame decisions

Every selected frame receives one explicit disposition:

```text
accept
  no unresolved issue and no repair operation

deterministic-repair
  one or more declared issues plus exact Art Studio operations

provider-redraw
  one or more declared issues and a provider-neutral redraw request

exclude
  retained as source evidence but forbidden from sequence timelines
```

The issue vocabulary includes hands, fingers, anatomy, face identity, silhouette, crop, transparency, edge halo, jitter, lighting, style, background contamination and other visible artefacts.

`accept` cannot hide an unresolved hands or anatomy problem. Provider redraws remain disabled until a separate provider authorization is issued.

## Professional deterministic repair

The final-pass plan can request exact operations already supported by the Project Art sandbox:

```text
canvas-normalize
crop-normalize
align-centroid
edge-decontaminate
defringe
alpha-feather
fill-transparent-edge
denoise
sharpen
curves
channel-mixer
colour-match
```

The technical repair output is still not creative approval. The result must be visually reviewed against the identity anchor and adjacent animation frames.

## In-between frames

In-between generation is explicit. Each request names:

- the exact before and after frame identities;
- the new frame identity and reviewed target path;
- the intended duration;
- the generation method;
- the defects that must not be introduced.

Supported planning modes are:

```text
provider-generated
  production candidate only after separate provider authorization and review

deterministic-morph-preview
  mechanical preview only; never production eligible by itself
```

The compiler never silently manufactures an in-between because a motion gap appears large.

## Timing and loop quality

Every sequence declares its own ordered frame timeline and per-frame duration. Durations must remain inside the owner-selected quality gates.

True loops require explicit final-to-first thresholds for changed pixels, mean channel delta, alpha change and centroid shift. `once` and `ping-pong` clips cannot receive a false wraparound requirement.

Every frame quality job includes manual inspection of:

- hands and fingers;
- anatomy;
- face identity;
- silhouette;
- crop and canvas;
- transparency and edge halo;
- background contamination;
- style and lighting consistency;
- frame-to-frame jitter.

## Compile from the command line

After running the Avatar Runtime workstation bootstrap:

```powershell
node C:\GitRepos\evavo-art-studio\scripts\compile-project-art-avatar-final-pass.mjs `
  --workspace-root C:\EVAVO\workspaces\eva-avatar-art-bank\<avatar-commit> `
  --request C:\EVAVO\workspaces\eva-avatar-review\<avatar-commit>\eva-final-pass-request.json `
  --output C:\EVAVO\workspaces\eva-avatar-review\<avatar-commit>\eva-final-pass-plan.json `
  --compiled-at 2026-08-12T12:00:00.000Z
```

The output file is create-only and private. Replaying into the same path fails closed.

## Callable agent boundary

Start the dedicated MCP server:

```powershell
$env:EVAVO_ART_AVATAR_FINAL_PASS_ROOTS = "C:\EVAVO\workspaces;C:\GitRepos\evavo-avatar-runtime"
$env:EVAVO_ART_AVATAR_FINAL_PASS_MCP_ALLOW_WRITE = "true"
node C:\GitRepos\evavo-art-studio\tools\project_art_avatar_final_pass_mcp.mjs
```

It exposes:

```text
evavo_art_avatar_final_pass_capabilities
evavo_art_compile_avatar_final_pass
```

The MCP server imports the compiler directly. It uses no shell, transfers no image bytes, and can only create the JSON plan inside configured roots.

## Completing the real art pass

The plan is deliberately not the final release. The workstation or approved agent must still:

1. execute and inspect every frame quality job;
2. complete deterministic repairs and separately authorized redraws;
3. complete and inspect explicit in-betweens;
4. bind the exact output SHA-256 identities;
5. run professional mastering and motion;
6. compile and build the sequence review;
7. run final-to-first loop review for every true loop;
8. obtain independent art, animation and runtime approvals;
9. seal the Avatar Runtime sequence release;
10. publish through EVAVO Storage managed paths or a reviewed non-force Git data update.

Until those steps are complete, the plan always reports:

```text
productionReady: false
runtimeActivationAllowed: false
```

## Authority boundary

The final-pass compiler and MCP server retain all of the following as false:

```text
semantic assignment
source mutation or deletion
image editing
provider execution
candidate approval or promotion
repository mutation
Git commit or push
deployment
publication
runtime activation
force push
```

This boundary makes the work easy to execute and audit. It does not make an unreviewed image production-ready.
