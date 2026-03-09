/**
 * Court Docket Notice Extraction Pipeline
 *
 * Rules:
 *   1. Primary: Extract the value after "Defendant"
 *   2. Fallback: Extract the name after "served on the defendant" in certificate section
 *   3. Exclude: Judge, prosecutor, court, arresting agency
 *
 * Returns: Usually one person with role "defendant"
 */

export interface ExtractedPerson {
  name: string;
  role: "defendant";
  source: "defendant-label" | "certificate-of-service";
}

const STOP_WORDS = new Set([
  "N/A",
  "NA",
  "UNKNOWN",
  "NONE",
  "NOT LISTED",
  "NOT AVAILABLE",
]);

const EXCLUDED_CONTEXT_TOKENS = new Set([
  "JUDGE",
  "HONORABLE",
  "HON",
  "PROSECUTOR",
  "ATTORNEY",
  "DISTRICT",
  "STATE",
  "COURT",
  "COUNTY",
  "AGENCY",
  "ARRESTING",
  "OFFICER",
  "CLERK",
  "MAGISTRATE",
  "BAILIFF",
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

function isExcludedContext(contextLine: string): boolean {
  const upper = contextLine.toUpperCase();
  for (const token of EXCLUDED_CONTEXT_TOKENS) {
    if (upper.includes(token)) return true;
  }
  return false;
}

function hasExcludedToken(name: string): boolean {
  const tokens = name.split(/\s+/).filter(Boolean);
  return tokens.some((token) =>
    EXCLUDED_CONTEXT_TOKENS.has(token.replace(/[^A-Za-z']/g, "").toUpperCase())
  );
}

/**
 * Primary extraction: Find name after "Defendant" label
 *
 * Patterns matched:
 *   - "Defendant: John Doe"
 *   - "Defendant John Doe"
 *   - "Defendant - John Doe"
 *   - "Defendant\n    John Doe"
 */
function extractDefendantFromLabel(text: string): string | null {
  const normalizedText = normalizeLineBreaks(text);

  const patterns = [
    /\bDefendant\s*[:\-]?\s*([A-Z][a-zA-Z\s'\-]{2,50}?)(?=\s*[\n,;.]|\s+(?:Case|Docket|vs?\.?|v\.|Date|DOB|Address|Charge)|\s*$)/gi,
    /\bDefendant\s*[:\-]?\s*\n\s*([A-Z][a-zA-Z\s'\-]{2,50}?)(?=\s*[\n,;.]|$)/gi,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(normalizedText);
    if (match) {
      const startIdx = match.index;
      const contextStart = Math.max(0, startIdx - 50);
      const contextLine = normalizedText.slice(contextStart, startIdx);

      if (!isExcludedContext(contextLine)) {
        const cleaned = cleanName(match[1]);
        if (cleaned && !hasExcludedToken(cleaned)) {
          return cleaned;
        }
      }
    }
  }

  return null;
}

/**
 * Fallback extraction: Find name after "served on the defendant" in certificate of service
 *
 * Patterns matched:
 *   - "served on the defendant John Doe"
 *   - "served on the defendant, John Doe,"
 *   - "served on defendant John Doe"
 */
function extractDefendantFromCertificateOfService(text: string): string | null {
  const normalizedText = normalizeLineBreaks(text);

  const certificateSection = normalizedText.match(
    /certificate\s+of\s+service[\s\S]*$/i
  );
  const searchText = certificateSection ? certificateSection[0] : normalizedText;

  const patterns = [
    /served\s+(?:on|upon)\s+(?:the\s+)?defendant\s*[,:]?\s*([A-Z][a-zA-Z\s'\-]{2,50}?)(?=\s*[,;.]|\s+(?:at|on|by|via|through|dated)|\s*$)/gi,
    /defendant\s*[,:]?\s*([A-Z][a-zA-Z\s'\-]{2,50}?)\s*(?:was|has\s+been)\s+served/gi,
    /copy\s+(?:was\s+)?served\s+(?:on|upon)\s+([A-Z][a-zA-Z\s'\-]{2,50}?)(?=\s*[,;.]|\s+(?:at|on|by)|\s*$)/gi,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(searchText);
    if (match) {
      const cleaned = cleanName(match[1]);
      if (cleaned && !hasExcludedToken(cleaned)) {
        return cleaned;
      }
    }
  }

  return null;
}

/**
 * Main extraction function for Court Docket Notice documents
 *
 * @param text - The raw text extracted from the document
 * @returns Array of extracted persons (usually one defendant)
 */
export function extractFromCourtDocketNotice(text: string): ExtractedPerson[] {
  const results: ExtractedPerson[] = [];
  const seen = new Set<string>();

  const defendantFromLabel = extractDefendantFromLabel(text);
  if (defendantFromLabel) {
    const key = defendantFromLabel.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      results.push({
        name: defendantFromLabel,
        role: "defendant",
        source: "defendant-label",
      });
    }
  }

  if (results.length === 0) {
    const defendantFromCertificate = extractDefendantFromCertificateOfService(text);
    if (defendantFromCertificate) {
      const key = defendantFromCertificate.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          name: defendantFromCertificate,
          role: "defendant",
          source: "certificate-of-service",
        });
      }
    }
  }

  return results;
}
