import { useCallback, useEffect, useState } from "react";
import { PmaViewer, validateRfdFile, type RfdFile } from "@zzci/pma-viewer";
import "@zzci/pma-viewer/style.css";

interface Demo {
  id: string;
  title: string;
  description: string;
  src: string;
  tags: string[];
}

const DEMOS: Demo[] = [
  {
    id: "three-tier",
    title: "3-Tier SaaS",
    description: "Classic web topology: CDN → API → DB + Cache + Queue + Worker.",
    src: "/demos/three-tier.rfd.json",
    tags: ["frontend", "backend", "database", "cache", "queue"],
  },
  {
    id: "ai-rag",
    title: "AI RAG Pipeline",
    description: "Embedder, vector DB, reranker, LLM with fallback and prompt cache.",
    src: "/demos/ai-rag.rfd.json",
    tags: ["ai", "decision", "monitoring"],
  },
  {
    id: "microservices",
    title: "Microservices",
    description: "Gateway, domain services, event bus, and observability stack.",
    src: "/demos/microservices.rfd.json",
    tags: ["orchestrator", "queue", "external", "group"],
  },
];

function useQueryParams() {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  return {
    src: params.get("src") ?? undefined,
    demo: params.get("demo") ?? undefined,
    theme: (params.get("theme") as "light" | "dark" | "auto" | null) ?? undefined,
    fit: params.get("fit") !== "0",
    interactive: params.get("interactive") !== "0",
    toolbar: params.get("toolbar") !== "0",
    zoom: params.get("zoom") ? Number(params.get("zoom")) : undefined,
  };
}

function resolveDemoSrc(demoId?: string, rawSrc?: string): string | undefined {
  if (demoId) {
    const match = DEMOS.find((d) => d.id === demoId);
    if (match) return match.src;
  }
  return rawSrc;
}

export function App() {
  const qs = useQueryParams();
  const [data, setData] = useState<RfdFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const acceptFile = useCallback(async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = validateRfdFile(json);
      if (res.ok) setData(res.file);
      else setError(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => { e.preventDefault(); };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f) void acceptFile(f);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [acceptFile]);

  if (error) {
    return <Shell><pre style={{ padding: 16, color: "#b91c1c" }}>Failed to load: {error}</pre></Shell>;
  }

  const resolvedSrc = resolveDemoSrc(qs.demo, qs.src);

  if (resolvedSrc) {
    return (
      <Shell>
        <ViewerHeader src={resolvedSrc} />
        <div style={{ flex: 1, minHeight: 0 }}>
          <PmaViewer
            src={resolvedSrc}
            height="100%"
            theme={qs.theme ?? "auto"}
            fitView={qs.fit}
            interactive={qs.interactive}
            toolbar={qs.toolbar}
          />
        </div>
      </Shell>
    );
  }

  if (data) {
    return (
      <Shell>
        <ViewerHeader />
        <div style={{ flex: 1, minHeight: 0 }}>
          <PmaViewer data={data} height="100%" />
        </div>
      </Shell>
    );
  }

  return <Landing onPickFile={acceptFile} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ height: "100vh", width: "100vw", display: "flex", flexDirection: "column" }}>{children}</div>;
}

function ViewerHeader({ src }: { src?: string }) {
  return (
    <div
      style={{
        height: 48,
        flex: "0 0 48px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        borderBottom: "1px solid #e2e8f0",
        background: "#f8fafc",
        fontSize: 13,
      }}
    >
      <a href="/" style={{ color: "#0f172a", textDecoration: "none", fontWeight: 600 }}>← pma-viewer</a>
      {src ? (
        <a href={src} target="_blank" rel="noreferrer" style={{ color: "#64748b", textDecoration: "none" }}>
          {src}
        </a>
      ) : null}
    </div>
  );
}

function Landing({ onPickFile }: { onPickFile: (f: File) => void }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <div style={{ padding: "48px 24px 24px", maxWidth: 960, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 32, color: "#0f172a" }}>pma-viewer</h1>
        <p style={{ color: "#475569", marginTop: 8, fontSize: 15 }}>
          ReactFlow-based viewer for <code>.rfd.json</code> diagrams produced by the{" "}
          <a href="https://github.com/zzci/skills/tree/main/skills/pma-draw" style={{ color: "#2563eb" }}>
            pma-draw
          </a>{" "}
          skill.
        </p>

        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 18, color: "#0f172a", margin: "0 0 12px" }}>Demos</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 16,
            }}
          >
            {DEMOS.map((d) => (
              <a
                key={d.id}
                href={`/?demo=${d.id}`}
                style={{
                  display: "block",
                  padding: 16,
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  background: "#ffffff",
                  textDecoration: "none",
                  color: "inherit",
                  transition: "transform 0.1s ease, box-shadow 0.1s ease",
                  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(15, 23, 42, 0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 1px 2px rgba(15, 23, 42, 0.04)";
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 15, color: "#0f172a" }}>{d.title}</div>
                <p style={{ color: "#64748b", fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>{d.description}</p>
                <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {d.tags.map((t) => (
                    <span
                      key={t}
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "#f1f5f9",
                        color: "#475569",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </a>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 18, color: "#0f172a", margin: "0 0 12px" }}>Open your own</h2>
          <label
            style={{
              display: "block",
              padding: 24,
              border: "2px dashed #cbd5e1",
              borderRadius: 12,
              textAlign: "center",
              background: "#ffffff",
              cursor: "pointer",
              color: "#475569",
            }}
          >
            <input
              type="file"
              accept="application/json,.rfd.json,.json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickFile(f);
              }}
            />
            Drop a <code>.rfd.json</code> anywhere on this page, or click to choose a file.
          </label>
        </section>

        <section style={{ marginTop: 32, color: "#64748b", fontSize: 13, lineHeight: 1.7 }}>
          <h2 style={{ fontSize: 18, color: "#0f172a", margin: "0 0 12px" }}>URL params</h2>
          <code>?demo=three-tier | ai-rag | microservices</code> — open a bundled demo<br />
          <code>?src=&lt;url&gt;</code> — open a hosted diagram<br />
          <code>?theme=light|dark|auto</code>, <code>fit=0|1</code>, <code>interactive=0|1</code>, <code>toolbar=0|1</code>, <code>zoom=&lt;n&gt;</code>
        </section>
      </div>
    </div>
  );
}
