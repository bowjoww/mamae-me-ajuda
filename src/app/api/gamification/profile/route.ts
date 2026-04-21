import { NextRequest, NextResponse } from "next/server";
import { gamificationRatelimit } from "@/lib/ratelimit";
import { enforceRateLimit, requireUser } from "@/lib/apiHelpers";
import { z } from "zod";

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
    .select("id, name")
    .eq("id", childIdParam)
    .eq("parent_id", user.id)
    .single();
  if (!child) {
    return NextResponse.json({ error: "Criança não encontrada." }, { status: 404 });
  }

  const [profileQ, achievementsQ, inventoryQ] = await Promise.all([
    supabase.from("user_profile").select("*").eq("child_id", childIdParam).maybeSingle(),
    supabase
      .from("user_achievements")
      .select("achievement_code, unlocked_at")
      .eq("child_id", childIdParam)
      .order("unlocked_at", { ascending: false }),
    supabase
      .from("user_inventory")
      .select("power_up_code, qty")
      .eq("child_id", childIdParam),
  ]);

  return NextResponse.json({
    data: {
      profile: profileQ.data ?? null,
      achievements: achievementsQ.data ?? [],
      inventory: inventoryQ.data ?? [],
      child_name: child.name,
    },
  });
}
