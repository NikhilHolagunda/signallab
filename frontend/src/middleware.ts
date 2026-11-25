import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap edge gate: no refresh cookie => definitely not signed in, so skip rendering
 * /app and go straight to /login. (A present cookie may still be expired; the
 * client-side RequireAuth handles that case.)
 */
export function middleware(req: NextRequest) {
  if (!req.cookies.has("sl_refresh")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
