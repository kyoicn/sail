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

      const sendThought = (message: string) => {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'thought', message }) + '\n'));
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
          const apiKey = process.env.GOOGLE_API_KEY;
          if (!apiKey) throw new Error('GOOGLE_API_KEY missing');

          const userContent = `Events to cluster:\n${eventsContext}`;
          const inputTokens = geminiLimiter.estimateTokens(SYSTEM_PROMPT_CLUSTERING + userContent);
          const expectedOutputTokens = 1000;
          await geminiLimiter.acquire(inputTokens + expectedOutputTokens, model);

          const useStreaming = process.env.GEMINI_USE_STREAMING !== 'false';
          const endpoint = useStreaming ? 'streamGenerateContent' : 'generateContent';

          sendLog(`Calling Gemini (${model}) [${useStreaming ? 'STREAMING' : 'STATIC'}] | ${geminiLimiter.getStatusString(0, model)}...`);

          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:${endpoint}?key=${apiKey}`, {
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

          let fullText = "";

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

              // Gemini streams JSON segments like [{...},{...}] or objects depending on the exact implementation
              // The most robust way is to detect if we have valid JSON objects or the start/end markers
              // For v1beta streamGenerateContent, it returns an array of Candidate objects over time.
              // However, since we want the text, we can try to parse out the text parts incrementally or wait for blocks.

              // Simplistic heartbeat to keep socket alive
              sendLog("...");
            }

            // For v1beta streamGenerateContent, the entire response is a JSON array of response objects
            try {
              const streamData = JSON.parse(partialChunk);
              if (Array.isArray(streamData)) {
                fullText = streamData.map(d => d.candidates?.[0]?.content?.parts?.[0]?.text || "").join("");
              } else {
                fullText = streamData.candidates?.[0]?.content?.parts?.[0]?.text || "";
              }
            } catch (e) {
              // If it's not a single valid JSON (sometimes it streams multiple objects without the array wrapper)
              // we might need to parse it line by line if Gemini uses that format
              console.warn("Failed to parse stream as single JSON, attempting fallback consolidation", e);
              fullText = partialChunk; // Fallback
            }
          } else {
            // Standard non-streaming
            const data = await response.json();
            fullText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
          }

          if (!fullText) throw new Error('Empty response from Gemini');

          // Extract thinking vs JSON
          const jsonMatch = fullText.match(/```json\n?([\s\S]*?)\n?```/);
          let jsonStr = "";
          let thought = "";

          if (jsonMatch) {
            jsonStr = jsonMatch[1].trim();
            thought = fullText.split('```json')[0].trim();
          } else {
            // Fallback: find first { and last }
            const first = fullText.indexOf('{');
            const last = fullText.lastIndexOf('}');
            if (first !== -1 && last !== -1) {
              jsonStr = fullText.substring(first, last + 1);
              thought = fullText.substring(0, first).trim();
            } else {
              jsonStr = fullText;
            }
          }

          // Clean up <think> tags if present
          const thinkMatch = thought.match(/<think>([\s\S]*?)<\/think>/i);
          if (thinkMatch) {
            thought = thinkMatch[1].trim();
          }

          if (thought) {
            sendThought(thought);
          }

          const clusterData = JSON.parse(jsonStr);
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
