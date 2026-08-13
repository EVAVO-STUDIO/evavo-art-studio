# Layered Godot Git push verifier

The push operator can publish one exact, reviewed Layered Godot commit with a plain fast-forward branch push. Its self-hashed receipt proves what that operator recorded at the end of the transaction. A self-hash is integrity, not independent authority, so the receipt enters a separate **read-only post-push boundary** before it can be treated as current delivery evidence.

The verifier does not push, create a commit, update a ref, mutate the worktree, deploy, publish a release or grant any later authority.

## Source-receipt admission

The verifier requires both the actual source commit receipt and the push receipt. A bare `commitReceiptSha256` string is not accepted as proof of upstream authority.

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

## Verification-receipt admission

The verifier does not return its generated receipt merely because the receipt can hash itself. Before return, the complete generated receipt is re-admitted through the exported `validateVerificationReceipt` closed verification-receipt contract.

That contract re-admits the actual source commit and push receipts, recomputes the verification receipt self-hash, closes every nested object boundary, and proves exact parity for:

- source receipt hashes and upstream request, integration, write, handoff and review lineage;
- repository and workspace identity;
- local commit, parent, tree and branch parity, plus a recomputed fresh clean-state snapshot hash;
- exact HTTPS GitHub origin and current remote branch identity;
- push outcome and two-phase stability claims; and
- the complete read-only, false-mutation authority map.

Correctly rehashed unsupported fields, invented lineage, source-receipt substitution, missing contract-admission evidence or authority escalation fail closed. The emitted receipt records `verificationReceiptContractAdmitted: true` only after the runtime has passed that same contract.

## Portable delivery evidence bundle

A closed verification receipt still depends on the actual commit and push receipts during downstream admission. Passing three separately paired JSON files is fragile: files can be separated, substituted, or handed to a consumer without an explicit target.

The verifier package therefore exposes `createDeliveryEvidenceBundle` and `validateDeliveryEvidenceBundle`. The bundle is one immutable, self-contained JSON envelope that embeds:

- the actual admitted commit receipt;
- the actual admitted push receipt;
- the actual admitted verification receipt;
- each source receipt's exact self-hash;
- request, integration, write, handoff and repository-review lineage;
- commit, parent, tree, branch, remote-current and push-outcome identity;
- the explicitly selected repository and workspace; and
- a complete false-only Git, deployment, release and artifact-publication authority map.

Bundle creation captures the complete input before reading it, re-admits all three source receipts through their current closed contracts, binds their hashes and lineage, computes one canonical bundle self-hash, and then re-admits the generated bundle through its own exact contract before returning it. The returned evidence records `deliveryEvidenceContractAdmitted: true` only after that final admission succeeds.

Bundle validation is an **offline re-admission** step. It performs no target-repository read, Git command, network read, Git mutation, deployment, release publication or artifact publication. It proves that the embedded receipts and their delivery identity were already admitted by the live verifier; it does not claim that time has stopped or replace a fresh live verification when current-state evidence is required.

Correctly rehashed unknown bundle fields, source-receipt substitution, invented lineage, source-hash disagreement, authority escalation, accessors and Proxy input fail closed.

## Governed create-only file publication

A correct in-memory bundle can still be damaged by an unsafe handoff. Shell redirection may truncate an existing destination before the verifier starts, follow a symbolic link, use shell-dependent text encoding, or leave a partial file after interruption.

`publishDeliveryEvidenceBundle` closes that final local boundary. The `bundle` CLI requires `--output` and publishes the exact pretty-printed UTF-8 bundle bytes through one governed create-only transaction:

1. the complete publication input and bundle are immutably captured and re-admitted;
2. the selected output filename must be one portable `.json` filename;
3. the existing output parent is proved to be a stable real directory rather than a symbolic path;
4. an exclusive mode-`0600` stage file is created in that same directory;
5. the exact UTF-8 bytes are written, file-synced and read back;
6. an atomic no-replace hard link publishes the same inode at the final destination;
7. an existing or racing destination fails closed rather than being replaced;
8. the stage link is removed, the directory sync is attempted, and the final one-link file is read back again; and
9. a self-hashed publication receipt is re-admitted before return.

The output directory must already exist. The output file must not exist. Symbolic output parents and symbolic or regular existing destinations are rejected. A failed transaction removes only files whose exact filesystem identity still belongs to that transaction; changed paths are left untouched and the failure is reported.

The publication receipt binds the selected repository, workspace and absolute output path to the bundle self-hash, exact byte count and exact file SHA-256. It records `publicationReceiptContractAdmitted: true`, local delivery-evidence file creation, and false existing-file replacement, Git mutation, push, deployment, release and remote artifact-publication authority.

This is local evidence-file creation, not deployment or release publication.

## CLI

Live verification:

```powershell
node scripts/layered-godot-git-push-verifier.mjs verify `
  --commit-receipt D:\EVAVO-Evidence\layered-district.commit-receipt.json `
  --push-receipt D:\EVAVO-Evidence\layered-district.push-receipt.json `
  --workspace C:\GitRepos\GodotGameFoundationKit `
  --repository EVAVO-STUDIO/GodotGameFoundationKit
```

Create and safely publish one portable delivery evidence bundle after live verification:

```powershell
node scripts/layered-godot-git-push-verifier.mjs bundle `
  --commit-receipt D:\EVAVO-Evidence\layered-district.commit-receipt.json `
  --push-receipt D:\EVAVO-Evidence\layered-district.push-receipt.json `
  --verification-receipt D:\EVAVO-Evidence\layered-district.verification-receipt.json `
  --workspace C:\GitRepos\GodotGameFoundationKit `
  --repository EVAVO-STUDIO/GodotGameFoundationKit `
  --output D:\EVAVO-Evidence\layered-district.delivery-evidence.json
```

Re-admit an existing bundle without repository or network access:

```powershell
node scripts/layered-godot-git-push-verifier.mjs validate-bundle `
  --bundle D:\EVAVO-Evidence\layered-district.delivery-evidence.json `
  --workspace C:\GitRepos\GodotGameFoundationKit `
  --repository EVAVO-STUDIO/GodotGameFoundationKit
```

The `verify` command emits a self-hashed, closed-contract verification receipt containing the exact commit and push receipt hashes, upstream request/write/handoff/review lineage, current local commit identity, current remote ref, two-phase stability evidence and the read-only authority actually exercised.

The `bundle` command writes the bundle only through the governed `--output` boundary and writes its smaller self-hashed publication receipt to standard output. It refuses to overwrite or truncate an existing destination. The `validate-bundle` command writes the re-admitted bundle to standard output and performs no file mutation.

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
→ closed-contract verification receipt
→ self-contained offline delivery evidence bundle
→ governed create-only exact-byte evidence-file publication
```

A successful verification is evidence that the admitted commit receipt, bound push receipt, exact local commit and remote branch remain one current delivery chain. A successful bundle validation proves the embedded evidence is internally complete and contract-current. A successful local publication proves that exact admitted bundle was written once to the selected non-symbolic destination without replacement. None of verification, bundle validation or local evidence publication authorizes another Git mutation, deployment or release publication.
