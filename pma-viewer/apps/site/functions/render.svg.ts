/// <reference types="@cloudflare/workers-types" />

// Cloudflare Pages Function: GET /render.svg?src=<json-url>
//
// Uses Cloudflare Browser Rendering via @cloudflare/puppeteer to render the
// SPA headlessly and return a serialized SVG of the diagram pane.

import puppeteer, { type BrowserWorker } from "@cloudflare/puppeteer";

interface Env {
  BROWSER: BrowserWorker;
  ALLOWED_SRC_HOSTS?: string;
}

const MAX_SRC_BYTES = 2 * 1024 * 1024;
const RENDER_TIMEOUT_MS = 15_000;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const src = url.searchParams.get("src");
  const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
  const width = clampInt(url.searchParams.get("width"), 320, 4096, 1280);
  const height = clampInt(url.searchParams.get("height"), 240, 4096, Math.round(width * 0.625));
  const padding = clampInt(url.searchParams.get("padding"), 0, 200, 40);
  const fit = url.searchParams.get("fit") !== "0";

  if (!src) return text("missing ?src=<json-url>", 400);

  let srcUrl: URL;
  try { srcUrl = new URL(src); }
  catch { return text("invalid src URL", 400); }
  if (srcUrl.protocol !== "https:" && srcUrl.protocol !== "http:") {
    return text("src must be http(s)", 400);
  }
  if (env.ALLOWED_SRC_HOSTS) {
    const allow = env.ALLOWED_SRC_HOSTS.split(",").map((s) => s.trim()).filter(Boolean);
    if (allow.length && !allow.includes(srcUrl.hostname)) {
      return text(`host not in allow-list: ${srcUrl.hostname}`, 403);
    }
  }

  const head = await fetch(srcUrl, { method: "HEAD" }).catch(() => null);
  const declaredLen = Number(head?.headers.get("content-length") ?? 0);
  if (declaredLen > MAX_SRC_BYTES) return text("source JSON exceeds 2MB limit", 413);

  const etagInput = head?.headers.get("etag") ?? srcUrl.toString();
  const etag = `"${stableHash(`${etagInput}|${theme}|${width}|${height}|${padding}|${fit}`)}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  const viewerUrl = `${url.origin}/?src=${encodeURIComponent(src)}&theme=${theme}&interactive=0&toolbar=0${fit ? "" : "&fit=0"}`;

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.goto(viewerUrl, { waitUntil: "networkidle0", timeout: RENDER_TIMEOUT_MS });
    await page.waitForSelector(".react-flow__viewport", { timeout: RENDER_TIMEOUT_MS });

    const svg = await page.evaluate((pad: number) => {
      const pane = document.querySelector<HTMLElement>(".react-flow");
      if (!pane) return null;
      const rect = pane.getBoundingClientRect();
      const nodes = pane.querySelectorAll<HTMLElement>(".react-flow__node");
      const edges = pane.querySelector<SVGElement>(".react-flow__edges");

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      nodes.forEach((n) => {
        const r = n.getBoundingClientRect();
        minX = Math.min(minX, r.left - rect.left);
        minY = Math.min(minY, r.top - rect.top);
        maxX = Math.max(maxX, r.right - rect.left);
        maxY = Math.max(maxY, r.bottom - rect.top);
      });
      if (!Number.isFinite(minX)) {
        minX = 0; minY = 0; maxX = rect.width; maxY = rect.height;
      }
      minX -= pad; minY -= pad; maxX += pad; maxY += pad;
      const w = Math.max(1, Math.round(maxX - minX));
      const h = Math.max(1, Math.round(maxY - minY));

      const svgNS = "http://www.w3.org/2000/svg";
      const out = document.createElementNS(svgNS, "svg");
      out.setAttribute("xmlns", svgNS);
      out.setAttribute("width", String(w));
      out.setAttribute("height", String(h));
      out.setAttribute("viewBox", `0 0 ${w} ${h}`);

      const bg = document.createElementNS(svgNS, "rect");
      bg.setAttribute("width", "100%");
      bg.setAttribute("height", "100%");
      bg.setAttribute("fill", getComputedStyle(pane).backgroundColor || "#ffffff");
      out.appendChild(bg);

      if (edges) {
        const clone = edges.cloneNode(true) as SVGElement;
        const g = document.createElementNS(svgNS, "g");
        g.setAttribute("transform", `translate(${-minX}, ${-minY})`);
        clone.querySelectorAll<SVGElement>("*").forEach((n) => n.removeAttribute("class"));
        g.appendChild(clone);
        out.appendChild(g);
      }

      nodes.forEach((n) => {
        const r = n.getBoundingClientRect();
        const fo = document.createElementNS(svgNS, "foreignObject");
        fo.setAttribute("x", String(Math.round(r.left - rect.left - minX)));
        fo.setAttribute("y", String(Math.round(r.top - rect.top - minY)));
        fo.setAttribute("width", String(Math.ceil(r.width)));
        fo.setAttribute("height", String(Math.ceil(r.height)));
        const wrap = document.createElement("div");
        wrap.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
        wrap.appendChild(n.cloneNode(true));
        fo.appendChild(wrap);
        out.appendChild(fo);
      });

      return new XMLSerializer().serializeToString(out);
    }, padding);

    await browser.close();
    browser = null;

    if (!svg) return text("render failed", 500);

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=3600",
        ETag: etag,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    if (browser) { try { await browser.close(); } catch { /* ignore */ } }
    return text(`render error: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
};

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function text(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function stableHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
