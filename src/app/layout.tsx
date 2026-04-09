import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { PostHogProvider } from "./providers/PostHogProvider";
import { ServiceWorkerRegistration } from "./components/ServiceWorkerRegistration";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mamãe, me ajuda!",
  description: "Seu ajudante de estudos com inteligência artificial",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mamãe, me ajuda!",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#7c3aed",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body className={`${nunito.variable} font-[var(--font-nunito)] antialiased`}>
        <PostHogProvider />
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
