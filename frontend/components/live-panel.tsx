"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { wsBase, type Detection, type WSMessage } from "@/lib/api";
import { DetectionList } from "./detection-list";
import { toast } from "sonner";

const TARGET_FPS = 8;

export function LivePanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sendCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inFlightRef = useRef(false);

  const [running, setRunning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [latency, setLatency] = useState<number | null>(null);
  const [fps, setFps] = useState(0);
  const [conf, setConf] = useState(0.25);
  const confRef = useRef(0.25);
  const fpsCount = useRef({ count: 0, t0: performance.now() });

  useEffect(() => {
    confRef.current = conf;
  }, [conf]);

  const drawOverlay = useCallback((dets: Detection[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    for (const d of dets) {
      const [x1, y1, x2, y2] = d.xyxy;
      const ww = x2 - x1;
      const hh = y2 - y1;
      const conf = d.conf;
      const color = conf > 0.6 ? "#b794f6" : conf > 0.35 ? "#ffd166" : "#ff5c8a";
      const t = Math.max(2, Math.min(ww, hh) * 0.04);
      const len = Math.max(10, Math.min(ww, hh) * 0.18);
      ctx.lineWidth = t;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(x1, y1 + len); ctx.lineTo(x1, y1); ctx.lineTo(x1 + len, y1);
      ctx.moveTo(x2 - len, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + len);
      ctx.moveTo(x1, y2 - len); ctx.lineTo(x1, y2); ctx.lineTo(x1 + len, y2);
      ctx.moveTo(x2 - len, y2); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - len);
      ctx.stroke();
      ctx.shadowBlur = 0;
      const fs = Math.max(14, Math.min(w / 50, 22));
      const label = `${d.class.toUpperCase()} ${(conf * 100).toFixed(0)}%`;
      ctx.font = `600 ${fs}px "JetBrains Mono", monospace`;
      const tw = ctx.measureText(label).width;
      const ly = Math.max(0, y1 - fs - 8);
      ctx.fillStyle = color;
      ctx.fillRect(x1, ly, tw + 12, fs + 8);
      ctx.fillStyle = "#08090e";
      ctx.fillText(label, x1 + 6, ly + fs + 2);
    }
  }, []);

  const stop = useCallback(() => {
    setRunning(false);
    setConnected(false);
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setDetections([]);
    drawOverlay([]);
  }, [drawOverlay]);

  useEffect(() => () => stop(), [stop]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setRunning(true);

      // ws connection
      const ws = new WebSocket(`${wsBase()}/ws/detect`);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => setConnected(false);
      ws.onerror = () => toast.error("WS connection error");
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as WSMessage;
          if ("dropped" in msg) return;
          if ("error" in msg) {
            toast.error(`server: ${msg.error}`);
            return;
          }
          if ("detections" in msg) {
            setDetections(msg.detections);
            drawOverlay(msg.detections);
            if (msg.ts) setLatency(Math.round(performance.now() - msg.ts));
            // fps tracker
            fpsCount.current.count += 1;
            const elapsed = performance.now() - fpsCount.current.t0;
            if (elapsed >= 1000) {
              setFps(fpsCount.current.count * 1000 / elapsed);
              fpsCount.current.count = 0;
              fpsCount.current.t0 = performance.now();
            }
            inFlightRef.current = false;
          }
        } catch (e) {
          toast.error(`parse error: ${(e as Error).message}`);
        }
      };

      // capture loop
      const sendCanvas = document.createElement("canvas");
      sendCanvasRef.current = sendCanvas;
      const sendOne = () => {
        const v = videoRef.current;
        const w = v?.videoWidth ?? 0;
        const h = v?.videoHeight ?? 0;
        if (!v || !w || !h) return;
        if (ws.readyState !== WebSocket.OPEN) return;
        if (inFlightRef.current) return;
        const targetW = 640;
        const scale = targetW / w;
        sendCanvas.width = targetW;
        sendCanvas.height = Math.round(h * scale);
        const ctx = sendCanvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(v, 0, 0, sendCanvas.width, sendCanvas.height);
        const data = sendCanvas.toDataURL("image/jpeg", 0.7);
        inFlightRef.current = true;
        try {
          ws.send(JSON.stringify({ image: data, ts: performance.now(), conf: confRef.current }));
        } catch {
          inFlightRef.current = false;
        }
      };
      const interval = window.setInterval(sendOne, Math.round(1000 / TARGET_FPS));
      ws.addEventListener("close", () => window.clearInterval(interval));
    } catch (e) {
      toast.error(`webcam denied: ${(e as Error).message}`);
      stop();
    }
  }, [drawOverlay, stop]);

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="bracket-frame p-2 bg-[var(--card)] relative min-h-[420px]">
        <span className="br1" /><span className="br2" />
        <div className="relative">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-auto block"
            style={{ display: running ? "block" : "none" }}
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ display: running ? "block" : "none" }}
          />
          {running && <div className="scan-line" />}
        </div>

        {!running && (
          <div className="grid place-items-center py-20">
            <button
              onClick={start}
              className="bracket-frame px-10 py-5 border border-[var(--accent)] hover:bg-[rgba(183,148,246,0.08)] transition"
            >
              <span className="br1" /><span className="br2" />
              <div className="text-[10px] tracking-[0.5em] mb-1">// ENGAGE</div>
              <div className="text-2xl font-display tracking-widest text-[var(--accent)]">webcam</div>
            </button>
          </div>
        )}
      </div>

      <aside className="bracket-frame bg-[var(--card)] flex flex-col">
        <span className="br1" /><span className="br2" />
        <header className="px-4 py-3 border-b border-[var(--border)] text-[11px] tracking-[0.3em] flex items-center justify-between">
          <span>// LIVE FEED</span>
          <span className="flex items-center gap-2">
            <span className={`led ${running && connected ? "" : "led-off"} ${!connected && running ? "led-amber" : ""}`} />
            <span>{running ? (connected ? "ONLINE" : "CONNECTING") : "STANDBY"}</span>
          </span>
        </header>
        <div className="flex-1 overflow-auto">
          <DetectionList detections={detections} />
        </div>
        <footer className="border-t border-[var(--border)] px-4 py-3 text-[10px] tracking-widest text-[var(--ink-dim)] space-y-2">
          <div className="flex justify-between">
            <span>FPS</span>
            <span className="text-[var(--accent)] tabular-nums">{fps.toFixed(1)}</span>
          </div>
          <div className="flex justify-between">
            <span>LATENCY</span>
            <span className="text-[var(--accent)] tabular-nums">{latency != null ? `${latency} ms` : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span>TARGETS</span>
            <span className="tabular-nums">{detections.length}</span>
          </div>
          <div className="pt-1">
            <div className="flex justify-between mb-1">
              <span>CONF MIN</span>
              <span className="text-[var(--accent)] tabular-nums">
                {conf.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0.05}
              max={0.95}
              step={0.05}
              value={conf}
              onChange={(e) => setConf(parseFloat(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
            <div className="flex justify-between text-[8px] text-[var(--ink-muted)] mt-1">
              <span>0.05</span>
              <span>0.50</span>
              <span>0.95</span>
            </div>
          </div>
          <button
            onClick={running ? stop : start}
            className="w-full mt-2 border border-[var(--border)] hover:border-[var(--accent)] px-3 py-2 text-[10px] tracking-[0.3em]"
          >
            {running ? "■ DISENGAGE" : "▶ ENGAGE"}
          </button>
        </footer>
      </aside>
    </div>
  );
}
