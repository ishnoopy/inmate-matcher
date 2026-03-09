/**
 * Vehicle Crash Report Extraction Pipeline (Template C)
 *
 * Multi-person document with structured TABLE sections:
 *   - Vehicles and Drivers (table: Vehicle# | Driver Name | DOB | ...)
 *   - Passengers and Witnesses (table: Role | Name | Notes)
 *   - Citations / Charges (table: Driver | Citation | Statute)
 *
 * Rules:
 *   1. Primary: Parse Vehicles and Drivers table rows (number + name pattern)
 *   2. Secondary: Parse Passengers and Witnesses rows (Role + Name pattern)
 *   3. Fallback: Parse Citations table for driver names
 *   4. Deduplicate repeated names across sections
 *   5. Keep original format (LAST, FIRST MIDDLE) for matching
 *
 * Returns: Multiple people with roles (driver, passenger, witness)
 */

export type VehicleCrashRole = "driver" | "passenger" | "witness";

export interface ExtractedPerson {
  name: string;
  role: VehicleCrashRole;
  source:
    | "vehicles-and-drivers"
    | "passengers-and-witnesses"
    | "citations-charges";
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

function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/**
 * Clean and extract name, truncating at DOB or other metadata
 */
function cleanName(raw: string): string | null {
  let compact = raw.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  if (STOP_WORDS.has(compact.toUpperCase())) return null;

  // Truncate at DOB - everything after is metadata
  compact = compact.replace(/\s+DOB\b.*/i, "");

  // Truncate at date patterns (MM/DD/YYYY or similar)
  compact = compact.replace(/\s+\d{1,2}\/\d{1,2}\/\d{2,4}.*/, "");

  // Remove trailing punctuation and brackets
  const cleaned = compact
    .replace(/[;.\-:]+$/g, "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/\s*\[[^\]]*\]\s*$/g, "")
    .trim();

  if (!cleaned) return null;
  if (!/[A-Za-z]/.test(cleaned)) return null;

  // Must have at least 2 name parts
  const parts = cleaned.split(/[\s,]+/).filter(Boolean);
  if (parts.length < 2) return null;

  return cleaned;
}

/**
 * Extract section text between two headers
 */
function extractSection(
  text: string,
  startPattern: RegExp,
  endPatterns: RegExp[]
): string | null {
  const startMatch = text.match(startPattern);
  if (!startMatch || startMatch.index === undefined) return null;

  const sectionStart = startMatch.index + startMatch[0].length;
  let sectionEnd = text.length;

  for (const endPattern of endPatterns) {
    const endMatch = text.slice(sectionStart).match(endPattern);
    if (endMatch && endMatch.index !== undefined) {
      const possibleEnd = sectionStart + endMatch.index;
      if (possibleEnd < sectionEnd) {
        sectionEnd = possibleEnd;
      }
    }
  }

  return text.slice(sectionStart, sectionEnd);
}

/**
 * Parse Vehicles and Drivers section for driver names
 * Table format: Vehicle# | Driver Name | DOB | Vehicle Info | Injury
 * Example row: 1   ADAMS, BOBBY EUGENE   02/23/1985   2019 Toyota Camry...
 */
function extractDrivers(text: string): ExtractedPerson[] {
  const results: ExtractedPerson[] = [];
  const normalizedText = normalizeLineBreaks(text);

  const driversSection = extractSection(
    normalizedText,
    /vehicles?\s+and\s+drivers?/i,
    [/passengers?\s+and\s+witnesses?/i, /citations?\s*[\/&]?\s*charges?/i]
  );

  if (!driversSection) return results;

  // Pattern 1: Table rows starting with vehicle number
  // e.g., "1   ADAMS, BOBBY EUGENE   02/23/1985"
  const tableRowPattern = /^\s*(\d+)\s+([A-Z]{2,},\s*[A-Z]{2,}(?:\s+[A-Z]{2,})?)/gm;
  let match;

  while ((match = tableRowPattern.exec(driversSection)) !== null) {
    const name = cleanName(match[2]);
    if (name) {
      results.push({
        name,
        role: "driver",
        source: "vehicles-and-drivers",
      });
    }
  }

  // Pattern 2: Inline mentions in narrative like "( ADAMS, NATHAN CRAIG )"
  const inlinePattern = /\(\s*([A-Z]{2,},\s*[A-Z]{2,}(?:\s+[A-Z]{2,})?)\s*\)/g;
  while ((match = inlinePattern.exec(normalizedText)) !== null) {
    const name = cleanName(match[1]);
    if (name && !results.some((r) => r.name === name)) {
      results.push({
        name,
        role: "driver",
        source: "vehicles-and-drivers",
      });
    }
  }

  return results;
}

/**
 * Parse Passengers and Witnesses section
 * Table format: Role | Name | Notes / Contact
 * Example rows:
 *   Passenger (Veh 2)   ALLEN, ALYSA RAQUEL   DOB 06/18/1993...
 *   Witness   ALLEN, KESHAN DARREL   DOB 05/07/1994...
 */
function extractPassengersAndWitnesses(text: string): ExtractedPerson[] {
  const results: ExtractedPerson[] = [];
  const normalizedText = normalizeLineBreaks(text);

  const section = extractSection(
    normalizedText,
    /passengers?\s+and\s+witnesses?/i,
    [/citations?\s*[\/&]?\s*charges?/i, /narrative/i, /officer\s*notes/i]
  );

  if (!section) return results;

  // Pattern: Passenger (optional vehicle info) followed by CAPS name
  // e.g., "Passenger (Veh 2)   ALLEN, ALYSA RAQUEL"
  const passengerPattern =
    /Passenger\s*(?:\([^)]*\))?\s+([A-Z]{2,},\s*[A-Z]{2,}(?:\s+[A-Z]{2,})?)/gi;
  let match;

  while ((match = passengerPattern.exec(section)) !== null) {
    const name = cleanName(match[1]);
    if (name) {
      results.push({
        name,
        role: "passenger",
        source: "passengers-and-witnesses",
      });
    }
  }

  // Pattern: Witness followed by CAPS name
  // e.g., "Witness   ALLEN, KESHAN DARREL"
  const witnessPattern =
    /Witness\s+([A-Z]{2,},\s*[A-Z]{2,}(?:\s+[A-Z]{2,})?)/gi;

  while ((match = witnessPattern.exec(section)) !== null) {
    const name = cleanName(match[1]);
    if (name) {
      results.push({
        name,
        role: "witness",
        source: "passengers-and-witnesses",
      });
    }
  }

  return results;
}

/**
 * Fallback: Parse Citations/Charges section for any missed names
 * Table format: Driver | Citation | Statute
 * Example row: ADAMS, NATHAN CRAIG   Failure to Yield   AL Code 32-5A-112
 */
function extractFromCitations(text: string): ExtractedPerson[] {
  const results: ExtractedPerson[] = [];
  const normalizedText = normalizeLineBreaks(text);

  const section = extractSection(
    normalizedText,
    /citations?\s*[\/&]?\s*charges?/i,
    [/narrative/i, /officer\s*notes/i, /signature/i, /template/i]
  );

  if (!section) return results;

  // Pattern: CAPS name at start of line (first column in citations table)
  // e.g., "ADAMS, NATHAN CRAIG   Failure to Yield"
  const citationRowPattern =
    /^([A-Z]{2,},\s*[A-Z]{2,}(?:\s+[A-Z]{2,})?)\s+(?:Failure|Violation|Speeding|DUI|DWI|Reckless)/gim;
  let match;

  while ((match = citationRowPattern.exec(section)) !== null) {
    const name = cleanName(match[1]);
    if (name) {
      results.push({
        name,
        role: "driver",
        source: "citations-charges",
      });
    }
  }

  // Fallback: Any CAPS comma name in the section
  const capsNamePattern = /([A-Z]{2,},\s*[A-Z]{2,}(?:\s+[A-Z]{2,})?)/g;
  while ((match = capsNamePattern.exec(section)) !== null) {
    const name = cleanName(match[1]);
    if (name && !results.some((r) => r.name === name)) {
      results.push({
        name,
        role: "driver",
        source: "citations-charges",
      });
    }
  }

  return results;
}

/**
 * Main extraction function for Vehicle Crash Report documents
 *
 * @param text - The raw text extracted from the document
 * @returns Array of extracted persons (drivers, passengers, witnesses)
 */
export function extractFromVehicleCrashReport(text: string): ExtractedPerson[] {
  const seen = new Set<string>();
  const results: ExtractedPerson[] = [];

  const addUnique = (persons: ExtractedPerson[]) => {
    for (const person of persons) {
      const key = person.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        results.push(person);
      }
    }
  };

  addUnique(extractDrivers(text));
  addUnique(extractPassengersAndWitnesses(text));
  addUnique(extractFromCitations(text));

  return results;
}
