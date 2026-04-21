import "@testing-library/jest-dom";
import "jest-canvas-mock";
import { TextDecoder, TextEncoder } from "node:util";

// Default Supabase env vars for tests so schemas that resolve the storage
// hostname at module load (see src/lib/schemas/study.ts) have a non-empty
// value. Tests that need to assert closed-fail behaviour can still override
// via jest.resetModules + custom env.
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://test-project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "test-anon-key";

// jsdom doesn't ship TextEncoder/TextDecoder; several tests stream SSE bytes.
if (typeof globalThis.TextEncoder === "undefined") {
  (globalThis as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === "undefined") {
  (globalThis as unknown as { TextDecoder: typeof TextDecoder }).TextDecoder = TextDecoder;
}

// Mock react-markdown and remark-gfm (ESM-only) with simple pass-through stubs
jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("remark-gfm", () => ({ __esModule: true, default: () => {} }));

import React from "react";
