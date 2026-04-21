import {
  track,
  setPostHogInstance,
  getPostHogInstance,
  AnalyticsEvent,
  POSTHOG_OPTIONS,
} from "../analytics";

const mockCapture = jest.fn();
const mockPostHog = { capture: mockCapture } as never;

afterEach(() => {
  mockCapture.mockClear();
  // Reset to null between tests
  setPostHogInstance(null as never);
});

describe("track", () => {
  it("does nothing when PostHog is not initialised", () => {
    track(AnalyticsEvent.APP_OPENED);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("calls capture with the event name after PostHog is registered", () => {
    setPostHogInstance(mockPostHog);
    track(AnalyticsEvent.APP_OPENED);
    expect(mockCapture).toHaveBeenCalledWith(AnalyticsEvent.APP_OPENED, {});
  });

  it("passes through event properties", () => {
    setPostHogInstance(mockPostHog);
    track(AnalyticsEvent.MESSAGE_SENT, { has_image: true, message_number: 3 });
    expect(mockCapture).toHaveBeenCalledWith(AnalyticsEvent.MESSAGE_SENT, {
      has_image: true,
      message_number: 3,
    });
  });

  it("does not throw when capture raises an error", () => {
    mockCapture.mockImplementationOnce(() => {
      throw new Error("PostHog unavailable");
    });
    setPostHogInstance(mockPostHog);
    expect(() => track(AnalyticsEvent.CHAT_STARTED, { has_name: true })).not.toThrow();
  });

  it("tracks chat_started with correct shape", () => {
    setPostHogInstance(mockPostHog);
    track(AnalyticsEvent.CHAT_STARTED, { has_name: true });
    expect(mockCapture).toHaveBeenCalledWith("chat_started", { has_name: true });
  });

  it("tracks cta_clicked with label and optional location", () => {
    setPostHogInstance(mockPostHog);
    track(AnalyticsEvent.CTA_CLICKED, { cta_label: "Começar", location: "hero" });
    expect(mockCapture).toHaveBeenCalledWith("cta_clicked", {
      cta_label: "Começar",
      location: "hero",
    });
  });

  it("tracks premium_upgrade_clicked", () => {
    setPostHogInstance(mockPostHog);
    track(AnalyticsEvent.PREMIUM_UPGRADE_CLICKED, { location: "chat_header" });
    expect(mockCapture).toHaveBeenCalledWith("premium_upgrade_clicked", {
      location: "chat_header",
    });
  });
});

describe("POSTHOG_OPTIONS", () => {
  it("has ip disabled for LGPD compliance", () => {
    expect(POSTHOG_OPTIONS.ip).toBe(false);
  });

  it("uses memory persistence so no cross-session tracking without consent", () => {
    expect(POSTHOG_OPTIONS.persistence).toBe("memory");
  });

  it("respects DNT header", () => {
    expect(POSTHOG_OPTIONS.respect_dnt).toBe(true);
  });

  it("disables autocapture to avoid accidental PII collection", () => {
    expect(POSTHOG_OPTIONS.autocapture).toBe(false);
  });

  it("disables session recording", () => {
    expect(POSTHOG_OPTIONS.disable_session_recording).toBe(true);
  });
});

describe("AnalyticsEvent constants", () => {
  it("exports all required event names", () => {
    expect(AnalyticsEvent.APP_OPENED).toBe("app_opened");
    expect(AnalyticsEvent.CHAT_STARTED).toBe("chat_started");
    expect(AnalyticsEvent.MESSAGE_SENT).toBe("message_sent");
    expect(AnalyticsEvent.CTA_CLICKED).toBe("cta_clicked");
    expect(AnalyticsEvent.PREMIUM_UPGRADE_CLICKED).toBe("premium_upgrade_clicked");
  });
});

describe("getPostHogInstance", () => {
  it("returns null when PostHog has not been registered", () => {
    // afterEach resets via setPostHogInstance(null) — should already be null here
    expect(getPostHogInstance()).toBeNull();
  });

  it("returns the instance after it has been registered", () => {
    setPostHogInstance(mockPostHog);
    expect(getPostHogInstance()).toBe(mockPostHog);
  });

  it("returns null again after instance is cleared", () => {
    setPostHogInstance(mockPostHog);
    setPostHogInstance(null as never);
    expect(getPostHogInstance()).toBeNull();
  });
});

describe("PostHog lazy-load contract", () => {
  it("posthog-js is not required synchronously by the analytics module", () => {
    // The analytics module uses `import type posthog` (type-only import).
    // At runtime the analytics.ts module must NOT eagerly call require('posthog-js').
    // We verify this by checking that the module registry does NOT contain posthog-js
    // after the analytics module has already been imported above.
    const loaded = Object.keys(require.cache ?? {});
    const posthogLoaded = loaded.some((k) => k.includes("posthog-js") && !k.includes("__tests__"));
    expect(posthogLoaded).toBe(false);
  });
});
