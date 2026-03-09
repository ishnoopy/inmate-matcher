"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { interpretScore } from "@/lib/matching/scoreUtils";
import { UserMenu } from "@/components/user-menu";

interface ReviewEntry {
  id: number;
  documentId: string;
  documentFilename: string;
  extractedName: string;
  matchedInmateId: string;
  matchedInmateName: string;
  county: string;
  matchScore: number;
  status: string;
  inmateDob?: string | null;
  inmateBookingNum?: string | null;
  createdAt: string;
}

interface StatusCounts {
  all: number;
  pending: number;
  confirmed: number;
  rejected: number;
}

interface ReviewQueueClientProps {
  initialEntries: ReviewEntry[];
  initialCounts: StatusCounts;
}

function formatDob(dob: string): string {
  try {
    return new Date(dob).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return dob;
  }
}

const COUNTY_LABELS: Record<string, string> = {
  madison: "Madison County",
  limestone: "Limestone County",
};

type FilterStatus = "all" | "pending" | "confirmed" | "rejected";

const FILTER_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "rejected", label: "Rejected" },
];

export function ReviewQueueClient({ initialEntries, initialCounts }: ReviewQueueClientProps) {
  const [entries, setEntries] = React.useState<ReviewEntry[]>(initialEntries);
  const [counts, setCounts] = React.useState<StatusCounts>(initialCounts);
  const [filter, setFilter] = React.useState<FilterStatus>("pending");
  const [updatingId, setUpdatingId] = React.useState<number | null>(null);

  const filteredEntries = React.useMemo(() => {
    if (filter === "all") return entries;
    return entries.filter((e) => e.status === filter);
  }, [entries, filter]);

  const handleStatusChange = async (
    entryId: number,
    newStatus: "confirmed" | "rejected"
  ) => {
    setUpdatingId(entryId);
    try {
      const res = await fetch(`/api/review/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        const entry = entries.find((e) => e.id === entryId);
        setEntries((prev) =>
          prev.map((e) => (e.id === entryId ? { ...e, status: newStatus } : e))
        );
        setCounts((prev) => {
          const oldStatus = entry?.status as keyof StatusCounts;
          return {
            ...prev,
            [oldStatus]: prev[oldStatus] - 1,
            [newStatus]: prev[newStatus as keyof StatusCounts] + 1,
          };
        });
        toast.success(`Match ${newStatus === "confirmed" ? "confirmed" : "rejected"}`);
      } else {
        toast.error("Failed to update status");
      }
    } catch {
      toast.error("Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeftIcon className="size-4" />
              <span className="text-sm font-medium">Dashboard</span>
            </Link>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-semibold tracking-tight">Review Queue</h1>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {counts.pending} Pending
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-4">
             {/* Filter Tabs - Compact */}
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 border border-border/50">
                {FILTER_OPTIONS.map((option) => {
                  const count = counts[option.value];
                  const isActive = filter === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setFilter(option.value)}
                      className={cn(
                        "px-2.5 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1.5",
                        isActive
                          ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      {option.label}
                      {count > 0 && (
                        <span
                            className={cn(
                            "text-[9px] px-1 rounded-full min-w-[14px] h-[14px] flex items-center justify-center",
                            isActive
                                ? "bg-primary/10 text-primary"
                                : "bg-muted-foreground/10 text-muted-foreground"
                            )}
                        >
                            {count}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
            <div className="border-l border-border pl-4">
              <UserMenu />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            {filter === "pending" && counts.all > 0 ? (
              <>
                <CheckCircleIcon className="size-12 text-green-500 mb-4" />
                <h2 className="text-lg font-semibold text-foreground mb-1">
                  All caught up!
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  No pending matches to review.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setFilter("all")}>
                    View All Entries
                  </Button>
                  <Link href="/">
                    <Button>Upload New Document</Button>
                  </Link>
                </div>
              </>
            ) : counts.all === 0 ? (
              <>
                <EmptyIcon className="size-12 text-muted-foreground/40 mb-4" />
                <h2 className="text-lg font-semibold text-foreground mb-1">
                  No entries yet
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload a document to start matching names.
                </p>
                <Link href="/">
                  <Button>Upload Document</Button>
                </Link>
              </>
            ) : (
              <>
                <FilterIcon className="size-12 text-muted-foreground/40 mb-4" />
                <h2 className="text-lg font-semibold text-foreground mb-1">
                  No {filter} entries
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Try changing the filter to see more entries.
                </p>
                <Button variant="outline" onClick={() => setFilter("all")}>
                  View All Entries
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filteredEntries.map((entry) => (
              <ReviewEntryCard
                key={entry.id}
                entry={entry}
                onStatusChange={handleStatusChange}
                isUpdating={updatingId === entry.id}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ReviewEntryCard({
  entry,
  onStatusChange,
  isUpdating,
}: {
  entry: ReviewEntry;
  onStatusChange: (entryId: number, status: "confirmed" | "rejected") => void;
  isUpdating?: boolean;
}) {
  const [imgError, setImgError] = React.useState(false);

  const photoUrl = !imgError
    ? `/api/photos/${entry.county}/${entry.matchedInmateId.split(":")[1]}.jpg`
    : null;

  const countyLabel = COUNTY_LABELS[entry.county] ?? entry.county;
  const formattedDate = new Date(entry.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        {/* Photo */}
        <div className="relative w-full sm:w-24 h-32 sm:h-auto bg-muted shrink-0">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={`Mugshot of ${entry.matchedInmateName}`}
              fill
              className="object-cover object-top"
              onError={() => setImgError(true)}
              sizes="(max-width: 640px) 100vw, 96px"
            />
          ) : (
            <div className="flex h-full min-h-32 items-center justify-center">
              <PlaceholderAvatarIcon className="size-12 text-muted-foreground/30" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base leading-tight">
                {entry.matchedInmateName}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Matched from: &quot;{entry.extractedName}&quot;
              </p>

              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 mt-2 text-xs">
                <span className="text-muted-foreground">DOB</span>
                <span className="font-medium truncate">
                  {entry.inmateDob ? formatDob(entry.inmateDob) : "—"}
                </span>
                <span className="text-muted-foreground">Booking #</span>
                <span className="font-medium font-mono truncate">
                  {entry.inmateBookingNum || "—"}
                </span>
              </div>

              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  {countyLabel}
                </Badge>
                <ScoreBadge matchScore={entry.matchScore} />
                <StatusBadge status={entry.status} />
              </div>

              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <DocumentIcon className="size-3.5" />
                <Link
                  href={`/review/${entry.documentId}`}
                  className="hover:underline"
                >
                  {entry.documentFilename}
                </Link>
                <span>·</span>
                <span>{formattedDate}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex sm:flex-col gap-2">
              {entry.status === "pending" ? (
                <>
                  <Button
                    size="sm"
                    className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => onStatusChange(entry.id, "confirmed")}
                    disabled={isUpdating}
                  >
                    {isUpdating ? "..." : "Confirm Match"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 sm:flex-none text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
                    onClick={() => onStatusChange(entry.id, "rejected")}
                    disabled={isUpdating}
                  >
                    {isUpdating ? "..." : "Reject"}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onStatusChange(entry.id, entry.status === "confirmed" ? "rejected" : "confirmed")}
                  disabled={isUpdating}
                >
                  {isUpdating ? "..." : `Mark as ${entry.status === "confirmed" ? "Rejected" : "Confirmed"}`}
                </Button>
              )}
              <Link href={`/review/${entry.documentId}`}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full"
                >
                  View Document
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function PlaceholderAvatarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function EmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z"
      />
    </svg>
  );
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z"
      />
    </svg>
  );
}

function ScoreBadge({ matchScore }: { matchScore: number }) {
  const interpretation = interpretScore(matchScore);
  return (
    <Badge
      variant="outline"
      className={cn("text-xs", interpretation.bgColor, interpretation.textColor)}
      title={interpretation.description}
    >
      {interpretation.label} ({matchScore})
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; className: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    pending: {
      label: "Pending",
      className: "bg-yellow-500/10 text-yellow-600 border-yellow-200 hover:bg-yellow-500/20",
      variant: "outline",
    },
    confirmed: {
      label: "Confirmed",
      className: "bg-emerald-500/10 text-emerald-600 border-emerald-200 hover:bg-emerald-500/20",
      variant: "outline",
    },
    rejected: {
      label: "Rejected",
      className: "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20",
      variant: "outline",
    },
  };

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 border h-5 font-medium", config.className)}>
      {config.label}
    </Badge>
  );
}
