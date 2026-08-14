#!/usr/bin/env python3
"""Closed plan, filesystem and evidence contracts for HMF atlas-v3 builds."""
from __future__ import annotations
import ctypes, errno, hashlib, io, json, os, re, shutil, stat
from pathlib import Path, PurePosixPath
from typing import Any

PLAN_SCHEMA="evavo.heavy-metal-fighting-frame-atlas-v3-plan.v1"
MANIFEST_SCHEMA="evavo.heavy-metal-fighting-frame-atlas-v3-manifest.v1"
RECEIPT_SCHEMA="evavo.heavy-metal-fighting-frame-atlas-v3-build-receipt.v1"
VERIFY_SCHEMA="evavo.heavy-metal-fighting-frame-atlas-v3-build-verification.v1"
PROTOCOL="2026-08-12.1"; PROJECT="heavy-metal-fighting"; TITLE="HEAVY METAL FIGHTING"
FRAMES={"bastion","viper","citadel","mirage"}; SHA=re.compile(r"^[0-9a-f]{64}$")
CELL=(160,160); ATLAS=(2560,2560); AUTHORED=224; TOTAL=256; COLS=16; MAX=16*1024*1024
PLAN_FIELDS={"schema","protocolVersion","projectId","publicTitle","frameId","compiledAt","registrySha256","layoutSha256","deliveryContractSha256","styleProofExecutionSha256","styleProofApproval","workspaceRoot","allowedSourceRoot","productionMaster","sources","reservedSlots","batchEvidence","outputs","gameTarget","authority","createOnlyOutput","atomicWorkspacePublication","planSha256"}
SOURCE_FIELDS={"slot","row","column","x","y","width","height","bankId","productionGroup","unitId","batchId","workOrderSha256","headReceiptSha256","masterRelativePath","sourcePath","sourceBytes","sourceSha256"}
AUTH_FIELDS={"sourceRead","workspaceExportWrite","sourceMutation","candidateApproval","candidatePromotion","targetRepositoryMutation","gitMutation","deployment","publication","forcePush","namedHumanApprovalRequired"}
BLOCKERS=["focused-godot-atlas-v3-validation","runtime-cutover-validation","explicit-game-repository-delivery-authorization"]

class BuildError(ValueError): pass
def fail(msg:str)->None: raise BuildError(f"HEAVY_METAL_FIGHTING_FRAME_ATLAS_V3_BUILD_INVALID: {msg}")
def canon(v:Any)->bytes: return (json.dumps(v,sort_keys=True,indent=2,ensure_ascii=False,separators=(",",": "))+"\n").encode()
def digest(data:bytes)->str: return hashlib.sha256(data).hexdigest()
def selfhash(body:dict[str,Any],field:str)->dict[str,Any]: return {**body,field:digest(canon(body))}
def bodyhash(doc:dict[str,Any],field:str)->str:
    body=dict(doc); body.pop(field,None); return digest(canon(body))
def exact(v:Any,keys:set[str],label:str)->dict[str,Any]:
    if type(v) is not dict or set(v)!=keys: fail(f"{label} fields must be exactly: {', '.join(sorted(keys))}")
    return v
def issha(v:Any,label:str)->str:
    if type(v) is not str or not SHA.fullmatch(v): fail(f"{label} must be SHA-256")
    return v
def false(v:Any,label:str)->None:
    if v is not False: fail(f"{label} must remain false")
def true(v:Any,label:str)->None:
    if v is not True: fail(f"{label} must be true")
def path_inside(path:Path,root:Path,label:str)->None:
    try: path.relative_to(root)
    except ValueError: fail(f"{label} escaped {root}")
def safe_chain(path:Path,root:Path,label:str)->None:
    root=root.absolute(); path=path.absolute(); path_inside(path,root,label)
    for node in [root,*list(path.relative_to(root).parents)[::-1],path]:
        candidate=root if node==root else root/node
        try: info=os.lstat(candidate)
        except FileNotFoundError: continue
        if stat.S_ISLNK(info.st_mode) or (hasattr(candidate,"is_junction") and candidate.is_junction()): fail(f"{label} contains symbolic link or junction: {candidate}")
