// apps/web/app/api/ingest/route.ts
import { matchInmates } from "@/app/lib/matching/matchInmates";
import { detectTemplateType } from "@/app/lib/pipeline/detectTemplateType";
import { extractCandidateNames } from "@/app/lib/pipeline/extractNames";
import { extractTextFromPdfFile } from "@/app/lib/pipeline/extractText";
import { saveUploadedPdfToDisk } from "@/app/lib/storage/saveUpload";
import { auth } from "@/lib/auth";
import { safeDecrypt } from "@/lib/crypto/encryptPassword";
import { prisma } from "@/lib/db/prisma";
import { sendMatchAlertEmail } from "@/lib/email/sendMatchAlert";
import {
  getClientIdentifier,
  ingestRateLimiter,
  rateLimitHeaders,
} from "@/lib/ratelimit";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const identifier = getClientIdentifier(req, session.user.id);
    const rateLimitResult = ingestRateLimiter.check(identifier);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Rate limit exceeded. Maximum 15 requests per minute for document ingestion.",
        },
        {
          status: 429,
          headers: rateLimitHeaders(rateLimitResult),
        }
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    const templateTypeOverride = form.get("templateType") as string | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Missing file field 'file' in multipart form-data." },
        { status: 400 }
      );
    }

    // Basic validation
    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json(
        { ok: false, error: `Expected a PDF (application/pdf). Got: ${file.type}` },
        { status: 400 }
      );
    }

    const saved = await saveUploadedPdfToDisk(file);
    const extracted = await extractTextFromPdfFile(saved.absolutePath);

    // Use override if provided, otherwise detect via LLM
    const validOverrides = ["booking_summary", "court_docket_notice", "vehicle_crash_report", "other", "unknown"];
    const templateType = templateTypeOverride && validOverrides.includes(templateTypeOverride)
      ? (templateTypeOverride === "other" ? "unknown" : templateTypeOverride as Awaited<ReturnType<typeof detectTemplateType>>)
      : await detectTemplateType(extracted.text);

    const names = await extractCandidateNames(extracted.text, templateType);
    const matches = matchInmates(names);

    // Save document and review entries to database
    const document = await prisma.document.create({
      data: {
        id: saved.documentId,
        filename: saved.filename,
        storagePath: saved.relativePath,
        extractedText: extracted.text,
        templateType: templateType,
        pageCount: extracted.pageCount ?? 0,
        isLikelyScanned: extracted.isLikelyScanned,
        userId: session.user.id,
      },
    });

    // Create review entries for each match
    const createdEntryIds: number[] = [];
    if (matches.length > 0) {
      for (const match of matches) {
        const entry = await prisma.reviewEntry.create({
          data: {
            documentId: document.id,
            extractedName: match.matchedFrom,
            matchedInmateId: match.id,
            matchedInmateName: match.fullNameRaw,
            county: match.source,
            matchScore: match.score,
            scoringBasis: JSON.stringify(match.scoringBasis),
            status: "pending",
            inmateDob: match.dob ?? null,
            inmateBookingNum: match.bookingNumber ?? null,
          },
        });
        createdEntryIds.push(entry.id);
      }
    }

    // Auto-send email alerts if configured
    let emailsSent = 0;
    const emailSettings = await prisma.emailSettings.findUnique({
      where: { userId: session.user.id },
    });

    if (emailSettings?.enabled && emailSettings.autoSendOnMatch && matches.length > 0) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ||
        req.headers.get("origin") ||
        req.headers.get("referer")?.split("/").slice(0, 3).join("/");

      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        if (match.score >= emailSettings.minScoreForAuto) {
          const result = await sendMatchAlertEmail(
            {
              extractedName: match.matchedFrom,
              matchedInmateName: match.fullNameRaw,
              county: match.source,
              matchScore: match.score,
              scoringBasis: match.scoringBasis,
              documentFilename: saved.filename,
              documentId: document.id,
              reviewEntryId: createdEntryIds[i],
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

          if (result.success) {
            emailsSent++;
            await prisma.reviewEntry.update({
              where: { id: createdEntryIds[i] },
              data: {
                emailSent: true,
                emailSentAt: new Date(),
              },
            });
          }
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        documentId: saved.documentId,
        filename: saved.filename,
        storagePath: saved.relativePath,
        pageCount: extracted.pageCount,
        textLength: extracted.textLength,
        isLikelyScanned: extracted.isLikelyScanned,
        templateType,
        text: extracted.text,
        names,
        matches,
        emailsSent,
      },
      { headers: rateLimitHeaders(rateLimitResult) }
    );


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
