#!/usr/bin/env python3
"""Build and independently verify one HMF production-master-v3 Frame atlas."""
from __future__ import annotations
import argparse, io, json, os, sys, tempfile
from pathlib import Path, PurePosixPath
ROOT=Path(__file__).resolve().parents[1]; MOD=ROOT/"scripts"/"heavy-metal-fighting"; sys.path.insert(0,str(MOD))
from frame_atlas_v3_build_contract import (ATLAS,CELL,AUTHORED,MANIFEST_SCHEMA,RECEIPT_SCHEMA,admit_plan,canon,digest,directory,fail,fsync_dir,read_plan,remove_owned,rename_noreplace,selfhash,stable_bytes,verify_output,write_private)

def source_image(s,allowed):
    from PIL import Image
    data=stable_bytes(Path(s["sourcePath"]),f"source {s['slot']}",allowed)
    if len(data)!=s["sourceBytes"] or digest(data)!=s["sourceSha256"]: fail(f"source {s['slot']} bytes changed")
    image=Image.open(io.BytesIO(data)); image.load()
    if image.mode!="RGBA" or image.size!=CELL: fail(f"source {s['slot']} must be 160x160 RGBA")
    if any(image.getpixel(p)[3] for p in ((0,0),(159,0),(0,159),(159,159))): fail(f"source {s['slot']} corners must be transparent")
    return image

def manifest(plan,image_sha):
    slots=[{k:s[k] for k in ("slot","row","column","x","y","width","height","bankId","unitId","batchId","workOrderSha256","sourceSha256","headReceiptSha256")} for s in plan["sources"]]
    return selfhash({"schema":MANIFEST_SCHEMA,"projectId":plan["projectId"],"frameId":plan["frameId"],"contractId":"production_master_v3","planSha256":plan["planSha256"],"image":plan["outputs"]["image"],"imageSha256":image_sha,"size":{"width":2560,"height":2560},"cell":{"width":160,"height":160},"pivot":{"x":80,"y":152},"columns":16,"rows":16,"authoredSlots":224,"reservedSlots":list(range(224,256)),"reservedSlotsFullyTransparent":True,"slots":slots,"gameTarget":plan["gameTarget"],"repositoryMutation":False,"publication":False},"manifestSha256")
def receipt(plan,image_data,manifest_data):
    return selfhash({"schema":RECEIPT_SCHEMA,"projectId":plan["projectId"],"frameId":plan["frameId"],"contractId":"production_master_v3","planSha256":plan["planSha256"],"styleProofExecutionSha256":plan["styleProofExecutionSha256"],"styleProofApproval":plan["styleProofApproval"],"sourceCount":AUTHORED,"reservedSlotCount":32,"outputs":{"image":{"path":plan["outputs"]["image"],"sha256":digest(image_data),"bytes":len(image_data)},"manifest":{"path":plan["outputs"]["manifest"],"sha256":digest(manifest_data),"bytes":len(manifest_data)}},"gameTarget":plan["gameTarget"],"gameActivationReady":False,"gameActivationBlockers":plan["gameTarget"]["activationBlockers"],"authority":plan["authority"],"createOnlyOutput":True,"atomicWorkspacePublication":True,"sourceMutation":False,"targetRepositoryMutation":False,"gitMutation":False,"publication":False},"receiptSha256")
def save_png(path,image):
    flags=os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,"O_BINARY",0); fd=os.open(path,flags,0o600)
    try:
        if hasattr(os,"fchmod"):os.fchmod(fd,0o600)
        with os.fdopen(fd,"wb",closefd=False) as f: image.save(f,format="PNG",optimize=True,compress_level=9); f.flush(); os.fsync(f.fileno())
    finally:os.close(fd)
    return stable_bytes(path,"staged atlas",path.parent,128*1024*1024,private=True)
def execute(plan_input,output_input):
    from PIL import Image
    plan=admit_plan(plan_input); workspace=directory(Path(plan["workspaceRoot"]),"workspaceRoot")
    allowed=directory(Path(plan["allowedSourceRoot"]),"allowedSourceRoot",workspace)
    parent=directory(workspace/PurePosixPath(plan["outputs"]["recommendedWorkspaceParent"]),"export parent",workspace)
    output=Path(output_input).absolute()
    if output.parent!=parent or not output.name or any(not(c.isalnum() or c in "._-") for c in output.name): fail("output root must be portable direct child of export parent")
    if os.path.lexists(output): fail("output root must not already exist")
    stage=Path(tempfile.mkdtemp(prefix=f".{output.name}.stage-",dir=parent)); os.chmod(stage,0o700); info=os.lstat(stage); expected=set(plan["outputs"].values())-{plan["outputs"]["recommendedWorkspaceParent"]}
    published=False
    try:
        atlas=Image.new("RGBA",ATLAS,(0,0,0,0))
        for s in plan["sources"]:
            image=source_image(s,allowed)
            try: atlas.alpha_composite(image,dest=(s["x"],s["y"]))
            finally:image.close()
        image_data=save_png(stage/plan["outputs"]["image"],atlas); atlas.close()
        man=manifest(plan,digest(image_data)); mdata=canon(man); write_private(stage/plan["outputs"]["manifest"],mdata)
        rec=receipt(plan,image_data,mdata); write_private(stage/plan["outputs"]["receipt"],canon(rec)); fsync_dir(stage)
        verify_output(plan,stage,True)
        try: rename_noreplace(stage,output)
        except FileExistsError: fail("output root appeared during publication and was preserved")
        published=True; fsync_dir(parent)
        final=os.lstat(output)
        if (final.st_dev,final.st_ino)!=(info.st_dev,info.st_ino): fail("published directory identity changed")
        check=verify_output(plan,output,True)
        if check["receiptSha256"]!=rec["receiptSha256"]: fail("published receipt disagrees with verifier")
        return rec
    except Exception:
        if published: remove_owned(output,info.st_dev,info.st_ino,expected)
        raise
    finally:
        if not published: remove_owned(stage,info.st_dev,info.st_ino,expected)
def main():
    p=argparse.ArgumentParser(); p.add_argument("--plan",type=Path,required=True); p.add_argument("--output-root",type=Path,required=True); a=p.parse_args()
    try: r=execute(read_plan(a.plan),a.output_root)
    except (OSError,ValueError,json.JSONDecodeError) as e: print(f"HEAVY METAL FIGHTING Frame atlas-v3 build failed: {e}",file=sys.stderr); return 2
    print(json.dumps({"status":"passed","frameId":r["frameId"],"sourceCount":r["sourceCount"],"receiptSha256":r["receiptSha256"],"verified":True,"gameActivationReady":False,"targetRepositoryMutation":False},sort_keys=True)); return 0
if __name__=="__main__": raise SystemExit(main())
