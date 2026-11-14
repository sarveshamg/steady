import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { Report } from "./schema";

export const DATA_DIR = process.env.STEADY_DATA_DIR || path.join(process.cwd(), "data");
export const UPLOADS = path.join(DATA_DIR, "uploads");
export const RESULTS = path.join(DATA_DIR, "results");
export const CLIPS = path.join(DATA_DIR, "clips");

export async function ensureDirs() {
  await Promise.all([UPLOADS, RESULTS, CLIPS].map((d) => fs.mkdir(d, { recursive: true })));
}

export function newId() {
  return crypto.randomBytes(6).toString("hex");
}

// Ids and file names come from URLs, so reject anything that could escape the folder.
export function safeName(name: string) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(name) || name.includes("..")) {
    throw new Error("Invalid name");
  }
  return name;
}

export const videoPath = (id: string) => path.join(UPLOADS, `${safeName(id)}.mp4`);
export const reportPath = (id: string) => path.join(RESULTS, `${safeName(id)}.json`);

export async function readReport(id: string): Promise<Report | null> {
  try {
    const raw = await fs.readFile(reportPath(id), "utf8");
    return Report.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writeReport(report: Report) {
  await ensureDirs();
  await fs.writeFile(reportPath(report.id), JSON.stringify(report, null, 2));
}

export async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
