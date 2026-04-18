import { useCallback, useEffect, useState } from "react";
import { PmaViewer, validateRfdFile, type RfdFile } from "@pma/viewer";
import "@pma/viewer/style.css";

function useQueryParams() {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  return {
    src: params.get("src") ?? undefined,
    theme: (params.get("theme") as "light" | "dark" | "auto" | null) ?? undefined,
    fit: params.get("fit") !== "0",
    interactive: params.get("interactive") !== "0",
    toolbar: params.get("toolbar") !== "0",
    zoom: params.get("zoom") ? Number(params.get("zoom")) : undefined,
  };
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

  if (qs.src) {
    return (
      <Shell>
        <PmaViewer
          src={qs.src}
          height="100vh"
          theme={qs.theme ?? "auto"}
          fitView={qs.fit}
          interactive={qs.interactive}
          toolbar={qs.toolbar}
        />
      </Shell>
    );
  }

  if (data) {
    return (
      <Shell>
        <PmaViewer data={data} height="100vh" />
      </Shell>
    );
  }

  return <Landing onPickFile={acceptFile} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ height: "100vh", width: "100vw" }}>{children}</div>;
}

function Landing({ onPickFile }: { onPickFile: (f: File) => void }) {
  return (
    <div style={{ padding: "48px 24px", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 28 }}>pma-viewer</h1>
      <p style={{ color: "#64748b", marginTop: 8 }}>
        Drop a <code>.rfd.json</code> file here, pick one below, or open a hosted diagram via{" "}
        <code>?src=&lt;url&gt;</code>.
      </p>
      <label
        style={{
          display: "block",
          marginTop: 24,
          padding: 24,
          border: "2px dashed #cbd5e1",
          borderRadius: 12,
          textAlign: "center",
          background: "#ffffff",
          cursor: "pointer",
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
        Click to choose a <code>.rfd.json</code> file
      </label>
      <div style={{ marginTop: 24, color: "#64748b", fontSize: 13 }}>
        <strong>URL params:</strong> <code>src</code>, <code>theme</code> (light/dark/auto),{" "}
        <code>fit</code> (0/1), <code>interactive</code> (0/1), <code>toolbar</code> (0/1),{" "}
        <code>zoom</code>
      </div>
      <div style={{ marginTop: 12, color: "#64748b", fontSize: 13 }}>
        <strong>Server SVG:</strong>{" "}
        <code>GET /render.svg?src=&lt;json-url&gt;&amp;theme=light</code>
      </div>
    </div>
  );
}
