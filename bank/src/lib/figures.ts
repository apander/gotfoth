import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { getDocument, type PageViewport } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextRow } from "./lines";
import type { FigureClip, ParsedExtract } from "./types";

export type GraphicBox = { x0: number; y0: number; x1: number; y1: number };

const SCALE = 2;

export function pdfWasmUrl(): string {
  const require = createRequire(import.meta.url);
  return pathToFileURL(join(dirname(require.resolve("pdfjs-dist/package.json")), "wasm") + "/").href;
}

export function figureClip(
  rows: TextRow[],
  boxes: GraphicBox[],
  page = { width: 595, height: 842 },
): { x: number; y: number; width: number; height: number } | null {
  if (rows.length === 0) return null;
  const textTop = Math.max(...rows.map((row) => row.y)) + 14;
  const textBottom = Math.min(...rows.map((row) => row.y)) - 8;
  const hits = boxes.filter((box) => {
    const top = Math.max(box.y0, box.y1);
    const bottom = Math.min(box.y0, box.y1);
    const width = Math.abs(box.x1 - box.x0);
    const height = Math.abs(box.y1 - box.y0);
    return width >= 40 && height >= 8 && top > textBottom && bottom < textTop;
  });
  const left = Math.min(...rows.map((row) => row.left ?? 72), ...hits.map((box) => Math.min(box.x0, box.x1)), 72) - 10;
  const right = Math.max(...rows.map((row) => row.right ?? 200), ...hits.map((box) => Math.max(box.x0, box.x1))) + 14;
  const top = Math.max(textTop, ...hits.map((box) => Math.max(box.y0, box.y1)), textTop) + 2;
  const bottom = Math.min(textBottom, ...hits.map((box) => Math.min(box.y0, box.y1)), textBottom) - 2;
  const x = Math.max(28, left);
  const y = Math.max(28, bottom);
  const width = Math.min(page.width - 24, right) - x;
  const height = Math.min(page.height - 24, top) - y;
  if (width < 40 || height < 16) return null;
  return { x, y, width, height };
}

export async function renderFigures(pdfPath: string, extracts: ParsedExtract[]): Promise<void> {
  const pending = extracts.flatMap((extract) => extract.figures);
  if (pending.length === 0) return;
  const bytes = await readFile(pdfPath);
  const document = await getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    wasmUrl: pdfWasmUrl(),
    useWasm: false,
  }).promise;
  const rendered = new Map<number, { canvas: Canvas; viewport: PageViewport }>();
  for (const figure of pending) {
    let page = rendered.get(figure.page);
    if (!page) {
      const pdfPage = await document.getPage(figure.page);
      const viewport = pdfPage.getViewport({ scale: SCALE });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await pdfPage.render({
        canvas: null,
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;
      page = { canvas, viewport };
      rendered.set(figure.page, page);
    }
    const [x1, y1] = page.viewport.convertToViewportPoint(figure.x, figure.y) as number[];
    const [x2, y2] = page.viewport.convertToViewportPoint(figure.x + figure.width, figure.y + figure.height) as number[];
    const left = Math.max(0, Math.min(x1, x2));
    const top = Math.max(0, Math.min(y1, y2));
    const width = Math.min(page.canvas.width - left, Math.abs(x2 - x1));
    const height = Math.min(page.canvas.height - top, Math.abs(y2 - y1));
    const crop = createCanvas(Math.ceil(width), Math.ceil(height));
    crop.getContext("2d").drawImage(page.canvas, left, top, width, height, 0, 0, width, height);
    figure.png = crop.toBuffer("image/png");
    figure.pixelWidth = crop.width;
    figure.pixelHeight = crop.height;
  }
}

export function emptyFigure(page: number, clip: { x: number; y: number; width: number; height: number }): FigureClip {
  return { page, ...clip, png: Buffer.alloc(0), pixelWidth: 0, pixelHeight: 0 };
}
