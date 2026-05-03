// Custom route handler for video upload. Streams the multipart body straight
// to the FastAPI backend, bypassing Next.js's default 10MB body-size cap on
// the global rewrite proxy.
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600; // seconds (Vercel-style hint)

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const target = `${BACKEND}/detect/video${url.search}`;

  const headers = new Headers(req.headers);
  // strip Next-internal headers that confuse upstream
  headers.delete("host");
  headers.delete("x-forwarded-host");
  headers.delete("x-forwarded-proto");
  headers.delete("connection");
  headers.delete("content-length"); // let fetch recompute

  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers,
      body: req.body,
      // @ts-expect-error duplex is required for streaming bodies in Node fetch
      duplex: "half",
      signal: AbortSignal.timeout(10 * 60 * 1000), // 10 min
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: upstream.headers,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message || String(err) }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }
}
