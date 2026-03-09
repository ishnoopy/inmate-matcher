"use client";

import { InmateResults } from "@/components/inmate-results";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { UploadForm, type IngestResult } from "@/components/upload-form";
import { UserMenu } from "@/components/user-menu";
import { BookIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";

export default function Page() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [result, setResult] = React.useState<IngestResult | null>(null);
  const [pendingCount, setPendingCount] = React.useState<number>(0);
  const [requireTypeConfirmation, setRequireTypeConfirmation] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/review/pending")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setPendingCount(data.count);
        }
      })
      .catch(() => { });
  }, [result]);

  function handleReset() {
    setResult(null);
  }

  return (
    <div className="min-h-screen bg-muted/40 text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="size-6 rounded-sm bg-primary flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4 text-primary-foreground"
                >
                  <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                  <line x1="3" x2="21" y1="9" y2="9" />
                  <line x1="9" x2="9" y1="21" y2="9" />
                </svg>
              </div>
              <h1 className="text-sm font-semibold tracking-tight">
                Inmate Matcher
              </h1>
            </div>
            <nav className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
              <Link href="/" className="text-foreground transition-colors hover:text-foreground">
                Dashboard
              </Link>
              <Link href="/review" className="transition-colors hover:text-foreground">
                Review Queue
                {pendingCount > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                    {pendingCount}
                  </Badge>
                )}
              </Link>
              <Link href="/settings" className="transition-colors hover:text-foreground">
                Settings
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="border-l border-border pl-4">
              <UserMenu />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Left Column: Upload & Actions */}
          <div className="lg:col-span-4 flex flex-col gap-6">

            <Card className="shadow-sm border-border/60">
              <CardHeader>
                <CardTitle>Upload File</CardTitle>
                <CardDescription>
                  Supports PDF format only. Max 50MB.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UploadForm
                  onResult={setResult}
                  onReset={handleReset}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                  requireTypeConfirmation={requireTypeConfirmation}
                />
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border/60">
              <CardHeader className="pb-3 pt-4 px-4 border-b border-border">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BookIcon className="size-4" /> Supported Sources
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 py-4 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-xs font-normal">Limestone County</Badge>
                  <Badge variant="secondary" className="text-xs font-normal">Madison County</Badge>
                </div>
                <ul className="space-y-1.5 text-xs">
                  {[
                    { name: "Booking Summary", county: "" },
                    { name: "Court Docket Notice", county: "" },
                    { name: "Vehicle Crash Report", county: "" },
                  ].map((item, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-muted-foreground shrink-0">{item.county}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
                  <div className="min-w-0">
                    <Label htmlFor="type-confirmation" className="text-xs font-medium cursor-pointer">
                      Confirm document type
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Override auto-detect before processing</p>
                  </div>
                  <Switch
                    id="type-confirmation"
                    checked={requireTypeConfirmation}
                    onCheckedChange={setRequireTypeConfirmation}
                    className="shrink-0"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground border-l-2 border-l-primary/30 pl-2">
                  Unsupported sources use generic matching—results may vary.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Results & Activity */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Analysis Results</h2>
              {result?.ok && (
                <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
                  Clear Results
                </Button>
              )}
            </div>

            {/* Empty State / Placeholder */}
            {!result && !isLoading && (
              <div className="flex flex-col items-center justify-center h-[400px] rounded-lg border border-dashed border-border bg-muted/10 text-center">
                <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-6 text-muted-foreground"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" x2="12" y1="18" y2="12" />
                    <line x1="9" x2="15" y1="15" y2="15" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-foreground">No Document Processed</h3>
                <p className="text-sm text-muted-foreground max-w-xs mt-1">
                  Upload a document on the left to begin analysis and inmate matching against county rosters.

                </p>
              </div>
            )}

            {/* Error state */}
            {result && !result.ok && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 flex items-start gap-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-5 text-destructive mt-0.5"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" x2="12" y1="8" y2="12" />
                  <line x1="12" x2="12.01" y1="16" y2="16" />
                </svg>
                <div>
                  <h4 className="text-sm font-semibold text-destructive">Processing Error</h4>
                  <p className="text-sm text-destructive/80 mt-1">
                    {result.error ?? "An unexpected error occurred."}
                  </p>
                </div>
              </div>
            )}

            {/* Results */}
            {result?.ok && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Card className="shadow-sm border-border/60">
                  <CardContent className="p-6">
                    <InmateResults
                      templateType={result.templateType}
                      names={result.names}
                      matches={result.matches}
                      filename={result.filename}
                      pageCount={result.pageCount}
                    />
                    {result.matches && result.matches.length > 0 && result.documentId && (
                      <div className="mt-8 pt-6 border-t border-border flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="size-4"
                          >
                            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                          <span>{result.matches.length} matches require review</span>
                        </div>
                        <Link href={`/review/${result.documentId}`}>
                          <Button className="gap-2">
                            Review Matches
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="size-4"
                            >
                              <path d="M5 12h14" />
                              <path d="m12 5 7 7-7 7" />
                            </svg>
                          </Button>
                        </Link>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