def directory(path:Path,label:str,root:Path|None=None)->Path:
    path=path.absolute(); root=root.absolute() if root else path
    safe_chain(path,root,label)
    try: info=os.lstat(path)
    except FileNotFoundError: fail(f"{label} does not exist: {path}")
    if not stat.S_ISDIR(info.st_mode): fail(f"{label} must be a directory")
    return path.resolve(strict=True)
def stable_bytes(path:Path,label:str,root:Path,max_bytes:int=MAX,private:bool=False)->bytes:
    path=path.absolute(); safe_chain(path,root,label)
    flags=os.O_RDONLY|getattr(os,"O_BINARY",0)|getattr(os,"O_NOFOLLOW",0)
    fd=os.open(path,flags)
    try:
        before=os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink!=1: fail(f"{label} must be one regular file link")
        if before.st_size>max_bytes: fail(f"{label} exceeds byte limit")
        if private and os.name!="nt" and stat.S_IMODE(before.st_mode)&0o077: fail(f"{label} must be private")
        parts=[];total=0
        while total<=max_bytes:
            chunk=os.read(fd,min(1024*1024,max_bytes+1-total))
            if not chunk: break
            parts.append(chunk);total+=len(chunk)
        if total>max_bytes: fail(f"{label} exceeds byte limit")
        after=os.fstat(fd)
        if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns): fail(f"{label} changed while read")
        return b"".join(parts)
    finally: os.close(fd)
def read_plan(path:Path)->dict[str,Any]:
    path=path.absolute(); data=stable_bytes(path,"plan",path.parent,MAX)
    if data.startswith(b"\xef\xbb\xbf"): fail("plan may not contain UTF-8 BOM")
    try: return admit_plan(json.loads(data.decode("utf-8")))
    except (UnicodeDecodeError,json.JSONDecodeError) as e: fail(f"plan is invalid UTF-8 JSON: {e}")
def write_private(path:Path,data:bytes)->None:
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,"O_BINARY",0),0o600)
    try:
        if hasattr(os,"fchmod"): os.fchmod(fd,0o600)
        view=memoryview(data)
        while view: view=view[os.write(fd,view):]
        os.fsync(fd)
    finally: os.close(fd)
def fsync_dir(path:Path)->None:
    if os.name=="nt": return
    fd=os.open(path,os.O_RDONLY|getattr(os,"O_DIRECTORY",0))
    try: os.fsync(fd)
    finally: os.close(fd)
def rename_noreplace(src:Path,dst:Path)->None:
    if os.name=="nt":
        kernel32=ctypes.WinDLL("kernel32",use_last_error=True)
        move=kernel32.MoveFileExW; move.argtypes=[ctypes.c_wchar_p,ctypes.c_wchar_p,ctypes.c_uint32]; move.restype=ctypes.c_int
        ctypes.set_last_error(0)
        if move(str(src),str(dst),0): return
        code=ctypes.get_last_error()
        if code in {80,183}: raise FileExistsError(str(dst))
        raise ctypes.WinError(code)
    if sys_platform()=="linux":
        libc=ctypes.CDLL(None,use_errno=True)
        try: fn=libc.renameat2
        except AttributeError: fail("Linux libc lacks atomic no-replace renameat2")
        fn.argtypes=[ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_char_p,ctypes.c_uint]; fn.restype=ctypes.c_int
        if fn(-100,os.fsencode(src),-100,os.fsencode(dst),1)==0:return
        code=ctypes.get_errno()
        if code==errno.EEXIST: raise FileExistsError(str(dst))
        raise OSError(code,os.strerror(code),str(dst))
    if sys_platform()=="darwin":
        libc=ctypes.CDLL(None,use_errno=True)
        try: fn=libc.renamex_np
        except AttributeError: fail("Darwin libc lacks atomic no-replace renamex_np")
        fn.argtypes=[ctypes.c_char_p,ctypes.c_char_p,ctypes.c_uint]; fn.restype=ctypes.c_int
        if fn(os.fsencode(src),os.fsencode(dst),4)==0:return
        code=ctypes.get_errno()
        if code==errno.EEXIST: raise FileExistsError(str(dst))
        raise OSError(code,os.strerror(code),str(dst))
    fail("platform lacks atomic no-replace directory rename")
def sys_platform()->str:
    import sys; return sys.platform
