#!/usr/bin/env python3
from __future__ import annotations

from typing import Any, Mapping

from pixel_font_studio_common import (
    GLYPH_MASTER_SHA256, GLYPH_SETS, MAX_ATLAS_SIDE, SPEC_SCHEMA,
    checked_id, checked_int, checked_text, fail, hash_document, parse_colour,
)

def normalize_spec(value: Mapping[str, Any]) -> dict[str, Any]:
    if value.get("schema") != SPEC_SCHEMA:
        fail(f"spec.schema must be {SPEC_SCHEMA}")
    family_id = checked_id(value.get("familyId"), "familyId")
    if value.get("glyphMasterSha256") != GLYPH_MASTER_SHA256:
        fail("glyphMasterSha256 must pin the current EVAVO pixel-font master")
    display_name = checked_text(value.get("displayName"), "displayName", 1, 160)
    fonts = value.get("fonts")
    if not isinstance(fonts, list) or not 1 <= len(fonts) <= 16:
        fail("fonts must contain 1..16 entries")
    glyph_sets = value.get("glyphSets", ["ascii-printable"])
    if not isinstance(glyph_sets, list) or not glyph_sets:
        fail("glyphSets must be a non-empty array")
    for item in glyph_sets:
        if item not in GLYPH_SETS:
            fail(f"unsupported family glyph set: {item}")
    atlas = value.get("atlas", {})
    if not isinstance(atlas, dict):
        fail("atlas must be an object")
    atlas_normalized = {
        "padding": checked_int(atlas.get("padding", 1), "atlas.padding", 0, 16),
        "maxWidth": checked_int(atlas.get("maxWidth", 512), "atlas.maxWidth", 32, MAX_ATLAS_SIDE),
        "powerOfTwo": bool(atlas.get("powerOfTwo", True)),
    }
    palette = value.get("palette", {})
    if not isinstance(palette, dict):
        fail("palette must be an object")
    palette_normalized = {"black": palette.get("black", "#000000"), "white": palette.get("white", "#ffffff"), "signal": palette.get("signal", "#ff244e"), "mid": palette.get("mid", "#5a5a5a")}
    for key, colour in palette_normalized.items():
        parse_colour(colour, f"palette.{key}")
    godot = value.get("godot", {})
    if not isinstance(godot, dict):
        fail("godot must be an object")
    godot_normalized = {"minimumVersion": checked_text(godot.get("minimumVersion", "4.4"), "godot.minimumVersion", 1, 32), "testedVersion": checked_text(godot.get("testedVersion", "4.6.2"), "godot.testedVersion", 1, 32), "textureFilter": godot.get("textureFilter", "nearest"), "integerScales": godot.get("integerScales", [1, 2, 3, 4])}
    if godot_normalized["textureFilter"] != "nearest":
        fail("godot.textureFilter must be nearest for pixel fonts")
    if not isinstance(godot_normalized["integerScales"], list) or not godot_normalized["integerScales"]:
        fail("godot.integerScales must be a non-empty array")
    godot_normalized["integerScales"] = [checked_int(item, "godot.integerScales[]", 1, 16) for item in godot_normalized["integerScales"]]
    seen: set[str] = set()
    normalized_fonts: list[dict[str, Any]] = []
    for index, raw in enumerate(fonts):
        if not isinstance(raw, dict):
            fail(f"fonts[{index}] must be an object")
        font_id = checked_id(raw.get("id"), f"fonts[{index}].id")
        if font_id in seen:
            fail(f"duplicate font id: {font_id}")
        seen.add(font_id)
        role = checked_id(raw.get("role"), f"fonts[{index}].role")
        style = raw.get("style", {})
        if not isinstance(style, dict):
            fail(f"fonts[{index}].style must be an object")
        for key, default, minimum, maximum in [("scaleX",1,1,8),("scaleY",1,1,8),("boldX",0,0,3),("slantRows",0,0,8),("tracking",1,0,16),("spaceWidth",3,1,16)]:
            checked_int(style.get(key, default), f"fonts[{index}].style.{key}", minimum, maximum)
        theme = raw.get("theme", {})
        if not isinstance(theme, dict):
            fail(f"fonts[{index}].theme must be an object")
        design_line_height = 7 * style.get("scaleY", 1) + 2
        font_size = checked_int(theme.get("fontSize", design_line_height), f"fonts[{index}].theme.fontSize", 4, 256)
        if font_size % design_line_height != 0:
            fail(f"fonts[{index}].theme.fontSize must be an integer multiple of design line height {design_line_height}")
        normalized_fonts.append({"id":font_id,"role":role,"glyphSets":raw.get("glyphSets",glyph_sets),"extraGlyphs":raw.get("extraGlyphs",[]),"style":{"scaleX":style.get("scaleX",1),"scaleY":style.get("scaleY",1),"boldX":style.get("boldX",0),"slantRows":style.get("slantRows",0),"tracking":style.get("tracking",1),"spaceWidth":style.get("spaceWidth",3),"monospace":bool(style.get("monospace",False)),"uppercaseOnly":bool(style.get("uppercaseOnly",False))},"theme":{"fontSize":font_size,"designSize":design_line_height,"outlineSize":checked_int(theme.get("outlineSize",0),f"fonts[{index}].theme.outlineSize",0,32),"outlineColour":theme.get("outlineColour","#000000"),"shadowColour":theme.get("shadowColour","#00000000"),"shadowOffsetX":checked_int(theme.get("shadowOffsetX",0),f"fonts[{index}].theme.shadowOffsetX",-32,32),"shadowOffsetY":checked_int(theme.get("shadowOffsetY",0),f"fonts[{index}].theme.shadowOffsetY",-32,32)}})
        parse_colour(normalized_fonts[-1]["theme"]["outlineColour"], f"fonts[{index}].theme.outlineColour")
        parse_colour(normalized_fonts[-1]["theme"]["shadowColour"], f"fonts[{index}].theme.shadowColour")
    delivery = value.get("delivery", {})
    if not isinstance(delivery, dict):
        fail("delivery must be an object")
    return {"schema":SPEC_SCHEMA,"familyId":family_id,"displayName":display_name,"glyphMasterSha256":GLYPH_MASTER_SHA256,"description":checked_text(value.get("description","EVAVO pixel-font family"),"description",1,2000),"glyphSets":list(glyph_sets),"atlas":atlas_normalized,"palette":palette_normalized,"godot":godot_normalized,"delivery":{"includeSpecimens":bool(delivery.get("includeSpecimens",True)),"includeGlyphSheets":bool(delivery.get("includeGlyphSheets",True))},"fonts":normalized_fonts,"sampleText":checked_text(value.get("sampleText","SAIL • SELL • SURVIVE"),"sampleText",1,4000),"license":checked_text(value.get("license","EVAVO proprietary project asset"),"license",1,256)}

