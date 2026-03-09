"use client";

import { Button } from "@/components/ui/button";
import * as React from "react";

interface PdfViewerProps {
  documentId: string;
  highlightNames: string[];
}

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface TextItemWithPosition {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  startIndex: number;
  endIndex: number;
}

export function PdfViewer({ documentId, highlightNames }: PdfViewerProps) {
  const [pdfDoc, setPdfDoc] = React.useState<any>(null);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [scale, setScale] = React.useState(1.25);

  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const highlightCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Load PDF.js dynamically
  React.useEffect(() => {
    let isMounted = true;

    async function loadPdf() {
      try {
        setIsLoading(true);
        setError(null);

        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const pdfUrl = `/api/documents/${documentId}/pdf`;
        const loadingTask = pdfjs.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;

        if (isMounted) {
          setPdfDoc(pdf);
          setTotalPages(pdf.numPages);
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load PDF");
          setIsLoading(false);
        }
      }
    }

    loadPdf();

    return () => {
      isMounted = false;
    };
  }, [documentId]);

  // Render current page
  React.useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !highlightCanvasRef.current) return;

    let isMounted = true;

    async function renderPage() {
      try {
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current!;
        const highlightCanvas = highlightCanvasRef.current!;
        const context = canvas.getContext("2d")!;
        const highlightContext = highlightCanvas.getContext("2d")!;

        canvas.height = viewport.height;
        canvas.width = viewport.width;
        highlightCanvas.height = viewport.height;
        highlightCanvas.width = viewport.width;

        // Render PDF page
        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise;

        // Get text content for highlighting
        const textContent = await page.getTextContent();
        highlightContext.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);

        if (highlightNames.length > 0 && isMounted) {
          // Build a list of text items with their positions in viewport coordinates
          const textItems: TextItemWithPosition[] = [];
          let fullText = "";

          for (const item of textContent.items) {
            if (!("str" in item)) continue;
            const textItem = item as TextItem;
            const str = textItem.str;

            if (!str) continue;

            // Get the transform matrix values
            const tx = textItem.transform[4];
            const ty = textItem.transform[5];
            const fontSize = Math.abs(textItem.transform[0]) || 12;

            // Convert PDF coordinates to viewport coordinates
            const [x, y] = viewport.convertToViewportPoint(tx, ty);

            // Estimate dimensions
            const itemWidth = textItem.width * scale;
            const itemHeight = fontSize * scale;

            textItems.push({
              str,
              x,
              y: y - itemHeight, // Adjust y since PDF coordinates are from baseline
              width: itemWidth,
              height: itemHeight * 1.3, // Add some padding
              startIndex: fullText.length,
              endIndex: fullText.length + str.length,
            });

            fullText += str + " ";
          }

          // Sort names by length (longest first) to avoid partial matches
          const sortedNames = [...highlightNames].sort((a, b) => b.length - a.length);

          // Generate all variations of each name for matching
          const nameVariations: string[] = [];
          for (const name of sortedNames) {
            nameVariations.push(name);

            // Handle "LAST, FIRST" format -> also search for "FIRST LAST"
            if (name.includes(",")) {
              const parts = name.split(",").map((p) => p.trim());
              if (parts.length === 2) {
                nameVariations.push(`${parts[1]} ${parts[0]}`);
              }
            }

            // Handle "FIRST LAST" format -> also search for "LAST, FIRST"
            const spaceParts = name.trim().split(/\s+/);
            if (spaceParts.length >= 2 && !name.includes(",")) {
              const last = spaceParts[spaceParts.length - 1];
              const first = spaceParts.slice(0, -1).join(" ");
              nameVariations.push(`${last}, ${first}`);
              nameVariations.push(`${last},${first}`);
            }

            // Also add individual parts for partial matching (first name, last name)
            const words = name.replace(/,/g, " ").trim().split(/\s+/).filter((w) => w.length > 2);
            nameVariations.push(...words);
          }

          // Deduplicate and sort by length
          const uniqueVariations = [...new Set(nameVariations)].sort((a, b) => b.length - a.length);

          // Create regex pattern for finding names in the full text
          const escapedNames = uniqueVariations.map((name) =>
            name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          );
          const pattern = new RegExp(`(${escapedNames.join("|")})`, "gi");

          // Find all matches in the full text
          const matches: { start: number; end: number; text: string }[] = [];
          let match;
          while ((match = pattern.exec(fullText)) !== null) {
            matches.push({
              start: match.index,
              end: match.index + match[0].length,
              text: match[0],
            });
          }

          // Draw highlights
          highlightContext.fillStyle = "rgba(255, 235, 59, 0.5)";
          highlightContext.strokeStyle = "rgba(255, 193, 7, 1)";
          highlightContext.lineWidth = 2;

          // For each match, find which text items overlap and highlight them
          for (const m of matches) {
            const overlappingItems = textItems.filter(
              (item) => item.endIndex > m.start && item.startIndex < m.end
            );

            for (const item of overlappingItems) {
              highlightContext.fillRect(item.x, item.y, item.width, item.height);
              highlightContext.strokeRect(item.x, item.y, item.width, item.height);
            }
          }

          // Also check individual text items for direct matches (handles cases where
          // names appear exactly as a single text item)
          for (const item of textItems) {
            const itemText = item.str.trim();
            if (!itemText) continue;

            for (const name of uniqueVariations) {
              // Check if this item contains the name (case insensitive)
              if (itemText.toLowerCase().includes(name.toLowerCase())) {
                highlightContext.fillRect(item.x, item.y, item.width, item.height);
                highlightContext.strokeRect(item.x, item.y, item.width, item.height);
                break;
              }
            }
          }
        }

        page.cleanup();
      } catch (err) {
        console.error("Error rendering page:", err);
      }
    }

    renderPage();

    return () => {
      isMounted = false;
    };
  }, [pdfDoc, currentPage, scale, highlightNames]);

  const goToPrevPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const goToNextPage = () => setCurrentPage((p) => Math.min(totalPages, p + 1));
  const zoomIn = () => setScale((s) => Math.min(3, s + 0.25));
  const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.25));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96 bg-muted/30 border border-border rounded-lg">
        <div className="flex flex-col items-center gap-2">
          <LoadingSpinner className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96 bg-destructive/5 border border-destructive/20 rounded-lg">
        <div className="flex flex-col items-center gap-2 text-center px-4">
          <ErrorIcon className="size-8 text-destructive" />
          <p className="text-sm font-medium text-destructive">Failed to load PDF</p>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap bg-muted/50 border border-border rounded-lg px-4 py-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="text-sm text-foreground min-w-[100px] text-center">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={goToNextPage}
            disabled={currentPage >= totalPages}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={zoomOut} disabled={scale <= 0.5}>
            <MinusIcon className="size-4" />
          </Button>
          <span className="text-sm text-muted-foreground min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button variant="outline" size="sm" onClick={zoomIn} disabled={scale >= 3}>
            <PlusIcon className="size-4" />
          </Button>
        </div>

        {highlightNames.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block w-3 h-3 bg-yellow-300/60 border border-yellow-500 rounded-sm" />
            <span>{highlightNames.length} name(s) highlighted</span>
          </div>
        )}
      </div>

      {/* PDF Canvas */}
      <div
        ref={containerRef}
        className="relative overflow-auto bg-muted/30 border border-border rounded-lg max-h-[70vh]"
      >
        <div className="relative inline-block min-w-full p-4">
          <canvas ref={canvasRef} className="shadow-lg mx-auto block" />
          <canvas
            ref={highlightCanvasRef}
            className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none"
            style={{ mixBlendMode: "multiply" }}
          />
        </div>
      </div>
    </div>
  );
}

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-1.72 6.97a.75.75 0 1 0-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06L12 13.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L13.06 12l1.72-1.72a.75.75 0 1 0-1.06-1.06L12 10.94l-1.72-1.72Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function MinusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M6.75 9.25a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M10.75 6.75a.75.75 0 0 0-1.5 0v2.5h-2.5a.75.75 0 0 0 0 1.5h2.5v2.5a.75.75 0 0 0 1.5 0v-2.5h2.5a.75.75 0 0 0 0-1.5h-2.5v-2.5Z" />
    </svg>
  );
}
