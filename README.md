# Steady

Film a room. Steady finds fall hazards, explains each fix, estimates the cost with live
search results, and shows the fix installed in your own room with Gemini Omni Flash.

Built for DevFest Santa Cruz 2026.

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
| Gemini (Vertex AI) video understanding | Finds hazards in uploads and public YouTube videos, with timestamps and structured output |
| YouTube IFrame Player API | Embedded, seekable player for YouTube reports |
| Grounding with Google Search | Current price ranges with source links for each fix |
| Gemini Omni Flash | Edits an 8-second clip of the user's room to show the fix installed |
| Cloud Run | Hosting |

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
