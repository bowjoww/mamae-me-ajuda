import { renderHook, act } from "@testing-library/react";
import { useConsent } from "../useConsent";

jest.mock("@/lib/consent", () => ({
  loadConsent: jest.fn().mockReturnValue({ accepted: true }),
}));

describe("useConsent", () => {
  it("resolves consentGiven after mount", () => {
    const { result } = renderHook(() => useConsent());
    expect(result.current.consentGiven).toBe(true);
  });

  it("exposes acceptConsent to flip the flag", () => {
    // Simulate a fresh mount with no prior consent
    jest.doMock("@/lib/consent", () => ({
      loadConsent: jest.fn().mockReturnValue(null),
    }));
    const { result } = renderHook(() => useConsent());
    act(() => {
      result.current.acceptConsent();
    });
    expect(result.current.consentGiven).toBe(true);
  });
});
