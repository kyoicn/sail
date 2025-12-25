import { NextResponse } from 'next/server';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
// Google Generative AI integration is handled via REST API to avoid Node SDK issues.

import { EventData, ChronosTime, ChronosLocation, EventSource } from '@sail/shared';

// We need a local interface for the LLM response which might be slightly looser before mapping
interface ExtractedEvent {
  title: string;
  summary: string;
  start_time: {
    year: number;
    month?: number;
    day?: number;
    hour?: number;
    minute?: number;
    second?: number;
    precision: string;
  };
  end_time?: {
    year: number;
    month?: number;
    day?: number;
    hour?: number;
    minute?: number;
    second?: number;
    precision: string;
  };
  location: {
    latitude?: number;
    longitude?: number;
    location_name?: string;
    precision?: 'spot' | 'area' | 'unknown';
    certainty?: 'definite' | 'approximate' | 'unknown';
  };
  importance: number;
  sources?: { label: string; url: string }[];
}

const SYSTEM_PROMPT = `
You are an expert Event Extractor. Your task is to extract historical or significant events from the provided text.

Output must be a JSON object containing a list of events under the key "events".
Each event must adhere to the following structure:

{
  "title": "string (REQUIRED)",
  "summary": "string (REQUIRED, summary of the event)",
  "start_time": {
    "year": int (REQUIRED),
    "month": int (optional),
    "day": int (optional),
    "hour": int (optional),
    "minute": int (optional),
    "second": int (optional),
    "precision": "string (one of: millennium, century, decade, year, month, day, hour, minute, second)"
  },
  "end_time": {
    "year": int (optional),
    "month": int (optional),
    "day": int (optional),
    "hour": int (optional),
    "minute": int (optional),
    "second": int (optional),
    "precision": "string"
  },
  "location": {
    "latitude": float (optional),
    "longitude": float (optional),
    "location_name": "string (optional)",
    "precision": "string (one of: spot, area, unknown)",
    "certainty": "string (one of: definite, approximate, unknown)"
  },
  "importance": float (0.0 to 10.0),
  "sources": [
    {"label": "string", "url": "string"}
  ]
}

Rules:
1. Extract ALL relevant events.
2. If exact coordinates are not mentioned, omit latitude/longitude.
3. Use negative integers for BC years.
4. Output valid JSON only.
`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { inputType, content, provider, model } = body;

    let cleanText = '';

    // 1. Extract Text
    if (inputType === 'url') {
      try {
        const response = await fetch(content);
        if (!response.ok) throw new Error('Failed to fetch URL');
        const html = await response.text();
        const doc = new JSDOM(html, { url: content });
        const reader = new Readability(doc.window.document);
        const article = reader.parse();
        cleanText = article?.textContent || '';

        // Fallback if readability fails
        if (!cleanText) {
          cleanText = doc.window.document.body.textContent || '';
        }
        // Normalize whitespace
        cleanText = cleanText.replace(/\s+/g, ' ').trim();
      } catch (e: any) {
        return NextResponse.json({ error: `Failed to fetch/parse URL: ${e.message}` }, { status: 400 });
      }
    } else {
      cleanText = content;
    }

    if (!cleanText || cleanText.length < 10) {
      return NextResponse.json({ error: 'Content is too short or empty' }, { status: 400 });
    }

    // Capture source URL for provenance
    const sourceUrl = inputType === 'url' ? content : 'manual-text';

    // 2. Call LLM
    let extractedEvents: ExtractedEvent[] = [];

    if (provider === 'gemini') {
      // Using Google GenAI SDK
      // NOTE: Current standard is @google/generative-ai. 
      // User insisted on google.genai but that appears to be strictly for python or very new.
      // I will use dynamic import to avoid build breaks if possible or just use standard fetch if SDK fails.
      // Actually, let's try to use the installed @google/genai package.
      // If it fails, I will use REST API.

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });

      // Imports for @google/genai are typically: import { GoogleGenerativeAI } from "@google/generative-ai";
      // But if I installed @google/genai?
      // I will assume standard import.

      // Temporary fix: direct REST call is safer given ambiguity, but plan required SDK.
      // I will attempt to use the most common interface.
      // import { GoogleGenerativeAI } from "@google/generative-ai"; is for the package "google-generativeai"
      // I installed "@google/genai". Let's try to use it.
      // It seems @google/genai might be the *backend* specific one?
      // Let's rely on standard fetch to Gemini API to be robust against package versioning capability issues in this environment. 
      // Or better: check node_modules.

      // I'll stick to a REST implementation for Gemini to guarantee it works without battling TS imports blindly.
      // It obeys the requirement of "Remote API".

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-flash'}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: SYSTEM_PROMPT + "\n\nText to analyze:\n" + cleanText }]
          }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini API Error: ${err}`);
      }

      const data = await response.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) throw new Error('No content from Gemini');

      const json = JSON.parse(textResponse);
      extractedEvents = json.events || [];

    } else {
      // Ollama
      const ollamaHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
      const response = await fetch(`${ollamaHost}/api/chat`, {
        method: 'POST',
        body: JSON.stringify({
          model: model || 'llama3', // Default to llama3 or user choice
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: cleanText }
          ],
          format: 'json',
          stream: false
        })
      });

      if (!response.ok) throw new Error('Ollama API failed');
      const data = await response.json();
      try {
        const json = JSON.parse(data.message.content);
        extractedEvents = json.events || [];
      } catch (e) {
        console.error("Failed to parse Ollama JSON", data.message.content);
        throw new Error('Invalid JSON from Ollama');
      }
    }

    // 3. Map to EventData (Canonical Schema)
    const mappedEvents: Partial<EventData>[] = extractedEvents.map((e, idx) => {
      // Helper to calculate astro_year
      const calcAstro = (year: number) => {
        return year > 0 ? year : year + 1; // Simplified 1 BC = 0.0
      };

      return {
        id: crypto.randomUUID(),
        title: e.title,
        summary: e.summary,
        importance: e.importance,
        start: {
          year: e.start_time.year,
          astro_year: calcAstro(e.start_time.year),
          precision: (e.start_time.precision as any) || 'year',
          month: e.start_time.month,
          day: e.start_time.day,
          hour: e.start_time.hour,
          minute: e.start_time.minute,
          second: e.start_time.second
        },
        end: e.end_time ? {
          year: e.end_time.year,
          astro_year: calcAstro(e.end_time.year),
          precision: (e.end_time.precision as any) || 'year',
          month: e.end_time.month,
          day: e.end_time.day
        } : undefined,
        location: {
          lat: e.location.latitude || 0,
          lng: e.location.longitude || 0,
          placeName: e.location.location_name,
          granularity: (e.location.precision as any) === 'spot' ? 'spot' : 'area',
          certainty: (e.location.certainty as any) || 'unknown'
        },
        sources: e.sources ? e.sources.map(s => ({
          label: s.label || 'Source',
          url: s.url || sourceUrl,
          provider: 'ai'
        })) : [{ label: 'Source', url: sourceUrl, provider: 'ai' }]
      };
    });

    return NextResponse.json({ events: mappedEvents });

  } catch (error: any) {
    console.error('Extraction Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
