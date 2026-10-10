"""
Atrion realistic 3D on Modal: text -> reference picture -> coloured mesh (GLB).

Deploy (once, from the repo root):
    modal secret create atrion-realistic ATRION_SECRET=<long random string>
    modal deploy infra/modal_realistic.py

The web endpoint has two routes:
    POST /jobs        {"prompt": "...", "seed": 123, "mode": "figure"|"object"}
                      Authorization: Bearer <ATRION_SECRET>
                      -> {"id": "fc-..."}               (starts a GPU job, returns at once)
    GET  /jobs/{id}   -> {"status": "running"} | {"status": "done", "glb": b64, "image": b64}
                         | {"status": "error", "error": "..."}
The job id is unguessable, so the browser can poll it directly; only the
server, which holds the secret, can start jobs (and spend credits).

Licences: TRELLIS (MIT) image-large, DINOv2 (Apache-2.0), rembg/u2net
(MIT/Apache-2.0), spconv (Apache-2.0), xformers (BSD), SDXL base 1.0 +
SDXL-Lightning (OpenRAIL++), trimesh (MIT), fast-simplification 0.1.7 (MIT),
xatlas (MIT), OpenCV (Apache-2.0).
TRELLIS's texture bake depends on research-only code (nvdiffrast, the
Gaussian rasteriser); it is never installed here and those imports are
stubbed out. Instead the reference picture is projected onto the side it
shows, and the mesh decoder's own colours, matched to the picture, paint
the rest.
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
        "xatlas==0.0.9",
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

    def _paint(self, prompt: str, seed: int, mode: str):
        import torch

        if mode == "figure":
            # A reference for a 3D figure: facing forward, nothing hidden. A
            # mid-step pose hides a leg behind the other and the model loses it.
            styled = (
                f"{prompt}, full body, standing straight in a relaxed A-pose, facing the viewer, "
                "front view, symmetrical, both legs fully visible and slightly apart, arms held away "
                "from the body, entire figure in frame, centered, plain white background, 3D render, "
                "soft even studio lighting, sharp detailed face"
            )
        else:
            styled = (
                f"{prompt}, single subject, whole object fully in frame, centered, "
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

    @staticmethod
    def _front_texture(vertices, faces, colors, front, size: int = 1024):
        """Bake a texture: the front reference projected where the surface faces
        the viewer and is not hidden, the model's own colours everywhere else.

        Vertex colours alone give a figure only a few vertices per eye, which
        is where the uncanny, smeared face came from. TRELLIS's own texture
        bake is research-only, so this does the projection with permissive
        tools (xatlas for the UV layout, OpenCV for rasterising).
        """
        import cv2
        import numpy as np
        import trimesh
        import xatlas
        from scipy.spatial import cKDTree

        normals = trimesh.Trimesh(vertices=vertices, faces=faces, process=False).vertex_normals
        vmap, tris, uvs = xatlas.parametrize(vertices.astype(np.float32), faces.astype(np.uint32))
        pos = vertices[vmap]
        nor = normals[vmap]
        col = colors[vmap]

        # Which triangle covers each texel (row 0 = top of the image, v = 1).
        pix = np.stack([uvs[:, 0] * size, (1 - uvs[:, 1]) * size], axis=-1)
        ids = np.full((size, size), -1, dtype=np.int32)
        corners = np.round(pix[tris] * 16).astype(np.int32)
        for index, corner in enumerate(corners):
            cv2.fillConvexPoly(ids, corner, int(index), lineType=cv2.LINE_8, shift=4)
        ys, xs = np.nonzero(ids >= 0)
        tri = ids[ys, xs]

        # Barycentric weights of each texel centre inside its triangle.
        a, b, c = pix[tris[tri, 0]], pix[tris[tri, 1]], pix[tris[tri, 2]]
        p = np.stack([xs + 0.5, ys + 0.5], axis=-1)
        v0, v1, v2 = b - a, c - a, p - a
        d00 = (v0 * v0).sum(-1)
        d01 = (v0 * v1).sum(-1)
        d11 = (v1 * v1).sum(-1)
        d20 = (v2 * v0).sum(-1)
        d21 = (v2 * v1).sum(-1)
        denom = np.where(np.abs(d00 * d11 - d01 * d01) < 1e-12, 1e-12, d00 * d11 - d01 * d01)
        wb = (d11 * d20 - d01 * d21) / denom
        wc = (d00 * d21 - d01 * d20) / denom
        w = np.clip(np.stack([1 - wb - wc, wb, wc], axis=-1), 0, 1)
        w /= np.maximum(w.sum(-1, keepdims=True), 1e-8)

        def interp(attr):
            return (
                attr[tris[tri, 0]] * w[:, :1] + attr[tris[tri, 1]] * w[:, 1:2] + attr[tris[tri, 2]] * w[:, 2:3]
            )

        tpos = interp(pos)
        tnor = interp(nor)
        tnor /= np.maximum(np.linalg.norm(tnor, axis=-1, keepdims=True), 1e-8)
        tcol = interp(col)

        # Line the reference silhouette up with the model seen from the front (+z).
        rgba = np.asarray(front.convert("RGBA")).astype(np.float32) / 255
        alpha = rgba[..., 3] > 0.5
        rows, cols = np.nonzero(alpha)
        if len(rows) < 100:
            return tcol, (xs, ys), (vmap, tris, uvs)
        ix0, ix1, iy0, iy1 = cols.min(), cols.max(), rows.min(), rows.max()
        mx0, my0 = vertices[:, 0].min(), vertices[:, 1].min()
        mx1, my1 = vertices[:, 0].max(), vertices[:, 1].max()
        u = ix0 + (tpos[:, 0] - mx0) / max(mx1 - mx0, 1e-6) * (ix1 - ix0)
        v = iy1 - (tpos[:, 1] - my0) / max(my1 - my0, 1e-6) * (iy1 - iy0)
        # Bilinear lookup (cv2.remap caps maps at 32767 entries; a texture has far more).
        h, w = rgba.shape[:2]
        u = np.clip(u, 0, w - 1.001)
        v = np.clip(v, 0, h - 1.001)
        x0 = np.floor(u).astype(np.int64)
        y0 = np.floor(v).astype(np.int64)
        fx = (u - x0)[:, None]
        fy = (v - y0)[:, None]
        sample = (rgba[y0, x0] * (1 - fx) + rgba[y0, x0 + 1] * fx) * (1 - fy) + (
            rgba[y0 + 1, x0] * (1 - fx) + rgba[y0 + 1, x0 + 1] * fx
        ) * fy

        # Visible from the front: no vertex nearby in x/y sits in front of it.
        extent = float(np.ptp(vertices, axis=0).max())
        _, near = cKDTree(vertices[:, :2]).query(tpos[:, :2], k=12)
        front_z = vertices[near, 2].max(axis=1)
        visible = tpos[:, 2] >= front_z - extent * 0.015
        facing = np.clip((tnor[:, 2] - 0.15) / 0.45, 0, 1)
        weight = (facing * visible * sample[:, 3])[:, None]

        # The model's own colours paint what the picture does not show, but
        # they come out darker than the picture, and darker still on the side
        # it never saw (a silver knight got a charcoal back). A plain gain
        # fitted where both are known fixes the cast without stretching the
        # contrast (a gamma fit turned shadows black); then the hidden side
        # is lifted, never darkened, towards the picture's brightness.
        sure = weight[:, 0] > 0.7
        if sure.sum() > 500:
            gain = np.clip(sample[sure, :3].mean(0) / np.maximum(tcol[sure].mean(0), 1e-3), 0.7, 1.6)
            tcol = np.clip(tcol * gain, 0, 1)
            luma = np.array([0.2126, 0.7152, 0.0722])
            hidden = weight[:, 0] < 0.3
            if hidden.sum() > 500:
                target = float((rgba[alpha][:, :3] @ luma).mean())
                current = float((tcol[hidden] @ luma).mean())
                lift = float(np.clip(target / max(current, 1e-3), 1.0, 1.8))
                tcol = np.clip(tcol * (1 + (lift - 1) * (1 - weight)), 0, 1)
        texel = weight * sample[:, :3] + (1 - weight) * tcol
        return texel, (xs, ys), (vmap, tris, uvs)

    @staticmethod
    def _picture_yaw(vertices, faces, colors, cutout) -> float:
        """The turn about the up axis (degrees) at which the model looks like the picture.

        TRELLIS returns a subject in its own canonical pose, not necessarily
        as the picture shows it: a dog drawn three-quarter comes back side-on,
        and a texture projected straight from the front then paints its face
        onto its flank. Silhouettes are compared over a full turn; a view and
        the one opposite it are mirror images, so colours break the tie.
        """
        import cv2
        import numpy as np

        rgba = np.asarray(cutout.convert("RGBA"))
        alpha = rgba[..., 3] > 127
        if alpha.sum() < 100:
            return 0.0
        height = 160

        def fit(mask, rgb):
            ys, xs = np.nonzero(mask)
            y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            width = max(1, min(4 * height, int(round((x1 - x0) * height / (y1 - y0)))))
            off = (4 * height - width) // 2
            m = np.zeros((height, 4 * height), bool)
            m[:, off : off + width] = (
                cv2.resize(mask[y0:y1, x0:x1].astype(np.uint8) * 255, (width, height), interpolation=cv2.INTER_AREA)
                > 127
            )
            c = np.zeros((height, 4 * height, 3), np.float32)
            c[:, off : off + width] = cv2.resize(rgb[y0:y1, x0:x1], (width, height), interpolation=cv2.INTER_AREA)
            return m, c

        ref_mask, ref_rgb = fit(alpha, rgba[..., :3].astype(np.float32) / 255)

        # Vertices plus face centres, splatted nearest-first, stand in for a render.
        points = np.concatenate([vertices, vertices[faces].mean(1)])
        tint = np.concatenate([colors, colors[faces].mean(1)]).astype(np.float32)
        points = points - (points.min(0) + points.max(0)) / 2
        res = 200
        scores = {}
        for yaw in range(0, 360, 5):
            t = np.radians(yaw)
            x = points[:, 0] * np.cos(t) + points[:, 2] * np.sin(t)
            z = -points[:, 0] * np.sin(t) + points[:, 2] * np.cos(t)
            y = points[:, 1]
            scale = (res - 1) / max(float(np.ptp(x)), float(np.ptp(y)), 1e-6)
            px = ((x - x.min()) * scale).astype(np.int64)
            py = ((y.max() - y) * scale).astype(np.int64)
            w, h = int(px.max()) + 1, int(py.max()) + 1
            flat = py * w + px
            nearest = np.argsort(-z, kind="stable")
            _, first = np.unique(flat[nearest], return_index=True)
            win = nearest[first]
            hit = np.zeros(h * w, bool)
            hit[flat[win]] = True
            image = np.zeros((h * w, 3), np.float32)
            image[flat[win]] = tint[win]
            hit = hit.reshape(h, w)
            solid = cv2.morphologyEx(hit.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0
            mask, _ = fit(solid, np.zeros((h, w, 3), np.float32))
            seen, rgb = fit(hit, image.reshape(h, w, 3))
            iou = float((mask & ref_mask).sum() / max((mask | ref_mask).sum(), 1))
            both = seen & ref_mask
            error = float(np.abs(rgb[both] - ref_rgb[both]).mean()) if both.sum() > 50 else 1.0
            scores[yaw] = (iou, error)
        best = max(iou for iou, _ in scores.values())
        close = [yaw for yaw, (iou, _) in scores.items() if iou >= best - 0.06]
        chosen = min(close, key=lambda yaw: scores[yaw][1])
        print(f"[atrion] picture view at yaw {chosen} (silhouette {scores[chosen][0]:.2f}, best {best:.2f})")
        return float(chosen)

    def _mesh(self, picture, seed: int, target_faces: int):
        import cv2
        import numpy as np
        import fast_simplification
        import trimesh
        from PIL import Image
        from scipy.spatial import cKDTree
        from trimesh.visual import TextureVisuals
        from trimesh.visual.material import PBRMaterial

        # Cut the subject out once, keeping a real alpha channel: TRELLIS's own
        # preprocessing returns it on black with no alpha, which is useless as
        # a projection source. Given an RGBA image it skips its background
        # removal and only frames it.
        import rembg

        if getattr(self.trellis, "rembg_session", None) is None:
            self.trellis.rembg_session = rembg.new_session("u2net")
        cutout = rembg.remove(picture.convert("RGB"), session=self.trellis.rembg_session)
        # The soft floor shadow survives as faint alpha, and TRELLIS builds it
        # into a thin plate under the subject (which also throws off the
        # texture's alignment). Keep only what is solidly there.
        alpha = np.asarray(cutout)[..., 3]
        cutout.putalpha(Image.fromarray(np.where(alpha > 160, 255, 0).astype(np.uint8)))
        prepared = self.trellis.preprocess_image(cutout)
        outputs = self.trellis.run(
            prepared,
            seed=seed,
            formats=["mesh"],
            preprocess_image=False,
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
        vertices = (vertices @ np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], dtype=np.float32)).astype(np.float32)

        # Drop only true specks: a hand or a leg can be a separate piece, and
        # a size relative to the body would throw it away.
        out = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
        groups = trimesh.graph.connected_components(out.face_adjacency, nodes=np.arange(len(faces)), min_len=1)
        if len(groups) > 1:
            limit = max(40, int(len(faces) * 0.002))
            keep = [group for group in groups if len(group) >= limit]
            print(f"[atrion] kept {len(keep)} of {len(groups)} pieces (min {limit} faces)")
            if keep:
                kept_faces = np.concatenate(keep)
                used = np.unique(faces[kept_faces])
                remap = -np.ones(len(vertices), dtype=np.int64)
                remap[used] = np.arange(len(used))
                vertices, colors, faces = vertices[used], colors[used], remap[faces[kept_faces]]

        # Every model gets the picture projected as it was seen: turn it to the
        # picture's view for the bake, then ship it in its own upright pose.
        # Vertex colours alone keep a few percent of the picture's detail.
        yaw = np.radians(self._picture_yaw(vertices, faces, colors, cutout))
        turn = np.array(
            [[np.cos(yaw), 0, -np.sin(yaw)], [0, 1, 0], [np.sin(yaw), 0, np.cos(yaw)]], dtype=np.float32
        )
        seen = (vertices @ turn).astype(np.float32)
        texel, (xs, ys), (vmap, tris, uvs) = self._front_texture(seen, faces, colors, cutout)
        size = 1024
        texture = np.zeros((size, size, 3), dtype=np.float32)
        mask = np.zeros((size, size), dtype=np.uint8)
        texture[ys, xs] = texel
        mask[ys, xs] = 255
        # Grow the charts a few pixels so filtering never samples black seams.
        image = (np.clip(texture, 0, 1) * 255).astype(np.uint8)
        for _ in range(6):
            grown = cv2.dilate(image, np.ones((3, 3), np.uint8))
            image = np.where(mask[..., None] > 0, image, grown)
            mask = cv2.dilate(mask, np.ones((3, 3), np.uint8))
        material = PBRMaterial(baseColorTexture=Image.fromarray(image), metallicFactor=0.0, roughnessFactor=0.85)
        return trimesh.Trimesh(
            vertices=vertices[vmap],
            faces=tris,
            visual=TextureVisuals(uv=uvs, material=material),
            process=False,
        ).export(file_type="glb")

    @modal.method()
    def generate(self, prompt: str, seed: int = 0, target_faces: int = 60000, mode: str = "object") -> dict:
        import torch

        started = time.time()
        mode = "figure" if mode == "figure" else "object"
        picture = self._paint(prompt, seed, mode)
        painted = time.time()
        try:
            glb = self._mesh(picture, seed, target_faces)
        except torch.OutOfMemoryError:
            # A wide subject (a bridge, a long hall) fills TRELLIS's grid, and its
            # mesh decoder then needs more than is left beside the picture model.
            # Park the painter on the CPU for this mesh, then bring it back.
            print("[atrion] out of GPU memory; retrying the mesh with the painter on the CPU")
            self.painter.to("cpu")
            torch.cuda.empty_cache()
            try:
                glb = self._mesh(picture, seed, target_faces)
            finally:
                self.painter.to("cuda")
        buffer = io.BytesIO()
        picture.convert("RGB").save(buffer, format="JPEG", quality=85)
        print(f"[atrion] {mode}: paint {painted - started:.1f}s, mesh {time.time() - painted:.1f}s, glb {len(glb)} bytes")
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
        # "figure": people and animals get a straight front-facing reference picture.
        mode: str = Field(default="object", pattern="^(figure|object)$")

    @api.post("/jobs")
    def start(job: Job, authorization: str = Header(default="")):
        secret = os.environ["ATRION_SECRET"]
        if not hmac.compare_digest(authorization, f"Bearer {secret}"):
            raise HTTPException(status_code=401, detail="unauthorized")
        call = Realistic().generate.spawn(job.prompt, job.seed, mode=job.mode)
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
