import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
  // Transform ESM-only packages
  transformIgnorePatterns: [
    "node_modules/(?!(uncrypto|@upstash/redis|@upstash/ratelimit|react-markdown|remark-gfm|remark-parse|remark-rehype|rehype-react|unified|bail|is-plain-obj|trough|vfile|unist-util-stringify-position|micromark|decode-named-character-reference|character-entities|mdast-util-from-markdown|mdast-util-to-markdown|mdast-util-gfm|micromark-extension-gfm|mdast-util-gfm-autolink-literal|mdast-util-gfm-footnote|mdast-util-gfm-strikethrough|mdast-util-gfm-table|mdast-util-gfm-task-list-item|hast-util-to-jsx-runtime|hast-util-whitespace|property-information|space-separated-tokens|comma-separated-tokens|estree-util-is-identifier-name|@nicolo-ribaudo|devlop)/)",
  ],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/app/layout.tsx",
    "!src/app/globals.css",
    // Supabase types file has no runtime logic (only TypeScript type definitions)
    "!src/lib/supabase/types.ts",
    // Supabase client/server infra — thin wrappers over the official SDK
    "!src/lib/supabase/client.ts",
    "!src/lib/supabase/middleware-client.ts",
    "!src/lib/supabase/server.ts",
    // Main page is exercised by E2E tests
    "!src/app/page.tsx",
    // PostHog browser-only wrapper (no testable runtime logic)
    "!src/app/providers/PostHogProvider.tsx",
    // Next.js middleware — thin Supabase session refresh wrapper
    "!src/middleware.ts",
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

export default createJestConfig(config);
