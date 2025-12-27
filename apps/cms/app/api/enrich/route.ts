import { NextResponse } from 'next/server';
import { EventData } from '@sail/shared';
import fs from 'fs';
import path from 'path';
import { getWikimediaSearchResults, constructWikimediaUrl } from '@/lib/utils';

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
          sendLog(`Using API: ${provider.toUpperCase()} | Model: ${model}`);
          if (provider === 'gemini') {
            const apiKey = process.env.GOOGLE_API_KEY;
            if (!apiKey) throw new Error('GOOGLE_API_KEY missing');

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [{ text: systemPrompt + "\n\nSource Text:\n" + (sourceText || "No source text provided") + "\n\nEvents to enrich:\n" + userContent }]
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

        // --- STAGE 1: LOCATION ENRICHMENT ---
        if (!fields || fields.includes('location')) {
          try {
            sendLog('Enriching Locations...');
            const locationJsonStr = await callLLM(SYSTEM_PROMPT_LOCATION, eventsContext);
            sendLog(`Raw Location Response: ${locationJsonStr}`);
            const locationData = JSON.parse(locationJsonStr);
            const locationEventsMap = new Map((locationData.events || []).map((e: any) => [e.id || e.title, e]));

            enrichedEvents = enrichedEvents.map(orig => {
              const fresh = locationEventsMap.get(orig.id) || locationEventsMap.get(orig.title);
              const freshAny = fresh as any;
              if (freshAny && freshAny.location) {
                return { ...orig, location: { ...orig.location, ...freshAny.location } };
              }
              return orig;
            });
            sendLog('Location enrichment complete.');
          } catch (e: any) {
            console.error('Location enrichment failed:', e);
            sendLog(`Location enrichment failed: ${e.message}`);
          }
        }

        // --- STAGE 2: TIME ENRICHMENT ---
        if (!fields || fields.includes('time')) {
          try {
            sendLog('Enriching Time...');
            const timeJsonStr = await callLLM(SYSTEM_PROMPT_TIME, eventsContext);
            sendLog(`Raw Time Response: ${timeJsonStr}`);
            const timeData = JSON.parse(timeJsonStr);
            const timeEventsMap = new Map((timeData.events || []).map((e: any) => [e.id || e.title, e]));

            enrichedEvents = enrichedEvents.map(orig => {
              const fresh = timeEventsMap.get(orig.id) || timeEventsMap.get(orig.title);
              if (fresh) {
                const freshAny = fresh as any;
                const mergedStart = freshAny.start ? { ...orig.start, ...freshAny.start } : orig.start;
                let mergedEnd = freshAny.end ? { ...orig.end, ...freshAny.end } : orig.end;

                // Compare start and end to see if identical
                if (mergedEnd &&
                  mergedStart.year === mergedEnd.year &&
                  mergedStart.month === mergedEnd.month &&
                  mergedStart.day === mergedEnd.day &&
                  mergedStart.hour === mergedEnd.hour &&
                  mergedStart.minute === mergedEnd.minute &&
                  mergedStart.second === mergedEnd.second) {
                  mergedEnd = undefined;
                }

                return {
                  ...orig,
                  start: mergedStart,
                  end: mergedEnd
                };
              }
              return orig;
            });
            sendLog('Time enrichment complete.');
          } catch (e: any) {
            console.error('Time enrichment failed:', e);
            sendLog(`Time enrichment failed: ${e.message}`);
          }
        }

        // --- STAGE 3: SUMMARY ENRICHMENT ---
        if (!fields || fields.includes('summary')) {
          try {
            sendLog('Enriching Summary...');
            // Minify context for summary generation to save tokens, only need title/current summary
            const summaryContext = JSON.stringify(events.map(e => ({
              id: e.id,
              title: e.title,
              current_summary: e.summary,
            })), null, 2);

            const summaryJsonStr = await callLLM(SYSTEM_PROMPT_SUMMARY, summaryContext);
            sendLog(`Raw Summary Response: ${summaryJsonStr}`);
            const summaryData = JSON.parse(summaryJsonStr);
            const summaryEventsMap = new Map((summaryData.events || []).map((e: any) => [e.id || e.title, e]));

            enrichedEvents = enrichedEvents.map(orig => {
              const fresh = summaryEventsMap.get(orig.id) || summaryEventsMap.get(orig.title);
              if (fresh) {
                const freshAny = fresh as any;
                return {
                  ...orig,
                  summary: freshAny.summary || orig.summary
                };
              }
              return orig;
            });
            sendLog('Summary enrichment complete.');
          } catch (e: any) {
            console.error('Summary enrichment failed:', e);
            sendLog(`Summary enrichment failed: ${e.message}`);
          }
        }

        // --- STAGE 4: IMAGE ENRICHMENT ---
        if (!fields || fields.includes('image')) {
          try {
            sendLog('Finding Images via Wikimedia API...');

            // Image enrichment is now done per-event to provide specific search results
            for (let i = 0; i < enrichedEvents.length; i++) {
              const event = enrichedEvents[i];
              sendLog(`Searching images for: "${event.title}"...`);

              const searchResults = await getWikimediaSearchResults(event.title, 12);
              if (searchResults.length === 0) {
                sendLog(`No Wikimedia results found for "${event.title}".`);
                continue;
              }

              sendLog(`Found ${searchResults.length} results. Asking LLM to select...`);

              const resultsContext = JSON.stringify(searchResults, null, 2);
              const eventContext = JSON.stringify({
                title: event.title,
                summary: event.summary,
                id: event.id
              });

              // Construct prompt with research results
              const specificPrompt = SYSTEM_PROMPT_IMAGE
                .replace('{event_json}', eventContext)
                .replace('{search_results}', resultsContext);

              // callLLM expects (systemPrompt, userContent)
              // We've baked the content into the system prompt effectively, but we'll follow the signature.
              const selectionJsonStr = await callLLM(specificPrompt, "Please select images from the provided search results.");
              sendLog(`Raw selection for "${event.title}": ${selectionJsonStr}`);

              const selectionData = JSON.parse(selectionJsonStr);
              const selectedImages = selectionData.selected_images || [];

              if (selectedImages.length > 0) {
                const existingImages = event.images || [];
                const seenUrls = new Set(existingImages.map(img => img.url));
                const combined = [...existingImages];

                for (const sel of selectedImages) {
                  const url = constructWikimediaUrl(sel.filename);
                  if (url && !seenUrls.has(url)) {
                    combined.push({ label: sel.label, url });
                    seenUrls.add(url);
                  }
                }

                enrichedEvents[i] = {
                  ...event,
                  images: combined,
                  imageUrl: event.imageUrl || (combined.length > 0 ? combined[0].url : undefined)
                };
                sendLog(`Added ${selectedImages.length} images to "${event.title}".`);
              }
            }
            sendLog('Image enrichment complete.');
          } catch (e: any) {
            console.error('Image enrichment failed:', e);
            sendLog(`Image enrichment failed: ${e.message}`);
          }
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
