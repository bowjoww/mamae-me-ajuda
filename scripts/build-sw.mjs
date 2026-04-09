/**
 * Service worker build script (post-build step).
 *
 * Run AFTER `next build` so the precache manifest can glob `.next/static/`.
 * Usage: node scripts/build-sw.mjs
 */

import { spawnSync } from "node:child_process";
import { injectManifest } from "@serwist/build";
import { serwist } from "@serwist/next/config";

const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ??
  crypto.randomUUID();

const config = await serwist(
  {
    swSrc: "src/app/sw.ts",
    swDest: "public/sw.js",
    additionalPrecacheEntries: [{ url: "/offline", revision }],
  },
  undefined,
  { isDev: process.env.NODE_ENV === "development" }
);

const result = await injectManifest(config);

console.log(
  `[build-sw] Service worker generated (${result.count} precache entries, ${(result.size / 1024).toFixed(1)} kB).`
);

if (result.warnings.length > 0) {
  console.warn("[build-sw] Warnings:", result.warnings);
}
