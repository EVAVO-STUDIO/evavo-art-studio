# EVAVO Studio Handoff v2

Studio Handoff v2 is the immutable transport boundary between EVAVO production studios. It allows a receiver to prove exactly what it accepted without inheriting creative, release, publication, or deployment authority from the sender.

## Bound identity

Every handoff binds:

- one handoff type, producer studio, producer commit, and consumer studio;
- one production identity, creative-intent digest, and continuity digest;
- a sorted and unique asset set containing stable IDs, portable relative paths, byte counts, media types, roles, and SHA-256 digests;
- a sorted and unique evidence set;
- explicit creative and release evidence flags;
- explicit `false` publication and deployment authority.

The compiler is deterministic. Reordering otherwise identical assets or evidence does not alter the handoff identity. Any mutation of a bound field changes the canonical digest and invalidates the handoff.

`verifyStudioHandoffFiles` additionally proves that every declared asset resolves beneath an approved root, is an ordinary non-symlink file, and matches its declared byte count and SHA-256. Parent-directory symlinks, path traversal, Windows-incompatible names, hidden prototype keys, lone Unicode surrogates, floats, unsafe integers, and authority escalation fail closed.

Acceptance is a separate receipt. The consumer acknowledges the exact handoff digest and exact complete asset set. Acceptance proves transport only. It cannot approve creative work, approve release, publish, or deploy.

## Node API

```js
import {
  compileStudioHandoff,
  verifyStudioHandoff,
  verifyStudioHandoffFiles,
  compileStudioAcceptanceReceipt,
} from "./tools/studio-handoff-v2.mjs";
```

Audio Studio exposes the same Node contract from `contracts/studio-handoff-v2.mjs`.

## Python API

```python
from studio_handoff_v2 import (
    compile_studio_handoff,
    verify_studio_handoff,
    verify_studio_handoff_files,
    compile_studio_acceptance_receipt,
)
```

The Python implementation lives in Audio Studio Voice Lab and is parity-tested against the Node implementation.

## Canonical JSON profile

The canonical value profile is deliberately narrower than general JSON:

- object property names are ordered by UTF-16 code units, matching JSON Canonicalization Scheme ordering;
- strings must be valid Unicode and lone surrogates are rejected;
- only finite safe integers are admitted; floating-point values are rejected;
- continuous measurements must be carried as fixed-point integers with the unit in the field name, such as `durationMs`, `truePeakMilliDbtp`, or `integratedLoudnessMilliLufs`;
- arrays preserve order unless the contract explicitly normalises them as sets;
- forbidden prototype keys and non-portable paths are rejected.

This is **JCS-aligned, not a complete implementation of RFC 8785**. The safe-integer and no-float restrictions are intentional cross-language production constraints. A raw JSON transport parser must reject duplicate object keys before constructing the in-memory object; duplicate keys cannot be recovered after a conventional parser has already collapsed them.

## Provenance and interchange boundaries

A handoff evidence record may reference an externally produced C2PA 2.4 Content Credential by stable identifier and digest. This contract does not create, sign, validate, or claim a C2PA credential itself.

Timeline and colour intent can be carried as evidence and profile fields, but Studio Handoff v2 does not itself emit OpenTimelineIO documents or perform OpenColorIO/ACES transforms. Those remain receiver-owned production steps with their own receipts.

## Required receiver behaviour

A receiver must:

1. verify the handoff digest;
2. verify every file when bytes are available locally;
3. confirm the expected producer, consumer, handoff type, production, intent, and continuity identities;
4. compile an acceptance receipt for the exact asset set;
5. rerun its native quality gates;
6. keep creative, release, publication, and deployment decisions separate.

A valid handoff is evidence that transport and lineage are intact. It is never evidence that the media is creatively approved or ready to publish.
