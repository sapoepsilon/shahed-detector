# shahed detector

Real-time UAV detection for Shahed-136 / Geran-2 strike drones. Trained yolo26m on a hand-curated Roboflow dataset (Reddit + web imagery), served via FastAPI, surfaced in a tactical-HUD Next.js frontend.

## Stack
- **Model**: Ultralytics YOLO26m fine-tuned on `kamikaze-4ific/shahed-drone` — see Hugging Face card.
- **Backend**: FastAPI + PyTorch. Auto-selects CUDA → MPS → CPU. Endpoints: image, video, WebSocket live frames.
- **Frontend**: Next.js 16 + Tailwind v4 + shadcn/ui. Three modes: still image, recorded video, live webcam (WebSocket).

## Local dev

```bash
# backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# place trained weights at backend/model/best.pt
python3 main.py        # serves on :8000

# frontend (in another terminal)
cd frontend
pnpm i
pnpm dev               # serves on :3000
```

Set `NEXT_PUBLIC_API_BASE` in the frontend env if the backend isn't on `http://localhost:8000`.

## Deploy on a single GPU box

```bash
# on the box (Linux, NVIDIA driver installed)
git clone https://github.com/sapoepsilon/shahed-detector.git
cd shahed-detector

# backend
cd backend && python3 -m venv .venv && source .venv/bin/activate \
  && pip install -r requirements.txt
# place best.pt at backend/model/best.pt

# frontend
cd ../frontend && pnpm i && pnpm build

# run (use systemd or tmux)
( cd backend && source .venv/bin/activate && python3 main.py ) &
( cd frontend && NEXT_PUBLIC_API_BASE=http://localhost:8000 pnpm start ) &
```

For public access use Tailscale Funnel:
```bash
tailscale serve --bg --https=443 http://localhost:3000
tailscale funnel --bg --https=443 enable
```

## Endpoints

| | |
|---|---|
| `GET /health` | model + device + classes |
| `POST /detect/image` (multipart `file`) | `{ detections, width, height, inference_ms }` |
| `POST /detect/video` (multipart `file`) | `{ video_url, frames, frames_with_detection, max_conf, ... }` |
| `GET /video/{out_id}` | annotated mp4 stream |
| `WS /ws/detect` | send `{ image: "data:image/jpeg;base64,...", ts }`, receive detections |

## Detection schema

```json
{
  "class": "shahed",
  "class_id": 0,
  "conf": 0.92,
  "xyxy": [430.5, 189.7, 912.0, 512.8]
}
```
