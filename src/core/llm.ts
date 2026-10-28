import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { GoogleGenAI } from "@google/genai";

const MODEL = process.env.MODEL_NAME ?? "gemini-3.5-flash-lite";
const MIN_GAP_MS = 4200; // stays under 15 requests/minute
const MAX_RETRIES = 3;

let client: GoogleGenAI | null = null;
let lastCall = 0;

function getClient(): GoogleGenAI {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY is not set. Add it to your .env file.");
  }
  client ??= new GoogleGenAI({ apiKey: process.env.API_KEY });
  return client;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  const wait = lastCall + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
}

export async function askModel(opts: {
  system: string;
  prompt: string;
  image?: { data: Buffer; mimeType: string };
  json?: boolean;
}): Promise<string> {
  const parts: any[] = [];

  if (opts.image) {
    parts.push({
      inlineData: {
        mimeType: opts.image.mimeType,
        data: opts.image.data.toString("base64"),
      },
    });
  }
  parts.push({ text: opts.prompt });

  for (let attempt = 0; ; attempt++) {
    try {
      await throttle();
      const res = await getClient().models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: opts.system,
          temperature: 0,
          ...(opts.json ? { responseMimeType: "application/json" } : {}),
        },
      });
      if (!res.text) throw new Error("Empty response from model");
      return res.text;
    } catch (e) {
      if (attempt >= MAX_RETRIES) throw e;
      await sleep(5000 * (attempt + 1)); // 5s, 10s, 15s
    }
  }
}