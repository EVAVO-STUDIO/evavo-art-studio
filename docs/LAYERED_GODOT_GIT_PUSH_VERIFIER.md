# Layered Godot Git push verifier

The push operator can publish one exact, reviewed Layered Godot commit with a plain fast-forward branch push. Its self-hashed receipt proves what that operator recorded at the end of the transaction. A self-hash is integrity, not independent authority, so the receipt enters a separate **read-only post-push boundary** before it can be treated as current delivery evidence.

The verifier does not push, create a commit, update a ref, mutate the worktree, deploy, publish a release or grant any later authority.

## Source-receipt admission

The verifier now requires both the actual source commit receipt and the push receipt. A bare `commitReceiptSha256` string is not accepted as proof of upstream authority.

The complete input is captured as one immutable snapshot before repository or network inspection. The source commit receipt is then re-admitted through the current closed commit-operator contract, including its schema, protocol, self-hash, target, reviewed Git state, staged-resource evidence, commit identity and false-only downstream authority boundary.

The push receipt is admitted through its own closed contract. The verifier then proves exact cross-receipt lineage:

- `commitReceiptSha256` equals the admitted commit receipt self-hash;
- request, integration and repository-review hashes agree across both receipts;
- repository and workspace targets agree;
- commit, parent, tree and branch identities agree; and
- the push outcome and command evidence remain valid for that exact commit.

Correctly rehashed invented lineage, unknown fields, authority escalation or Git-identity substitution fail before live repository verification.

## Push-receipt admission

The verifier accepts only the exact current push-receipt kind and protocol. It closes every object boundary and verifies:

- the receipt self-hash;
- exact repository and workspace identity;
- local commit, parent, tree and branch identities;
- exact HTTPS GitHub origin identity;
- remote-before and remote-after bindings;
- the three supported outcomes: `pushed`, `already-pushed`, and `remote-confirmed-after-client-error`;
- command-attempt, exit-code, output-hash and output-byte evidence;
- exact parity between outcome, command evidence and authority; and
- false tag, force-push, deployment and release-publication authority.

The input, dependency object and returned dependency evidence are captured as owned immutable values. Accessors are rejected without being invoked, Proxy values fail closed, and shared-memory Git output buffers are rejected.

## Independent current-state proof

After receipt and cross-receipt lineage admission, the verifier performs:

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
  --commit-receipt D:\EVAVO-Evidence\layered-district.commit-receipt.json `
  --push-receipt D:\EVAVO-Evidence\layered-district.push-receipt.json `
  --workspace C:\GitRepos\GodotGameFoundationKit `
  --repository EVAVO-STUDIO/GodotGameFoundationKit
```

The command emits a self-hashed verification receipt containing the exact commit and push receipt hashes, upstream request/write/handoff/review lineage, current local commit identity, current remote ref, two-phase stability evidence and the read-only authority actually exercised.

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
→ independent read-only push receipt and commit-lineage verifier
```

A successful verification is evidence that the admitted commit receipt, bound push receipt, exact local commit and remote branch remain one current delivery chain. It is not deployment or release publication, and it does not authorize another Git mutation.
