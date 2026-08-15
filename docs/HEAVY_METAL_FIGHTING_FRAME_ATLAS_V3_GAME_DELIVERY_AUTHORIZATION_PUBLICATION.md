# HEAVY METAL FIGHTING — atlas-v3 delivery authorization publication

Status: local create-only evidence publication  
Source authority: `evavo.heavy-metal-fighting-atlas-v3-game-delivery-authorization.v1`  
Game-repository mutation: prohibited

## Purpose

The Atlas v3 delivery-authorization compiler already re-admits the exact `steel-dominion` Godot 4.6.2 validation evidence, four canonical Frame plans, four build receipts, four exact atlas PNGs, all 896 exact source PNGs, and one named-human delivery decision before emitting a self-hashed authorization.

Until this boundary, `authorize-game-delivery` printed that authorization to stdout only. Shell redirection is not a governed persistence boundary: a destination can already exist, a symbolic parent can redirect the write, replacement semantics vary by shell, and the exact bytes are not independently read back.

This boundary keeps the authorization local to Art Studio evidence storage while making persistence create-only and verifiable.

```text
closed delivery-authorization request
        ↓
compile exact authorization from all source evidence
        ↓
independently re-verify authorization from the same exact evidence
        ↓
canonical UTF-8 authorization bytes
        ↓
private same-directory stage file
        ↓
atomic no-replace hard-link publication
        ↓
exact stable single-link readback
        ↓
self-hashed local publication receipt
```

It does not write `steel-dominion` and does not activate runtime content.

## CLI

The existing stdout-only command remains unchanged:

```powershell
node scripts\heavy-metal-fighting-frame-atlas-v3.mjs authorize-game-delivery `
  --request C:\ValidationEvidence\hmf-atlas-v3-delivery-request.json
```

To persist the verified authorization as one new local JSON file, supply an explicit output:

```powershell
node scripts\heavy-metal-fighting-frame-atlas-v3.mjs authorize-game-delivery `
  --request C:\ValidationEvidence\hmf-atlas-v3-delivery-request.json `
  --output C:\ValidationEvidence\hmf-atlas-v3-delivery.authorization.json
```

When `--output` is absent, the command still prints the authorization itself. When `--output` is present, the command prints the self-hashed publication receipt and the authorization bytes are written only to the requested new JSON file.

## Origin binding before write

The publication command does not trust a standalone authorization file.

Before any output write it:

1. loads the existing closed request manifest through the established stable single-link input boundary;
2. re-reads the exact game-validation evidence, four plans/builds and all 896 source PNGs;
3. recompiles the complete delivery authorization from those exact bytes;
4. invokes the public delivery-authorization verifier, which repeats the exact semantic and pixel proof against the submitted authorization;
5. passes only that independently verified authorization into the local publication transaction.

The persisted file therefore originates from the exact evidence closure used by the existing delivery-authorization contract rather than from a caller-supplied self-hash alone.

## Publication input hardening

The direct publication API accepts exactly:

```text
authorization
outputPath
```

The top-level argument must be an ordinary object with enumerable data properties only. Proxies, accessors, symbols, additional properties and exotic prototypes are rejected before asynchronous filesystem work.

The authorization object is copied through the existing bounded immutable JSON snapshot boundary. Its schema, protocol, repository, game HEAD and retained `authorizationSha256` must be valid, and the retained self-hash is recomputed before publication.

This lower-level publication API is only a local evidence writer. The stable CLI performs the stronger origin re-verification described above before invoking it.

## Create-only filesystem transaction

The output:

- must use one portable `.json` filename;
- must have an already existing directory parent;
- may not traverse a symbolic-link or junction parent component;
- must not already exist.

The writer then:

1. creates a unique same-directory stage file exclusively with mode `0600`;
2. writes the exact pretty-printed UTF-8 authorization bytes plus one trailing newline;
3. synchronises the stage file;
4. rechecks the complete output-parent directory chain;
5. rechecks that the destination remains absent;
6. publishes using a same-directory hard link, which cannot replace an existing destination;
7. removes the stage link;
8. synchronises the parent directory on supported non-Windows platforms;
9. verifies that the final destination is the same filesystem object with exactly one link;
10. reads the final file through the established stable single-link reader;
11. requires byte-for-byte equality with the verified authorization.

If publication fails after the output link is created, cleanup removes that output only when its filesystem identity still belongs to the failed transaction. An unrelated replacement is not deleted.

## Publication receipt

A successful write returns:

```text
evavo.heavy-metal-fighting-atlas-v3-game-delivery-authorization-publication.v1
```

The receipt binds:

- exact game repository and game HEAD;
- authorization SHA-256 identity;
- absolute local output path;
- exact file byte count and SHA-256;
- create-only/no-replace/readback checks;
- a closed authority map;
- `publicationReceiptSha256` over the complete receipt body.

## Authority boundary

The only positive capability introduced here is:

```text
localAuthorizationEvidenceWrite = true
```

These remain false:

```text
gameRepositoryMutation
runtimeActivation
gitMutation
deployment
externalPublication
forcePush
```

This is deliberately **not** the `steel-dominion` writer. The game repository itself states that Art Studio does not write its `assets/fighters/final-v3` directory. A later game-side delivery operation must independently re-verify the authorization and exact atlas bytes before mutating that repository.
