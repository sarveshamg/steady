# Steady

Film a room. Steady finds fall hazards, explains each fix, estimates the cost with live
search results, and shows the fix installed in your own room with Gemini Omni Flash.

Built for DevFest Santa Cruz 2026.

## The problem

Older adults often can't afford home repairs, and figuring out what to fix, who to call and how to
pay is overwhelming. Steady turns one video into **one simple plan**:

1. **Do today, free:** move the cord, clear the path.
2. **Under $50, do it yourself:** with a price range and store links.
3. **Get help with:** the bigger jobs, each paired with a verified local program that can help pay for it
   (or do it for you), plus a nearby business, and one big "Call for help" button for the local Area Agency
   on Aging.

The plan can be read aloud in English, Spanish, Vietnamese, Chinese, Tagalog or Korean, and shared with
family as a read-only link.

## Run it (Mac)

```bash
cd ~/Documents/Steady
npm install
cp .env.example .env.local
gcloud auth application-default login     # once; uses the DevFest credit project
npm run dev
```

Open http://localhost:3000 and upload a 20–45 second walkthrough.

## YouTube links

Paste a public YouTube link on the home page. Gemini analyzes the video by URL (first 5 minutes),
and the report embeds the YouTube player with the same clickable hazard timeline. Before/after
views are disabled for YouTube: Omni Flash doesn't accept YouTube sources, and downloading
YouTube videos would break YouTube's terms. If Vertex rejects YouTube URLs in your project, set
`GEMINI_API_KEY` and Steady retries through the Gemini API.

## Google services used

| Service | What it does in Steady |
|---|---|
| Gemini video understanding + structured output (Vertex AI) | Finds hazards in uploads and public YouTube videos, with timestamps, evidence and a Zod-validated response schema |
| Gemini multi-pass verification | A second, independent pass re-watches the video and must confirm each finding; unconfirmed findings are dropped |
| Gemini frame-level image checks | Real frames around each timestamp (ffmpeg) are checked so the frame shown is the one that proves the finding |
| Grounding with Google Search | Current price ranges and verified product links for each fix, and local **assistance programs** (each URL checked against search results or a live page; phones and "free" claims kept only if the program's page shows them) |
| Places API (New) | Geocodes the home once and finds independent local businesses within 25 miles for each pro fix |
| Gemini Omni Flash | Edits an 8-second clip of the user's room to show the fix installed (before/after) |
| Gemini TTS | Reads the Simple plan aloud in 6 languages (calm "Kore" voice, captions on screen) |
| YouTube IFrame Player API | Embedded, seekable player for YouTube reports |
| Cloud Run | Hosting |

## Configuration

In `.env.local` (see `.env.example`). Never commit keys.

- `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`: Vertex AI via Application Default Credentials.
- `GOOGLE_MAPS_API_KEY`: Places API (New) for local help and a street-free city/ZIP label.
- `GEMINI_API_KEY` (optional): YouTube links, and the TTS fallback if the TTS model isn't on Vertex.
- `TTS_MODEL` (optional): defaults to `gemini-3.8-flash-tts`.

## Privacy

The ZIP code or address is used only to search for help nearby. Prompts and the shared plan page use the
city/ZIP only, never a street address. The shared page shows no video.

## Generating the "after" clips (costs money)

Omni Flash is off by default. To make demo clips:

1. Set `ENABLE_OMNI=true` in `.env.local` and restart `npm run dev`.
2. Click "Show this room with the fix" on the hazards you want in the demo.
3. Set `ENABLE_OMNI=false` again. Clips are cached in `data/clips/` and reused.

The app stops after `OMNI_MAX_CALLS` (default 10). Film rooms with **no people in the shot**:
Omni Flash won't edit videos of recognizable people.

If Vertex returns an error for Omni Flash, create an API key in Google AI Studio for the
`steady-devfest` project and set `GEMINI_API_KEY` in `.env.local`.

## Eval on real walkthroughs

1. Stage hazards in a room (rug at a doorway, cord across a path, dark hallway, no bath mat).
2. Film 20–45 s clips into `eval/` with no people in them.
3. Copy `eval/labels.example.csv` to `eval/labels.csv`: one row per staged hazard.
4. `npm run eval` prints how many staged hazards were caught and how many extra findings appeared.

## Demo safety net

Every analysis is saved in `data/results/`. Re-opening `/report/<id>` loads it instantly
with no API calls, so run the demo video through once before presenting.
