import { NextResponse } from 'next/server';
import { EventData } from '@sail/shared';

const SYSTEM_PROMPT_LOCATION = `
You are an expert Historical Geographer.
Your goal is to enrich the **LOCATION** information of a list of historical events based on context and your knowledge.

### INPUT DATA:
Input is a JSON list of events.

### CRITICAL SCHEMA RULES (READ CAREFULLY)
You must strictly adhere to the allowed values below. **Any value outside these lists makes the JSON invalid.**

**1. Location coordinates** (\`location.lat\`, \`location.lng\`)
   - ALLOWED VALUES: Decimal degrees (-90.0 to 90.0 for latitude, -180.0 to 180.0 for longitude)
   - Try your best to figure out the coordinates based on the location name aligned with the time period.

**2. Location Precision** (\`location.granularity\`)
   - ALLOWED VALUES: "spot", "area", "unknown"
   - *Note: "spot" = specific coordinate/building; "area" = city/region/country.*

**3. Location Certainty** (\`location.certainty\`)
   - ALLOWED VALUES: "definite", "approximate", "unknown"

### INSTRUCTIONS:
1. **Analyze:** Check if the event has missing location info (coordinates, name, precision, certainty).
2. **Enrich:** Use your internal knowledge and the source text to fill gaps.
3. **Validate:** Check \`granularity\` and \`certainty\` against allowed values.
4. **Output:** Return the list of events with updated location fields.

### RESPONSE FORMAT:
\`\`\`json
{
  "events": [
    { ...event with enriched location... }
  ]
}
\`\`\`
`;

const SYSTEM_PROMPT_TIME = `
You are an expert Historical Chronologist.
Your goal is to enrich the **TIME** information (start and end) of a list of historical events.

### INPUT DATA:
Input is a JSON list of events.

### CRITICAL SCHEMA RULES (READ CAREFULLY)
You must strictly adhere to the allowed values below. **Any value outside these lists makes the JSON invalid.**

**1. Time Precision** (\`start.precision\`, \`end.precision\`)
   - ALLOWED VALUES: "millennium", "century", "decade", "year", "month", "day", "hour", "minute", "second", "unknown"
   - *Note: Do NOT use "definite" or "exact" here.*

**2. Time Format**
   - For years in BCE/BC, use NEGATIVE integers (e.g. 1700 BCE -> -1700). For AD/CE, use positive integers.

### INSTRUCTIONS:
1. **Analyze:** Check \`start\` and \`end\`. Are fields like month/day/year missing?
2. **Enrich:** Use your internal knowledge and source text to fill gaps (e.g. finding exact dates).
3. **Validate:** Check \`precision\` against allowed values.
4. **Output:** Return the list of events with updated time fields.

### RESPONSE FORMAT:
\`\`\`json
{
  "events": [
     { ...event with enriched time... }
  ]
}
\`\`\`
`;

const SYSTEM_PROMPT_SUMMARY = `
You are an expert Historical Editor.
Your goal is to enrich the **SUMMARY** of a list of historical events.

### INPUT DATA:
Input is a JSON list of events.

### INSTRUCTIONS:
1. **Analyze:** Read the event title and context.
2. **Enrich:** Write a concise, engaging 1-3 sentence summary for the event. It should explain the significance.
3. **Output:** Return the list of events with updated summary field.

### RESPONSE FORMAT:
\`\`\`json
{
  "events": [
     { "id": "...", "summary": "..." }
  ]
}
\`\`\`
`;

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
            const timeData = JSON.parse(timeJsonStr);
            const timeEventsMap = new Map((timeData.events || []).map((e: any) => [e.id || e.title, e]));

            enrichedEvents = enrichedEvents.map(orig => {
              const fresh = timeEventsMap.get(orig.id) || timeEventsMap.get(orig.title);
              if (fresh) {
                const freshAny = fresh as any;
                return {
                  ...orig,
                  start: freshAny.start ? { ...orig.start, ...freshAny.start } : orig.start,
                  end: freshAny.end ? { ...orig.end, ...freshAny.end } : orig.end
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
            errorMessage += ` [cause]: ${String(error.cause)
              } `;
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
