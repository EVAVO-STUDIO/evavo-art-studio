# HEAVY METAL FIGHTING — atlas-v3 delivery authorization verification CLI

Status: independent read-only operator verification  
Authorization schema: `evavo.heavy-metal-fighting-atlas-v3-game-delivery-authorization.v1`  
Repository mutation: prohibited

## Purpose

The delivery-authorization compiler produces one deterministic self-hashed authorization only after it has re-admitted the exact game-validation evidence, four Atlas v3 plans and build receipts, four atlas PNGs, all 896 approved source PNGs, and one named-human `authorized` decision.

A future repository writer must not trust that authorization document by hash alone. This verifier CLI therefore re-opens the submitted authorization and the complete request-bound evidence set and invokes the existing recomputing verifier.

```text
stable authorization JSON
        ↓
stable request manifest
        ↓
exact game-validation admission + receipt bytes
        ↓
exact named-human authorization decision
        ↓
four exact plans + build receipts
        ↓
4 atlas PNGs + 896 source PNGs
        ↓
core verifyHmfAtlasV3GameDeliveryAuthorization(...)
        ↓
complete semantic and pixel replay
        ↓
verified authorization JSON on stdout
```

## Command

```powershell
node scripts\heavy-metal-fighting-frame-atlas-v3-verify-delivery-authorization.mjs `
  --request C:\ValidationEvidence\hmf-atlas-v3-delivery-authorization-request.json `
  --authorization C:\ValidationEvidence\hmf-atlas-v3-delivery-authorization.json
```

The command accepts exactly those two ordered arguments.

## Verification contract

The verifier:

1. reads the submitted authorization through the existing stable single-link file boundary;
2. rejects symbolic/junction paths, hard-linked evidence, truncation, growth and file/path replacement;
3. parses the authorization as bounded UTF-8 JSON;
4. reloads the complete request through the existing delivery-authorization CLI loader;
5. re-opens every request-bound evidence file through the same stable reader;
6. repeats plan and build-receipt admission;
7. repeats PNG structure and exact SHA-256 checks;
8. repeats all 896 source-to-atlas pixel comparisons and reserve transparency proof;
9. repeats game-validation admission and expected game-HEAD binding;
10. repeats the named-human delivery decision checks;
11. recompiles the expected authorization from those exact inputs;
12. accepts the submitted document only if its complete canonical identity equals the recomputed authorization.

A caller cannot alter an authorization field, recompute `authorizationSha256`, and make that altered document verify against unchanged source evidence.

## Authority boundary

This operator is read-only. It does not:

- write `steel-dominion`;
- install or replace final-v3 atlases;
- activate production runtime content;
- mutate Git;
- deploy;
- publish;
- force-push.

Its purpose is to give a later game-repository-owned writer a deterministic precondition it can independently execute before any target-repository mutation.
