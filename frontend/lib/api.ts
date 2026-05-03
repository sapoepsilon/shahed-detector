export type Detection = {
  class: string;
  class_id: number;
  conf: number;
  xyxy: [number, number, number, number];
};

export type ImageResult = {
  detections: Detection[];
  width: number;
  height: number;
  inference_ms: number;
};

export type VideoResult = {
  video_url: string;
  out_id: string;
  frames: number;
  frames_with_detection: number;
  max_conf: number;
  fps: number;
  width: number;
  height: number;
};

export type WSMessage =
  | { detections: Detection[]; width: number; height: number; inference_ms: number; ts?: number }
  | { dropped: true }
  | { error: string };

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export const WS_BASE = API_BASE.replace(/^http/, "ws");

export async function detectImage(file: Blob, conf = 0.25): Promise<ImageResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE}/detect/image?conf=${conf}`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error(`detect/image failed: ${res.status}`);
  return res.json();
}

export async function detectVideo(file: File, conf = 0.25): Promise<VideoResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE}/detect/video?conf=${conf}`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error(`detect/video failed: ${res.status}`);
  return res.json();
}

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error("health failed");
  return res.json() as Promise<{ ok: boolean; model: string; device: string; classes: string[] }>;
}
