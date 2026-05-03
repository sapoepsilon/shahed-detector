"use client";
import { useEffect, useRef } from "react";
import type { Detection } from "@/lib/api";

type Props = {
  source: HTMLImageElement | HTMLVideoElement | null;
  detections: Detection[];
  sourceWidth: number;
  sourceHeight: number;
  className?: string;
};

const COLOR = {
  high: "#b794f6",       // violet — high confidence
  mid: "#ffd166",        // amber — medium
  low: "#ff5c8a",        // hot pink — low/uncertain
};

function colorFor(conf: number) {
  if (conf > 0.6) return COLOR.high;
  if (conf > 0.35) return COLOR.mid;
  return COLOR.low;
}

export function DetectionCanvas({ source, detections, sourceWidth, sourceHeight, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;

    canvas.width = sourceWidth || (source instanceof HTMLVideoElement ? source.videoWidth : (source as HTMLImageElement).naturalWidth);
    canvas.height = sourceHeight || (source instanceof HTMLVideoElement ? source.videoHeight : (source as HTMLImageElement).naturalHeight);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw() {
      if (!source || !ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      try {
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      } catch {
        // not ready
      }
      for (const d of detections) {
        const [x1, y1, x2, y2] = d.xyxy;
        const w = x2 - x1;
        const h = y2 - y1;
        const conf = d.conf;
        const color = colorFor(conf);

        const t = Math.max(2, Math.min(w, h) * 0.04);
        const len = Math.max(10, Math.min(w, h) * 0.18);

        // outer halo
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

        // dotted side lines for radar feel
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = color + "66";
        ctx.beginPath();
        ctx.moveTo(x1 + len, y1); ctx.lineTo(x2 - len, y1);
        ctx.moveTo(x1 + len, y2); ctx.lineTo(x2 - len, y2);
        ctx.moveTo(x1, y1 + len); ctx.lineTo(x1, y2 - len);
        ctx.moveTo(x2, y1 + len); ctx.lineTo(x2, y2 - len);
        ctx.stroke();
        ctx.setLineDash([]);

        // crosshair at center
        const cx = x1 + w / 2;
        const cy = y1 + h / 2;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy);
        ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10);
        ctx.stroke();

        // label badge
        const fs = Math.max(13, Math.min(canvas.width / 55, 20));
        const label = `${d.class.toUpperCase()} · ${(conf * 100).toFixed(0)}%`;
        ctx.font = `600 ${fs}px "JetBrains Mono", monospace`;
        const padX = 8;
        const padY = 5;
        const tw = ctx.measureText(label).width;
        const ly = Math.max(0, y1 - fs - padY * 2 - 2);
        // outline
        ctx.fillStyle = color;
        ctx.fillRect(x1, ly, tw + padX * 2, fs + padY * 2);
        ctx.fillStyle = "#08090e";
        ctx.fillText(label, x1 + padX, ly + fs + padY - 2);
      }

      if (source instanceof HTMLVideoElement && !source.paused) {
        rafRef.current = requestAnimationFrame(draw);
      }
    }

    draw();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [source, detections, sourceWidth, sourceHeight]);

  return <canvas ref={canvasRef} className={className} />;
}
