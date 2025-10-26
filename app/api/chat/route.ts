import { NextRequest } from 'next/server';
import { StreamingTextResponse } from 'ai';
import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import { Mistral } from '@mistralai/mistralai';

export const runtime = 'edge';

function env(name: string, optional = false): string | undefined {
  const value = process.env[name];
  if (!value && !optional) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function textStreamFromReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const pump = async () => {
        const { value, done } = await reader.read();
        if (done) return controller.close();
        if (value) controller.enqueue(value);
        await pump();
      };
      await pump();
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const { provider, model, messages } = await req.json();

    if (!provider || !model || !Array.isArray(messages)) {
      return new Response('Invalid request body', { status: 400 });
    }

    switch (provider as string) {
      case 'openai': {
        const client = new OpenAI({ apiKey: env('OPENAI_API_KEY')! });
        const completion = await client.chat.completions.create({
          model,
          messages,
          stream: true,
        } as any);
        // @ts-ignore - sdk returns a web stream on edge
        return new StreamingTextResponse(completion.toReadableStream());
      }
      case 'anthropic': {
        const anthropic = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY')! });
        const stream = await anthropic.messages.create({
          model,
          max_tokens: 1024,
          messages,
          stream: true,
        } as any);
        // @ts-ignore - anthropic SDK provides a web stream
        const readable = await stream.toReadableStream();
        return new StreamingTextResponse(readable);
      }
      case 'google': {
        const genAI = new GoogleGenerativeAI(env('GOOGLE_GENERATIVE_AI_API_KEY')!);
        const modelClient = genAI.getGenerativeModel({ model });
        const result = await modelClient.generateContentStream({
          contents: [
            {
              role: 'user',
              parts: [{ text: messages.map((m: any) => `${m.role}: ${m.content}`).join('\n') }],
            },
          ],
        } as any);
        // google stream has an async iterable of text chunks
        const it = result.stream as AsyncIterable<any>;
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            for await (const chunk of it) {
              const text = chunk.text();
              controller.enqueue(encoder.encode(text));
            }
            controller.close();
          },
        });
        return new StreamingTextResponse(stream);
      }
      case 'groq': {
        const groq = new Groq({ apiKey: env('GROQ_API_KEY')! });
        const completion = await groq.chat.completions.create({
          model,
          messages,
          stream: true,
        } as any);
        // @ts-ignore
        return new StreamingTextResponse(completion.toReadableStream());
      }
      case 'mistral': {
        const apiKey = env('MISTRAL_API_KEY')!;
        const resp = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model, messages }),
        });
        if (!resp.ok) {
          const text = await resp.text();
          return new Response(text || 'Mistral API error', { status: resp.status });
        }
        const data = await resp.json();
        const text = data?.choices?.[0]?.message?.content ?? '';
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(text));
            controller.close();
          },
        });
        return new StreamingTextResponse(stream);
      }
      default:
        return new Response('Unsupported provider', { status: 400 });
    }
  } catch (err: any) {
    const msg = err?.message || 'Server error';
    return new Response(msg, { status: 500 });
  }
}
