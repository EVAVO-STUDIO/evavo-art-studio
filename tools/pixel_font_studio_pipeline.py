#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, Mapping

from pixel_font_studio_common import (
    BRIEF_SCHEMA, COMPILER_ID, COMPILER_VERSION, GLYPH_MASTER_SHA256,
    MANIFEST_SCHEMA, MAX_OUTPUT_FILES, QA_SCHEMA, checked_id, fail,
    hash_document, read_json, sha256_bytes, sha256_file, verify_document_hash,
)
from pixel_font_studio_raster import (
    atlas_pixels, compile_glyph, decode_png, encode_png, fnt_text, glyph_chars,
    glyph_sheet_png, pack_glyphs, parse_fnt, specimen_png,
)
from pixel_font_studio_spec import normalize_spec, roles_document, theme_text

def output_bytes_for_font(spec: Mapping[str, Any], font: Mapping[str, Any]) -> tuple[dict[str, bytes], dict[str, Any], dict[str, Any]]:
    characters = glyph_chars(spec, font)
    glyph_list = [compile_glyph(char, font["style"]) for char in characters]
    glyph_map = {glyph.char: glyph for glyph in glyph_list}
    packed, width, height = pack_glyphs(glyph_list, spec["atlas"]["padding"], spec["atlas"]["maxWidth"], spec["atlas"]["powerOfTwo"])
    atlas_name = f'{font["id"]}.png'
    rgba_pixels = atlas_pixels(width, height, packed)
    atlas = encode_png(width, height, rgba_pixels)
    line_height = 7 * font["style"]["scaleY"] + 2
    descriptor = fnt_text(font["id"], packed, width, height, line_height, 7 * font["style"]["scaleY"], atlas_name, line_height).encode("utf-8")
    specimen = specimen_png(font["id"], glyph_map, spec["palette"]) if spec["delivery"]["includeSpecimens"] else None
    glyph_sheet = glyph_sheet_png(glyph_map, spec["palette"]) if spec["delivery"]["includeGlyphSheets"] else None
    visible = sum(1 for index in range(3, len(rgba_pixels), 4) if rgba_pixels[index])
    duplicate_shapes: dict[str, list[str]] = {}
    for glyph in glyph_list:
        if glyph.char != " ":
            digest = sha256_bytes(bytes(cell for row in glyph.pixels for cell in row))
            duplicate_shapes.setdefault(digest, []).append(glyph.char)
    qa = {"fontId":font["id"],"role":font["role"],"glyphCount":len(glyph_list),"codepointMinimum":min(g.codepoint for g in glyph_list),"codepointMaximum":max(g.codepoint for g in glyph_list),"atlasWidth":width,"atlasHeight":height,"atlasOccupancy":round(visible/(width*height),6),"blankGlyphs":[g.char for g in glyph_list if g.char!=" " and not any(cell for row in g.pixels for cell in row)],"duplicateShapeGroups":[items for items in duplicate_shapes.values() if len(items)>1],"ambiguousPairChecks":{pair:glyph_map[pair[0]].pixels!=glyph_map[pair[1]].pixels for pair in ["0O","1I","1l","5S","8B"] if pair[0] in glyph_map and pair[1] in glyph_map}}
    if qa["blankGlyphs"]:
        fail(f'{font["id"]} contains blank non-space glyphs')
    if not all(qa["ambiguousPairChecks"].values()):
        fail(f'{font["id"]} contains an ambiguous required glyph pair')
    metadata = hash_document({"schema":"evavo.pixel-font.v1","fontId":font["id"],"familyId":spec["familyId"],"role":font["role"],"style":font["style"],"theme":font["theme"],"glyphs":[{"char":glyph.char,"codepoint":glyph.codepoint,"width":glyph.width,"height":glyph.height,"xadvance":glyph.xadvance} for glyph in glyph_list],"atlas":{"width":width,"height":height,"file":atlas_name},"godot":spec["godot"]},"documentSha256")
    files = {atlas_name:atlas,f'{font["id"]}.fnt':descriptor,f'{font["id"]}.font.json':(json.dumps(metadata,indent=2,ensure_ascii=False)+"\n").encode("utf-8")}
    if specimen is not None:
        files[f'{font["id"]}.specimen.png']=specimen
    if glyph_sheet is not None:
        files[f'{font["id"]}.glyphs.png']=glyph_sheet
    return files, metadata, qa

