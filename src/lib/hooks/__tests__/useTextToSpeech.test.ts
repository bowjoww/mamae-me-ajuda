import { renderHook, act, waitFor } from "@testing-library/react";
import { useTextToSpeech } from "../useTextToSpeech";

describe("useTextToSpeech", () => {
  it("starts with no playing or loading state", () => {
    const { result } = renderHook(() => useTextToSpeech());
    expect(result.current.playingIndex).toBeNull();
    expect(result.current.loadingAudio).toBeNull();
  });

  it("handles fetch failure gracefully", async () => {
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockResolvedValue({ ok: false });

    const { result } = renderHook(() => useTextToSpeech());
    await act(async () => {
      await result.current.speak("olá", 1);
    });
    await waitFor(() => {
      expect(result.current.loadingAudio).toBeNull();
      expect(result.current.playingIndex).toBeNull();
    });
  });

  it("recovers from thrown errors", async () => {
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useTextToSpeech());
    await act(async () => {
      await result.current.speak("olá", 1);
    });
    expect(result.current.loadingAudio).toBeNull();
    expect(result.current.playingIndex).toBeNull();
  });
});
