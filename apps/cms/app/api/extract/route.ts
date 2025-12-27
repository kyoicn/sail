import { NextResponse } from 'next/server';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
// Google Generative AI integration is handled via REST API to avoid Node SDK issues.

import { EventData, ChronosTime, ChronosLocation, EventSource } from '@sail/shared';
import fs from 'fs';
import path from 'path';
import { getWikimediaSearchResults, constructWikimediaUrl, canonicalizeWikimediaUrl } from '@/lib/utils';
import { geminiLimiter } from '@/lib/gemini-limiter';

// We need a local interface for the LLM response which might be slightly looser before mapping

const getSystemPrompt = () => {
  try {
    const promptPath = path.join(process.cwd(), '../../prompts/extraction.system.md');
    return fs.readFileSync(promptPath, 'utf-8');
  } catch (e) {
    console.error('Failed to read system prompt:', e);
    // Fallback?
    throw new Error('System prompt missing');
  }
};
const SYSTEM_PROMPT = getSystemPrompt();

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
        let extractedEvents: any[] = [];
        sendLog(`Calling LLM (${provider} - ${model || 'default'})...`);

        // Helper to strip markdown code blocks
        const cleanJson = (text: string) => {
          return text.replace(/```json\n?|\n?```/g, '').trim();
        };

        if (provider === 'gemini') {
          sendLog(`Calling Gemini (${model}) | ${geminiLimiter.getStatusString()}...`);
          const apiKey = process.env.GOOGLE_API_KEY;
          if (!apiKey) {
            sendError('GOOGLE_API_KEY not configured');
            controller.close();
            return;
          }

          const userContent = SYSTEM_PROMPT + "\n\nText to analyze:\n" + cleanText;
          const inputTokens = geminiLimiter.estimateTokens(userContent);
          const expectedOutputTokens = 2000; // Extraction usually produces more data than enrichment
          const totalEstimatedTokens = inputTokens + expectedOutputTokens;

          await geminiLimiter.acquire(totalEstimatedTokens);

          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [{ text: userContent }]
              }],
              generationConfig: {
                // Gemma models don't support JSON mode yet, so rely on the prompt
                ...(model && model.startsWith('gemma') ? {} : { responseMimeType: "application/json" })
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

          sendLog(`Gemini Response:\n${textResponse}`);
          sendLog('Parsing LLM response...');
          const json = JSON.parse(cleanJson(textResponse));
          extractedEvents = json.events || [];

        } else {
          // Ollama
          const OllamaHost = process.env.OLLAMA_HOST;
          const response = await fetch(`${OllamaHost}/api/chat`, {
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
            const content = data.message.content;
            sendLog(`Ollama Response:\n${content}`);
            sendLog('Parsing LLM response...');
            const json = JSON.parse(cleanJson(content));
            extractedEvents = json.events || [];
          } catch (e) {
            console.error("Failed to parse Ollama JSON", data.message.content);
            throw new Error('Invalid JSON from Ollama');
          }
        }

        sendLog(`Extracted ${extractedEvents.length} events. Mapping to schema...`);

        // 3. Map to EventData (Canonical Schema) and fetch initial images
        const mappedEvents: Partial<EventData>[] = await Promise.all(extractedEvents.map(async (eVal) => {
          const e = eVal as any;

          // Initial search for image if not provided by LLM
          let imageUrl = e.imageUrl;
          if (!imageUrl && e.title) {
            const results = await getWikimediaSearchResults(e.title, 1);
            if (results.length > 0) {
              imageUrl = constructWikimediaUrl(results[0].filename);
            }
          }

          const canonicalUrl = imageUrl ? canonicalizeWikimediaUrl(imageUrl) : undefined;

          return {
            id: crypto.randomUUID(),
            title: e.title,
            source_id: ((inputType === 'url' ? content.replace(/https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_') : 'manual_input') + ':' + e.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')).replace(/_+/g, '_'),
            summary: e.summary,
            imageUrl: canonicalUrl,
            importance: e.importance,
            start: {
              year: e.start_time.year || 0,
              ...e.start_time,
              astro_year: e.start_time.year ? (e.start_time.year > 0 ? e.start_time.year : e.start_time.year + 1) : 0
            },
            end: e.end_time?.year ? {
              ...e.end_time,
              astro_year: e.end_time.year ? (e.end_time.year > 0 ? e.end_time.year : e.end_time.year + 1) : 0
            } : undefined,
            location: {
              lat: e.location.latitude || e.location.lat || 0, // prompt asks for latitude/longitude now, but keep back compat just in case
              lng: e.location.longitude || e.location.lng || 0,
              placeName: e.location.location_name || e.location.placeName, // prompt asks for location_name
              granularity: e.location.precision || e.location.granularity || 'spot', // prompt
              certainty: e.location?.certainty || 'unknown'
            },
            images: canonicalUrl ? [{ label: 'Primary Image', url: canonicalUrl }] : []
          };
        }));

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
