/**
 * compressImage tests use jest-canvas-mock (loaded in jest.setup.ts).
 * We override drawImage to a no-op so jest-canvas-mock doesn't reject our
 * synthetic Image instances on type-checking.
 */
import { compressImage } from "../chatUtils";

/** Creates a fake Image that fires onload via setTimeout after src is set. */
function makeFakeImage(width: number, height: number) {
  return {
    width,
    height,
    onload: null as (() => void) | null,
    set src(_: string) {
      setTimeout(() => (this.onload as (() => void) | null)?.(), 0);
    },
  };
}

let drawImageSpy: jest.SpyInstance;

beforeAll(() => {
  // Suppress jest-canvas-mock's strict type check on drawImage
  drawImageSpy = jest
    .spyOn(CanvasRenderingContext2D.prototype, "drawImage")
    .mockImplementation(() => undefined);
});

afterAll(() => {
  drawImageSpy.mockRestore();
});

describe("compressImage", () => {
  beforeEach(() => {
    // Replace global Image with our lightweight fake each test
    // (Object.defineProperty allows re-definition in tests)
  });

  function injectImage(width: number, height: number) {
    const fakeImg = makeFakeImage(width, height);
    Object.defineProperty(global, "Image", {
      writable: true,
      configurable: true,
      value: function () {
        return fakeImg;
      },
    });
  }

  it("resolves with a data URL string", async () => {
    injectImage(500, 300);
    const result = await compressImage("data:image/jpeg;base64,abc");
    expect(typeof result).toBe("string");
    expect(result.startsWith("data:")).toBe(true);
  });

  it("resolves for images smaller than 1024px (no resize needed)", async () => {
    injectImage(800, 600);
    const result = await compressImage("data:image/jpeg;base64,abc");
    expect(result).toBeTruthy();
  });

  it("resolves for landscape images wider than 1024px", async () => {
    injectImage(2048, 1024);
    const result = await compressImage("data:image/jpeg;base64,abc");
    expect(result).toBeTruthy();
  });

  it("resolves for portrait images taller than 1024px", async () => {
    injectImage(768, 2048);
    const result = await compressImage("data:image/jpeg;base64,abc");
    expect(result).toBeTruthy();
  });

  it("resolves for square images larger than 1024px", async () => {
    injectImage(2000, 2000);
    await expect(compressImage("data:image/png;base64,xyz")).resolves.toBeTruthy();
  });
});
