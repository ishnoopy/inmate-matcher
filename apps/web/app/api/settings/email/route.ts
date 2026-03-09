import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { sendTestEmail } from "@/lib/email/sendMatchAlert";
import { encrypt, safeDecrypt } from "@/lib/crypto/encryptPassword";

export const runtime = "nodejs";

function maskPassword(password: string): string {
  if (password.length <= 4) return "****";
  return password.slice(0, 2) + "*".repeat(password.length - 4) + password.slice(-2);
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const settings = await prisma.emailSettings.findUnique({
      where: { userId: session.user.id },
    });

    if (!settings) {
      return NextResponse.json({
        ok: true,
        settings: null,
      });
    }

    const decryptedPassword = safeDecrypt(settings.gmailAppPassword);

    return NextResponse.json({
      ok: true,
      settings: {
        id: settings.id,
        enabled: settings.enabled,
        gmailAddress: settings.gmailAddress,
        gmailAppPassword: maskPassword(decryptedPassword),
        recipientEmail: settings.recipientEmail,
        autoSendOnMatch: settings.autoSendOnMatch,
        minScoreForAuto: settings.minScoreForAuto,
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt,
      },
    });
  } catch (error) {
    console.error("[GET /api/settings/email] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch email settings" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      enabled,
      gmailAddress,
      gmailAppPassword,
      recipientEmail,
      autoSendOnMatch,
      minScoreForAuto,
    } = body;

    if (!gmailAddress || !recipientEmail) {
      return NextResponse.json(
        { ok: false, error: "Gmail address and recipient email are required" },
        { status: 400 }
      );
    }

    const existingSettings = await prisma.emailSettings.findUnique({
      where: { userId: session.user.id },
    });

    let settings;

    // If the incoming password contains "*" it's a masked placeholder — keep the existing encrypted value.
    // Otherwise the user supplied a new password — encrypt it before storing.
    const isPlaceholder = gmailAppPassword?.includes("*");
    const encryptedPasswordToSave = isPlaceholder && existingSettings
      ? existingSettings.gmailAppPassword
      : encrypt(gmailAppPassword || "");

    if (existingSettings) {
      settings = await prisma.emailSettings.update({
        where: { userId: session.user.id },
        data: {
          enabled: enabled ?? false,
          gmailAddress,
          gmailAppPassword: encryptedPasswordToSave,
          recipientEmail,
          autoSendOnMatch: autoSendOnMatch ?? true,
          minScoreForAuto: minScoreForAuto ?? 3,
        },
      });
    } else {
      if (!gmailAppPassword || gmailAppPassword.includes("*")) {
        return NextResponse.json(
          { ok: false, error: "Gmail App Password is required for initial setup" },
          { status: 400 }
        );
      }

      settings = await prisma.emailSettings.create({
        data: {
          enabled: enabled ?? false,
          gmailAddress,
          gmailAppPassword: encrypt(gmailAppPassword),
          recipientEmail,
          autoSendOnMatch: autoSendOnMatch ?? true,
          minScoreForAuto: minScoreForAuto ?? 3,
          userId: session.user.id,
        },
      });
    }

    const savedDecrypted = safeDecrypt(settings.gmailAppPassword);

    return NextResponse.json({
      ok: true,
      settings: {
        id: settings.id,
        enabled: settings.enabled,
        gmailAddress: settings.gmailAddress,
        gmailAppPassword: maskPassword(savedDecrypted),
        recipientEmail: settings.recipientEmail,
        autoSendOnMatch: settings.autoSendOnMatch,
        minScoreForAuto: settings.minScoreForAuto,
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt,
      },
    });
  } catch (error) {
    console.error("[POST /api/settings/email] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to save email settings" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { action } = body;

    if (action === "test") {
      const settings = await prisma.emailSettings.findUnique({
        where: { userId: session.user.id },
      });

      if (!settings) {
        return NextResponse.json(
          { ok: false, error: "No email settings configured" },
          { status: 400 }
        );
      }

      const result = await sendTestEmail({
        enabled: true,
        gmailAddress: settings.gmailAddress,
        gmailAppPassword: safeDecrypt(settings.gmailAppPassword),
        recipientEmail: settings.recipientEmail,
        autoSendOnMatch: settings.autoSendOnMatch,
        minScoreForAuto: settings.minScoreForAuto,
      });

      if (!result.success) {
        return NextResponse.json(
          { ok: false, error: result.error || "Failed to send test email" },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, message: "Test email sent successfully" });
    }

    return NextResponse.json(
      { ok: false, error: "Unknown action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[PUT /api/settings/email] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to process request" },
      { status: 500 }
    );
  }
}
