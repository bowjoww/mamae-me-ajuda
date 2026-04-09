import { NextRequest, NextResponse } from "next/server";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware-client";

// Routes that require authentication
const PROTECTED_ROUTES = ["/api/children", "/api/conversations"];

// Auth routes — redirect to home if already logged in
const AUTH_ROUTES = ["/login", "/signup"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const response = NextResponse.next({ request });
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
