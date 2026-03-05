import crypto from "crypto";
import fs from "fs";

export function ensureDirExists(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function sha1(input: string): string {
  return crypto
    .createHash("sha1")
    .update(input)
    .digest("hex");
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getPageNumberFromHref(href: string | null, base: string): number | null {
  if (!href) return null;

  const url = new URL(href, base);
  const pageParam = url.searchParams.get("page");
  if (pageParam) {
    const parsed = Number(pageParam);
    if (Number.isFinite(parsed) && parsed >= 1) return Math.floor(parsed);
  }
  // Path format: /inmate-roster/filters/current/booking_time=desc/63
  const segments = url.pathname.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1];
  const parsed = Number(lastSegment);
  if (Number.isFinite(parsed) && parsed >= 1) return Math.floor(parsed);
  return null;
}

export function resolveUrl(href: string | null, base: string): string | null {
  if (!href) return null;
  return new URL(href, base).toString();
}
