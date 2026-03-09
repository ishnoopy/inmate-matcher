"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { DocumentViewer } from "@/components/document-viewer";
import { PdfViewer } from "@/components/pdf-viewer";
import { ReviewSidebar } from "@/components/review-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";

interface ReviewEntry {
  id: number;
  extractedName: string;
  matchedInmateId: string;
  matchedInmateName: string;
  county: string;
  matchScore: number;
  scoringBasis?: string | null;
  status: string;
  emailSent?: boolean;
  inmateDob?: string | null;
  inmateBookingNum?: string | null;
}

interface DocumentData {
  id: string;
  filename: string;
  extractedText: string;
  templateType: string | null;
  pageCount: number;
  createdAt: string;
}

interface DocumentReviewClientProps {
  document: DocumentData;
  initialEntries: ReviewEntry[];
}

const TEMPLATE_LABELS: Record<string, string> = {
  booking_summary: "Booking Summary",
  court_docket_notice: "Court Docket Notice",
  vehicle_crash_report: "Vehicle Crash Report",
  unknown: "Unknown Document",
};

type ViewMode = "pdf" | "text";

export function DocumentReviewClient({
  document,
  initialEntries,
}: DocumentReviewClientProps) {
  const [entries, setEntries] = React.useState<ReviewEntry[]>(initialEntries);
  const [updatingId, setUpdatingId] = React.useState<number | null>(null);
  const [sendingEmailId, setSendingEmailId] = React.useState<number | null>(null);
  const [viewMode, setViewMode] = React.useState<ViewMode>("pdf");

  const highlightNames = React.useMemo(
    () => entries.map((e) => e.extractedName),
    [entries]
  );

  const pendingCount = entries.filter((e) => e.status === "pending").length;

  const handleStatusChange = async (
    entryId: number,
    status: "confirmed" | "rejected"
  ) => {
    setUpdatingId(entryId);
    try {
      const res = await fetch(`/api/review/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        setEntries((prev) =>
          prev.map((e) => (e.id === entryId ? { ...e, status } : e))
        );
        toast.success(`Match ${status === "confirmed" ? "confirmed" : "rejected"}`);
      } else {
        toast.error("Failed to update status");
      }
    } catch {
      toast.error("Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSendEmail = async (entryId: number) => {
    setSendingEmailId(entryId);
    try {
      const res = await fetch(`/api/review/${entryId}/email`, {
        method: "POST",
      });

      const data = await res.json();

      if (data.ok) {
        setEntries((prev) =>
          prev.map((e) => (e.id === entryId ? { ...e, emailSent: true } : e))
        );
        toast.success("Email sent successfully!");
      } else {
        toast.error(data.error || "Failed to send email");
      }
    } catch {
      toast.error("Failed to send email");
    } finally {
      setSendingEmailId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeftIcon className="size-4 mr-1" />
                  Back
                </Button>
              </Link>
              <div className="h-6 w-px bg-border" />
              <div>
                <h1 className="text-sm font-semibold text-foreground">
                  {document.filename}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {document.pageCount} page
                  {document.pageCount !== 1 ? "s" : ""} ·{" "}
                  {document.templateType
                    ? TEMPLATE_LABELS[document.templateType] ??
                      document.templateType
                    : "Unknown"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Badge variant={pendingCount > 0 ? "default" : "secondary"}>
                {pendingCount} pending review{pendingCount !== 1 ? "s" : ""}
              </Badge>
              <Link href="/review">
                <Button variant="outline" size="sm">
                  View All Pending
                </Button>
              </Link>
              <div className="border-l border-border pl-4">
                <UserMenu />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Document View */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">
                {viewMode === "pdf" ? "Document View" : "Extracted Text"}
              </h2>
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <button
                  onClick={() => setViewMode("pdf")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    viewMode === "pdf"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <PdfIcon className="size-3.5" />
                    PDF
                  </span>
                </button>
                <button
                  onClick={() => setViewMode("text")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    viewMode === "text"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <TextIcon className="size-3.5" />
                    Text
                  </span>
                </button>
              </div>
            </div>

            {viewMode === "pdf" ? (
              <PdfViewer
                documentId={document.id}
                highlightNames={highlightNames}
              />
            ) : (
              <DocumentViewer
                text={document.extractedText}
                highlightNames={highlightNames}
              />
            )}
          </div>

          {/* Sidebar with matches */}
          <div className="lg:col-span-1">
            <ReviewSidebar
              entries={entries}
              onStatusChange={handleStatusChange}
              onSendEmail={handleSendEmail}
              isUpdating={updatingId}
              isSendingEmail={sendingEmailId}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function PdfIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm4.75 6.5a.75.75 0 0 0-1.5 0v5a.75.75 0 0 0 1.5 0v-5Zm2.5 0a.75.75 0 0 0-1.5 0v5a.75.75 0 0 0 1.5 0v-5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function TextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M2 3.5A1.5 1.5 0 0 1 3.5 2h13A1.5 1.5 0 0 1 18 3.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 16.5v-13ZM5.75 6a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Zm0 3.5a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5ZM5 13.25a.75.75 0 0 1 .75-.75h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1-.75-.75Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
