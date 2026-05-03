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

app = FastAPI(title="Shahed Detector")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def boxes_to_json(r):
    out = []
    if r.boxes is None:
        return out
    for b in r.boxes:
        cls_id = int(b.cls)
        out.append({
            "class": r.names.get(cls_id, str(cls_id)),
            "class_id": cls_id,
            "conf": float(b.conf),
            "xyxy": [round(float(x), 2) for x in b.xyxy[0].tolist()],
        })
    return out


@app.get("/health")
async def health():
    return {
        "ok": True,
        "model": str(MODEL_PATH.name),
        "device": DEVICE,
        "classes": list(model.names.values()) if hasattr(model, "names") else [],
    }


@app.post("/detect/image")
async def detect_image(file: UploadFile = File(...), conf: float = 0.25):
    try:
        contents = await file.read()
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        arr = np.array(img)
        t0 = time.time()
        results = model.predict(arr, conf=conf, verbose=False, device=DEVICE, imgsz=640)
        ms = round((time.time() - t0) * 1000, 1)
        return {
            "detections": boxes_to_json(results[0]),
            "width": img.width,
            "height": img.height,
            "inference_ms": ms,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"image decode/inference failed: {e}")


@app.post("/detect/video")
async def detect_video(file: UploadFile = File(...), conf: float = 0.25, sample_every: int = 1):
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
                annotated = r.plot()
                if r.boxes is not None and len(r.boxes) > 0:
                    n_hits += 1
                    last_seen = idx
                    for b in r.boxes:
                        max_conf = max(max_conf, float(b.conf))
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
                conf = float(payload.get("conf", 0.25))
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
                ms = round((time.time() - t0) * 1000, 1)
                await ws.send_json({
                    "detections": boxes_to_json(results[0]),
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
