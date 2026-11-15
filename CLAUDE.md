# Steady — DevFest Santa Cruz 2026

Steady helps older adults stay safely in their homes. A family member films a short
walkthrough of a room; Steady finds fall hazards and access barriers, explains each one,
recommends a fix with a grounded price range, and shows the fix installed in *their own room*
using a Gemini Omni Flash video edit.

**The problem (use this framing in UI copy and docs):** older adults often can't afford home repairs, and
figuring out what to fix, who to call and how to pay is overwhelming. Steady turns one video into ONE simple
plan: what you can fix today for free, what's cheap, and who will help pay for (or even do) the rest.

Target tracks: Best Social Impact (primary), Best Integration of Gemini / Google APIs
(secondary), Best UI.

## Hard rules for any coding agent

1. **Never call Omni Flash in a loop, in tests, in the eval, or on page load.** It spends a
   $25 event credit. All Omni calls go through `lib/omni.ts`, guarded by `ENABLE_OMNI=true`
   and the `OMNI_MAX_CALLS` counter in `data/omni-calls.json`. Results are cached on disk.
2. **No API keys in code or git.** Auth is Application Default Credentials. Config is in
   `.env.local` (see `.env.example`).
3. **Every model output that drives the UI is validated with Zod** (`lib/schema.ts` is the
   single source of truth). Never render raw model text as a hazard.
4. **Safety copy stays.** Steady is a starting point, not a professional assessment; no DIY
   instructions for electrical, gas, plumbing, structural or anchoring work; every Omni clip is
   labelled "AI visualization".
5. Keep it one polished flow. Don't add features before the current flow works end to end.

## Visual system (app/globals.css + components/ui/)

Calm civic look: cool gray page (`page`), white panels (`surface`), navy text (`ink`), one blue (`primary`).
Status colours only on tags: `urgent`, `soon`, `nice`, `success` (each with a `-soft` background, all ≥5:1).
Radius 10px panels, 8px inputs/buttons, 6px tags. No shadows except `shadow-float` on toasts. Public Sans,
body 17px / 1.6, scale 14/16/18/22/28/36, sentence case only (no all-caps labels), tabular-nums for money,
times and distances. Focus: 1px primary + 3px primary ring at 35%. Simple plan text is ≥18px.
Build UI from components/ui: Button/ButtonLink (primary, secondary, ghost; disabled = surface + line + muted
text, always with a one-line hint), Tag, Panel/Eyebrow, Field/TextInput/TextArea, SegmentedControl, ToggleChip,
ProgressBar, EmptyState. Formatting helpers (fmtMoney, fmtTime, postJson…) live in components/ui/format.ts.
Icons: components/icons.tsx (lucide-style, 1.75 stroke, 20px). Logo: public/logo.svg, logo-mark.svg (navy
house, blue steps; Public Sans Bold converted to outlines).

Layout: group content in Panels (24px padding, 16px on mobile); never nest panels, use row dividers. Spacing only
from 4/8/12/16/24/32/48/64 (Tailwind 1/2/3/4/6/8/12/16). Font via next/font (Public Sans) in app/layout.tsx.
Imagery: real video frames (/api/frame/<id>?t=) as row thumbnails (96×72) and the detail hero; text on a frame sits
on `.frame-overlay`. Upload empty state: components/StairsIllustration.tsx.
Motion (CSS + hooks/useReveal.ts, transform/opacity only, ≤400ms): `.press` (scale .98 while pressed), `.lift`
(hover shadow + 1px rise), `.enter` / `.enter-tab` (fade + rise on content swaps), sliding tab bar, `.check`
(success checkbox, check scales in), ProgressBar uses scaleX. useReveal sets data-reveal="pending" only after
mount and only below the fold, so content shows without JS; reduced motion disables all of it.

## Architecture

```
app/page.tsx                 upload / record
app/api/youtube              create a report from a public YouTube link (analysis only)
app/api/upload               save + compress (ffmpeg-static, 720p, no audio, ≤60 s)
                             or 1–10 photos (jpg/png/webp, ≤15 MB; HEIC rejected) → 3 s/photo slideshow MP4
                             (lib/ffmpeg.ts photosToVideo), source {type:"photos"}; then the normal pipeline
app/api/analyze              Gemini video understanding + response schema → hazards
app/api/price                Gemini + Google Search grounding → price range, sources, verified product links
app/api/visualize            trim 8 s around hazard → Omni Flash edit (GET = budget)
app/api/video/[id], clip/…   mp4 streaming with Range support (timeline seeking)
app/api/location             save ZIP/address for the report; clears geo, local help and funding
app/api/local                Places API (New): geocode once, 40 km bias, ≤25 mi, local businesses per fix
app/api/funding              grounded search for assistance programs + verification (lib/funding.ts)
app/api/listen               Simple plan → spoken script (Gemini) → Gemini TTS WAV, cached in data/audio
app/api/audio/[name]         WAV streaming with Range support
app/report/[id]              ReportView: tabs Simple plan (default) / Safety / Home condition
app/plan/[id]                read-only shared plan for family (server-rendered, city/ZIP only, no video)
components/SimplePlan.tsx    three sections + Call for help card; ListenCard, ShareButton alongside
lib/plan.ts                  pure plan logic (free / under $50 / get help), shared by UI, share page, script
lib/funding.ts, lib/tts.ts   assistance programs + verification; Gemini TTS over REST
lib/                         schema, prompts, analyze, price, omni, ffmpeg, storage, genai, area, geo, local
scripts/eval.ts              recall / extra-findings eval on labelled real walkthroughs
data/                        uploads, results JSON, clips (gitignored)
```

