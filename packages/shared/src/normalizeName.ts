const SUFFIXES = new Set(["JR", "SR", "II", "III", "IV"]);

export function normalizeName(input: string): string {
  if (!input) return "";

  let s = input
    .toUpperCase()
    .replace(/[.\-]/g, " ")
    .replace(/[^A-Z,\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Handle "LAST, FIRST M" => "FIRST LAST"
  if (s.includes(",")) {
    const [last, rest] = s.split(",").map((x) => x.trim());
    const tokens = rest.split(" ").filter(Boolean);
    const first = tokens[0] ?? "";
    const middle = tokens.slice(1).join(" ");
    s = [first, middle, last].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  const tokens = s.split(" ").filter(Boolean);

  // remove suffix if last token
  if (tokens.length > 1 && SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  return tokens.join(" ");
}
