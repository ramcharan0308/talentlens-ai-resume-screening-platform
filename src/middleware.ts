import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protected application route prefixes
  const isProtectedPath =
    pathname.startsWith("/requisitions") ||
    pathname.startsWith("/candidates") ||
    pathname.startsWith("/resumes") ||
    pathname.startsWith("/client") ||
    pathname.startsWith("/delivery") ||
    pathname.startsWith("/retention");

  if (isProtectedPath) {
    const sessionCookie = request.cookies.get("talentlens_session")?.value;

    if (!sessionCookie || !sessionCookie.trim()) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/requisitions/:path*",
    "/candidates/:path*",
    "/resumes/:path*",
    "/client/:path*",
    "/delivery/:path*",
    "/retention/:path*",
  ],
};

