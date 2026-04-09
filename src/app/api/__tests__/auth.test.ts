/**
 * @jest-environment node
 *
 * Integration tests for auth routes (login, logout, session, signup).
 * All Supabase calls are mocked.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";

type AuthError = { message: string } | null;

function makeAuthMock({
  signInError = null as AuthError,
  signUpError = null as AuthError,
  signOutError = null as AuthError,
  user = null as { id: string; email: string } | null,
  getUserError = null as AuthError,
} = {}) {
  return {
    auth: {
      signInWithPassword: jest.fn().mockResolvedValue({
        data: { user, session: user ? { user } : null },
        error: signInError,
      }),
      signUp: jest.fn().mockResolvedValue({
        data: { user, session: null },
        error: signUpError,
      }),
      signOut: jest.fn().mockResolvedValue({ error: signOutError }),
      getUser: jest.fn().mockResolvedValue({
        data: { user },
        error: getUserError,
      }),
    },
  };
}

function makeReq(url: string, method = "POST", body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

describe("POST /api/auth/login", () => {
  it("returns 400 for missing email", async () => {
    const { POST } = await import("../auth/login/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(makeAuthMock());
    const res = await POST(makeReq("/api/auth/login", "POST", { password: "secret" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid email format", async () => {
    const { POST } = await import("../auth/login/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(makeAuthMock());
    const res = await POST(makeReq("/api/auth/login", "POST", { email: "notanemail", password: "secret" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing password", async () => {
    const { POST } = await import("../auth/login/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(makeAuthMock());
    const res = await POST(makeReq("/api/auth/login", "POST", { email: "a@b.com" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when Supabase sign-in fails", async () => {
    const { POST } = await import("../auth/login/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeAuthMock({ signInError: { message: "Invalid credentials" } })
    );
    const res = await POST(makeReq("/api/auth/login", "POST", { email: "a@b.com", password: "wrong" }));
    expect(res.status).toBe(401);
  });

  it("returns 200 with user data on successful login", async () => {
    const { POST } = await import("../auth/login/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeAuthMock({ user: { id: "u1", email: "a@b.com" } })
    );
    const res = await POST(makeReq("/api/auth/login", "POST", { email: "a@b.com", password: "correct" }));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/signup
// ---------------------------------------------------------------------------

describe("POST /api/auth/signup", () => {
  it("returns 400 for invalid email", async () => {
    const { POST } = await import("../auth/signup/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(makeAuthMock());
    const res = await POST(makeReq("/api/auth/signup", "POST", { email: "bad", password: "Secure123!" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for password shorter than 8 chars", async () => {
    const { POST } = await import("../auth/signup/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(makeAuthMock());
    const res = await POST(makeReq("/api/auth/signup", "POST", { email: "a@b.com", password: "short" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when Supabase signup returns an error", async () => {
    const { POST } = await import("../auth/signup/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeAuthMock({ signUpError: { message: "Email already registered" } })
    );
    const res = await POST(makeReq("/api/auth/signup", "POST", { email: "a@b.com", password: "Secure123!" }));
    expect(res.status).toBe(400);
  });

  it("returns 201 on successful signup", async () => {
    const { POST } = await import("../auth/signup/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeAuthMock({ user: { id: "u1", email: "new@example.com" } })
    );
    const res = await POST(makeReq("/api/auth/signup", "POST", { email: "new@example.com", password: "Secure123!" }));
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

describe("POST /api/auth/logout", () => {
  it("returns 200 on successful logout", async () => {
    const { POST } = await import("../auth/logout/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(makeAuthMock());
    const res = await POST();
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/session
// ---------------------------------------------------------------------------

describe("GET /api/auth/session", () => {
  it("returns 401 when there is no active session", async () => {
    const { GET } = await import("../auth/session/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeAuthMock({ user: null })
    );
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 200 with session data when authenticated", async () => {
    const { GET } = await import("../auth/session/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeAuthMock({ user: { id: "u1", email: "u1@test.com" } })
    );
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
