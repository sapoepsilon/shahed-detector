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
      // draw source
      try {
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      } catch {
        // ignore - source not ready
      }
      // bboxes with HUD style
      for (const d of detections) {
        const [x1, y1, x2, y2] = d.xyxy;
        const w = x2 - x1;
        const h = y2 - y1;
        const conf = d.conf;
        const color = conf > 0.6 ? "#00ff88" : conf > 0.35 ? "#ffbb00" : "#ff3344";

        // corner brackets
        const t = Math.max(2, Math.min(w, h) * 0.04);
        const len = Math.max(10, Math.min(w, h) * 0.18);
        ctx.lineWidth = t;
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        // TL
        ctx.moveTo(x1, y1 + len); ctx.lineTo(x1, y1); ctx.lineTo(x1 + len, y1);
        // TR
        ctx.moveTo(x2 - len, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + len);
        // BL
        ctx.moveTo(x1, y2 - len); ctx.lineTo(x1, y2); ctx.lineTo(x1 + len, y2);
        // BR
        ctx.moveTo(x2 - len, y2); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - len);
        ctx.stroke();

        // crosshair at center
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const cx = x1 + w / 2;
        const cy = y1 + h / 2;
        ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy);
        ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8);
        ctx.stroke();

        // label
        const label = `${d.class.toUpperCase()} ${(conf * 100).toFixed(0)}%`;
        const fs = Math.max(14, Math.min(canvas.width / 50, 22));
        ctx.font = `${fs}px "IBM Plex Mono", monospace`;
        const padX = 6;
        const padY = 4;
        const tw = ctx.measureText(label).width;
        const ly = Math.max(0, y1 - fs - padY * 2);
        ctx.fillStyle = color;
        ctx.fillRect(x1, ly, tw + padX * 2, fs + padY * 2);
        ctx.fillStyle = "#07090b";
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
