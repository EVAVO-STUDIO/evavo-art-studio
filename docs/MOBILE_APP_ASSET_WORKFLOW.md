# Mobile app asset workflow

Art Studio consumes the verified `evavo.mobile-app-production-plan.v1` emitted by Development Studio and compiles a candidate-only `evavo.mobile-app-asset-plan.v1`.

Every task carries the real app identity, brand palette and typography, product/device family, vendor companion, capabilities, constraints, audiences, jobs, screens, safety controls, asset purpose and exact repository-relative runtime destinations. This prevents a provider or artist from receiving a generic “make an icon” prompt without understanding what the application is.

## Compile candidate tasks

```powershell
node .\scripts\compile-mobile-app-asset-plan.mjs `
  --input C:\EVAVO\mobile-app-work\godmode\production-plan.json `
  --output C:\EVAVO\mobile-app-work\godmode\asset-plan.json
```

Compilation performs no provider call and writes no runtime asset. Provider selection remains `unselected` until capability evidence and a separate execution admission exist.

## Candidate and review boundary

Each task uses a logical workspace root such as:

```text
workspace://mobile-apps/evavo-glasses-mobile-2026-08/primary-app-icon
```

Immutable source, candidates, review evidence and an approved handoff remain separate. Large bytes stay out of control-plane JSON. Development Studio alone integrates an exact approved candidate into the runtime repository and governs publication.

Icon tasks require full-resolution review plus a 16/24/32/48/64/128-pixel legibility strip. Transparent or adaptive work also requires an alpha-mask proof and hostile black, white, grey, green and magenta background proofs. A checkerboard is never accepted as image content or proof.

Generation success, a provider receipt, a vendor-app handoff or a visually plausible preview never equals approval, device authority or publication authority.
