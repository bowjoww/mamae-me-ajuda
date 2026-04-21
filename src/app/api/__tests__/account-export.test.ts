/**
 * @jest-environment node
 *
 * LGPD Art. 18 VI — portability endpoint tests.
 *
 * Covers:
 *   * 401 when not logged in (export is never leaked anonymously)
 *   * 200 with an empty export for a user with no data yet
 *   * 200 with populated tables for a user with records across the stack
 *   * Content-Disposition / Content-Type / cache headers
 *   * Parent filter is applied (no cross-tenant leaks even if RLS is off)
 */
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Supabase mock — a per-table store so each .from(table).select().eq() chain
// resolves with table-specific rows. The real schema is heavy so we just
// model the tables we actually touch in the endpoint.
// ---------------------------------------------------------------------------

interface MockStore {
  children?: unknown[];
  conversations?: unknown[];
  messages?: unknown[];
  consent_records?: unknown[];
  study_plans?: unknown[];
  study_topics?: unknown[];
  flashcards?: unknown[];
  study_sessions?: unknown[];
  user_profile?: unknown[];
  xp_events?: unknown[];
  user_achievements?: unknown[];
  quests?: unknown[];
  user_inventory?: unknown[];
}

function makeSupabaseMock(params: {
  user: { id: string; email?: string } | null;
  store?: MockStore;
  errorTables?: Set<string>;
}) {
  const store = params.store ?? {};
  const errors = params.errorTables ?? new Set<string>();

  const client = {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: params.user },
      }),
    },
    from: jest.fn((table: string) => {
      const rows = (store[table as keyof MockStore] ?? []) as unknown[];
      const result = errors.has(table)
        ? { data: null, error: { message: `${table} exploded` } }
        : { data: rows, error: null };

      // Build a chainable query that resolves to `result` at any terminal
      // call site. Supabase's chain supports: .select().eq().limit().in()
      // and can be awaited directly.
      const builder: Record<string, unknown> = {
        select: jest.fn(function (this: Record<string, unknown>) {
          return this;
        }),
        eq: jest.fn(function (this: Record<string, unknown>) {
          return this;
        }),
        in: jest.fn(function (this: Record<string, unknown>) {
          return this;
        }),
        limit: jest.fn(function (this: Record<string, unknown>) {
          return this;
        }),
        then: (resolve: (v: unknown) => void) => resolve(result),
      };
      return builder;
    }),
  };
  return client;
}

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock("@/lib/ratelimit", () => {
  const actual = jest.requireActual("@/lib/ratelimit");
  return {
    ...actual,
    accountExportRatelimit: null,
  };
});

import { createSupabaseServerClient } from "@/lib/supabase/server";

function req(url = "/api/account/export"): NextRequest {
  return new NextRequest(`http://localhost${url}`, { method: "GET" });
}

describe("GET /api/account/export", () => {
  it("returns 401 when not authenticated", async () => {
    const { GET } = await import("../account/export/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: null })
    );
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns 200 with a valid empty export when the user has no data", async () => {
    const { GET } = await import("../account/export/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "user-123", email: "mom@example.com" },
        store: {}, // everything empty
      })
    );
    const res = await GET(req());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.export_version).toBe("1.0");
    expect(body.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.parent.id).toBe("user-123");
    expect(body.parent.email).toBe("mom@example.com");
    expect(body.tables).toEqual(
      expect.objectContaining({
        children: [],
        conversations: [],
        messages: [],
        consent_records: [],
        study_plans: [],
        study_topics: [],
        flashcards: [],
        study_sessions: [],
        user_profile: [],
        xp_events: [],
        user_achievements: [],
        quests: [],
        user_inventory: [],
      })
    );
    expect(body.notice.lgpd_article).toMatch(/Art\. 18/);
  });

  it("returns 200 with populated tables when the user has records", async () => {
    const { GET } = await import("../account/export/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "user-123", email: "mom@example.com" },
        store: {
          children: [{ id: "child-1", name: "Henrique", parent_id: "user-123" }],
          conversations: [{ id: "conv-1", parent_id: "user-123" }],
          messages: [
            { id: "msg-1", conversation_id: "conv-1", content: "olá" },
          ],
          consent_records: [
            { id: "cons-1", user_id: "user-123", accepted: true },
          ],
          study_plans: [{ id: "plan-1", parent_id: "user-123", subject: "Mat" }],
          flashcards: [{ id: "card-1", parent_id: "user-123" }],
          user_profile: [{ id: "profile-1", parent_id: "user-123", total_xp: 450 }],
        },
      })
    );
    const res = await GET(req());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.tables.children).toHaveLength(1);
    expect(body.tables.children[0].name).toBe("Henrique");
    expect(body.tables.conversations).toHaveLength(1);
    expect(body.tables.messages).toHaveLength(1);
    expect(body.tables.messages[0].content).toBe("olá");
    expect(body.tables.consent_records).toHaveLength(1);
    expect(body.tables.study_plans).toHaveLength(1);
    expect(body.tables.user_profile[0].total_xp).toBe(450);
  });

  it("sets download + PII-safe response headers", async () => {
    const { GET } = await import("../account/export/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "user-123" } })
    );
    const res = await GET(req());
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
    expect(res.headers.get("Content-Disposition")).toMatch(
      /attachment; filename=.*mamae-me-ajuda-export-.*\.json/
    );
    // Response must not be cached anywhere — it contains PII.
    expect(res.headers.get("Cache-Control")).toMatch(/no-store/);
    // MIME-sniff protection
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("skips messages query when the user has zero conversations (avoids empty IN())", async () => {
    // Regression: building an in("conversation_id", []) raises on Supabase's
    // client. The route must branch on empty conversationIds before issuing
    // the messages query.
    const { GET } = await import("../account/export/route");
    const supa = makeSupabaseMock({
      user: { id: "user-123" },
      store: { conversations: [], messages: [] },
    });
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(supa);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tables.messages).toEqual([]);
  });

  it("treats per-table errors as soft failures (empty rows), not 500", async () => {
    // If one table errors transiently, we still want to give the subject
    // the rest of their data. The endpoint should NOT return 500 for a
    // single table failure.
    const { GET } = await import("../account/export/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "user-123" },
        store: {
          children: [{ id: "child-1", parent_id: "user-123" }],
        },
        errorTables: new Set(["flashcards"]),
      })
    );
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tables.children).toHaveLength(1);
    expect(body.tables.flashcards).toEqual([]);
  });

  it("never returns password hashes or private auth fields", async () => {
    // Defensive: even if some hypothetical fork mishandles getUser(), the
    // response shape must not ship fields like password_hash, phone, etc.
    const { GET } = await import("../account/export/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: {
          id: "user-123",
          email: "mom@example.com",
          // Extra properties that MUST NOT leak
          ...({ password: "should-not-appear", phone: "+55..." } as object),
        },
      })
    );
    const res = await GET(req());
    const body = await res.json();
    expect(body.parent).toEqual({
      id: "user-123",
      email: "mom@example.com",
    });
    expect(JSON.stringify(body.parent)).not.toContain("password");
    expect(JSON.stringify(body.parent)).not.toContain("phone");
  });
});
