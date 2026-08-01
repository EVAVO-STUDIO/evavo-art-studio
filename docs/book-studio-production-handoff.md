# Book Studio Production Handoff

Art Studio is the target art-production authority for Book Studio cover and illustration work. Docs Suite retains manuscript, visual-canon, layout and publication authority.

The shared contract is `evavo_book_art_handoff_v1`.

## Inputs owned by Book Studio

A `BookArtBriefV1` must bind one request to the exact workspace, project, book, optional edition, manuscript revision, manuscript bytes, extracted text, visual canon and art direction. It also carries approved evidence, a materially distinct concept territory, composition and negative-space requirements, continuity and spoiler limits, historical/material requirements, output dimensions, rights evidence and a deterministic brief fingerprint.

Cover and narrative illustration work is text-free. Titles, author names, series details, captions, exact labels, spine text, ISBNs and barcodes remain editable Book Design elements.

## Outputs owned by Art Studio

A `BookArtArtifactReceiptV1` represents one immutable candidate or approved artifact. Approval requires:

- exact bytes, SHA-256, dimensions and MIME type;
- technical quality evidence;
- rights and provenance evidence;
- selection evidence;
- a separate promotion receipt;
- named or governed promotion identity and time;
- no generated-text contamination;
- no unresolved risk;
- approved commercial rights.

A provider response, high score, shortlist or selection result is not an approved master.

## Book-use binding

Docs Suite creates `BookArtworkUseBindingV1` only for an approved promoted artifact. The binding identifies the exact scene or illustration placement, crop/placement digest, source brief, artifact bytes and promotion receipt. The canonical renderer must resolve and verify the artifact bytes rather than trusting a mutable local path.

## Legacy Website artifacts

Existing Website records use `book-cover-artifact://` and `book-publication-artifact://` references. The compatibility contract accepts those exact identities through an explicit translation record. The legacy reference remains retained, no art bytes are rewritten, and both the artifact receipt and book-use binding must name the same original reference.

The canonical migration form is used only for validation and routing. It does not silently rename an approved object or allow a different reference to pass as the same artwork.

## Legacy Website evidence import

`importLegacyWebsiteBookArtState()` accepts exact Website quality, candidate-set and selection-binding records. It verifies their project, art-direction, candidate, artifact, checksum, rights and authority identities before producing a new handoff receipt.

The importer deliberately maps:

```text
eligible legacy quality only        -> candidate
complete legacy selection evidence  -> review_required
blocked or inconsistent evidence    -> blocked
```

It never maps a Website shortlist, composition approval or selected scene binding directly to `approved`. A new Art Studio promotion remains mandatory. Unknown provenance, absent rights evidence, generated-text uncertainty, mismatched bytes, stale art direction, partial identities and retained blockers fail closed or remain explicit risks.

The importer does not read, copy, regenerate or rewrite the image bytes. It imports evidence about the exact legacy artifact reference and checksum so later workers can resolve and verify those bytes through the governed artifact boundary.

## Transport

Large image files use immutable artifact references or bounded binary upload. They are not embedded as large JSON/base64 request fields.

## Migration posture

Website remains the active compatibility runtime. The new contract starts the no-loss convergence of Website cover/illustration candidate logic into Art Studio while Book Studio and Book Design move to Docs Suite. No production cutover, source deletion or publication is approved by this contract.
