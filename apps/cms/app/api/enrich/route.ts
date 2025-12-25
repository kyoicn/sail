import { NextResponse } from 'next/server';
import { EventData } from '@sail/shared';

const SYSTEM_PROMPT_ENRICH = `
You are an expert Historical Geographer.
Your goal is to enrich the LOCATION and TIME information of the provided historical events.

Input: JSON list of events.
Output: JSON list of enriched events.

Rules:
1. Improve COORDINATES (latitude, longitude) for locations.
2. Improve TIME PRECISION (e.g. if only year is known, keeps year; if exact date found, add month/day).
3. Do NOT change the Title or Meaning.
4. Output valid JSON under key "events".
5. Use "precision" fields correctly (spot/area for location; year/month/day etc for time).
`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { events, provider, model } = body as { events: EventData[], provider: string, model?: string };

    if (!events || events.length === 0) {
      return NextResponse.json({ events: [] });
    }

    // Prepare prompt
    const context = JSON.stringify(events.map(e => ({
      title: e.title,
      start_time: e.start,
      location: e.location
    })), null, 2);

    let enrichedEvents = events;

    // Call LLM ( Simplified logic: just one pass for MVP)
    if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY missing');

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-flash'}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: SYSTEM_PROMPT_ENRICH + "\n\nEvents to enrich:\n" + context }]
          }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      if (!response.ok) throw new Error('Gemini API failed');
      const data = await response.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) throw new Error('No content from Gemini');
      const json = JSON.parse(textResponse);

      // Merge strategy: Update location/time if present in response
      const newEventsObj = json.events || [];
      enrichedEvents = events.map((orig, i) => {
        const fresh = newEventsObj.find((f: any) => f.title === orig.title) || newEventsObj[i]; // Try match by title or index
        if (!fresh) return orig;

        // Merge Logic
        return {
          ...orig,
          // Update Start Time if better
          start: fresh.start_time ? { ...orig.start, ...fresh.start_time } : orig.start,
          location: fresh.location ? { ...orig.location, ...fresh.location } : orig.location
        };
      });

    } else {
      // Ollama
      const ollamaHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
      const response = await fetch(`${ollamaHost}/api/chat`, {
        method: 'POST',
        body: JSON.stringify({
          model: model || 'llama3',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT_ENRICH },
            { role: 'user', content: context }
          ],
          format: 'json',
          stream: false
        })
      });

      if (!response.ok) throw new Error('Ollama API failed');
      const data = await response.json();
      const json = JSON.parse(data.message.content);

      const newEventsObj = json.events || [];
      enrichedEvents = events.map((orig, i) => {
        const fresh = newEventsObj.find((f: any) => f.title === orig.title) || newEventsObj[i];
        if (!fresh) return orig;
        return {
          ...orig,
          start: fresh.start_time ? { ...orig.start, ...fresh.start_time } : orig.start,
          location: fresh.location ? { ...orig.location, ...fresh.location } : orig.location
        };
      });
    }

    return NextResponse.json({ events: enrichedEvents });

  } catch (error: any) {
    console.error('Enrichment Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
