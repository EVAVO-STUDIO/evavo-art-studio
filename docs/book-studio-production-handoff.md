# Book Studio Production Handoff

Art Studio is the target art-production authority for Book Studio cover and illustration work. Docs Suite retains manuscript, visual-canon, layout and publication authority.

The shared contract is `evavo_book_art_handoff_v1`.

## Inputs owned by Book Studio

A `BookArtBriefV1` must bind one request to the exact workspace, project, book, optional edition, manuscript revision, manuscript bytes, extracted text, visual canon and art direction. It also carries approved evidence, a materially distinct concept territory, composition and negative-space requirements, continuity and spoiler limits, historical/material requirements, output dimensions, rights evidence and a deterministic brief fingerprint.

Cover and narrative illustration work is text-free. Titles, author names, series details, captions, exact labels, spine text, ISBNs and barcodes remain editable Book Design elements.

## Art Studio production profile

`compileBookArtProductionWorkOrder()` converts one exact `BookArtBriefV1` into a fingerprinted `evavo_book_art_production_work_order` under `evavo_book_art_profile_v1`.

The work order supports:

- front-cover and full-wrap background art;
- full-page, half-page and spot illustrations;
- diagrams and maps;
- transparent or opaque ornaments;
- print, digital or combined delivery requirements;
- provider-neutral one-candidate-at-a-time execution;
- exact manuscript, visual-canon, art-direction and rights evidence replay;
- separate technical mastering, selection, promotion and Book Studio use binding.

The compiler rejects unknown fields and refuses title, subtitle, author, contributor, spine, ISBN, barcode, KDP, trim, bleed, pricing, listing metadata or publication authority at the Art Studio boundary. It emits only an intermediate PNG candidate request. Delivery MIME types, final dimensions, PPI and colour intent remain technical mastering requirements rather than claims that a provider response is final.

Every work order keeps:

```text
providerCandidateMayBeFinal: false
authoritativeWritesPerformed: false
selectionRequired: true
promotionRequired: true
bookUseBindingRequired: true
artifactBytesRewritten: false
canonicalRendererMustVerifyBytes: true
runtimeCutoverApproved: false
publicationPerformed: false
```

`translateLegacyWebsiteBookArtGenerationPlan()` validates one exact ready Website cover-generation task against the canonical Book Art brief. It retains the old plan, input, scene, art-direction and prompt digests for shadow comparison, but does not retain or trust the raw legacy provider prompt as the new authority. Translation is shadow-only and performs no provider call, artifact write, selection, promotion, cutover or publication.

## Legacy Book Illustration plan parity

`translateLegacyWebsiteBookIllustrationGenerationPlan()` validates one exact ready Website Book Illustration task against the canonical Art Studio work order. It verifies:

- deterministic plan and input fingerprints;
- approved style-authority identity and exact digest;
- ready page-authority identity and exact digest;
- exact style-to-page binding;
- current art direction;
- manuscript and visual-manuscript authority digests;
- page role versus canonical illustration, diagram, map or ornament purpose;
- live-text pages retaining at least one protected text zone;
- exact candidate identity, next-task state, prompt digest and idempotency key;
- transparent ink-layer requirements for ornaments;
- absence of retained hard errors, unresolved revisions or human decisions.

The translator retains the old style, page, layout, prompt, input and plan evidence only as small identities, counts and SHA-256 digests. It deliberately does not carry legacy page rectangles, trim, bleed, gutters, margins, text blocks, captions, chapter titles, running heads, folios or other publication layout into Art Studio. Those remain Docs Suite authority. The raw Website prompt is also not trusted as the new Art Studio authority.

Translation remains shadow-only:

```text
rawLegacyPromptTrustedAsAuthority: false
legacyLayoutTrustedAsArtAuthority: false
layoutGeometryRetained: false
authoritativeWritesPerformed: false
providerCandidateMayBeFinal: false
promotionRequired: true
bookUseBindingRequired: true
artifactBytesRead: false
artifactBytesRewritten: false
runtimeCutoverApproved: false
publicationPerformed: false
```

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

## Exact legacy artwork byte registration

`registerLegacyBookArtBytes()` consumes the original Website state-import input and reruns `importLegacyWebsiteBookArtState()` before accepting any file. It then verifies the original file checksum, byte length, decoded MIME type and dimensions against the imported legacy evidence. Eligible cover artwork is stored byte-for-byte as an immutable unapproved `source` artifact, followed by a separate registration-evidence artifact.

Registration does not re-encode or rewrite the image, create a mutable named reference, import legacy approval, select a candidate, promote a master, create a Book-use binding or approve publication. The production corpus still requires complete item coverage and receipt collection before any Website retirement decision.

## Transport

Large image files use immutable artifact references or bounded binary upload. They are not embedded as large JSON/base64 request fields.

## Migration posture

Website remains the active compatibility runtime. The production profile and exact cover/illustration shadow translators make Art Studio capable of compiling the Art-owned generation boundary without absorbing Book Design authority. The durable Book Art provider shadow runtime can now submit one idempotent, one-attempt, no-fallback provider candidate job and retain only unapproved intermediate candidate and evidence artifacts. Provider execution wiring, immutable storage registration, production shadow calls and controlled candidate-lifecycle cutover remain separately gated for the active Book Studio path; the new bridge is shadow-only. The exact legacy-byte registrar is implemented, but complete production-corpus registration and receipt coverage remain gated alongside authenticated production shadow parity, mastering and comparison parity, Website retirement and deletion evidence. No production cutover, source deletion or publication is approved by this contract.
