import { NextResponse } from 'next/server';
import { EventData } from '@sail/shared';
import { geminiLimiter } from '@/lib/gemini-limiter';
import fs from 'fs';
import path from 'path';

const getPrompt = (fileName: string) => {
  try {
    return fs.readFileSync(path.join(process.cwd(), '../../prompts', fileName), 'utf-8');
  } catch (e) {
    console.error(`Failed to read ${fileName}`, e);
    return '';
  }
};

const SYSTEM_PROMPT_CLUSTERING = getPrompt('enrichment.clustering.md');

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
        const { events, provider, model } = body as {
          events: EventData[],
          provider: string,
          model?: string
        };

        if (!events || events.length === 0) {
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'result', relationships: [] }) + '\n'));
          controller.close();
          return;
        }

        sendLog(`Clustering ${events.length} events...`);

        const eventsContext = JSON.stringify(events.map(e => ({
          id: e.id,
          title: e.title,
          summary: e.summary,
          start: e.start,
          end: e.end,
          location: e.location
        })), null, 2);

        let relationships: { child_id: string, parent_id: string }[] = [];

        if (provider === 'gemini') {
          sendLog(`Calling Gemini (${model}) | ${geminiLimiter.getStatusString()}...`);
          const apiKey = process.env.GOOGLE_API_KEY;
          if (!apiKey) throw new Error('GOOGLE_API_KEY missing');

          const userContent = `Events to cluster:\n${eventsContext}`;
          const inputTokens = geminiLimiter.estimateTokens(SYSTEM_PROMPT_CLUSTERING + userContent);
          const expectedOutputTokens = 1000;
          await geminiLimiter.acquire(inputTokens + expectedOutputTokens);

          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [{ text: SYSTEM_PROMPT_CLUSTERING + "\n\n" + userContent }]
              }]
            })
          });

          if (!response.ok) {
            const err = await response.text();
            throw new Error(`Gemini API failed: ${err}`);
          }

          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) throw new Error('Empty response from Gemini');

          // Clean JSON
          const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || [null, text];
          const clusterData = JSON.parse(jsonMatch[1].trim());
          relationships = clusterData.relationships || [];
        } else {
          // Ollama...
          const ollamaHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
          const response = await fetch(`${ollamaHost}/api/chat`, {
            method: 'POST',
            body: JSON.stringify({
              model: model || 'llama3',
              messages: [
                { role: 'system', content: SYSTEM_PROMPT_CLUSTERING },
                { role: 'user', content: eventsContext }
              ],
              format: 'json',
              stream: false
            })
          });
          if (!response.ok) throw new Error('Ollama API failed');
          const data = await response.json();
          const clusterData = JSON.parse(data.message.content);
          relationships = clusterData.relationships || [];
        }

        sendLog(`Found ${relationships.length} relationships.`);
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'result', relationships }) + '\n'));
        controller.close();

      } catch (error: any) {
        console.error('Clustering Error:', error);
        sendError(error.message);
        controller.close();
      }
    }
  });

  return new NextResponse(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}
