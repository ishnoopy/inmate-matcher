export type ConfidenceLevel = "low" | "medium" | "high";

export interface ScoreInterpretation {
  level: ConfidenceLevel;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  textColor: string;
}

export interface ScoringBasis {
  matchedTokens: string[];
  extractedNormalized: string;
  rosterNormalized: string;
}

/**
 * Interprets a match score and returns human-readable information.
 * 
 * Scoring logic:
 * - Score 2: Only first and last name matched (minimum for a match)
 * - Score 3: First, last, and one additional part matched (middle name or suffix)
 * - Score 4+: Full name match including multiple middle names or suffixes
 */
export function interpretScore(score: number): ScoreInterpretation {
  if (score >= 4) {
    return {
      level: "high",
      label: "High Confidence",
      description: "Full name match including middle name/suffix",
      color: "green",
      bgColor: "bg-green-100 dark:bg-green-900/30",
      textColor: "text-green-800 dark:text-green-200",
    };
  }

  if (score === 3) {
    return {
      level: "medium",
      label: "Medium Confidence",
      description: "First, last, and one additional part matched",
      color: "yellow",
      bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
      textColor: "text-yellow-800 dark:text-yellow-200",
    };
  }

  return {
    level: "low",
    label: "Low Confidence",
    description: "Only first and last name matched",
    color: "red",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    textColor: "text-red-800 dark:text-red-200",
  };
}

/**
 * Formats the scoring basis into a human-readable string.
 */
export function formatScoringBasis(basis: ScoringBasis): string {
  const { matchedTokens, extractedNormalized, rosterNormalized } = basis;
  
  const tokensStr = matchedTokens.map(t => `"${t}"`).join(", ");
  return `Matched tokens: ${tokensStr}\nExtracted: "${extractedNormalized}"\nRoster: "${rosterNormalized}"`;
}

/**
 * Returns a short summary of matched tokens for display.
 */
export function getMatchedTokensSummary(matchedTokens: string[]): string {
  if (matchedTokens.length === 0) return "No tokens matched";
  return matchedTokens.map(t => t.charAt(0) + t.slice(1).toLowerCase()).join(" + ");
}
