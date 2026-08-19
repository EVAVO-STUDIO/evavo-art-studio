# Council avatar production program

The Council avatar production program turns the authoritative four-seat Council roster into one consistent EVAVO character-production programme.

## Current seats

| Council seat | Character | Current media state |
| --- | --- | --- |
| Architect | Top Hat Man | identity exists; six required authored performance poses are still missing |
| Researcher | EVA | identity exists; dense-motion bootstrap and full authored suite are incomplete |
| Critic | Council Critic | original identity master required |
| Open Reviewer | Council Open Reviewer | original identity master required |

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

## Compile the plan

```bash
node scripts/compile-project-art-council-avatar-production.mjs \
  --output /trusted/council-avatar-production-program.json
```

The output is create-only. It grants no provider execution, approval, publication or runtime activation authority.

## MCP

```bash
node tools/project_art_council_avatar_production_mcp.mjs
```

Tools:

- `evavo_art_council_avatar_production_capabilities`
- `evavo_art_council_avatar_production_program`

Both are read/compute-only and can be called by ChatGPT, Claude or other MCP-compatible agents.

## Validation

```bash
node --test scripts/test-project-art-council-avatar-production.mjs
node --test scripts/test-project-art-avatar-animation-suite.mjs
```

Identity generation, provider execution, candidate approval, repository publication and website activation remain separate governed stages.
