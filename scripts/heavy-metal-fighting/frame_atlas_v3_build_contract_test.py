#!/usr/bin/env python3
from __future__ import annotations
import copy,json,os,shutil,stat,struct,sys,tempfile,unittest,zlib
from pathlib import Path
HERE=Path(__file__).resolve().parent; ROOT=HERE.parents[1]; sys.path.insert(0,str(ROOT/"tools"))
from frame_atlas_v3_build_common import BuildError,rename_noreplace,canon,digest,selfhash
from frame_atlas_v3_build_contract import admit_plan,read_plan,verify_output
from build_heavy_metal_fighting_frame_atlas_v3 import execute
try:
 import PIL
except ModuleNotFoundError:
 PIL=None

def png_bytes(slot:int)->bytes:
 width=height=160
 red=(slot*17)%256;green=(slot*31)%256;blue=(slot*47)%256
 raw=bytearray()
 for y in range(height):
  raw.append(0)
  row=bytearray(width*4)
  if y==80:
   offset=80*4;row[offset:offset+4]=bytes((red,green,blue,255))
  raw.extend(row)
 def chunk(kind:bytes,data:bytes)->bytes:
  payload=kind+data
  return struct.pack(">I",len(data))+payload+struct.pack(">I",zlib.crc32(payload)&0xffffffff)
 ihdr=struct.pack(">IIBBBBB",width,height,8,6,0,0,0)
 return b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",ihdr)+chunk(b"IDAT",zlib.compress(bytes(raw),9))+chunk(b"IEND",b"")

