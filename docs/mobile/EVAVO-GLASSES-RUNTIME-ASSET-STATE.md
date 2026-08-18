# EVAVO Glasses runtime asset state

The canonical mobile production contract records what is already shipped in `EVAVO-STUDIO/evavo-glasses` separately from what Art Studio may still generate as a candidate.

## Shipped identity

The GODMODE product identity remains the reviewed runtime identity. Art Studio does not automatically replace it.

Runtime surfaces tracked by the contract include:

- iOS 1024 app-icon master;
- Android legacy launcher icon;
- Android adaptive foreground;
- Android round adaptive launcher variants;
- Android 13 themed/monochrome launcher variant.

New icon experiments remain candidate-only until a governed comparison confirms that they improve the product without changing the established identity unexpectedly.

## Phone and tablet

The contract tracks the current responsive product rules:

- phone: single-column control surface;
- Android tablet breakpoint: 720dp;
- tablet: two-column dashboard;
- iOS regular-width metrics: four columns;
- iOS quick modes: three columns;
- iOS maximum content width: 1120pt;
- minimum interactive target: 48dp Android / 44pt iOS.

These rules are product requirements, not image-generation prompts.

## Native visual depth

The platforms intentionally do not use identical background implementations:

- iOS currently uses a restrained native procedural field;
- Android currently keeps a flatter native surface.

That difference is valid. Art Studio must not claim visual parity where the runtime deliberately differs, and it must not introduce a bitmap noise texture merely to make the implementations look mechanically identical.

## Authority

Art Studio may generate and compare candidates. It cannot approve or publish a replacement runtime identity by generation alone. Runtime promotion remains a governed `evavo-glasses` decision.
