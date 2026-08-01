# `@evavo/art-audio-delivery`

Deterministic, role-aware runtime audio preparation for Godot and other EVAVO projects.

The package converts retained source audio into repository-ready derivatives, records the exact FFmpeg and FFprobe executable identities, decodes every result back to PCM, and selects the smallest candidate that satisfies codec, timing, duration, noise and file-size gates. It never commits, pushes, approves audio, or replaces retained masters.

## Profiles

- `godot-ui-sfx-wav`: short frequently repeated interface sounds, mono PCM16 WAV, capped at 22.05 kHz.
- `godot-short-sfx-wav`: short frequently repeated gameplay one-shots, mono PCM16 WAV, capped at 44.1 kHz.
- `godot-long-sfx-ogg`: longer one-shot effects, mono Ogg Vorbis, capped at 44.1 kHz.
- `godot-voice-ogg`: dialogue, narration and barks, mono Ogg Vorbis, capped at 22.05 kHz.
- `godot-ambience-ogg`: stereo environmental beds, Ogg Vorbis, capped at 44.1 kHz with timing preserved.
- `godot-music-ogg`: stereo score and long cues, Ogg Vorbis, capped at 48 kHz with timing preserved.

Caps never cause upsampling or upmixing. A 16 kHz mono voice source remains 16 kHz mono; a 44.1 kHz music master remains 44.1 kHz instead of being enlarged to 48 kHz. Short trim-enabled profiles reject looping so silence removal cannot move loop boundaries. Ambience and music preserve leading/trailing timing and carry loop-begin evidence in prepared-sample and seconds form.

## Commands

```powershell
pnpm --filter @evavo/art-audio-delivery build
pnpm --filter @evavo/art-audio-delivery start -- profiles

pnpm --filter @evavo/art-audio-delivery start -- audio `
  --input C:\Art\voice-master.wav `
  --profile godot-voice-ogg `
  --dry-run

pnpm --filter @evavo/art-audio-delivery start -- batch `
  --manifest C:\Art\audio-delivery.json `
  --source-root C:\Art\source `
  --output-root C:\Art\prepared `
  --apply
```

Batch output is atomic and create-only and includes `audio-delivery-receipt.json`. Every item is bound to the source SHA-256 and byte length, prepared SHA-256 and byte length, profile identity, loop contract, decoded PCM metrics, tool executable SHA-256 and exact target path.
