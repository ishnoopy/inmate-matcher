"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { UserMenu } from "@/components/user-menu";

interface EmailSettings {
  id?: number;
  enabled: boolean;
  gmailAddress: string;
  gmailAppPassword: string;
  recipientEmail: string;
  autoSendOnMatch: boolean;
  minScoreForAuto: number;
}

const DEFAULT_SETTINGS: EmailSettings = {
  enabled: false,
  gmailAddress: "",
  gmailAppPassword: "",
  recipientEmail: "",
  autoSendOnMatch: true,
  minScoreForAuto: 3,
};

export default function SettingsPage() {
  const [settings, setSettings] = React.useState<EmailSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isTesting, setIsTesting] = React.useState(false);

  React.useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const res = await fetch("/api/settings/email");
      const data = await res.json();
      if (data.ok && data.settings) {
        setSettings(data.settings);
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
      toast.error("Failed to load settings");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);

    try {
      const res = await fetch("/api/settings/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();

      if (data.ok) {
        setSettings(data.settings);
        toast.success("Settings saved successfully!");
      } else {
        toast.error(data.error || "Failed to save settings");
      }
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTestEmail() {
    setIsTesting(true);

    try {
      const res = await fetch("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const data = await res.json();

      if (data.ok) {
        toast.success("Test email sent! Check your inbox.");
      } else {
        toast.error(data.error || "Failed to send test email");
      }
    } catch {
      toast.error("Failed to send test email");
    } finally {
      setIsTesting(false);
    }
  }

  function updateSettings(updates: Partial<EmailSettings>) {
    setSettings((prev) => ({ ...prev, ...updates }));
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border px-6 py-4">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-base font-semibold tracking-tight">Settings</h1>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-6 py-8">
          <p className="text-sm text-muted-foreground">Loading settings...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold tracking-tight">Settings</h1>
            <p className="text-xs text-muted-foreground">
              Configure email notifications and alerts
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="outline" size="sm">
                Back to Home
              </Button>
            </Link>
            <div className="border-l border-border pl-4">
              <UserMenu />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <form onSubmit={handleSave} className="flex flex-col gap-6">
          {/* Gmail Configuration */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Gmail Configuration</CardTitle>
                <Badge variant={settings.enabled ? "default" : "secondary"}>
                  {settings.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* Enable/Disable Toggle */}
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div>
                  <Label className="text-sm font-medium">Enable Email Alerts</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Receive email notifications when matches are found
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.enabled}
                  onClick={() => updateSettings({ enabled: !settings.enabled })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    settings.enabled ? "bg-primary" : "bg-input"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                      settings.enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Gmail Address */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gmailAddress" className="text-xs">
                  Gmail Address
                </Label>
                <Input
                  id="gmailAddress"
                  type="email"
                  placeholder="your-email@gmail.com"
                  value={settings.gmailAddress}
                  onChange={(e) => updateSettings({ gmailAddress: e.target.value })}
                />
              </div>

              {/* App Password */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="gmailAppPassword" className="text-xs">
                    Gmail App Password
                  </Label>
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400 border border-green-500/20">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className="size-3 shrink-0"
                    >
                      <path
                        fillRule="evenodd"
                        d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v4A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5v-4A1.5 1.5 0 0 0 11 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Password is encrypted at rest
                  </span>
                </div>
                <Input
                  id="gmailAppPassword"
                  type="password"
                  placeholder="••••••••••••••••"
                  value={settings.gmailAppPassword}
                  onChange={(e) => updateSettings({ gmailAppPassword: e.target.value })}
                />
                <p className="text-[10px] text-muted-foreground">
                  Create an App Password at{" "}
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    myaccount.google.com/apppasswords
                  </a>
                  {" "}(requires 2FA enabled)
                </p>
              </div>

              {/* Recipient Email */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="recipientEmail" className="text-xs">
                  Recipient Email
                </Label>
                <Input
                  id="recipientEmail"
                  type="email"
                  placeholder="alerts@example.com"
                  value={settings.recipientEmail}
                  onChange={(e) => updateSettings({ recipientEmail: e.target.value })}
                />
                <p className="text-[10px] text-muted-foreground">
                  Where match alerts will be sent
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Auto-send Settings */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-sm">Auto-send Settings</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* Auto-send Toggle */}
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div>
                  <Label className="text-sm font-medium">Auto-send on Match</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Automatically send emails when new matches are found
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.autoSendOnMatch}
                  onClick={() => updateSettings({ autoSendOnMatch: !settings.autoSendOnMatch })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    settings.autoSendOnMatch ? "bg-primary" : "bg-input"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                      settings.autoSendOnMatch ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Minimum Score Threshold */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="minScoreForAuto" className="text-xs">
                  Minimum Score for Auto-send
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="minScoreForAuto"
                    type="number"
                    min={2}
                    max={10}
                    value={settings.minScoreForAuto}
                    onChange={(e) =>
                      updateSettings({ minScoreForAuto: parseInt(e.target.value) || 2 })
                    }
                    className="w-20"
                  />
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <span className="size-2 rounded-full bg-red-500" />2 = Low
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="size-2 rounded-full bg-yellow-500" />3 = Medium
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="size-2 rounded-full bg-green-500" />4+ = High
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Only auto-send for matches with score at or above this threshold.
                  Lower scores can still be sent manually.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-between gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestEmail}
              disabled={isTesting || !settings.gmailAddress || !settings.recipientEmail}
            >
              {isTesting ? "Sending..." : "Send Test Email"}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </form>

        {/* Setup Instructions */}
        <Card className="mt-8">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm">Gmail Setup Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-2">
              <li>
                Enable 2-Step Verification on your Google account at{" "}
                <a
                  href="https://myaccount.google.com/security"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  myaccount.google.com/security
                </a>
              </li>
              <li>
                Go to{" "}
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  myaccount.google.com/apppasswords
                </a>
              </li>
              <li>Select &quot;Mail&quot; as the app and your device type</li>
              <li>Click &quot;Generate&quot; and copy the 16-character password</li>
              <li>Paste the App Password in the field above (no spaces needed)</li>
            </ol>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
