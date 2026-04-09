/**
 * @jest-environment node
 *
 * Integration tests for Supabase-backed CRUD routes.
 * We mock createSupabaseServerClient so no real database is needed.
 */
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Supabase mock factory
// ---------------------------------------------------------------------------

type SupabaseResult = { data: unknown; error: unknown };

function makeSupabaseMock({
  user = null as { id: string } | null,
  queryResult = { data: [], error: null } as SupabaseResult,
  insertResult = { data: null, error: null } as SupabaseResult,
} = {}) {
  // Build a chainable query builder
  const queryBuilder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(queryResult),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    // Terminal resolution for non-single queries
    then: (resolve: (v: SupabaseResult) => void) => resolve(queryResult),
  };

  const insertBuilder = {
    ...queryBuilder,
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(insertResult),
  };

  const client = {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user } }),
    },
    from: jest.fn((table: string) => {
      // Return insert builder only when the mock caller expects insert
      void table;
      return { ...queryBuilder, insert: jest.fn(() => insertBuilder) };
    }),
  };

  return client;
}

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";

function makeReq(url: string, method = "GET", body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// /api/children
// ---------------------------------------------------------------------------

describe("GET /api/children", () => {
  it("returns 401 when user is not authenticated", async () => {
    const { GET } = await import("../children/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: null })
    );
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 200 with data when authenticated", async () => {
    const { GET } = await import("../children/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "user-1" }, queryResult: { data: [], error: null } })
    );
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("data");
  });

  it("returns 500 when database query fails", async () => {
    const { GET } = await import("../children/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "user-1" }, queryResult: { data: null, error: { message: "db error" } } })
    );
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/children", () => {
  it("returns 401 when not authenticated", async () => {
    const { POST } = await import("../children/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: null })
    );
    const res = await POST(makeReq("/api/children", "POST", { name: "Ana", grade: "3" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid payload", async () => {
    const { POST } = await import("../children/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "user-1" } })
    );
    const res = await POST(makeReq("/api/children", "POST", { grade: "3" }));
    expect(res.status).toBe(400);
  });

  it("returns 201 on successful creation", async () => {
    const { POST } = await import("../children/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "user-1" },
        insertResult: { data: { id: "child-1", name: "Ana", grade: "3" }, error: null },
      })
    );
    const res = await POST(makeReq("/api/children", "POST", { name: "Ana", grade: "3" }));
    expect(res.status).toBe(201);
  });

  it("returns 500 when insert fails", async () => {
    const { POST } = await import("../children/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "user-1" },
        insertResult: { data: null, error: { message: "db error" } },
      })
    );
    const res = await POST(makeReq("/api/children", "POST", { name: "Ana", grade: "3" }));
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// /api/conversations
// ---------------------------------------------------------------------------

describe("GET /api/conversations", () => {
  it("returns 401 when not authenticated", async () => {
    const { GET } = await import("../conversations/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: null })
    );
    const res = await GET(makeReq("/api/conversations"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with data when authenticated", async () => {
    const { GET } = await import("../conversations/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "user-1" }, queryResult: { data: [], error: null } })
    );
    const res = await GET(makeReq("/api/conversations"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("data");
  });

  it("returns 200 filtering by child_id", async () => {
    const { GET } = await import("../conversations/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "user-1" }, queryResult: { data: [], error: null } })
    );
    const res = await GET(makeReq("/api/conversations?child_id=child-1"));
    expect(res.status).toBe(200);
  });

  it("returns 500 when database query fails", async () => {
    const { GET } = await import("../conversations/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "user-1" }, queryResult: { data: null, error: { message: "db error" } } })
    );
    const res = await GET(makeReq("/api/conversations"));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/conversations", () => {
  it("returns 401 when not authenticated", async () => {
    const { POST } = await import("../conversations/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: null })
    );
    const res = await POST(makeReq("/api/conversations", "POST", {
      child_id: "550e8400-e29b-41d4-a716-446655440000",
    }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid payload (missing child_id)", async () => {
    const { POST } = await import("../conversations/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "user-1" } })
    );
    const res = await POST(makeReq("/api/conversations", "POST", { title: "Nova conversa" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid UUID child_id", async () => {
    const { POST } = await import("../conversations/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "user-1" } })
    );
    const res = await POST(
      makeReq("/api/conversations", "POST", { child_id: "not-a-uuid" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when child does not belong to user", async () => {
    const { POST } = await import("../conversations/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "user-1" },
        queryResult: { data: null, error: null },
      })
    );
    const res = await POST(makeReq("/api/conversations", "POST", {
      child_id: "550e8400-e29b-41d4-a716-446655440000",
    }));
    expect(res.status).toBe(404);
  });

  it("returns 201 on successful creation", async () => {
    const { POST } = await import("../conversations/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "user-1" },
        queryResult: { data: { id: "child-1" }, error: null },
        insertResult: { data: { id: "conv-1", title: "Nova conversa" }, error: null },
      })
    );
    const res = await POST(makeReq("/api/conversations", "POST", {
      child_id: "550e8400-e29b-41d4-a716-446655440000",
    }));
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// /api/children/[id]
// ---------------------------------------------------------------------------

describe("GET /api/children/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    const { GET } = await import("../children/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: null })
    );
    const res = await GET(makeReq("/api/children/abc"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 with child data when found", async () => {
    const { GET } = await import("../children/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "user-1" },
        queryResult: { data: { id: "abc", name: "Ana" }, error: null },
      })
    );
    const res = await GET(makeReq("/api/children/abc"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 404 when child not found", async () => {
    const { GET } = await import("../children/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "user-1" },
        queryResult: { data: null, error: { message: "not found" } },
      })
    );
    const res = await GET(makeReq("/api/children/abc"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/children/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    const { PATCH } = await import("../children/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: null })
    );
    const res = await PATCH(makeReq("/api/children/abc", "PATCH", { name: "Ana" }), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid payload", async () => {
    const { PATCH } = await import("../children/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "user-1" } })
    );
    const res = await PATCH(makeReq("/api/children/abc", "PATCH", { name: "" }), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 200 on successful update", async () => {
    const { PATCH } = await import("../children/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "user-1" },
        queryResult: { data: { id: "abc", name: "Ana Updated" }, error: null },
      })
    );
    const res = await PATCH(makeReq("/api/children/abc", "PATCH", { name: "Ana Updated" }), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/children/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    const { DELETE } = await import("../children/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: null })
    );
    const res = await DELETE(makeReq("/api/children/abc", "DELETE"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 on successful delete", async () => {
    const { DELETE } = await import("../children/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "user-1" },
        queryResult: { data: null, error: null },
      })
    );
    const res = await DELETE(makeReq("/api/children/abc", "DELETE"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// /api/conversations/[id]
// ---------------------------------------------------------------------------

describe("GET /api/conversations/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    const { GET } = await import("../conversations/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: null })
    );
    const res = await GET(makeReq("/api/conversations/abc"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 with conversation data when found", async () => {
    const { GET } = await import("../conversations/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "user-1" },
        queryResult: { data: { id: "conv-1", title: "Test" }, error: null },
      })
    );
    const res = await GET(makeReq("/api/conversations/conv-1"), {
      params: Promise.resolve({ id: "conv-1" }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 404 when conversation not found", async () => {
    const { GET } = await import("../conversations/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "user-1" },
        queryResult: { data: null, error: { message: "not found" } },
      })
    );
    const res = await GET(makeReq("/api/conversations/abc"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/conversations/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    const { PATCH } = await import("../conversations/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: null })
    );
    const res = await PATCH(makeReq("/api/conversations/abc", "PATCH", { title: "New title" }), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing title", async () => {
    const { PATCH } = await import("../conversations/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "user-1" } })
    );
    const res = await PATCH(makeReq("/api/conversations/abc", "PATCH", {}), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 200 on successful update", async () => {
    const { PATCH } = await import("../conversations/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "user-1" },
        queryResult: { data: { id: "conv-1", title: "Updated" }, error: null },
      })
    );
    const res = await PATCH(makeReq("/api/conversations/conv-1", "PATCH", { title: "Updated" }), {
      params: Promise.resolve({ id: "conv-1" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/conversations/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    const { DELETE } = await import("../conversations/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: null })
    );
    const res = await DELETE(makeReq("/api/conversations/abc", "DELETE"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 on successful delete", async () => {
    const { DELETE } = await import("../conversations/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "user-1" },
        queryResult: { data: null, error: null },
      })
    );
    const res = await DELETE(makeReq("/api/conversations/conv-1", "DELETE"), {
      params: Promise.resolve({ id: "conv-1" }),
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// /api/conversations/[id]/messages
// ---------------------------------------------------------------------------

describe("GET /api/conversations/[id]/messages", () => {
  it("returns 401 when not authenticated", async () => {
    const { GET } = await import("../conversations/[id]/messages/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: null })
    );
    const res = await GET(makeReq("/api/conversations/abc/messages"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 with messages when conversation exists", async () => {
    const { GET } = await import("../conversations/[id]/messages/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "user-1" },
        queryResult: { data: { id: "conv-1" }, error: null },
      })
    );
    const res = await GET(makeReq("/api/conversations/conv-1/messages"), {
      params: Promise.resolve({ id: "conv-1" }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 404 when conversation not found", async () => {
    const { GET } = await import("../conversations/[id]/messages/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "user-1" },
        queryResult: { data: null, error: null },
      })
    );
    const res = await GET(makeReq("/api/conversations/abc/messages"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(404);
  });
});
