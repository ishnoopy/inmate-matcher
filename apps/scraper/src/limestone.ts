import { normalizeName, sha1, type RosterEntry } from "@inmate-matcher/shared";
import fs from "fs";
import sleep from "p-limit";
import path from "path";
import process from "process";

function ensureDirExists(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

type LimestoneRecord = {
  name: string;
  race?: string;
  sex?: string;
  cell_block?: string;
  arrest_date?: string | null;
  held_for_agency?: string | null;
  mugshot?: string | null;
  dob?: string | null;
  hold_reasons?: string | null;
  is_juvenile?: boolean;
  release_date?: string | null;
};

type LimestoneRequest = {
  name: string;
  race: string;
  sex: string;
  cell_block: string;
  held_for_agency: string;
  in_custody: string;
  paging: { count: number; start: number };
  sorting: { sort_by_column_tag: string; sort_descending: boolean };
};

type LimestoneResponse = {
  total_record_count: number;
  records: LimestoneRecord[];
};

const API_URL = "https://limestone-al-911.zuercherportal.com/api/portal/inmates/load";

const ROSTER_DIR = path.resolve(process.cwd(), "data/rosters");
const PHOTO_DIR = path.resolve(process.cwd(), "data/photos/limestone");


async function postJson<TReq, TRes>(url: string, data: TReq, retries: number = 3, retryDelay: number = 1000): Promise<TRes> {
  const body = JSON.stringify(data);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body,
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      await new Promise(res => setTimeout(res, retryDelay));
    }
  }

  throw new Error("Failed to post JSON after retries");
}

function createRosterEntry(record: LimestoneRecord): RosterEntry {
  const fullNameRaw = record.name;
  const nameNormalized = normalizeName(fullNameRaw);

  const stableId = sha1(`${record.name}|${record.dob}|${record.arrest_date}`);
  const id = `limestone:${stableId}`;

  let photoUrls: string[] = [];

  if (record.mugshot && record.mugshot.length > 100) {
    const filename = `${stableId}.jpg`;
    const filePath = path.join(PHOTO_DIR, filename);

    if (!fs.existsSync(filePath)) {
      const buffer = Buffer.from(record.mugshot, "base64");
      fs.writeFileSync(filePath, buffer);
    }

    photoUrls = [`photos/limestone/${filename}`];
  }

  return {
    id,
    source: "limestone",
    fullNameRaw,
    nameNormalized,
    bookingNumber: null,
    dob: record.dob ?? null,
    photoUrls,
    scrapedAt: new Date().toISOString()
  };
}

async function scrapeLimestone() {
  const pageSize = 50;
  let start = 0;

  let total = Infinity;
  const entryById = new Map<string, RosterEntry>();

  ensureDirExists(ROSTER_DIR);
  ensureDirExists(PHOTO_DIR);

  while (start < total) {
    const payload = {
      name: "",
      race: "all",
      sex: "all",
      cell_block: "all",
      held_for_agency: "any",
      in_custody: new Date().toISOString(),
      paging: { count: pageSize, start },
      sorting: { sort_by_column_tag: "name", sort_descending: false },
    };

    const data = await postJson<LimestoneRequest, LimestoneResponse>(API_URL, payload);

    total = data.total_record_count;

    if (!data.records?.length) break;

    for (const record of data.records) {
      const entry = createRosterEntry(record);
      entryById.set(entry.id, entry);
    }

    console.log(
      `✨ Fetched ${Math.min(start + data.records.length, total)}/${total}`
    );

    start += pageSize;
    await sleep(150); // polite pause
  }

  // Stable output ordering
  const entries = Array.from(entryById.values()).sort((a, b) =>
    a.nameNormalized.localeCompare(b.nameNormalized)
  );

  const outPath = path.join(ROSTER_DIR, "limestone.json");
  fs.writeFileSync(outPath, JSON.stringify(entries, null, 2), "utf-8");

  console.log(`✅ Wrote ${entries.length} entries → ${outPath}`);
  console.log(`✅ Photos directory → ${PHOTO_DIR}`);
}

scrapeLimestone().catch((e) => {
  console.error("❌ Limestone scrape failed:", e);
  process.exit(1);
});
