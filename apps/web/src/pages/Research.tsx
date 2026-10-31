import { Fragment, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, HelpCircle, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { dateTime } from '../lib/format';
import { Badge, Button, Card, Empty, Field, Loading, Notice, Tabs } from '../components/ui';
import { PageHeader } from '../App';

const CLASS_TONE: Record<string, 'good' | 'bad' | 'neutral' | 'warn'> = { positiveDevelopment: 'good', risk: 'bad', neutralInformation: 'neutral', uncertainty: 'warn' };
const CLASS_LABEL: Record<string, string> = { positiveDevelopment: 'Positive', risk: 'Risk', neutralInformation: 'Neutral', uncertainty: 'Uncertain' };

export default function Research() {
  const [tab, setTab] = useState<'analyses' | 'find' | 'upload'>('analyses');
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="Company research" />
      <div className="content stack">
        <Tabs value={tab} onChange={(t) => { setTab(t); setOpenId(null); }} options={[
          { value: 'analyses', label: 'Concall analyses' }, { value: 'find', label: 'Find transcripts' }, { value: 'upload', label: 'Upload a transcript' },
        ]} />
        {tab === 'analyses' && (openId ? <AnalysisDetail id={openId} onBack={() => setOpenId(null)} /> : <AnalysisList onOpen={setOpenId} />)}
        {tab === 'find' && <Find onOpen={(id) => { setTab('analyses'); setOpenId(id); }} />}
        {tab === 'upload' && <Upload onOpen={(id) => { setTab('analyses'); setOpenId(id); }} />}
      </div>
    </>
  );
}

