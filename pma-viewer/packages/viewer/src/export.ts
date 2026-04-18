import { toPng, toSvg } from "html-to-image";

export async function exportPaneAsPng(root: HTMLElement): Promise<string> {
  const pane = root.querySelector<HTMLElement>(".react-flow__viewport") ?? root;
  return toPng(pane, { pixelRatio: 2, cacheBust: true, backgroundColor: "#ffffff" });
}

export async function exportPaneAsSvg(root: HTMLElement): Promise<string> {
  const pane = root.querySelector<HTMLElement>(".react-flow__viewport") ?? root;
  return toSvg(pane, { cacheBust: true, backgroundColor: "#ffffff" });
}
