import { normalizeName } from "@inmate-matcher/shared";
import OpenAI from "openai";
import {
  extractFromBookingSummary,
  extractFromCourtDocketNotice,
  extractFromVehicleCrashReport,
} from "./document-specific";

export interface ExtractedPerson {
  name: string;
  role: string;
  source: string;
}

const DOCUMENT_SPECIFIC_EXTRACTORS: Record<
  string,
  (text: string) => ExtractedPerson[]
> = {
  court_docket_notice: extractFromCourtDocketNotice,
  vehicle_crash_report: extractFromVehicleCrashReport,
  booking_summary: extractFromBookingSummary,
};

const PRIMARY_LABELS = [
  "Subject Name",
  "Inmate Name",
  "Defendant Name",
  "Defendant",
  "Name",
  "Witness",
  "Driver",
  "Passenger",
] as const;

const NEAR_LABEL_WINDOW = 160;

const STOP_WORDS = new Set([
  "N/A",
  "NA",
  "UNKNOWN",
  "NONE",
  "NOT LISTED",
  "NOT AVAILABLE",
]);

const NON_NAME_TOKENS = new Set([
  "AGENCY",
  "ARRESTING",
  "AMOUNT",
  "AT",
  "BOOKING",
  "CASE",
  "CHARGE",
  "CHARGES",
  "CITATION",
  "CODE",
  "CONTACT",
  "COURT",
  "COUNTY",
  "DETENTION",
  "DISPOSITION",
  "DOB",
  "DRIVER",
  "FACILITY",
  "FAILURE",
  "GENERATED",
  "HOLDS",
  "INFO",
  "INFORMATION",
  "INJURY",
  "MINOR",
  "NARRATIVE",
  "NAME",
  "NOTES",
  "OFFICE",
  "OFFICER",
  "PASSENGER",
  "PASSENGERS",
  "PHONE",
  "PROCEEDING",
  "REPORTED",
  "RD",
  "ROAD",
  "ROLE",
  "SHERIFF",
  "STATUTE",
  "SUBJECT",
  "SUMMARY",
  "TAG",
  "TEMPLATE",
  "VEHICLE",
  "WITNESS",
  "WITNESSES",
  "YIELD",
  "YES",
  "NO",
]);

// Role words that might prefix a name (e.g., "Witness ALLEN")
const ROLE_PREFIXES = new Set([
  "DRIVER",
  "PASSENGER",
  "WITNESS",
  "OFFICER",
  "VICTIM",
  "SUSPECT",
  "DEFENDANT",
]);

// Car makes, models, and colors that get falsely extracted
const VEHICLE_WORDS = new Set([
  "TOYOTA",
  "CAMRY",
  "FORD",
  "HONDA",
  "CIVIC",
  "ACCORD",
  "CHEVROLET",
  "CHEVY",
  "NISSAN",
  "ALTIMA",
  "BMW",
  "MERCEDES",
  "DODGE",
  "RAM",
  "JEEP",
  "SILVER",
  "BLACK",
  "WHITE",
  "RED",
  "BLUE",
  "GREEN",
  "GRAY",
  "GREY",
]);

// Common header/label phrases that should never be extracted as names
const HEADER_PHRASES = [
  "citation statute",
  "and witnesses",
  "passengers and",
  "vehicle information",
  "driver information",
  "witness information",
  "case information",
  "court information",
  "info injury",
  "officer notes",
  "contact passenger",
  "yield al",
];

// Captures either Left: John, Mary-Jane or Right: SMITH, SMITH-JONES
const NAME_TOKEN =
  "(?:[A-Z][a-z]+(?:[-'][A-Z][a-z]+)*|[A-Z]{2,}(?:[-'][A-Z]{2,})*)";


function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}


