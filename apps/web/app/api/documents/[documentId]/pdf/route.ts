import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { documentId } = await params;

    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document || document.userId !== session.user.id) {
      return NextResponse.json(
        { ok: false, error: "Document not found" },
        { status: 404 }
      );
    }

    const uploadsDir = path.resolve(process.cwd(), "data/uploads");
    const pdfPath = path.join(uploadsDir, `${documentId}.pdf`);

    try {
      const pdfBuffer = await fs.readFile(pdfPath);
      return new NextResponse(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${document.filename}"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch {
      return NextResponse.json(
        { ok: false, error: "PDF file not found on disk" },
        { status: 404 }
      );
    }
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
