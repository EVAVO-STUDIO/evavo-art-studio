# Layered Godot Git push verifier

The push operator can publish one exact, reviewed Layered Godot commit with a plain fast-forward branch push. Its self-hashed receipt proves what that operator recorded at the end of the transaction. A self-hash is integrity, not independent authority, so the receipt now enters a separate **read-only post-push boundary** before it can be treated as current delivery evidence.

The verifier does not push, create a commit, update a ref, mutate the worktree, deploy, publish a release or grant any later authority.

## Admission

The verifier accepts only the exact current push-receipt kind and protocol. It closes every object boundary and verifies:

- the receipt self-hash;
- exact repository and workspace identity;
- local commit, parent, tree and branch identities;
- exact HTTPS GitHub origin identity;
- remote-before and remote-after bindings;
- the three supported outcomes: `pushed`, `already-pushed`, and `remote-confirmed-after-client-error`;
- command-attempt, exit-code, output-hash and output-byte evidence;
- exact parity between outcome, command evidence and authority;
- false tag, force-push, deployment and release-publication authority.

Correctly rehashed unknown fields or authority escalation are rejected. The input, dependency object and returned dependency evidence are captured as owned immutable values. Accessors are rejected without being invoked, Proxy values fail closed, and shared-memory Git output buffers are rejected.

## Independent current-state proof

After receipt admission, the verifier performs:

1. a fresh local Git inspection;
2. a fresh origin inspection;
3. a fresh remote branch read;
4. a second fresh local inspection;
5. a second fresh origin inspection; and
6. a second fresh remote branch read.

The two fresh local inspections must agree, the repository must remain clean, and both remote reads must equal the receipt-bound commit. Any local, origin or remote movement during the verification window fails closed.

All Git execution passes through a closed read-only Git command set. Only the exact `rev-parse`, `branch`, `show`, `status`, origin-configuration reads and `ls-remote` forms required for verification are admitted. Injected runners receive the same output and timeout bounds as the built-in runner.

## CLI

```powershell
node scripts/layered-godot-git-push-verifier.mjs verify `
  --push-receipt D:\EVAVO-Evidence\layered-district.push-receipt.json `
  --workspace C:\GitRepos\GodotGameFoundationKit `
  --repository EVAVO-STUDIO/GodotGameFoundationKit
```

The command emits a self-hashed verification receipt containing the exact push receipt hash, current local commit identity, current remote ref, two-phase stability evidence and the read-only authority actually exercised.

## Complete governed chain

```text
approved layered art
→ exact Godot integration plan
→ durable workspace write
→ read-only workspace audit
→ sandboxed Godot 4.6.2 validation
→ read-only handoff gate
→ read-only repository review
→ explicit commit-only Git operator
→ explicit plain fast-forward Git push operator
→ independent read-only push receipt verifier
```

A successful verification is evidence that the exact pushed commit is still current at the checked local and remote boundaries. It is not deployment or release publication, and it does not authorize another Git mutation.
