import { normalizeName, type RosterEntry } from "@inmate-matcher/shared";
import { chromium, type Locator, type Page } from "@playwright/test";
import "dotenv/config";
import fs from "fs";
import path from "path";
import process from "process";
import { ensureDirExists, getPageNumberFromHref, resolveUrl, sha1 } from "../utils";

const BASE = "https://www.madisoncountysheriffal.org";
const ROSTER_URL = `${BASE}/inmate-roster`;

const ROSTER_DIR = path.resolve(process.cwd(), "data/rosters");
const PHOTO_DIR = path.resolve(process.cwd(), "data/photos/madison");
const ROSTER_PATH = "/inmate-roster/filters/current/booking_time=desc";
const INMATE_LINK_SELECTOR = 'a[aria-label^="View Profile"]';
const pendingPhotoDownloads = new Map<string, Promise<void>>();

async function getFieldValue(row: Locator, label: string): Promise<string | null> {
  const value = await row
    .locator(`.inmate_data_bold:has-text("${label}") + .inmate_data_content`)
    .first()
    .textContent();

  return value?.replace(/\s+/g, " ").trim() || null;
}

async function getLastPageNumber(page: Page): Promise<number> {
  const lastLink = page.getByRole("link", { name: /last/i }).first();
  if (await lastLink.count() === 0) return 1;

  const lastHref = await lastLink.getAttribute("href");
  return getPageNumberFromHref(lastHref, BASE) ?? 1;
}

async function createEntry(params: {
  name: string | null;
  bookingNumber: string | null;
  mugshot: string | null;
  profileUrl: string | null;
}): Promise<RosterEntry | null> {
  const fullNameRaw = params.name?.trim() ?? "";
  if (!fullNameRaw) return null;

  const stableId = sha1(
    `${fullNameRaw}|${params.bookingNumber ?? ""}|${params.profileUrl ?? ""}`
  );

  let photoUrls: string[] = [];
  const mugshotUrl = params.mugshot;
  if (mugshotUrl) {
    const filename = `${stableId}.jpg`;
    const filePath = path.join(PHOTO_DIR, filename);

    if (!fs.existsSync(filePath)) {
      let downloadPromise = pendingPhotoDownloads.get(filePath);
      if (!downloadPromise) {
        downloadPromise = (async () => {
          try {
            const response = await fetch(mugshotUrl);
            if (!response.ok) return;
            const bytes = await response.arrayBuffer();
            fs.writeFileSync(filePath, Buffer.from(bytes));
          } catch {
            // Ignore photo download failures; roster entry still gets emitted.
          } finally {
            pendingPhotoDownloads.delete(filePath);
          }
        })();
        pendingPhotoDownloads.set(filePath, downloadPromise);
      }
      await downloadPromise;
    }

    photoUrls = [`photos/madison/${filename}`];
  }

  return {
    id: `madison:${stableId}`,
    source: "madison",
    fullNameRaw,
    nameNormalized: normalizeName(fullNameRaw),
    bookingNumber: params.bookingNumber,
    dob: null,
    photoUrls,
    scrapedAt: new Date().toISOString(),
  };
}

function getWorkerCount(lastPage: number): number {
  const parsed = Number(process.env.SCRAPER_CONCURRENCY ?? 4);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.max(1, Math.min(lastPage, Math.floor(parsed)));
}

function distributePages(lastPage: number, workerCount: number): number[][] {
  const groups = Array.from({ length: workerCount }, () => [] as number[]);
  for (let pageNumber = 1; pageNumber <= lastPage; pageNumber++) {
    groups[(pageNumber - 1) % workerCount].push(pageNumber);
  }
  return groups.filter(group => group.length > 0);
}

async function scrapePage(page: Page): Promise<RosterEntry[]> {
  await page.waitForSelector(INMATE_LINK_SELECTOR, { timeout: 10000 }).catch(() => null);

  const inmates = page.locator(INMATE_LINK_SELECTOR);
  const inmateCount = await inmates.count();
  const entries: RosterEntry[] = [];

  for (let i = 0; i < inmateCount; i++) {
    const inmate = inmates.nth(i);
    const row = inmate.locator(
      'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " row ")][1]'
    );

    const profileUrl = resolveUrl(await inmate.getAttribute("href"), BASE);
    const mugshot = resolveUrl(
      await row.locator(".inmate_mugshot img").first().getAttribute("src"),
      BASE
    );

    const name = (
      (await row.locator(".roster_name").first().textContent()) ??
      (await row.locator(".inmate_mugshot img").first().getAttribute("alt"))
    )?.trim() ?? null;

    const booking = await getFieldValue(row, "Booking Number:");
    const ageText = await getFieldValue(row, "Age:");
    void ageText;

    const entry = await createEntry({
      name,
      bookingNumber: booking,
      mugshot,
      profileUrl,
    });
    if (entry) entries.push(entry);
  }

  return entries;
}

async function scrapeAssignedPages(params: {
  workerId: number;
  pages: number[];
  lastPage: number;
  headless: boolean;
  slowMo: number;
}): Promise<RosterEntry[]> {
  const browser = await chromium.launch({
    headless: params.headless,
    slowMo: params.slowMo,
  });

  try {
    const page = await browser.newPage();
    const entries: RosterEntry[] = [];

    for (const pageNumber of params.pages) {
      const pageUrl = `${BASE}${ROSTER_PATH}/${pageNumber}`;
      await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
      const pageEntries = await scrapePage(page);
      entries.push(...pageEntries);

      console.log(
        `✨ Worker ${params.workerId}: Madison page ${pageNumber}/${params.lastPage} scraped (${pageEntries.length} records)`
      );
    }

    return entries;
  } finally {
    await browser.close();
  }
}

async function scrapeMadison() {
  ensureDirExists(ROSTER_DIR);
  ensureDirExists(PHOTO_DIR);
  const headless = process.env.SCRAPER_HEADLESS !== "false";
  const slowMo = Number(process.env.SCRAPER_SLOWMO_MS || 0);

  const bootstrapBrowser = await chromium.launch({ headless, slowMo });
  let lastPage = 1;
  try {
    const page = await bootstrapBrowser.newPage();
    await page.goto(ROSTER_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(INMATE_LINK_SELECTOR, { timeout: 15000 }).catch(() => null);
    lastPage = await getLastPageNumber(page);
  } finally {
    await bootstrapBrowser.close();
  }

  const workerCount = getWorkerCount(lastPage);
  const pageGroups = distributePages(lastPage, workerCount);

  console.log(`🚀 Madison parallel scrape: ${workerCount} browser workers across ${lastPage} pages`);

  const workerResults = await Promise.all(
    pageGroups.map((pages, index) =>
      scrapeAssignedPages({
        workerId: index + 1,
        pages,
        lastPage,
        headless,
        slowMo,
      })
    )
  );

  const entryById = new Map<string, RosterEntry>();
  for (const entries of workerResults) {
    for (const entry of entries) {
      entryById.set(entry.id, entry);
    }
  }

  const entries = Array.from(entryById.values()).sort((a, b) =>
    a.nameNormalized.localeCompare(b.nameNormalized)
  );

  const outPath = path.join(ROSTER_DIR, "madison.json");
  fs.writeFileSync(outPath, JSON.stringify(entries, null, 2), "utf-8");

  console.log(`✅ Wrote ${entries.length} entries → ${outPath}`);
}

scrapeMadison().catch((e) => {
  console.error("❌ Madison scrape failed:", e);
  process.exit(1);
});
