import "@testing-library/jest-dom";
import "jest-canvas-mock";

// Mock react-markdown and remark-gfm (ESM-only) with simple pass-through stubs
jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("remark-gfm", () => ({ __esModule: true, default: () => {} }));

import React from "react";
