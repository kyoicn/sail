import { NextResponse } from 'next/server';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
// Google Generative AI integration is handled via REST API to avoid Node SDK issues.

import { EventData, ChronosTime, ChronosLocation, EventSource, EventCore } from '@sail/shared';

// We need a local interface for the LLM response which might be slightly looser before mapping

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
    "precision": "string (one of: millennium, century, decade, year, month, day, hour, minute, second, unknown)"
  },
  "end_time": {
    "year": int (optional),
    "month": int (optional),
    "day": int (optional),
    "hour": int (optional),
    "minute": int (optional),
    "second": int (optional),
    "precision": "string (one of: millennium, century, decade, year, month, day, hour, minute, second, unknown)"
  },
  "location": {
    "lat": float (optional, latitude),
    "lng": float (optional, longitude),
    "placeName": "string (optional)",
    "granularity": "string (one of: spot, area, unknown)",
    "certainty": "string (one of: definite, approximate, unknown)"
  },
}

Rules:
1. Extract ALL relevant events.
2. If exact coordinates are not mentioned, omit lat/lng.
3. Use negative integers for BC years.
4. Output valid JSON only.
`;

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendLog = (message: string) => {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'log', message }) + '\n'));
      };

      const sendResult = (events: any[]) => {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'result', events }) + '\n'));
      };

      const sendError = (message: string) => {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', message }) + '\n'));
      };

      try {
        const body = await request.json();
        const { inputType, content, provider, model } = body;

        let cleanText = '';

        // 1. Extract Text
        if (inputType === 'url') {
          sendLog(`Fetching URL: ${content}...`);
          try {
            const response = await fetch(content);
            if (!response.ok) throw new Error('Failed to fetch URL');
            const html = await response.text();

            sendLog('Parsing content...');
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
            sendLog(`Extracted ${cleanText.length} characters.`);
          } catch (e: any) {
            sendError(`Failed to fetch/parse URL: ${e.message}`);
            controller.close();
            return;
          }
        } else {
          cleanText = content;
          sendLog(`Processing raw text (${cleanText.length} characters)...`);
        }

        if (!cleanText || cleanText.length < 10) {
          sendError('Content is too short or empty');
          controller.close();
          return;
        }

        // Log the cleaned text as requested
        sendLog(`Cleaned Text Preview:\n${cleanText.substring(0, 500)}${cleanText.length > 500 ? '...' : ''}`);

        // Capture source URL for provenance
        const sourceUrl = inputType === 'url' ? content : 'manual-text';

        // 2. Call LLM
        let extractedEvents: EventCore[] = [];
        sendLog(`Calling LLM (${provider} - ${model || 'default'})...`);

        if (provider === 'gemini') {
          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            sendError('GEMINI_API_KEY not configured');
            controller.close();
            return;
          }

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

          sendLog('Parsing LLM response...');
          const json = JSON.parse(textResponse);
          extractedEvents = json.events || [];

        } else {
          // Ollama
          const ollamaHost = process.env.OLLAMA_HOST;
          const response = await fetch(`${ollamaHost}/api/chat`, {
            method: 'POST',
            body: JSON.stringify({
              model: model || 'deepseek-r1:8b',
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
            sendLog('Parsing LLM response...');
            const json = JSON.parse(data.message.content);
            extractedEvents = json.events || [];
          } catch (e) {
            console.error("Failed to parse Ollama JSON", data.message.content);
            throw new Error('Invalid JSON from Ollama');
          }
        }

        sendLog(`Extracted ${extractedEvents.length} events. Mapping to schema...`);

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
            imageUrl: e.imageUrl,
            importance: e.importance,
            start: {
              year: e.start_time.year || 0, // Default to 0 if missing (should be required by prompt)
              ...e.start_time,
              astro_year: calcAstro(e.start_time.year || 0),
              // Ensure precision is valid if LLM hallucinates
              precision: e.start_time.precision as any || 'year',
              millisecond: 0
            },
            end: e.end_time ? {
              year: e.end_time.year || 0,
              ...e.end_time,
              astro_year: calcAstro(e.end_time.year || 0),
              precision: e.end_time.precision as any || 'year',
              millisecond: 0
            } : undefined,
            location: {
              lat: e.location.lat || 0,
              lng: e.location.lng || 0,
              placeName: e.location.placeName,
              granularity: e.location.granularity || 'spot', // Updated Prompt outputs granularity
              certainty: e.location.certainty || 'unknown'
            },
            sources: e.sources ? e.sources.map(s => ({
              label: s.label || 'Source',
              url: s.url || sourceUrl,
              provider: 'ai'
            })) : [{ label: 'Source', url: sourceUrl, provider: 'ai' }]
          };
        });

        sendResult(mappedEvents);
        sendLog('Done.');
        controller.close();

      } catch (error: any) {
        console.error('Extraction Error Stack:', error);

        // Construct detailed error message
        let errorMessage = error.message || 'Unknown error';
        if (error.cause) {
          try {
            const causeStr = error.cause instanceof Error ? error.cause.toString() : JSON.stringify(error.cause);
            errorMessage += ` [cause]: ${causeStr}`;
          } catch (e) {
            errorMessage += ` [cause]: ${String(error.cause)}`;
          }
        }

        console.log('Sending error to client:', errorMessage);
        try {
          sendError(errorMessage);
        } catch (sendErr) {
          console.error('Failed to send error to client:', sendErr);
        }
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' }
  });
}
