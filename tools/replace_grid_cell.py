#!/usr/bin/env python3
"""Replace one cell in a regular raster grid without altering other cells."""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True, type=Path)
    parser.add_argument("--donor", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--columns", required=True, type=int)
    parser.add_argument("--rows", required=True, type=int)
    parser.add_argument("--cell", required=True, type=int, help="zero-based row-major cell index")
    args = parser.parse_args()
    if args.output.exists() or args.output.resolve() in (args.base.resolve(), args.donor.resolve()):
        raise SystemExit("output must be a new path separate from both inputs")
    base = Image.open(args.base).convert("RGBA")
    donor = Image.open(args.donor).convert("RGBA")
    if base.size != donor.size:
        raise SystemExit("base and donor dimensions must match")
    if args.columns < 1 or args.rows < 1 or not 0 <= args.cell < args.columns * args.rows:
        raise SystemExit("invalid grid dimensions or cell index")
    column, row = args.cell % args.columns, args.cell // args.columns
    xs = [round(index * base.width / args.columns) for index in range(args.columns + 1)]
    ys = [round(index * base.height / args.rows) for index in range(args.rows + 1)]
    box = (xs[column], ys[row], xs[column + 1], ys[row + 1])
    base.paste(donor.crop(box), box)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    base.save(args.output, optimize=True)
    print(f"replaced cell {args.cell} ({column},{row}) in {args.output}")


if __name__ == "__main__":
    main()
