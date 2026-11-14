/**
 * Hazard-detection eval on real walkthroughs with staged hazards.
 *
 *   npm run eval            (uses ./eval)
 *
 * eval/labels.csv columns: clip,category,timestamp_s
 * One row per staged hazard. A prediction counts as a catch if it has the same category
 * and is within MATCH_WINDOW_S seconds of the label. Never calls Omni Flash.
 */
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { compress } from "../lib/ffmpeg";
import { analyzeVideo } from "../lib/analyze";

const MATCH_WINDOW_S = 5;
const PAUSE_MS = 4000;

type Label = { clip: string; category: string; timestamp_s: number };

async function main() {
  const dir = path.resolve(process.argv[2] || "eval");
  const csv = await fs.readFile(path.join(dir, "labels.csv"), "utf8");
  const labels: Label[] = csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [clip, category, t] = line.split(",").map((s) => s.trim());
      return { clip, category, timestamp_s: Number(t) };
    });

  const clips = [...new Set(labels.map((l) => l.clip))];
  let staged = 0, caught = 0, falseAlarms = 0;
  const rows: string[] = [];

  for (const clip of clips) {
    const tmp = path.join(os.tmpdir(), `steady-eval-${path.basename(clip)}.mp4`);
    await compress(path.join(dir, clip), tmp);
    const { hazards } = await analyzeVideo(tmp);
    const truth = labels.filter((l) => l.clip === clip);
    const used = new Set<string>();
    let clipCaught = 0;
    for (const l of truth) {
      const match = hazards.find(
        (h) => !used.has(h.id) && h.category === l.category && Math.abs(h.timestamp_s - l.timestamp_s) <= MATCH_WINDOW_S,
      );
      if (match) {
        used.add(match.id);
        clipCaught++;
      }
    }
    const extra = hazards.length - used.size;
    staged += truth.length;
    caught += clipCaught;
    falseAlarms += extra;
    rows.push(`${clip.padEnd(28)} caught ${clipCaught}/${truth.length}   extra findings ${extra}`);
    console.log(rows.at(-1));
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }

  console.log("\n================ Steady eval ================");
  console.log(`Clips:                 ${clips.length}`);
  console.log(`Staged hazards caught: ${caught}/${staged} (recall ${staged ? ((caught / staged) * 100).toFixed(0) : 0}%)`);
  console.log(`Extra findings:        ${falseAlarms} (${clips.length ? (falseAlarms / clips.length).toFixed(1) : 0} per clip)`);
  console.log("Extra findings are not always wrong: review them, real unplanned hazards count too.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
