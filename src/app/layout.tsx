import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { PostHogClientLoader } from "./providers/PostHogClientLoader";
import { ServiceWorkerRegistration } from "./components/ServiceWorkerRegistration";

// Editorial title font — used for headlines in hub surfaces
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

// Workhorse UI font — body, labels, buttons
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

// HUD font — stats, ranks, XP, timers
const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mamãe, me ajuda!",
  description: "Seu ajudante de estudos com inteligência artificial",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mamãe, me ajuda!",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // WCAG 2.2 SC 1.4.4 Resize Text: users must be able to zoom to at least 200%.
  // Allow up to 5x pinch-zoom. `userScalable: true` is explicit for older agents.
  maximumScale: 5,
  userScalable: true,
  themeColor: "#0d0a1a",
  // viewport-fit=cover is required so `env(safe-area-inset-bottom)` resolves to
  // a non-zero value on Android/iOS devices with gesture bars and notches.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fontVariables = `${instrumentSerif.variable} ${geistSans.variable} ${jetBrainsMono.variable}`;

  return (
    <html lang="pt-BR" className={fontVariables}>
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body className="antialiased">
        <PostHogClientLoader />
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
