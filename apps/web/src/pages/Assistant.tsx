import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowUp, Brain, CheckCircle2, Sparkles, TriangleAlert, Wrench } from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { Button, Notice } from '../components/ui';
import { PageHeader } from '../App';

interface Msg { role: 'user' | 'assistant'; content: string; tools?: { tool: string; label: string; ok: boolean }[]; followUps?: string[]; error?: boolean }

const STARTERS = [
  'Agar meri naukri 6 mahine ke liye chali jaye to hum kitne mahine chal payenge?',
  'What happens to us if the market crashes 30% and Dadi needs a ₹2 lakh operation?',
  'Kya hum ₹9 lakh ki car abhi le sakte hain?',
  'Which of our goals or past decisions should I keep in mind before investing?',
  'Hamara resilience score kaise badha sakte hain?',
];

export default function Assistant() {
  const { familyId, user, family } = useSession();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const consents = useQuery({ queryKey: ['consents'], queryFn: () => api.get<{ active: Record<string, boolean> }>('/me/consents') });

  const send = useMutation({
    mutationFn: (history: Msg[]) => api.post<{ answer: string; followUps: string[]; toolsUsed: Msg['tools'] }>(`/families/${familyId}/assistant/chat`, {
      messages: history.filter((m) => !m.error).slice(-12).map(({ role, content }) => ({ role, content })),
    }),
    onSuccess: (r) => setMessages((m) => [...m, { role: 'assistant', content: r.answer, tools: r.toolsUsed, followUps: r.followUps }]),
    onError: (e) => {
      const busy = e instanceof ApiError && (e.status === 502 || e.status === 503) && /demand|unavailable|overloaded/i.test(e.message);
      setMessages((m) => [...m, { role: 'assistant', error: true, content: busy ? 'The AI service is very busy right now. Please try again in a minute.' : errorMessage(e) }]);
    },
  });

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, send.isPending]);

  const ask = (text: string) => {
    const t = text.trim();
    if (!t || send.isPending) return;
    const next: Msg[] = [...messages, { role: 'user', content: t }];
    setMessages(next);
    setInput('');
    send.mutate(next);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); ask(input); };
  const consented = consents.data?.active.ai_analysis;

  return (
    <>
      <PageHeader title="Ask FinSight" />
      <div className="content" style={{ maxWidth: 900 }}>
        {consents.data && !consented && (
          <Notice tone="warn">To chat, turn on <strong>AI analysis of my finances</strong> in <Link to="/settings">Settings</Link>. FinSight then reads your family's numbers to answer.</Notice>
        )}
        <div className="card chat">
          <div className="chat-log" aria-live="polite">
            {messages.length === 0 && (
              <div className="chat-empty">
                <span className="icon-disc lg ic-violet" style={{ width: 64, height: 64 }}><Sparkles size={30} /></span>
                <h2>Namaste{user ? `, ${user.name.split(' ')[0]}` : ''}! 👋</h2>
                <p className="muted">Ask anything about {family?.name || 'your family'}'s money, in English or Hinglish. I run real stress tests on your records and remember your family's goals.</p>
                <div className="chip-row" style={{ justifyContent: 'center' }}>
                  {STARTERS.map((s) => <button key={s} className="chip" onClick={() => ask(s)} disabled={!consented}>{s}</button>)}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`bubble-row ${m.role}`}>
                {m.role === 'assistant' && <span className="icon-disc ic-violet avatar-dot">{m.error ? <TriangleAlert size={16} /> : <Sparkles size={16} />}</span>}
                <div className={`bubble ${m.role} ${m.error ? 'error' : ''}`}>
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
                <div className="bubble assistant"><span className="typing"><i /><i /><i /></span> <span className="muted small">Checking your numbers…</span></div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <form className="chat-input" onSubmit={submit}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={consented ? 'Ask FinSight… (e.g. Agar market 30% gire to?)' : 'Turn on AI consent in Settings to chat'}
              aria-label="Message FinSight" disabled={!consented} maxLength={2000} />
            <Button type="submit" disabled={!input.trim() || send.isPending || !consented} aria-label="Send"><ArrowUp size={18} /></Button>
          </form>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>FinSight explains your own numbers using LiquidityOS engines and your family memory. It is not investment advice and never moves money.</p>
      </div>
    </>
  );
}
