#!/usr/bin/env python3
"""Uniformly scale each sprite subject around its bottom-centre anchor."""

from __future__ import annotations

import argparse, hashlib, json
from pathlib import Path
from PIL import Image

from sprite_sheet_safe_margin import foreground_mask, matte_colour, remove_edge_dividers


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalize(source: Path, output: Path, columns: int, rows: int, factor: float, gutter: int, threshold: int) -> dict:
    if not 0.1 <= factor <= 1.0:
        raise ValueError("factor must be between 0.1 and 1.0; enlargement is forbidden")
    image = Image.open(source).convert("RGB")
    if image.width % columns or image.height % rows:
        raise RuntimeError("sheet dimensions must divide evenly into the declared grid")
    cw, ch = image.width // columns, image.height // rows
    result, records = image.copy(), []
    for row in range(rows):
        for column in range(columns):
            outer = (column*cw, row*ch, (column+1)*cw, (row+1)*ch)
            cell = image.crop(outer)
            matte = matte_colour(cell)
            alpha, removed_dividers = remove_edge_dividers(foreground_mask(cell, matte, threshold), gutter)
            bbox = alpha.getbbox()
            if bbox is None: raise RuntimeError(f"cell {row},{column} has no subject")
            actor = cell.crop(bbox).convert("RGBA"); actor.putalpha(alpha.crop(bbox))
            scaled = actor.resize((round(actor.width*factor), round(actor.height*factor)), Image.Resampling.LANCZOS)
            clean = Image.new("RGB", cell.size, matte)
            x = round((bbox[0]+bbox[2])/2 - scaled.width/2)
            y = bbox[3] - scaled.height
            clean.paste(scaled.convert("RGB"), (x,y), scaled.getchannel("A"))
            result.paste(clean,outer[:2])
            records.append({"row":row,"column":column,"before_bbox":list(bbox),"after_bbox":[x,y,x+scaled.width,y+scaled.height],"factor":factor,"anchor":"bottom_centre","matte_rgb":list(matte),"removed_edge_divider_px":removed_dividers})
    output.parent.mkdir(parents=True,exist_ok=True); result.save(output)
    report={"schema":"evavo.sprite-sheet-subject-scale.v2","source":str(source),"source_sha256":digest(source),"output":str(output),"output_sha256":digest(output),"grid":[columns,rows],"factor":factor,"maximum_detected_divider_width_px":gutter,"foreground_difference_threshold":threshold,"operation":"uniform_full_cell_subject_scale_bottom_centre_no_redraw_no_mirror","cells":records}
    output.with_suffix(output.suffix+".subject-scale.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    return report


def main() -> None:
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--input",required=True,type=Path);p.add_argument("--output",required=True,type=Path);p.add_argument("--columns",required=True,type=int);p.add_argument("--rows",required=True,type=int);p.add_argument("--factor",required=True,type=float);p.add_argument("--gutter",type=int,default=6);p.add_argument("--threshold",type=int,default=30);a=p.parse_args()
    report=normalize(a.input,a.output,a.columns,a.rows,a.factor,a.gutter,a.threshold)
    print(f"SPRITE_SHEET_SUBJECT_SCALE_OK {len(report['cells'])} CELLS FACTOR {a.factor:.6f} {report['output']}")


if __name__ == "__main__": main()
