import asyncio
import base64
import io
import json
import os
import shutil
import tempfile
import time
import uuid
from pathlib import Path

import cv2
import numpy as np
import torch
from fastapi import (
    FastAPI,
    File,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image
from ultralytics import YOLO

ROOT = Path(__file__).parent
MODEL_PATH = ROOT / "model" / "best.pt"
OUT_DIR = ROOT / "outputs"
OUT_DIR.mkdir(exist_ok=True)

# pick best device: cuda > mps > cpu
if torch.cuda.is_available():
    DEVICE = "cuda"
elif torch.backends.mps.is_available():
    DEVICE = "mps"
else:
    DEVICE = "cpu"

print(f"loading model {MODEL_PATH} on {DEVICE}", flush=True)
model = YOLO(str(MODEL_PATH))
# warm up
_ = model.predict(np.zeros((640, 640, 3), dtype=np.uint8), verbose=False, device=DEVICE)
print("model ready", flush=True)

# ---- CLIP zero-shot verifier (post-processing for false positives) ----
USE_CLIP = os.environ.get("USE_CLIP", "1") != "0"
clip_model = None
clip_processor = None
clip_text_features = None

CLIP_LABELS = [
    ("shahed",         "a photo of a Shahed-136 or Geran-2 kamikaze drone, delta-wing strike UAV"),
    ("bird",           "a photo of a bird flying or perched, silhouette"),
    ("airplane",       "a photo of an airplane or jet aircraft in the sky"),
    ("kite",           "a photo of a recreational kite flying"),
    ("balloon",        "a photo of a balloon in the sky"),
    ("paper_plane",    "a photo of a paper airplane"),
    ("missile",        "a photo of a cruise missile or rocket in flight"),
    ("quadcopter",     "a photo of a quadcopter or DJI consumer drone"),
    ("cloud",          "a photo of a cloud in the sky"),
    ("other",          "a photo of something unrelated"),
]

if USE_CLIP:
    try:
        from transformers import CLIPModel, CLIPProcessor
        _CLIP_NAME = "openai/clip-vit-base-patch32"
        print(f"loading CLIP {_CLIP_NAME} on {DEVICE}", flush=True)
        clip_model = CLIPModel.from_pretrained(_CLIP_NAME).to(DEVICE).eval()
        clip_processor = CLIPProcessor.from_pretrained(_CLIP_NAME)
        with torch.no_grad():
            tokens = clip_processor(text=[t for _, t in CLIP_LABELS], return_tensors="pt", padding=True).to(DEVICE)
            tf = clip_model.get_text_features(**tokens)
            clip_text_features = tf / tf.norm(dim=-1, keepdim=True)
        print("CLIP ready", flush=True)
    except Exception as e:
        print(f"CLIP unavailable ({e}); skipping verifier", flush=True)
        clip_model = None


def clip_verify(pil_img: Image.Image, xyxy) -> dict:
    """Crop the bbox + run CLIP zero-shot. Returns {label, score, accepted}."""
    if clip_model is None:
        return {"label": "shahed", "score": 1.0, "accepted": True}
    x1, y1, x2, y2 = [int(round(v)) for v in xyxy]
    # widen crop slightly for context
    pad_x = max(8, int((x2 - x1) * 0.15))
    pad_y = max(8, int((y2 - y1) * 0.15))
    x1 = max(0, x1 - pad_x); y1 = max(0, y1 - pad_y)
    x2 = min(pil_img.width, x2 + pad_x); y2 = min(pil_img.height, y2 + pad_y)
    if x2 <= x1 or y2 <= y1:
        return {"label": "other", "score": 0.0, "accepted": False}
    crop = pil_img.crop((x1, y1, x2, y2))
    with torch.no_grad():
        inputs = clip_processor(images=crop, return_tensors="pt").to(DEVICE)
        feats = clip_model.get_image_features(**inputs)
        feats = feats / feats.norm(dim=-1, keepdim=True)
        sims = (feats @ clip_text_features.T)[0]
        probs = sims.softmax(dim=-1)
    idx = int(probs.argmax())
    label = CLIP_LABELS[idx][0]
    score = float(probs[idx])
    return {"label": label, "score": score, "accepted": label == "shahed"}


# ---- post-process filters ----
MIN_BOX_FRAC = float(os.environ.get("MIN_BOX_FRAC", "0.0006"))   # 0.06% of image area
MIN_ASPECT = float(os.environ.get("MIN_ASPECT", "0.5"))          # w/h
MAX_ASPECT = float(os.environ.get("MAX_ASPECT", "5.0"))


def passes_geometry(xyxy, img_w: int, img_h: int) -> bool:
    x1, y1, x2, y2 = xyxy
    w = max(0.0, x2 - x1)
    h = max(0.0, y2 - y1)
    if w <= 0 or h <= 0:
        return False
    area_frac = (w * h) / max(1, img_w * img_h)
    if area_frac < MIN_BOX_FRAC:
        return False
    aspect = w / h
    if aspect < MIN_ASPECT or aspect > MAX_ASPECT:
        return False
    return True

app = FastAPI(title="Shahed Detector")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def boxes_to_json(r, pil_img: Image.Image | None = None, verify: bool = True):
    """Convert YOLO Boxes → JSON. Filter by geometry + (optionally) CLIP."""
    out = []
    if r.boxes is None:
        return out
    img_w = getattr(r, "orig_shape", (0, 0))[1] or (pil_img.width if pil_img else 0)
    img_h = getattr(r, "orig_shape", (0, 0))[0] or (pil_img.height if pil_img else 0)
    for b in r.boxes:
        cls_id = int(b.cls)
        xyxy = [round(float(x), 2) for x in b.xyxy[0].tolist()]
        # geometry filter
        if img_w and img_h and not passes_geometry(xyxy, img_w, img_h):
            continue
        det = {
            "class": r.names.get(cls_id, str(cls_id)),
            "class_id": cls_id,
            "conf": float(b.conf),
            "xyxy": xyxy,
        }
        # CLIP verify
        if verify and pil_img is not None and clip_model is not None:
            v = clip_verify(pil_img, xyxy)
            det["clip"] = v
            if not v["accepted"]:
                continue
        out.append(det)
    return out


@app.get("/health")
async def health():
    return {
        "ok": True,
        "model": str(MODEL_PATH.name),
        "device": DEVICE,
        "classes": list(model.names.values()) if hasattr(model, "names") else [],
        "clip": clip_model is not None,
        "filters": {
            "min_box_frac": MIN_BOX_FRAC,
            "min_aspect": MIN_ASPECT,
            "max_aspect": MAX_ASPECT,
        },
    }


@app.post("/detect/image")
async def detect_image(
    file: UploadFile = File(...),
    conf: float = 0.55,
    verify: bool = True,
):
    try:
        contents = await file.read()
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        arr = np.array(img)
        t0 = time.time()
        results = model.predict(arr, conf=conf, verbose=False, device=DEVICE, imgsz=640)
        ms = round((time.time() - t0) * 1000, 1)
        return {
            "detections": boxes_to_json(results[0], pil_img=img, verify=verify),
            "width": img.width,
            "height": img.height,
            "inference_ms": ms,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"image decode/inference failed: {e}")


@app.post("/detect/video")
async def detect_video(
    file: UploadFile = File(...),
    conf: float = 0.55,
    sample_every: int = 1,
    verify: bool = True,
):
    """Process uploaded video and return mp4 with annotations + per-frame stats."""
    suffix = Path(file.filename or "in.mp4").suffix or ".mp4"
    in_path = OUT_DIR / f"in_{uuid.uuid4().hex}{suffix}"
    out_id = uuid.uuid4().hex
    raw_out_path = OUT_DIR / f"raw_{out_id}.mp4"
    out_path = OUT_DIR / f"out_{out_id}.mp4"  # H.264 browser-playable (after ffmpeg transcode)
    stats_path = OUT_DIR / f"stats_{out_id}.json"

    with open(in_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    cap = cv2.VideoCapture(str(in_path))
    if not cap.isOpened():
        in_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="failed to open video")
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    # any codec — we transcode after
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(raw_out_path), fourcc, fps, (width, height))

    n_frames = 0
    n_hits = 0
    max_conf = 0.0
    last_seen = -1
    try:
        idx = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if idx % sample_every == 0:
                results = model.predict(frame, conf=conf, verbose=False, device=DEVICE, imgsz=640)
                r = results[0]
                # filter detections by geometry + CLIP, then redraw cleanly
                pil_frame = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                kept = boxes_to_json(r, pil_img=pil_frame, verify=verify)
                annotated = frame.copy()
                if kept:
                    n_hits += 1
                    last_seen = idx
                    for d in kept:
                        x1, y1, x2, y2 = [int(v) for v in d["xyxy"]]
                        c = d["conf"]
                        max_conf = max(max_conf, c)
                        color = (134, 122, 246) if c > 0.6 else (102, 209, 255) if c > 0.35 else (138, 92, 255)
                        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                        cv2.putText(
                            annotated, f"shahed {c:.2f}",
                            (x1, max(20, y1 - 6)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2,
                        )
            else:
                annotated = frame
            writer.write(annotated)
            n_frames += 1
            idx += 1
    finally:
        cap.release()
        writer.release()
        in_path.unlink(missing_ok=True)

    # transcode to H.264/AAC mp4 with faststart so browsers can stream-play
    import subprocess
    transcode = subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", str(raw_out_path),
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-an",  # no audio
            str(out_path),
        ],
        capture_output=True, text=True,
    )
    if transcode.returncode != 0 or not out_path.exists():
        # fall back to raw if ffmpeg unavailable
        raw_out_path.rename(out_path)
    else:
        raw_out_path.unlink(missing_ok=True)

    stats = {
        "out_id": out_id,
        "frames": n_frames,
        "frames_with_detection": n_hits,
        "max_conf": round(max_conf, 3),
        "fps": fps,
        "width": width,
        "height": height,
    }
    stats_path.write_text(json.dumps(stats))
    return {"video_url": f"/video/{out_id}", **stats}