def colour_to_godot(value: str) -> str:
    r,g,b,a = parse_colour(value, "theme colour")
    return f"Color({r/255:.6f}, {g/255:.6f}, {b/255:.6f}, {a/255:.6f})"

def theme_text(spec: Mapping[str, Any]) -> str:
    fonts = spec["fonts"]
    lines = [f'[gd_resource type="Theme" load_steps={len(fonts)+1} format=3]', ""]
    ids: dict[str,str] = {}
    for index,font in enumerate(fonts,1):
        rid=f"{index}_{font['id']}"; ids[font["id"]]=rid
        lines.append(f'[ext_resource type="FontFile" path="res://assets/fonts/pixel/{font["id"]}.fnt" id="{rid}"]')
    lines.extend(["", "[resource]"])
    default=next((font for font in fonts if font["role"]=="ui"),fonts[0])
    lines.extend([f'default_font = ExtResource("{ids[default["id"]]}")',f'default_font_size = {default["theme"]["fontSize"]}'])
    variations={"display":"BrassTitleLabel","ui":"BrassUiLabel","ledger":"BrassLedgerLabel","micro":"BrassMicroLabel","symbols":"BrassSymbolLabel"}
    for font in fonts:
        variation=variations.get(font["role"],"Brass"+"".join(part.title() for part in font["role"].split("-"))+"Label")
        theme=font["theme"]
        lines.extend([f'{variation}/base_type = &"Label"',f'{variation}/fonts/font = ExtResource("{ids[font["id"]]}")',f'{variation}/font_sizes/font_size = {theme["fontSize"]}',f'{variation}/colors/font_outline_color = {colour_to_godot(theme["outlineColour"])}',f'{variation}/colors/font_shadow_color = {colour_to_godot(theme["shadowColour"])}',f'{variation}/constants/outline_size = {theme["outlineSize"]}',f'{variation}/constants/shadow_offset_x = {theme["shadowOffsetX"]}',f'{variation}/constants/shadow_offset_y = {theme["shadowOffsetY"]}'])
    for control in ["Button","CheckButton","LineEdit","OptionButton","RichTextLabel","Label"]:
        lines.extend([f'{control}/fonts/font = ExtResource("{ids[default["id"]]}")',f'{control}/font_sizes/font_size = {default["theme"]["fontSize"]}'])
    return "\n".join(lines)+"\n"

def roles_document(spec: Mapping[str, Any]) -> dict[str, Any]:
    variations={"display":"BrassTitleLabel","ui":"BrassUiLabel","ledger":"BrassLedgerLabel","micro":"BrassMicroLabel","symbols":"BrassSymbolLabel"}
    return hash_document({"schema":"evavo.pixel-font-role-map.v1","familyId":spec["familyId"],"roles":{font["role"]:{"fontId":font["id"],"resourcePath":f'res://assets/fonts/pixel/{font["id"]}.fnt',"themeVariation":variations.get(font["role"],"Brass"+"".join(part.title() for part in font["role"].split("-"))+"Label"),"designFontSize":font["theme"]["designSize"],"defaultFontSize":font["theme"]["fontSize"],"integerScales":spec["godot"]["integerScales"]} for font in spec["fonts"]},"authority":{"runtimeMutation":False,"automaticThemeActivation":False,"creativeApproval":False,"publication":False}},"documentSha256")
