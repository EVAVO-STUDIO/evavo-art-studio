# Animation Pipeline Doctor V1

Animation production spans Art Studio, Cel Animation Studio, Video Studio and EVAVO Game Runtime. A valid component in one repository is not enough: the live local checkouts must agree on the same contracts, shared implementations, MCP entry points and authority boundaries before an agent starts generation or review.

The doctor is a dependency-free, read-only preflight for that purpose.

## What it checks

- Required role-specific animation files.
- Repository-root and file symlink safety.
- JSON validity and bounded diagnostic file sizes.
- Checked-in MCP registration, repository role and disabled side-effect flags.
- Recognised animation lock path and SHA-256 bindings.
- Byte parity for the shared control plane, accepted-sequence delivery, review receipts and frame-work ledger.
- Missing shared participants, including a shared optional file that exists in one studio but not another.

The report status is `ready`, `degraded` or `blocked`. A deterministic report digest excludes the diagnostic timestamp, so repeated inspection of unchanged checkouts has the same identity.

## CLI

```powershell
node .\tools\animation_pipeline_doctor_v1_cli.mjs inspect .\doctor-input.json
node .\tools\animation_pipeline_doctor_v1_cli.mjs verify .\doctor-input.json
node .\tools\animation_pipeline_doctor_v1_cli.mjs plan .\doctor-input.json
```

Example input:

```json
{
  "repositoryRoots": {
    "artStudioRoot": "C:\\GitRepos\\evavo-art-studio",
    "celAnimationStudioRoot": "C:\\GitRepos\\cel-animation-studio",
    "videoStudioRoot": "C:\\GitRepos\\evavo-video-studio",
    "gameRuntimeRoot": "C:\\GitRepos\\evavo-game-runtime"
  }
}
```

`verify` fails closed when a blocking finding exists. `plan` produces deterministic repair instructions but never edits a file.

## MCP

The focused configuration is `.mcp.animation-pipeline-doctor-v1.json`. The server exposes:

- `inspect_animation_pipeline_v1`
- `verify_animation_pipeline_v1`
- `plan_animation_pipeline_repairs_v1`

These tools read caller-selected local repository roots. They do not execute providers, approve creative work, promote artifacts, mutate repositories, commit, push, activate a runtime or publish media.

## Recommended agent order

1. Run the doctor before compiling a production profile.
2. Stop if the result is `blocked`.
3. Repair the owning repository deliberately, preserving authoritative shared bytes.
4. Run the doctor again.
5. Begin the frame-work ledger only after the result is `ready`, or after a named operator accepts a non-blocking warning.

The doctor diagnoses integration. It does not replace Art Studio production review, Cel Animation Studio independent moving review, named creative approval, accepted-sequence delivery verification or native Godot runtime acceptance.
