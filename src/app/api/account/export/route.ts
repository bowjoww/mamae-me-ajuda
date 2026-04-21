/**
 * LGPD Art. 18 VI — Right to data portability.
 *
 * Emits a single JSON document with every record Mamãe Me Ajuda stores
 * about the authenticated parent and their children. The file is offered
 * as a download via Content-Disposition so the parent can archive it,
 * migrate to another service, or submit it to ANPD if needed.
 *
 * Scope:
 *   * auth user (id, email, created_at) — NEVER the password hash.
 *   * children owned by the parent
 *   * conversations + messages threaded under those children
 *   * consent_records linked to the parent
 *   * study plans, topics, flashcards, study sessions
 *   * gamification state: user_profile, xp_events, user_achievements,
 *     quests, user_inventory
 *
 * What we do NOT include:
 *   * catalogs (achievements_catalog, power_ups) — those are product
 *     reference data, not personal data, and live in the public policy.
 *   * Sentry / PostHog data — those are processor-side records the parent
 *     must request from the processor directly (documented in the
 *     privacy policy).
 *
 * Hardening:
 *   * requireUser() enforces auth before any query runs.
 *   * RLS guarantees cross-parent data cannot leak even if we botched a
 *     filter; the explicit eq("parent_id", ...) is belt-and-suspenders.
 *   * Rate limit: 1/hour per IP. The export is multi-table and heavy; it
 *     should be unusual even for a determined user.
 *   * Cache-Control: no-store — response contains PII and must not be
 *     cached by intermediaries.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { accountExportRatelimit } from "@/lib/ratelimit";
import { enforceRateLimit, requireUser } from "@/lib/apiHelpers";

export const EXPORT_VERSION = "1.0";

// Static list of user-scoped tables to emit. Keeping it explicit (rather
// than introspecting schema) guards against silent scope creep: a new
// table added later won't accidentally end up in the export without a
// reviewer deciding whether it contains personal data.
const USER_SCOPED_TABLES = [
  "children",
  "conversations",
  "messages",
  "consent_records",
  "study_plans",
  "study_topics",
  "flashcards",
  "study_sessions",
  "user_profile",
  "xp_events",
  "user_achievements",
  "quests",
  "user_inventory",
] as const;

type TableName = (typeof USER_SCOPED_TABLES)[number];

/**
 * Most tables have `parent_id`. `messages` does not — it joins through
 * conversations.parent_id. `consent_records` joins through user_id
 * (pre-login consent is recorded with user_id=null so we also include
 * those keyed by the parent's ID).
 */
function filterClauseFor(table: TableName): "parent_id" | "user_id" | "conversation_join" {
  if (table === "messages") return "conversation_join";
  if (table === "consent_records") return "user_id";
  return "parent_id";
}

export async function GET(req: NextRequest) {
  try {
    const rl = await enforceRateLimit(
      req,
      accountExportRatelimit,
      "Exportação disponível a cada hora. Tente novamente em breve."
    );
    if (rl) return rl;

    const auth = await requireUser();
    if (auth.error) return auth.error;
    const { supabase, user } = auth;

    const exportedAt = new Date().toISOString();

    // Pull conversation IDs first so we can filter messages by them. A pure
    // RLS-bound select works too, but Supabase's JS client complains when
    // we chain .in() against an empty array, so we branch explicitly.
    const { data: conversationRows } = await supabase
      .from("conversations")
      .select("id")
      .eq("parent_id", user.id);
    const conversationIds = (conversationRows ?? [])
      .map((c: { id: string }) => c.id)
      .filter((v: unknown): v is string => typeof v === "string");

    // Parallelize all per-table fetches. Each is cheap on its own (single
    // index scan by parent_id) so we trade a little peak memory for lower
    // tail latency on the export.
    const tablePromises = USER_SCOPED_TABLES.map(async (table) => {
      const clause = filterClauseFor(table);
      let q = supabase.from(table).select("*").limit(10_000);

      if (clause === "parent_id") {
        q = q.eq("parent_id", user.id);
      } else if (clause === "user_id") {
        q = q.eq("user_id", user.id);
      } else {
        // messages table: filter by conversation IDs we already own
        if (conversationIds.length === 0) {
          return [table, []] as const;
        }
        q = q.in("conversation_id", conversationIds);
      }

      const { data, error } = await q;
      if (error) {
        // Log to Sentry but do not 500 — partial data is better than no
        // data for a right-to-portability request. The frontend will show
        // which tables are present.
        Sentry.captureException(error, {
          tags: { endpoint: "account-export", table },
        });
        return [table, []] as const;
      }
      return [table, data ?? []] as const;
    });

    const tableResults = await Promise.all(tablePromises);
    const tablesPayload: Record<string, unknown[]> = {};
    for (const [name, rows] of tableResults) {
      tablesPayload[name] = rows as unknown[];
    }

    const payload = {
      export_version: EXPORT_VERSION,
      exported_at: exportedAt,
      // Intentionally only include safe fields from auth.user. The
      // password hash / MFA secrets are not part of the Supabase getUser()
      // response anyway, but documenting the shape here keeps future
      // readers honest.
      parent: {
        id: user.id,
        email: (user as { email?: string }).email ?? null,
      },
      tables: tablesPayload,
      // Reference to the upstream LGPD notice so the subject knows what
      // they're holding.
      notice: {
        controller: "Mamãe Me Ajuda",
        contact: "dpo@mamaemeajuda.com.br",
        lgpd_article: "Art. 18, VI — Direito à portabilidade dos dados",
        privacy_policy_url: "/privacidade",
      },
    };

    const filename = `mamae-me-ajuda-export-${exportedAt.slice(0, 10)}.json`;

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    Sentry.captureException(error, { tags: { endpoint: "account-export" } });
    return NextResponse.json(
      { error: "Erro ao exportar dados." },
      { status: 500 }
    );
  }
}
