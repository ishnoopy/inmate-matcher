import OpenAI from "openai";

export type TemplateType =
  | "booking_summary"
  | "court_docket_notice"
  | "vehicle_crash_report"
  | "unknown";

export type ConfidenceLevel = "high" | "medium" | "low" | "none";

export interface DetectionResult {
  templateType: TemplateType;
  confidence: ConfidenceLevel;
  confidenceScore: number; // 0-100
  matchedRules: string[];
  missingFields: string[];
  detectionMethod: "rules" | "llm" | "hybrid" | "fallback";
  warnings: string[];
}

interface DocumentRule {
  type: TemplateType;
  requiredPatterns: RegExp[];
  optionalPatterns: RegExp[];
  negativePatterns: RegExp[]; // Patterns that indicate this is NOT this type
  requiredFields: string[];
  weight: number; // How much to trust this rule (1-10)
}

const DOCUMENT_RULES: DocumentRule[] = [
  {
    type: "booking_summary",
    requiredPatterns: [
      /booking\s*#|booking\s*number|book(?:ing)?\s*(?:id|no)/i,
      /subject\s*name|inmate\s*name|defendant\s*name/i,
    ],
    optionalPatterns: [
      /charges?|offense|arrest/i,
      /narrative|incident|synopsis/i,
      /dob|date\s*of\s*birth|birth\s*date/i,
      /jail|detention|correctional|custody/i,
      /bond|bail/i,
      /arresting\s*officer|arr\.?\s*off/i,
      /location\s*held|housing|cell/i,
    ],
    negativePatterns: [
      /notice\s*of\s*hearing/i,
      /certificate\s*of\s*service/i,
      /vehicle\s*crash|traffic\s*crash|accident\s*report/i,
      /driver\s*#?\s*[12]|passenger\s*#?\s*[12]/i,
    ],
    requiredFields: ["booking number", "subject name"],
    weight: 10,
  },
  {
    type: "court_docket_notice",
    requiredPatterns: [
      /notice\s*of\s*hearing|court\s*date|hearing\s*notice/i,
      /defendant|plaintiff|case\s*(?:no|number|#)/i,
    ],
    optionalPatterns: [
      /certificate\s*of\s*service/i,
      /judge|magistrate|court\s*room/i,
      /attorney|counsel|represented/i,
      /docket|calendar|schedule/i,
      /motion|order|petition/i,
      /court\s*clerk|filed/i,
    ],
    negativePatterns: [
      /booking\s*#|booking\s*number/i,
      /vehicle\s*crash|traffic\s*crash/i,
      /inmate|detainee|custody/i,
    ],
    requiredFields: ["defendant", "hearing date", "case number"],
    weight: 10,
  },
  {
    type: "vehicle_crash_report",
    requiredPatterns: [
      /vehicle\s*crash|traffic\s*crash|accident\s*report|collision\s*report/i,
      /driver|vehicle\s*(?:#|number|no)/i,
    ],
    optionalPatterns: [
      /passenger|witness|pedestrian/i,
      /insurance|policy\s*(?:#|number)/i,
      /vin|license\s*plate|tag/i,
      /damage|injury|fatality/i,
      /road\s*condition|weather|visibility/i,
      /investigating\s*officer|responding\s*unit/i,
      /diagram|sketch|scene/i,
    ],
    negativePatterns: [
      /booking\s*#|booking\s*number/i,
      /notice\s*of\s*hearing/i,
      /inmate|detainee|jail/i,
    ],
    requiredFields: ["driver information", "vehicle information"],
    weight: 10,
  },
];

const CONFIDENCE_THRESHOLDS = {
  high: 75,
  medium: 50,
  low: 25,
} as const;

const VALID_TYPES = new Set<TemplateType>([
  "booking_summary",
  "court_docket_notice",
  "vehicle_crash_report",
  "unknown",
]);

const SYSTEM_PROMPT = `You are a document classifier. Analyze the document and classify it into exactly one type.

Types:
- booking_summary: Jail/detention booking record (has "Subject Name", "Booking #", "Charges", "Narrative")
- court_docket_notice: Court hearing notice (has "Defendant", "Notice of Hearing", "Certificate of Service")
- vehicle_crash_report: Vehicle crash/accident report (lists drivers, passengers, witnesses, vehicles)
- unknown: Does not match any of the above

Respond with JSON: { "templateType": "<type>", "confidence": <0-100>, "reasoning": "<brief explanation>" }`;

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY environment variable is not set. Add it to .env.local."
      );
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (score >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  if (score >= CONFIDENCE_THRESHOLDS.low) return "low";
  return "none";
}

interface RuleMatchResult {
  type: TemplateType;
  score: number;
  matchedRequired: string[];
  matchedOptional: string[];
  matchedNegative: string[];
  missingRequired: string[];
}

function evaluateRules(text: string): RuleMatchResult[] {
  const normalizedText = text.toLowerCase();
  const results: RuleMatchResult[] = [];

  for (const rule of DOCUMENT_RULES) {
    const matchedRequired: string[] = [];
    const matchedOptional: string[] = [];
    const matchedNegative: string[] = [];
    const missingRequired: string[] = [];

    // Check required patterns
    for (const pattern of rule.requiredPatterns) {
      if (pattern.test(normalizedText)) {
        matchedRequired.push(pattern.source);
      } else {
        missingRequired.push(pattern.source);
      }
    }

    // Check optional patterns
    for (const pattern of rule.optionalPatterns) {
      if (pattern.test(normalizedText)) {
        matchedOptional.push(pattern.source);
      }
    }

    // Check negative patterns (presence reduces confidence)
    for (const pattern of rule.negativePatterns) {
      if (pattern.test(normalizedText)) {
        matchedNegative.push(pattern.source);
      }
    }

    // Calculate score
    // Required patterns: 70% of total score (most important)
    // Optional patterns: 30% of total score (supporting evidence)
    // Negative patterns: -20 points each (contradictory signals)
    const requiredScore =
      rule.requiredPatterns.length > 0
        ? (matchedRequired.length / rule.requiredPatterns.length) * 70
        : 0;

    const optionalScore =
      rule.optionalPatterns.length > 0
        ? (matchedOptional.length / rule.optionalPatterns.length) * 30
        : 0;

    const negativePenalty = matchedNegative.length * 20;

    // Raw score: 0-100 range before penalties
    // Weight acts as a confidence multiplier (weight/10, so weight=10 means 100%)
    const rawScore = requiredScore + optionalScore - negativePenalty;
    const weightedScore = Math.max(0, Math.min(100, rawScore * (rule.weight / 10)));

    results.push({
      type: rule.type,
      score: weightedScore,
      matchedRequired,
      matchedOptional,
      matchedNegative,
      missingRequired,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

function findMissingFields(text: string, templateType: TemplateType): string[] {
  const rule = DOCUMENT_RULES.find((r) => r.type === templateType);
  if (!rule) return [];

  const normalizedText = text.toLowerCase();
  const missing: string[] = [];

  for (const field of rule.requiredFields) {
    const fieldPattern = new RegExp(field.replace(/\s+/g, "\\s*"), "i");
    if (!fieldPattern.test(normalizedText)) {
      missing.push(field);
    }
  }

  return missing;
}

interface LLMResult {
  templateType: TemplateType;
  confidence: number;
  reasoning: string;
}

async function callLLM(text: string): Promise<LLMResult | null> {
  const excerpt = text.slice(0, 2000); // Slightly more context for better detection

  try {
    const response = await getClient().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Classify this document:\n\n${excerpt}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 150,
      temperature: 0,
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as {
      templateType?: string;
      confidence?: number;
      reasoning?: string;
    };

    const detected = parsed.templateType as TemplateType;

    if (!VALID_TYPES.has(detected)) {
      console.warn(
        `[detectTemplateType] Unexpected LLM value: "${detected}", treating as unknown`
      );
      return {
        templateType: "unknown",
        confidence: 0,
        reasoning: parsed.reasoning || "Invalid type returned",
      };
    }

    return {
      templateType: detected,
      confidence: Math.min(100, Math.max(0, parsed.confidence ?? 50)),
      reasoning: parsed.reasoning || "",
    };
  } catch (err) {
    console.error("[detectTemplateType] LLM error:", err);
    return null;
  }
}

function combineResults(
  ruleResult: RuleMatchResult | undefined,
  llmResult: LLMResult | null,
  text: string
): DetectionResult {
  const warnings: string[] = [];
  let finalType: TemplateType = "unknown";
  let finalScore = 0;
  let method: DetectionResult["detectionMethod"] = "fallback";
  const matchedRules: string[] = [];

  // Case 1: Both rule and LLM agree
  if (ruleResult && llmResult && ruleResult.type === llmResult.templateType) {
    finalType = ruleResult.type;
    finalScore = Math.min(100, (ruleResult.score + llmResult.confidence) / 2 + 15); // Bonus for agreement
    method = "hybrid";
    matchedRules.push(...ruleResult.matchedRequired, ...ruleResult.matchedOptional);
  }
  // Case 2: Rule-based has high confidence, LLM disagrees
  else if (ruleResult && ruleResult.score >= CONFIDENCE_THRESHOLDS.high) {
    if (llmResult && llmResult.templateType !== ruleResult.type) {
      warnings.push(
        `Rule-based detection (${ruleResult.type}) conflicts with LLM (${llmResult.templateType}). Using rule-based result.`
      );
    }
    finalType = ruleResult.type;
    finalScore = ruleResult.score;
    method = "rules";
    matchedRules.push(...ruleResult.matchedRequired, ...ruleResult.matchedOptional);
  }
  // Case 3: LLM has high confidence
  else if (llmResult && llmResult.confidence >= CONFIDENCE_THRESHOLDS.high) {
    if (ruleResult && ruleResult.score >= CONFIDENCE_THRESHOLDS.medium) {
      warnings.push(
        `LLM detection (${llmResult.templateType}) conflicts with rule-based (${ruleResult.type}). Using LLM result.`
      );
    }
    finalType = llmResult.templateType;
    finalScore = llmResult.confidence;
    method = "llm";
  }
  // Case 4: Both have medium confidence - average and warn
  else if (
    ruleResult &&
    llmResult &&
    ruleResult.score >= CONFIDENCE_THRESHOLDS.medium &&
    llmResult.confidence >= CONFIDENCE_THRESHOLDS.medium
  ) {
    // Prefer the one with higher score
    if (ruleResult.score >= llmResult.confidence) {
      finalType = ruleResult.type;
      finalScore = ruleResult.score;
      method = "rules";
    } else {
      finalType = llmResult.templateType;
      finalScore = llmResult.confidence;
      method = "llm";
    }
    warnings.push("Medium confidence detection - manual review recommended");
    matchedRules.push(...(ruleResult?.matchedRequired || []));
  }
  // Case 5: Low confidence from both - use whatever we have
  else if (llmResult && llmResult.confidence > 0) {
    finalType = llmResult.templateType;
    finalScore = llmResult.confidence;
    method = "llm";
    warnings.push("Low confidence detection - manual verification strongly recommended");
  } else if (ruleResult && ruleResult.score > 0) {
    finalType = ruleResult.type;
    finalScore = ruleResult.score;
    method = "rules";
    warnings.push("Low confidence detection - manual verification strongly recommended");
  }
  // Case 6: Nothing worked
  else {
    finalType = "unknown";
    finalScore = 0;
    method = "fallback";
    warnings.push("Unable to determine document type - no patterns matched");
  }

  // Check for negative pattern matches that might indicate misclassification
  if (ruleResult && ruleResult.matchedNegative.length > 0 && finalType !== "unknown") {
    warnings.push(
      `Document contains patterns typically NOT found in ${finalType}: ${ruleResult.matchedNegative.join(", ")}`
    );
  }

  const missingFields = findMissingFields(text, finalType);
  if (missingFields.length > 0 && finalType !== "unknown") {
    warnings.push(`Missing expected fields: ${missingFields.join(", ")}`);
    // Reduce confidence if missing required fields
    finalScore = Math.max(0, finalScore - missingFields.length * 5);
  }

  return {
    templateType: finalType,
    confidence: getConfidenceLevel(finalScore),
    confidenceScore: Math.round(finalScore),
    matchedRules,
    missingFields,
    detectionMethod: method,
    warnings,
  };
}

/**
 * Detects the template type of a document with confidence scoring and uncertainty handling.
 *
 * Uses a multi-layer approach:
 * 1. Rule-based pattern matching (fast, deterministic)
 * 2. LLM classification (flexible, context-aware)
 * 3. Result combination with conflict resolution
 *
 * @returns Full detection result with confidence and warnings
 */
export async function detectTemplateTypeWithConfidence(
  text: string
): Promise<DetectionResult> {
  if (!text || text.trim().length < 50) {
    return {
      templateType: "unknown",
      confidence: "none",
      confidenceScore: 0,
      matchedRules: [],
      missingFields: [],
      detectionMethod: "fallback",
      warnings: ["Document text is too short for reliable classification"],
    };
  }

  // Step 1: Rule-based detection (fast, no API call)
  const ruleResults = evaluateRules(text);
  const topRuleResult = ruleResults[0];

  // Step 2: If rule-based is very confident, skip LLM call to save costs
  if (topRuleResult && topRuleResult.score >= 85 && topRuleResult.matchedNegative.length === 0) {
    const missingFields = findMissingFields(text, topRuleResult.type);

    return {
      templateType: topRuleResult.type,
      confidence: "high",
      confidenceScore: Math.round(topRuleResult.score),
      matchedRules: [...topRuleResult.matchedRequired, ...topRuleResult.matchedOptional],
      missingFields,
      detectionMethod: "rules",
      warnings:
        missingFields.length > 0
          ? [`Missing expected fields: ${missingFields.join(", ")}`]
          : [],
    };
  }

  // Step 3: Call LLM for additional context
  const llmResult = await callLLM(text);

  // Step 4: Combine results intelligently
  return combineResults(topRuleResult, llmResult, text);
}

/**
 * Detects the template type of a document and returns just the template type.
 *
 * @param text - The text of the document to detect the template type of.
 * @returns The template type of the document.
 */
export async function detectTemplateType(text: string): Promise<TemplateType> {
  const result = await detectTemplateTypeWithConfidence(text);
  return result.templateType;
}

/**
 * Quick rule-based detection without LLM call.
 * Useful for pre-filtering or when API is unavailable.
 */
export function detectTemplateTypeSync(text: string): DetectionResult {
  if (!text || text.trim().length < 50) {
    return {
      templateType: "unknown",
      confidence: "none",
      confidenceScore: 0,
      matchedRules: [],
      missingFields: [],
      detectionMethod: "rules",
      warnings: ["Document text is too short for reliable classification"],
    };
  }

  const ruleResults = evaluateRules(text);
  const topResult = ruleResults[0];

  if (!topResult || topResult.score < CONFIDENCE_THRESHOLDS.low) {
    return {
      templateType: "unknown",
      confidence: "none",
      confidenceScore: 0,
      matchedRules: [],
      missingFields: [],
      detectionMethod: "rules",
      warnings: ["No matching patterns found"],
    };
  }

  const missingFields = findMissingFields(text, topResult.type);
  const warnings: string[] = [];

  if (missingFields.length > 0) {
    warnings.push(`Missing expected fields: ${missingFields.join(", ")}`);
  }

  if (topResult.matchedNegative.length > 0) {
    warnings.push(
      `Contains patterns typically NOT found in ${topResult.type}`
    );
  }

  const adjustedScore = Math.max(0, topResult.score - missingFields.length * 5);

  return {
    templateType: topResult.type,
    confidence: getConfidenceLevel(adjustedScore),
    confidenceScore: Math.round(adjustedScore),
    matchedRules: [...topResult.matchedRequired, ...topResult.matchedOptional],
    missingFields,
    detectionMethod: "rules",
    warnings,
  };
}

/**
 * Check if a detection result requires manual review.
 */
export function requiresManualReview(result: DetectionResult): boolean {
  return (
    result.confidence === "low" ||
    result.confidence === "none" ||
    result.templateType === "unknown" ||
    result.warnings.length > 1 ||
    result.missingFields.length > 2
  );
}

/**
 * Get human-readable explanation of detection result.
 */
export function explainDetection(result: DetectionResult): string {
  const parts: string[] = [];

  parts.push(`Detected: ${result.templateType} (${result.confidence} confidence, ${result.confidenceScore}%)`);
  parts.push(`Method: ${result.detectionMethod}`);

  if (result.matchedRules.length > 0) {
    parts.push(`Matched patterns: ${result.matchedRules.slice(0, 3).join(", ")}${result.matchedRules.length > 3 ? "..." : ""}`);
  }

  if (result.missingFields.length > 0) {
    parts.push(`Missing fields: ${result.missingFields.join(", ")}`);
  }

  if (result.warnings.length > 0) {
    parts.push(`Warnings: ${result.warnings.join("; ")}`);
  }

  return parts.join("\n");
}
