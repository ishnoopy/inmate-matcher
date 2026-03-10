import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { sendMatchAlertEmail } from "@/lib/email/sendMatchAlert";
import { safeDecrypt } from "@/lib/crypto/encryptPassword";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
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

    if (process.env.NEXT_PUBLIC_IS_EMAILING_ENABLED !== "true") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Email alerts are currently disabled. Outbound SMTP is not permitted on DigitalOcean droplets. This feature will be re-enabled once we migrate to a third-party email service provider.",
        },
        { status: 503 }
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

    const entry = await prisma.reviewEntry.findUnique({
      where: { id },
      include: { document: true },
    });

    if (!entry || entry.document.userId !== session.user.id) {
      return NextResponse.json(
        { ok: false, error: "Review entry not found" },
        { status: 404 }
      );
    }

    const emailSettings = await prisma.emailSettings.findFirst({
      orderBy: { id: "desc" },
    });

    if (!emailSettings) {
      return NextResponse.json(
        { ok: false, error: "Email settings not configured. Please configure at the settings page." },
        { status: 400 }
      );
    }

    if (!emailSettings.enabled) {
      return NextResponse.json(
        { ok: false, error: "Email notifications are disabled. Enable them in settings." },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ||
      (req.headers.get("origin") || req.headers.get("referer")?.split("/").slice(0, 3).join("/"));

    const result = await sendMatchAlertEmail(
      {
        extractedName: entry.extractedName,
        matchedInmateName: entry.matchedInmateName,
        county: entry.county,
        matchScore: entry.matchScore,
        scoringBasis: entry.scoringBasis,
        documentFilename: entry.document.filename,
        documentId: entry.documentId,
        reviewEntryId: entry.id,
      },
      {
        enabled: emailSettings.enabled,
        gmailAddress: emailSettings.gmailAddress,
        gmailAppPassword: safeDecrypt(emailSettings.gmailAppPassword),
        recipientEmail: emailSettings.recipientEmail,
        autoSendOnMatch: emailSettings.autoSendOnMatch,
        minScoreForAuto: emailSettings.minScoreForAuto,
      },
      appUrl || undefined
    );

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error || "Failed to send email" },
        { status: 500 }
      );
    }

    await prisma.reviewEntry.update({
      where: { id },
      data: {
        emailSent: true,
        emailSentAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, message: "Email sent successfully" });
  } catch (err: unknown) {
    console.error("[POST /api/review/[entryId]/email] Error:", err);
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
