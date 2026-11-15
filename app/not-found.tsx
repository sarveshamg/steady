import { ButtonLink, Panel } from "@/components/ui";

export default function NotFound() {
  return (
    <Panel padding="lg" className="mx-auto max-w-xl space-y-3">
      <p className="font-semibold text-primary">Page not found</p>
      <h1 className="text-2xl">We can&apos;t find that page.</h1>
      <p className="text-muted">The link may be old, or the report was removed.</p>
      <div className="pt-2">
        <ButtonLink href="/">Check a home</ButtonLink>
      </div>
    </Panel>
  );
}
