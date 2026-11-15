"use client";

import { useState } from "react";
import { ShareIcon } from "./icons";
import { Button } from "./ui";

/** Share the read-only plan link: Web Share API where available, else copy the link and show a toast. */
export function ShareButton({ reportId }: { reportId: string }) {
  const [toast, setToast] = useState<string | null>(null);

  function show(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function share() {
    const url = `${window.location.origin}/plan/${encodeURIComponent(reportId)}`;
    const title = "Home safety plan";
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text: "Here's the home safety plan from Steady.", url });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // user closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(url);
      show("Link copied");
    } catch {
      show(`Copy this link: ${url}`);
    }
  }

  return (
    <div className="relative">
      <Button variant="secondary" size="lg" onClick={share}>
        <ShareIcon />
        Share this plan
      </Button>
      <div aria-live="polite" className="absolute right-0 top-full z-10 mt-2">
        {toast && (
          <p className="whitespace-nowrap rounded-md border border-line bg-surface px-4 py-2 text-lg shadow-float">{toast}</p>
        )}
      </div>
    </div>
  );
}
