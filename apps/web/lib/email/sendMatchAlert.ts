import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { interpretScore } from "@/lib/matching/scoreUtils";
import type { ScoringBasis } from "@/lib/matching/scoreUtils";

export interface EmailSettings {
  enabled: boolean;
  gmailAddress: string;
  gmailAppPassword: string;
  recipientEmail: string;
  autoSendOnMatch: boolean;
  minScoreForAuto: number;
}

export interface MatchAlertData {
  extractedName: string;
  matchedInmateName: string;
  county: string;
  matchScore: number;
  scoringBasis?: ScoringBasis | string | null;
  documentFilename: string;
  documentId: string;
  reviewEntryId: number;
}

function createTransporter(settings: EmailSettings): Transporter {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // STARTTLS on port 587
    auth: {
      user: settings.gmailAddress,
      pass: settings.gmailAppPassword,
    },
    connectionTimeout: 10_000, // fail fast if SMTP port is blocked/unreachable
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

function getConfidenceColor(level: "low" | "medium" | "high"): string {
  switch (level) {
    case "high":
      return "#16a34a";
    case "medium":
      return "#ca8a04";
    case "low":
      return "#dc2626";
  }
}

function generateEmailHtml(data: MatchAlertData, appUrl?: string): string {
  const interpretation = interpretScore(data.matchScore);
  const confidenceColor = getConfidenceColor(interpretation.level);
  const reviewUrl = appUrl ? `${appUrl}/review/${data.documentId}` : null;

  let scoringDetails = "";
  if (data.scoringBasis) {
    const basis = typeof data.scoringBasis === "string" 
      ? JSON.parse(data.scoringBasis) as ScoringBasis
      : data.scoringBasis;
    scoringDetails = `
      <tr>
        <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Matched Tokens</td>
        <td style="padding: 8px 0; font-size: 14px;">${basis.matchedTokens.join(", ")}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Extracted (Normalized)</td>
        <td style="padding: 8px 0; font-size: 14px;">${basis.extractedNormalized}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Roster (Normalized)</td>
        <td style="padding: 8px 0; font-size: 14px;">${basis.rosterNormalized}</td>
      </tr>
    `;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background-color: #1f2937; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">Inmate Match Alert</h1>
    </div>
    
    <!-- Confidence Badge -->
    <div style="padding: 20px; text-align: center; border-bottom: 1px solid #e5e7eb;">
      <span style="display: inline-block; padding: 8px 16px; border-radius: 9999px; background-color: ${confidenceColor}; color: white; font-weight: 600; font-size: 14px;">
        ${interpretation.label}
      </span>
      <p style="margin: 12px 0 0; color: #6b7280; font-size: 13px;">${interpretation.description}</p>
    </div>
    
    <!-- Match Details -->
    <div style="padding: 24px;">
      <h2 style="margin: 0 0 16px; font-size: 16px; color: #374151;">Match Details</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 40%;">Extracted Name</td>
          <td style="padding: 8px 0; font-size: 14px; font-weight: 500;">${data.extractedName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Matched Inmate</td>
          <td style="padding: 8px 0; font-size: 14px; font-weight: 500;">${data.matchedInmateName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">County</td>
          <td style="padding: 8px 0; font-size: 14px;">${data.county === "madison" ? "Madison County" : data.county === "limestone" ? "Limestone County" : data.county}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Match Score</td>
          <td style="padding: 8px 0; font-size: 14px;">${data.matchScore} matching tokens</td>
        </tr>
        ${scoringDetails}
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Document</td>
          <td style="padding: 8px 0; font-size: 14px;">${data.documentFilename}</td>
        </tr>
      </table>
    </div>
    
    <!-- CTA Button -->
    ${reviewUrl ? `
    <div style="padding: 0 24px 24px; text-align: center;">
      <a href="${reviewUrl}" style="display: inline-block; padding: 12px 24px; background-color: #1f2937; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">
        Review Match
      </a>
    </div>
    ` : ""}
    
    <!-- Footer -->
    <div style="padding: 16px 24px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="margin: 0; color: #9ca3af; font-size: 12px;">
        This alert was generated by Inmate Matcher
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function generateEmailText(data: MatchAlertData): string {
  const interpretation = interpretScore(data.matchScore);
  
  let text = `INMATE MATCH ALERT\n`;
  text += `${"=".repeat(40)}\n\n`;
  text += `Confidence: ${interpretation.label}\n`;
  text += `${interpretation.description}\n\n`;
  text += `MATCH DETAILS\n`;
  text += `${"-".repeat(40)}\n`;
  text += `Extracted Name: ${data.extractedName}\n`;
  text += `Matched Inmate: ${data.matchedInmateName}\n`;
  text += `County: ${data.county === "madison" ? "Madison County" : data.county === "limestone" ? "Limestone County" : data.county}\n`;
  text += `Match Score: ${data.matchScore} matching tokens\n`;
  
  if (data.scoringBasis) {
    const basis = typeof data.scoringBasis === "string"
      ? JSON.parse(data.scoringBasis) as ScoringBasis
      : data.scoringBasis;
    text += `Matched Tokens: ${basis.matchedTokens.join(", ")}\n`;
    text += `Extracted (Normalized): ${basis.extractedNormalized}\n`;
    text += `Roster (Normalized): ${basis.rosterNormalized}\n`;
  }
  
  text += `Document: ${data.documentFilename}\n`;
  
  return text;
}

export async function sendMatchAlertEmail(
  data: MatchAlertData,
  settings: EmailSettings,
  appUrl?: string
): Promise<{ success: boolean; error?: string }> {
  if (!settings.enabled) {
    return { success: false, error: "Email notifications are disabled" };
  }

  if (!settings.gmailAddress || !settings.gmailAppPassword || !settings.recipientEmail) {
    return { success: false, error: "Email settings are incomplete" };
  }

  try {
    const transporter = createTransporter(settings);
    const interpretation = interpretScore(data.matchScore);
    
    const subject = `[${interpretation.label}] Match Found: ${data.extractedName} → ${data.matchedInmateName}`;
    
    await transporter.sendMail({
      from: `"Inmate Matcher" <${settings.gmailAddress}>`,
      to: settings.recipientEmail,
      subject,
      text: generateEmailText(data),
      html: generateEmailHtml(data, appUrl),
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error sending email";
    console.error("[sendMatchAlertEmail] Error:", message);
    return { success: false, error: message };
  }
}

export async function sendTestEmail(
  settings: EmailSettings
): Promise<{ success: boolean; error?: string }> {
  if (!settings.gmailAddress || !settings.gmailAppPassword || !settings.recipientEmail) {
    return { success: false, error: "Email settings are incomplete" };
  }

  try {
    const transporter = createTransporter(settings);
    
    await transporter.sendMail({
      from: `"Inmate Matcher" <${settings.gmailAddress}>`,
      to: settings.recipientEmail,
      subject: "Inmate Matcher - Test Email",
      text: "This is a test email from Inmate Matcher. If you received this, your email configuration is working correctly!",
      html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background-color: #16a34a; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">Test Email Successful!</h1>
    </div>
    <div style="padding: 24px; text-align: center;">
      <p style="margin: 0 0 16px; color: #374151; font-size: 16px;">Your email configuration is working correctly.</p>
      <p style="margin: 0; color: #6b7280; font-size: 14px;">You will receive alerts when inmate matches are found.</p>
    </div>
  </div>
</body>
</html>
      `.trim(),
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error sending test email";
    console.error("[sendTestEmail] Error:", message);
    return { success: false, error: message };
  }
}
