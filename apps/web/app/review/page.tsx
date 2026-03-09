import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";
import { ReviewQueueClient } from "./client";

export const dynamic = "force-dynamic";

export default async function ReviewQueuePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const userFilter = { document: { userId: session.user.id } };

  const [entries, pendingCount, confirmedCount, rejectedCount] = await Promise.all([
    prisma.reviewEntry.findMany({
      where: userFilter,
      include: { document: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.reviewEntry.count({ where: { ...userFilter, status: "pending" } }),
    prisma.reviewEntry.count({ where: { ...userFilter, status: "confirmed" } }),
    prisma.reviewEntry.count({ where: { ...userFilter, status: "rejected" } }),
  ]);

  return (
    <ReviewQueueClient
      initialEntries={entries.map((e) => ({
        id: e.id,
        documentId: e.documentId,
        documentFilename: e.document.filename,
        extractedName: e.extractedName,
        matchedInmateId: e.matchedInmateId,
        matchedInmateName: e.matchedInmateName,
        county: e.county,
        matchScore: e.matchScore,
        status: e.status,
        emailSent: e.emailSent,
        inmateDob: e.inmateDob,
        inmateBookingNum: e.inmateBookingNum,
        createdAt: e.createdAt.toISOString(),
      }))}
      initialCounts={{
        all: entries.length,
        pending: pendingCount,
        confirmed: confirmedCount,
        rejected: rejectedCount,
      }}
    />
  );
}
