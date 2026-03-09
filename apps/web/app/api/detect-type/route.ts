import { detectTemplateType, type TemplateType } from "@/app/lib/pipeline/detectTemplateType";
import { extractTextFromPdf } from "@/app/lib/pipeline/extractText";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export interface DetectTypeResponse {
  ok: boolean;
  detectedType?: TemplateType;
  error?: string;
}

export async function POST(req: Request): Promise<NextResponse<DetectTypeResponse>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Missing file field 'file' in multipart form-data." },
        { status: 400 }
      );
    }

    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json(
        { ok: false, error: `Expected a PDF (application/pdf). Got: ${file.type}` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = await extractTextFromPdf(buffer);
    const detectedType = await detectTemplateType(extracted.text);

    return NextResponse.json({
      ok: true,
      detectedType,
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: false, error: "Unknown error" },
      { status: 500 }
    );
  }
}
