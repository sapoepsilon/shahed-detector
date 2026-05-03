"use client";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImagePanel } from "@/components/image-panel";
import { VideoPanel } from "@/components/video-panel";
import { LivePanel } from "@/components/live-panel";
import { fetchHealth } from "@/lib/api";

export default function Home() {
  const [health, setHealth] = useState<{ device: string; classes: string[] } | null>(null);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [now, setNow] = useState("");

  useEffect(() => {
    fetchHealth()
      .then((h) => {
        setHealth(h);
        setHealthOk(true);
      })
      .catch(() => setHealthOk(false));
    const t = setInterval(() => {
      const d = new Date();
      setNow(
        `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")} UTC`,
      );
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="min-h-screen px-4 sm:px-8 py-6 max-w-[1400px] mx-auto">
      <header className="border-b border-[var(--border)] pb-5 mb-6 relative">
        <div className="flex items-baseline justify-between flex-wrap gap-6">
          <div className="flex items-center gap-5">
            <span className="led" />
            <div>
              <h1 className="font-display text-5xl sm:text-7xl tracking-[0.04em] leading-none crt-flicker text-[var(--accent)]"
                  style={{ textShadow: "0 0 24px rgba(183, 148, 246, 0.45), 0 0 48px rgba(183, 148, 246, 0.2)" }}>
                shahed
              </h1>
              <div className="font-accent text-[10px] tracking-[0.5em] text-[var(--ink-dim)] mt-2 uppercase">
                identification terminal · v0.1
              </div>
            </div>
          </div>
          <div className="text-[10px] tracking-[0.25em] text-[var(--ink-dim)] flex flex-wrap gap-x-5 gap-y-2 uppercase">
            <Stat label="model" value="yolo26m" />
            <Stat label="device" value={health?.device?.toUpperCase() ?? "—"} color="var(--signal)" />
            <Stat label="classes" value={health?.classes?.join(",") ?? "—"} />
            <Stat label="clock" value={now || "—"} color="var(--target)" />
            <Stat
              label="status"
              value={
                healthOk === null ? "probe…" : healthOk ? "online" : "offline"
              }
              color={
                healthOk === null
                  ? "var(--ink-dim)"
                  : healthOk
                    ? "var(--accent)"
                    : "var(--critical)"
              }
            />
          </div>
        </div>

        {healthOk === false && (
          <div className="mt-4 border border-[var(--critical)] text-[var(--critical)] px-4 py-2 text-[11px] tracking-[0.3em] bg-[rgba(255,92,138,0.06)]">
            // backend unreachable — start fastapi on :8000 or set next_public_api_base
          </div>
        )}
      </header>

      <Tabs defaultValue="image" className="w-full">
        <TabsList className="bg-transparent border border-[var(--border)] rounded-none h-auto p-0 mb-5 w-full grid grid-cols-3">
          {(["image", "video", "live"] as const).map((k) => (
            <TabsTrigger
              key={k}
              value={k}
              className="rounded-none border-r border-[var(--border)] last:border-r-0 data-[state=active]:bg-[var(--accent)] data-[state=active]:text-[var(--bg)] data-[state=active]:shadow-none tracking-[0.5em] py-4 text-[11px] uppercase font-semibold transition-all hover:text-[var(--accent)] data-[state=active]:hover:text-[var(--bg)]"
            >
              {k === "image" ? "still" : k}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="image"><ImagePanel /></TabsContent>
        <TabsContent value="video"><VideoPanel /></TabsContent>
        <TabsContent value="live"><LivePanel /></TabsContent>
      </Tabs>

      <footer className="mt-12 border-t border-[var(--border)] pt-4 flex justify-between items-center text-[10px] tracking-[0.3em] text-[var(--ink-dim)] uppercase font-accent">
        <span>// end of frame</span>
        <span>
          built with{" "}
          <span className="text-[var(--accent)]">yolo26</span> · fastapi · next · shadcn
        </span>
      </footer>
    </main>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span className="font-accent">
      <span>{label}</span>
      <span className="ml-2 tracking-[0.1em]" style={{ color: color ?? "var(--accent)" }}>
        {value}
      </span>
    </span>
  );
}
