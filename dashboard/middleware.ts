import { NextRequest, NextResponse } from "next/server";

const TOKEN_COOKIE_NAME = "mc_session";

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(request: NextRequest) {
  const accessToken = process.env.MC_ACCESS_TOKEN;

  // Convenience mode: no token configured, allow everything
  if (!accessToken) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(TOKEN_COOKIE_NAME)?.value;
  const expectedHash = await hashToken(accessToken);

  if (sessionCookie === expectedHash) {
    return NextResponse.next();
  }

  // No valid session — redirect to login
  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /login (login page itself)
     * - /api/auth (auth API route)
     * - /_next (Next.js internals)
     * - /favicon.ico
     */
    "/((?!login|api/auth|_next|favicon\\.ico).*)",
  ],
};