function AnalysisList({ onOpen }: { onOpen: (id: string) => void }) {
  const q = useQuery({ queryKey: ['concalls'], queryFn: () => api.get<{ history: any[] }>('/concall/history').then((r) => r.history) });
  if (q.isLoading) return <Loading />;
  if (!q.data?.length) return <Card><Empty title="No analyses yet">Find a transcript on a company's investor-relations page, or upload one. Every quote is checked against the transcript.</Empty></Card>;
  return (
    <Card pad={false}>
      <div className="table-wrap"><table>
        <thead><tr><th>Company</th><th>Quarter</th><th>Findings</th><th>Quotes verified</th><th>Analysed</th></tr></thead>
        <tbody>{q.data.map((a) => (
          <tr key={a.id}>
            <td><button className="btn btn-ghost btn-sm" onClick={() => onOpen(a.id)}>{a.company} ({a.ticker})</button></td>
            <td>{a.quarter} {a.fiscalYear}</td>
            <td><Badge tone="bad">{a.risksCount} risks</Badge> <Badge tone="good">{a.positivesCount} positive</Badge></td>
            <td>{a.quoteVerification ? `${a.quoteVerification.verified}/${a.quoteVerification.total}` : '—'}</td>
            <td className="small">{dateTime(a.createdAt)}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </Card>
  );
}

function Quote({ text, verified }: { text: string; verified?: boolean }) {
  return (
    <blockquote style={{ margin: '6px 0', padding: '6px 10px', borderLeft: `3px solid ${verified ? 'var(--good)' : 'var(--warn)'}`, background: 'var(--surface-2)' }}>
      <span className="small">“{text}”</span>{' '}
      {verified ? <Badge tone="good"><CheckCircle2 size={11} /> Verbatim</Badge> : <Badge tone="warn"><HelpCircle size={11} /> Not found in transcript — AI paraphrase</Badge>}
    </blockquote>
  );
}

function AnalysisDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { familyId } = useSession();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['concall', id], queryFn: () => api.get<{ analysis: any; meta: any }>(`/concall/${id}`) });
  const del = useMutation({ mutationFn: () => api.del(`/concall/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['concalls'] }); onBack(); } });
  const remember = useMutation({
    mutationFn: () => api.post(`/families/${familyId}/context`, {
      kind: 'company_research', title: `${q.data!.meta.company} ${q.data!.meta.quarter} ${q.data!.meta.fiscalYear} concall`,
      body: `${q.data!.analysis.executiveSummary} Guidance: ${q.data!.analysis.growthAndGuidance?.growthGuidance || 'not stated'}. (AI summary of the transcript.)`.slice(0, 3900),
      sources: [{ label: q.data!.meta.source || 'Concall transcript', ...(q.data!.meta.sourceUrl ? { url: q.data!.meta.sourceUrl } : {}), at: String(q.data!.meta.createdAt).slice(0, 40) }],
      related: { type: 'concall', id },
    }),
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <Notice tone="bad">{errorMessage(q.error)}</Notice>;
  const a = q.data!.analysis; const m = q.data!.meta;
  return (
    <div className="stack">
      <div className="row-between">
        <Button variant="ghost" size="sm" onClick={onBack}>← All analyses</Button>
        <span className="row">
          <Button size="sm" variant="secondary" onClick={() => remember.mutate()} loading={remember.isPending} disabled={remember.isSuccess}>{remember.isSuccess ? 'Saved to family memory' : 'Save summary to family memory'}</Button>
          <Button size="sm" variant="ghost" onClick={() => confirm('Delete this analysis?') && del.mutate()}><Trash2 size={14} /> Delete</Button>
        </span>
      </div>
      {remember.error && <Notice tone="bad">{errorMessage(remember.error)}</Notice>}
      <Card title={`${m.company} (${m.ticker}) · ${m.quarter} ${m.fiscalYear}`} subtitle={<>{m.source}{/^https?:\/\//i.test(m.sourceUrl || '') && <> · <a href={m.sourceUrl} target="_blank" rel="noopener noreferrer">Source <ExternalLink size={11} /></a></>} · analysed {dateTime(m.createdAt)}</>}>
        <Notice tone="info">Text in quotation marks is checked against the transcript. Everything else on this page is AI interpretation.</Notice>
        <p>{a.executiveSummary}</p>
        {a.quoteVerification && <p className="small muted">{a.quoteVerification.verified} of {a.quoteVerification.total} quotes found verbatim. {a.quoteVerification.note}</p>}
        {a.comparedWith && <p className="small"><strong>Compared with {a.comparedWith}:</strong> {a.growthAndGuidance?.guidanceComparison}</p>}
      </Card>
      <div className="grid grid-2">
        <Card title="Financial performance (AI summary)">
          <dl className="kv" style={{ gridTemplateColumns: 'auto minmax(0,1fr)' }}>
            {Object.entries(a.financialPerformance || {}).map(([k, v]) => <Fragment key={k}><dt>{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</dt><dd style={{ textAlign: 'left', fontWeight: 400 }}>{String(v)}</dd></Fragment>)}
          </dl>
        </Card>
        <Card title="Growth and guidance (AI summary)">
          <dl className="kv" style={{ gridTemplateColumns: 'auto minmax(0,1fr)' }}>
            {Object.entries(a.growthAndGuidance || {}).map(([k, v]) => <Fragment key={k}><dt>{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</dt><dd style={{ textAlign: 'left', fontWeight: 400 }}>{String(v)}</dd></Fragment>)}
          </dl>
        </Card>
      </div>
      <Card title="Findings">
        <ul className="list-plain">{(a.findings || []).map((f: any, i: number) => (
          <li key={i}><Badge tone={CLASS_TONE[f.classification]}>{CLASS_LABEL[f.classification] || f.classification}</Badge> <strong>{f.topic}</strong> <span className="small muted">· {f.location}</span>
            <div className="small">{f.explanation}</div>{f.exactQuote && <Quote text={f.exactQuote} verified={f.quoteVerified} />}</li>
        ))}</ul>
      </Card>
      {(a.managementStatements || []).length > 0 && (
        <Card title="Management statements">
          <ul className="list-plain">{a.managementStatements.map((s: any, i: number) => <li key={i}><strong className="small">{s.speaker}</strong> <span className="small muted">· {s.location}</span><Quote text={s.quote} verified={s.quoteVerified} /></li>)}</ul>
        </Card>
      )}
      {(a.keyUncertainties || []).length > 0 && <Card title="Open questions"><ul style={{ margin: 0, paddingLeft: 18 }}>{a.keyUncertainties.map((u: string) => <li key={u}>{u}</li>)}</ul></Card>}
      <p className="small muted">{a.portfolioConnection?.disclaimer}</p>
    </div>
  );
}

function Find({ onOpen }: { onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const [src, setSrc] = useState({ ticker: '', company: '', irUrl: '' });
  const sources = useQuery({ queryKey: ['research-sources'], queryFn: () => api.get<{ sources: any[] }>('/concall/sources').then((r) => r.sources) });
  const save = useMutation({ mutationFn: () => api.post('/concall/sources', src), onSuccess: () => { qc.invalidateQueries({ queryKey: ['research-sources'] }); setSrc({ ticker: '', company: '', irUrl: '' }); } });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/concall/sources/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['research-sources'] }) });
  const check = useMutation({ mutationFn: (id: string) => api.post<any>(`/concall/sources/${id}/check`) });
  const [importing, setImporting] = useState<string | null>(null);
  const imp = useMutation({
    mutationFn: (t: any) => { setImporting(t.url); return api.post<{ analysis?: any; alreadyImported?: boolean; analysisId?: string; meta?: any }>('/concall/import', { pdfUrl: t.url, companyName: check.data.company, ticker: check.data.ticker, quarter: t.quarter, fiscalYear: t.fiscalYear }); },
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['concalls'] }); onOpen(r.alreadyImported ? r.analysisId! : r.meta.id); },
    onSettled: () => setImporting(null),
  });
  const [periods, setPeriods] = useState<Record<string, { quarter: string; fiscalYear: string }>>({});
  return (
    <div className="stack">
      <Notice>Listed companies must publish earnings-call transcripts on their own websites (SEBI LODR Reg. 46). FinSight reads those pages, respecting each site's robots.txt. Some companies block automated access — then download the PDF and upload it.</Notice>
      <Card title="Company investor-relations pages">
        <form className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }} onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Ticker"><input value={src.ticker} onChange={(e) => setSrc({ ...src, ticker: e.target.value.toUpperCase() })} required placeholder="HDFCBANK" /></Field>
          <Field label="Company"><input value={src.company} onChange={(e) => setSrc({ ...src, company: e.target.value })} required placeholder="HDFC Bank" /></Field>
          <Field label="IR page URL"><input type="url" value={src.irUrl} onChange={(e) => setSrc({ ...src, irUrl: e.target.value })} required placeholder="https://…/investor-relations" /></Field>
          <div style={{ alignSelf: 'end' }}><Button type="submit" variant="secondary" loading={save.isPending}>Save page</Button></div>
        </form>
        {save.error && <Notice tone="bad">{errorMessage(save.error)}</Notice>}
        <ul className="list-plain" style={{ marginTop: 12 }}>
          {sources.data?.map((s) => (
            <li key={s.id} className="row-between">
              <span className="break"><strong>{s.company}</strong> ({s.ticker}) <span className="small muted">{s.irUrl}</span>{s.lastChecked && <span className="small muted"> · checked {dateTime(s.lastChecked)}</span>}</span>
              <span className="row"><Button size="sm" onClick={() => check.mutate(s.id)} loading={check.isPending && check.variables === s.id}>Check for transcripts</Button>
                <button className="icon-btn" aria-label={`Remove ${s.company}`} onClick={() => remove.mutate(s.id)}><Trash2 size={14} /></button></span>
            </li>
          ))}
        </ul>
      </Card>
      {check.error && <Notice tone="bad">{errorMessage(check.error)}</Notice>}
      {check.data && (
        <Card title={`Transcripts found for ${check.data.company}`} subtitle={check.data.note}>
          {check.data.transcripts.length === 0 ? <p className="muted">None found.</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Document</th><th>Quarter</th><th>FY</th><th /></tr></thead>
              <tbody>{check.data.transcripts.map((t: any) => {
                const p = periods[t.url] || { quarter: t.quarter || '', fiscalYear: t.fiscalYear || '' };
                return (
                  <tr key={t.url}>
                    <td className="break"><a href={t.url} target="_blank" rel="noopener noreferrer">{t.title}</a>{t.inferredFromDate && <div className="small muted">Quarter inferred from the call date — check it.</div>}</td>
                    <td><select value={p.quarter} aria-label="Quarter" style={{ width: 80 }} onChange={(e) => setPeriods({ ...periods, [t.url]: { ...p, quarter: e.target.value } })}><option value="">—</option>{['Q1', 'Q2', 'Q3', 'Q4'].map((x) => <option key={x}>{x}</option>)}</select></td>
                    <td><input value={p.fiscalYear} aria-label="Fiscal year" style={{ width: 80 }} placeholder="FY27" onChange={(e) => setPeriods({ ...periods, [t.url]: { ...p, fiscalYear: e.target.value.toUpperCase() } })} /></td>
                    <td className="r">{t.importedAnalysisId ? <Button size="sm" variant="ghost" onClick={() => onOpen(t.importedAnalysisId)}>Open analysis</Button>
                      : <Button size="sm" disabled={!/^Q[1-4]$/.test(p.quarter) || !/^FY\d{2}$/.test(p.fiscalYear)} loading={importing === t.url} onClick={() => imp.mutate({ ...t, ...p })}>Analyse</Button>}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
          {imp.error && <Notice tone="bad">{errorMessage(imp.error)}</Notice>}
        </Card>
      )}
    </div>
  );
}

function Upload({ onOpen }: { onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ companyName: '', ticker: '', quarter: 'Q2', fiscalYear: 'FY27', transcriptText: '' });
  const [file, setFile] = useState<File | null>(null);
  const run = useMutation({
    mutationFn: () => {
      const form = new FormData();
      Object.entries(f).forEach(([k, v]) => { if (k !== 'transcriptText' || !file) form.append(k, v); });
      if (file) form.append('transcriptFile', file);
      return api.upload<{ analysis: { id: string } }>('/concall/analyze', form);
    },
    onSuccess: async (r) => { await qc.invalidateQueries({ queryKey: ['concalls'] }); onOpen(r.analysis.id); },
  });
  return (
    <Card title="Analyse a transcript" subtitle="Upload a PDF or text file, or paste the transcript.">
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run.mutate(); }}>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Field label="Company"><input value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} required /></Field>
          <Field label="Ticker"><input value={f.ticker} onChange={(e) => setF({ ...f, ticker: e.target.value.toUpperCase() })} required /></Field>
          <Field label="Quarter"><select value={f.quarter} onChange={(e) => setF({ ...f, quarter: e.target.value })}>{['Q1', 'Q2', 'Q3', 'Q4'].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Fiscal year"><input value={f.fiscalYear} onChange={(e) => setF({ ...f, fiscalYear: e.target.value.toUpperCase() })} pattern="FY\d{2}" required /></Field>
        </div>
        <Field label="Transcript file (PDF or .txt, max 15MB)"><input type="file" accept=".pdf,.txt,.md" onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field>
        {!file && <Field label="…or paste the transcript"><textarea rows={8} value={f.transcriptText} onChange={(e) => setF({ ...f, transcriptText: e.target.value })} /></Field>}
        {run.error && <Notice tone="bad">{errorMessage(run.error)}</Notice>}
        <div><Button type="submit" loading={run.isPending} disabled={!file && f.transcriptText.trim().length < 80}>Analyse</Button></div>
        {run.isPending && <p className="small muted">Analysing with AI — this can take up to a minute for long transcripts.</p>}
      </form>
    </Card>
  );
}