class AtlasBuildBoundaryTest(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.tmp=Path(tempfile.mkdtemp(prefix="hmf-atlas-build-")); cls.ws=cls.tmp/"workspace"; cls.src=cls.ws/"masters/frames/bastion/sprites"; cls.parent=cls.ws/"exports/runtime/frames/bastion"
  cls.src.mkdir(parents=True);cls.parent.mkdir(parents=True)
  sources=[]
  for slot in range(224):
   name=f"bastion-bank-{slot//16:02d}-c{slot:03d}.png"; path=cls.src/name;data=png_bytes(slot);path.write_bytes(data); batch=slot//9 if slot<144 else 16+(slot-144)//8; bid=f"hmf-b{batch+1:04d}"
   sources.append({"slot":slot,"row":slot//16,"column":slot%16,"x":slot%16*160,"y":slot//16*160,"width":160,"height":160,"bankId":f"bank-{slot//16:02d}","productionGroup":"frame-body","unitId":f"hmf.frame-animation.bastion.slot-{slot:03d}","batchId":bid,"workOrderSha256":digest(f"order-{slot}".encode()),"headReceiptSha256":digest(f"receipt-{slot}".encode()),"masterRelativePath":f"masters/frames/bastion/sprites/{name}","sourcePath":str(path.absolute()),"sourceBytes":len(data),"sourceSha256":digest(data)})
  batches=[]
  for i in range(26):
   bid=f"hmf-b{i+1:04d}"; own=[s for s in sources if s["batchId"]==bid]
   batches.append({"batchId":bid,"workOrderBatchSha256":digest(f"batch-{bid}".encode()),"completedUnits":len(own),"unitReceiptHeads":[{"unitId":s["unitId"],"headReceiptSha256":s["headReceiptSha256"]} for s in own]})
  authority={"sourceRead":True,"workspaceExportWrite":True,"sourceMutation":False,"candidateApproval":False,"candidatePromotion":False,"targetRepositoryMutation":False,"gitMutation":False,"deployment":False,"publication":False,"forcePush":False,"namedHumanApprovalRequired":True}
  body={"schema":"evavo.heavy-metal-fighting-frame-atlas-v3-plan.v1","protocolVersion":"2026-08-12.1","projectId":"heavy-metal-fighting","publicTitle":"HEAVY METAL FIGHTING","frameId":"bastion","compiledAt":"2026-08-14T10:00:00.000Z","registrySha256":"1"*64,"layoutSha256":"2"*64,"deliveryContractSha256":"3"*64,"styleProofExecutionSha256":"4"*64,"styleProofApproval":{"id":"style-proof-approved","actorClass":"human","actorId":"greg-parker","occurredAt":"2026-08-14T09:59:00.000Z","evidenceSha256":"5"*64},"workspaceRoot":str(cls.ws.absolute()),"allowedSourceRoot":str(cls.src.absolute()),"productionMaster":{"contractId":"production_master_v3","cell":{"width":160,"height":160},"authoringCell":{"width":640,"height":640},"pivot":{"x":80,"y":152},"columns":16,"rows":16,"atlas":{"width":2560,"height":2560},"slotsPerFrame":256,"authoredSlotsPerFrame":224,"reservedSlots":{"start":224,"end":255,"count":32,"requiredAlpha":"fully-transparent"},"canonicalFormat":"png","resampling":"none","runtimeFiltering":"nearest-neighbour"},"sources":sources,"reservedSlots":list(range(224,256)),"batchEvidence":batches,"outputs":{"image":"bastion.png","manifest":"bastion.atlas-v3.json","receipt":"bastion.atlas-v3.receipt.json","recommendedWorkspaceParent":"exports/runtime/frames/bastion"},"gameTarget":{"repository":"EVAVO-STUDIO/steel-dominion","technicalId":"steel-dominion","contractId":"production_master_v3","imagePath":"res://assets/fighters/final-v3/bastion.png","activationReady":False,"activationBlockers":["focused-godot-atlas-v3-validation","runtime-cutover-validation","explicit-game-repository-delivery-authorization"]},"authority":authority,"createOnlyOutput":True,"atomicWorkspacePublication":True}
  cls.plan=selfhash(body,"planSha256")
 @classmethod
 def tearDownClass(cls): shutil.rmtree(cls.tmp,ignore_errors=True)
 def rehash(self,p):
  p=copy.deepcopy(p);p.pop("planSha256",None);return selfhash(p,"planSha256")
 def test_exact_plan_admits(self): self.assertEqual(len(admit_plan(self.plan)["sources"]),224)
 def test_rehashed_unknown_plan_claim_fails(self):
  p=copy.deepcopy(self.plan);p["targetRepositoryWriteAuthorized"]=True
  with self.assertRaisesRegex(BuildError,"fields must be exactly"):admit_plan(self.rehash(p))
 def test_rehashed_source_path_substitution_fails(self):
  p=copy.deepcopy(self.plan); alt=self.src/"alternate.png";alt.write_bytes(Path(p["sources"][0]["sourcePath"]).read_bytes());p["sources"][0]["sourcePath"]=str(alt)
  with self.assertRaisesRegex(BuildError,"path substitution"):admit_plan(self.rehash(p))
 def test_rehashed_batch_receipt_disagreement_fails(self):
  p=copy.deepcopy(self.plan);p["batchEvidence"][0]["unitReceiptHeads"][0]["headReceiptSha256"]="f"*64
  with self.assertRaisesRegex(BuildError,"receipt evidence disagrees"):admit_plan(self.rehash(p))
 def test_plan_file_rejects_bom(self):
  f=self.tmp/"bom.json";f.write_bytes(b"\xef\xbb\xbf"+canon(self.plan))
  with self.assertRaisesRegex(BuildError,"BOM"):read_plan(f)
 def test_atomic_no_replace_preserves_destination(self):
  s=self.tmp/"stage";d=self.tmp/"destination";s.mkdir();d.mkdir();(d/"marker").write_text("keep")
  with self.assertRaises(FileExistsError):rename_noreplace(s,d)
  self.assertTrue(s.is_dir());self.assertEqual((d/"marker").read_text(),"keep")
 @unittest.skipIf(PIL is None,"Pillow unavailable")
 def test_build_and_independent_pixel_verification(self):
  out=self.parent/"atlas-v3-001";r=execute(self.plan,out);self.assertEqual(r["sourceCount"],224);self.assertFalse(r["gameActivationReady"])
  v=verify_output(self.plan,out,True);self.assertEqual(v["status"],"passed");self.assertTrue(v["exactSourcePixelsVerified"])
  if os.name!="nt":
   self.assertEqual(stat.S_IMODE(out.stat().st_mode),0o700)
   self.assertTrue(all(stat.S_IMODE(p.stat().st_mode)==0o600 for p in out.iterdir()))
  original=(out/"bastion.atlas-v3.receipt.json").read_bytes()
  with self.assertRaisesRegex(BuildError,"must not already exist"):execute(self.plan,out)
  self.assertEqual((out/"bastion.atlas-v3.receipt.json").read_bytes(),original)
  receipt=json.loads(original);receipt["publication"]=True;receipt["receiptSha256"]=digest(canon({k:v for k,v in receipt.items() if k!="receiptSha256"}));rp=out/"bastion.atlas-v3.receipt.json";rp.write_bytes(canon(receipt));os.chmod(rp,0o600)
  with self.assertRaisesRegex(BuildError,"publication must remain false"):verify_output(self.plan,out,False)
if __name__=="__main__":unittest.main()
