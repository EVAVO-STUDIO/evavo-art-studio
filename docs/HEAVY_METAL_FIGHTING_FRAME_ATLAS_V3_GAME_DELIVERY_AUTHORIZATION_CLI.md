# HEAVY METAL FIGHTING — atlas-v3 delivery authorization CLI

Status: read-only operator boundary  
Authorization schema: `evavo.heavy-metal-fighting-atlas-v3-game-delivery-authorization.v1`  
Repository mutation: prohibited

## Purpose

The core delivery-authorization compiler already performs the expensive trust work: it re-verifies the local `steel-dominion` Godot 4.6.2 receipt, re-admits all four Atlas v3 plans and build receipts, decodes the four atlas PNGs plus all 896 source PNGs, compares every authored source cell pixel-for-pixel, proves the 32 reserved slots per atlas are transparent, and binds one explicit named-human authorization decision.

This CLI boundary makes that compiler usable from the persistent Artist Workspace without weakening it or adding a repository writer.

```text
stable request manifest
        ↓
exact game-validation admission + receipt bytes
        ↓
exact human authorization JSON
        ↓
four exact plan files
        ↓
four exact create-only build roots
        ↓
4 atlas PNGs + 896 source PNGs
        ↓
existing byte-verifying delivery authorization compiler
        ↓
self-hashed authorization JSON on stdout
```

## Command

```powershell
node scripts\heavy-metal-fighting-frame-atlas-v3.mjs authorize-game-delivery `
  --request C:\ValidationEvidence\hmf-atlas-v3-delivery-authorization-request.json
```

The command accepts exactly one `--request` argument. Unknown or additional arguments are rejected.

## Request manifest

The request schema is:

```text
evavo.heavy-metal-fighting-atlas-v3-game-delivery-authorization-cli-request.v1
```

It contains exactly:

```json
{
  "schema": "evavo.heavy-metal-fighting-atlas-v3-game-delivery-authorization-cli-request.v1",
  "expectedGameHead": "<40-char-lowercase-sha>",
  "gameValidationAdmissionPath": "./game-validation-admission.json",
  "gameValidationReceiptPath": "./steel-dominion-local-validation.json",
  "humanAuthorizationPath": "./human-delivery-authorization.json",
  "frames": [
    {
      "frameId": "bastion",
      "planPath": "./bastion.plan.json",
      "buildRoot": "<workspace>/exports/runtime/frames/bastion/atlas-v3-001"
    },
    {
      "frameId": "viper",
      "planPath": "./viper.plan.json",
      "buildRoot": "<workspace>/exports/runtime/frames/viper/atlas-v3-001"
    },
    {
      "frameId": "citadel",
      "planPath": "./citadel.plan.json",
      "buildRoot": "<workspace>/exports/runtime/frames/citadel/atlas-v3-001"
    },
    {
      "frameId": "mirage",
      "planPath": "./mirage.plan.json",
      "buildRoot": "<workspace>/exports/runtime/frames/mirage/atlas-v3-001"
    }
  ]
}
```

Relative paths are resolved from the request manifest directory. Frame order is fixed: `bastion`, `viper`, `citadel`, `mirage`.

## File admission

Every file opened by this operator is treated as untrusted filesystem state. The reader:

- walks every path component with `lstat`;
- rejects symbolic links and junctions;
- requires a regular endpoint with exactly one filesystem link;
- applies a byte limit before allocation;
- opens read-only with `O_NOFOLLOW` where supported;
- binds the opened handle to device, inode, size, modification time and link count;
- rechecks the complete path chain after open and after read;
- reads exactly the captured byte count and probes for growth;
- rejects truncation, growth, endpoint replacement and parent-path substitution.

The request, game-validation admission, validation receipt, human authorization, plans, build receipts, atlas PNGs and all 896 source PNGs use this same stable single-link boundary.

## Source-path confinement

Before any source PNG is opened, the CLI preflights each plan's source locations. It requires:

- an absolute `workspaceRoot`;
- `allowedSourceRoot = <workspace>/masters/frames/<frame>/sprites`;
- exactly 224 source records;
- safe relative `masterRelativePath` values with no traversal;
- exact agreement between each absolute `sourcePath` and `workspaceRoot + masterRelativePath`;
- every source path to remain inside the canonical Frame source root;
- canonical atlas and receipt output names;
- canonical `exports/runtime/frames/<frame>` build parent;
- the requested build root to be a direct child of that canonical parent.

This prevents a crafted plan from turning the authorization command into an arbitrary filesystem reader before the core compiler re-admits the full semantic plan contract.

## Output

The command prints the complete self-hashed delivery authorization JSON to stdout. It performs no output-file write and does not mutate either repository.

The existing core compiler still repeats all semantic and exact-byte checks. The CLI is only an operator-safe way to supply those inputs from disk; it is not a replacement for the compiler/verifier.

## Authority boundary

The operator may read the caller-selected, plan-confined evidence required to compile the authorization. It does not gain any of the following:

```text
gameRepositoryRead
gameRepositoryMutation
runtimeActivation
gitMutation
deployment
publication
forcePush
```

A future repository writer must independently re-verify the authorization and exact atlas bytes before any `steel-dominion` mutation.