def atomic_create_directory(destination: Path, generated: Mapping[str, bytes], replace: bool) -> None:
    destination=Path(os.path.abspath(destination)); parent=destination.parent
    if not parent.is_dir() or parent.is_symlink():
        fail("output directory parent must be an existing non-symbolic directory")
    if destination.exists() or destination.is_symlink():
        if not replace:
            fail("output directory already exists; use --replace-generated explicitly")
        if destination.is_symlink() or not destination.is_dir():
            fail("replace target must be a regular directory")
        marker=destination/".evavo-pixel-font-generated"
        if not marker.is_file() or marker.is_symlink():
            fail("refusing to replace a directory without the generated marker")
    staging=Path(tempfile.mkdtemp(prefix=f".{destination.name}.",dir=parent))
    try:
        for relative,data in generated.items():
            candidate=Path(relative)
            if candidate.is_absolute() or ".." in candidate.parts or "\\" in relative:
                fail(f"generated path is unsafe: {relative}")
            target=staging/candidate; target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(data)
        (staging/".evavo-pixel-font-generated").write_text(COMPILER_VERSION+"\n",encoding="utf-8")
        if destination.exists():
            backup=destination.with_name(destination.name+".evavo-replaced")
            if backup.exists(): fail("replace backup path already exists")
            destination.rename(backup)
            try: staging.rename(destination)
            except Exception:
                backup.rename(destination); raise
            shutil.rmtree(backup)
        else: staging.rename(destination)
    finally:
        if staging.exists(): shutil.rmtree(staging,ignore_errors=True)

def compile_family(spec_path: Path, output_dir: Path, replace: bool=False) -> dict[str, Any]:
    spec_bytes,raw=read_json(spec_path); spec=normalize_spec(raw)
    generated:dict[str,bytes]={}; font_records=[]; qa_records=[]
    for font in spec["fonts"]:
        files,metadata,qa=output_bytes_for_font(spec,font)
        if set(generated).intersection(files): fail("generated filenames collided")
        generated.update(files); font_records.append({"fontId":font["id"],"role":font["role"],"files":sorted(files),"metadataSha256":metadata["documentSha256"],"glyphCount":qa["glyphCount"]}); qa_records.append(qa)
    theme_name=f'{spec["familyId"]}.theme.tres'; roles_name=f'{spec["familyId"]}.roles.json'
    generated[theme_name]=theme_text(spec).encode("utf-8")
    generated[roles_name]=(json.dumps(roles_document(spec),indent=2,ensure_ascii=False)+"\n").encode("utf-8")
    qa_doc=hash_document({"schema":QA_SCHEMA,"familyId":spec["familyId"],"status":"passed","fonts":qa_records,"requirements":{"deterministicMaster":True,"nearestFiltering":True,"integerScaling":True,"bmfontText":True,"godotTheme":True,"noExternalFontDependency":True},"authority":{"creativeApproval":False,"gameplayApproval":False,"repositoryMutation":False,"publication":False}},"qaSha256")
    generated["pixel-font-qa.json"]=(json.dumps(qa_doc,indent=2,ensure_ascii=False)+"\n").encode("utf-8")
    manifest=hash_document({"schema":MANIFEST_SCHEMA,"compiler":{"id":COMPILER_ID,"version":COMPILER_VERSION},"familyId":spec["familyId"],"displayName":spec["displayName"],"sourceSpecSha256":sha256_bytes(spec_bytes),"glyphMasterSha256":GLYPH_MASTER_SHA256,"fonts":font_records,"files":[{"path":name,"sha256":sha256_bytes(data),"bytes":len(data)} for name,data in sorted(generated.items())],"theme":theme_name,"roles":roles_name,"qa":{"path":"pixel-font-qa.json","qaSha256":qa_doc["qaSha256"]},"godot":spec["godot"],"license":spec["license"],"authority":{"providerExecution":False,"automaticCreativeApproval":False,"targetRepositoryMutation":False,"publication":False}},"manifestSha256")
    generated["pixel-font-family.manifest.json"]=(json.dumps(manifest,indent=2,ensure_ascii=False)+"\n").encode("utf-8")
    atomic_create_directory(output_dir,generated,replace); return manifest

