# Book Art legacy dry-run readiness

Art Studio exposes a dedicated compile-only readiness boundary for exact legacy Website Book Cover artwork:

```text
@evavo/art-book-runtime/legacy-registration-readiness
```

Use `assessLegacyBookArtDryRunReadiness(input, bytes)` after Website has produced and reviewed the read-only legacy state evidence and the exact referenced artwork bytes have been resolved without rewriting them.

The readiness boundary delegates to the existing legacy byte-registration compiler, verifies the same state-import evidence, checksum, byte length, decoded MIME type and pixel dimensions, and emits a deterministic content-addressed readiness receipt. It accepts no artifact store, runtime repository or provider registry.

A `ready` receipt means only that the supplied legacy state evidence and exact source bytes are eligible to proceed to a separately governed registration step. It does not write source or evidence artifacts, call an image provider, select a candidate, promote artwork, create a Book Artwork Use binding, change the canonical writer, approve runtime cutover or publish.

Malformed input, revoked proxies, throwing accessors, hostile byte objects and internal inspection errors fail closed to a `blocked` receipt. Private exception text is not copied into the receipt.

This is the safe Art-side counterpart to Website's read-only Book Cover legacy state export sequence. Website remains the compatibility writer while migration evidence is compiled and reviewed. Actual byte registration, Art Studio QA/selection/promotion, Docs Suite artwork-use binding, HTTP parity and cutover remain separate gates.
