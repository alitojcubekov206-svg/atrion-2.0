"""
Atrion realistic 3D on Modal: text -> reference picture -> coloured mesh (GLB).

Deploy (once, from the repo root):
    modal secret create atrion-realistic ATRION_SECRET=<long random string>
    modal deploy infra/modal_realistic.py

The web endpoint has two routes:
    POST /jobs        {"prompt": "...", "seed": 123}   Authorization: Bearer <ATRION_SECRET>
                      -> {"id": "fc-..."}               (starts a GPU job, returns at once)
    GET  /jobs/{id}   -> {"status": "running"} | {"status": "done", "glb": b64, "image": b64}
                         | {"status": "error", "error": "..."}
The job id is unguessable, so the browser can poll it directly; only the
server, which holds the secret, can start jobs (and spend credits).

Licences: TRELLIS (MIT) image-large, DINOv2 (Apache-2.0), rembg/u2net
(MIT/Apache-2.0), spconv (Apache-2.0), xformers (BSD), SDXL base 1.0 +
SDXL-Lightning (OpenRAIL++), trimesh (MIT), fast-simplification 0.1.7 (MIT).
TRELLIS's texture bake depends on research-only code (nvdiffrast, the
Gaussian rasteriser); it is never installed here. The mesh decoder's own
vertex colours are used instead, and those imports are stubbed out.
"""

import base64
import io
import os
import time

import modal

APP_NAME = "atrion-realistic"
TRELLIS_COMMIT = "442aa1e1afb9014e80681d3bf604e8d728a86ee7"
MODELS_DIR = "/models"
GPU = "A10G"

models_volume = modal.Volume.from_name("atrion-realistic-models", create_if_missing=True)

gpu_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "libgl1", "libglib2.0-0")
    .pip_install(
        "torch==2.4.0",
        "torchvision==0.19.0",
        "xformers==0.0.27.post2",
        index_url="https://download.pytorch.org/whl/cu121",
    )
    .pip_install(
        "numpy<2",
        "spconv-cu120==2.3.6",
        "easydict",
        "tqdm",
        "pillow",
        "imageio",
        "opencv-python-headless",
        "scipy",
        "rembg==2.0.59",
        "onnxruntime==1.19.2",
        "trimesh==4.4.9",
        "fast-simplification==0.1.7",
        "huggingface_hub==0.25.2",
        "transformers==4.44.2",
        "diffusers==0.30.3",
        "accelerate==0.34.2",
        "safetensors",
        "fastapi[standard]",
    )
    .run_commands(
        f"git clone https://github.com/microsoft/TRELLIS.git /opt/trellis && cd /opt/trellis && git checkout {TRELLIS_COMMIT}"
        " && git submodule update --init --recursive"
    )
    .env(
        {
            "PYTHONPATH": "/opt/trellis",
            "ATTN_BACKEND": "xformers",
            "SPCONV_ALGO": "native",
            "HF_HOME": f"{MODELS_DIR}/hf",
            "TORCH_HOME": f"{MODELS_DIR}/torch",
            "U2NET_HOME": f"{MODELS_DIR}/u2net",
        }
    )
)

web_image = modal.Image.debian_slim(python_version="3.10").pip_install("fastapi[standard]")

app = modal.App(APP_NAME)


def _stub_research_only_modules() -> None:
    """Make `import nvdiffrast` & co. resolve to inert stubs.

    TRELLIS's package __init__ imports its renderers and GLB utilities, which
    pull in research-only libraries. They are never called on the mesh-only
    path, so a stub keeps them out of the image entirely.
    """
    import sys
    import types

    class _Stub(types.ModuleType):
        def __getattr__(self, name):  # noqa: D401 - any attribute is another stub
            if name.startswith("__"):
                raise AttributeError(name)
            child = _Stub(f"{self.__name__}.{name}")
            setattr(self, name, child)
            return child

        def __call__(self, *args, **kwargs):
            raise RuntimeError(f"{self.__name__} is not available in this build")

    for name in [
        "nvdiffrast",
        "nvdiffrast.torch",
        "diff_gaussian_rasterization",
        "diffoctreerast",
        "kaolin",
        "kaolin.utils",
        "kaolin.utils.testing",
        "utils3d",
        "utils3d.torch",
        "plyfile",
        "open3d",
        "xatlas",
        "pyvista",
        "pymeshfix",
        "igraph",
    ]:
        sys.modules.setdefault(name, _Stub(name))
    # FlexiCubes only uses kaolin to validate tensor shapes.
    sys.modules["kaolin.utils.testing"].check_tensor = lambda *args, **kwargs: True


