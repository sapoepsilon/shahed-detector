import type { Detection } from "@/lib/api";

export function DetectionList({ detections }: { detections: Detection[] }) {
  if (!detections.length) {
    return (
      <div className="px-4 py-3 text-xs text-[var(--ink-dim)] tracking-widest">
        // NO TARGETS ACQUIRED
      </div>
    );
  }
  return (
    <div className="divide-y divide-[var(--border)]">
      {detections.map((d, i) => {
        const color =
          d.conf > 0.6 ? "var(--phosphor)" : d.conf > 0.35 ? "var(--amber)" : "var(--crimson)";
        return (
          <div
            key={i}
            className="grid grid-cols-[40px_1fr_auto] items-center gap-3 px-4 py-2 text-[11px]"
          >
            <span className="text-[var(--ink-dim)]">[{String(i).padStart(2, "0")}]</span>
            <span className="uppercase tracking-[0.18em]">{d.class}</span>
            <span style={{ color }} className="tabular-nums">
              {(d.conf * 100).toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
