import type { Detection } from "@/lib/api";

export function DetectionList({ detections }: { detections: Detection[] }) {
  if (!detections.length) {
    return (
      <div className="px-4 py-6 text-[10px] text-[var(--ink-dim)] tracking-[0.4em] text-center">
        // NO TARGETS ACQUIRED
      </div>
    );
  }
  return (
    <div className="divide-y divide-[var(--border)]">
      {detections.map((d, i) => {
        const color =
          d.conf > 0.6
            ? "var(--accent)"
            : d.conf > 0.35
              ? "var(--target)"
              : "var(--critical)";
        return (
          <div
            key={i}
            className="grid grid-cols-[36px_1fr_auto] items-center gap-3 px-4 py-2.5 text-[11px] hover:bg-[rgba(183,148,246,0.04)] transition-colors"
          >
            <span className="font-accent text-[var(--ink-dim)]">
              [{String(i).padStart(2, "0")}]
            </span>
            <span className="uppercase tracking-[0.2em]">{d.class}</span>
            <span style={{ color }} className="tabular-nums font-semibold">
              {(d.conf * 100).toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
