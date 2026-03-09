"use client";

import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function UserMenu() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
    </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary border border-primary/20">
          {(session.user.name?.charAt(0) || session.user.email?.charAt(0) || "U").toUpperCase()}
        </div>
        <span className="text-sm text-foreground font-medium hidden sm:inline truncate max-w-[150px]">
          {session.user.name || session.user.email}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => signOut({ callbackUrl: "/auth/signin" })}
        className="text-muted-foreground hover:text-foreground"
      >
        Sign out
      </Button>
    </div>
  );
}
