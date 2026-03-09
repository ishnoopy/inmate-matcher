import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { notFound, redirect } from "next/navigation";
import { DocumentReviewClient } from "./client";

interface PageProps {
  params: Promise<{ documentId: string }>;
}

export default async function DocumentReviewPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const { documentId } = await params;

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      reviewEntries: {
        orderBy: { matchScore: "desc" },
      },
    },
  });

  if (!document || document.userId !== session.user.id) {
    notFound();
  }

  return (
    <DocumentReviewClient
      document={{
        id: document.id,
        filename: document.filename,
        extractedText: document.extractedText,
        templateType: document.templateType,
        pageCount: document.pageCount,
        createdAt: document.createdAt.toISOString(),
      }}
      initialEntries={document.reviewEntries.map((e) => ({
        id: e.id,
        extractedName: e.extractedName,
        matchedInmateId: e.matchedInmateId,
        matchedInmateName: e.matchedInmateName,
        county: e.county,
        matchScore: e.matchScore,
        status: e.status,
        emailSent: e.emailSent,
        inmateDob: e.inmateDob,
        inmateBookingNum: e.inmateBookingNum,
      }))}
    />
  );
}