function hasNonNameToken(name: string): boolean {
  const tokens = name.split(/\s+/).filter(Boolean);
  return tokens.some((token) =>
    NON_NAME_TOKENS.has(token.replace(/[^A-Za-z']/g, "").toUpperCase())
  );
}

/**
 * If a string starts with ALL CAPS words, truncate at the first word
 * that contains lowercase letters.
 * e.g., "ALLEN, KESHAN DARREL observed Vehicle" → "ALLEN, KESHAN DARREL"
 * But "John Smith works here" is unchanged (doesn't start with all caps)
 */
function truncateAtNonCapsWord(text: string): string {
  // Split while preserving delimiters (commas, spaces)
  const tokens = text.split(/(\s+|,\s*)/);
  if (tokens.length === 0) return text;

  // Check if first actual word token is ALL CAPS
  const firstWord = tokens.find((t) => /[A-Za-z]/.test(t));
  if (!firstWord) return text;

  const lettersOnly = firstWord.replace(/[^A-Za-z]/g, "");
  const isAllCaps = lettersOnly.length > 0 && lettersOnly === lettersOnly.toUpperCase();

  if (!isAllCaps) return text;

  // Keep only consecutive ALL CAPS word tokens
  const result: string[] = [];
  for (const token of tokens) {
    // Preserve delimiters (spaces, commas)
    if (/^[\s,]+$/.test(token)) {
      result.push(token);
      continue;
    }

    const letters = token.replace(/[^A-Za-z]/g, "");
    // If token has letters, check if all caps
    if (letters.length > 0) {
      if (letters !== letters.toUpperCase()) {
        break;
      }
    }
    result.push(token);
  }

  return result.join("").trim();
}

function cleanName(raw: string): string | null {
  let compact = raw.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  if (STOP_WORDS.has(compact.toUpperCase())) return null;

  // Remove leading prefixes like (Veh 1), (Veh 2), (V1), etc.
  compact = compact.replace(/^\s*\([^)]*\)\s*/g, "");

  // Truncate at DOB - everything after "DOB" is metadata
  compact = compact.replace(/\s+DOB\s+.*/i, "");

  // Truncate at semicolon - take only the first segment
  if (compact.includes(";")) {
    compact = compact.split(";")[0].trim();
  }

  // If name starts with ALL CAPS words, truncate at first non-caps word
  // e.g., "ALLEN, KESHAN DARREL observed Vehicle 2" → "ALLEN, KESHAN DARREL"
  compact = truncateAtNonCapsWord(compact);

  // Strip common trailing punctuation or bracketed metadata.
  const cleaned = compact
    .replace(/[;,.\-:]+$/g, "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .trim();

  if (!cleaned) return null;
  if (!/[A-Za-z]/.test(cleaned)) return null;

  // Reject if it matches a known header phrase
  const lowerCleaned = cleaned.toLowerCase();
  for (const phrase of HEADER_PHRASES) {
    if (lowerCleaned.includes(phrase) || phrase.includes(lowerCleaned)) {
      return null;
    }
  }

  // Reject fragments that start with lowercase or are partial words
  // (e.g., "s and Witnesses" starts with lowercase 's')
  if (/^[a-z]/.test(cleaned)) return null;

  // Reject if it contains NON_NAME_TOKENS
  if (hasNonNameToken(cleaned)) return null;

  const tokens = cleaned.split(/[\s,]+/).filter((t) => t.length > 0);

  // Reject if starts with a role prefix (e.g., "Witness ALLEN", "Passenger SMITH")
  if (tokens.length > 0 && ROLE_PREFIXES.has(tokens[0].toUpperCase())) {
    return null;
  }

  // Reject only if ALL tokens are vehicle words (e.g., "Toyota Camry", "Silver Ford")
  // But keep names where only some tokens match (e.g., "JOHN FORD", "BETTY WHITE")
  const allTokensAreVehicleWords = tokens.every((t) =>
    VEHICLE_WORDS.has(t.toUpperCase())
  );
  if (allTokensAreVehicleWords) {
    return null;
  }

  // A valid name should have at least 2 tokens (first + last)
  if (tokens.length < 2) return null;

  return cleaned;
}

// Get names after a label line
function extractNamesFromLabelLine(text: string, label: string): string[] {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lineRegex = new RegExp(
    `(?:^|\\n)\\s*${escapedLabel}\\s*[:#-]?\\s*([^\\n]+)`,
    "gi"
  );

  const values: string[] = [];
  for (const match of text.matchAll(lineRegex)) {
    const cleaned = cleanName(match[1]);
    if (cleaned) values.push(cleaned);
  }

  return values;
}

function labelBasedExtraction(text: string): string[] {
  const normalizedText = normalizeLineBreaks(text);
  const rawCandidates: string[] = [];
  for (const label of PRIMARY_LABELS) {
    rawCandidates.push(...extractNamesFromLabelLine(normalizedText, label));
  }

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const name of rawCandidates) {
    const normalized = normalizeName(name);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }
  return deduped;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractNamesFromNearLabelWindow(windowText: string): string[] {
  const candidates: string[] = [];

  const register = (
    regex: RegExp,
    formatter?: (match: RegExpExecArray) => string
  ) => {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null = regex.exec(windowText);
    while (match) {
      const raw = formatter ? formatter(match) : match[0];
      const cleaned = cleanName(raw);
      if (cleaned && !hasNonNameToken(cleaned)) {
        candidates.push(cleaned);
      }
      match = regex.exec(windowText);
    }
  };

  // FIRST MIDDLE LAST / FIRST LAST — horizontal whitespace only, never cross a newline
  register(new RegExp(`\\b${NAME_TOKEN}(?:[^\\S\\n]+${NAME_TOKEN}){1,2}\\b`, "g"));

  // LAST, FIRST MIDDLE -> normalize to FIRST MIDDLE LAST
  register(
    new RegExp(
      `\\b(${NAME_TOKEN})[^\\S\\n]*,[^\\S\\n]*(${NAME_TOKEN})(?:[^\\S\\n]+(${NAME_TOKEN}))?\\b`,
      "g"
    ),
    (match) => [match[2], match[3], match[1]].filter(Boolean).join(" ")
  );

  return candidates;
}

function nearLabelFallbackExtraction(text: string): string[] {
  const normalizedText = normalizeLineBreaks(text);
  const found: string[] = [];

  for (const label of PRIMARY_LABELS) {
    const labelRegex = new RegExp(`\\b${escapeRegExp(label)}\\b`, "gi");
    for (const match of normalizedText.matchAll(labelRegex)) {
      const labelEnd = (match.index ?? 0) + match[0].length;
      const start = Math.max(0, labelEnd - 10);
      const end = Math.min(normalizedText.length, labelEnd + NEAR_LABEL_WINDOW);
      const windowText = normalizedText.slice(start, end);
      found.push(...extractNamesFromNearLabelWindow(windowText));
    }
  }

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const name of found) {
    const normalized = normalizeName(name);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }
  return deduped;
}

export interface CandidateName {
  name: string;
  source: string;
  role?: string;
}

/**
 * Check if nameA is a partial subset of nameB.
 * e.g., "BOBBY EUGENE" is partial of "BOBBY EUGENE ADAMS"
 */

/**
 * Remove partial names when fuller versions exist.
 * e.g., if we have both "BOBBY EUGENE" and "BOBBY EUGENE ADAMS",
 * remove "BOBBY EUGENE" and keep the fuller version.
 *
 * O(n·k²) instead of O(n²): one pass builds a set of every proper
 * prefix/suffix across all names; a second pass filters against it.
 */
function removePartialNames(names: CandidateName[]): CandidateName[] {
  // A name is "partial" if every one of its tokens appears inside a *longer*
  // name in the list.  This handles non-contiguous cases like:
  //   "alysa allen"  →  partial of  "alysa raquel allen"
  //   "bobby adams"  →  partial of  "bobby eugene adams"
  return names.filter(({ name }) => {
    const tokens = name.split(" ").filter(Boolean);
    return !names.some(({ name: other }) => {
      if (other === name) return false;
      const otherTokens = other.split(" ").filter(Boolean);
      if (otherTokens.length <= tokens.length) return false;
      return tokens.every((t) => otherTokens.includes(t));
    });
  });
}

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY environment variable is not set. Add it to .env.local."
      );
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

const LLM_NAME_EXTRACTION_PROMPT = `You are a name extraction assistant. Extract all person names from the following document text.

Rules:
- Extract full names (first name + last name at minimum)
- Include middle names if present
- Include a role if the person's role is clear (e.g., "driver", "passenger", "witness", "defendant", "victim")
- Do NOT include organizations, businesses, or place names
- Do NOT include partial names (single word names)
- Normalize names to Title Case

Respond with valid JSON in this exact format:
{
  "names": [
    { "name": "John Michael Smith", "role": "driver" },
    { "name": "Jane Doe", "role": "witness" }
  ]
}

If no person names are found, respond with: { "names": [] }`;

interface LLMExtractedName {
  name: string;
  role?: string;
}

async function extractNamesWithLLM(text: string): Promise<CandidateName[]> {
  const excerpt = text.slice(0, 4000);

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: LLM_NAME_EXTRACTION_PROMPT },
        {
          role: "user",
          content: `Extract person names from this document:\n\n${excerpt}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
      temperature: 0,
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as { names?: LLMExtractedName[] };

    if (!Array.isArray(parsed.names)) {
      return [];
    }

    const candidates: CandidateName[] = [];
    const seen = new Set<string>();

    for (const item of parsed.names) {
      if (!item.name || typeof item.name !== "string") continue;

      const cleaned = cleanName(item.name);
      if (!cleaned) continue;

      const normalized = normalizeName(cleaned);
      if (seen.has(normalized)) continue;
      seen.add(normalized);

      candidates.push({
        name: normalized,
        source: "llm-fallback",
        role: item.role,
      });
    }

    return removePartialNames(candidates);
  } catch (err) {
    console.error("[extractNamesWithLLM] Error calling OpenAI:", err);
    return [];
  }
}

export async function extractCandidateNames(
  text: string,
  templateType: string
): Promise<CandidateName[]> {
  const normalizedType = templateType.toLowerCase().replace(/[\s-]+/g, "_");
  const documentExtractor = DOCUMENT_SPECIFIC_EXTRACTORS[normalizedType];

  if (documentExtractor) {
    const specificResults = documentExtractor(text);
    if (specificResults.length > 0) {
      return specificResults.map((person) => ({
        name: normalizeName(person.name),
        source: person.source,
        role: person.role,
      }));
    }
  }

  // General Pipeline Extraction
  const labelBasedNames = labelBasedExtraction(text);
  const nearLabelFallbackNames = nearLabelFallbackExtraction(text);

  const seen = new Set<string>();
  const merged: CandidateName[] = [];

  for (const name of labelBasedNames) {
    if (seen.has(name)) continue;
    seen.add(name);
    merged.push({ name, source: "label" });
  }
  for (const name of nearLabelFallbackNames) {
    if (seen.has(name)) continue;
    seen.add(name);
    merged.push({ name, source: "near-label-fallback" });
  }

  // Remove partial names when fuller versions exist
  const deduped = removePartialNames(merged);

  // LLM fallback when regex-based extraction finds nothing
  if (deduped.length === 0) {
    console.log("[extractCandidateNames] No names found via regex, falling back to LLM");
    return extractNamesWithLLM(text);
  }

  return deduped;
}
