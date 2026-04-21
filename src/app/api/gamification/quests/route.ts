import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { gamificationRatelimit } from "@/lib/ratelimit";
import { enforceRateLimit, requireUser } from "@/lib/apiHelpers";
import { generateDailyQuestDefinitions } from "@/lib/services/gamificationService";

export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, gamificationRatelimit);
  if (rl) return rl;

  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const { searchParams } = new URL(req.url);
  const childIdParam = searchParams.get("child_id");
  if (!childIdParam || !z.string().uuid().safeParse(childIdParam).success) {
    return NextResponse.json({ error: "child_id inválido." }, { status: 400 });
  }

  // Ownership gate.
  const { data: child } = await supabase
    .from("children")
    .select("id")
    .eq("id", childIdParam)
    .eq("parent_id", user.id)
    .single();
  if (!child) {
    return NextResponse.json({ error: "Criança não encontrada." }, { status: 404 });
  }

  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setUTCHours(23, 59, 59, 999);

  // Do we already have daily quests generated for today?
  const { data: existing } = await supabase
    .from("quests")
    .select("*")
    .eq("child_id", childIdParam)
    .eq("quest_type", "daily")
    .gte("created_at", startOfDay.toISOString())
    .lte("created_at", endOfDay.toISOString());

  if (!existing || existing.length === 0) {
    const defs = generateDailyQuestDefinitions(childIdParam, today);
    const rows = defs.map((d) => ({
      parent_id: user.id,
      child_id: childIdParam,
      quest_type: "daily" as const,
      title: d.title,
      description: d.description,
      objectives: d.objectives,
      xp_reward: d.xp_reward,
      expires_at: endOfDay.toISOString(),
    }));
    await supabase.from("quests").insert(rows);
  }

  const { data: active } = await supabase
    .from("quests")
    .select("*")
    .eq("child_id", childIdParam)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  return NextResponse.json({ data: active ?? [] });
}
