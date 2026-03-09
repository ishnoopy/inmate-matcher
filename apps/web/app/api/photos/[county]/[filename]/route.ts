import path from "path";
import fs from "fs";
import sharp from "sharp";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const PHOTOS_BASE = path.resolve(
  process.cwd(),
  "../../apps/scraper/data/photos"
);

const ALLOWED_COUNTIES = new Set(["madison", "limestone"]);

// Target dimensions for the 3:4 (portrait) card display
const OUTPUT_WIDTH = 400;
const OUTPUT_HEIGHT = 533; // ~3:4 ratio

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ county: string; filename: string }> }
) {
  const { county, filename } = await params;

  if (!ALLOWED_COUNTIES.has(county)) {
    return NextResponse.json({ error: "Invalid county" }, { status: 400 });
  }

  // Only allow .jpg files with hex filenames (sha1 = 40 hex chars)
  if (!/^[0-9a-f]{40}\.jpg$/i.test(filename)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const filePath = path.join(PHOTOS_BASE, county, filename);

  // Ensure path doesn't escape PHOTOS_BASE
  if (!filePath.startsWith(PHOTOS_BASE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  try {
    const processed = await sharp(filePath)
      // Resize to fill the card's 3:4 viewport, cropping from the top (face area)
      .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, {
        fit: "cover",
        position: "top",
      })
      // Mild unsharp mask: improves perceived detail on low-res mugshots
      .sharpen({ sigma: 1.2, m1: 0.5, m2: 0.2 })
      // Slight contrast/saturation boost for washed-out jailhouse lighting
      .modulate({ brightness: 1.05, saturation: 1.1 })
      // Output as high-quality progressive JPEG
      .jpeg({ quality: 88, progressive: true, mozjpeg: true })
      .toBuffer();

    return new Response(processed.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "image/jpeg",
        // Cache aggressively — mugshots don't change once scraped
        "Cache-Control": "public, max-age=604800, immutable",
        "Content-Length": String(processed.byteLength),
      },
    });
  } catch (err) {
    console.error(`[photos] sharp processing failed for ${filePath}:`, err);
    // Fall back to serving the raw file if sharp fails
    const buffer = fs.readFileSync(filePath);
    return new Response(buffer.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }
}
