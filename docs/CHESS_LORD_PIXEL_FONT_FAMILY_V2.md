# Chess Lord 90s Pixel Font Family v2

Chess Lord is the production reference family for Pixel Font Studio v2. It demonstrates three related faces with independent pixel geometry rather than one alphabet scaled three ways.

## Faces

### Chess Lord UI

Compact DOS-era interface face for menus, clocks, player names, move notation, buttons and HUD information.

- 397 glyphs;
- 30 kerning pairs;
- 14-pixel line height;
- 128×256 canonical atlas.

### Chess Lord Text

Readable proportional pixel face for instructions, dialogue, help text, match descriptions and longer interface copy.

- 397 glyphs;
- 30 kerning pairs;
- 15-pixel line height;
- 128×256 canonical atlas.

### Chess Lord Herald

Tall ceremonial display face for the title, `CHECKMATE`, tournament headings, victory screens and royal presentation moments.

- 397 glyphs;
- 30 kerning pairs;
- 24-pixel line height;
- 256×256 canonical atlas.

## Coverage

All three faces pass the same production coverage contract:

- Western Latin;
- complete Latin Extended-A;
- typographic punctuation and common currencies;
- arrows;
- white and black chess pieces;
- UI marks;
- core box drawing and block elements.

The three faces contain distinct `g` and `q`, distinguish the main numeric/letter confusables, use genuine descenders and include separate authored quotation marks and primes.

## Runtime choice

Use `.fnt + .png` in Godot 4.6.2. The included `.tres` wrappers assume the family is copied to:

```text
res://assets/fonts/chess_lord/
```

The generated `.ttf` files are verified convenience derivatives for external tools. Their OS/2 embedding bits are set to `0` so authorised game packaging and desktop installation are not technically blocked; the EVAVO proprietary licence still applies. Do not substitute them for the bitmap runtime when exact pixel rendering is required.

## Pixel settings

- nearest filtering;
- no mipmaps;
- no subpixel positioning;
- integer scale factors only;
- system fallback disabled during QA;
- no fractional `Control`, canvas or viewport scale.

## Build

```powershell
python tools/pixel_font_studio_v2.py build `
  --master config/pixel-font-families/chess-lord-v2/chess-lord.family.json `
  --output C:\font-builds\chess-lord-v2
```

The output contains face masters, audits, atlases, BMFont files, Godot resources, TTFs, native specimens, a Godot fixture, manifests and exact identities.


## Additional interoperable outputs

Every v2.2 production face now includes:

- a BDF 2.1 bitmap font containing the exact authored glyph pixels and advances;
- an engine-neutral atlas JSON file mapping every Unicode code point to the packed PNG rectangle and metrics;
- a transparent fixed-cell review grid PNG and companion JSON map for manual sprite-sheet workflows;
- the canonical packed PNG plus AngelCode `.fnt` pair for efficient Godot use;
- the optional deterministic `.ttf` convenience font for desktop and design applications.

The fixed-cell grid is provided for inspection and custom tooling. It is not more efficient than the packed runtime atlas.


## Compact retained masters

Large complete face masters may be retained as deterministic `.json.gz` files with gzip timestamp zero. The studio expands them transparently, validates the exact JSON document, and emits a readable `.master.json` snapshot in every build. This keeps repository transport compact without changing the authored glyph source or runtime outputs.
