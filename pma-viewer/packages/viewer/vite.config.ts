import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [
    react(),
    dts({
      entryRoot: "src",
      outDir: "dist",
      include: ["src"],
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "PmaViewer",
      fileName: (format) => (format === "es" ? "pma-viewer.js" : format === "cjs" ? "pma-viewer.cjs" : "pma-viewer.umd.js"),
      formats: ["es", "cjs", "umd"],
    },
    cssCodeSplit: false,
    sourcemap: true,
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
      output: {
        exports: "named",
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react-dom/client": "ReactDOM",
          "react/jsx-runtime": "jsxRuntime",
        },
        assetFileNames: (info) => (info.name === "style.css" ? "style.css" : info.name ?? "asset"),
      },
    },
  },
});
