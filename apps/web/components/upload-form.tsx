"use client";

import type { MatchedInmate } from "@/app/lib/matching/matchInmates";
import type { TemplateType } from "@/app/lib/pipeline/detectTemplateType";
import type { CandidateName } from "@/app/lib/pipeline/extractNames";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import * as React from "react";
import { toast } from "sonner";

export interface IngestResult {
  ok: boolean;
  documentId?: string;
  filename?: string;
  templateType?: TemplateType;
  pageCount?: number;
  textLength?: number;
  isLikelyScanned?: boolean;
  names?: CandidateName[];
  matches?: MatchedInmate[];
  error?: string;
}

const TEMPLATE_TYPE_OPTIONS: { value: TemplateType; label: string }[] = [
  { value: "booking_summary", label: "Booking Summary" },
  { value: "court_docket_notice", label: "Court Docket Notice" },
  { value: "vehicle_crash_report", label: "Vehicle Crash Report" },
  { value: "unknown", label: "Other (unknown)" },
];

function getTemplateLabel(type: TemplateType): string {
  return TEMPLATE_TYPE_OPTIONS.find((opt) => opt.value === type)?.label ?? "Unknown";
}

interface UploadFormProps {
  onResult: (result: IngestResult) => void;
  onReset: () => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  requireTypeConfirmation?: boolean;
}

export function UploadForm({
  onResult,
  onReset,
  isLoading,
  setIsLoading,
  requireTypeConfirmation = false,
}: UploadFormProps) {
  const [dragActive, setDragActive] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [showTypeDialog, setShowTypeDialog] = React.useState(false);
  const [detectedType, setDetectedType] = React.useState<TemplateType | null>(null);
  const [selectedType, setSelectedType] = React.useState<TemplateType | null>(null);
  const [isDetecting, setIsDetecting] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handleDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    if (e.type === "dragleave") setDragActive(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === "application/pdf") {
      setSelectedFile(file);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) return;

    if (requireTypeConfirmation) {
      await detectTypeAndShowDialog();
      return;
    }

    await processDocument();
  }

  async function detectTypeAndShowDialog() {
    if (!selectedFile) return;

    setIsDetecting(true);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const res = await fetch("/api/detect-type", { method: "POST", body: form });
      const data = await res.json();

      if (data.ok && data.detectedType) {
        setDetectedType(data.detectedType);
        setSelectedType(data.detectedType);
        setShowTypeDialog(true);
      } else {
        toast.error(data.error || "Failed to detect document type");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsDetecting(false);
    }
  }

  async function processDocument(overrideType?: TemplateType) {
    if (!selectedFile) return;

    setIsLoading(true);
    onReset();
    setShowTypeDialog(false);

    try {
      const form = new FormData();
      form.append("file", selectedFile);
      if (overrideType) {
        form.append("templateType", overrideType);
      }
      const res = await fetch("/api/ingest", { method: "POST", body: form });
      const data: IngestResult = await res.json();
      onResult(data);

      if (data.ok) {
        const matchCount = data.matches?.length ?? 0;
        if (matchCount > 0) {
          toast.success(`Found ${matchCount} match${matchCount !== 1 ? "es" : ""}!`);
        } else {
          toast.info("Document processed. No matches found.");
        }
      } else {
        toast.error(data.error || "Failed to process document");
      }
    } catch {
      onResult({ ok: false, error: "Network error. Please try again." });
      toast.error("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleConfirmType() {
    if (selectedType) {
      processDocument(selectedType);
    }
  }

  function handleClear() {
    setSelectedFile(null);
    setDetectedType(null);
    setSelectedType(null);
    onReset();
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Drop zone */}
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => !selectedFile && inputRef.current?.click()}
          className={cn(
            "relative flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed transition-all duration-200",
            "min-h-[240px] cursor-pointer select-none px-6 py-10 bg-muted/10",
            dragActive
              ? "border-primary bg-primary/5 ring-4 ring-primary/10"
              : "border-border hover:border-primary/50 hover:bg-muted/20",
            selectedFile && "cursor-default border-solid border-primary/20 bg-primary/5"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={handleFileChange}
          />

          {selectedFile ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <PdfIcon className="size-10 text-primary" />
              <p className="text-sm font-medium text-foreground">
                {selectedFile.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-center">
              <UploadIcon className="size-12 text-muted-foreground/60 mb-2" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  Drag & drop a PDF here
                </p>
                <p className="text-xs text-muted-foreground">
                  or click to browse from your computer
                </p>
              </div>
              <div className="mt-4 flex items-center gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                <span className="bg-muted px-2 py-1 rounded">PDF</span>
                <span>Max 50MB</span>
              </div>
            </div>
          )}
        </div>

        <Button
          type="submit"
          disabled={!selectedFile || isLoading || isDetecting}
          className="w-full font-semibold shadow-sm"
          size="lg"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <SpinnerIcon className="size-4 animate-spin" />
              Analyzing document…
            </span>
          ) : isDetecting ? (
            <span className="flex items-center gap-2">
              <SpinnerIcon className="size-4 animate-spin" />
              Detecting document type…
            </span>
          ) : (
            "Analyze & Match Inmates"
          )}
        </Button>
      </form>

      <Dialog open={showTypeDialog} onOpenChange={setShowTypeDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-xl">Confirm Document Type</DialogTitle>
            <DialogDescription>
              We detected a document type. Verify it&apos;s correct or choose another before analyzing.
            </DialogDescription>
          </DialogHeader>

          {/* File context */}
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
            <PdfIcon className="size-8 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {selectedFile?.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {((selectedFile?.size ?? 0) / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>

          {detectedType && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary/80 mb-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3.5"
                >
                  <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                Detected Type
              </div>
              <p className="text-base font-semibold text-foreground">
                {getTemplateLabel(detectedType)}
              </p>
            </div>
          )}

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">
              Select document type:
            </p>
            <div className="grid gap-2">
              {TEMPLATE_TYPE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "group flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all duration-150",
                    "hover:border-primary/30 hover:bg-muted/30",
                    selectedType === option.value
                      ? "border-primary bg-primary/10 ring-1 ring-primary/20"
                      : "border-border"
                  )}
                >
                  <input
                    type="radio"
                    name="templateType"
                    value={option.value}
                    checked={selectedType === option.value}
                    onChange={(e) =>
                      setSelectedType(e.target.value as TemplateType)
                    }
                    className="sr-only"
                  />
                  <div
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      selectedType === option.value
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/40 group-hover:border-muted-foreground/60"
                    )}
                  >
                    {selectedType === option.value && (
                      <svg
                        className="size-2.5 text-primary-foreground"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="text-sm font-medium">{option.label}</span>
                    {option.value === detectedType && (
                      <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                        Detected
                      </span>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowTypeDialog(false)}
              className="sm:min-w-[100px]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmType}
              disabled={!selectedType}
              className="sm:min-w-[140px]"
            >
              {selectedType === detectedType
                ? "Confirm & Analyze"
                : "Use Selected & Analyze"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PdfIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
      />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
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
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
