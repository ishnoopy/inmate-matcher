import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const pendingEntries = await prisma.reviewEntry.findMany({
      where: {
        status: "pending",
        document: { userId: session.user.id },
      },
      include: { document: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      ok: true,
      entries: pendingEntries,
      count: pendingEntries.length,
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
