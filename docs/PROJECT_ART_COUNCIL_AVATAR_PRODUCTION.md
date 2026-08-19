# Council avatar production program

The Council avatar production program turns the authoritative four-seat Council roster into one consistent EVAVO character-production programme.

## Current seats

| Council seat | Character | Current media state |
| --- | --- | --- |
| Architect | Top Hat Man | identity exists; six required authored performance poses are still missing |
| Researcher | EVA | identity exists; dense-motion bootstrap and full authored suite are incomplete |
| Critic | Council Critic | original identity master required; governed candidate-generation runtime available |
| Open Reviewer | Council Open Reviewer | original identity master required; governed candidate-generation runtime available |

The production program never treats a sparse pose approximation, CSS transform, synthetic mouth or low-resolution atlas as finished animation.

## Shared production bar

Every character must ultimately use the same professional authored-animation standard:

- 1024×1536 identity-locked RGBA masters;
- one complete character per provider frame, genuine transparency and clean canvas clearance;
- 25 authored clips;
- 732 full-character animation frames;
- 17 full-canvas registered mouth/eye pose layers;
- 749 planned images per complete character pack;
- four non-repeating idle variants and six talk variants;
- 24 fps minimum authored body motion and 30 fps preferred;
- refresh-synchronised 60 fps browser presentation;
- exact audio timing with independent registered mouth poses;
- two independent frame inspectors at 0.95 minimum confidence;
- adjacent-frame continuity and loop-closure evidence;
- reduced-motion fallback to a reviewed static identity;
- separate release and runtime-activation gates.

The canonical existing animation-suite compiler remains `scripts/project-art/avatar-animation-suite.mjs`. The Council program reads its capabilities and fails if the 4-idle / 6-talk / 24–30 fps standard drifts.

## New identity direction

`council-critic` and `council-open-reviewer` receive original role-specific identity briefs. Both reject generic AI-assistant styling, sci-fi holograms, cyberpunk glow, floating UI, robot parts, headsets, text and checkerboard backgrounds.

The Critic is designed as a precise, formidable editorial character with sharp charcoal tailoring and a restrained cherry-red construction detail. The Open Reviewer is designed as an independent practical creative technologist with an off-white studio/work jacket, black base layer and restrained cherry-red utility detail. Neither may duplicate EVA or Top Hat Man.

Each character has four candidate sets with three continuity views per set: `full-body-right`, `full-body-left` and `neutral-bust`. The right full-body view is generated first and becomes the unapproved continuity anchor for the other two views in that same set. Dependent views are not permitted to borrow an anchor from another candidate set.

## Compile the Council plan

```bash
node scripts/compile-project-art-council-avatar-production.mjs \
  --output /trusted/council-avatar-production-program.json
```

The output is create-only. It grants no provider execution, approval, publication or runtime activation authority.

## Governed Critic and Open Reviewer provider lifecycle

The identity provider lifecycle is deliberately separate from identity approval and animation production.

1. Compile or verify the provider-free identity master plan and bootstrap admission.
2. Admit one exact bootstrap job with one exact provider/model selection and no fallback.
3. Issue a named-human one-shot authorization expiring within 24 hours.
4. Compile a self-hashed runtime adapter binding the identity request, bootstrap provenance, admission and authorization.
5. Run the durable provider transaction using the reviewed adapter file and its exact file SHA-256.
6. Keep the resulting candidate as an unapproved intermediate artifact until create-only materialization, finishing and independent three-view identity review are complete.

Compiler surface:

```bash
node scripts/compile-project-art-character-identity-provider-runtime.mjs <admit|authorize|adapter> ...
```

Execution surface:

```bash
node scripts/run-project-art-character-identity-provider.mjs \
  --adapter /trusted/identity-provider-adapter.json \
  --expected-adapter-file-sha256 <sha256> \
  --runtime-root /trusted/runtime \
  --artifact-root /trusted/artifacts \
  --dispatch-output /trusted/dispatch.json \
  --binding-output /trusted/binding.json \
  --outcome-output /trusted/outcome.json \
  --receipt-output /trusted/execution.json
```

The executor reuses Art Studio's canonical provider, runtime and immutable-artifact implementations. It allows one provider call and one runtime attempt per authorization, performs no provider fallback, and grants no candidate approval, identity approval, animation production, publication, Runtime activation or website activation authority.

## MCP

```bash
node tools/project_art_council_avatar_production_mcp.mjs
```

Tools include:

- `evavo_art_council_avatar_production_capabilities`
- `evavo_art_council_avatar_production_program`
- `evavo_art_council_avatar_media_readiness`

They are read/compute-only and can be called by ChatGPT, Claude or other MCP-compatible agents.

## Validation

```bash
node --test scripts/test-project-art-council-avatar-production.mjs
node --test scripts/test-project-art-avatar-animation-suite.mjs
node --test scripts/test-project-art-character-identity-provider-runtime.mjs
```

The dedicated Council workflow builds the exact provider/runtime/worker packages before running the provider fixture regression. It proves one-call generation, replay rejection, same-set continuity anchors, cross-set rejection, bounded authorization and fail-closed authority. Identity approval, Runtime publication and website activation remain separate governed stages.
