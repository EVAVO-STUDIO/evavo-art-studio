# Studio Production v2 lineage fix

Art Studio now binds the `art-to-video` handoff to the exact sibling `art-to-cel` handoff emitted by the same approved character-performance delivery.

The binding is carried as one `art-to-cel-source-handoff` evidence row containing both the immutable handoff SHA-256 and handoff ID. Video Studio can therefore prove that its approved Art package and the Art package consumed by Cel Animation Studio are the same production lineage.

The delivery verifier rejects a handoff whose sibling binding is missing, duplicated, or points to a different Art-to-Cel source. This remains a transport and lineage guarantee only. It grants no automatic creative approval, release approval, publication authority, or deployment authority.
