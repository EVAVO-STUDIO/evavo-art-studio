# Local Production v2 gate

Art Studio validates identity-locked character performance banks and exact Art-to-Cel and Art-to-Video delivery locally. GitHub Actions is optional verification and is not release evidence by itself.

## Run

From the repository root on Windows:

```powershell
node scripts/run-studio-production-v2-local.mjs --plan
node scripts/run-studio-production-v2-local.mjs --receipt "$env:LOCALAPPDATA\EVAVO\receipts\art-production-v2.json"
```

Linux or macOS:

```bash
node scripts/run-studio-production-v2-local.mjs --plan
node scripts/run-studio-production-v2-local.mjs --receipt "$HOME/.local/state/evavo/receipts/art-production-v2.json"
```

The receipt path must be outside the repository.

## What the runner enforces

- strict Production-v2 manifest identity and false automatic authority;
- no shell command execution;
- offline model and telemetry environment flags;
- identity, landmark, palette and cleanup locks;
- alpha, halo, hidden-RGB, matte and safe-framing checks;
- complete idle, expression, gesture, transition and mouth-drawing coverage;
- explicit intentional holds rather than accidental duplicate frames;
- exact Art-to-Cel source handoff binding inside the Art-to-Video delivery;
- syntax compilation for every declared contract;
- bounded command time and output;
- clean source before and after validation when Git metadata is available;
- SHA-256 digests for stdout, stderr, the manifest and the final receipt;
- atomic external receipt writes.

A passing receipt proves that the exact source contracts and tests passed locally. It does not prove that artwork was generated, viewed, creatively approved, released, published or deployed.

## Authority boundary

The runner always records automatic creative approval, automatic release approval, publication authority and deployment authority as false.
