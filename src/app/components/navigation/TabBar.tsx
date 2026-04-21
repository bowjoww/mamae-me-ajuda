"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/prova",
    label: "Prova",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
        className="w-[22px] h-[22px]"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 6.2A2.2 2.2 0 0 1 6.2 4h11.6A2.2 2.2 0 0 1 20 6.2v11.6A2.2 2.2 0 0 1 17.8 20H6.2A2.2 2.2 0 0 1 4 17.8V6.2Z"
        />
        <path strokeLinecap="round" d="M8 9h8M8 13h5M8 17h3" />
      </svg>
    ),
  },
  {
    href: "/estudo",
    label: "Estudo",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
        className="w-[22px] h-[22px]"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 4 3 9l9 5 9-5-9-5Z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 11v5a5 5 0 0 0 10 0v-5" />
      </svg>
    ),
  },
  {
    href: "/perfil",
    label: "Perfil",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
        className="w-[22px] h-[22px]"
      >
        <circle cx="12" cy="8.5" r="3.5" strokeLinecap="round" />
        <path strokeLinecap="round" d="M4.5 20a7.5 7.5 0 0 1 15 0" />
      </svg>
    ),
  },
] as const;

interface TabBarProps {
  floating?: boolean;
}

export function TabBar({ floating = true }: TabBarProps) {
  const pathname = usePathname();

  // Android gesture bar / iOS home indicator can occlude fixed bottom UI.
  // We lift the TabBar by `env(safe-area-inset-bottom)` (with a 12px floor)
  // so links remain tappable above the system inset. Requires
  // `viewport-fit=cover` on the `<meta viewport>` tag (set in layout.tsx)
  // so the env() variable resolves to a non-zero value.
  const safeAreaStyle = floating
    ? { bottom: "max(12px, env(safe-area-inset-bottom))" }
    : { paddingBottom: "env(safe-area-inset-bottom)" };

  return (
    <nav
      aria-label="Navegação principal"
      className={`${floating ? "fixed left-1/2 -translate-x-1/2" : "sticky bottom-0"} z-40 w-[calc(100%-1.5rem)] max-w-sm rounded-full border border-[var(--line)] bg-[var(--canvas-surface)]/95 backdrop-blur-sm px-2 py-2 shadow-[0_18px_40px_-18px_oklch(0%_0_0/0.7)]`}
      style={safeAreaStyle}
    >
      <ul className="flex items-center justify-between">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                // WCAG 2.2 SC 2.5.8 Target Size — min-height 44px ensures
                // the hit area comfortably exceeds the 24x24 CSS px minimum.
                className="flex items-center justify-center gap-2 py-2 rounded-full transition-colors min-h-[44px]"
                style={{
                  color: active
                    ? "var(--violet-action)"
                    : "var(--ink-secondary)",
                  background: active
                    ? "color-mix(in oklch, var(--violet-action) 12%, transparent)"
                    : "transparent",
                }}
              >
                {tab.icon}
                <span
                  className="font-hud uppercase"
                  style={{
                    fontSize: "0.6875rem",
                    letterSpacing: "0.16em",
                  }}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
