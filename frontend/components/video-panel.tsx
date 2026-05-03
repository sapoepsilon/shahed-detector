"use client";
import { useEffect, useRef, useState } from "react";
import { detectVideo, API_BASE, type VideoResult } from "@/lib/api";
import { UploadZone } from "./upload-zone";
import { toast } from "sonner";

export function VideoPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VideoResult | null>(null);
  const [progressLabel, setProgressLabel] = useState<string>("");
  const ticker = useRef<number | null>(null);

  useEffect(() => () => {
    if (ticker.current) window.clearInterval(ticker.current);
  }, []);

  async function run(f: File) {
    setBusy(true);
    setResult(null);
    const t0 = performance.now();
    setProgressLabel("0.0s · UPLOADING");
    if (ticker.current) window.clearInterval(ticker.current);
    ticker.current = window.setInterval(() => {
      const s = ((performance.now() - t0) / 1000).toFixed(1);
      setProgressLabel(`${s}s · INFERENCING`);
    }, 100);
    try {
      const r = await detectVideo(f);
      setResult(r);
    } catch (e) {
      toast.error(`detect/video failed: ${(e as Error).message}`);
    } finally {
      if (ticker.current) {
        window.clearInterval(ticker.current);
        ticker.current = null;
      }
      setProgressLabel("");
      setBusy(false);
    }
  }

  if (!result) {
    return (
      <div className="bracket-frame p-2 bg-[var(--card)] relative">
        <span className="br1" /><span className="br2" />
        <UploadZone
          accept="video/*"
          label="UPLOAD VIDEO"
          hint="MP4 · WEBM · MOV — server-side inference"
          onFile={run}
          className="w-full"
        />
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-[rgba(7,9,11,0.85)]">
            <div className="text-center space-y-3">
              <div className="text-[var(--phosphor)] text-xs tracking-[0.4em]">// {progressLabel}</div>
              <div className="font-display text-3xl tracking-widest">analyzing</div>
              <div className="text-[var(--ink-dim)] text-[10px] tracking-widest">FRAME-BY-FRAME · DO NOT NAVIGATE AWAY</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const pct = result.frames ? (100 * result.frames_with_detection / result.frames).toFixed(1) : "0";
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="bracket-frame p-2 bg-[var(--card)]">
        <span className="br1" /><span className="br2" />
        <video
          src={`${API_BASE}${result.video_url}`}
          controls
          autoPlay
          loop
          className="w-full h-auto block"
        />
      </div>
      <aside className="bracket-frame bg-[var(--card)] flex flex-col">
        <span className="br1" /><span className="br2" />
        <header className="px-4 py-3 border-b border-[var(--border)] text-[11px] tracking-[0.3em] flex items-center justify-between">
          <span>// REPORT</span>
          <span className="text-[var(--phosphor)]">{pct}%</span>
        </header>
        <div className="px-4 py-3 space-y-2 text-[11px] tracking-widest">
          {[
            ["FRAMES", result.frames],
            ["WITH TARGET", result.frames_with_detection],
            ["MAX CONF", `${(result.max_conf * 100).toFixed(1)}%`],
            ["FPS", result.fps.toFixed(2)],
            ["RESOLUTION", `${result.width} × ${result.height}`],
          ].map(([k, v]) => (
            <div key={String(k)} className="flex justify-between">
              <span className="text-[var(--ink-dim)]">{k}</span>
              <span className="tabular-nums">{String(v)}</span>
            </div>
          ))}
        </div>
        <footer className="mt-auto border-t border-[var(--border)] p-3 grid grid-cols-2 gap-2">
          <a
            href={`${API_BASE}${result.video_url}`}
            download
            className="text-center border border-[var(--border)] hover:border-[var(--phosphor)] px-3 py-2 text-[10px] tracking-[0.3em]"
          >
            ⤓ DOWNLOAD
          </a>
          <button
            onClick={() => setResult(null)}
            className="border border-[var(--border)] hover:border-[var(--phosphor)] px-3 py-2 text-[10px] tracking-[0.3em]"
          >
            ⟲ NEW
          </button>
        </footer>
      </aside>
    </div>
  );
}
