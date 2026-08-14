#!/usr/bin/env python3
"""Closed plan and build-evidence admission for HMF atlas-v3 builds."""
from __future__ import annotations
import io,json,os,shutil,stat
from pathlib import Path,PurePosixPath
from typing import Any
from frame_atlas_v3_build_common import *

def admit_plan(v:Any)->dict[str,Any]:
    try: p=json.loads(json.dumps(v,allow_nan=False))
    except (TypeError,ValueError) as e: fail(f"plan must be ordinary JSON: {e}")
    exact(p,PLAN_FIELDS,"plan")
    if p["schema"]!=PLAN_SCHEMA or p["protocolVersion"]!=PROTOCOL or p["projectId"]!=PROJECT or p["publicTitle"]!=TITLE: fail("plan identity drifted")
    frame=p["frameId"]
    if frame not in FRAMES: fail("frameId is not canonical")
    for key in ("registrySha256","layoutSha256","deliveryContractSha256","styleProofExecutionSha256","planSha256"): issha(p[key],key)
    if p["planSha256"]!=bodyhash(p,"planSha256"): fail("planSha256 mismatch")
    exact(p["styleProofApproval"],{"id","actorClass","actorId","occurredAt","evidenceSha256"},"styleProofApproval")
    if p["styleProofApproval"]["id"]!="style-proof-approved" or p["styleProofApproval"]["actorClass"]!="human": fail("style proof lacks named-human approval")
    issha(p["styleProofApproval"]["evidenceSha256"],"styleProofApproval.evidenceSha256")
    master=exact(p["productionMaster"],{"contractId","cell","authoringCell","pivot","columns","rows","atlas","slotsPerFrame","authoredSlotsPerFrame","reservedSlots","canonicalFormat","resampling","runtimeFiltering"},"productionMaster")
    expected={"contractId":"production_master_v3","cell":{"width":160,"height":160},"authoringCell":{"width":640,"height":640},"pivot":{"x":80,"y":152},"columns":16,"rows":16,"atlas":{"width":2560,"height":2560},"slotsPerFrame":256,"authoredSlotsPerFrame":224,"reservedSlots":{"start":224,"end":255,"count":32,"requiredAlpha":"fully-transparent"},"canonicalFormat":"png","resampling":"none","runtimeFiltering":"nearest-neighbour"}
    if master!=expected: fail("production master contract drifted")
    workspace=Path(p["workspaceRoot"]).absolute(); allowed=Path(p["allowedSourceRoot"]).absolute()
    if not workspace.is_absolute() or allowed!=workspace/"masters"/"frames"/frame/"sprites": fail("workspace or allowed source root drifted")
    outputs=exact(p["outputs"],{"image","manifest","receipt","recommendedWorkspaceParent"},"outputs")
    if outputs!={"image":f"{frame}.png","manifest":f"{frame}.atlas-v3.json","receipt":f"{frame}.atlas-v3.receipt.json","recommendedWorkspaceParent":f"exports/runtime/frames/{frame}"}: fail("outputs drifted")
    target=exact(p["gameTarget"],{"repository","technicalId","contractId","imagePath","activationReady","activationBlockers"},"gameTarget")
    if target!={"repository":"EVAVO-STUDIO/steel-dominion","technicalId":"steel-dominion","contractId":"production_master_v3","imagePath":f"res://assets/fighters/final-v3/{frame}.png","activationReady":False,"activationBlockers":BLOCKERS}: fail("gameTarget drifted")
    authority=exact(p["authority"],AUTH_FIELDS,"authority")
    for key in {"sourceRead","workspaceExportWrite","namedHumanApprovalRequired"}: true(authority[key],f"authority.{key}")
    for key in AUTH_FIELDS-{"sourceRead","workspaceExportWrite","namedHumanApprovalRequired"}: false(authority[key],f"authority.{key}")
    true(p["createOnlyOutput"],"createOnlyOutput"); true(p["atomicWorkspacePublication"],"atomicWorkspacePublication")
    if p["reservedSlots"]!=list(range(224,256)): fail("reserved slots drifted")
    sources=p["sources"]
    if type(sources) is not list or len(sources)!=224: fail("plan requires 224 sources")
    by_unit={}
    for slot,s in enumerate(sources):
        exact(s,SOURCE_FIELDS,f"source[{slot}]")
        if (s["slot"],s["row"],s["column"],s["x"],s["y"],s["width"],s["height"])!=(slot,slot//16,slot%16,(slot%16)*160,(slot//16)*160,160,160): fail(f"source slot {slot} geometry drifted")
        for key in ("workOrderSha256","headReceiptSha256","sourceSha256"): issha(s[key],f"source[{slot}].{key}")
        if type(s["sourceBytes"]) is not int or not 0<s["sourceBytes"]<=MAX: fail(f"source[{slot}] byte count invalid")
        rel=PurePosixPath(s["masterRelativePath"])
        if rel.is_absolute() or ".." in rel.parts or Path(s["sourcePath"]).absolute()!=workspace/rel: fail(f"source[{slot}] path substitution")
        if s["unitId"] in by_unit: fail("duplicate source unit")
        by_unit[s["unitId"]]=s
    batches=p["batchEvidence"]
    if type(batches) is not list or len(batches)!=26: fail("plan requires 26 batch evidence records")
    seen={}
    for b in batches:
        exact(b,{"batchId","workOrderBatchSha256","completedUnits","unitReceiptHeads"},"batchEvidence")
        issha(b["workOrderBatchSha256"],"batch work-order SHA")
        heads=b["unitReceiptHeads"]
        if b["completedUnits"]!=len(heads) or not heads: fail("batch completedUnits drifted")
        for h in heads:
            exact(h,{"unitId","headReceiptSha256"},"unitReceiptHead"); issha(h["headReceiptSha256"],"receipt head")
            if h["unitId"] in seen: fail("duplicate batch source unit")
            seen[h["unitId"]]=(b["batchId"],h["headReceiptSha256"])
    if set(seen)!=set(by_unit): fail("batch evidence does not cover 224 sources")
    for unit,s in by_unit.items():
        if seen[unit]!=(s["batchId"],s["headReceiptSha256"]): fail("source receipt evidence disagrees")
    return p

def read_json_private(path:Path,label:str,root:Path)->tuple[dict[str,Any],bytes]:
    data=stable_bytes(path,label,root,MAX,private=True)
    try: return json.loads(data.decode("utf-8")),data
    except (UnicodeDecodeError,json.JSONDecodeError) as e: fail(f"{label} invalid JSON: {e}")

def expected_manifest_body(p:dict[str,Any],image_data:bytes)->dict[str,Any]:
    slots=[{k:s[k] for k in ("slot","row","column","x","y","width","height","bankId","unitId","batchId","workOrderSha256","sourceSha256","headReceiptSha256")} for s in p["sources"]]
    return {"schema":MANIFEST_SCHEMA,"projectId":p["projectId"],"frameId":p["frameId"],"contractId":"production_master_v3","planSha256":p["planSha256"],"image":p["outputs"]["image"],"imageSha256":digest(image_data),"size":{"width":2560,"height":2560},"cell":{"width":160,"height":160},"pivot":{"x":80,"y":152},"columns":16,"rows":16,"authoredSlots":224,"reservedSlots":list(range(224,256)),"reservedSlotsFullyTransparent":True,"slots":slots,"gameTarget":p["gameTarget"],"repositoryMutation":False,"publication":False}

def expected_receipt_body(p:dict[str,Any],image_data:bytes,manifest_data:bytes)->dict[str,Any]:
    return {"schema":RECEIPT_SCHEMA,"projectId":p["projectId"],"frameId":p["frameId"],"contractId":"production_master_v3","planSha256":p["planSha256"],"styleProofExecutionSha256":p["styleProofExecutionSha256"],"styleProofApproval":p["styleProofApproval"],"sourceCount":224,"reservedSlotCount":32,"outputs":{"image":{"path":p["outputs"]["image"],"sha256":digest(image_data),"bytes":len(image_data)},"manifest":{"path":p["outputs"]["manifest"],"sha256":digest(manifest_data),"bytes":len(manifest_data)}},"gameTarget":p["gameTarget"],"gameActivationReady":False,"gameActivationBlockers":p["gameTarget"]["activationBlockers"],"authority":p["authority"],"createOnlyOutput":True,"atomicWorkspacePublication":True,"sourceMutation":False,"targetRepositoryMutation":False,"gitMutation":False,"publication":False}

def verify_output(plan_input:Any,root_input:Path,verify_pixels:bool=True)->dict[str,Any]:
    p=admit_plan(plan_input); workspace=directory(Path(p["workspaceRoot"]),"workspaceRoot")
    parent=directory(workspace/PurePosixPath(p["outputs"]["recommendedWorkspaceParent"]),"export parent",workspace)
    root=directory(Path(root_input),"output root",parent)
    if root.parent!=parent: fail("output root must be direct child of export parent")
    expected={p["outputs"]["image"],p["outputs"]["manifest"],p["outputs"]["receipt"]}
    if {x.name for x in root.iterdir()}!=expected: fail("output directory entries drifted")
    image_data=stable_bytes(root/p["outputs"]["image"],"atlas image",root,128*1024*1024,private=True)
    manifest,mdata=read_json_private(root/p["outputs"]["manifest"],"manifest",root)
    receipt,rdata=read_json_private(root/p["outputs"]["receipt"],"receipt",root)
    exact(manifest,{"schema","projectId","frameId","contractId","planSha256","image","imageSha256","size","cell","pivot","columns","rows","authoredSlots","reservedSlots","reservedSlotsFullyTransparent","slots","gameTarget","repositoryMutation","publication","manifestSha256"},"manifest")
    if manifest["manifestSha256"]!=bodyhash(manifest,"manifestSha256"): fail("manifest self-hash mismatch")
    manifest_body=dict(manifest);manifest_body.pop("manifestSha256")
    if manifest_body!=expected_manifest_body(p,image_data): fail("manifest semantics drifted from admitted plan")
    exact(receipt,{"schema","projectId","frameId","contractId","planSha256","styleProofExecutionSha256","styleProofApproval","sourceCount","reservedSlotCount","outputs","gameTarget","gameActivationReady","gameActivationBlockers","authority","createOnlyOutput","atomicWorkspacePublication","sourceMutation","targetRepositoryMutation","gitMutation","publication","receiptSha256"},"receipt")
    if receipt["receiptSha256"]!=bodyhash(receipt,"receiptSha256"): fail("receipt self-hash mismatch")
    receipt_body=dict(receipt);receipt_body.pop("receiptSha256")
    if receipt_body!=expected_receipt_body(p,image_data,mdata): fail("receipt semantics drifted from admitted plan")
    try: from PIL import Image,ImageChops
    except ImportError as e: fail(f"Pillow required: {e}")
    atlas=Image.open(io.BytesIO(image_data)); atlas.load()
    if atlas.mode!="RGBA" or atlas.size!=ATLAS: fail("atlas geometry or mode drifted")
    if atlas.getchannel("A").crop((0,14*160,2560,2560)).getextrema()!=(0,0): fail("reserved atlas cells are not transparent")
    if verify_pixels:
        allowed=directory(Path(p["allowedSourceRoot"]),"allowedSourceRoot",workspace)
        for s in p["sources"]:
            data=stable_bytes(Path(s["sourcePath"]),f"source {s['slot']}",allowed,MAX)
            if len(data)!=s["sourceBytes"] or digest(data)!=s["sourceSha256"]: fail("source bytes changed after build")
            src=Image.open(io.BytesIO(data)); src.load()
            cell=atlas.crop((s["x"],s["y"],s["x"]+160,s["y"]+160))
            if src.mode!="RGBA" or src.size!=CELL or ImageChops.difference(src,cell).getbbox() is not None: fail(f"atlas cell {s['slot']} differs from source")
            src.close(); cell.close()
    atlas.close()
    return {"schema":VERIFY_SCHEMA,"status":"passed","frameId":p["frameId"],"planSha256":p["planSha256"],"receiptSha256":receipt["receiptSha256"],"imageSha256":digest(image_data),"exactSourcePixelsVerified":verify_pixels,"targetRepositoryMutation":False,"gameActivationReady":False}
def remove_owned(root:Path,device:int,inode:int,expected:set[str])->None:
    try: info=os.lstat(root)
    except FileNotFoundError:return
    if (info.st_dev,info.st_ino)!=(device,inode) or stat.S_ISLNK(info.st_mode): return
    if {x.name for x in root.iterdir()}<=expected: shutil.rmtree(root)
