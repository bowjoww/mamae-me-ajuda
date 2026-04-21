import { NextRequest, NextResponse } from "next/server";
import { gamificationRatelimit } from "@/lib/ratelimit";
import { enforceRateLimit, requireUser } from "@/lib/apiHelpers";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const rl = await enforceRateLimit(req, gamificationRatelimit);
  if (rl) return rl;

  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from("quests")
    .update({ status: "abandoned" })
    .eq("id", id)
    .eq("parent_id", user.id)
    .eq("status", "active")
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Quest não encontrada." }, { status: 404 });
  }
  return NextResponse.json({ data });
}
