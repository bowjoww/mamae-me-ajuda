/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkFirst, NetworkOnly, ExpirationPlugin } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Sensitive API routes that must never be cached
const UNCACHED_API_ROUTES = [
  /^\/api\/chat($|\?)/,
  /^\/api\/tts($|\?)/,
  /^\/api\/auth\//,
  /^\/api\/conversations\//,
  /^\/api\/_sentry\//,
  /^\/api\/consent($|\?)/,
];

const runtimeCaching = [
  // Sensitive routes: always network-only, never cache
  {
    matcher: ({ url }: { url: URL }) =>
      UNCACHED_API_ROUTES.some((re) => re.test(url.pathname)),
    handler: new NetworkOnly(),
    method: "GET" as const,
  },
  // Other API routes: network-first, short cache for GET requests only
  {
    matcher: ({ url }: { url: URL }) => url.pathname.startsWith("/api/"),
    handler: new NetworkFirst({
      cacheName: "api-cache",
      networkTimeoutSeconds: 10,
      plugins: [
        new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 }),
      ],
    }),
    method: "GET" as const,
  },
  // Static assets: use serwist defaults (cache-first for fonts, images, etc.)
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }: { request: Request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
