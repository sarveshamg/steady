# Steady — DevFest Santa Cruz 2026

Steady helps older adults stay safely in their homes. A family member films a short
walkthrough of a room; Steady finds fall hazards and access barriers, explains each one,
recommends a fix with a grounded price range, and shows the fix installed in *their own room*
using a Gemini Omni Flash video edit.

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

## Architecture

```
app/page.tsx                 upload / record
app/api/youtube              create a report from a public YouTube link (analysis only)
app/api/upload               save + compress (ffmpeg-static, 720p, no audio, ≤60 s)
app/api/analyze              Gemini video understanding + response schema → hazards
app/api/price                Gemini + Google Search grounding → price range, sources, verified product links
app/api/visualize            trim 8 s around hazard → Omni Flash edit (GET = budget)
app/api/video/[id], clip/…   mp4 streaming with Range support (timeline seeking)
app/report/[id]              ReportView: player, hazard timeline, list, detail, before/after
lib/                         schema, prompts, analyze, price, omni, ffmpeg, storage, genai
scripts/eval.ts              recall / extra-findings eval on labelled real walkthroughs
data/                        uploads, results JSON, clips (gitignored)
```

## Facts verified against Google docs (Nov 2026)

- Omni Flash uses the **Interactions API** (`ai.interactions.create`), model
  `gemini-omni-1.1-flash` (1.2 is newer; check Model Garden). Edits of uploaded videos accept
  clips **≤10 s**, and won't edit videos with recognizable people.
- Product links (lib/shopping.ts): only allowlisted US retailers; kept only if the URL matches a grounded
  search result or passes a live page check (404 = invented). Retailer search links are always shown as fallback.
- Omni Flash does not accept YouTube sources. Never download YouTube videos (ToS); YouTube reports skip before/after.
- Outputs over ~4 MB may come back as a URI instead of inline data; `lib/omni.ts` handles both.
- Model IDs and Vertex availability change: verify before the demo, override via env vars.

## Next steps

- Run a real walkthrough end to end; tune `lib/prompts.ts` from what it misses.
- Stage hazards and run `npm run eval`; report only measured numbers.
- Stretch: Google Maps Places for nearby aging-in-place contractors on "pro" fixes;
  Firebase share link for family; deploy to Cloud Run.
