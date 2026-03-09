import type { CandidateName } from "@/app/lib/pipeline/extractNames";
import type { ScoringBasis } from "@/lib/matching/scoreUtils";
import type { RosterEntry } from "@inmate-matcher/shared";
import { normalizeName } from "@inmate-matcher/shared";
import fs from "fs";
import path from "path";

export interface MatchedInmate extends RosterEntry {
  score: number;
  matchedFrom: string;
  scoringBasis: ScoringBasis;
}

const ROSTERS_DIR = path.resolve(
  process.cwd(),
  "../../apps/scraper/data/rosters"
);

let cachedRoster: RosterEntry[] | null = null;

function loadRoster(): RosterEntry[] {
  if (cachedRoster) return cachedRoster;

  const files = ["madison.json", "limestone.json"];
  const entries: RosterEntry[] = [];

  for (const file of files) {
    const filePath = path.join(ROSTERS_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`[matchInmates] Roster file not found: ${filePath}`);
      continue;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as RosterEntry[];
    entries.push(...parsed);
  }

  cachedRoster = entries;
  return cachedRoster;
}

// Single-character tokens usually have no discriminating power — "d jones" matches hundreds.
// Exception: include a single letter when it's the middle token of a 3-token name (e.g. "JOHN A SMITH").
function significantTokens(normalized: string): string[] {
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length === 3 && tokens[1].length === 1) {
    return tokens; // first + middle initial + last
  }
  return tokens.filter((t) => t.length >= 2);
}

interface TokenScoreResult {
  score: number;
  matchedTokens: string[];
}

function tokenScore(extractedNormalized: string, rosterNormalized: string): TokenScoreResult {
  const extractedTokens = significantTokens(extractedNormalized);
  const rosterTokens = new Set(significantTokens(rosterNormalized));

  if (extractedTokens.length === 0) return { score: 0, matchedTokens: [] };

  const matchedTokens = extractedTokens.filter((t) => rosterTokens.has(t));
  return { score: matchedTokens.length, matchedTokens };
}

// Reject weak matches: if only 2 tokens matched and one is a single letter,
// that's not discriminating enough (e.g. "D" + "JONES" could match hundreds)
function isWeakMatch(matchedTokens: string[]): boolean {
  if (matchedTokens.length !== 2) return false;
  const singleLetterCount = matchedTokens.filter((t) => t.length === 1).length;
  return singleLetterCount >= 1;
}

export function matchInmates(persons: CandidateName[]): MatchedInmate[] {
  const roster = loadRoster();
  const seen = new Set<string>();
  const results: MatchedInmate[] = [];

  for (const person of persons) {
    const normalizedExtracted = normalizeName(person.name);
    if (!normalizedExtracted || normalizedExtracted.split(" ").length < 2) continue;

    for (const entry of roster) {
      const { score, matchedTokens } = tokenScore(normalizedExtracted, entry.nameNormalized);

      // Require at least 2 tokens to match (first + last, handles middle names)
      // Also reject weak matches like "D" + "JONES"
      if (score >= 2 && !isWeakMatch(matchedTokens) && !seen.has(entry.id)) {
        seen.add(entry.id);
        results.push({
          ...entry,
          score,
          matchedFrom: person.name,
          scoringBasis: {
            matchedTokens,
            extractedNormalized: normalizedExtracted,
            rosterNormalized: entry.nameNormalized,
          },
        });
      }
    }
  }

  // Sort by score descending so best matches appear first
  results.sort((a, b) => b.score - a.score);
  return results;
}
