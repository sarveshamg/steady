import type { Metadata } from "next";
import { Public_Sans } from "next/font/google";
import "./globals.css";

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-public-sans",
});

export const metadata: Metadata = {
  title: "Steady — home safety walkthrough",
  description: "Film your home. See the fall risks, the fixes, and who can help pay.",
  icons: { apple: "/apple-touch-icon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={publicSans.variable}>
      <body className="flex min-h-screen flex-col font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2">
          Skip to content
        </a>
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <a href="/" className="inline-flex min-h-11 items-center" aria-label="Steady home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="Steady" width={120} height={32} className="h-8 w-auto" />
            </a>
            <span className="hidden text-sm text-muted sm:inline">Home safety, room by room</span>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
          {children}
        </main>
        <footer className="border-t border-line bg-surface">
          <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted sm:px-6">
            Steady is a starting point, not a professional assessment. Use a licensed professional for electrical, gas,
            plumbing and structural work.
          </p>
        </footer>
      </body>
    </html>
  );
}
