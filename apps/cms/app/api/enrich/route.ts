import { NextResponse } from 'next/server';
import { EventData } from '@sail/shared';
import { geminiLimiter } from '@/lib/gemini-limiter';
import fs from 'fs';
import path from 'path';
import { getWikimediaSearchResults, constructWikimediaUrl, canonicalizeWikimediaUrl } from '@/lib/utils';

const getPrompt = (fileName: string) => {
  try {
    return fs.readFileSync(path.join(process.cwd(), '../../prompts', fileName), 'utf-8');
  } catch (e) {
    console.error(`Failed to read ${fileName}`, e);
    return '';
  }
};

const SYSTEM_PROMPT_LOCATION = getPrompt('enrichment.location.md');
const SYSTEM_PROMPT_TIME = getPrompt('enrichment.time.md');
const SYSTEM_PROMPT_SUMMARY = getPrompt('enrichment.summary.md');
const SYSTEM_PROMPT_IMAGE = getPrompt('enrichment.image.md');

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendLog = (message: string) => {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'log', message }) + '\n'));
      };

      const sendError = (message: string) => {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', message }) + '\n'));
      };

      try {
        const body = await request.json();
        const { events, provider, model, context: sourceText, fields } = body as {
          events: EventData[],
          provider: string,
          model?: string,
          context?: string,
          fields?: string[]
        };

        if (!events || events.length === 0) {
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'result', events: [] }) + '\n'));
          controller.close();
          return;
        }

        // Prepare context
        const eventsContext = JSON.stringify(events.map(e => ({
          id: e.id,
          title: e.title,
          start: e.start,
          end: e.end,
          location: e.location
        })), null, 2);

        let enrichedEvents = [...events];

        // Helper to strip markdown code blocks
        // Helper to strip markdown code blocks and extract JSON
        const cleanJson = (text: string) => {
          // First try to find a markdown block
          const markdownMatch = text.match(/```json\n?([\s\S]*?)\n?```/);
          if (markdownMatch && markdownMatch[1]) {
            return markdownMatch[1].trim();
          }

          // Fallback: find the first '{' and the last '}'
          const firstOpen = text.indexOf('{');
          const lastClose = text.lastIndexOf('}');
          if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
            return text.substring(firstOpen, lastClose + 1);
          }

          return text.trim();
        };

        // Generic LLM Call Helper
        const callLLM = async (systemPrompt: string, userContent: string) => {
          if (provider === 'gemini') {
            const apiKey = process.env.GOOGLE_API_KEY;
            if (!apiKey) throw new Error('GOOGLE_API_KEY missing');

            const fullPrompt = systemPrompt + "\n\nSource Text:\n" + (sourceText || "No source text provided") + "\n\nEvents to enrich:\n" + userContent;

            // Estimate tokens (input + baseline for output)
            const inputTokens = geminiLimiter.estimateTokens(fullPrompt);
            const expectedOutputTokens = 1000; // Conservative baseline for a rich response
            const totalEstimatedTokens = inputTokens + expectedOutputTokens;

            sendLog(`Calling Gemini (${model}) | ${geminiLimiter.getStatusString(totalEstimatedTokens, model)}...`);
            await geminiLimiter.acquire(totalEstimatedTokens, model);

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [{ text: fullPrompt }]
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

            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error('No content from Gemini');
            return cleanJson(text);

          } else {
            // Ollama
            const ollamaHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
            const response = await fetch(`${ollamaHost}/api/chat`, {
              method: 'POST',
              body: JSON.stringify({
                model: model || 'llama3',
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: `Source Text:\n${sourceText || "No source text provided"}\n\nEvents to enrich:\n${userContent}` }
                ],
                format: 'json',
                stream: false
              })
            });

            if (!response.ok) throw new Error('Ollama API failed');
            const data = await response.json();
            return cleanJson(data.message.content);
          }
        };

        // --- SEQUENTIAL EVENT-BY-EVENT ENRICHMENT ---
        for (let i = 0; i < enrichedEvents.length; i++) {
          let event = enrichedEvents[i];
          sendLog(`\nEnriching Event ${i + 1}/${enrichedEvents.length}: "${event.title}"`);

          const singleEventContext = JSON.stringify([{
            id: event.id,
            title: event.title,
            start: event.start,
            end: event.end,
            location: event.location
          }], null, 2);

          // 1. Summary Enrichment
          if (!fields || fields.includes('summary')) {
            try {
              sendLog(`  [${event.title}] Stage: Summary`);
              const summaryContext = JSON.stringify([{
                id: event.id,
                title: event.title,
                current_summary: event.summary,
              }], null, 2);

              const summaryJsonStr = await callLLM(SYSTEM_PROMPT_SUMMARY, summaryContext);
              const summaryData = JSON.parse(summaryJsonStr);
              const fresh = (summaryData.events || [])[0];
              if (fresh && fresh.summary) {
                event.summary = fresh.summary;
              }
            } catch (e: any) {
              console.error(`Summary enrichment failed for ${event.title}:`, e);
              sendLog(`  [${event.title}] Summary failed: ${e.message}`);
            }
          }

          // 2. Time Enrichment
          if (!fields || fields.includes('time')) {
            try {
              sendLog(`  [${event.title}] Stage: Time`);
              const timeJsonStr = await callLLM(SYSTEM_PROMPT_TIME, singleEventContext);
              const timeData = JSON.parse(timeJsonStr);
              const fresh = (timeData.events || [])[0];
              if (fresh) {
                const mergedStart = fresh.start ? { ...event.start, ...fresh.start } : event.start;
                let mergedEnd = fresh.end ? { ...event.end, ...fresh.end } : event.end;

                if (mergedEnd &&
                  mergedStart.year === mergedEnd.year &&
                  mergedStart.month === mergedEnd.month &&
                  mergedStart.day === mergedEnd.day &&
                  mergedStart.hour === mergedEnd.hour &&
                  mergedStart.minute === mergedEnd.minute &&
                  mergedStart.second === mergedEnd.second) {
                  mergedEnd = undefined;
                }
                event.start = mergedStart;
                event.end = mergedEnd;
              }
            } catch (e: any) {
              console.error(`Time enrichment failed for ${event.title}:`, e);
              sendLog(`  [${event.title}] Time failed: ${e.message}`);
            }
          }

          // 3. Location Enrichment
          if (!fields || fields.includes('location')) {
            try {
              sendLog(`  [${event.title}] Stage: Location`);
              const locationJsonStr = await callLLM(SYSTEM_PROMPT_LOCATION, singleEventContext);
              const locationData = JSON.parse(locationJsonStr);
              const fresh = (locationData.events || [])[0];
              if (fresh && fresh.location) {
                event.location = { ...event.location, ...fresh.location };
              }
            } catch (e: any) {
              console.error(`Location enrichment failed for ${event.title}:`, e);
              sendLog(`  [${event.title}] Location failed: ${e.message}`);
            }
          }

          // 4. Image Enrichment
          if (!fields || fields.includes('image')) {
            try {
              sendLog(`  [${event.title}] Stage: Images (Wikimedia Discovery)`);
              const searchResults = await getWikimediaSearchResults(event.title, 12);

              if (searchResults.length > 0) {
                sendLog(`  [${event.title}] Found ${searchResults.length} search results. Selecting...`);
                const resultsContext = JSON.stringify(searchResults, null, 2);
                const eventContext = JSON.stringify({
                  title: event.title,
                  summary: event.summary,
                  id: event.id
                });

                const specificPrompt = SYSTEM_PROMPT_IMAGE
                  .replace('{event_json}', eventContext)
                  .replace('{search_results}', resultsContext);

                const selectionJsonStr = await callLLM(specificPrompt, "Select images from results.");
                const selectionData = JSON.parse(selectionJsonStr);
                const selectedImages = selectionData.selected_images || [];

                if (selectedImages.length > 0) {
                  const existingImages = event.images || [];
                  const seenUrls = new Set<string>();

                  // Deduplicate against existing images AND the primary imageUrl
                  if (event.imageUrl) seenUrls.add(canonicalizeWikimediaUrl(event.imageUrl));
                  existingImages.forEach(img => seenUrls.add(canonicalizeWikimediaUrl(img.url)));

                  const combined = [...existingImages];

                  for (const sel of selectedImages) {
                    const url = canonicalizeWikimediaUrl(constructWikimediaUrl(sel.filename));
                    if (url && !seenUrls.has(url)) {
                      combined.push({ label: sel.label, url });
                      seenUrls.add(url);
                    }
                  }
                  event.images = combined;
                  // Ensure current imageUrl is also canonical if it exists
                  if (event.imageUrl) event.imageUrl = canonicalizeWikimediaUrl(event.imageUrl);
                  event.imageUrl = event.imageUrl || (combined.length > 0 ? combined[0].url : undefined);

                  sendLog(`  [${event.title}] Added ${combined.length - existingImages.length} new images.`);
                }
              } else {
                sendLog(`  [${event.title}] No Wikimedia images found.`);
              }
            } catch (e: any) {
              console.error(`Image enrichment failed for ${event.title}:`, e);
              sendLog(`  [${event.title}] Images failed: ${e.message}`);
            }
          }

          enrichedEvents[i] = event;
        }

        // Send final result
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'result', events: enrichedEvents }) + '\n'));
        controller.close();

      } catch (error: any) {
        console.error('Enrichment Error Stack:', error);

        let errorMessage = error.message || 'Unknown error';
        if (error.cause) {
          try {
            const causeStr = error.cause instanceof Error ? error.cause.toString() : JSON.stringify(error.cause);
            errorMessage += ` [cause]: ${causeStr}`;
          } catch (e) {
            errorMessage += ` [cause]: ${String(error.cause)} `;
          }
        }

        sendError(errorMessage);
        controller.close();
      }
    }
  });

  return new NextResponse(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}
