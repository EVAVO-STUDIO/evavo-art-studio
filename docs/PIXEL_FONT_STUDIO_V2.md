# EVAVO Pixel Font Studio v2

Pixel Font Studio v2 adds an authored-master path for production bitmap typefaces while keeping the v1 5x7 families backward compatible.

## Why v2 exists

A real game font is not a scaled effect applied to one generic alphabet. Each face owns its glyph matrices, dimensions, offsets, advances and kerning. This supports compact UI faces, readable proportional text faces and larger display faces that share an art direction without sharing the same pixel geometry.

## Authoritative source

The source of truth is JSON using `evavo.pixel-font-face-master.v2`. Every glyph declares Unicode codepoint, exact `. #` bitmap rows, width, height, x/y offset and x advance. Faces also declare cap height, x-height, baseline, line height and space advance. Kerning belongs to the face.

The family master `evavo.pixel-font-family-master.v2` binds the face masters and the exact Godot runtime policy.

## Canonical runtime output

Godot 4.6.2 should consume AngelCode BMFont text `.fnt` beside the generated RGBA PNG atlas. A `FontVariation` `.tres` is generated as a stable game-facing resource wrapper.

Required pixel policy:

- nearest texture filtering;
- integer-only UI/render scaling;
- subpixel positioning disabled;
- mipmaps disabled;
- automatic system-font fallback disabled for production verification;
- no source antialiasing;
- no glyph rotation or resampling.

Optional TTF/OTF conversions are convenience derivatives only. They are not the canonical pixel source because host renderers may apply antialiasing or hinting.

## Coverage policy

Production faces must contain printable ASCII. Game families should normally add Western Latin accents, typographic punctuation, currencies and game-specific symbols. Chess Lord additionally includes chess-piece symbols. Missing characters should fail QA rather than silently depend on a system font.

## CLI

```powershell
python tools/pixel_font_studio_v2.py catalog
python tools/pixel_font_studio_v2.py build --master C:\work\family.master.json --output C:\work\font-build
python tools/pixel_font_studio_v2.py validate --family C:\work\font-build\pixel-font-family.json
```

Builds are create-only. The master remains editable and diffable in Git.

## ChatGPT / Claude use

Agents should edit the explicit glyph-master JSON, not a packed atlas. Work in control glyphs first, validate confusables and native-size specimens, then expand coverage. The builder converts approved masters into deterministic game artifacts. Provider-generated lettering is reference material only and must not be accepted as a full alphabet without glyph-by-glyph authoring and review.

## Godot verification

A downstream Godot 4.6.2 fixture should load every `.fnt` as `FontFile`, disable `allow_system_fallback`, disable subpixel positioning and mipmaps, then assert required Unicode coverage. Native 320x200 and integer-scaled specimen screenshots remain the creative review authority.