@app.cls(
    image=gpu_image,
    gpu=GPU,
    memory=32768,
    volumes={MODELS_DIR: models_volume},
    timeout=600,
    scaledown_window=60,
    max_containers=2,
)
class Realistic:
    @modal.enter()
    def load(self):
        import torch
        from diffusers import EulerDiscreteScheduler, StableDiffusionXLPipeline, UNet2DConditionModel
        from huggingface_hub import hf_hub_download
        from safetensors.torch import load_file

        _stub_research_only_modules()
        from trellis.pipelines import TrellisImageTo3DPipeline

        started = time.time()
        base = "stabilityai/stable-diffusion-xl-base-1.0"
        unet = UNet2DConditionModel.from_config(base, subfolder="unet").to("cuda", torch.float16)
        unet.load_state_dict(
            load_file(hf_hub_download("ByteDance/SDXL-Lightning", "sdxl_lightning_4step_unet.safetensors"), device="cuda")
        )
        self.painter = StableDiffusionXLPipeline.from_pretrained(
            base, unet=unet, torch_dtype=torch.float16, variant="fp16"
        ).to("cuda")
        self.painter.scheduler = EulerDiscreteScheduler.from_config(
            self.painter.scheduler.config, timestep_spacing="trailing"
        )

        self.trellis = TrellisImageTo3DPipeline.from_pretrained("microsoft/TRELLIS-image-large")
        self.trellis.cuda()
        models_volume.commit()
        print(f"[atrion] models ready in {time.time() - started:.1f}s")

    def _paint(self, prompt: str, seed: int):
        import torch

        styled = (
            f"{prompt}, single subject, full body, whole object fully in frame, centered, "
            "plain white background, 3D render, soft even studio lighting, three-quarter front view"
        )
        generator = torch.Generator("cuda").manual_seed(seed)
        return self.painter(
            styled,
            num_inference_steps=4,
            guidance_scale=0,
            width=1024,
            height=1024,
            generator=generator,
        ).images[0]

    def _mesh(self, picture, seed: int, target_faces: int):
        import numpy as np
        import fast_simplification
        import trimesh
        from scipy.spatial import cKDTree

        outputs = self.trellis.run(
            picture,
            seed=seed,
            formats=["mesh"],
            sparse_structure_sampler_params={"steps": 12, "cfg_strength": 7.5},
            slat_sampler_params={"steps": 12, "cfg_strength": 3},
        )
        mesh = outputs["mesh"][0]
        vertices = mesh.vertices.detach().float().cpu().numpy()
        faces = mesh.faces.detach().cpu().numpy().astype(np.int64)
        colors = mesh.vertex_attrs[:, :3].detach().float().clamp(0, 1).cpu().numpy()

        if len(faces) > target_faces:
            reduction = 1 - target_faces / len(faces)
            points, new_faces = fast_simplification.simplify(vertices, faces, target_reduction=reduction)
            # Simplification drops the colour attribute; take each new vertex's
            # colour from its nearest original vertex.
            _, nearest = cKDTree(vertices).query(points)
            vertices, faces, colors = points, new_faces, colors[nearest]

        # TRELLIS is z-up; glTF is y-up.
        vertices = vertices @ np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], dtype=np.float32)
        out = trimesh.Trimesh(
            vertices=vertices,
            faces=faces,
            vertex_colors=(np.clip(colors, 0, 1) * 255).astype(np.uint8),
            process=False,
        )
        # Drop specks the decoder leaves floating around the object.
        parts = out.split(only_watertight=False)
        if len(parts) > 1:
            biggest = max(len(part.faces) for part in parts)
            out = trimesh.util.concatenate([part for part in parts if len(part.faces) >= biggest * 0.02])
        return out.export(file_type="glb")

    @modal.method()
    def generate(self, prompt: str, seed: int = 0, target_faces: int = 40000) -> dict:
        started = time.time()
        picture = self._paint(prompt, seed)
        painted = time.time()
        glb = self._mesh(picture, seed, target_faces)
        buffer = io.BytesIO()
        picture.convert("RGB").save(buffer, format="JPEG", quality=85)
        print(f"[atrion] paint {painted - started:.1f}s, mesh {time.time() - painted:.1f}s, glb {len(glb)} bytes")
        return {"glb": glb, "image": buffer.getvalue()}


@app.function(image=web_image, secrets=[modal.Secret.from_name("atrion-realistic")], scaledown_window=120)
@modal.asgi_app()
def web():
    import hmac

    from fastapi import FastAPI, Header, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field

    api = FastAPI(title="Atrion realistic 3D")
    # Polling needs no secret (job ids are unguessable); starting a job does.
    api.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])

    class Job(BaseModel):
        prompt: str = Field(min_length=3, max_length=600)
        seed: int = Field(default=0, ge=0, le=2**31 - 1)

    @api.post("/jobs")
    def start(job: Job, authorization: str = Header(default="")):
        secret = os.environ["ATRION_SECRET"]
        if not hmac.compare_digest(authorization, f"Bearer {secret}"):
            raise HTTPException(status_code=401, detail="unauthorized")
        call = Realistic().generate.spawn(job.prompt, job.seed)
        return {"id": call.object_id}

    @api.get("/jobs/{job_id}")
    def poll(job_id: str):
        if not job_id.startswith("fc-") or len(job_id) > 64:
            raise HTTPException(status_code=404, detail="unknown job")
        try:
            call = modal.FunctionCall.from_id(job_id)
            result = call.get(timeout=0)
        except TimeoutError:
            return {"status": "running"}
        except Exception as error:  # the GPU job failed or the id is unknown
            return {"status": "error", "error": str(error)[:300]}
        return {
            "status": "done",
            "glb": base64.b64encode(result["glb"]).decode(),
            "image": base64.b64encode(result["image"]).decode(),
        }

    return api
