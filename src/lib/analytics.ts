/**
 * Analytics module for Mamãe Me Ajuda.
 *
 * Uses PostHog with LGPD-compliant settings:
 * - No IP address persistence
 * - Anonymized user data
 * - Respect DNT header
 * - No cross-session tracking without consent
 */

import type posthog from "posthog-js";

// Event names — single source of truth
export const AnalyticsEvent = {
  APP_OPENED: "app_opened",
  CHAT_STARTED: "chat_started",
  MESSAGE_SENT: "message_sent",
  CTA_CLICKED: "cta_clicked",
  PREMIUM_UPGRADE_CLICKED: "premium_upgrade_clicked",
} as const;

export type AnalyticsEventName =
  (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

export interface AnalyticsProperties {
  [AnalyticsEvent.APP_OPENED]: Record<string, never>;
  [AnalyticsEvent.CHAT_STARTED]: { has_name: boolean };
  [AnalyticsEvent.MESSAGE_SENT]: { has_image: boolean; message_number: number };
  [AnalyticsEvent.CTA_CLICKED]: { cta_label: string; location?: string };
  [AnalyticsEvent.PREMIUM_UPGRADE_CLICKED]: { location?: string };
}

type PostHogInstance = typeof posthog;

let _posthog: PostHogInstance | null = null;

export function setPostHogInstance(instance: PostHogInstance): void {
  _posthog = instance;
}

/** Returns the current PostHog instance, or null if not yet initialised. */
export function getPostHogInstance(): PostHogInstance | null {
  return _posthog;
}

/**
 * Track an analytics event. Safe to call when analytics is not initialised
 * (e.g. missing env var, SSR, test environment).
 */
export function track<E extends AnalyticsEventName>(
  event: E,
  properties?: AnalyticsProperties[E]
): void {
  if (!_posthog) return;

  try {
    _posthog.capture(event, properties ?? {});
  } catch {
    // Never let analytics break the app
  }
}

/**
 * PostHog init options configured for LGPD compliance:
 * - `ip` disabled so raw IP is never stored
 * - `persistence` set to memory-only (no cross-session tracking without consent)
 * - `respect_dnt` honours browser Do-Not-Track
 * - `capture_pageview` disabled — we fire manually when appropriate
 */
export const POSTHOG_OPTIONS = {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com",
  ip: false,
  persistence: "memory" as const,
  respect_dnt: true,
  capture_pageview: false,
  capture_pageleave: false,
  autocapture: false,
  disable_session_recording: true,
} as const;
