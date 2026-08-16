# Project Art avatar display bridge

Art Studio authors and assures real avatar frames. The browser runtime presents only those admitted frames; it does not invent provider frames, modify image bytes, approve candidates, activate releases or publish art.

## Why this bridge exists

A 60 fps render loop can still look static when an approved pose is held for most of its logical duration and dissolved only at the end. It can also look unstable when mouth-viseme changes select different full-body poses. The display bridge closes both gaps:

- body cadence continues independently of speech visemes;
- the registered mouth layer follows exact audio timing with a 64 ms minimum hold;
- adjacent approved bodies use a continuous `smootherstep` alpha transition;
- 24–30 fps authored sequences receive full logical-frame transition coverage;
- a sparse approved-anchor fallback receives up to a 560 ms transition rather than a short 96 ms tail dissolve;
- duplicate visual frame IDs do not perform a meaningless dissolve;
- reduced-motion presentation remains fixed to the reviewed neutral frame;
- dropped display frames sample the current logical time and never replay a catch-up burst.

The runtime contract is `evavo_avatar_display_cadence_v2` at a 60 fps display target. Its active blend policy is:

```text
minimum blend window: 80 ms
maximum blend window: 560 ms
blend-window ratio:   0.78
interpolation easing: smootherstep
```

The effective window can never exceed the authored frame duration. At 30 fps this means the approved frame pair blends over the complete 33.33 ms logical frame. For the current 720 ms Top Hat approved-anchor fallback, 560 ms is continuously blended.

## Production request

`compileProjectArtAvatarDisplayBridge` accepts an exact request containing:

```text
character and clip identity
a 24–30 fps authored cadence
an explicit loop policy
two or more uniquely identified approved frames
full-canvas pixel-exact registered mouth-layer policy
closed provider, approval, repository, activation and publication authority
```

Every frame must already be approved. Opaque RGBA planes, painted checkerboards, hidden RGB under alpha zero, visible canvas-edge pixels, identity drift and broken adjacent or final-to-first continuity remain blocking in the surrounding Art Studio pipeline.

## Verification

Run the focused contract suite with:

```bash
node --test scripts/test-project-art-avatar-display-bridge.mjs
```

The dedicated GitHub workflow runs the same suite on every relevant mainline or pull-request change.
