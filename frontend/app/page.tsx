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
      <header className="border-b border-[var(--border)] pb-4 mb-6">
        <div className="flex items-baseline justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <span className="led" />
            <div>
              <h1 className="font-display text-3xl sm:text-5xl tracking-[0.2em] leading-none">
                shahed
              </h1>
              <div className="text-[10px] tracking-[0.6em] text-[var(--ink-dim)] mt-1">
                IDENTIFICATION TERMINAL // V0.1
              </div>
            </div>
          </div>
          <div className="text-[10px] tracking-[0.3em] text-[var(--ink-dim)] flex flex-wrap gap-4">
            <Stat label="MODEL" value="yolo26m" />
            <Stat label="DEVICE" value={health?.device?.toUpperCase() ?? "—"} />
            <Stat label="CLASSES" value={health?.classes?.join(",").toUpperCase() ?? "—"} />
            <Stat label="CLOCK" value={now || "—"} />
            <Stat
              label="STATUS"
              value={
                healthOk === null
                  ? "PROBE…"
                  : healthOk
                    ? "ONLINE"
                    : "OFFLINE"
              }
              color={
                healthOk === null
                  ? "var(--ink-dim)"
                  : healthOk
                    ? "var(--phosphor)"
                    : "var(--crimson)"
              }
            />
          </div>
        </div>

        {healthOk === false && (
          <div className="mt-4 border border-[var(--crimson)] text-[var(--crimson)] px-4 py-2 text-[11px] tracking-[0.3em]">
            // BACKEND UNREACHABLE — START FastAPI ON :8000 OR SET NEXT_PUBLIC_API_BASE
          </div>
        )}
      </header>

      <Tabs defaultValue="image" className="w-full">
        <TabsList className="bg-transparent border border-[var(--border)] rounded-none h-auto p-0 mb-4 w-full grid grid-cols-3">
          <TabsTrigger
            value="image"
            className="rounded-none data-[state=active]:bg-[var(--phosphor)] data-[state=active]:text-[var(--bg)] tracking-[0.4em] py-3 text-[11px]"
          >
            STILL
          </TabsTrigger>
          <TabsTrigger
            value="video"
            className="rounded-none data-[state=active]:bg-[var(--phosphor)] data-[state=active]:text-[var(--bg)] tracking-[0.4em] py-3 text-[11px]"
          >
            VIDEO
          </TabsTrigger>
          <TabsTrigger
            value="live"
            className="rounded-none data-[state=active]:bg-[var(--phosphor)] data-[state=active]:text-[var(--bg)] tracking-[0.4em] py-3 text-[11px]"
          >
            LIVE
          </TabsTrigger>
        </TabsList>

        <TabsContent value="image"><ImagePanel /></TabsContent>
        <TabsContent value="video"><VideoPanel /></TabsContent>
        <TabsContent value="live"><LivePanel /></TabsContent>
      </Tabs>

      <footer className="mt-10 border-t border-[var(--border)] pt-4 flex justify-between items-center text-[10px] tracking-[0.3em] text-[var(--ink-dim)]">
        <span>// END OF FRAME</span>
        <span>BUILT WITH yolo26 · fastapi · next · shadcn</span>
      </footer>
    </main>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span>
      <span>{label}</span>
      <span className="ml-2" style={{ color: color ?? "var(--phosphor)" }}>
        {value}
      </span>
    </span>
  );
}
