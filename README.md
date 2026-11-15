<p><img src="public/logo.svg" alt="Steady" width="240" height="64"></p>

Film your home or snap a few photos. Steady finds fall hazards and home problems, explains each fix and what it costs, and shows who can
help pay. Built for DevFest Santa Cruz 2026.

## The problem

Older adults often can't afford home repairs, and figuring out what to fix, who to call and how to
pay is overwhelming. Steady turns one video (or a few photos) into **one simple plan**:

1. **Do today, free:** move the cord, clear the path.
2. **Under $50, do it yourself:** a price range and store links.
3. **Get help with:** bigger jobs, each paired with a verified local program that can help pay (or do
   the work), a nearby business, and one "Call for help" number for the local Area Agency on Aging.

The plan can be read aloud in English, Spanish, Vietnamese, Chinese, Tagalog or Korean, and shared
with family as a read-only link.

| Simple plan | Report |
|---|---|
| ![The Simple plan tab: three sections and the Call for help banner](docs/screenshots/simple-plan.png) | ![The Safety tab: video, hazard timeline and finding detail](docs/screenshots/report.png) |

## Project story

### Inspiration
About 1 in 4 adults over 65 falls every year, and falls are the leading cause of injury death for older adults ([CDC](https://www.cdc.gov/falls/data-research/index.html)). Most of those falls happen at home, and many of them come from things that are easy to fix: a loose rug, a dark hallway, a staircase with nothing to hold on the wall side.

The problem isn't that families don't care. It's that they don't know what to look for, a professional home safety assessment is expensive and hard to book, and when they do find a problem, they get stuck on the next questions: what does it cost, who can fix it, and how do we pay for it? Older adults on fixed incomes often just live with the risk.

We wanted to turn something every family already has, a phone, into a home safety check that ends with a plan you can actually act on.

### What it does
**Steady** turns a short walkthrough video, or a few photos, of a home into a personal safety plan.

1. **Tell Steady who lives there.** Do they walk on their own, use a cane or walker, get up at night, have trouble seeing? There's also a box for anything else.
2. **Film a walkthrough or snap a few photos** and upload them.
3. **Get a report built for that person.** Steady finds fall hazards and home-condition problems, and each finding links to the exact moment in the video (or the exact photo) where it was seen.

Every finding comes with:
- **Why it matters for them.** A missing second stair rail matters a lot for someone with a cane and much less for someone who walks on their own, so Steady judges the hazard against the resident, not a generic checklist.
- **The fix and a price range,** with verified links to real products.
- **Local help.** Nearby contractors and handymen with ratings and distance, independent businesses shown first.
- **Help paying.** Programs that may cover or reduce the cost of repairs for older adults.

Everything rolls up into a **Simple plan**: what you can do *today for free*, what costs *under $50*, and what to *get help with*, plus a share link so the whole family can work from the same plan.

### How we built it
- **Next.js 15 + TypeScript + Tailwind** for the app, with **Zod** validating every model response so bad output never reaches the screen.
- **Gemini 3.8 Flash on Vertex AI** watches the full video and returns structured findings, each with a timestamp, a room and the visual evidence it is based on.
- **Photos** are turned into a short slideshow video with ffmpeg, so they go through exactly the same verified pipeline.
- **Google Search grounding** finds current prices, real product pages and repair-assistance programs, and we check those URLs before showing them.
- **Places API (New)** with geocoding finds nearby businesses, ranks them by distance and rating, and limits results to a sensible radius.
- **ffmpeg** compresses uploads and pulls the exact video frame for each finding, so you can see what Steady saw.
- We built quickly with **Claude Code**, so we could spend our time on the product decisions and testing.

### Challenges we ran into
**Hallucination was the biggest one.** Our first version gave confident answers about hazards that weren't in the video, and about half its findings weren't real problems. We fixed this in layers (see [How verification works](#how-verification-works)): required evidence, a confidence cutoff, de-duplication, a second pass that re-watches the video, a frame-level check, and hard rules that remove findings that don't apply to the resident. For example, Steady won't recommend grab bars or a second rail for someone who walks on their own.

**Real homes in bad condition aren't on video.** Almost every walkthrough online is a real estate listing of a staged, spotless home, so our home-condition checks had almost nothing to find. That taught us something about real use: families don't film tours of a leaking ceiling, they snap a photo of it. So we added photo uploads, and tuned Steady to report wear that adds up (damaged paint, holes, worn flooring) while still staying quiet when a home is fine.

**Smaller ones:** Gemini sometimes returned 503s under heavy load (we added retries with backoff and a clear message), our first local search returned businesses far away (geocoding and a distance cap fixed it), and we cut features that weren't reliable enough for a live demo rather than ship something half-working.

### Accomplishments that we're proud of
- Findings that are **tied to evidence**: every one points to a timestamp or photo you can check yourself.
- Advice that is **personal**: the same home produces a different report for someone with a walker than for someone who walks on their own.
- Going past "here's a problem" to **who can fix it nearby and who can help pay**, which is where most families get stuck.
- A plan simple enough for an older adult to read on their own.

### What we learned
- With multimodal AI, **verification matters more than generation.** Getting the model to find things was easy; getting it to find only real things took most of our time.
- **Telling people about fewer, real problems is more useful than a long list.** An honest short list builds trust.
- Accessibility isn't a design add-on when your users are older adults. It shaped our type sizes, contrast, tap targets and wording.

### What's next for Steady
- Testing with real families and occupational therapists, who do home safety assessments professionally.
- Following up on the plan: reminders, and checking items off together as a family.
- Support for YouTube home tours and before/after visualizations of each fix.
- More languages, starting with Spanish.
- Partnering with local aging services and repair nonprofits so "Help paying" can connect people directly to programs.

## How verification works

Every finding has to survive three checks before it is shown:

1. **Evidence.** Gemini watches the video and must describe what it actually sees for each finding
   (`evidence`), with a timestamp and a confidence. Findings with no evidence or confidence below 0.5
   are dropped; anything below 0.75 is shown only under "less certain".
2. **Second pass.** A separate Gemini request re-watches the video and must confirm each finding is
   visible where claimed. Unconfirmed findings are removed. If this pass can't run, findings are marked
   "not double-checked".
3. **Frame check.** For uploads (video or photos), real frames around each timestamp are pulled with ffmpeg and checked
   as images. The frame that shows the problem becomes the frame on screen, so people can judge it
   themselves.

Prices, products and assistance programs come from Google Search grounding. A link is kept only if it
matches a search result or a live page check passes (a 404 means it was invented). Program phone
numbers and "free" claims are kept only if the program's own page shows them.

We haven't run the labelled eval (`npm run eval`) on a full set of staged walkthroughs yet, so there
are no accuracy numbers here.

## Google services used

| Service | What it does in Steady |
|---|---|
| Gemini video understanding + structured output (Vertex AI) | Finds hazards with timestamps and evidence; responses are schema-constrained and validated with Zod |
| Gemini multi-pass verification | A second, independent pass must confirm each finding in the video |
| Gemini frame-level image checks | Frames around each timestamp are checked so the frame shown is the one that proves the finding |
| Grounding with Google Search | Price ranges, verified product links and local assistance programs |
| Places API (New) | Geocodes the home once; finds independent local businesses within 25 miles |
| Gemini TTS | Reads the Simple plan aloud in six languages, with captions on screen |

## Setup (Mac)

```bash
cd ~/Documents/Steady
npm install
cp .env.example .env.local        # then fill in the values below
gcloud auth application-default login
gcloud auth application-default set-quota-project steady-devfest
npm run dev
```

Open http://localhost:3000.

`.env.local` (never commit keys):

- `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`: Vertex AI via Application Default Credentials.
- `GOOGLE_MAPS_API_KEY`: Places API (New) for local help.
- `GEMINI_API_KEY` (optional): TTS fallback if the TTS model isn't on Vertex.

## Demo safety net

Every analysis, price, program and local result is saved in `data/results/`. Re-opening
`/report/<id>` loads it from disk with no API calls, so run the demo video through once before presenting.

## Privacy

The ZIP code is used only to search for help nearby. Prompts and the shared plan page use city and ZIP
only, never a street address. The shared page shows no video.

## Eval on real walkthroughs

1. Stage hazards in a room (rug at a doorway, cord across a path, dark hallway, no bath mat).
2. Film 20–45 s clips into `eval/` with no people in them.
3. Copy `eval/labels.example.csv` to `eval/labels.csv`: one row per staged hazard.
4. `npm run eval` prints how many staged hazards were caught and how many extra findings appeared.
