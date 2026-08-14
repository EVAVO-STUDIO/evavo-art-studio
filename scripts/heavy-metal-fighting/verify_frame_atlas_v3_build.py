#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,os
from pathlib import Path
from frame_atlas_v3_build_contract import read_plan,verify_output

def main():
    p=argparse.ArgumentParser();p.add_argument("--plan",type=Path,required=True);p.add_argument("--output-root",type=Path,required=True);p.add_argument("--skip-source-pixel-recheck",action="store_true");a=p.parse_args()
    try:r=verify_output(read_plan(a.plan),a.output_root,not a.skip_source_pixel_recheck)
    except (OSError,ValueError,json.JSONDecodeError) as e:print(f"HEAVY METAL FIGHTING Frame atlas-v3 verification failed: {e}",file=os.sys.stderr);return 2
    print(json.dumps(r,indent=2,sort_keys=True));return 0
if __name__=="__main__":raise SystemExit(main())
