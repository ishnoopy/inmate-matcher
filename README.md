# Inmate Matcher

A full-stack application that scrapes county jail inmate rosters, extracts names from uploaded PDF documents, matches them against scraped roster data, and provides a web interface for reviewing matches with email notification support.

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Quick Start](#quick-start)
- [Running the Scraper](#running-the-scraper)
- [Running the Web App](#running-the-web-app)
- [Configuring Email Notifications](#configuring-email-notifications)
- [Document Type Detection](#document-type-detection)
- [Rate Limiting](#rate-limiting)
- [Architecture & Pipeline](#architecture--pipeline)
- [Assumptions & Limitations](#assumptions--limitations)
- [Future Improvements](#future-improvements)
- [Tooling Used](#tooling-used)

---

## Overview

This application provides an end-to-end pipeline for:

1. **Scraping inmate rosters** from Madison County and Limestone County jail websites
2. **Extracting and parsing PDFs** to isolate names from various document types
3. **Matching extracted names** against the scraped roster entries using token-based scoring
4. **Reviewing matches** through a web interface that displays PDF content alongside matched mugshots
5. **Email notifications** when matches are found (Gmail/Google configuration)
6. **Document type detection** using OpenAI to classify incoming documents

---

## Tech Stack


| Layer              | Technology                           |
| ------------------ | ------------------------------------ |
| **Monorepo**       | pnpm workspaces                      |
| **Scraper**        | Playwright, TypeScript, tsx          |
| **Web App**        | Next.js 16, React 19, Tailwind CSS 4 |
| **Database**       | SQLite via Prisma ORM                |
| **Authentication** | NextAuth.js v5                       |
| **PDF Parsing**    | pdf-parse, pdfjs-dist                |
| **AI/LLM**         | OpenAI GPT-4o-mini                   |
| **Email**          | Nodemailer (Gmail SMTP)              |
| **UI Components**  | Base UI, Radix UI, Lucide Icons      |


---

## Project Structure

```
inmate-matcher/
├── apps/
│   ├── scraper/                    # Playwright scrapers for jail rosters
│   │   ├── src/
│   │   │   ├── madison.ts          # Madison County scraper
│   │   │   └── limestone.ts        # Limestone County scraper
│   │   ├── utils/                  # Shared scraper utilities
│   │   └── data/                   # Output directory for scraped data
│   │       ├── rosters/            # JSON roster files
│   │       └── photos/             # Downloaded mugshots
│   │           ├── madison/
│   │           └── limestone/
│   │
│   └── web/                        # Next.js web application
│       ├── app/
│       │   ├── api/                # API routes
│       │   │   ├── ingest/         # PDF upload & processing
│       │   │   ├── review/         # Review entry management
│       │   │   ├── auth/           # Authentication endpoints
│       │   │   └── settings/       # User settings (email config)
│       │   ├── lib/
│       │   │   ├── pipeline/       # PDF processing pipeline
│       │   │   │   ├── extractText.ts
│       │   │   │   ├── extractNames.ts
│       │   │   │   ├── detectTemplateType.ts
│       │   │   │   └── document-specific/
│       │   │   ├── matching/       # Name matching logic
│       │   │   └── storage/        # File storage utilities
│       │   ├── review/             # Review UI pages
│       │   └── settings/           # Settings page
│       ├── components/             # React components
│       ├── lib/                    # Shared utilities
│       │   ├── auth.ts             # NextAuth configuration
│       │   ├── email/              # Email notification service
│       │   └── db/                 # Prisma client
│       └── prisma/
│           └── schema.prisma       # Database schema
│
└── packages/
    └── shared/                     # Shared types & utilities
        └── src/
            ├── types.ts            # RosterEntry type definitions
            └── normalizeName.ts    # Name normalization logic
```

---

## Prerequisites

- **Node.js** 20.x or later
- **pnpm** 9.x or later (`npm install -g pnpm`)
- **Playwright browsers** (installed automatically)

---

## Environment Variables

Each app has its own `.env.example` in its directory. Copy to `.env` (or `.env.local` for the web app) and fill in your values.

### Web App (`apps/web`)

```bash
cp apps/web/.env.example apps/web/.env.local
# Edit apps/web/.env.local with your values
```


| Variable              | Required | Description                                                                  |
| --------------------- | -------- | ---------------------------------------------------------------------------- |
| `DATABASE_URL`        | ✅        | SQLite connection string (e.g. `file:./prisma/data/dev.db`)                  |
| `AUTH_SECRET`         | ✅        | NextAuth.js session encryption key (generate with `openssl rand -base64 32`) |
| `OPENAI_API_KEY`      | ✅        | OpenAI API key for document classification                                   |
| `ENCRYPTION_KEY`      | ⚠️       | Required if using email notifications                                        |
| `NEXT_PUBLIC_APP_URL` | ❌        | Base URL for email links (default: `http://localhost:3000`)                  |


### Scraper (`apps/scraper`)

```bash
cp apps/scraper/.env.example apps/scraper/.env
# Edit apps/scraper/.env if you need to override defaults
```


| Variable              | Required | Description                                      |
| --------------------- | -------- | ------------------------------------------------ |
| `SCRAPER_CONCURRENCY` | ❌        | Parallel browser count (default: 4)              |
| `SCRAPER_HEADLESS`    | ❌        | Run browsers headlessly (default: true)          |
| `SCRAPER_SLOWMO_MS`   | ❌        | Delay between actions for debugging (default: 0) |


---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/ishnoopy/inmate-matcher.git
cd inmate-matcher

# 2. Install dependencies
pnpm install

# 3. Install Playwright browsers (first time only)
pnpm setup:playwright

# 4. Set up environment variables
cp apps/web/.env.example apps/web/.env
cp apps/scraper/.env.example apps/scraper/.env
# Edit apps/web/.env.local with your values (see Environment Variables section)

# 5. Initialize the database
pnpm db:generate
pnpm db:push

# 6. Scrape the rosters
pnpm scrape:all
# Or run individually: pnpm scrape:madison && pnpm scrape:limestone

# 7. Start the web app
pnpm dev
```

### Available Scripts


| Script                  | Description                           |
| ----------------------- | ------------------------------------- |
| `pnpm dev`              | Start the web app in development mode |
| `pnpm build`            | Build the web app for production      |
| `pnpm start`            | Start the production server           |
| `pnpm db:generate`      | Generate Prisma client                |
| `pnpm db:push`          | Push schema changes to database       |
| `pnpm db:studio`        | Open Prisma Studio (database GUI)     |
| `pnpm scrape:madison`   | Scrape Madison County roster          |
| `pnpm scrape:limestone` | Scrape Limestone County roster        |
| `pnpm scrape:all`       | Scrape both rosters sequentially      |
| `pnpm setup:playwright` | Install Playwright Chromium browser   |


---

## Running the Scraper

The scraper extracts inmate names, photos, and identifiers from county jail rosters.

### Scrape Madison County

```bash
# From repository root
pnpm scrape:madison

# Or from apps/scraper
cd apps/scraper && pnpm scrape:madison
```

**Source:** [https://www.madisoncountysheriffal.org/inmate-roster](https://www.madisoncountysheriffal.org/inmate-roster)

**Output:**

- `apps/scraper/data/rosters/madison.json` — Structured roster data
- `apps/scraper/data/photos/madison/*.jpg` — Mugshot images

### Scrape Limestone County

```bash
# From repository root
pnpm scrape:limestone

# Or from apps/scraper
cd apps/scraper && pnpm scrape:limestone
```

**Source:** [https://limestone-al-911.zuercherportal.com/#/inmates](https://limestone-al-911.zuercherportal.com/#/inmates)

**Output:**

- `apps/scraper/data/rosters/limestone.json` — Structured roster data
- `apps/scraper/data/photos/limestone/*.jpg` — Mugshot images

### Scraper Configuration


| Environment Variable  | Default | Description                                         |
| --------------------- | ------- | --------------------------------------------------- |
| `SCRAPER_CONCURRENCY` | 4       | Number of parallel browser instances (Madison only) |
| `SCRAPER_HEADLESS`    | true    | Set to "false" to see the browser window            |
| `SCRAPER_SLOWMO_MS`   | 0       | Add delay between actions for debugging             |


### Roster Data Format

Each roster entry contains:

```typescript
interface RosterEntry {
  id: string;              // Unique ID (e.g., "madison:abc123")
  source: "madison" | "limestone";
  fullNameRaw: string;     // Original name from roster
  nameNormalized: string;  // Normalized for matching (uppercase, no punctuation)
  bookingNumber?: string;
  dob?: string;
  photoUrls: string[];     // Relative paths to downloaded photos
  scrapedAt: string;       // ISO timestamp
}
```

---

## Running the Web App

### Development Mode

```bash
cd apps/web
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
cd apps/web
pnpm build
pnpm start
```

### First-Time Setup

1. **Create an account** at `/auth/signup`
2. **Upload a PDF** from the home page
3. **View matches** in the review dashboard at `/review`
4. **Configure email** (optional) in settings at `/settings`

---

## Configuring Email Notifications

Email notifications use **Gmail SMTP** with app passwords (not your regular Gmail password).

### Step 1: Enable 2-Factor Authentication

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** if not already enabled

### Step 2: Generate an App Password

1. Go to [App Passwords](https://myaccount.google.com/apppasswords)
2. Select **Mail** and your device
3. Click **Generate**
4. Copy the 16-character password (e.g., `abcd efgh ijkl mnop`)

### Step 3: Configure in the App

1. Navigate to **Settings** (`/settings`) in the web app
2. Enter your Gmail address
3. Enter the App Password (remove spaces)
4. Enter the recipient email address
5. Enable notifications and save

### Email Settings Options


| Setting                | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| **Gmail Address**      | Your Gmail address (sender)                          |
| **App Password**       | 16-character app password from Google                |
| **Recipient Email**    | Where to send match alerts                           |
| **Auto-send on Match** | Automatically send emails when matches are found     |
| **Minimum Score**      | Only auto-send for matches with this score or higher |


### Testing Email Configuration

Use the **Send Test Email** button in settings to verify your configuration works.

### Security Notes

- App passwords are **encrypted** before storage using AES-256
- Set `ENCRYPTION_KEY` in your environment for encryption
- Passwords are never logged or exposed in API responses

---

## Document Type Detection

The system uses a **hybrid approach** combining rule-based pattern matching with OpenAI LLM classification.

### Supported Document Types


| Type                   | Description                    | Key Patterns                               |
| ---------------------- | ------------------------------ | ------------------------------------------ |
| `booking_summary`      | Jail/detention booking records | "Booking #", "Subject Name", "Charges"     |
| `court_docket_notice`  | Court hearing notices          | "Notice of Hearing", "Defendant", "Case #" |
| `vehicle_crash_report` | Vehicle accident reports       | "Vehicle Crash", "Driver #1", "Witness"    |
| `unknown`              | Unclassified documents         | None matched                               |


### Detection Pipeline

1. **Rule-based analysis** — Fast regex pattern matching
2. **LLM classification** — OpenAI GPT-4o-mini for ambiguous cases
3. **Result combination** — Agreement bonuses, conflict resolution
4. **Confidence scoring** — 0-100 scale with thresholds:
  - **High**: ≥75% confidence
  - **Medium**: 50-74% confidence
  - **Low**: 25-49% confidence
  - **None**: <25% confidence

### Handling Uncertainty

The system handles low-confidence detections by:

1. **Issuing warnings** when confidence is below thresholds
2. **Flagging for manual review** when required fields are missing
3. **Reporting conflicting signals** between rule-based and LLM results
4. **Allowing manual override** via the upload form

### OpenAI Prompting Approach

```
System: You are a document classifier. Analyze the document and classify it into exactly one type.
Types: booking_summary, court_docket_notice, vehicle_crash_report, unknown
Response format: { "templateType": "<type>", "confidence": <0-100>, "reasoning": "<brief explanation>" }
```

The LLM receives the first 2000 characters of extracted text and returns structured JSON.

---

## Rate Limiting

The API implements rate limiting to prevent abuse and ensure fair usage.

### Rate Limits by Route


| Route                | Limit       | Window   |
| -------------------- | ----------- | -------- |
| `/api/ingest`        | 15 requests | 1 minute |
| All other API routes | 50 requests | 1 minute |


### How It Works

- **Sliding window algorithm** — Requests are counted within a rolling 1-minute window
- **Per-user limiting** — Authenticated users are tracked by user ID
- **IP fallback** — Unauthenticated requests are tracked by IP address
- **In-memory storage** — Suitable for single-instance deployments

### Response Headers

All API responses include rate limit headers:


| Header                  | Description                          |
| ----------------------- | ------------------------------------ |
| `X-RateLimit-Limit`     | Maximum requests allowed per window  |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset`     | Seconds until the window resets      |


### Rate Limit Exceeded Response

When rate limited, the API returns:

```json
{
  "ok": false,
  "error": "Rate limit exceeded. Maximum X requests per minute."
}
```

**HTTP Status:** `429 Too Many Requests`

### Excluded Routes

The following routes are **not** rate limited:

- `/api/auth/`* — Authentication endpoints (login, signup, session)

### Production Considerations

The current implementation uses in-memory storage, which:

- ✅ Works perfectly for single-instance deployments
- ⚠️ Does not share state across multiple instances
- ⚠️ Resets on server restart

For production deployments with multiple instances, consider migrating to:

- **Redis-based rate limiting** using `@upstash/ratelimit`
- **Edge-based limiting** via Vercel Edge Middleware with KV storage

---

## Architecture & Pipeline

### Matching Pipeline

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  PDF Upload  │────▶│ Extract Text │────▶│ Detect Type  │
└──────────────┘     └──────────────┘     └──────────────┘
                                                  │
                                                  ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Send Email   │◀────│ Match Names  │◀────│Extract Names │
│ (if enabled) │     │ to Roster    │     │(type-aware)  │
└──────────────┘     └──────────────┘     └──────────────┘
```

### Name Matching Algorithm

1. **Normalize** both extracted and roster names:
  - Uppercase
  - Remove punctuation
  - Handle "LAST, FIRST" → "FIRST LAST" format
  - Remove suffixes (Jr, Sr, II, III)
2. **Tokenize** names into significant tokens (≥2 characters, except middle initials)
3. **Score** by counting matching tokens:
  - Minimum 2 matching tokens required
  - Reject weak matches (e.g., single letter + common name)
  - Higher scores = better matches
4. **Rank** results by score descending

### Database Schema

- **User** — Account with email/password auth
- **Document** — Uploaded PDFs with extracted text
- **ReviewEntry** — Match results linking documents to roster entries
- **EmailSettings** — Per-user email configuration

---

## Assumptions & Limitations

### Assumptions

1. **Network access** — Both jail roster sites are publicly accessible
2. **Site structure stability** — Scrapers assume current DOM structure
3. **English names** — Name normalization optimized for English naming conventions
4. **PDF readability** — PDFs contain extractable text (not just scanned images)
5. **Single user per session** — Email settings are per-user

### Limitations

1. **Scanned PDFs** — OCR is not implemented; scanned-only PDFs will fail extraction
2. **Name variations** — Nicknames, aliases, and misspellings may not match
3. **Photo quality** — Mugshots are saved as-is without enhancement
4. **Real-time updates** — Roster data is point-in-time; requires re-scraping for updates
5. **SQLite concurrency** — Not suitable for high-concurrency production deployments
6. **In-memory rate limiting** — State not shared across instances (see [Rate Limiting](#rate-limiting))

### Site-Specific Notes

**Madison County:**

- Dynamic pagination requiring JavaScript execution
- Photos hosted on external CDN
- Uses Playwright for full browser automation

**Limestone County:**

- REST API endpoint (`/api/portal/inmates/load`)
- Base64-encoded mugshots in API response
- No browser automation needed (API-based)

---

## Future Improvements

With more time, the following enhancements would be valuable:

### High Priority

- **OCR integration** — Tesseract.js for scanned PDF support
- **Fuzzy matching** — Levenshtein distance for typo tolerance
- **Scheduled scraping** — Cron jobs to keep rosters current
- **PostgreSQL migration** — Better concurrency and production readiness

### Medium Priority

- **Batch processing** — Upload multiple PDFs at once
- **Export functionality** — CSV/Excel export of matches
- **Webhook notifications** — Slack, Teams, or custom webhook support
- **Audit logging** — Track all actions for compliance
- **Role-based access** — Admin vs. reviewer permissions

### Nice to Have

- **Dark mode** — System-aware theme switching
- **Mobile optimization** — Responsive review interface
- **Redis rate limiting** — Distributed rate limiting for multi-instance deployments
- **Test coverage** — Unit and integration tests
- **Docker deployment** — Containerized deployment option

---

## Tooling Used

This project was developed using:

- **Cursor IDE** — AI-powered code editor with Claude integration
- **Claude (Anthropic)** — AI assistance for code generation and debugging
- **pnpm** — Fast, disk space efficient package manager
- **TypeScript** — Type safety throughout the codebase

### Why These Choices?


| Tool                | Reasoning                                                   |
| ------------------- | ----------------------------------------------------------- |
| **Playwright**      | Recommended for dynamic sites; handles JavaScript rendering |
| **Next.js 16**      | Server components, API routes, excellent DX                 |
| **SQLite + Prisma** | Zero-config database, type-safe queries, easy migration     |
| **OpenAI**          | Reliable, fast, cost-effective (GPT-4o-mini)                |
| **pnpm workspaces** | Monorepo with shared packages, efficient installs           |


---

## License

This project was created as part of a working interview. All rights reserved.

---

## Contact

**Author:** Ruel Aldrin Guasa

For questions about this implementation, please reach out via the interview communication channel.