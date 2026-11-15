import { GoogleGenAI } from "@google/genai";

let vertex: GoogleGenAI | null = null;

/** Vertex AI client, billed to the project's linked billing account (the DevFest credit). */
export function vertexClient(): GoogleGenAI {
  if (!vertex) {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is not set. Copy .env.example to .env.local.");
    vertex = new GoogleGenAI({
      vertexai: true,
      project,
      location: process.env.GOOGLE_CLOUD_LOCATION || "global",
    });
  }
  return vertex;
}

/** Omni Flash client: an AI Studio key if provided, otherwise Vertex. */
export function omniClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key ? new GoogleGenAI({ apiKey: key, vertexai: false }) : vertexClient();
}

export const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL || "gemini-3.8-flash";
export const OMNI_MODEL = process.env.OMNI_MODEL || "gemini-omni-1.1-flash";

/** Pull the first JSON object out of a model reply (handles ```json fences). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in model reply");
  return JSON.parse(body.slice(start, end + 1));
}
