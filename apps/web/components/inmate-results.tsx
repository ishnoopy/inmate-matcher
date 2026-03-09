"use client";

import type { MatchedInmate } from "@/app/lib/matching/matchInmates";
import type { TemplateType } from "@/app/lib/pipeline/detectTemplateType";
import type { CandidateName } from "@/app/lib/pipeline/extractNames";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMatchedTokensSummary, interpretScore } from "@/lib/matching/scoreUtils";
import Image from "next/image";
import * as React from "react";

interface InmateResultsProps {
  templateType?: TemplateType;
  names?: CandidateName[];
  matches?: MatchedInmate[];
  filename?: string;
  pageCount?: number;
}

const TEMPLATE_LABELS: Record<string, string> = {
  booking_summary: "Booking Summary",
  court_docket_notice: "Court Docket Notice",
  vehicle_crash_report: "Vehicle Crash Report",
  unknown: "Unknown Document",
};

const COUNTY_LABELS: Record<string, string> = {
  madison: "Madison County",
  limestone: "Limestone County",
};

export function InmateResults({
  templateType,
  names = [],
  matches = [],
  filename,
  pageCount,
}: InmateResultsProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* Document Summary */}
      <div className="flex flex-col gap-2 border-b border-border pb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {filename ?? "Uploaded Document"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {pageCount ? `${pageCount} page${pageCount !== 1 ? "s" : ""}` : ""}
              {pageCount && templateType ? " · " : ""}
              {templateType ? TEMPLATE_LABELS[templateType] ?? templateType : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary">
              {names.length} name{names.length !== 1 ? "s" : ""} extracted
            </Badge>
            <Badge variant={matches.length > 0 ? "default" : "outline"}>
              {matches.length} roster match{matches.length !== 1 ? "es" : ""}
            </Badge>
          </div>
        </div>

        {/* Extracted names list */}
        {names.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">
              Extracted names
            </p>
            <div className="flex flex-wrap gap-1.5">
              {names.map((p, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-xs"
                >
                  <span className="text-foreground">{p.name}</span>
                  {p.role && (
                    <span className="text-muted-foreground">· {p.role}</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Matched Inmates */}
      {matches.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <NoMatchIcon className="size-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">
            No roster matches found
          </p>
          <p className="text-xs text-muted-foreground">
            None of the extracted names matched inmates in Madison or Limestone County rosters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
          {matches.map((inmate) => (
            <InmateCard key={inmate.id} inmate={inmate} />
          ))}
        </div>
      )}
    </div>
  );
}

function InmateCard({ inmate }: { inmate: MatchedInmate }) {
  const [imgError, setImgError] = React.useState(false);
  const [showScoringBasis, setShowScoringBasis] = React.useState(false);

  const photoPath = inmate.photoUrls?.[0];
  // photoUrls are like "photos/limestone/{hash}.jpg" — extract county and filename
  const photoMatch = photoPath?.match(/^photos\/([^/]+)\/([^/]+\.jpg)$/i);
  const photoUrl =
    photoMatch && !imgError
      ? `/api/photos/${photoMatch[1]}/${photoMatch[2]}`
      : null;

  const countyLabel = COUNTY_LABELS[inmate.source] ?? inmate.source;
  const scoreInterpretation = interpretScore(inmate.score);

  return (
    <Card className="overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 border-border/60">
      {/* Mugshot */}
      <div className="relative aspect-3/4 min-h-[280px] w-full bg-muted/30 overflow-hidden border-b border-border/60">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt={`Mugshot of ${inmate.fullNameRaw}`}
            fill
            className="object-cover object-top"
            onError={() => setImgError(true)}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <PlaceholderAvatarIcon className="size-16 text-muted-foreground/30" />
          </div>
        )}
        {/* County badge overlaid on photo */}
        <div className="absolute top-3 right-3">
          <Badge
            variant="outline"
            className="text-[10px] font-medium bg-background/95 backdrop-blur shadow-sm border-transparent text-foreground px-2 py-0.5"
          >
            {countyLabel}
          </Badge>
        </div>
      </div>

      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-base font-bold leading-tight tracking-tight">{inmate.fullNameRaw}</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-2 px-4 pb-4">
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
          <div className="text-muted-foreground">DOB</div>
          <div className="font-medium text-right">{inmate.dob ? formatDob(inmate.dob) : "—"}</div>

          <div className="text-muted-foreground">Booking #</div>
          <div className="font-medium text-right font-mono">{inmate.bookingNumber || "—"}</div>

          <div className="text-muted-foreground">Source</div>
          <div className="font-medium text-right">{countyLabel}</div>
        </div>

        <div className="mt-2 pt-2 border-t border-border/50">
          <div
            className="flex items-center justify-between text-xs mb-1 cursor-pointer hover:opacity-70 transition-opacity select-none"
            onClick={() => setShowScoringBasis(!showScoringBasis)}
            title="Click to view scoring details"
          >
            <span className="text-muted-foreground underline decoration-dotted underline-offset-2">Match Confidence</span>
            <span className={`font-mono font-medium ${scoreInterpretation.bgColor}`}>{scoreInterpretation.level}</span>
          </div>
          {/* Simple progress bar for 1–5 confidence score */}
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden relative">
            <div
              className="h-full transition-all duration-500 rounded-full"
              style={{
                width: `${(Math.min(inmate.score, 5) / 5) * 100}%`,
                background:
                  inmate.score >= 4.5
                    ? "var(--color-primary)"
                    : inmate.score >= 3
                      ? "var(--color-chart-3, #c7d2fe)"
                      : "var(--color-destructive)",
              }}
            />
          </div>
        </div>

        {inmate.matchedFrom && (
          <p className="text-[10px] text-muted-foreground mt-1 truncate" title={`Matched from: ${inmate.matchedFrom}`}>
            Src: {inmate.matchedFrom}
          </p>
        )}
        {/* Scoring basis details */}
        {showScoringBasis && inmate.scoringBasis && (
          <div className="bg-muted/50 rounded p-2 text-[10px] space-y-1 mt-1 animate-in fade-in zoom-in-95 duration-200">
            <p className="font-medium text-foreground">Scoring Basis:</p>
            <p className="text-muted-foreground">
              <span className="font-medium">Matched:</span>{" "}
              {getMatchedTokensSummary(inmate.scoringBasis.matchedTokens)}
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium">Extracted:</span> {inmate.scoringBasis.extractedNormalized}
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium">Roster:</span> {inmate.scoringBasis.rosterNormalized}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
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

function PlaceholderAvatarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function NoMatchIcon({ className }: { className?: string }) {
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
        d="m15.75 15.75-2.489-2.489m0 0a3.375 3.375 0 1 0-4.773-4.773 3.375 3.375 0 0 0 4.774 4.774ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}
