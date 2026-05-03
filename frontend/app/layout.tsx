import type { Metadata } from "next";
import { JetBrains_Mono, Doto, Fragment_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-mono",
});

const display = Doto({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800", "900"],
  variable: "--font-display",
});

const accent = Fragment_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-accent",
});

export const metadata: Metadata = {
  title: "shahed // detector",
  description: "Real-time UAV identification terminal",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark ${mono.variable} ${display.variable} ${accent.variable}`}
    >
      <body className="min-h-screen font-mono antialiased bg-[var(--bg)] text-[var(--ink)]">
        {children}
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              fontFamily: "var(--font-mono)",
              borderRadius: 0,
              border: "1px solid var(--accent)",
              background: "var(--card)",
              color: "var(--ink)",
              boxShadow: "0 0 24px rgba(159, 122, 234, 0.18)",
            },
          }}
        />
      </body>
    </html>
  );
}
