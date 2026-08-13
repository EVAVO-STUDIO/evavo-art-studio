# Layered Godot Git push operator

The commit-only Git operator creates and independently verifies one exact local commit containing only the reviewed layered Godot resources. That receipt still proves that no remote push occurred.

The push operator is the next and final Git mutation boundary. It accepts only the exact self-hashed `committed` receipt, re-verifies the local commit and repository from Git itself, verifies the remote branch still equals the reviewed parent, and performs one explicit **plain fast-forward branch push**. It never uses force, force-with-lease, tags, mirror mode, branch creation, ref deletion, deployment or release publication.

## Owned admission boundary

The public entrypoint captures both the JSON request and every dependency override before the first asynchronous boundary. Dependencies must be one plain non-Proxy object containing only the documented fields. Accessors are rejected without being invoked, symbolic and unsupported fields are rejected, and every callable dependency must be a non-Proxy function.

Results that can influence the network mutation are converted into private owned values before the retained push runtime receives them:

- workspace `path` and `realPath` are copied from a plain result object;
- every resolved origin is revalidated as the exact selected `https://github.com/OWNER/REPOSITORY` identity and copied into a frozen value;
- injected origin metadata cannot claim one repository while naming another URL;
- every Git result is required to contain only integer `exitCode`, bounded `signal`, `stdout` and `stderr`;
- combined Git output is rejected above the same 2 MiB limit enforced by the built-in runner;
- Git output buffers are copied twice while being captured and must remain stable;
- Proxy and shared-memory output buffers are rejected;
- the push command status and output bytes are privately owned before any post-push remote readback or local reinspection occurs; and
- CLI stable-file reads are copied and cross-checked against their byte count and SHA-256 before JSON parsing.

The validated v1 push runtime remains behind this admission wrapper. The receipt protocol stays `2026-08-13.1` because the remote operation, outcomes and receipt schema are unchanged; the hardening removes caller-owned mutable evidence from the mutation boundary.

## Admission rules

Before any network mutation, the operator proves:

- the complete request was captured as one bounded immutable JSON snapshot;
- dependency overrides and their mutation-relevant results were captured as owned non-Proxy values;
- the commit receipt uses the exact current commit-operator protocol and authority boundary;
- local `HEAD`, branch, parent, tree, message, author, committer and timestamp equal the receipt;
- the commit changes exactly the receipt-bound resource paths;
- every committed resource has the exact retained SHA-256 and byte count;
- the index, tracked working tree and untracked working tree are empty;
- the workspace is the exact repository root;
- `origin` is one exact `https://github.com/OWNER/REPOSITORY.git` identity;
- no `pushurl`, custom `receivepack`, mirror mode, `url.*.insteadOf` or `url.*.pushInsteadOf` rule can redirect the push;
- the remote branch already exists and equals the commit parent;
- a second local and remote preflight remains identical immediately before push.

The branch refspec is exact:

```text
<commit>:refs/heads/<reviewed-branch>
```

It never starts with `+`. Pre-push hooks are disabled, `push.followTags` is false, and the operator passes no force or tag option.

## Remote race handling

A plain push is intentionally used rather than any force form. If another actor advances the remote between preflight and the server update, Git rejects the non-fast-forward update. The operator then reads the remote again and fails unless it equals the exact reviewed commit.

The remote readback is authoritative. Three successful outcomes exist:

```text
pushed
  push command returned success and remote readback equals the commit

already-pushed
  remote already equalled the commit, so no push command ran

remote-confirmed-after-client-error
  the client returned non-zero, but remote readback proves the exact commit is present
```

The third outcome avoids falsely reporting failure when the server accepted the update but the client lost confirmation. Its receipt records that a push was attempted while not claiming that the client command succeeded. Because the command result is privately copied before readback, a caller cannot rewrite that status or its evidence buffers while verification is in progress.

## CLI

```powershell
node scripts/layered-godot-git-push-operator.mjs push `
  --commit-receipt D:\EVAVO-Evidence\layered-district.commit-receipt.json `
  --workspace C:\GitRepos\GodotGameFoundationKit `
  --repository EVAVO-STUDIO/GodotGameFoundationKit
```

The CLI supplies the exact authority declaration internally:

```text
push: true
forcePush: false
tags: false
```

## Complete governed chain

```text
approved layered art
→ exact Godot integration plan
→ durable workspace write
→ crash recovery if required
→ read-only workspace audit
→ sandboxed Godot 4.6.2 validation
→ read-only handoff gate
→ read-only Git repository review
→ explicit commit-only Git operator
→ explicit plain fast-forward Git push operator
→ independent read-only push receipt verifier
```

The push receipt is self-hashed and records the exact commit receipt, local commit and tree, remote branch before and after, bounded command-output hashes and the authority actually exercised. It may then enter the independent read-only push receipt verifier, which re-admits the receipt and proves the local and remote refs are still current without performing another mutation. A successful Git push is not deployment or release publication.
