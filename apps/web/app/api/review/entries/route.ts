import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const VALID_STATUSES = ["pending", "confirmed", "rejected"];

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const baseWhere = { document: { userId: session.user.id } };
    const whereClause = status && VALID_STATUSES.includes(status)
      ? { ...baseWhere, status }
      : baseWhere;

    const entries = await prisma.reviewEntry.findMany({
      where: whereClause,
      include: { document: true },
      orderBy: { createdAt: "desc" },
    });

    // Get counts for each status (filtered by user)
    const [pendingCount, confirmedCount, rejectedCount, totalCount] = await Promise.all([
      prisma.reviewEntry.count({ where: { ...baseWhere, status: "pending" } }),
      prisma.reviewEntry.count({ where: { ...baseWhere, status: "confirmed" } }),
      prisma.reviewEntry.count({ where: { ...baseWhere, status: "rejected" } }),
      prisma.reviewEntry.count({ where: baseWhere }),
    ]);

    return NextResponse.json({
      ok: true,
      entries,
      count: entries.length,
      counts: {
        all: totalCount,
        pending: pendingCount,
        confirmed: confirmedCount,
        rejected: rejectedCount,
      },
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
