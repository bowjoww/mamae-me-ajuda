"use client";

import dynamic from "next/dynamic";

/**
 * Client-side wrapper that defers loading PostHogProvider via next/dynamic
 * with ssr:false. This keeps the ~56 kB posthog-js out of the critical path.
 *
 * This file must live in a "use client" boundary because ssr:false is not
 * allowed in Server Components (RootLayout is a Server Component).
 */
const PostHogProvider = dynamic(
  () => import("./PostHogProvider").then((m) => ({ default: m.PostHogProvider })),
  { ssr: false, loading: () => null }
);

export function PostHogClientLoader() {
  return <PostHogProvider />;
}
