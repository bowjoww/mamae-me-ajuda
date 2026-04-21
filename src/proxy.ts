import { NextRequest, NextResponse } from "next/server";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware-client";

// Routes that require authentication. Keep this list in sync whenever a new
// API surface that spends credit, persists user data, or issues tokens lands.
// Missing routes here are a direct cost-abuse / data-leak vector.
const PROTECTED_ROUTES = [
  "/api/children",
  "/api/conversations",
  "/api/chat",
  "/api/tts",
  "/api/study",
  "/api/gamification",
];

// Auth routes — redirect to home if already logged in
const AUTH_ROUTES = ["/login", "/signup"];

/**
 * Derive the Supabase origin that the browser must be allowed to talk to.
 * Supabase JS v2 calls `${supabase_url}/auth/v1/...` and `/rest/v1/...`, so
 * omitting this origin from connect-src silently breaks login, RLS reads,
 * and realtime subscriptions in production.
 *
 * We prefer the exact URL when configured (tightest CSP) and fall back to
 * the `*.supabase.co` wildcard so the app degrades gracefully if the env
 * var is missing at build time.
 */
function getSupabaseConnectSrc(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "https://*.supabase.co wss://*.supabase.co";
  try {
    const origin = new URL(url).origin; // e.g. https://abc.supabase.co
    const wsOrigin = origin.replace(/^https:/, "wss:"); // realtime socket
    return `${origin} ${wsOrigin}`;
  } catch {
    return "https://*.supabase.co wss://*.supabase.co";
  }
}

function buildCsp(nonce: string): string {
  const supabaseSrc = getSupabaseConnectSrc();
  const directives = [
    "default-src 'self'",
    // nonce allows Next.js inline hydration scripts; strict-dynamic trusts
    // scripts loaded by nonced scripts without needing unsafe-inline/unsafe-eval
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'self'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    // Allow connections to AI APIs, Supabase (auth + REST + realtime), Sentry,
    // and PostHog. Supabase omission was a CRITICAL prod bug — login fails
    // silently behind strict CSP.
    `connect-src 'self' ${supabaseSrc} https://generativelanguage.googleapis.com https://api.openai.com https://*.ingest.sentry.io https://app.posthog.com https://eu.posthog.com`,
    "font-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  return directives.join("; ");
}

export async function proxy(request: NextRequest) {
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
