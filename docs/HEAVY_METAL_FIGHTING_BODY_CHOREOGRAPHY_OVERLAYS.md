# HEAVY METAL FIGHTING — supplemental body choreography overlays

Status: hash-bound supplemental production direction  
Base work-order mutation: **false**  
Receipt-chain mutation: **false**  
Provider execution: **false**  
Image generation: **none**

## Why overlays exist

HEAVY METAL FIGHTING's governed Frame body work orders are already immutable and hash-linked into receipt chains. The later production planning work added richer per-slot body roles and named move choreography.

Rewriting every original work order to insert that new direction would change each `workOrderSha256` and invalidate existing receipt identity.

The overlay system avoids that problem.

It produces a separate object with its own SHA-256 that binds to the original work order:

```text
base work order
    workOrderSha256 = unchanged

supplemental choreography overlay
    baseWorkOrderSha256 = original workOrderSha256
    overlaySha256 = independent hash
```

The base work order remains the authority for identity, source references, one-image boundaries, candidate paths, failure codes and approval lifecycle.

The overlay adds only richer body-animation direction.

## Overlay contents

For one Frame body-cel work order the overlay binds:

- exact unit and batch;
- exact immutable base work-order SHA-256;
- registry SHA-256;
- Frame identity;
- production slot;
- production group;
- production bank;
- semantic body role;
- body-role grammar SHA-256;
- Frame role-map SHA-256;
- combat-presentation-contract SHA-256;
- Frame motion realization;
- named move context when the bank belongs to a move;
- previous/next cel continuity references;
- supplemental provider prompt appendix;
- explicit non-authority declarations.

## Example: Bastion slot 121

Conceptually:

```text
unit: hmf.frame-animation.bastion.slot-121
bank: standing-heavy
role: standing-heavy:hero-impact
hero: true
contact role: true
hold priority: hero
named move: GRAVEBELL
motion identity: hydraulic-weight
base work-order hash: preserved
```

The supplemental prompt says, in effect:

- this is the exact hero-impact body drawing;
- realize it as Bastion's hydraulic weight, not a generic human punch;
- apply GRAVEBELL's existing authored move choreography;
- keep pressure/floor/fragment effects separate;
- do not reinterpret the art contact role as a gameplay hit frame;
- do not change simulation timing, damage, hitboxes, CORE, inputs or runtime availability;
- output the same single body image required by the base work order.

## Move-aware versus state-only overlays

Move banks receive a named move binding.

Examples:

```text
standing-heavy -> GRAVEBELL on Bastion
special-a      -> REDLINE BORE on Bastion
special-b      -> ANVIL LOCK on Bastion
reversal       -> BLOW-OFF on Bastion
overdrive      -> KILN VERDICT on Bastion
```

Throw banks also resolve the Frame's named throw with an explicit actor role:

```text
throw-attacker -> attacker-body
throw-receiver -> receiver-body
throw-break    -> break-body
grab-whiff     -> grab-whiff-body
```

System and result banks remain state-only:

```text
idle
movement
guard/reaction
system down
reignition
heat vent
entrance
victory
defeat
```

Those have no fabricated named-move binding.

## The overlay never owns gameplay

Every overlay states:

```text
simulationTiming = false
hitboxesDamageAndInputs = false
runtimeImplementationStatus = false
```

`contactRole=true` means the cel is visually designed as a contact/impact pose. It does **not** declare the game's active frame or collision timing.

That authority remains in `steel-dominion`.

## The overlay never owns approval or execution

Every overlay also states:

```text
providerExecution = false
automaticApproval = false
automaticPromotion = false
targetRepositoryMutation = false
gitMutation = false
publication = false
```

The overlay can inform a provider job only when a separate governed execution layer explicitly chooses to consume it.

## CLI

Verify the overlay contract:

```powershell
node scripts/heavy-metal-fighting/frame-body-choreography-overlay-cli.mjs verify
```

Inspect one exact body work order:

```powershell
node scripts/heavy-metal-fighting/frame-body-choreography-overlay-cli.mjs work-order hmf.frame-animation.bastion.slot-121
```

Compile overlays for the exact Frame-animation batch that owns a work order:

```powershell
node scripts/heavy-metal-fighting/frame-body-choreography-overlay-cli.mjs batch hmf-b0123
```

A non-Frame-animation batch is rejected rather than silently receiving irrelevant choreography.

## Production MCP

The read-only production MCP exposes:

```text
evavo_hmf_production_body_choreography_overlay
```

Input:

```json
{"unitId":"hmf.frame-animation.bastion.slot-121"}
```

The returned overlay is supplementary only. The MCP still has no provider execution, receipt persistence, approval, promotion or game-repository mutation authority.

## Batch overlay

A batch overlay is bound to the existing immutable `workOrderBatchSha256` and contains one supplemental overlay per existing Frame body work order.

It retains the original governed maximum of ten work units and does not pad a partial final batch.

It does not create a second work-order queue.

## Verification

The overlay verification checks representative high-value cels, including:

```text
Bastion standing-heavy hero impact -> GRAVEBELL
Bastion special A hero role        -> REDLINE BORE
Bastion special B hero role        -> ANVIL LOCK
Bastion reversal hero role         -> BLOW-OFF
Bastion Overdrive primary impact   -> KILN VERDICT
SYSTEM DOWN                         -> no fake move binding
victory / defeat                    -> no fake move binding
Mirage Overdrive                    -> phase-drift realization
```

It also verifies:

- every overlay has both a valid base-work-order hash and overlay hash;
- whole-batch overlays stay inside the 1–10 work-unit limit;
- the same batch ID is retained;
- overlays remain supplemental-only;
- no game authority leaks in;
- the prompt appendix preserves the one-image body-only boundary.

## Future provider integration

A later provider-runtime change may concatenate:

```text
baseWorkOrder.providerPrompt
+
supplementalOverlay.supplementalProviderPrompt
```

at execution time.

That should be an explicit provider-runtime protocol update, not an in-place rewrite of existing production work orders.

This distinction protects all current hashes, receipts and human approval evidence while still letting the production system improve its animation direction over time.
