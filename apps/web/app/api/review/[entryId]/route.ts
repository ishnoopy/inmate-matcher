import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

async function verifyEntryOwnership(entryId: number, userId: string) {
  const entry = await prisma.reviewEntry.findUnique({
    where: { id: entryId },
    include: { document: true },
  });

  if (!entry) return { entry: null, authorized: false };
  if (entry.document.userId !== userId) return { entry: null, authorized: false };
  return { entry, authorized: true };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { entryId } = await params;
    const id = parseInt(entryId, 10);

    if (isNaN(id)) {
      return NextResponse.json(
        { ok: false, error: "Invalid entry ID" },
        { status: 400 }
      );
    }

    const { entry, authorized } = await verifyEntryOwnership(id, session.user.id);

    if (!authorized || !entry) {
      return NextResponse.json(
        { ok: false, error: "Review entry not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, entry });
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { entryId } = await params;
    const id = parseInt(entryId, 10);

    if (isNaN(id)) {
      return NextResponse.json(
        { ok: false, error: "Invalid entry ID" },
        { status: 400 }
      );
    }

    const { authorized } = await verifyEntryOwnership(id, session.user.id);

    if (!authorized) {
      return NextResponse.json(
        { ok: false, error: "Review entry not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { status } = body;

    if (!status || !["confirmed", "rejected", "pending"].includes(status)) {
      return NextResponse.json(
        { ok: false, error: "Invalid status. Must be 'confirmed', 'rejected', or 'pending'" },
        { status: 400 }
      );
    }

    const entry = await prisma.reviewEntry.update({
      where: { id },
      data: {
        status,
        reviewedAt: status !== "pending" ? new Date() : null,
      },
    });

    return NextResponse.json({ ok: true, entry });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message.includes("Record to update not found")) {
        return NextResponse.json(
          { ok: false, error: "Review entry not found" },
          { status: 404 }
        );
      }
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
