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

function buildCsp(): string {
  const supabaseSrc = getSupabaseConnectSrc();
  const directives = [
    "default-src 'self'",
    // NOTE (2026-04-21): previously used nonce + strict-dynamic for maximum
    // CSP strictness, but that requires every page to be dynamically rendered
    // (Next.js static pages don't thread the nonce through inline bootstrap
    // scripts). The result was a fully blocked client bundle and a black
    // screen in production. Falling back to 'unsafe-inline' + 'unsafe-eval'
    // matches the shipping pre-sprint CSP. The rest of the directives
    // (connect-src, frame-src none, object-src none, base-uri self) remain
    // strict — the real XSS/clickjacking posture is largely preserved.
    // v1.1 TODO: migrate the root layout to read `headers()` to force dynamic
    // rendering and restore nonce-based script-src.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const response = NextResponse.next({ request });

  // Static CSP — see buildCsp comment for why nonce path was dropped.
  response.headers.set("Content-Security-Policy", buildCsp());

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
