# Book Studio unattended authorial Writing

## Contract

`evavo_docs_book_unattended_authorial_writing_v1`

This boundary connects the deterministic unattended Book production plan to the project-owned authorial Writing runtime. It replaces the earlier side-by-side arrangement in which the unattended planner described a generic Writing Studio stage while the authorial Writing bridge was exposed separately.

The coordinator may execute exactly one `writing_candidate` stage per request. Editorial review remains a separate independent-consensus stage and canonical admission remains separately governed.

## Exact execution flow

1. Recompile the complete unattended production plan from the supplied versioned project and policy.
2. Compare the resulting plan fingerprint with the exact expected fingerprint supplied by the caller.
3. Resolve exactly one volume and exactly one stage identity.
4. Require the selected stage to be an unattended, automatic `writing_candidate` stage owned by Writing Studio.
5. Enforce the stage revision-cycle limit.
6. Require the exact dependency receipt set declared by the stage.
7. Require a prior revision receipt after cycle one and require the same receipt to be present in the independently prevalidated authorial bridge input.
8. Compile a deterministic revision-cycle evidence fingerprint.
9. Inject the unattended request, readiness, result, volume-plan, stage, gate, dependency and revision evidence into the Writing handoff.
10. Recompile the complete project-owned authorial bridge and exact Writing Studio runtime request.
11. Require project, programme, volume, time, evidence and runtime fingerprints to agree.
12. Permit one Writing Studio call with the exact prevalidated runtime fingerprint and no provider fallback.
13. Return the execution compilation, Writing coordination result and a deterministic coordination fingerprint.

The provider request is therefore directly bound to the unattended plan. The plan is not merely attached to an outer response after provider execution.

## Authority boundary

The coordinator always preserves:

- one bounded stage per automation call;
- one provider attempt per revision cycle;
- no invisible provider fallback;
- no authoritative Book-state write;
- no canonical manuscript mutation;
- no automatic canonical admission;
- no Art Studio call;
- no runtime cutover;
- no Amazon submission;
- no publication.

A successful provider response is a candidate only. It must still pass the separately governed result validation, independent editorial consensus, canonical admission and publication stages.

## Protected HTTP surface

`GET /api/v1/book-studio/unattended-production/authorial-writing`

Returns the versioned capability contract. A `documents:write` session or short-lived automation grant is required because the endpoint is provider-call capable.

`POST /api/v1/book-studio/unattended-production/authorial-writing`

Accepts one bounded compile-and-coordinate request. The route uses private no-store responses, stable public error codes, a 4.4 MB request limit and a 300-second server execution ceiling.

Blocked pre-provider requests return `422`. Ambiguous or fingerprint-inconsistent provider outcomes return `409`. Temporary Writing Studio configuration or remote availability failures return `503`. Continuation and needs-work results return `202`.

## CLI

```text
node apps/web/scripts/evavo-docs-book-unattended-authorial-writing-cli.mjs capabilities
node apps/web/scripts/evavo-docs-book-unattended-authorial-writing-cli.mjs execute --input request.json
node apps/web/scripts/evavo-docs-book-unattended-authorial-writing-cli.mjs execute --input request.json --output receipt.json
```

Output files use exclusive creation and never overwrite an existing receipt.

## MCP

The stdio adapter supports two connection-pinned protocol eras:

- `2026-07-28`: sessionless requests with per-request protocol metadata and `server/discover`;
- `2025-11-25`, `2025-06-18` and `2025-03-26`: legacy initialize and initialized-notification compatibility.

Modern responses include `resultType: complete` and server identity in the reserved result metadata. Modern `ping` is deliberately not advertised. The tool accepts exactly one `input` object and rejects unknown argument fields before any remote call.

## Validation requirements

The permanent checker verifies:

- the actual core relative-import graph;
- the restored authorial bridge type module;
- the actual core and narrative facade exports;
- the exact plan, stage, gate, revision and receipt binding tokens;
- one Writing coordination call in the server coordinator;
- the scoped route and private response policy;
- long-running timeout coverage for all Writing candidate endpoints;
- CLI no-clobber behaviour;
- modern and legacy MCP surfaces;
- every authority flag that must remain false.

The focused behavioural tests attack plan drift, wrong-stage dispatch, missing revision receipts, unbound revision receipts, dependency-set mismatch, revision-limit overrun, unknown fields and authority escalation. The adapter tests exercise the CLI and both MCP protocol eras through a local mock server.

The complete landing workflow also runs frozen dependency installation, strict core and web TypeScript, the existing unattended and authorial attack suites, complete repository verification, the production build and a clean-source proof.
