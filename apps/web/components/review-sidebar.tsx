"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ScoringBasis } from "@/lib/matching/scoreUtils";
import { getMatchedTokensSummary, interpretScore } from "@/lib/matching/scoreUtils";
import { cn } from "@/lib/utils";
import { User } from "lucide-react";
import Image from "next/image";
import * as React from "react";

const IS_EMAILING_ENABLED = process.env.NEXT_PUBLIC_IS_EMAILING_ENABLED === "true";

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

interface ReviewSidebarProps {
  entries: ReviewEntry[];
  onStatusChange: (entryId: number, status: "confirmed" | "rejected") => void;
  onSendEmail?: (entryId: number) => void;
  isUpdating?: number | null;
  isSendingEmail?: number | null;
}

const COUNTY_LABELS: Record<string, string> = {
  madison: "Madison County",
  limestone: "Limestone County",
};

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

export function ReviewSidebar({
  entries,
  onStatusChange,
  onSendEmail,
  isUpdating,
  isSendingEmail,
}: ReviewSidebarProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Matched Inmates ({entries.length})
        </h3>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matches to review.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => (
            <MatchCard
              key={entry.id}
              entry={entry}
              onStatusChange={onStatusChange}
              onSendEmail={onSendEmail}
              isUpdating={isUpdating === entry.id}
              isSendingEmail={isSendingEmail === entry.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MatchCard({
  entry,
  onStatusChange,
  onSendEmail,
  isUpdating,
  isSendingEmail,
}: {
  entry: ReviewEntry;
  onStatusChange: (entryId: number, status: "confirmed" | "rejected") => void;
  onSendEmail?: (entryId: number) => void;
  isUpdating?: boolean;
  isSendingEmail?: boolean;
}) {

  const [imgError, setImgError] = React.useState(false);
  const [showScoringBasis, setShowScoringBasis] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  // Build photo URL from matched inmate ID
  const photoUrl = !imgError
    ? `/api/photos/${entry.county}/${entry.matchedInmateId.split(":")[1]}.jpg`
    : null;

  const countyLabel = COUNTY_LABELS[entry.county] ?? entry.county;
  const scoreInterpretation = interpretScore(entry.matchScore);

  // Parse scoring basis if available
  let scoringBasis: ScoringBasis | null = null;
  if (entry.scoringBasis) {
    try {
      scoringBasis = JSON.parse(entry.scoringBasis) as ScoringBasis;
    } catch {
      // Invalid JSON, ignore
    }
  }

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-600 border-yellow-200",
    confirmed: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    rejected: "bg-destructive/10 text-destructive border-destructive/20",
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex gap-3 p-3">
        {/* Thumbnail — click to expand */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className={cn(
                "relative w-32 h-40 bg-muted rounded overflow-hidden shrink-0 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                photoUrl && "cursor-zoom-in"
              )}
              disabled={!photoUrl}
              title={photoUrl ? "Click to enlarge" : undefined}
              aria-label={photoUrl ? "Enlarge photo" : undefined}
            >
              {photoUrl ? (
                <Image
                  src={photoUrl}
                  alt={`Mugshot of ${entry.matchedInmateName}`}
                  fill
                  className="object-cover object-top"
                  onError={() => setImgError(true)}
                  sizes="128px"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <User className="size-10 text-muted-foreground/30" />
                </div>
              )}
            </button>
          </DialogTrigger>
          <DialogContent
            className="max-w-2xl border-0 bg-black/95 p-4 gap-0 overflow-hidden text-white"
            showCloseButton={true}
          >
            <DialogTitle className="sr-only">
              Mugshot of {entry.matchedInmateName}
            </DialogTitle>
            {photoUrl && (
              <div className="relative max-h-[85vh] w-full aspect-3/4">
                <Image
                  src={photoUrl}
                  alt={`Mugshot of ${entry.matchedInmateName}`}
                  fill
                  className="object-contain"
                  sizes="(max-width: 672px) 100vw, 672px"
                />
                <p className="absolute -bottom-10 left-0 right-0 text-center text-sm text-white/90">
                  {entry.matchedInmateName}
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <CardTitle className="text-sm leading-tight truncate">
            {entry.matchedInmateName}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            Matched: &quot;{entry.extractedName}&quot;
          </p>

          {/* Inmate details */}
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 mt-2 text-[11px]">
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
            <Badge variant="secondary" className="text-[10px]">
              {countyLabel}
            </Badge>
            {/* Score with interpretation */}
            <button
              type="button"
              onClick={() => setShowScoringBasis(!showScoringBasis)}
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-sm font-medium cursor-pointer hover:opacity-80 transition-opacity",
                scoreInterpretation.bgColor,
                scoreInterpretation.textColor
              )}
              title={`${scoreInterpretation.description}. Click to ${showScoringBasis ? "hide" : "show"} scoring details.`}
            >
              {scoreInterpretation.label} ({entry.matchScore})
            </button>
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-sm font-medium border",
                statusColors[entry.status] || statusColors.pending
              )}
            >
              {entry.status}
            </span>
            {entry.emailSent && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
                Alert Email Sent
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Scoring Basis Details */}
      {showScoringBasis && scoringBasis && (
        <div className="px-3 pb-3 pt-0">
          <div className="bg-muted/50 rounded p-2 text-[10px] space-y-1">
            <p className="font-medium text-foreground">Scoring Basis:</p>
            <p className="text-muted-foreground">
              <span className="font-medium">Matched tokens:</span>{" "}
              {getMatchedTokensSummary(scoringBasis.matchedTokens)}
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium">Extracted:</span> {scoringBasis.extractedNormalized}
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium">Roster:</span> {scoringBasis.rosterNormalized}
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      {entry.status === "pending" && (
        <div className="flex border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 rounded-md text-xs text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
            onClick={() => onStatusChange(entry.id, "confirmed")}
            disabled={isUpdating}
          >
            {isUpdating ? "..." : "Confirm"}
          </Button>
          <div className="w-px bg-border" />
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 rounded-md text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
            onClick={() => onStatusChange(entry.id, "rejected")}
            disabled={isUpdating}
          >
            {isUpdating ? "..." : "Reject"}
          </Button>
          {IS_EMAILING_ENABLED && onSendEmail && !entry.emailSent && (
            <>
              <div className="w-px bg-border" />
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 rounded-md text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                onClick={() => onSendEmail(entry.id)}
                disabled={isSendingEmail}
              >
                {isSendingEmail ? "..." : "Email"}
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
