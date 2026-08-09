#!/usr/bin/env python3
"""Shared contracts and bounded helpers for EVAVO Pixel Font Studio."""
from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

SPEC_SCHEMA = "evavo.pixel-font-family.v1"
MANIFEST_SCHEMA = "evavo.pixel-font-family-manifest.v1"
QA_SCHEMA = "evavo.pixel-font-family-qa.v1"
BRIEF_SCHEMA = "evavo.pixel-font-provider-brief.v1"
COMPILER_ID = "evavo-pixel-font-studio"
COMPILER_VERSION = "1.0.0"
MAX_SPEC_BYTES = 8 * 1024 * 1024
MAX_OUTPUT_FILES = 256
MAX_ATLAS_SIDE = 4096
MAX_ATLAS_PIXELS = 16_777_216
HASH_RE = re.compile(r"^[0-9a-f]{64}$")
ID_RE = re.compile(r"^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$")
HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$")
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

class PixelFontError(ValueError):
    """A bounded deterministic font-pipeline error."""

def fail(message: str) -> None:
    raise PixelFontError(message)

def canonical_json(value: Any) -> str:
    if value is None or isinstance(value, (str, int, bool)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, float):
        if not math.isfinite(value):
            fail("canonical JSON cannot contain non-finite numbers")
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(canonical_json(item) for item in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(json.dumps(str(key), ensure_ascii=False) + ":" + canonical_json(value[key]) for key in sorted(value)) + "}"
    fail(f"unsupported canonical JSON value: {type(value).__name__}")

def hash_document(value: Mapping[str, Any], field: str) -> dict[str, Any]:
    body = dict(value); body.pop(field, None)
    body[field] = hashlib.sha256(canonical_json(body).encode("utf-8")).hexdigest()
    return body

def verify_document_hash(value: Mapping[str, Any], field: str) -> str:
    digest = value.get(field)
    if not isinstance(digest, str) or not HASH_RE.fullmatch(digest):
        fail(f"{field} must be a lowercase SHA-256 digest")
    body = dict(value); body.pop(field, None)
    observed = hashlib.sha256(canonical_json(body).encode("utf-8")).hexdigest()
    if observed != digest:
        fail(f"{field} does not match canonical document content")
    return digest

def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()

def sha256_file(path: Path, maximum: int = 256 * 1024 * 1024) -> tuple[str, int]:
    state = path.lstat()
    if not path.is_file() or path.is_symlink(): fail(f"expected regular non-symbolic file: {path}")
    if state.st_size > maximum: fail(f"file exceeds {maximum} byte limit: {path}")
    digest=hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024*1024), b""): digest.update(chunk)
    return digest.hexdigest(), state.st_size

def read_json(path: Path, maximum: int = MAX_SPEC_BYTES) -> tuple[bytes, dict[str, Any]]:
    if not path.is_file() or path.is_symlink(): fail(f"JSON input must be a regular non-symbolic file: {path}")
    data=path.read_bytes()
    if not data or len(data)>maximum: fail(f"JSON input must contain 1..{maximum} bytes: {path}")
    try: value=json.loads(data.decode("utf-8-sig"))
    except (UnicodeDecodeError,json.JSONDecodeError) as exc: raise PixelFontError(f"invalid JSON in {path}: {exc}") from exc
    if not isinstance(value,dict): fail(f"JSON root must be an object: {path}")
    return data,value

def parse_colour(value: Any, label: str) -> tuple[int,int,int,int]:
    if not isinstance(value,str) or not HEX_RE.fullmatch(value): fail(f"{label} must use #RRGGBB or #RRGGBBAA")
    rgb=tuple(int(value[index:index+2],16) for index in (1,3,5)); alpha=int(value[7:9],16) if len(value)==9 else 255
    return rgb[0],rgb[1],rgb[2],alpha

def checked_int(value: Any,label: str,minimum: int,maximum: int)->int:
    if not isinstance(value,int) or isinstance(value,bool) or value<minimum or value>maximum: fail(f"{label} must be an integer from {minimum} to {maximum}")
    return value

def checked_id(value: Any,label: str)->str:
    if not isinstance(value,str) or len(value)>96 or not ID_RE.fullmatch(value): fail(f"{label} must be a lowercase kebab/snake identifier")
    return value

def checked_text(value: Any,label: str,minimum: int=1,maximum: int=4096)->str:
    if not isinstance(value,str) or not minimum<=len(value)<=maximum or "\x00" in value: fail(f"{label} must be a bounded text string")
    return value

def next_power_of_two(value:int)->int:
    return 1 if value<=1 else 1<<(value-1).bit_length()

def _pattern(*rows:str)->tuple[str,...]:
    if len(rows)!=7 or any(len(row)!=5 or set(row)-{".","#"} for row in rows): fail("glyph master must contain seven 5-pixel rows")
    return tuple(rows)

GLYPH_MASTER_PATH=Path(__file__).resolve().parents[1]/"config"/"pixel-font-master-5x7.v1.json"

def load_glyph_master()->tuple[dict[str,tuple[str,...]],str]:
    master_bytes,document=read_json(GLYPH_MASTER_PATH,2*1024*1024)
    if document.get("schema")!="evavo.pixel-font-master.v1": fail("unexpected pixel-font glyph master schema")
    glyphs=document.get("glyphs")
    if not isinstance(glyphs,dict) or len(glyphs)<95: fail("pixel-font glyph master is incomplete")
    result={}
    for codepoint_text,rows in glyphs.items():
        if not isinstance(codepoint_text,str) or not codepoint_text.isdigit(): fail("pixel-font glyph master codepoint is invalid")
        codepoint=int(codepoint_text)
        if codepoint<32 or codepoint>0x10FFFF or 0xD800<=codepoint<=0xDFFF: fail("pixel-font glyph master codepoint is out of range")
        if isinstance(rows,str):
            if len(rows)!=35 or set(rows)-{".","#"}: fail("pixel-font compact glyph master rows are invalid")
            rows=[rows[index:index+5] for index in range(0,35,5)]
        if not isinstance(rows,list): fail("pixel-font glyph master rows are invalid")
        char=chr(codepoint)
        if char in result: fail("pixel-font glyph master contains duplicate codepoints")
        result[char]=_pattern(*rows)
    return result,sha256_bytes(master_bytes)

MASTER_5X7,GLYPH_MASTER_SHA256=load_glyph_master()
ASCII_PRINTABLE=[chr(value) for value in range(32,127)]
EXTENDED_TEXT=["£","¢","¥","€","•","—","‘","’","“","”","←","→","↑","↓"]
BOX_DRAWING=["─","│","┌","┐","└","┘","├","┤","┬","┴","┼","═","║","╔","╗","╚","╝"]
BRASS_SYMBOLS=["⚓","⚠","☠","◆","◇","☼","☂","≈","¤"]
GLYPH_SETS={"ascii-printable":ASCII_PRINTABLE,"extended-text":EXTENDED_TEXT,"box-drawing":BOX_DRAWING,"brass-symbols":BRASS_SYMBOLS}

@dataclass(frozen=True)
class Glyph:
    char:str; codepoint:int; pixels:tuple[tuple[int,...],...]; width:int; height:int; xoffset:int; yoffset:int; xadvance:int

@dataclass(frozen=True)
class PackedGlyph:
    glyph:Glyph; x:int; y:int
