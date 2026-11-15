import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Steady — home safety walkthrough",
  description: "Film your home. See the fall risks, the fixes, and what it costs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen font-sans">
        <header className="border-b border-line bg-card/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <a href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <span className="inline-block h-3 w-3 rounded-full bg-sage" aria-hidden />
              Steady
            </a>
            <span className="text-sm text-muted">Home safety, room by room</span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 text-sm text-muted">
          Steady is a starting point, not a professional home assessment. For a full evaluation, ask about an
          occupational therapist home safety visit. Video edits are AI visualizations.
        </footer>
      </body>
    </html>
  );
}
