"use client";
import { useEffect, useRef, useState } from "react";
import { detectImage, type Detection } from "@/lib/api";
import { UploadZone } from "./upload-zone";
import { DetectionList } from "./detection-list";
import { DetectionCanvas } from "./detection-canvas";
import { toast } from "sonner";

export function ImagePanel() {
  const [file, setFile] = useState<File | null>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [busy, setBusy] = useState(false);
  const [ms, setMs] = useState<number | null>(null);
  const [conf, setConf] = useState(0.25);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  async function run(f: File, c = conf) {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(f);
    objectUrlRef.current = url;
    const img = new Image();
    img.onload = async () => {
      setImgEl(img);
      setSize({ w: img.naturalWidth, h: img.naturalHeight });
      setBusy(true);
      try {
        const r = await detectImage(f, c);
        setDetections(r.detections);
        setMs(r.inference_ms);
      } catch (e) {
        toast.error(`detect failed: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    };
    img.onerror = () => toast.error("could not load image");
    img.src = url;
    setFile(f);
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="bracket-frame p-2 bg-[var(--card)] min-h-[420px] flex items-center justify-center">
        <span className="br1" /><span className="br2" />
        {!imgEl ? (
          <UploadZone
            accept="image/*"
            label="UPLOAD STILL"
            hint="JPG · PNG · WEBP"
            onFile={run}
            className="w-full"
          />
        ) : (
          <DetectionCanvas
            source={imgEl}
            detections={detections}
            sourceWidth={size.w}
            sourceHeight={size.h}
            className="w-full h-auto block"
          />
        )}
      </div>

      <aside className="bracket-frame bg-[var(--card)] flex flex-col">
        <span className="br1" /><span className="br2" />
        <header className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between text-[11px] tracking-[0.3em]">
          <span>// DETECTIONS</span>
          <span className="text-[var(--phosphor)]">{detections.length}</span>
        </header>
        <div className="flex-1 overflow-auto">
          <DetectionList detections={detections} />
        </div>
        <footer className="border-t border-[var(--border)] px-4 py-3 text-[10px] tracking-widest text-[var(--ink-dim)] space-y-2">
          <div className="flex justify-between">
            <span>RESOLUTION</span>
            <span className="text-[var(--ink)] tabular-nums">{size.w} × {size.h}</span>
          </div>
          <div className="flex justify-between">
            <span>INFERENCE</span>
            <span className="text-[var(--phosphor)] tabular-nums">{ms != null ? `${ms} ms` : "—"}</span>
          </div>
          <label className="flex items-center justify-between gap-2">
            <span>CONF MIN</span>
            <input
              type="range"
              min={0.05}
              max={0.95}
              step={0.05}
              value={conf}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setConf(v);
                if (file) run(file, v);
              }}
              className="accent-[var(--phosphor)]"
            />
            <span className="text-[var(--ink)] tabular-nums w-8 text-right">{conf.toFixed(2)}</span>
          </label>
          {imgEl && (
            <button
              className="w-full mt-2 border border-[var(--border)] hover:border-[var(--phosphor)] px-3 py-2 text-[10px] tracking-[0.3em]"
              onClick={() => {
                if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
                setImgEl(null);
                setDetections([]);
                setFile(null);
                setMs(null);
              }}
            >
              ⟲ NEW SOURCE
            </button>
          )}
          {busy && <div className="text-[var(--phosphor)] tracking-widest pt-1">PROCESSING…</div>}
        </footer>
      </aside>
    </div>
  );
}
