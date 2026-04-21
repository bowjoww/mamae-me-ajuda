import React from "react";
import { render, screen } from "@testing-library/react";
import { MessageList } from "../MessageList";
import type { MessageWithKey } from "@/lib/hooks/useChatSession";

// jsdom needs scrollIntoView stub
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

describe("MessageList", () => {
  const messages: MessageWithKey[] = [
    { _key: "k1", role: "model", content: "Oi, Henrique!" },
    { _key: "k2", role: "user", content: "Oi" },
  ];

  it("renders every message", () => {
    render(
      <MessageList
        messages={messages}
        isLoading={false}
        playingIndex={null}
        loadingAudio={null}
        onSpeak={() => {}}
      />
    );
    // The assistant's latest message is duplicated into a narrow sr-only
    // live region for accessibility announcements, so getAllByText is used.
    expect(screen.getAllByText("Oi, Henrique!").length).toBeGreaterThan(0);
    expect(screen.getByText("Oi")).toBeInTheDocument();
  });

  it("renders typing indicator while loading", () => {
    render(
      <MessageList
        messages={messages}
        isLoading
        playingIndex={null}
        loadingAudio={null}
        onSpeak={() => {}}
      />
    );
    expect(screen.getByRole("status", { name: /pensando/i })).toBeInTheDocument();
  });

  it("exposes role=log on the transcript container", () => {
    // WCAG 2.2 / WAI-ARIA: chat transcripts use role="log" so assistive tech
    // announces new entries at the end of the list without re-reading the
    // full conversation on each render.
    render(
      <MessageList
        messages={messages}
        isLoading={false}
        playingIndex={null}
        loadingAudio={null}
        onSpeak={() => {}}
      />
    );
    const transcript = screen.getByLabelText(/Conversa com a tutora/);
    expect(transcript).toHaveAttribute("role", "log");
    // The transcript itself is NOT aria-live — instead, a narrow sr-only
    // region announces only the latest assistant message, avoiding the
    // "entire transcript re-read" bug.
    expect(transcript).not.toHaveAttribute("aria-live");
  });

  it("announces only the latest assistant message via a narrow aria-live region", () => {
    const { container } = render(
      <MessageList
        messages={messages}
        isLoading={false}
        playingIndex={null}
        loadingAudio={null}
        onSpeak={() => {}}
      />
    );
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toHaveAttribute("aria-atomic", "true");
    // Only the latest assistant content should be in the live region.
    expect(liveRegion?.textContent).toContain("Oi, Henrique!");
  });
});
