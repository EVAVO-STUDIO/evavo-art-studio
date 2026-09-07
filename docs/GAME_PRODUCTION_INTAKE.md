# Game production intake

Art Studio now has a strict read-only intake for Game Design Studio `creative-production-plan` packets.

It admits only packets targeted to `art-studio` and `EVAVO-STUDIO/evavo-art-studio`, validates source lineage and dependency receipts, and refuses any packet that tries to grant itself execution, creative approval, consumer-repository mutation or publishing authority.

This makes Art Studio the visual-direction authority for 2D/UI work and for hybrid 3D visual targets while preserving the existing governed provider, review and workspace flows. A packet marked ready means only that its declared prerequisites exist; it does not authorize a provider run and it never counts as human creative approval.

For hybrid work, the reviewed Art Studio target should lock silhouette, palette, materials, camera/readability and shape language before 3D Studio begins production. Environment packets should consume an Environment Studio receipt first when gameplay-space intent is involved.
