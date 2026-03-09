/**
 * Booking Summary Extraction Pipeline (Template A)
 *
 * Single-person document with primary subject.
 *
 * Rules:
 *   1. Primary: Extract the value after "Subject Name"
 *   2. Fallback: Extract the value after "Subject" in narrative text
 *   3. Exclude: Agency names, court names, charge text
 *
 * Returns: Usually one person with role "subject"
 */

export interface ExtractedPerson {
  name: string;
  role: "subject";
  source: "subject-name-label" | "narrative";
}

const STOP_WORDS = new Set([
  "N/A",
  "NA",
  "UNKNOWN",
  "NONE",
  "NOT LISTED",
  "NOT AVAILABLE",
  "TBD",
  "PENDING",
]);

const EXCLUDED_CONTEXT_TOKENS = new Set([
  "AGENCY",
  "DEPARTMENT",
  "POLICE",
  "SHERIFF",
  "COURT",
  "COUNTY",
  "STATE",
  "DISTRICT",
  "MUNICIPAL",
  "DETENTION",
  "FACILITY",
  "CENTER",
  "JAIL",
  "PRISON",
  "OFFICE",
  "BUREAU",
]);

const CHARGE_INDICATORS = new Set([
  "VIOLATION",
  "FELONY",
  "MISDEMEANOR",
  "CHARGE",
  "WARRANT",
  "OFFENSE",
  "STATUTE",
  "CODE",
]);

function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function cleanName(raw: string): string | null {
  const compact = raw.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  if (STOP_WORDS.has(compact.toUpperCase())) return null;

  const cleaned = compact
    .replace(/[;,.\-:]+$/g, "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/\s*\[[^\]]*\]\s*$/g, "")
    .trim();

  if (!cleaned) return null;
  if (!/[A-Za-z]/.test(cleaned)) return null;
  if (cleaned.split(/\s+/).length < 2) return null;

  return cleaned;
}

function hasExcludedToken(name: string): boolean {
  const tokens = name.split(/\s+/).filter(Boolean);
  return tokens.some((token) => {
    const upper = token.replace(/[^A-Za-z']/g, "").toUpperCase();
    return EXCLUDED_CONTEXT_TOKENS.has(upper) || CHARGE_INDICATORS.has(upper);
  });
}

function looksLikeCharge(text: string): boolean {
  const upper = text.toUpperCase();
  for (const indicator of CHARGE_INDICATORS) {
    if (upper.includes(indicator)) return true;
  }
  if (/\d{1,2}[-–]\d{1,2}[-–]\d+/.test(text)) return true;
  return false;
}

function looksLikeAgencyOrCourt(text: string): boolean {
  const upper = text.toUpperCase();
  for (const token of EXCLUDED_CONTEXT_TOKENS) {
    if (upper.includes(token)) return true;
  }
  return false;
}

/**
 * Primary extraction: Find name after "Subject Name" label
 *
 * Patterns matched:
 *   - "Subject Name: John Doe"
 *   - "Subject Name   John Doe"
 *   - "Subject Name - John Doe"
 */
function extractSubjectFromLabel(text: string): string | null {
  const normalizedText = normalizeLineBreaks(text);

  const patterns = [
    /\bSubject\s+Name\s*[:\-]?\s*([A-Z][a-zA-Z\s'\-]{2,50}?)(?=\s*[\n,;.]|\s+(?:DOB|Date|Age|Race|Sex|Height|Weight|Address|Booking|Case)|\s*$)/gi,
    /\bSubject\s+Name\s*[:\-]?\s*\n\s*([A-Z][a-zA-Z\s'\-]{2,50}?)(?=\s*[\n,;.]|$)/gi,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(normalizedText);
    if (match) {
      const candidate = match[1];

      if (looksLikeCharge(candidate) || looksLikeAgencyOrCourt(candidate)) {
        continue;
      }

      const cleaned = cleanName(candidate);
      if (cleaned && !hasExcludedToken(cleaned)) {
        return cleaned;
      }
    }
  }

  return null;
}

/**
 * Fallback extraction: Find name after "Subject" in narrative text
 *
 * Patterns matched:
 *   - "Subject John Doe was booked..."
 *   - "Subject: John Doe was arrested..."
 */
function extractSubjectFromNarrative(text: string): string | null {
  const normalizedText = normalizeLineBreaks(text);

  const narrativeSection = normalizedText.match(
    /(?:narrative|summary|notes?|details?|description)[\s\S]*$/i
  );
  const searchText = narrativeSection ? narrativeSection[0] : normalizedText;

  const patterns = [
    /\bSubject\s+([A-Z][a-zA-Z\s'\-]{2,50}?)\s+(?:was|has\s+been|is)\s+(?:booked|arrested|detained|charged|taken)/gi,
    /\bSubject[:\s]+([A-Z][a-zA-Z\s'\-]{2,50}?)\s+(?:was|has\s+been|is)/gi,
    /(?:booked|arrested|detained)\s+([A-Z][a-zA-Z\s'\-]{2,50}?)\s+(?:on|at|for)/gi,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(searchText);
    if (match) {
      const candidate = match[1];

      if (looksLikeCharge(candidate) || looksLikeAgencyOrCourt(candidate)) {
        continue;
      }

      const cleaned = cleanName(candidate);
      if (cleaned && !hasExcludedToken(cleaned)) {
        return cleaned;
      }
    }
  }

  return null;
}

/**
 * Main extraction function for Booking Summary documents
 *
 * @param text - The raw text extracted from the document
 * @returns Array of extracted persons (usually one subject)
 */
export function extractFromBookingSummary(text: string): ExtractedPerson[] {
  const results: ExtractedPerson[] = [];
  const seen = new Set<string>();

  const subjectFromLabel = extractSubjectFromLabel(text);
  if (subjectFromLabel) {
    const key = subjectFromLabel.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      results.push({
        name: subjectFromLabel,
        role: "subject",
        source: "subject-name-label",
      });
    }
  }

  if (results.length === 0) {
    const subjectFromNarrative = extractSubjectFromNarrative(text);
    if (subjectFromNarrative) {
      const key = subjectFromNarrative.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          name: subjectFromNarrative,
          role: "subject",
          source: "narrative",
        });
      }
    }
  }

  return results;
}
