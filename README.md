# Agentic Multi-Provider AI Chat

A minimal Next.js app that lets you chat using multiple AI providers: OpenAI, Anthropic, Google Gemini, Mistral, and Groq.

## Environment Variables

Set any providers you plan to use:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `MISTRAL_API_KEY`
- `GROQ_API_KEY`

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy (Vercel)

```bash
vercel deploy --prod --yes --token $VERCEL_TOKEN --name agentic-ed3c15b7
```
