# `apps/web` Implementation Guide

This app is the analyst-facing web UI and API layer for document ingestion, name extraction, roster matching, review workflows, and email alerts.

## Stack

- Next.js App Router (`app/`)
- NextAuth credentials auth
- Prisma + SQLite
- `pdfjs-dist` for PDF text extraction
- OpenAI (`gpt-4o-mini`) for document template classification
- Nodemailer (Gmail App Password) for alerts

## Directory Overview

- `app/page.tsx`: upload dashboard and analysis results UI
- `app/review/*`: queue + document-level review screens
- `app/settings/*`: email notification settings UI
- `app/api/ingest/route.ts`: main ingest endpoint
- `app/api/review/*`: review entry list/update/email endpoints
- `app/api/documents/[documentId]/pdf/route.ts`: secure PDF streaming
- `app/api/photos/[county]/[filename]/route.ts`: mugshot serving + image processing
- `app/lib/pipeline/*`: template detection + name extraction pipeline
- `app/lib/matching/matchInmates.ts`: roster matching logic
- `lib/matching/scoreUtils.ts`: confidence labels and score interpretation
- `prisma/schema.prisma`: DB schema for users, documents, review entries, email settings

## End-to-End Flow

1. User uploads a PDF from the dashboard (`/`).
2. `POST /api/ingest` saves the file to `data/uploads/<documentId>.pdf`.
3. `extractTextFromPdfFile()` parses all pages via PDF.js and returns text + scan heuristic (`isLikelyScanned` if text length `< 200`).
4. `detectTemplateType()` classifies the document into:
  - `booking_summary`
  - `court_docket_notice`
  - `vehicle_crash_report`
  - `unknown`
5. `extractCandidateNames(text, templateType)` runs:
  - template-specific extraction first
  - generic fallback extraction if template extraction returns no names
6. `matchInmates(names)` compares extracted names against roster JSONs (`madison.json`, `limestone.json`).
7. A `Document` row is created; each match becomes a `ReviewEntry` (status: `pending`).
8. If email auto-send is enabled, alerts are sent for matches with score `>= minScoreForAuto`.

## Template-Based Name Extraction Rules

Template-specific extraction is wired in `app/lib/pipeline/document-specific/*` and used first when classifier output is recognized.

### 1) Booking Summary (`booking_summary`)

File: `document-specific/bookingSummary.ts`

Primary rule:

- Extract value after `Subject Name` label.

Fallback rule:

- Extract subject names from narrative patterns like `Subject John Doe was booked...`.

Filters:

- Drops stop words (`N/A`, `UNKNOWN`, etc.).
- Drops agency/court/charge-like strings using token sets and pattern checks.
- Requires at least 2 tokens and alphabetic content.

Returned role/source:

- Role: `subject`
- Source: `subject-name-label` or `narrative`

### 2) Court Docket Notice (`court_docket_notice`)

File: `document-specific/courtDocketNotice.ts`

Primary rule:

- Extract value after `Defendant` label.

Fallback rule:

- Extract from certificate-of-service language (for example, `served on the defendant ...`).

Filters:

- Rejects excluded legal-role context (judge, prosecutor, clerk, etc.).
- Drops stop words and non-name candidates.
- Requires at least 2 tokens.

Returned role/source:

- Role: `defendant`
- Source: `defendant-label` or `certificate-of-service`

### 3) Vehicle Crash Report (`vehicle_crash_report`)

File: `document-specific/vehicleCrashReport.ts`

Section-driven extraction:

1. Parse `Vehicles and Drivers` section for table rows (vehicle number + `LAST, FIRST ...` patterns).
2. Parse `Passengers and Witnesses` section for `Passenger ... NAME` and `Witness NAME` rows.
3. Fallback parse in `Citations/Charges` section for driver-name columns.

Filters and normalization:

- Truncates metadata (DOB/date suffixes).
- Requires 2+ tokens with letters.
- De-duplicates names across all sections.

Returned roles/sources:

- Roles: `driver`, `passenger`, `witness`
- Sources: `vehicles-and-drivers`, `passengers-and-witnesses`, `citations-charges`

## Generic Name Extraction Pipeline (`unknown` or empty template result)

File: `app/lib/pipeline/extractNames.ts`

