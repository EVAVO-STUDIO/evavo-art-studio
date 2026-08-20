# Council avatar production program

The Council avatar production program turns the authoritative four-seat Council roster into one consistent EVAVO character-production programme.

## Current seats

| Council seat | Character | Current media state |
| --- | --- | --- |
| Architect | Top Hat Man | identity exists; six required authored performance poses are still missing |
| Researcher | EVA | identity exists; dense-motion bootstrap and full authored suite are incomplete |
| Critic | Veyra (`council-critic`) | original alien identity master required; procedural motion proof and governed candidate-generation runtime available |
| Open Reviewer | Moro Pell (`council-open-reviewer`) | original amphibious identity master required; procedural motion proof and governed candidate-generation runtime available |

Nymm is a **preview-only guest arbiter exploration**. Nymm is not a fifth canonical Council seat and cannot be assigned, approved, published or activated through the procedural review surface.

The production program never treats a sparse pose approximation, CSS transform, synthetic mouth, procedural previsualisation or low-resolution atlas as finished production animation.

## Shared production bar

Every canonical character must ultimately use the same professional authored-animation standard:

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
- separate release and Runtime-activation gates.

The canonical existing animation-suite compiler remains `scripts/project-art/avatar-animation-suite.mjs`. The Council program reads its capabilities and fails if the 4-idle / 6-talk / 24–30 fps standard drifts.

## V4.3 procedural review boundary

The V4.3 procedural review is a deterministic code-authored previsualisation layer. It exists to test silhouette, body mechanics, secondary motion, loop timing, transparent rendering, review-video transport and atlas packing **before** a new identity is approved.

Authoritative files:

- `scripts/project-art/council-avatar-procedural-review.mjs`
- `scripts/project-art/council-avatar-procedural-renderer.py`
- `scripts/project-art/compile-council-avatar-review-atlases.py`
- `scripts/compile-project-art-council-avatar-procedural-review.mjs`

The review contract hashes the exact Python source bytes, binds four canonical seat IDs plus preview-only Nymm, and keeps every production authority false. A procedural drawing is not an identity-master candidate. A review video is not animation approval. A review atlas is not a Runtime atlas. None can satisfy Council media readiness, publish media, replace a website character or activate Runtime.

The coded review matrix contains five clips per character:

- `idle-primary`
- `idle-b`
- `listening`
- `talk-neutral`
- `run-loop` as a mechanics-only locomotion proof

Review videos are 512×768 H.264 at 60 fps. Transparent source rendering is 1024×1536 RGBA. Review atlases use 256×384 frames at 30 fps on 2048×2048 lossless RGBA pages, with stable bottom-centre pivots and exact post-pack pixel-hash verification.

### Compile the read-only review contract

```bash
node scripts/compile-project-art-council-avatar-procedural-review.mjs summary
node scripts/compile-project-art-council-avatar-procedural-review.mjs capabilities
node scripts/compile-project-art-council-avatar-procedural-review.mjs compile \
  --output /trusted/create-only/council-avatar-procedural-review.json
```

### Run the local renderer checks

The Python renderer requires Python 3.11+ and Pillow. FFmpeg is required only for H.264 review-video encoding.

```bash
python3 scripts/project-art/council-avatar-procedural-renderer.py --self-test
python3 scripts/project-art/council-avatar-procedural-renderer.py \
  --output /trusted/create-only/council-avatar-review
python3 scripts/project-art/compile-council-avatar-review-atlases.py \
  --renderer scripts/project-art/council-avatar-procedural-renderer.py \
  --output /trusted/create-only/council-avatar-review-atlases
```

All output paths are review destinations. Generated files remain unapproved evidence until separate identity, animation, release and Runtime gates pass.

## New alien identity direction

`council-critic` and `council-open-reviewer` receive original role-specific alien identity briefs. Both reject generic AI-assistant styling, sci-fi holograms, cyberpunk glow, floating UI, robot parts, headsets, protected-character reconstruction, text and checkerboard backgrounds.

### Veyra, Council Critic

Veyra is an original four-eyed tribunal elder with an extremely tall narrow silhouette, a sculptural cranial sail, bone-white skin, black mineral-textured ceremonial work garments and one faded Council-red construction seam. Veyra should feel precise and formidable without villain coding. Four-eye placement, sail geometry and four-digit hand anatomy must remain exact across every candidate view.

### Moro Pell, Council Open Reviewer

Moro Pell is an original broad amphibious scholar elder with three eyes, a restrained throat membrane, moss-grey skin, oversized four-digit hands, worn ivory studio-work layers and one repaired cherry-red seam. Moro Pell should feel practical, open and independent without becoming a cute mascot, startup-founder cliché or glossy game alien. Eye placement, membrane attachment and hand anatomy must remain exact across every candidate view.

Each identity has four candidate sets with three continuity views per set: `full-body-right`, `full-body-left` and `neutral-bust`. The right full-body view is generated first and becomes the unapproved continuity anchor for the other two views in that same set. Dependent views are not permitted to borrow an anchor from another candidate set.

The V2 identity requests use new create-only output roots. They do not overwrite the prior human-direction candidate namespace.

## Compile the Council plan

```bash
node scripts/compile-project-art-council-avatar-production.mjs \
  --output /trusted/council-avatar-production-program.json
```

The output is create-only. It grants no provider execution, approval, publication or Runtime activation authority.

## Governed Veyra and Moro Pell provider lifecycle

The identity provider lifecycle is deliberately separate from procedural review, identity approval and animation production.

1. Compile or verify the provider-free identity master plan and bootstrap admission.
2. Admit one exact bootstrap job with one exact provider/model selection and no fallback.
3. Issue a named-human one-shot authorization expiring within 24 hours.
4. Compile a self-hashed Runtime adapter binding the identity request, bootstrap provenance, admission and authorization.
5. Run the durable provider transaction using the reviewed adapter file and its exact file SHA-256.
6. Keep the resulting candidate as an unapproved intermediate artifact until create-only materialisation, finishing and independent three-view identity review are complete.

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

The executor reuses Art Studio's canonical provider, Runtime and immutable-artifact implementations. It allows one provider call and one Runtime attempt per authorization, performs no provider fallback, and grants no candidate approval, identity approval, animation production, publication, Runtime activation or website activation authority.

## MCP

```bash
node tools/project_art_council_avatar_production_mcp.mjs
```

Tools include:

- `evavo_art_council_avatar_production_capabilities`
- `evavo_art_council_avatar_production_program`
- `evavo_art_council_avatar_procedural_review_capabilities`
- `evavo_art_council_avatar_procedural_review`
- `evavo_art_council_avatar_media_readiness`

They are read/compute-only and can be called by ChatGPT, Claude or other MCP-compatible agents.

## Validation

```bash
node --test scripts/test-project-art-council-avatar-production.mjs
node --test scripts/test-project-art-council-avatar-procedural-review.mjs
node --test scripts/test-project-art-avatar-animation-suite.mjs
node --test scripts/test-project-art-character-identity-provider-runtime.mjs
python3 -m py_compile \
  scripts/project-art/council-avatar-procedural-renderer.py \
  scripts/project-art/compile-council-avatar-review-atlases.py
```

The dedicated Council workflow syntax-checks the JavaScript and Python surfaces, runs the deterministic review and production contracts, and separately builds the exact provider/runtime/worker packages before running the provider fixture regression. It proves one-call generation, replay rejection, same-set continuity anchors, cross-set rejection, bounded authorization and fail-closed authority. Procedural review, identity approval, Runtime publication and website activation remain separate governed stages.
