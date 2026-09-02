# Local-First Generative Art Stack

Art Studio is the still-image, sprite, reference, edit, repair and frame-production authority in EVAVO's local creative stack. It should not depend on a hosted image provider for capability or policy.

## Production routing

1. **Deterministic tools first where they are superior**: Sharp/Python mastering, masks, alpha recovery, atlas construction, geometry-safe transforms and Godot delivery.
2. **ComfyUI loopback as the common generative runtime**: reviewed API-format workflows, exact node/workflow hashes, immutable references and candidate-only output.
3. **FLUX.2 Klein 4B as the workstation still-image default** once its exact Model Lab artifact and runtime are admitted. Use it for text-to-image, reference-conditioned image creation, controlled edits, plates, sprite concepts and high-quality art candidates.
4. **Qwen Image as a quality challenger**, not an assumed default, until its exact artifact, memory envelope and held-out EVAVO quality evidence are admitted.
5. **Segmentation, matting, pose and restoration specialists** from Model Lab should be composed around generation rather than asking the generator to solve every operation. Current portfolio families include SAM 2.1, BiRefNet, RTMPose and Real-ESRGAN.
6. **Video/temporal work leaves Art Studio** after identity/style/reference preparation and is handed to Video Studio or Cel Animation Studio as appropriate.

## Adult and mature art

The canonical policy is `config/local-creative-content-policy-v1.json`.

EVAVO's local creative policy is not defined by an arbitrary hosted-provider refusal. Mature themes, adult suggestive work, adult non-explicit erotic art and revealing-but-non-explicit adult character designs are valid production intents. The hard boundaries remain age, consent, legality, rights and release approval.

A provider declining a request does not convert that provider's product policy into EVAVO's studio policy. If a local admitted model can perform the permitted job, Art Studio may route locally. The model's licence, exact artifact revision, physical availability and project rights still have to be valid.

## Physical workstation truth

Repository declarations are not proof of installation. Model Lab owns model admission, Local Storage owns model bytes and Local Compute owns hydration/resource admission/execution receipts.

The canonical Windows acceptance route is run from `C:\GitRepos\evavo-local-compute`:

```powershell
.\RUN-EVAVO-ALL-LOCAL-FABRIC-CURRENT.cmd
```

Art Studio should only call a profile physically ready after Local Compute can produce a correlated receipt proving the exact runtime, GPU environment, model artifact and required ComfyUI nodes/workflow.

## Required workstation capabilities

- dedicated loopback-only ComfyUI runtime;
- exact reviewed ComfyUI workflow catalogue;
- CUDA/PyTorch environment admitted by Model Lab/Local Compute;
- FLUX.2 Klein 4B workstation route;
- Real-ESRGAN still/animation upscaling route;
- segmentation, matting and pose utilities where admitted;
- FFmpeg/ffprobe for reference-frame and sequence work;
- Krita/OpenToonz/Blender as deterministic/manual specialist tools;
- enough disk/cache headroom to hydrate one active model family without placing weights in Git.

## Handoff contract

Art Studio outputs immutable candidate/reference identities with hashes, alpha/quality evidence and a declared production purpose. Cel Animation Studio consumes governed model sheets, layouts, backgrounds, key poses and frame references. Video Studio consumes boards, plates, characters, style references, clean alpha elements and first/last-frame references. Neither downstream studio should silently regenerate an identity master.
