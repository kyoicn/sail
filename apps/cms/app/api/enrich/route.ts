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

            // Dynamic Source Selection & Truncation
            const bufferTokens = 1000;

            // Priority:
            // 1. event.original_text_ref (The extracted sentence/paragraph - BEST)
            // 2. sourceText (The full document - needs truncation checks)

            // Extract the original_text_ref from the user context if possible
            // We need to parse userContent (which is JSON stringified event) back to object to check for Ref
            let specificRef = "";
            try {
              const parsedEvent = JSON.parse(userContent);
              if (Array.isArray(parsedEvent) && parsedEvent.length > 0 && parsedEvent[0].original_text_ref) {
                specificRef = parsedEvent[0].original_text_ref;
              }
            } catch (e) {
              // ignore parse error types
            }

            let effectiveSourceText = "";

            if (specificRef && specificRef.length > 10) {
              // Optimization: Use the specific reference!
              effectiveSourceText = specificRef;
              sendLog(`Using specific text reference (${specificRef.length} chars) for optimization.`);
            } else {
              if (!specificRef) {
                // Debug: why is it missing?
                // console.log("Missing original_text_ref in event:", userContent.substring(0, 100));
              }

              // Fallback behavior: Omit source text entirely if optimized ref is missing.
              // This avoids sending huge texts and causing rate limit issues for legacy events.
              effectiveSourceText = "[Source text omitted - Missing original_text_ref]";
              sendLog(`Warning: original_text_ref missing. Source text omitted.`);
            }

            const fullPrompt = systemPrompt + "\n\nSource Text:\n" + effectiveSourceText + "\n\nEvents to enrich:\n" + userContent;

            // Re-estimate
            const totalEstimatedTokens = geminiLimiter.estimateTokens(fullPrompt) + 1000;

            const useStreaming = process.env.GEMINI_USE_STREAMING !== 'false';
            const endpoint = useStreaming ? 'streamGenerateContent' : 'generateContent';

            sendLog(`Calling Gemini (${model}) [${useStreaming ? 'STREAMING' : 'STATIC'}] | ${geminiLimiter.getStatusString(totalEstimatedTokens, model)}...`);

            try {
              await geminiLimiter.acquire(totalEstimatedTokens, model);
            } catch (limitErr: any) {
              console.warn(`Skipping enrichment step due to rate limit: ${limitErr.message}`);
              sendLog(`Skipped step: Request still too large (${totalEstimatedTokens}).`);
              return "{}"; // Return empty JSON result to skip gracefully
            }

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:${endpoint}?key=${apiKey}`, {
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
            return cleanJson(textResponse);

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
