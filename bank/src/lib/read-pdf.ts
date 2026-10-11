import { readFile } from "node:fs/promises";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { GraphicBox } from "./figures";
import { textRows, type PdfItem, type TextRow } from "./lines";

export type ReadPage = {
  page: number;
  lines: string[];
  rows: TextRow[];
  boxes: GraphicBox[];
  width: number;
  height: number;
  hasFigure: boolean;
};

function pageBoxes(
  operators: { fnArray: number[]; argsArray: unknown[] },
  pageWidth: number,
  pageHeight: number,
): GraphicBox[] {
  const boxes: GraphicBox[] = [];
  for (let index = 0; index < operators.fnArray.length; index += 1) {
    if (operators.fnArray[index] !== OPS.constructPath) continue;
    const minMax = (operators.argsArray[index] as [number, unknown, Float32Array | null])[2];
    if (!minMax || minMax.length < 4) continue;
    const x0 = Math.min(minMax[0], minMax[2]);
    const y0 = Math.min(minMax[1], minMax[3]);
    const x1 = Math.max(minMax[0], minMax[2]);
    const y1 = Math.max(minMax[1], minMax[3]);
    const width = x1 - x0;
    const height = y1 - y0;
    if (x0 < 0 || y0 < 0 || x1 > pageWidth + 8 || y1 > pageHeight + 8) continue;
    if (width > pageWidth - 40 && height > pageHeight - 80) continue;
    if (width < 80 || height < 24) continue;
    boxes.push({ x0, y0, x1, y1 });
  }
  return boxes;
}

const IMAGE_OPS = new Set<number>(
  [
    OPS.paintImageXObject,
    OPS.paintInlineImageXObject,
    OPS.paintImageXObjectRepeat,
    OPS.paintXObject,
  ].filter((value): value is number => typeof value === "number"),
);

export async function readPdf(
  path: string,
  dropLoneNumbers: boolean,
): Promise<{ pages: ReadPage[]; pearsonCode: string }> {
  const bytes = await readFile(path);
  const document = await getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
  }).promise;
  const pages: ReadPage[] = [];
  let pearsonCode = "";
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    if (!pearsonCode) {
      for (const item of content.items as PdfItem[]) {
        const code = item.str?.match(/P\d{4,}A/i)?.[0];
        if (code) pearsonCode = code.toUpperCase();
      }
    }
    const view = page.view;
    const width = view[2] - view[0];
    const height = view[3] - view[1];
    let boxes: GraphicBox[] = [];
    let hasFigure = false;
    try {
      const operators = await page.getOperatorList();
      let paths = 0;
      for (const fn of operators.fnArray) {
        if (IMAGE_OPS.has(fn)) hasFigure = true;
        if (fn === OPS.constructPath) paths += 1;
      }
      boxes = pageBoxes(operators, width, height);
      if (paths > 80 || boxes.length > 0) hasFigure = true;
    } catch {
      hasFigure = false;
    }
    const rows = textRows(content.items as PdfItem[], { dropLoneNumbers });
    pages.push({
      page: pageNumber,
      lines: rows.map((row) => row.text),
      rows,
      boxes,
      width,
      height,
      hasFigure,
    });
  }
  return { pages, pearsonCode };
}