def verify_family(manifest_path: Path) -> dict[str, Any]:
    _,manifest=read_json(manifest_path)
    if manifest.get("schema")!=MANIFEST_SCHEMA: fail(f"manifest.schema must be {MANIFEST_SCHEMA}")
    verify_document_hash(manifest,"manifestSha256")
    if manifest.get("glyphMasterSha256")!=GLYPH_MASTER_SHA256: fail("manifest glyph master identity differs from the current EVAVO master")
    root=manifest_path.parent.resolve(strict=True)
    if root.is_symlink(): fail("manifest root must not be symbolic")
    files=manifest.get("files")
    if not isinstance(files,list) or not files or len(files)>MAX_OUTPUT_FILES: fail("manifest.files must be a bounded non-empty array")
    seen:set[str]=set(); verified_files=[]
    for index,record in enumerate(files):
        if not isinstance(record,dict): fail(f"manifest.files[{index}] must be an object")
        relative=record.get("path")
        if not isinstance(relative,str) or Path(relative).is_absolute() or ".." in Path(relative).parts or "\\" in relative: fail(f"manifest.files[{index}].path is unsafe")
        if relative in seen: fail(f"manifest.files contains duplicate path {relative}")
        seen.add(relative); digest,size=sha256_file(root/relative)
        if digest!=record.get("sha256") or size!=record.get("bytes"): fail(f"manifest identity differs for {relative}")
        verified_files.append({"path":relative,"sha256":digest,"bytes":size})
    _,qa=read_json(root/manifest["qa"]["path"])
    if qa.get("schema")!=QA_SCHEMA or qa.get("status")!="passed": fail("pixel-font QA document is not passed")
    verify_document_hash(qa,"qaSha256")
    if qa["qaSha256"]!=manifest["qa"]["qaSha256"]: fail("manifest QA hash differs")
    for font in manifest.get("fonts",[]):
        font_id=checked_id(font.get("fontId"),"manifest.fonts[].fontId")
        descriptor=parse_fnt((root/f"{font_id}.fnt").read_text(encoding="utf-8")); atlas_path=root/descriptor["page"]
        width,height,pixels=decode_png(atlas_path.read_bytes()); common=descriptor["common"]
        if common.get("scaleW")!=width or common.get("scaleH")!=height: fail(f"{font_id} BMFont dimensions differ from atlas")
        occupied=[]
        for char in descriptor["chars"]:
            for key in ["id","x","y","width","height","xadvance"]:
                if key not in char: fail(f"{font_id} char is missing {key}")
            if char["x"]<0 or char["y"]<0 or char["width"]<1 or char["height"]<1: fail(f"{font_id} has invalid glyph rectangle")
            if char["x"]+char["width"]>width or char["y"]+char["height"]>height: fail(f"{font_id} glyph rectangle escapes atlas")
            rect=(char["x"],char["y"],char["x"]+char["width"],char["y"]+char["height"],char["id"])
            for prior in occupied:
                if max(rect[0],prior[0])<min(rect[2],prior[2]) and max(rect[1],prior[1])<min(rect[3],prior[3]): fail(f"{font_id} glyph rectangles overlap")
            occupied.append(rect)
        if not any(pixels[index] for index in range(3,len(pixels),4)): fail(f"{font_id} atlas has no visible pixels")
    theme=(root/manifest["theme"]).read_text(encoding="utf-8")
    for font in manifest.get("fonts",[]):
        if f'{font["fontId"]}.fnt' not in theme: fail(f"theme does not reference {font['fontId']}.fnt")
    return hash_document({"schema":"evavo.pixel-font-family-verification.v1","status":"passed","familyId":manifest["familyId"],"manifestSha256":manifest["manifestSha256"],"verifiedFiles":verified_files,"godot":manifest["godot"],"authority":{"creativeApproval":False,"nativeGodotExecution":False,"targetRepositoryMutation":False,"publication":False}},"verificationSha256")

def provider_brief(spec_path: Path, output_path: Path) -> dict[str, Any]:
    spec_bytes,raw=read_json(spec_path); spec=normalize_spec(raw)
    brief=hash_document({"schema":BRIEF_SCHEMA,"familyId":spec["familyId"],"sourceSpecSha256":sha256_bytes(spec_bytes),"glyphMasterSha256":GLYPH_MASTER_SHA256,"objective":"Create visual reference sheets for an original 1990s DOS pixel-font family while preserving the deterministic EVAVO glyph compiler as final authority.","constraints":["original letterforms; do not reproduce a commercial font","hard integer pixel grid; no antialiasing, blur or vector smoothing","strong distinction for 0/O, 1/I/l, 5/S and 8/B","legibility at 1x, 2x and 3x integer scales","white glyphs on transparent or flat hostile mattes","reference only: generated imagery cannot become runtime font bytes without deterministic redrawing and QA"],"fonts":[{"fontId":font["id"],"role":font["role"],"style":font["style"],"sampleText":spec["sampleText"],"palette":spec["palette"]} for font in spec["fonts"]],"authority":{"providerExecution":False,"glyphApproval":False,"runtimeFontCreation":False,"publication":False}},"briefSha256")
    if output_path.exists() or output_path.is_symlink(): fail("provider brief output must not already exist")
    output_path.parent.mkdir(parents=True,exist_ok=True); output_path.write_text(json.dumps(brief,indent=2,ensure_ascii=False)+"\n",encoding="utf-8"); return brief
