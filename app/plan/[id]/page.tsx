import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readReport } from "@/lib/storage";
import { applyResidentRules } from "@/lib/filters";
import { reportArea } from "@/lib/area";
import { SimplePlan } from "@/components/SimplePlan";
import type { Report } from "@/lib/schema";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Home safety plan · Steady",
  robots: { index: false, follow: false },
};

/**
 * Read-only plan for family. Server-rendered from the saved report with no API calls. Props sent to the client
 * component are scrubbed first: no street address, coordinates, video or free-text health notes.
 */
export default async function SharedPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await readReport(id);
  if (!report) notFound();

  const area = reportArea(report);
  const shared: Report = {
    ...report,
    source: { type: "upload" },
    duration_s: null,
    clips: {},
    location: area,
    location_area: area,
    location_geo: null,
    resident: report.resident ? { ...report.resident, other_needs: undefined } : null,
    hazards: applyResidentRules(report.hazards, report.resident),
  };

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-3xl">
        <p className="text-lg font-semibold uppercase tracking-wider text-sage">Shared home safety plan</p>
        <h1 className="text-3xl font-bold">What to fix, and who can help</h1>
        <p className="mt-2 text-lg text-muted">
          One simple plan from a walkthrough video: what you can fix today for free, what&apos;s cheap, and who will
          help pay for (or even do) the rest.{area ? ` For a home near ${area}.` : ""}
        </p>
      </div>
      <SimplePlan report={shared} readOnly />
    </div>
  );
}
