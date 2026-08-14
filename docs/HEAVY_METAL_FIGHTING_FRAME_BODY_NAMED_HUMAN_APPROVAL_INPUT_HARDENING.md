# HEAVY METAL FIGHTING - Named-human approval input hardening

Status: immutable caller-input admission boundary  
Protected surface: Frame body named-human approval compiler and materializer  
Lifecycle semantics changed: no  
Approval, delivery, promotion, Git, deployment and publication authority changed: no

## Purpose

The named-human approval lifecycle already binds one explicit human decision to the exact mastered Frame body cel, mastering record, mastered receipt and governed workspace lineage. This hardening closes the JavaScript caller boundary around that lifecycle.

Before this boundary, callers could retain references to approval objects or plans while asynchronous workspace validation was in progress. Accessor properties, Proxy objects, symbolic properties, unsupported fields or post-call mutation were not admitted through one owned JSON snapshot before later reads.

The public compiler and materializer now synchronously capture the complete caller-owned input before the first asynchronous operation. Every later policy, workspace, receipt, lineage and persistence check uses only that private immutable snapshot.

## Snapshot contract

Accepted values are limited to ordinary JSON data:

```text
null
booleans
finite numbers
strings
ordinary objects
complete dense arrays
```

The snapshot fails closed on:

```text
Proxy objects
accessor properties
symbol properties
cycles
sparse arrays
arrays with additional properties
exotic object prototypes
functions
undefined
bigint
non-finite numbers
unsafe prototype keys
excessive depth
excessive node count
excessive retained bytes
```

Accessors are rejected by descriptor inspection and are never invoked.

## Closed approval request

The human approval object contains exactly:

```text
actorId
occurredAt
decision
rationale
attestations
```

The attestation object contains exactly:

```text
candidateSha256
masterSha256
masteringPlanSha256
masteringRecordSha256
masteredReceiptSha256
exactMasterInspected
masteringLineageAccepted
independentNamedHumanApproval
noMasterMutationPromotionDeliveryGitOrPublicationPerformed
```

Unknown fields are rejected even when the surrounding object is otherwise valid.

## Closed persisted evidence

The completed mastering plan, mastering record, mastered receipt, approval plan, approval record and named-human-approved receipt are admitted through exact top-level contracts before semantic verification.

A caller cannot add an invented authority or delivery claim, recompute a self-hash and rely on later code ignoring the extra field. The exact contract is checked before plan reconstruction or workspace persistence.

## Mutation safety

The compiler snapshots:

```text
masteringPlan
optional workspaceRoot
humanApproval
```

The document compiler snapshots:

```text
masteringPlan
previousReceipts
workspaceRoot
master
humanApproval
```

The materializer snapshots the complete approval plan before reconstruction, workspace inspection or any write.

Changing the original object immediately after calling either API cannot change the retained actor, attestations, master identity, approval evidence, receipt or persisted record.

## Adversarial coverage

The permanent HMF suite proves:

- post-call approval mutation cannot change the compiled approver or master attestation;
- approval accessors fail without getter execution;
- Proxy approvals fail before workspace work;
- symbol properties fail closed;
- unsupported approval, attestation and compiler fields are rejected;
- post-call plan mutation cannot change persisted approval evidence;
- plan accessors fail without getter execution;
- correctly rehashed plans with invented top-level claims are rejected.

The existing approval tests continue to prove unsafe-actor rejection, premature approval rejection, attestation drift detection, master drift detection, competing-receipt rejection, symlink rejection, authority-escalation rejection and exact idempotent replay.

## Authority boundary

This hardening changes admission only. It does not:

```text
call a provider
change candidate or master bytes
approve automatically
change the named-human decision
compile delivery readiness
promote the master into the game repository
compile the final atlas
mutate Git
deploy
publish
```
