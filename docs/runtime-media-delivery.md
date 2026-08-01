# Runtime media delivery

Status: implemented deterministic foundation

EVAVO Art Studio owns the reusable preparation boundary for image, audio and Godot sprite-effect assets. Development Studio owns cross-repository provenance, publication planning, lease fencing and exact `main` publication. Target repositories own native engine import and visual or listening acceptance.

```text
retained source or editable master
→ role-specific Art Studio preparation
→ decoded image/audio or static shader evidence
→ smallest passing runtime derivative or exact generated resource
→ immutable receipt and exact output paths
→ Development Studio provenance reconciliation
→ one governed target-repository commit
→ native Godot 4.6.2 validation
```

The runtime repository must not become the only copy of a high-resolution or lossless master. Rebuild derivatives from retained sources rather than repeatedly recompressing already prepared media.

## Images

`@evavo/art-delivery-optimizer` chooses dimensions, colour model, alpha policy and encoding from the asset’s role rather than applying one global size or quality setting.

Brass & Brine uses a native 1280×720 fixed-camera stage:

- room and location plates: at most 1280×720;
- registered overlays: the exact 1280×720 stage when registration matters;
- dialogue portraits: at most 384×384, with authored black stages preserved;
- standing characters: at most 384×576 with meaningful alpha;
- UI icons: at most 256×256;
- retained higher-resolution originals: outside the runtime derivative set.

The retro profiles now enforce the actual PNG storage contract as well as decoded appearance:

```text
dialogue portrait: PNG, 8-bit grayscale, colour type 0, non-interlaced
standing character: PNG, 8-bit grayscale+alpha, colour type 4, non-interlaced
scene plate: PNG, 8-bit grayscale, colour type 0, non-interlaced
overlay: PNG, 8-bit grayscale+alpha, colour type 4, non-interlaced
colour UI icon: PNG, 8-bit RGBA, colour type 6, non-interlaced
```

Black is removed only through conservative border-connected matte extraction for assets whose role requires transparency. Dialogue stages and other authored black compositions remain opaque. Every encoding candidate is decoded again and checked for dimensions, colour storage, alpha storage, pixel error, PSNR and byte budget before the smallest passing candidate is selected.

## Audio

`@evavo/art-audio-delivery` uses FFmpeg and FFprobe through exact executable, version and SHA-256 identities. It decodes the normalized reference and every candidate back to floating-point PCM before selection.

Profiles separate low-latency effects from compact streaming media:

- UI SFX: mono PCM16 WAV, capped at 22.05 kHz;
- short gameplay one-shots: mono PCM16 WAV, capped at 44.1 kHz;
- long one-shot effects: mono Ogg Vorbis, capped at 44.1 kHz;
- voice: mono Ogg Vorbis, capped at 22.05 kHz;
- ambience: up to stereo Ogg Vorbis, capped at 44.1 kHz;
- music: up to stereo Ogg Vorbis, capped at 48 kHz.

A cap is not a target. The optimizer never upsamples or upmixes a lower-rate source. Trim-enabled one-shot profiles reject looping. Ambience and music preserve leading and trailing timing, validate loop beginnings against prepared sample frames and retain both sample and seconds evidence.

Candidate evidence includes codec, container, sample rate, channels, duration, alignment, mean and root-mean-square error, SNR, peak error, exact hashes and byte savings. The smallest candidate satisfying timing, quality and size gates is selected.

## Godot sprite effects

`@evavo/art-godot-sprite-effects` compiles shared Godot 4.6.2 CanvasItem shaders, materials, an exact catalog, a C# parameter binder and a content-addressed receipt.

The governed catalog contains:

- combined outline, hover, hit-flash and opacity feedback;
- ordered 4×4 dissolve with a restrained edge;
- ghost and memory apparition treatment;
- anchored whole-pixel sway;
- engraved black/white ink with optional red-accent retention;
- additive pulse for compact light and particle sprites.

All mutable values are `instance uniform` parameters so shared materials cannot leak state between sprites. Animated effects use a pause-aware game-owned `effect_time`, not Godot’s global `TIME`. Texture samples clamp to the declared `source_uv_rect`, preserve CanvasItem modulation exactly once and return transparent outside the assigned atlas region.

The static gate forbids dynamic loops, `discard`, screen-texture copies, extra samplers and derivative texture sampling, and enforces a fixed texture-sample budget. The generated C# binder validates finite values and uses `CanvasItem.SetInstanceShaderParameter` for whole textures or normalized atlas regions.

Effects remain presentation-only. They may never own deterministic simulation, damage, selection authority, persistence, timing outcomes or save data. Native Godot shader compilation, renderer capture, hostile-background alpha review and measured performance remain later production gates.

## Commands

```powershell
pnpm optimize -- profiles
pnpm audio:optimize -- profiles
pnpm sprite-effects -- catalog

pnpm optimize -- batch --manifest C:\Media\images.json --source-root C:\Media\source --output-root C:\Media\prepared-images --apply
pnpm audio:optimize -- batch --manifest C:\Media\audio.json --source-root C:\Media\source --output-root C:\Media\prepared-audio --apply
pnpm sprite-effects -- compile --request C:\Media\sprite-effects.json --output-root C:\Media\prepared-effects --apply
```

Each output directory is create-only and atomic. Its receipt is passed to the Development Studio publication adapter; the media tools themselves never commit, push or force-update a repository reference.
