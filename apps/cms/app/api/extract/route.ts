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
        const sourceUrl = inputType === 'url' ? content : (body.sourceUrl || 'manual-text');

        // 2. Call LLM with Chunking
        let extractedRawEvents: any[] = [];
        const tpmLimit = geminiLimiter.getTPMLimit(model);
        const charLimitPerChunk = tpmLimit > 0 ? Math.floor(tpmLimit * 4 * 0.7) : 32000; // 70% safety margin or 8k tokens default
        const overlapChars = 2000;

        const chunks: string[] = [];
        if (cleanText.length <= charLimitPerChunk) {
          chunks.push(cleanText);
        } else {
          sendLog(`Large document detected (${cleanText.length} characters). Splitting into chunks...`);
          let start = 0;
          while (start < cleanText.length) {
            let end = Math.min(start + charLimitPerChunk, cleanText.length);
            chunks.push(cleanText.substring(start, end));
            if (end >= cleanText.length) break;
            start = end - overlapChars;
            if (start < 0) start = 0; // Safety
          }
          sendLog(`Split into ${chunks.length} chunks with ${overlapChars} chars overlap.`);
        }

        // Helper to strip markdown code blocks
        const cleanJson = (text: string) => {
          return text.replace(/```json\n?|\n?```/g, '').trim();
        };

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const chunkLogPrefix = chunks.length > 1 ? `[Chunk ${i + 1}/${chunks.length}] ` : '';

          if (provider === 'gemini') {
            const apiKey = process.env.GOOGLE_API_KEY;
            if (!apiKey) throw new Error('GOOGLE_API_KEY not configured');

            const userContent = SYSTEM_PROMPT + "\n\nText to analyze:\n" + chunk;
            const inputTokens = geminiLimiter.estimateTokens(userContent);
            const expectedOutputTokens = 2000;
            const totalEstimatedTokens = inputTokens + expectedOutputTokens;

            const useStreaming = process.env.GEMINI_USE_STREAMING !== 'false';
            const endpoint = useStreaming ? 'streamGenerateContent' : 'generateContent';

            sendLog(`${chunkLogPrefix}Calling Gemini (${model}) [${useStreaming ? 'STREAMING' : 'STATIC'}] | ${geminiLimiter.getStatusString(totalEstimatedTokens, model)}...`);

            try {
              await geminiLimiter.acquire(totalEstimatedTokens, model);
            } catch (limitErr: any) {
              console.warn(`Skipping chunk due to rate limit: ${limitErr.message}`);
              sendLog(`${chunkLogPrefix}Skipped: Request too large for model limits.`);
              continue;
            }

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:${endpoint}?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [{ text: userContent }]
                }],
                generationConfig: {
                  ...(model && model.startsWith('gemma') ? {} : { responseMimeType: "application/json" })
                }
              })
            });

            if (!response.ok) {
              const err = await response.text();
              throw new Error(`Gemini API Error: ${err}`);
            }

            let textResponse = "";

            if (useStreaming) {
              // Handle streaming response
              const reader = response.body?.getReader();
              if (!reader) throw new Error("Failed to get response reader");

              const decoder = new TextDecoder();
              let partialChunk = "";

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                partialChunk += chunk;

                // Pulse to keep socket alive
                sendLog("...");
              }

              try {
                const streamData = JSON.parse(partialChunk);
                if (Array.isArray(streamData)) {
                  textResponse = streamData.map(d => d.candidates?.[0]?.content?.parts?.[0]?.text || "").join("");
                } else {
                  textResponse = streamData.candidates?.[0]?.content?.parts?.[0]?.text || "";
                }
              } catch (e) {
                console.warn("Failed to parse stream as single JSON, attempting fallback consolidation", e);
                textResponse = partialChunk;
              }
            } else {
              const data = await response.json();
              textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            }

            if (!textResponse) throw new Error('No content from Gemini');

            const json = JSON.parse(cleanJson(textResponse));
            const chunkEvents = json.events || [];
            extractedRawEvents.push(...chunkEvents);
            sendLog(`${chunkLogPrefix}Extracted ${chunkEvents.length} events.`);

          } else {
            // Ollama
            const OllamaHost = process.env.OLLAMA_HOST;
            sendLog(`${chunkLogPrefix}Calling Ollama (${model || 'default'})...`);
            const response = await fetch(`${OllamaHost}/api/chat`, {
              method: 'POST',
              body: JSON.stringify({
                model: model || 'deepseek-r1:8b',
                messages: [
                  { role: 'system', content: SYSTEM_PROMPT },
                  { role: 'user', content: chunk }
                ],
                format: 'json',
                stream: false
              })
            });

            if (!response.ok) throw new Error('Ollama API failed');
            const data = await response.json();
            const content = data.message.content;
            const json = JSON.parse(cleanJson(content));
            const chunkEvents = json.events || [];
            extractedRawEvents.push(...chunkEvents);
            sendLog(`${chunkLogPrefix}Extracted ${chunkEvents.length} events.`);
          }
        }

        // Deduplication
        let finalExtractedEvents = extractedRawEvents;
        if (chunks.length > 1) {
          sendLog(`Merging results from ${chunks.length} chunks...`);
          const seen = new Set<string>();
          finalExtractedEvents = [];

          for (const e of extractedRawEvents) {
            // Fuzzy key: title + year + location_name (if exists)
            const titlePart = (e.title || '').toLowerCase().trim();
            const yearPart = e.start_time?.year || 0;
            const locPart = (e.location?.location_name || e.location?.placeName || '').toLowerCase().trim();
            const key = `${titlePart}|${yearPart}|${locPart}`;

            if (titlePart && !seen.has(key)) {
              seen.add(key);
              finalExtractedEvents.push(e);
            }
          }
          sendLog(`Total extracted: ${extractedRawEvents.length} events. Deduplicated to ${finalExtractedEvents.length} unique events.`);
        }

        sendLog(`Mapping ${finalExtractedEvents.length} events to schema...`);

        // 3. Map to EventData (Canonical Schema) and fetch initial images
        const mappedEvents: Partial<EventData>[] = await Promise.all(finalExtractedEvents.map(async (eVal) => {
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
            source_id: ((sourceUrl !== 'manual-text' ? sourceUrl.replace(/https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_') : 'manual_input') + ':' + e.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')).replace(/_+/g, '_'),
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
              lat: e.location?.latitude || e.location?.lat || 0,
              lng: e.location?.longitude || e.location?.lng || 0,
              placeName: e.location?.location_name || e.location?.placeName || '',
              granularity: e.location?.precision || e.location?.granularity || 'spot',
              certainty: e.location?.certainty || 'unknown'
            },
            images: canonicalUrl ? [{ label: 'Primary Image', url: canonicalUrl }] : [],
            original_text_ref: e.original_text_ref
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
