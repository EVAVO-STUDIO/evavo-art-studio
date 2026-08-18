# Automation Fabric v4 routing

Art Studio now has a separately governed workstation contract for the current EVAVO Local Storage execution stack while retaining the older v2 client file for compatibility with existing tooling.

The current contract is `config/automation-fabric-client-v4.json`. It binds Art Studio to:

- `EVAVO-STUDIO/evavo-local-storage` as the Windows execution authority;
- Local Storage `0.42.0` or newer;
- Automation Fabric `3.0`;
- workstation acceptance v4 with schema-4 receipts;
- resource-aware admission before heavy work;
- guaranteed runtime cleanup and a final resource snapshot;
- exact-state repository tasks bound to HEAD, status and tracked script bytes;
- credential stripping inside worker execution;
- probe-only, epoch-safe worker recovery by default;
- bounded automatic retry only for transient failures;
- a single matching execution receipt;
- queued work never being reported as completed;
- no worker commit, push or publication authority.

## Windows execution

The canonical workstation command is:

```powershell
evavo-local-storage-workstation-accept
```

The installed command must resolve to:

```text
evavo_local_storage.workstation_acceptance_v4:main
```

The v4 mission performs a resource baseline, runs dependency-aware workstation phases, always performs runtime cleanup, and captures a final resource snapshot. Heavy phases require at least the reviewed free-memory floor before starting. Training crashes are not blindly retried, GPU reset is not used, and page-file capacity is never treated as VRAM.

For repository-specific work, prefer Local Storage schema-4 exact-state tasks so the worker executes only a reviewed tracked script against the expected HEAD and worktree state. Worker execution proves only execution; it does not grant Git commit, push, publication, provider promotion or creative approval authority.

## Publication

Mainline publication remains owned by Development Studio. Art Studio continues to require normal push, live remote recheck, declared paths, exact HEAD/status and remote SHA verification. Force push, hard reset, clean, stash-as-recovery and rebase remain disabled.

## Validation

```powershell
node .\scripts\check-art-studio-workstation-v4-contract.mjs
node --test .\scripts\test-art-studio-workstation-v4-contract.mjs
```

The dedicated read-only GitHub workflow runs the same checks and verifies validation leaves the repository unchanged.
