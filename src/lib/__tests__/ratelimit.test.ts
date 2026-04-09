/**
 * @jest-environment node
 */
// Mock upstash packages to prevent ESM/Redis connection issues in tests
jest.mock("@upstash/redis", () => ({ Redis: jest.fn() }));
jest.mock("@upstash/ratelimit", () => ({ Ratelimit: jest.fn() }));

import { getClientIp } from "../ratelimit";

function makeRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost/", { headers });
}

describe("getClientIp", () => {
  it("extracts IP from x-forwarded-for header (single IP)", () => {
    const req = makeRequest({ "x-forwarded-for": "192.168.1.1" });
    expect(getClientIp(req)).toBe("192.168.1.1");
  });

  it("extracts the first IP from x-forwarded-for header (multiple IPs)", () => {
    const req = makeRequest({
      "x-forwarded-for": "10.0.0.1, 172.16.0.1, 192.168.0.1",
    });
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  it("trims whitespace from x-forwarded-for IP", () => {
    const req = makeRequest({ "x-forwarded-for": "  203.0.113.5  " });
    expect(getClientIp(req)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = makeRequest({ "x-real-ip": "10.1.2.3" });
    expect(getClientIp(req)).toBe("10.1.2.3");
  });

  it("returns 127.0.0.1 when no IP headers are present", () => {
    const req = makeRequest({});
    expect(getClientIp(req)).toBe("127.0.0.1");
  });

  it("prefers x-forwarded-for over x-real-ip", () => {
    const req = makeRequest({
      "x-forwarded-for": "5.5.5.5",
      "x-real-ip": "9.9.9.9",
    });
    expect(getClientIp(req)).toBe("5.5.5.5");
  });
});
