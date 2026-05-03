import type { Metadata } from "next";
import { IBM_Plex_Mono, Major_Mono_Display } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-mono",
});

const display = Major_Mono_Display({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "SHAHED // DETECTOR",
  description: "Real-time UAV identification terminal",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${mono.variable} ${display.variable}`}>
      <body className="min-h-screen font-mono antialiased bg-[var(--bg)] text-[var(--ink)]">
        {children}
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              fontFamily: "var(--font-mono)",
              borderRadius: 0,
              border: "1px solid var(--phosphor)",
              background: "#0a0a0c",
              color: "var(--phosphor)",
            },
          }}
        />
      </body>
    </html>
  );
}