## Findings and anti-hallucination

- Photo reports: the slideshow runs through the same analysis, verify pass and frame check. lib/prompts.ts
  photosContext() tells the model it's N separate stills (3 s each) and to look for condition problems in
  close-ups; it does not lower the evidence bar. The frame check uses one frame from the middle of the photo.
  The UI shows "Photo N" instead of times; before/after (Omni) is refused for photo reports.

- Two kinds: `safety` (fall risks, judged for the specific resident) and `condition` (visible flaws: water
  damage, cracks, surface damage, fixtures, electrical, smoke detectors). Condition findings describe and refer
  ("have a plumber check it"); they never diagnose hidden causes or call anything safe/up to code.
- Every finding must include concrete `evidence`; confidence < 0.5 or empty evidence is dropped.
- A second, independent Gemini pass (lib/analyze.ts verifyFindings) re-watches the video and must confirm each
  finding is visible where claimed; unconfirmed findings are dropped. If that pass fails, findings are kept with
  verified: false and the UI says so.
- The UI shows the actual video frame for each finding (/api/frame) so people can judge the evidence themselves.

## Assistance programs (lib/funding.ts): anti-hallucination rules

These programs are where a wrong answer hurts most (a fake grant or a dead phone number wastes an older
adult's time and trust). Keep every one of these:

- **Privacy:** prompts get the city/ZIP only (`location_area` from Places addressComponents, else
  `lib/area.ts` strips street lines). Never put a street address in a prompt or on the share page.
- **Inputs:** only confident findings (confidence ≥ 0.75): id, title, diy_or_pro, category; resident mobility,
  low vision, recent fall. Nothing else from the resident profile.
- **Prompt rules:** serves THIS area or leave it out; copy URLs exactly from search results; never construct
  URLs; no guarantees of eligibility; fewer accurate programs beat more guesses.
- **Parsing:** grounded text → Zod; if not clean JSON, a schema-constrained conversion call (same as price.ts).
  Each program is validated individually and dropped if invalid.
- **URL check:** keep a program only if its URL (host+path) matches a resolved grounding URL, or a live GET
  returns < 400 (403/429/503 count as "exists"; 404/410 and everything else = drop).
- **Claims need page evidence:** a phone number is kept only if it appears on the program's own page;
  cost_to_family other than "unknown" is kept only if the page text supports it ("free", "loan", ...).
  Sentences with "guarantee" are removed from who_qualifies.
- **Sorting:** official (.gov / provider's own domain; directories never count) first, then
  does_the_work && free, then the rest.
- **Fallback:** the Eldercare Locator card (eldercare.acl.gov) is added only if the page is live at runtime;
  its phone is shown only if the page itself shows it.
- **Read-aloud** never sees URLs, phones or addresses, and program claims are pre-decided from verified fields
  (`program_says` in lib/listen.ts), so the voice can't promise more than the screen.
- Cached as `report.funding`; cleared when the location changes or analysis is re-run (hazard ids change).

## Facts verified against Google docs (Nov 2026)

- Omni Flash uses the **Interactions API** (`ai.interactions.create`), model
  `gemini-omni-1.1-flash` (1.2 is newer; check Model Garden). Edits of uploaded videos accept
  clips **≤10 s**, and won't edit videos with recognizable people.
- Product links (lib/shopping.ts): only allowlisted US retailers; kept only if the URL matches a grounded
  search result or passes a live page check (404 = invented). Retailer search links are always shown as fallback.
- Omni Flash does not accept YouTube sources. Never download YouTube videos (ToS); YouTube reports skip before/after.
- Outputs over ~4 MB may come back as a URI instead of inline data; `lib/omni.ts` handles both.
- Model IDs and Vertex availability change: verify before the demo, override via env vars.
- Gemini TTS (`gemini-3.8-flash-tts`, env `TTS_MODEL`): on Vertex it's `generateContent` with
  `parts[].speechMetadata.style` and `generationConfig.speechConfig.voiceConfig.voice` (not the older
  `prebuiltVoiceConfig.voiceName`); on the Gemini API it's the Interactions API with a `speech_metadata`
  annotation and `generation_config.speech_config: [{voice}]`. Both return WAV. `lib/tts.ts` calls REST directly
  because @google/genai 1.x drops these fields; raw PCM (older models) is wrapped in a WAV header.
- In `next dev`, React 19 includes awaited server I/O results (e.g. the raw report JSON read by `readReport`) in
  the page payload as debug info. That's dev-only; the share page's own props are scrubbed. Verify the share
  page on a production build before relying on it for privacy.

## Next steps

- Run a real walkthrough end to end; tune `lib/prompts.ts` from what it misses.
- Stage hazards and run `npm run eval`; report only measured numbers.
- Check the funding results for the demo ZIP by hand (every link, every phone) before presenting.
- Stretch: deploy to Cloud Run (check the share page there: production build, no dev debug info).
