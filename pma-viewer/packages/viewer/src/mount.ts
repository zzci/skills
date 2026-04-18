import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { PmaViewer, type PmaViewerApi, type PmaViewerProps } from "./PmaViewer";
import type { RfdFile } from "./schema";

export interface MountHandle {
  fitView: () => void;
  exportPNG: () => Promise<string>;
  exportSVG: () => Promise<string>;
  update: (options: Partial<MountOptions>) => void;
  destroy: () => void;
}

export interface MountOptions extends Omit<PmaViewerProps, "onReady"> {
  data?: RfdFile;
  src?: string;
}

export function mount(selector: string | HTMLElement, options: MountOptions): MountHandle {
  const el = typeof selector === "string" ? document.querySelector<HTMLElement>(selector) : selector;
  if (!el) throw new Error(`mount target not found: ${String(selector)}`);

  let root: Root | null = createRoot(el);
  let currentApi: PmaViewerApi | null = null;
  let currentOptions: MountOptions = options;

  const render = () => {
    root?.render(
      createElement(PmaViewer, {
        ...currentOptions,
        onReady: (api) => { currentApi = api; },
      }),
    );
  };

  render();

  return {
    fitView: () => currentApi?.fitView(),
    exportPNG: async () => {
      if (!currentApi) throw new Error("viewer not ready");
      return currentApi.exportPNG();
    },
    exportSVG: async () => {
      if (!currentApi) throw new Error("viewer not ready");
      return currentApi.exportSVG();
    },
    update: (next) => {
      currentOptions = { ...currentOptions, ...next };
      render();
    },
    destroy: () => {
      root?.unmount();
      root = null;
      currentApi = null;
    },
  };
}
