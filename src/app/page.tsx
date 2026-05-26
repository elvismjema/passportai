'use client';

import { useState, useRef, useEffect } from 'react';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export default function Home() {
  const [chatOpen, setChatOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const greeted = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (chatOpen && !greeted.current) {
      greeted.current = true;
      sendToAPI([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen]);

  async function sendToAPI(history: Message[]) {
    setIsStreaming(true);
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

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

  async function handleSubmit(e?: React.SubmitEvent<HTMLFormElement>) {
    e?.preventDefault();
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
      handleSubmit();
    }
  }

  return (
    <div className="relative min-h-screen bg-[#0a0e1a] overflow-hidden flex items-center justify-center">

      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-30"
        style={{ backgroundImage: "url('/74213528_605.jpg')" }}
      />
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0e1a]/60 via-[#0a0e1a]/20 to-[#0a0e1a]/80" />

      {/* Landing content */}
      <div className="relative z-10 flex flex-col items-center gap-8">
        <h1 className="text-7xl font-black tracking-tight leading-none select-none">
          <span className="text-white">Passport</span>
          <span className="text-[#00D166]">AI</span>
        </h1>

        <button
          onClick={() => setChatOpen(true)}
          className="flex items-center gap-2.5 bg-[#00D166] text-black font-bold text-lg px-8 py-4 rounded-full shadow-lg hover:shadow-[0_0_24px_rgba(0,209,102,0.5)] hover:bg-[#00bf5e] transition-all duration-200 active:scale-95"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Let's Chat
        </button>
      </div>

      {/* Backdrop */}
      {chatOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20"
          onClick={() => { if (!isFullscreen) setChatOpen(false); }}
        />
      )}

      {/* Chat widget */}
      {chatOpen && (
        <div
          className={`fixed z-30 bg-[#0a0e1a] flex flex-col shadow-2xl transition-all duration-300 ${
            isFullscreen
              ? 'inset-0 rounded-none'
              : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] h-[640px] rounded-2xl'
          }`}
        >
          {/* Chat header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-[#0d1220] shrink-0 rounded-t-2xl">
            <div className="w-8 h-8 rounded-lg bg-[#00D166] flex items-center justify-center font-black text-black text-sm select-none">
              P
            </div>
            <div className="flex-1">
              <p className="font-bold text-white text-sm leading-none">PassportAI</p>
              <p className="text-xs text-white/40 mt-0.5">FIFA World Cup 2026</p>
            </div>
            {/* Fullscreen toggle */}
            <button
              onClick={() => setIsFullscreen((f) => !f)}
              className="text-white/40 hover:text-white transition-colors p-1"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
                </svg>
              )}
            </button>
            {/* Close */}
            <button
              onClick={() => { setChatOpen(false); setIsFullscreen(false); }}
              className="text-white/40 hover:text-white transition-colors p-1"
              aria-label="Close chat"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-white/20">
                  <div className="text-4xl mb-3">⚽</div>
                  <p className="text-xs">Starting your World Cup journey...</p>
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-md bg-[#00D166] flex items-center justify-center font-black text-black text-xs mr-2 mt-1 shrink-0">
                    P
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-[#00D166] text-black font-medium rounded-tr-sm'
                      : 'bg-[#131929] text-white/90 rounded-tl-sm border border-white/5'
                  }`}
                >
                  {msg.content}
                  {msg.role === 'assistant' && isStreaming && i === messages.length - 1 && (
                    <span className="inline-block w-0.5 h-3.5 bg-[#00D166] ml-0.5 animate-pulse align-middle" />
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-white/10 shrink-0">
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about visas, transport, hotels..."
                rows={1}
                disabled={isStreaming}
                className="flex-1 resize-none bg-[#131929] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00D166]/50 disabled:opacity-50 transition-colors min-h-[40px] max-h-[120px]"
                onInput={(e) => {
                  const t = e.currentTarget;
                  t.style.height = 'auto';
                  t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
                }}
              />
              <button
                type="submit"
                disabled={isStreaming || !input.trim()}
                className="shrink-0 w-10 h-10 rounded-xl bg-[#00D166] text-black flex items-center justify-center disabled:opacity-40 hover:bg-[#00bf5e] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
