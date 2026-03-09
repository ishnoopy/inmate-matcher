import { auth } from "@/lib/auth";
import {
  generalRateLimiter,
  getClientIdentifier,
  rateLimitHeaders,
} from "@/lib/ratelimit";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  const publicRoutes = ["/auth/signin", "/auth/signup"];
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

  const isAuthRoute = pathname.startsWith("/api/auth");

  if (isAuthRoute) {
    return NextResponse.next();
  }

  const isApiRoute = pathname.startsWith("/api/");
  const isIngestRoute = pathname === "/api/ingest";

  if (isApiRoute && !isIngestRoute) {
    const identifier = getClientIdentifier(req, req.auth?.user?.id);
    const rateLimitResult = generalRateLimiter.check(identifier);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Rate limit exceeded. Maximum 50 requests per minute.",
        },
        {
          status: 429,
          headers: rateLimitHeaders(rateLimitResult),
        }
      );
    }
  }

  if (!isLoggedIn && !isPublicRoute) {
    const signInUrl = new URL("/auth/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (isLoggedIn && isPublicRoute) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
