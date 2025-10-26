"use client";

import { useEffect, useMemo, useRef, useState } from 'react';

type Provider = 'openai' | 'anthropic' | 'google' | 'mistral' | 'groq';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  provider?: Provider;
}

const PROVIDER_LABELS: Record<Provider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  mistral: 'Mistral',
  groq: 'Groq',
};

export default function Page() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [provider, setProvider] = useState<Provider>('openai');
  const [model, setModel] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const defaultModel = useMemo(() => {
    switch (provider) {
      case 'openai':
        return 'gpt-4o-mini';
      case 'anthropic':
        return 'claude-3-5-sonnet-latest';
      case 'google':
        return 'gemini-1.5-flash';
      case 'mistral':
        return 'mistral-small-latest';
      case 'groq':
        return 'llama-3.1-70b-versatile';
    }
  }, [provider]);

  useEffect(() => {
    setModel(defaultModel);
  }, [defaultModel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming) return;

    setError(null);
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          provider,
          model,
          messages: [...messages, userMessage].map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed: ${res.status}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      let assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        provider,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        assistantMessage = { ...assistantMessage, content: assistantMessage.content + chunk };
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = assistantMessage;
          return copy;
        });
      }
    } catch (err: any) {
      setError(err?.message || 'Unknown error');
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function onStop() {
    abortRef.current?.abort();
  }

  return (
    <main className="container">
      <header className="header">
        <h1>Agentic Multi-Provider AI Chat</h1>
        <div className="controls">
          <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
            {Object.entries(PROVIDER_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <input
            placeholder="Model (auto)"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </div>
      </header>

      <section className="chat">
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className="meta">
              <span className="role">{m.role}</span>
              {m.provider && <span className="provider">{PROVIDER_LABELS[m.provider]}</span>}
            </div>
            <div className="bubble">{m.content}</div>
          </div>
        ))}
        {error && <div className="error">{error}</div>}
        <div ref={bottomRef} />
      </section>

      <form onSubmit={onSubmit} className="composer">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything..."
          disabled={streaming}
        />
        <button type="submit" disabled={streaming || !input.trim()}>
          Send
        </button>
        <button type="button" onClick={onStop} disabled={!streaming}>
          Stop
        </button>
      </form>

      <footer className="footer">
        <a href="https://vercel.com/ai" target="_blank" rel="noreferrer">
          Vercel AI SDK
        </a>
      </footer>
    </main>
  );
}
