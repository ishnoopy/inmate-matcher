import fs from "fs/promises";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";

export type ExtractTextResult = {
  text: string;
  pageCount: number | null;
  isLikelyScanned: boolean;
  textLength: number;
};

// Ensure fake worker setup can reuse the in-process worker module in Node.
(
  globalThis as typeof globalThis & {
    pdfjsWorker?: typeof pdfjsWorker;
  }
).pdfjsWorker = pdfjsWorker;

export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<ExtractTextResult> {
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
  });
  const document = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    let pageText = "";

    for (const item of textContent.items) {
      if (!("str" in item)) {
        continue;
      }

      pageText += item.str;
      pageText += item.hasEOL ? "\n" : " ";
    }

    pages.push(pageText.trim());
    page.cleanup();
  }

  const text = pages.join("\n\n").replace(/\r\n/g, "\n").trim();
  const textLength = text.length;

  const isLikelyScanned = textLength < 200;

  await document.destroy();

  return {
    text,
    pageCount: document.numPages ?? null,
    isLikelyScanned,
    textLength,
  };
}

export async function extractTextFromPdfFile(absolutePdfPath: string): Promise<ExtractTextResult> {
  const pdfBuffer = await fs.readFile(absolutePdfPath);
  return extractTextFromPdf(pdfBuffer);
}
