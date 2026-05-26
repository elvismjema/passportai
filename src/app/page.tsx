'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0) {
      sendToAPI([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendToAPI(history: Message[]) {
    setIsStreaming(true);

    const assistantMessage: Message = { role: 'assistant', content: '' };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: updated[updated.length - 1].content + chunk,
          };
          return updated;
        });
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: 'Something went wrong. Please try again.',
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const userMessage: Message = { role: 'user', content: trimmed };
    const history = [...messages, userMessage];

    setMessages(history);
    setInput('');

    await sendToAPI(history);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0e1a] text-white">
      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-4 border-b border-white/10 bg-[#0d1220]">
        <div className="w-9 h-9 rounded-lg bg-[#00D166] flex items-center justify-center font-black text-black text-lg select-none">
          P
        </div>
        <div>
          <h1 className="font-bold text-white text-lg leading-none">PassportAI</h1>
          <p className="text-xs text-white/40 mt-0.5">FIFA World Cup 2026 Travel Assistant</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#00D166] animate-pulse" />
          <span className="text-xs text-white/40">Online</span>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-white/20">
              <div className="text-5xl mb-4">⚽</div>
              <p className="text-sm">Starting your World Cup journey...</p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-md bg-[#00D166] flex items-center justify-center font-black text-black text-xs mr-2 mt-1 shrink-0">
                P
              </div>
            )}
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-[#00D166] text-black font-medium rounded-tr-sm'
                  : 'bg-[#131929] text-white/90 rounded-tl-sm border border-white/5'
              }`}
            >
              {msg.content}
              {msg.role === 'assistant' && isStreaming && i === messages.length - 1 && (
                <span className="inline-block w-0.5 h-4 bg-[#00D166] ml-0.5 animate-pulse align-middle" />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-6 pt-2 border-t border-white/10 bg-[#0d1220]">
        <form onSubmit={handleSubmit} className="flex items-end gap-3 max-w-3xl mx-auto">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about visas, transport, hotels, local tips..."
            rows={1}
            disabled={isStreaming}
            className="flex-1 resize-none bg-[#131929] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00D166]/50 focus:ring-1 focus:ring-[#00D166]/30 disabled:opacity-50 transition-colors min-h-[48px] max-h-[160px]"
            style={{ height: 'auto' }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = 'auto';
              t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
            }}
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="shrink-0 w-12 h-12 rounded-xl bg-[#00D166] text-black flex items-center justify-center font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#00bf5e] transition-colors"
            aria-label="Send"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
        <p className="text-center text-white/20 text-xs mt-3">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
