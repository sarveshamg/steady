"use client";

import { useReveal } from "@/hooks/useReveal";
import { ClipboardCheckIcon, UsersIcon, VideoIcon } from "./icons";

const STEPS = [
  {
    icon: UsersIcon,
    title: "Tell us who lives there",
    body: "A cane, low vision or getting up at night changes what matters most.",
  },
  {
    icon: VideoIcon,
    title: "Film a walkthrough",
    body: "Walk slowly through the home for under a minute. Show floors, stairs and rails.",
  },
  {
    icon: ClipboardCheckIcon,
    title: "Get a plan you can act on",
    body: "What to fix today for free, what's cheap, and who can help pay for the rest.",
  },
];

/** "How it works": three steps that fade up as they scroll in (60ms stagger). */
export function HowItWorks() {
  const ref = useReveal<HTMLElement>([], { stagger: 60 });
  return (
    <section id="how" ref={ref} aria-labelledby="how-title" className="mx-auto max-w-[1120px] scroll-mt-6 space-y-8">
      <h2 id="how-title" className="text-2xl">
        How it works
      </h2>
      <ol className="grid gap-6 sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <li key={title} data-reveal-item data-reveal-index={i} className="space-y-3 rounded-lg border border-line bg-surface p-4 sm:p-6">
            <span className="grid h-12 w-12 place-content-center rounded-full bg-primary-soft text-primary" aria-hidden>
              <Icon className="h-6 w-6" />
            </span>
            <h3 className="text-xl">
              <span className="sr-only">Step {i + 1}: </span>
              {title}
            </h3>
            <p className="text-muted">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
