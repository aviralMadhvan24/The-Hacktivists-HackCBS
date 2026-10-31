import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowUp, Brain, CheckCircle2, Mic, MicOff, Sparkles, Square, TriangleAlert, Volume2, VolumeX, Wrench } from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { useVoice, type VoiceLang } from '../lib/voice';
import type { OrbState } from '../components/Orb';
import { Button, Notice } from '../components/ui';
import { PageHeader } from '../App';

const Orb = lazy(() => import('../components/Orb'));

interface Msg { role: 'user' | 'assistant'; content: string; tools?: { tool: string; label: string; ok: boolean }[]; followUps?: string[]; error?: boolean; voice?: boolean }

const STARTERS = [
  'Agar meri naukri 6 mahine ke liye chali jaye to hum kitne mahine chal payenge?',
  'What happens if the market crashes 30% and Dadi needs a ₹2 lakh operation?',
  'Kya hum ₹9 lakh ki car abhi le sakte hain?',
  'Which of our goals should I keep in mind before investing?',
  'Hamara resilience score kaise badha sakte hain?',
];

const STATE_LABEL: Record<OrbState, string> = { idle: 'Tap the mic and ask anything', listening: 'Listening…', thinking: 'Checking your numbers…', speaking: 'Speaking' };

function readStored(k: string, d: string) { try { return localStorage.getItem(k) ?? d; } catch { return d; } }
function writeStored(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

function CssOrb({ state }: { state: OrbState }) {
  return <div className={`css-orb ${state}`} aria-hidden />;
}

export default function Assistant() {
  const { familyId, user, family } = useSession();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [lang, setLang] = useState<VoiceLang>(() => (readStored('fs.voiceLang', 'en-IN') as VoiceLang));
  const [voiceOn, setVoiceOn] = useState(() => readStored('fs.voiceReplies', '1') === '1');
  const [handsFree, setHandsFree] = useState(false);
  const [caption, setCaption] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const voice = useVoice();
  const webgl = useMemo(() => { try { const c = document.createElement('canvas'); return Boolean(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }, []);
  const consents = useQuery({ queryKey: ['consents'], queryFn: () => api.get<{ active: Record<string, boolean> }>('/me/consents') });
  const consented = Boolean(consents.data?.active.ai_analysis);

  useEffect(() => writeStored('fs.voiceLang', lang), [lang]);
  useEffect(() => writeStored('fs.voiceReplies', voiceOn ? '1' : '0'), [voiceOn]);

  const send = useMutation({
    mutationFn: ({ history }: { history: Msg[]; spoken: boolean }) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const limit = setTimeout(() => ctrl.abort(), 100000);
      return api.post<{ answer: string; followUps: string[]; toolsUsed: Msg['tools'] }>(`/families/${familyId}/assistant/chat`, {
        messages: history.filter((m) => !m.error).slice(-12).map(({ role, content }) => ({ role, content })),
      }, { signal: ctrl.signal }).finally(() => clearTimeout(limit));
    },
    onSuccess: async (r, vars) => {
      setMessages((m) => [...m, { role: 'assistant', content: r.answer, tools: r.toolsUsed, followUps: r.followUps }]);
      setCaption(r.answer);
      if (voiceOn && voice.support.speak) {
        await voice.speak(r.answer, lang);
        if (handsFree && vars.spoken) startListening();
      }
    },
    onError: (e) => {
      const busy = e instanceof ApiError && (e.status === 502 || e.status === 503) && /demand|unavailable|overloaded|busy|respond/i.test(e.message);
      const cancelled = e instanceof ApiError && e.code === 'ABORTED';
      const text = cancelled ? 'Stopped. Ask again whenever you like.' : busy ? 'The AI service is very busy right now. Please try again in a minute.' : errorMessage(e);
      setMessages((m) => [...m, { role: 'assistant', error: true, content: text }]);
      setCaption(text);
    },
  });

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, send.isPending]);
  useEffect(() => {
    if (!send.isPending) { setElapsed(0); return; }
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(id);
  }, [send.isPending]);
  const cancel = () => abortRef.current?.abort();
  const progress = elapsed < 5 ? 'Reading your records…' : elapsed < 18 ? 'Running the numbers…' : elapsed < 45 ? 'Writing the answer…' : 'Still working — the AI service is slow right now…';

  const ask = (text: string, spoken = false) => {
    const t = text.trim();
    if (!t || send.isPending) return;
    voice.stopSpeaking();
    const next: Msg[] = [...messages, { role: 'user', content: t, voice: spoken }];
    setMessages(next);
    setCaption('');
    setInput('');
    send.mutate({ history: next, spoken });
  };

  const startListening = async () => {
    if (!consented || send.isPending) return;
    const heard = await voice.listen(lang);
    if (heard) ask(heard, true);
  };

  const orbStateCalc: OrbState = voice.listening ? 'listening' : send.isPending ? 'thinking' : voice.speaking ? 'speaking' : 'idle';
  const orbState = orbStateCalc;
  const liveCaption = voice.listening ? (voice.interim || '…') : send.isPending ? (messages[messages.length - 1]?.content || '') : caption;
  const submit = (e: FormEvent) => { e.preventDefault(); ask(input); };

  return (
    <>
      <PageHeader title="Ask FinSight" />
      <div className="content">
        {consents.data && !consented && (
          <Notice tone="warn">To chat, turn on <strong>AI analysis of my finances</strong> in <Link to="/settings">Settings</Link>. FinSight then reads your family's numbers to answer.</Notice>
        )}
        <div className="ask-layout">
          {/* Voice stage */}
          <section className={`card stage stage-${orbState}`} aria-label="Voice assistant">
            <div className="stage-orb">
              {webgl ? (
                <Suspense fallback={<CssOrb state={orbState} />}>
                  <Orb state={orbState} levelRef={voice.levelRef} size={300} />
                </Suspense>
              ) : <CssOrb state={orbState} />}
            </div>
            <div className="stage-status" role="status">{send.isPending ? `${progress} ${elapsed}s` : STATE_LABEL[orbState]}</div>
            <p className={`stage-caption ${voice.listening ? 'live' : ''}`}>{liveCaption || `Namaste${user ? `, ${user.name.split(' ')[0]}` : ''}! Ask me about ${family?.name || 'your family'}'s money.`}</p>

            <div className="stage-controls">
              <button className={`mic-btn ${voice.listening ? 'on' : ''}`} onClick={() => (voice.listening ? voice.stopListening() : startListening())}
                disabled={!consented || !voice.support.listen || send.isPending} aria-pressed={voice.listening}
                aria-label={voice.listening ? 'Stop listening' : 'Speak to FinSight'}>
                {voice.listening ? <MicOff size={30} /> : <Mic size={30} />}
              </button>
              {voice.speaking && <button className="btn btn-secondary btn-sm" onClick={voice.stopSpeaking}><Square size={14} /> Stop</button>}
              {send.isPending && <button className="btn btn-secondary btn-sm" onClick={cancel}><Square size={14} /> Cancel</button>}
            </div>

            <div className="stage-options">
              <div className="tabs" role="radiogroup" aria-label="Voice language">
                <button role="radio" aria-checked={lang === 'en-IN'} className={`tab ${lang === 'en-IN' ? 'active' : ''}`} onClick={() => setLang('en-IN')}>English / Hinglish</button>
                <button role="radio" aria-checked={lang === 'hi-IN'} className={`tab ${lang === 'hi-IN' ? 'active' : ''}`} onClick={() => setLang('hi-IN')}>हिन्दी</button>
              </div>
              <label className="check small"><input type="checkbox" checked={voiceOn} onChange={(e) => { setVoiceOn(e.target.checked); if (!e.target.checked) voice.stopSpeaking(); }} /> {voiceOn ? <Volume2 size={15} /> : <VolumeX size={15} />} Speak replies</label>
              <label className="check small"><input type="checkbox" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} /> Hands-free (listen again after each reply)</label>
            </div>
            {!voice.support.listen && <p className="small muted center">Voice input works in Chrome or Edge. You can still type below.</p>}
            {voice.error && <p className="small center" style={{ color: 'var(--warn)' }}>{voice.error}</p>}
          </section>

          {/* Conversation */}
          <section className="card chat" aria-label="Conversation">
            <div className="chat-log" aria-live="polite">
              {messages.length === 0 && (
                <div className="chat-empty">
                  <span className="icon-disc lg ic-violet" style={{ width: 56, height: 56 }}><Sparkles size={26} /></span>
                  <h2>What would you like to know?</h2>
                  <p className="muted">I run real stress tests on your records, check decisions, and remember your family's goals. English, Hinglish or Hindi.</p>
                  <div className="chip-row" style={{ justifyContent: 'center' }}>
                    {STARTERS.map((s) => <button key={s} className="chip" onClick={() => ask(s)} disabled={!consented}>{s}</button>)}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`bubble-row ${m.role}`}>
                  {m.role === 'assistant' && <span className="icon-disc ic-violet avatar-dot">{m.error ? <TriangleAlert size={16} /> : <Sparkles size={16} />}</span>}
                  <div className={`bubble ${m.role} ${m.error ? 'error' : ''}`}>
                    {m.voice && <span className="small" style={{ opacity: 0.8 }}><Mic size={11} /> </span>}
                    {m.tools && m.tools.length > 0 && (
                      <div className="tool-trail">
                        {m.tools.map((t, k) => (
                          <span key={k} className={`tool-pill ${t.ok ? '' : 'bad'}`}>
                            {t.tool === 'search_family_memory' ? <Brain size={12} /> : t.ok ? <CheckCircle2 size={12} /> : <Wrench size={12} />} {t.label}
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                    {m.role === 'assistant' && !m.error && voice.support.speak && (
                      <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, paddingLeft: 0 }} onClick={() => { setCaption(m.content); voice.speak(m.content, lang); }}><Volume2 size={14} /> Listen</button>
                    )}
                    {m.followUps && m.followUps.length > 0 && i === messages.length - 1 && (
                      <div className="chip-row" style={{ marginTop: 10 }}>
                        {m.followUps.map((f) => <button key={f} className="chip" onClick={() => ask(f)}>{f}</button>)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {send.isPending && (
                <div className="bubble-row assistant">
                  <span className="icon-disc ic-violet avatar-dot"><Sparkles size={16} /></span>
                  <div className="bubble assistant"><span className="typing"><i /><i /><i /></span> <span className="muted small">{progress} <span className="num">{elapsed}s</span></span> <button className="btn btn-ghost btn-sm" onClick={cancel}>Cancel</button></div>
                </div>
              )}
              <div ref={endRef} />
            </div>
            <form className="chat-input" onSubmit={submit}>
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={consented ? 'Type a question… (e.g. Agar market 30% gire to?)' : 'Turn on AI consent in Settings to chat'}
                aria-label="Message FinSight" disabled={!consented} maxLength={2000} />
              <Button type="submit" disabled={!input.trim() || send.isPending || !consented} aria-label="Send"><ArrowUp size={18} /></Button>
            </form>
          </section>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>FinSight explains your own numbers using its engines and your family memory. It is not investment advice and never moves money. Voice runs in your browser.</p>
      </div>
    </>
  );
}
