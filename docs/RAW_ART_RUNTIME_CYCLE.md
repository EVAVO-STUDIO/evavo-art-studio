# RAW_ART runtime submission and worker cycle

Art Studio can now run the exact provider runtime handoff without relying on an external orchestrator.

```powershell
node scripts/execute-raw-art-runtime-cycle.mjs `
  --runtime-batch D:\EVAVO-Evidence\Brass-Brine\provider-workshop\provider-runtime-batch.v1.json `
  --job-id <exact-job-id> `
  --worker until-idle `
  --actor claude `
  --receipt D:\EVAVO-Evidence\Brass-Brine\runtime-evidence\cycle-001.json `
  --confirm
```

Use `--submit-all` only when every exact job in the current canonical runtime batch is intentionally authorised.

The command:

1. validates `evavo.raw-art-provider-runtime-batch.v1`;
2. selects only exact batch job IDs;
3. extracts only `jobs[].contract.runtimeJob` values;
4. calls the existing Art Studio `submit_art_runtime_jobs` MCP tool;
5. runs `pnpm worker:once` or `pnpm worker:until-idle`;
6. writes one create-only `evavo.raw-art-runtime-cycle-receipt.v1`.

The receipt binds the runtime-batch file hash, selected runtime-job hash, MCP response hash, worker result, bounded output evidence and all continuing authority boundaries.

Runtime success is not creative, historical, native, provenance, candidate-promotion or publication approval. This tool never mutates a game checkout and never performs Git publication.

Run the permanent source checker with:

```powershell
node scripts/check-raw-art-runtime-cycle.mjs
```
