"use client";

import * as React from "react";

interface DocumentViewerProps {
  text: string;
  highlightNames: string[];
}

function generateNameVariations(names: string[]): string[] {
  const variations: string[] = [];

  for (const name of names) {
    variations.push(name);

    // Handle "LAST, FIRST" format -> also search for "FIRST LAST"
    if (name.includes(",")) {
      const parts = name.split(",").map((p) => p.trim());
      if (parts.length === 2) {
        variations.push(`${parts[1]} ${parts[0]}`);
      }
    }

    // Handle "FIRST LAST" format -> also search for "LAST, FIRST"
    const spaceParts = name.trim().split(/\s+/);
    if (spaceParts.length >= 2 && !name.includes(",")) {
      const last = spaceParts[spaceParts.length - 1];
      const first = spaceParts.slice(0, -1).join(" ");
      variations.push(`${last}, ${first}`);
      variations.push(`${last},${first}`);
    }
  }

  // Deduplicate and sort by length (longest first)
  return [...new Set(variations)].sort((a, b) => b.length - a.length);
}

export function DocumentViewer({ text, highlightNames }: DocumentViewerProps) {
  const highlightedContent = React.useMemo(() => {
    if (!highlightNames.length) {
      return text;
    }

    // Generate all name variations (handles LAST, FIRST ↔ FIRST LAST)
    const allVariations = generateNameVariations(highlightNames);

    // Build regex pattern for all name variations (case insensitive)
    const escapedNames = allVariations.map((name) =>
      name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );
    const pattern = new RegExp(`(${escapedNames.join("|")})`, "gi");

    // Split text by matches and wrap matches in mark tags
    const parts = text.split(pattern);

    return parts.map((part, index) => {
      const isMatch = allVariations.some(
        (name) => name.toLowerCase() === part.toLowerCase()
      );
      if (isMatch) {
        return (
          <mark
            key={index}
            className="bg-yellow-200 dark:bg-yellow-900/50 px-0.5 rounded-sm font-medium"
          >
            {part}
          </mark>
        );
      }
      return part;
    });
  }, [text, highlightNames]);

  return (
    <div className="bg-muted/30 border border-border rounded-lg p-4 overflow-auto max-h-[70vh]">
      <pre className="text-sm font-mono whitespace-pre-wrap leading-relaxed text-foreground">
        {highlightedContent}
      </pre>
    </div>
  );
}