@app.get("/video/{out_id}")
async def serve_video(out_id: str):
    p = OUT_DIR / f"out_{out_id}.mp4"
    if not p.exists():
        raise HTTPException(404, "not found")
    return FileResponse(p, media_type="video/mp4", filename=p.name)


@app.websocket("/ws/detect")
async def ws_detect(ws: WebSocket):
    """Receive base64 JPEG frames, return detections JSON."""
    await ws.accept()
    busy = False
    try:
        while True:
            msg = await ws.receive_text()
            if busy:
                # drop frame: client should not flood; we send a tick back so it knows we're alive
                await ws.send_json({"dropped": True})
                continue
            busy = True
            try:
                payload = json.loads(msg)
                conf = float(payload.get("conf", 0.55))
                verify = bool(payload.get("verify", True))
                b64 = payload.get("image", "")
                if "," in b64:
                    b64 = b64.split(",", 1)[1]
                img_bytes = base64.b64decode(b64)
                img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                arr = np.array(img)
                t0 = time.time()
                # run in thread so we don't block event loop
                results = await asyncio.to_thread(
                    model.predict, arr, conf=conf, verbose=False, device=DEVICE, imgsz=640
                )
                # CLIP verify can be slow; do off the event loop too
                detections = await asyncio.to_thread(
                    boxes_to_json, results[0], img, verify
                )
                ms = round((time.time() - t0) * 1000, 1)
                await ws.send_json({
                    "detections": detections,
                    "width": img.width,
                    "height": img.height,
                    "inference_ms": ms,
                    "ts": payload.get("ts"),
                })
            except Exception as e:
                await ws.send_json({"error": str(e)})
            finally:
                busy = False
    except WebSocketDisconnect:
        pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
