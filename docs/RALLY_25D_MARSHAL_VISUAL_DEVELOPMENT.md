# Rally marshal visual-development jobs

The Forest Rally marshal is the first reusable character-production template in the Rally 2.5D program. It compiles thirteen independent one-image jobs covering identity, front/side/back orthographic construction, rigid-segment rig pivots, materials, the flag prop and five animation key poses.

The source program locks body height, shoulder width, head, hand and boot scale, clothing, flag identity and a fixed-isometric silhouette. It deliberately favors large readable hands and simple rigid limb segments over anatomy noise that disappears at gameplay scale.

Each job produces exactly one `2048 × 2048` PNG with a deterministic SHA-256, idempotency key, dependency list, working path and master path. Transparent character, prop and pose references remain separate images rather than contact sheets.

The five governed clip intentions are `idle`, `alert`, `flag-wave`, `react` and `flee`. These are visual references only; they do not grant crowd AI, navigation or gameplay behavior authority.

The specification forbids real event branding, sponsor text, generated wording, photoreal skin noise, unreadable fingers, baked shadows, multi-panel layouts and unrelated second characters. Provider execution, creative approval, image mutation, downstream repository writes, Git mutation, deployment and publication remain closed.
