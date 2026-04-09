type ModerationScope = "input" | "output";
type ModerationEngine = "keyword" | "openai";

const OPENAI_MODERATION_URL = "https://api.openai.com/v1/moderations";
const OPENAI_MODERATION_MODEL = "omni-moderation-latest";
const OPENAI_MODERATION_TIMEOUT_MS = 450;

const BLOCKED_KEYWORDS = [
  "pornografia",
  "porno",
  "nude",
  "nudes",
  "pedofilia",
  "estupro",
  "estuprar",
  "buceta",
  "piroca",
  "caralho",
  "foder",
  "foda se",
  "suicidio",
  "me matar",
  "matar alguem",
  "autolesao",
] as const;

export interface ModerationResult {
  blocked: boolean;
  scope: ModerationScope;
  engine?: ModerationEngine;
  categories?: string[];
}

interface ModerateTextOptions {
  text: string;
  scope: ModerationScope;
}

interface ModerationLogOptions {
  scope: ModerationScope;
  engine: ModerationEngine;
  categories?: string[];
  textLength: number;
  hasImage: boolean;
  requestId?: string | null;
}

interface OpenAIModerationResponse {
  results?: Array<{
    flagged?: boolean;
    categories?: Record<string, boolean>;
  }>;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesBlockedKeyword(text: string): boolean {
  const normalizedText = normalizeText(text);
  if (!normalizedText) return false;

  return BLOCKED_KEYWORDS.some((keyword) => {
    const pattern = new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i");
    return pattern.test(normalizedText);
  });
}

async function moderateWithOpenAI(text: string, scope: ModerationScope): Promise<ModerationResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_MODERATION_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_MODERATION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODERATION_MODEL,
        input: text,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn("[moderation_openai_failed]", {
        scope,
        status: response.status,
      });
      return null;
    }

    const data = (await response.json()) as OpenAIModerationResponse;
    const firstResult = data.results?.[0];
    const blocked = Boolean(firstResult?.flagged);
    const categories = Object.entries(firstResult?.categories ?? {})
      .filter(([, value]) => value)
      .map(([key]) => key);

    return {
      blocked,
      scope,
      engine: "openai",
      categories,
    };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError" ? "timeout" : "request_error";
    console.warn("[moderation_openai_failed]", { scope, reason });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function moderateText({ text, scope }: ModerateTextOptions): Promise<ModerationResult> {
  if (!text?.trim()) {
    return { blocked: false, scope };
  }

  if (matchesBlockedKeyword(text)) {
    return {
      blocked: true,
      scope,
      engine: "keyword",
      categories: ["keyword_match"],
    };
  }

  const openAIResult = await moderateWithOpenAI(text, scope);
  if (!openAIResult) {
    return { blocked: false, scope };
  }

  return openAIResult;
}

export function logBlockedModerationEvent({
  scope,
  engine,
  categories,
  textLength,
  hasImage,
  requestId,
}: ModerationLogOptions): void {
  console.warn("[moderation_blocked]", {
    scope,
    engine,
    categories: categories ?? [],
    textLength,
    hasImage,
    requestId: requestId ?? null,
    at: new Date().toISOString(),
  });
}

