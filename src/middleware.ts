import { NextRequest, NextResponse } from "next/server";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware-client";

// Routes that require authentication
const PROTECTED_ROUTES = ["/api/children", "/api/conversations"];

// Auth routes — redirect to home if already logged in
const AUTH_ROUTES = ["/login", "/signup"];

function buildCsp(nonce: string): string {
  const directives = [
    "default-src 'self'",
    // nonce allows Next.js inline hydration scripts; strict-dynamic trusts
    // scripts loaded by nonced scripts without needing unsafe-inline/unsafe-eval
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'self'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    // Allow connections to AI APIs, Sentry, and PostHog
    "connect-src 'self' https://generativelanguage.googleapis.com https://api.openai.com https://*.ingest.sentry.io https://app.posthog.com https://eu.posthog.com",
    "font-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  return directives.join("; ");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Generate a cryptographically random nonce for this request
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // Forward nonce to server components via request header
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Set per-request CSP with nonce — no unsafe-eval, no unsafe-inline for scripts
  response.headers.set("Content-Security-Policy", buildCsp(nonce));

  const supabase = createSupabaseMiddlewareClient(request, response);

  // Refresh session cookie on every request (keeps it alive)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtectedApiRoute = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  if (isProtectedApiRoute && !user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Match all request paths except static files and images
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.json).*)",
  ],
};
