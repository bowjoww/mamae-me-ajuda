/**
 * @jest-environment node
 *
 * Integration tests for POST /api/consent.
 */
import { NextRequest } from "next/server";

// Variables for controlling mock behavior per test
let dbError: { message: string } | null = null;
let authUser: { id: string } | null = null;

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn().mockImplementation(async () => ({
    auth: {
      getUser: jest.fn().mockImplementation(async () => ({
        data: { user: authUser },
      })),
    },
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockImplementation(async () => ({ error: dbError })),
    }),
  })),
}));

import { POST } from "@/app/api/consent/route";

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_PAYLOAD = {
  accepted: true as const,
  version: "2026-04-01",
  acceptedAt: "2026-04-01T12:00:00.000Z",
  parentalConsent: true as const,
};

beforeEach(() => {
  dbError = null;
  authUser = null;
});

describe("POST /api/consent", () => {
  it("returns 201 for a valid consent payload", async () => {
    const res = await POST(makeReq(VALID_PAYLOAD));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });

  it("returns 201 when an authenticated user is present", async () => {
    authUser = { id: "user-123" };
    const res = await POST(makeReq(VALID_PAYLOAD));
    expect(res.status).toBe(201);
  });

  it("returns 500 when DB insert fails", async () => {
    dbError = { message: "db error" };
    const res = await POST(makeReq(VALID_PAYLOAD));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toHaveProperty("error");
  });

  it("returns 400 when body is not valid JSON", async () => {
    const req = new NextRequest("http://localhost/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty("error");
  });

  it("returns 400 when accepted is missing", async () => {
    const res = await POST(
      makeReq({ version: "2026-04-01", acceptedAt: VALID_PAYLOAD.acceptedAt, parentalConsent: true })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when parentalConsent is false", async () => {
    const res = await POST(makeReq({ ...VALID_PAYLOAD, parentalConsent: false }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when version is an empty string", async () => {
    const res = await POST(makeReq({ ...VALID_PAYLOAD, version: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when acceptedAt is not a valid datetime", async () => {
    const res = await POST(makeReq({ ...VALID_PAYLOAD, acceptedAt: "not-a-date" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an empty body object", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });
});
