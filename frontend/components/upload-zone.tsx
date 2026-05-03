"use client";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  accept: string;
  onFile: (file: File) => void;
  label: string;
  hint?: string;
  className?: string;
};

export function UploadZone({ accept, onFile, label, hint, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDrag(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "bracket-frame relative cursor-pointer select-none border border-dashed border-[var(--border)] py-14 px-8 text-center transition-colors",
        drag ? "bg-[rgba(0,255,136,0.06)] border-[var(--phosphor)]" : "hover:border-[var(--phosphor)]",
        className,
      )}
    >
      <span className="br1" />
      <span className="br2" />
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <div className="text-[var(--phosphor)] text-xs tracking-[0.4em] mb-3 uppercase">
        // ACQUISITION
      </div>
      <div className="text-2xl font-display tracking-widest mb-3">{label}</div>
      <div className="text-xs text-[var(--ink-dim)]">{hint || "DRAG · DROP · CLICK"}</div>
    </div>
  );
}
