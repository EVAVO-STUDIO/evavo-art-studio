## What changed

- add an exact ten-source materialization campaign bound to the v2 EVA ten-master program
- verify every pinned Runtime source as a stable ordinary file inside the supplied checkout
- verify the exact Git blob SHA-1, complete PNG chunk structure, every chunk CRC, IDAT decode, scanline filters, 8-bit RGB/RGBA encoding, non-interlaced layout and exact 1024×1536 canvas
- preflight all ten sources and all output paths before the first write
- copy each source to its governed `candidate.png` path byte-for-byte without image transformation
- emit self-hashed per-frame source inspection and materialization receipts plus a ten-frame campaign receipt
- publish the full 31-file campaign bundle create-only with rollback on publication failure
- reject every partial output state and reverify source bytes, candidate bytes and semantic receipts before completed replay
- add a strict `preflight|run` CLI with no approval, upload or activation switches
- add adversaries for bad frame ten, partial output, Git identity drift, canvas drift, PNG CRC corruption and completed-candidate tampering
- add a static capability contract, guard, focused SHA-pinned CI and operator documentation

## Boundary

This slice materializes the exact immutable Runtime source bytes into the governed v2 workspace. It does not establish candidate assurance, author or approve an alpha matte, master alpha, perform technical or creative review, upload to Cloudinary, release a sequence, mutate Avatar Runtime or activate the website.

Synthetic campaign fixtures exercise orchestration and failure semantics only. They are not evidence that EVA's real ten source files have been materialized on the production workstation.

## Required validation

- EVA dense-motion source materialization
- EVA dense-motion mastering execution
- Council avatar production contract
- EVA dense-motion workstation task
- Project art workbench
- CI media tool bootstrap
- exact-source clean-tree proof

No force push or administrative merge bypass.
