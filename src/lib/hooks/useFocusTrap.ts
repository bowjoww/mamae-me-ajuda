"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

interface UseFocusTrapOptions {
  /**
   * When true, the trap is armed: focus is moved into the container on mount
   * and Tab cycling is constrained to elements inside the container.
   */
  active: boolean;
  /**
   * Called when the user presses Escape inside the trapped container.
   * Typical use is to close the dialog.
   */
  onEscape?: () => void;
}

/**
 * Traps keyboard focus inside a container while it is open. Implements the
 * accessibility requirements of WCAG 2.2 SC 2.1.2 (No Keyboard Trap — here,
 * inverted: the trap is intentional and the component MUST offer an Escape
 * path), and SC 2.4.3 (Focus Order).
 *
 * Behavior:
 *  - On activation: move focus to the first focusable descendant.
 *  - Tab / Shift+Tab: cycle focus within the container.
 *  - Escape: invoke `onEscape` (caller is expected to close the dialog).
 *  - On deactivation: restore focus to the element that had focus before
 *    the trap armed.
 */
export function useFocusTrap<T extends HTMLElement>(
  options: UseFocusTrapOptions,
): React.RefObject<T | null> {
  const { active, onEscape } = options;
  const containerRef = useRef<T | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    const container = containerRef.current;
    if (!container) return;

    // Remember what had focus so we can restore it when the trap disarms.
    previousFocusRef.current =
      (document.activeElement as HTMLElement | null) ?? null;

    const getFocusable = (): HTMLElement[] => {
      return Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (el) =>
          !el.hasAttribute("aria-hidden") &&
          el.offsetParent !== null, // rough visibility check
      );
    };

    // Move initial focus into the trap. A small delay lets animations finish.
    const initialFocusables = getFocusable();
    if (initialFocusables.length > 0) {
      initialFocusables[0].focus();
    } else {
      // Fallback: make the container programmatically focusable.
      container.setAttribute("tabindex", "-1");
      container.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onEscape?.();
        return;
      }

      if (event.key !== "Tab") return;

      const focusables = getFocusable();
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", handleKeyDown);

    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      // Restore focus to the element that had it before the trap armed.
      previousFocusRef.current?.focus?.();
    };
  }, [active, onEscape]);

  return containerRef;
}
