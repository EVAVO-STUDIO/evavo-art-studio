# Book Art Docs Release Receiver

Status: shadow-only receiver; no production cutover  
Reviewed: 3 August 2026

## Purpose

Art Studio now verifies the complete final Book Art release emitted by `EVAVO-STUDIO/evavo-docs-suite` before it accepts the final brief for provider-job compilation.

The receiver closes the operational seam between `EVAVO-STUDIO/evavo-writing-studio`, Docs Suite and `EVAVO-STUDIO/evavo-art-studio` without importing runtime source between repositories.

```text
Docs Suite authoring packet
  -> EVAVO Writing Studio candidate and evidence
  -> Docs Suite admission and canonical mutation plan
  -> Website canonical manuscript transaction
  -> Docs Suite exact receipt import
  -> ready_for_art_shadow release receipt plus sealed final Book Art brief
  -> Art Studio release receiver
  -> one no-fallback, one-attempt durable provider job
```

## Reviewed repository boundary

```text
EVAVO-STUDIO/evavo-writing-studio
c776a9e7f856815dbb92ffec08426cd12f176bea

EVAVO-STUDIO/evavo-docs-suite
d7e5cd0f79ebcb211c502d33a90f84e93763f23c

EVAVO-STUDIO/evavo-art-studio
e9e96fd54a9e9d9c16bbd8faa2231caebb840c45
```

These commits are compatibility evidence. They do not authorize cross-repository runtime source imports.

## Release verification

The receiver requires:

- exact source and target repository identities;
- an allow-listed Docs Suite release commit;
- `evavo_docs_book_writing_art_release_v1` with `ready_for_art_shadow`;
- an exact canonical release fingerprint;
- the reviewed Writing Studio contract commit;
- the exact Art Studio brief-receiver contract commit;
- successful Website canonical mutation verification;
- successful exact final-brief verification;
- no remaining blockers or required actions;
- unique, canonically sorted release evidence;
- the complete release evidence set inside the final brief;
- matching project, volume, manuscript revision and manuscript SHA-256;
- a final brief whose fingerprint is recomputed from the received bytes;
- valid chronology from Docs release to Art receipt.

Unknown envelope or receipt fields fail closed.

## Runtime behaviour

A verified release may compile to one candidate, exactly one runtime attempt and no fallback. Compilation and durable submission perform no provider call. Duplicate submissions reuse the same deterministic runtime job.

A later provider worker may store one unapproved intermediate candidate and evidence. That candidate is not final.

The receiver always preserves:

```text
providerCallPerformed: false
candidateArtifactsWritten: false
authoritativeBookWritesPerformed: false
selectionPerformed: false
promotionPerformed: false
bookUseBindingCreated: false
runtimeCutoverApproved: false
publicationPerformed: false
```

Website remains the canonical manuscript writer during migration. Docs Suite remains the Book composition and publication authority. Writing Studio cannot call Art Studio directly. Art Studio cannot make manuscript or publication decisions.
