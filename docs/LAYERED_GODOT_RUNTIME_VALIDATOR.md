# Layered Godot runtime validator

The layered-production handoff already has separate boundaries for compilation, exact workspace writing, durable crash recovery, and read-only post-write auditing. This validator is the next boundary: it proves that the exact approved Godot scene can be loaded and instantiated by **Godot 4.6.2** without granting the engine write or activation authority over the selected game repository.

## Required inputs

Validation requires the exact self-hashed seven-resource Godot integration plan, the self-hashed workspace write receipt, a current self-hashed workspace audit receipt, the absolute selected repository workspace, the explicit `owner/repository` identity, and an explicit absolute path to the Godot 4.6.2 executable.

The runtime validator does not infer a repository, search `PATH` for an engine, download Godot, or silently choose another engine version.

## What happens before Godot runs

The validator fails closed unless the selected workspace is a real non-symbolic directory; no unresolved `.evavo-godot-transactions` transaction exists; a fresh read-only workspace audit exactly matches the supplied audit receipt apart from its audit timestamp and self-hash; the integration scene is one of the exact seven approved resources; the scene is a self-contained Godot text scene; external resources, scripts, `uid://`, `file://`, and `.godot` references are absent; and the supplied executable is one singly linked non-symbolic regular file read stably and bound by SHA-256. `godot --version` must report the exact 4.6.2 release line.

## Sandbox execution

The selected target repository is **not** passed to Godot as `--path`.

Instead, the validator creates one temporary project containing the exact seven integration resource byte sequences, a minimal `project.godot` using the compatibility renderer, a bounded `SceneTree` validator script, and isolated `HOME`, `XDG_*`, `APPDATA`, and `LOCALAPPDATA` directories.

Godot is launched directly with `shell: false`:

```text
<godot-4.6.2> --headless --path <temporary-project> --script <validator.gd> -- res://<scene.tscn>
```

The validator script loads the scene as `PackedScene`, instantiates its root, reports one structured `evavo_layered_godot_runtime_validated` evidence event, frees the instance, and exits. It does not add the instance to the active scene tree, start gameplay, deploy, publish, or mutate the selected repository.

The temporary project is removed before a successful receipt can be returned. Sandbox cleanup failure fails closed.

## Failure integrity

A failed engine run is not allowed to bypass repository integrity proof. After any version/runtime execution attempt, the validator checks again for unresolved durable workspace transactions, performs another fresh read-only workspace audit, and compares the post-execution audit to the pre-execution audit.

If the target changed while validation was running, target drift is authoritative even if Godot also failed. This prevents a failed engine process from hiding a concurrent repository mutation.

## Evidence receipt

A successful result is a self-hashed `evavo.layered-production.godot-runtime-validation-receipt` containing request, integration, write-receipt, input-audit, pre-audit, and post-audit hashes; selected repository and canonical workspace identity; required/reported Godot version; exact executable SHA-256, byte count, and filesystem identity; sandbox isolation strategy; headless scene-instantiation evidence; bounded stdout/stderr hashes and byte counts; and an explicit authority record.

The receipt proves Godot execution in an ephemeral sandbox. It does not prove target runtime activation, creative approval, a Git commit, push, deployment, publication, or release.

## CLI

```powershell
node scripts/layered-godot-runtime-validator.mjs validate `
  --plan D:\EVAVO-Evidence\layered-district.godot-plan.json `
  --receipt D:\EVAVO-Evidence\layered-district.write-receipt.json `
  --audit-receipt D:\EVAVO-Evidence\layered-district.audit-receipt.json `
  --workspace C:\GitRepos\GodotGameFoundationKit `
  --repository EVAVO-STUDIO/GodotGameFoundationKit `
  --godot C:\Tools\Godot\Godot_v4.6.2-stable_win64.exe
```

`--timeout-ms` is optional, defaults to 60,000 ms, and is bounded to 300,000 ms. Version and runtime output are separately bounded; output floods and timeouts terminate the child process and fail validation.

## CI budget policy

Ordinary Art Studio pushes run deterministic validator contract tests, child-process timeout/output-limit tests, and fake-engine sandbox tests. They do **not** download a full Godot distribution on every commit. This keeps the focused workflow inexpensive while preserving real-engine validation as an explicit runtime operation whenever a verified 4.6.2 executable is supplied.

## Intended handoff

```text
approved layered-production plan
→ Godot integration compiler
→ exact seven-resource integration plan
→ layered Godot workspace writer
→ durable recovery if interrupted
→ self-hashed write receipt
→ layered Godot workspace auditor
→ self-hashed audit receipt
→ layered Godot runtime validator
→ self-hashed 4.6.2 runtime-validation receipt
→ repository review
→ explicit Git commit and push
```
