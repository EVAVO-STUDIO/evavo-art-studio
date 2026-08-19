# EVA dense-motion mastering execution

## Status

The v2 EVA dense-motion programme requires ten new deterministic final masters. This execution surface can master and finish those ten frames only after the required candidate, inspection, alpha-matte review and one-shot authorization evidence exists.

The existence of this surface does **not** mean the real EVA media is complete. Repository readiness remains fail-closed until real campaign evidence, technical and creative review, continuity, immutable publication, Avatar Runtime evidence and the full authored animation family are complete.

## Production boundary

Each frame remains exact 1024×1536 RGBA. The mastering path:

1. binds the frame to the self-hashed v2 ten-master programme;
2. requires dense candidate assurance covering every avatar frame check;
3. requires at least two independent inspectors with confidence >= 0.95 on every observation;
4. requires a named-human reviewed alpha matte;
5. requires a frame/program/candidate/matte-bound mastering authorization valid for no more than 24 hours and one execution;
6. copies visible candidate RGB without creative alteration;
7. applies only the reviewed alpha plane;
8. clears hidden RGB under fully transparent pixels;
9. rejects visible pixels on the canvas edge;
10. emits the standard unapproved avatar frame-finisher handoff;
11. runs the existing generic frame finisher;
12. leaves technical review, creative approval, publication, sequence release and Runtime activation false.

## Ten-frame campaign

`scripts/project-art/eva-dense-motion-mastering-campaign.mjs` provides the deterministic campaign contract.

Before its first write, it preflights every pending frame through the pure alpha-master compiler. The campaign then runs sequentially and stops on the first failure. It supports resume only at a completed-frame boundary. If a frame has a partial alpha/finisher bundle without its exact semantic completion receipt, the campaign fails closed instead of guessing whether it can resume.

A completed-campaign replay re-verifies every semantic frame receipt and the actual finished PNG SHA-256 and byte length before returning reused state. A valid old campaign receipt cannot hide modified media bytes.

The campaign receipt deliberately records ten masters/finisher bundles **present**, plus how many frames were executed or reused in that invocation. It always records zero technical inspections, creative approvals, Cloudinary uploads, sequence releases and Runtime activations because those are downstream authorities.

## CLI

The governed CLI is:

```text
node scripts/run-project-art-eva-dense-motion-mastering-campaign.mjs preflight \
  --program <absolute-ten-master-program.json> \
  --workspace-root <absolute-real-workspace-root> \
  --mastered-at <canonical-ISO-8601-UTC> \
  --finished-at <canonical-ISO-8601-UTC>
```

After a successful preflight, execution uses the same exact inputs:

```text
node scripts/run-project-art-eva-dense-motion-mastering-campaign.mjs run \
  --program <absolute-ten-master-program.json> \
  --workspace-root <absolute-real-workspace-root> \
  --mastered-at <canonical-ISO-8601-UTC> \
  --finished-at <canonical-ISO-8601-UTC>
```

The CLI accepts no provider, approval, upload, publication or Runtime controls. Unknown and duplicate flags are rejected.

## Required real workspace evidence per frame

For each of ordinals 1 through 10 the exact v2 job paths must contain:

- dense source-space candidate bytes;
- self-hashed dense candidate assurance;
- reviewed alpha matte bytes;
- self-hashed named-human alpha-matte review;
- `alpha-mastering.authorization.json` under the exact frame root.

The campaign creates the alpha-master and finisher evidence create-only. It does not manufacture missing inputs.

## After mastering

A successful real campaign still remains blocked from production release. The required next stages are:

- independent technical inspection of all ten finished frames;
- named-human creative/identity approval of all ten frames;
- ten-edge continuity review, including frame 10 → frame 1;
- proof that current fallback masters 4/5/6 were not reused as final dense masters;
- immutable publication of reviewed masters;
- Avatar Runtime frame-evidence assembly;
- atomic sequence release;
- full authored 749-image animation-suite generation/review;
- browser playback, responsive, reduced-motion, fallback and cold-load verification.

Until those gates pass, EVA must remain on the quality-first production fallback and must not be described as having complete production animation.