If no template-specific names are found, the generic pipeline runs in two stages:

### Stage 1: Label-Based Extraction

- Looks for values on lines containing primary labels:
  - `Subject Name`, `Inmate Name`, `Defendant Name`, `Defendant`, `Name`, `Witness`, `Driver`, `Passenger`
- Pattern: `Label [:#-]? <same-line value>`.
- Values pass through `cleanName()` and dedupe by normalized name.

### Stage 2: Near-Label Window Fallback

- Around each label hit, inspect a character window (`NEAR_LABEL_WINDOW = 160`).
- Extract candidates using regexes for:
  - `FIRST LAST` / `FIRST MIDDLE LAST`
  - `LAST, FIRST [MIDDLE]` (reordered to first-middle-last form)
- Clean + dedupe results.

### Generic Filters Applied (`cleanName` + token checks)

- Reject stop words (`N/A`, `UNKNOWN`, etc.).
- Strip leading metadata prefixes like `(Veh 1)`.
- Truncate at `DOB` and at semicolons.
- If the string starts in ALL CAPS, truncate at first mixed/lowercase continuation.
- Reject known header phrases and non-name tokens (`CHARGE`, `CASE`, `COURT`, `WITNESS`, etc.).
- Reject lowercase-leading fragments.
- Reject names starting with role-prefix tokens (`DRIVER`, `PASSENGER`, `WITNESS`, etc.).
- Reject candidates where all tokens are vehicle words (e.g., `TOYOTA CAMRY`).
- Require at least 2 tokens.

### LLM Fallback

- Uses LLM to extract names from text provided that no matched names are found.

### Partial-Name Pruning

After merging stage outputs:

- `removePartialNames()` removes shorter subset names when a fuller name exists.
- Example: keep `BOBBY EUGENE ADAMS`, drop `BOBBY ADAMS`.

## Token-Based Matching and Confidence

Matching is implemented in `app/lib/matching/matchInmates.ts`, with confidence interpretation in `lib/matching/scoreUtils.ts`.

### Name Normalization

Both extracted names and roster names are normalized with `@inmate-matcher/shared/normalizeName`:

- uppercase
- punctuation cleanup (`.` and `-` -> space)
- non-letter cleanup
- `LAST, FIRST M` transformed to `FIRST M LAST`
- suffix removal when trailing (`JR`, `SR`, `II`, `III`, `IV`)

### Token Match Score

1. Split normalized names into tokens.
2. Keep only significant tokens with length `>= 2` unless single letter is in the middle of a 3 token match.
3. Score = number of extracted tokens present in roster token set.

### Match Threshold

- Minimum score for a match: `2` tokens.
- This enforces at least first+last token overlap (middle/suffix adds confidence).

### Confidence Bands (UI + Email)

`interpretScore(score)` maps score to confidence:

- `2` => Low confidence (`Only first and last name matched`)
- `3` => Medium confidence (`First, last, and one additional part matched`)
- `>=4` => High confidence (`Full name match including middle name/suffix`)

### Scoring Basis Persisted per Match

Each `ReviewEntry` stores `scoringBasis` JSON with:

- `matchedTokens`
- `extractedNormalized`
- `rosterNormalized`

This is shown in review UI and embedded in alert emails.

## Review Workflow

- New matches are inserted as `pending` review entries.
- Analysts confirm/reject from `/review` or document review pages.
- `PATCH /api/review/[entryId]` updates status and `reviewedAt`.
- Optional manual email trigger via `POST /api/review/[entryId]/email`.

## Data Model (Prisma)

- `User`: account + auth identity
- `Document`: uploaded file metadata, extracted text, template type, scan heuristic
- `ReviewEntry`: one per match candidate, with score/status/scoring basis
- `EmailSettings`: per-user encrypted Gmail app password + thresholds

## Environment Notes

Core variables used by this app:

- `OPENAI_API_KEY`: required for template classification
- `DATABASE_URL`: Prisma database URL (SQLite in current schema)
- `NEXT_PUBLIC_APP_URL`: optional absolute URL used in email deep links

## Local Development

From repo root:

```bash
pnpm -C apps/web dev
```

Other scripts:

```bash
pnpm -C apps/web build
pnpm -C apps/web start
pnpm -C apps/web lint
```

