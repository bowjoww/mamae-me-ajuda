/**
 * @jest-environment node
 *
 * Schema-level tests for the study-mode request shapes.
 *
 * The most load-bearing piece here is the Supabase Storage URL validator —
 * without it, an authenticated attacker can ship any URL into the vision
 * model's prompt, enabling prompt exfiltration and SSRF-style probes.
 */

import {
  parsedIntentSchema,
  createStudyPlanSchema,
  isSupabaseStorageUrl,
  stripStorageUrlQuery,
} from "../study";

const VALID_CHILD_ID = "550e8400-e29b-41d4-a716-446655440000";

// The jest.setup.ts file pins NEXT_PUBLIC_SUPABASE_URL to
// https://test-project.supabase.co so isSupabaseStorageUrl has a known host.
const SUPABASE_HOST = "test-project.supabase.co";

describe("isSupabaseStorageUrl", () => {
  describe("accepts", () => {
    it("public storage URL", () => {
      expect(
        isSupabaseStorageUrl(
          `https://${SUPABASE_HOST}/storage/v1/object/public/exam-samples/foo.png`
        )
      ).toBe(true);
    });

    it("signed storage URL (with token query)", () => {
      expect(
        isSupabaseStorageUrl(
          `https://${SUPABASE_HOST}/storage/v1/object/sign/exam-samples/foo.png?token=jwt`
        )
      ).toBe(true);
    });

    it("authenticated storage URL", () => {
      expect(
        isSupabaseStorageUrl(
          `https://${SUPABASE_HOST}/storage/v1/object/authenticated/bucket/a.jpg`
        )
      ).toBe(true);
    });
  });

  describe("rejects", () => {
    it("URL on a different host", () => {
      expect(
        isSupabaseStorageUrl("https://evil.com/storage/v1/object/public/a.png")
      ).toBe(false);
    });

    it("URL with matching path but different host (evil.com)", () => {
      expect(
        isSupabaseStorageUrl(
          "https://evil.com/storage/v1/object/public/exam-samples/foo.png"
        )
      ).toBe(false);
    });

    it("HTTP (non-TLS) Supabase host — prevent plaintext leaks", () => {
      expect(
        isSupabaseStorageUrl(
          `http://${SUPABASE_HOST}/storage/v1/object/public/foo.png`
        )
      ).toBe(false);
    });

    it("non-storage path on the right host", () => {
      expect(
        isSupabaseStorageUrl(`https://${SUPABASE_HOST}/rest/v1/children`)
      ).toBe(false);
    });

    it("empty string", () => {
      expect(isSupabaseStorageUrl("")).toBe(false);
    });

    it("garbage string", () => {
      expect(isSupabaseStorageUrl("not a url at all")).toBe(false);
    });

    it("javascript: scheme", () => {
      expect(isSupabaseStorageUrl("javascript:alert(1)")).toBe(false);
    });

    it("data: scheme", () => {
      expect(isSupabaseStorageUrl("data:image/png;base64,iVBORw0KG")).toBe(false);
    });

    it("file: scheme", () => {
      expect(isSupabaseStorageUrl("file:///etc/passwd")).toBe(false);
    });

    it("subdomain of the right host (defense against typo squat)", () => {
      expect(
        isSupabaseStorageUrl(
          `https://foo.${SUPABASE_HOST}/storage/v1/object/public/a.png`
        )
      ).toBe(false);
    });

    it("localhost / RFC1918 SSRF targets", () => {
      expect(isSupabaseStorageUrl("http://127.0.0.1/storage/v1/object/public/a")).toBe(false);
      expect(isSupabaseStorageUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
      expect(isSupabaseStorageUrl("http://10.0.0.1/internal")).toBe(false);
    });
  });
});

describe("stripStorageUrlQuery", () => {
  it("strips the token query param from a signed URL", () => {
    const out = stripStorageUrlQuery(
      `https://${SUPABASE_HOST}/storage/v1/object/sign/bucket/a.png?token=JWT.TOKEN.HERE`
    );
    expect(out).toBe(
      `https://${SUPABASE_HOST}/storage/v1/object/sign/bucket/a.png`
    );
  });

  it("strips fragments", () => {
    const out = stripStorageUrlQuery(
      `https://${SUPABASE_HOST}/storage/v1/object/public/a.png#frag`
    );
    expect(out).toBe(`https://${SUPABASE_HOST}/storage/v1/object/public/a.png`);
  });

  it("preserves clean URLs untouched", () => {
    const clean = `https://${SUPABASE_HOST}/storage/v1/object/public/a.png`;
    expect(stripStorageUrlQuery(clean)).toBe(clean);
  });

  it("returns input on parse failure (null-safe fallback)", () => {
    expect(stripStorageUrlQuery("not a url")).toBe("not a url");
  });
});

describe("parsedIntentSchema.exam_sample_photo_url", () => {
  const baseIntent = {
    subject: "Matemática",
    topic: "Funções",
    subtopics: [],
  };

  it("accepts intent without a photo URL (field is optional)", () => {
    const r = parsedIntentSchema.safeParse(baseIntent);
    expect(r.success).toBe(true);
  });

  it("accepts a valid Supabase Storage URL", () => {
    const r = parsedIntentSchema.safeParse({
      ...baseIntent,
      exam_sample_photo_url: `https://${SUPABASE_HOST}/storage/v1/object/public/exams/foo.png`,
    });
    expect(r.success).toBe(true);
  });

  it("rejects an external attacker-controlled URL (exfil vector)", () => {
    const r = parsedIntentSchema.safeParse({
      ...baseIntent,
      exam_sample_photo_url: "https://evil.com/leak.png",
    });
    expect(r.success).toBe(false);
    // Message must include our marker so frontend can surface it cleanly.
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join(" ");
      expect(msg).toMatch(/Supabase Storage/i);
    }
  });

  it("rejects HTTP (plaintext) URLs even on the right host", () => {
    const r = parsedIntentSchema.safeParse({
      ...baseIntent,
      exam_sample_photo_url: `http://${SUPABASE_HOST}/storage/v1/object/public/x.png`,
    });
    expect(r.success).toBe(false);
  });

  it("rejects data: URIs (prevents embedded-payload smuggling)", () => {
    const r = parsedIntentSchema.safeParse({
      ...baseIntent,
      exam_sample_photo_url: "data:image/png;base64,AAAA",
    });
    expect(r.success).toBe(false);
  });
});

describe("createStudyPlanSchema", () => {
  it("threads the storage-URL validation through the wrapping schema", () => {
    const r = createStudyPlanSchema.safeParse({
      child_id: VALID_CHILD_ID,
      intent: {
        subject: "Mat",
        topic: "F",
        subtopics: [],
        exam_sample_photo_url: "https://evil.com/leak.png",
      },
    });
    expect(r.success).toBe(false);
  });
});
