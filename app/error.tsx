"use client";

import { Button, ButtonLink, Panel } from "@/components/ui";

/** Any unexpected page error: plain words and one way forward. Details stay in the browser console. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <Panel padding="lg" className="mx-auto max-w-xl space-y-3" role="alert">
      <p className="font-semibold text-urgent">Something went wrong</p>
      <h1 className="text-2xl">This page didn&apos;t load.</h1>
      <p className="text-muted">Try again. If it keeps happening, start over from the home page.</p>
      <div className="flex flex-wrap gap-3 pt-2">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/" variant="secondary">
          Start over
        </ButtonLink>
      </div>
    </Panel>
  );
}
