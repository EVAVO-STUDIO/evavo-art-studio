# Automation Fabric upstream review

Art Studio's current trusted execution boundary is the reviewed EVAVO Local Storage worker fabric, with Development Studio retaining guarded mainline publication authority.

## Reviewed upstreams

- Local Storage main: `32a1ed2801aca3847ea96b787bd24dcf7b088393`
- Local Storage release floor used by Art Studio: `0.48.4`
- Workstation acceptance implementation: `evavo_local_storage.workstation_acceptance_v8:main`
- Development Studio main: `88e1d36f6006c25e3567f5e8d8d8979c54407d60`
- Worker pool: `windows-local`
- Primary exact node: `windows-primary`

The Local Storage command `evavo-local-storage-workstation-accept` resolves to workstation acceptance v8 in the reviewed 0.48.4 packaging contract. V8 remains resource-aware, receipt-driven and Windows-targeted. It does not turn successful execution into publication authority.

## Execution model

For unmeasured repository work, Art Studio must first request a read-only exact-state plan. The plan binds execution to the measured Git HEAD, worktree status digest and tracked script bytes. Execution is accepted only after the exact correlated receipt returns successfully.

Routine work prefers the worker fabric. Missing or stale receipts trigger independent recovery rather than asking the operator to paste routine commands. Recovery order remains:

1. supervisor-first recovery;
2. certified fallback;
3. immutable create-only repair armer.

Recovery must produce fresh exact-node and capability-routed pool receipts before normal worker use resumes.

## PowerShell and process safety

Substantial PowerShell remains file-first and must use the reviewed guard. Native processes use explicit exit codes, argv-only invocation where possible, bounded process-tree termination, resource-aware admission and transient-only bounded retries.

The canonical Windows Downloads location is `%USERPROFILE%\\Downloads`; the legacy `C:\\Downloads` path is not an approved execution root. BeeStation is resolved through the configured logical/physical storage boundary rather than a hard-coded `C:\\BEESTATION` assumption.

## Authority boundaries

Worker execution does not grant any of the following:

- Git commit or push authority;
- mainline publication authority;
- creative approval;
- provider promotion;
- runtime activation;
- permanent deletion.

Development Studio remains the guarded publication operator through `scripts/mainline-publish.mjs`, with exact remote-head rechecks, declared-path scope, remote SHA verification and no force push, automatic merge or automatic rebase.

## Current Art Studio binding

`config/automation-fabric-client-v5.json` records the current reviewed upstream revisions and requires:

- exact request-to-receipt correlation;
- single execution per command ID;
- idempotent terminal receipt replay;
- exact-state repository planning before effectful work;
- fast-forward-only managed runtime updates;
- quarantine on managed-runtime divergence;
- credential stripping;
- resource-aware execution;
- maximum three attempts and automatic retry only for transient failures.

These checks are intentionally fail closed. A future Local Storage or Development Studio upgrade must be reviewed and the exact upstream revision pins refreshed before Art Studio treats it as the current trusted execution contract.
