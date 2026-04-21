import { NextRequest, NextResponse } from "next/server";
import { gamificationRatelimit } from "@/lib/ratelimit";
import { powerUpUseSchema } from "@/lib/schemas/study";
import {
  enforceRateLimit,
  parseStrictJson,
  requireUser,
} from "@/lib/apiHelpers";

type Params = { params: Promise<{ code: string }> };

interface ConsumeRow {
  inventory_id: string;
  remaining_qty: number;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { code } = await params;
  const rl = await enforceRateLimit(req, gamificationRatelimit);
  if (rl) return rl;

  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const parsed = await parseStrictJson(req, powerUpUseSchema);
  if (!parsed.ok) return parsed.res;

  // Ownership gate — early 404 is more useful than leaking RLS errors to the
  // client. consume_power_up also enforces this at the DB level; this check
  // gives a cleaner error surface.
  const { data: child } = await supabase
    .from("children")
    .select("id")
    .eq("id", parsed.data.child_id)
    .eq("parent_id", user.id)
    .single();
  if (!child) {
    return NextResponse.json({ error: "Criança não encontrada." }, { status: 404 });
  }

  // Atomic consumption via RPC — see migration 005_power_up_atomic.sql.
  // A single UPDATE ... WHERE qty > 0 RETURNING eliminates the race window
  // where two concurrent requests (double-tap, retry, offline flush) could
  // both succeed and decrement twice for one available item.
  const { data, error } = await supabase.rpc("consume_power_up", {
    p_child_id: parsed.data.child_id,
    p_code: code,
  });

  if (error) {
    return NextResponse.json({ error: "Erro ao consumir power-up." }, { status: 500 });
  }

  // RPC returns an empty set when qty was already 0. Treat that as 404 so
  // the client can surface a clear "sem estoque" message.
  const rows = (data as ConsumeRow[] | null) ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "Power-up indisponível." }, { status: 404 });
  }

  const [row] = rows;
  return NextResponse.json({
    data: {
      consumed: code,
      remaining: row.remaining_qty,
      target_card_id: parsed.data.target_card_id ?? null,
    },
  });
}
