'use client';

import { useState, useRef, useEffect } from 'react';
import type { TripProfile } from '@/types';
import { supabase } from '@/lib/supabase';

type Message = { role: 'user' | 'assistant'; content: string };

type NdjsonEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string; input: { field: string; value: unknown } }
  | { type: 'error'; message: string };

export default function Home() {
  // Chat UI state
  const [chatOpen, setChatOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // Trip memory
  const [tripProfile, setTripProfile] = useState<TripProfile>({});
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);

  // Profile modal
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // Refs — keep latest values accessible in async closures
  const bottomRef = useRef<HTMLDivElement>(null);
  const greeted = useRef(false);
  const locationRequested = useRef(false);
  const tripProfileRef = useRef<TripProfile>({});
  const locationGrantedRef = useRef<boolean | null>(null);

  // ─── Sync refs immediately when state changes ───────────────────────────
  useEffect(() => { locationGrantedRef.current = locationGranted; }, [locationGranted]);

  // ─── Load profile from Supabase on mount ────────────────────────────────
  useEffect(() => {
    const profileId = localStorage.getItem('passportai_profile_id');
    if (!profileId || !supabase) return;
    supabase
      .from('profiles')
      .select('name')
      .eq('id', profileId)
      .single()
      .then(({ data, error }) => {
        if (!error && data?.name) updateTripProfileField('name', data.name);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Auto-scroll ─────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── When chat opens: geolocation + first-visit check ───────────────────
  useEffect(() => {
    if (!chatOpen || greeted.current) return;

    // Request location once per session
    if (!locationRequested.current) {
      locationRequested.current = true;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setLocationGranted(true);
          locationGrantedRef.current = true;
          updateTripProfileField('lat', lat);
          updateTripProfileField('lng', lng);
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
            );
            const data = await res.json();
            const city =
              data.address?.city ||
              data.address?.town ||
              data.address?.village ||
              data.address?.county ||
              '';
            if (city) updateTripProfileField('currentCity', city);
          } catch { /* geocoding failed — non-critical */ }
        },
        () => {
          setLocationGranted(false);
          locationGrantedRef.current = false;
        }
      );
    }

    // First visit → show profile modal; return visit → greet immediately
    const profileId = localStorage.getItem('passportai_profile_id');
    if (!profileId) {
      setProfileModalOpen(true);
    } else {
      triggerGreeting();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen]);

  // ─── Core functions ──────────────────────────────────────────────────────

  function triggerGreeting() {
    if (greeted.current) return;
    greeted.current = true;
    sendToAPI([], tripProfileRef.current, locationGrantedRef.current);
  }

  function updateTripProfileField(field: string, value: unknown) {
    setTripProfile((prev) => {
      let next: TripProfile;
      if (field === 'matches') {
        const existing = prev.matches ?? [];
        next = {
          ...prev,
          matches: [...existing, value as NonNullable<TripProfile['matches']>[number]],
        };
      } else {
        next = { ...prev, [field]: value };
      }
      tripProfileRef.current = next; // keep ref in sync immediately
      return next;
    });
  }

  async function sendToAPI(
    history: Message[],
    profile: TripProfile = tripProfileRef.current,
    locGranted: boolean | null = locationGrantedRef.current
  ) {
    setIsStreaming(true);
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, tripProfile: profile, locationGranted: locGranted }),
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as NdjsonEvent;
            if (event.type === 'text') {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: updated[updated.length - 1].content + event.delta,
                };
                return updated;
              });
            } else if (event.type === 'tool' && event.name === 'updateTripProfile') {
              // Silent memory update — no visible message
              updateTripProfileField(event.input.field, event.input.value);
            }
          } catch { /* ignore malformed NDJSON */ }
        }
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
    const history = [...messages, { role: 'user' as const, content: trimmed }];
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

  async function handleSaveProfile() {
    if (!profileName.trim()) return;
    setProfileSaving(true);
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('profiles')
          .insert({ name: profileName.trim(), phone: profilePhone.trim() || null })
          .select('id')
          .single();
        if (!error && data) {
          localStorage.setItem('passportai_profile_id', data.id);
        }
      }
      updateTripProfileField('name', profileName.trim());
    } catch { /* Supabase not yet configured — proceed anyway */ } finally {
      setProfileSaving(false);
      setProfileModalOpen(false);
      triggerGreeting();
    }
  }

  function handleSkipProfile() {
    setProfileModalOpen(false);
    triggerGreeting();
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen bg-[#0a0e1a] overflow-hidden flex items-center justify-center">

      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-30"
        style={{ backgroundImage: "url('/74213528_605.jpg')" }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0e1a]/60 via-[#0a0e1a]/20 to-[#0a0e1a]/80" />

      {/* Landing */}
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
          Let&apos;s Chat
        </button>
      </div>

      {/* Backdrop */}
      {chatOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20"
          onClick={() => { if (!isFullscreen && !profileModalOpen) setChatOpen(false); }}
        />
      )}

      {/* Chat widget */}
      {chatOpen && (
        <div className={`fixed z-30 bg-[#0a0e1a] flex flex-col shadow-2xl transition-all duration-300 ${
          isFullscreen
            ? 'inset-0 rounded-none'
            : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] h-[640px] rounded-2xl'
        }`}>

          {/* Header */}
          <div className={`flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-[#0d1220] shrink-0 ${isFullscreen ? '' : 'rounded-t-2xl'}`}>
            <div className="w-8 h-8 rounded-lg bg-[#00D166] flex items-center justify-center font-black text-black text-sm select-none">P</div>
            <div className="flex-1">
              <p className="font-bold text-white text-sm leading-none">PassportAI</p>
              <p className="text-xs text-white/40 mt-0.5">FIFA World Cup 2026</p>
            </div>

            {/* Profile icon */}
            <button onClick={() => setProfileModalOpen(true)} className="text-white/40 hover:text-white transition-colors p-1" aria-label="Profile">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            </button>

            {/* Fullscreen toggle */}
            <button onClick={() => setIsFullscreen((f) => !f)} className="text-white/40 hover:text-white transition-colors p-1" aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
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
            <button onClick={() => { setChatOpen(false); setIsFullscreen(false); }} className="text-white/40 hover:text-white transition-colors p-1" aria-label="Close">
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
                  <div className="w-6 h-6 rounded-md bg-[#00D166] flex items-center justify-center font-black text-black text-xs mr-2 mt-1 shrink-0">P</div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-[#00D166] text-black font-medium rounded-tr-sm'
                    : 'bg-[#131929] text-white/90 rounded-tl-sm border border-white/5'
                }`}>
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

      {/* Profile modal */}
      {profileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative z-10 bg-[#0d1220] rounded-2xl p-6 w-[340px] shadow-2xl border border-white/10">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-bold text-white text-base">Your Profile</h2>
                <p className="text-xs text-white/40 mt-0.5">Personalise your experience</p>
              </div>
              <button onClick={handleSkipProfile} className="text-white/30 hover:text-white/60 transition-colors text-xs">
                Skip
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Your name</label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveProfile(); }}
                  placeholder="e.g. Elvis"
                  autoFocus
                  className="w-full bg-[#131929] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#00D166]/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5">
                  Phone <span className="text-white/25">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={profilePhone}
                  onChange={(e) => setProfilePhone(e.target.value)}
                  placeholder="+1 555 000 0000"
                  className="w-full bg-[#131929] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#00D166]/50 transition-colors"
                />
              </div>
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={!profileName.trim() || profileSaving}
              className="mt-5 w-full bg-[#00D166] text-black font-bold text-sm py-3 rounded-xl disabled:opacity-40 hover:bg-[#00bf5e] transition-colors"
            >
              {profileSaving ? 'Saving...' : 'Save & Continue'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
