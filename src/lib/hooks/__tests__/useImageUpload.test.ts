import { renderHook, act } from "@testing-library/react";
import { useImageUpload } from "../useImageUpload";

jest.mock("@/lib/chatUtils", () => ({
  compressImage: jest.fn().mockResolvedValue("data:image/jpeg;base64,compressed"),
}));

describe("useImageUpload", () => {
  it("starts with null preview", () => {
    const { result } = renderHook(() => useImageUpload());
    expect(result.current.imagePreview).toBeNull();
  });

  it("clearImage resets the preview", () => {
    const { result } = renderHook(() => useImageUpload());
    act(() => {
      result.current.clearImage();
    });
    expect(result.current.imagePreview).toBeNull();
  });

  it("handleImageSelect is a no-op when no file is chosen", () => {
    const { result } = renderHook(() => useImageUpload());
    const event = {
      target: { files: null },
    } as unknown as React.ChangeEvent<HTMLInputElement>;
    act(() => {
      result.current.handleImageSelect(event);
    });
    expect(result.current.imagePreview).toBeNull();
  });

  it("sets preview from compressed image after FileReader resolves", async () => {
    // Mock a FileReader that fires onload synchronously with a data URL
    class MockFileReader {
      onload: ((ev: unknown) => void) | null = null;
      readAsDataURL() {
        Promise.resolve().then(() =>
          this.onload?.({ target: { result: "data:image/png;base64,XYZ" } })
        );
      }
    }
    const originalFR = (global as unknown as { FileReader: unknown }).FileReader;
    (global as unknown as { FileReader: unknown }).FileReader = MockFileReader;

    const { result } = renderHook(() => useImageUpload());
    const event = {
      target: { files: [new Blob()] },
    } as unknown as React.ChangeEvent<HTMLInputElement>;
    await act(async () => {
      result.current.handleImageSelect(event);
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current.imagePreview).toBe(
      "data:image/jpeg;base64,compressed"
    );

    (global as unknown as { FileReader: unknown }).FileReader = originalFR;
  });
});
