import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Download, FlaskConical, ExternalLink, Loader2, Plus, ArrowUpDown, Search, X, Sparkles } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function abstractFromIndex(inv: any): string {
  if (!inv) return '';
  try {
    const out: string[] = [];
    Object.keys(inv).forEach((word) => {
      (inv[word] || []).forEach((pos: number) => { out[pos] = word; });
    });
    return out.filter(Boolean).join(' ').split('  ').join(' ').trim();
  } catch {
    return '';
  }
}

async function callChat(message: string): Promise<string> {
  try {
    const res = await fetch(API + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message, agent_type: 'research', use_rag: false, persona: 'LITERATURE REVIEW' }),
    });
    const reader = res.body ? res.body.getReader() : null;
    const dec = new TextDecoder();
    let buffer = '';
    let full = '';
    while (reader) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += dec.decode(chunk.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.indexOf('data: ') === 0) {
          const d = line.slice(6);
          if (d === '[DONE]') continue;
          try {
            const j = JSON.parse(d);
            if (j.type === 'token') full += j.content;
          } catch {
            // ignore
          }
        }
      }
    }
    return full;
  } catch {
    return '';
  }
}

function extractJSON(text: string): any {
  if (!text) return null;
  let t = text.trim();
  const FENCE = String.fromCharCode(96, 96, 96);
  const fs = t.indexOf(FENCE);
  if (fs !== -1) {
    const rest = t.slice(fs + 3);
    const fe = rest.indexOf(FENCE);
    if (fe !== -1) {
      t = rest.slice(0, fe).trim();
      if (t.slice(0, 4).toLowerCase() === 'json') t = t.slice(4).trim();
    }
  }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a !== -1 && b !== -1 && b > a) t = t.slice(a, b + 1);
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function mkPaper(w: any, i: number): any {
  const authors = (w.authorships || []).map((a: any) => a.author && a.author.display_name).filter(Boolean);
  const authorStr = authors.length
    ? (authors.length > 3 ? authors.slice(0, 2).join(', ') + ' et al.' : authors.join(', '))
    : 'Unknown authors';
  const venue = (w.primary_location && w.primary_location.source && w.primary_location.source.display_name) || '';
  const landing = (w.primary_location && w.primary_location.landing_page_url) || '';
  return {
    id: w.id || String(i),
    title: w.title || w.display_name || 'Untitled',
    authors: authors,
    authorStr: authorStr,
    year: w.publication_year || '',
    venue: venue,
    cited: w.cited_by_count || 0,
    doi: w.doi ? String(w.doi).replace('https://doi.org/', '') : '',
    url: w.doi || landing || w.id,
    oa: !!(w.open_access && w.open_access.is_oa),
    abstract: abstractFromIndex(w.abstract_inverted_index),
    summary: '',
    cols: {},
    rel: w.relevance_score || 0,
    idx: i,
  };
}

export function LiteratureReviewView({ messages }: any) {
  const [question, setQuestion] = useState('');
  const [papers, setPapers] = useState([] as any[]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [synthesis, setSynthesis] = useState('');
  const [searchTerms, setSearchTerms] = useState([] as string[]);
  const [columns, setColumns] = useState([] as any[]);
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState('relevance');
  const [addingCol, setAddingCol] = useState(false);
  const [colInput, setColInput] = useState('');
  const [colBusy, setColBusy] = useState(false);
  const lastQRef = useRef('');

  useEffect(() => {
    const arr = [...(messages || [])].reverse();
    const lastUser = arr.find((m: any) => m.role === 'user');
    const q = (lastUser && lastUser.content ? lastUser.content : '').trim();
    if (q && q !== lastQRef.current) {
      lastQRef.current = q;
      runReview(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  async function runReview(q: string) {
    setQuestion(q);
    setBusy(true);
    setPhase('Searching academic databases...');
    setPapers([]);
    setSynthesis('');
    setColumns([]);
    setSearchTerms([]);
    try {
      const url = 'https://api.openalex.org/works?search=' + encodeURIComponent(q) + '&per_page=12&sort=relevance_score:desc&filter=has_abstract:true&mailto=support@pinnovix.app';
      const r = await fetch(url);
      const j = await r.json();
      const rawList = (j.results || []).map(mkPaper);
      const items = rawList.filter((p: any) => p.title);
      setPapers(items);
      setSearchTerms([q]);
      if (!items.length) {
        setBusy(false);
        setPhase('');
        return;
      }
      setPhase('Summarising papers and synthesising findings...');
      const list = items.map((p: any, i: number) => '[' + i + '] ' + p.title + '. ABSTRACT: ' + (p.abstract || 'No abstract').slice(0, 900)).join('\n\n');
      const jsonShape = '{"summaries": ["one short summary per paper in order"], "synthesis": "3-4 sentence overall synthesis"}';
      const prompt = 'You are a systematic literature-review assistant. Research question: "' + q + '".\n\n'
        + 'Below are ' + items.length + ' papers. For EACH paper (in order), write a 1-2 sentence summary of what it found that is RELEVANT to the research question, with specific numbers/outcomes if present. Then write a 3-4 sentence overall synthesis across all papers (agreement, disagreement, bottom line).\n\n'
        + 'Return ONLY valid JSON, no markdown fences, in exactly this shape: ' + jsonShape + '\n\nPapers:\n' + list;
      const rawText = await callChat(prompt);
      const parsed = extractJSON(rawText);
      if (parsed && Array.isArray(parsed.summaries)) {
        setPapers((prev) => prev.map((p, i) => ({ ...p, summary: parsed.summaries[i] || (p.abstract || '').slice(0, 220) })));
        setSynthesis(parsed.synthesis || '');
      } else {
        setPapers((prev) => prev.map((p) => ({ ...p, summary: p.abstract ? p.abstract.slice(0, 240) + '...' : 'No abstract available.' })));
        setSynthesis(rawText && rawText.length < 1200 ? rawText : '');
      }
    } catch {
      setPapers((prev) => prev.map((p) => ({ ...p, summary: p.abstract ? p.abstract.slice(0, 240) + '...' : '' })));
    } finally {
      setBusy(false);
      setPhase('');
    }
  }

  async function addColumn() {
    const cq = colInput.trim();
    if (!cq || !papers.length) return;
    setColBusy(true);
    const colId = 'c' + Date.now();
    setColumns((prev) => [...prev, { id: colId, name: cq }]);
    setAddingCol(false);
    setColInput('');
    try {
      const list = papers.map((p, i) => '[' + i + '] ' + p.title + '. ABSTRACT: ' + (p.abstract || 'No abstract').slice(0, 800)).join('\n\n');
      const shape = '{"answers": ["one short answer per paper in order"]}';
      const prompt = 'For EACH of the ' + papers.length + ' papers below, answer this in a short phrase (max ~15 words), or "Not reported" if the abstract does not say. Question: "' + cq + '".\n\n'
        + 'Return ONLY valid JSON in this shape: ' + shape + '\n\nPapers:\n' + list;
      const rawText = await callChat(prompt);
      const parsed = extractJSON(rawText);
      const answers = parsed && Array.isArray(parsed.answers) ? parsed.answers : [];
      setPapers((prev) => prev.map((p, i) => ({ ...p, cols: { ...p.cols, [colId]: answers[i] || 'Not reported' } })));
    } catch {
      setPapers((prev) => prev.map((p) => ({ ...p, cols: { ...p.cols, [colId]: 'Not reported' } })));
    } finally {
      setColBusy(false);
    }
  }

  function removeColumn(id: string) {
    setColumns((prev) => prev.filter((c) => c.id !== id));
    setPapers((prev) => prev.map((p) => {
      const rest = { ...p.cols };
      delete rest[id];
      return { ...p, cols: rest };
    }));
  }

  function downloadCSV() {
    const esc = (v: any) => '"' + String(v === undefined || v === null ? '' : v).split('"').join('""') + '"';
    const head = ['Title', 'Authors', 'Year', 'Journal', 'Cited by', 'DOI', 'Summary'].concat(columns.map((c) => c.name));
    const body = view().map((p) => [p.title, p.authors.join('; '), p.year, p.venue, p.cited, p.doi, p.summary].concat(columns.map((c) => p.cols[c.id] || '')));
    const csv = [head].concat(body).map((row) => row.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = (question || 'literature-review').slice(0, 40) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(href);
  }

  function view() {
    const f = filter.toLowerCase();
    let list = papers.filter((p) => !f || (p.title + ' ' + p.abstract + ' ' + p.summary).toLowerCase().indexOf(f) !== -1);
    list = list.slice().sort((a, b) => {
      if (sortKey === 'year') return (b.year || 0) - (a.year || 0);
      if (sortKey === 'cited') return (b.cited || 0) - (a.cited || 0);
      return (b.rel - a.rel) || (a.idx - b.idx);
    });
    return list;
  }

  const rows = view();

  return (
    <div className="flex w-full h-full bg-background overflow-hidden text-foreground">
      <div className="w-[38%] min-w-[320px] flex flex-col border-r border-border h-full">
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar flex flex-col gap-4">
          {question ? (
            <div className="self-end max-w-[90%] bg-primary text-primary-foreground rounded-2xl px-4 py-2.5 text-[13.5px]">{question}</div>
          ) : null}
          {busy ? (
            <div className="flex items-center gap-2 text-muted-foreground text-[13px]"><Loader2 className="w-4 h-4 animate-spin" /> {phase}</div>
          ) : null}
          {searchTerms.length > 0 ? (
            <div className="bg-muted/40 border border-border rounded-xl p-3">
              <div className="text-[12px] font-bold text-muted-foreground mb-1.5 flex items-center gap-1.5"><FlaskConical className="w-3.5 h-3.5" /> Ran analysis - {papers.length} papers</div>
              {searchTerms.map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-[12.5px] text-foreground/80 py-0.5"><Search className="w-3.5 h-3.5 text-muted-foreground" /> {t} <span className="text-muted-foreground text-[11px]">- Academic</span></div>
              ))}
            </div>
          ) : null}
          {synthesis ? (
            <div className="prose prose-sm dark:prose-invert max-w-none text-[14px] leading-relaxed">
              <div className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Synthesis</div>
              <ReactMarkdown>{synthesis}</ReactMarkdown>
            </div>
          ) : null}
          {!busy && !papers.length ? (
            <div className="text-muted-foreground text-[13px] mt-6">Ask a research question below and I will build a paper table with summaries.</div>
          ) : null}
        </div>
      </div>

      <div className="flex-1 bg-card flex flex-col h-full overflow-hidden">
        <div className="p-3 border-b border-border flex items-center gap-2 flex-wrap shrink-0">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search papers..." className="w-full bg-muted/40 border border-border rounded-lg pl-8 pr-2 py-1.5 text-[13px] outline-none focus:border-primary" />
          </div>
          <div className="flex items-center gap-1 text-[12.5px]">
            <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="bg-muted/40 border border-border rounded-lg px-2 py-1.5 outline-none focus:border-primary">
              <option value="relevance">Most relevant</option>
              <option value="year">Newest</option>
              <option value="cited">Most cited</option>
            </select>
          </div>
          <button onClick={() => setAddingCol(true)} disabled={!papers.length} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] font-semibold border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-40"><Plus className="w-3.5 h-3.5" /> Add column</button>
          <button onClick={downloadCSV} disabled={!papers.length} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] font-semibold border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-40"><Download className="w-3.5 h-3.5" /> Download</button>
        </div>

        {addingCol ? (
          <div className="p-3 border-b border-border flex items-center gap-2 bg-muted/30">
            <input autoFocus value={colInput} onChange={(e) => setColInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addColumn(); }} placeholder="Column question, e.g. Sample size? Main outcome? Study design?" className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-[13px] outline-none focus:border-primary" />
            <button onClick={addColumn} disabled={!colInput.trim() || colBusy} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-[13px] font-bold disabled:opacity-40">{colBusy ? 'Extracting...' : 'Add'}</button>
            <button onClick={() => { setAddingCol(false); setColInput(''); }} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
        ) : null}

        <div className="flex-1 overflow-auto custom-scrollbar">
          {papers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-60">
              {busy ? <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" /> : <FlaskConical className="w-10 h-10 text-muted-foreground mb-3" />}
              <p className="text-[13px] text-foreground">{busy ? phase : 'No papers yet.'}</p>
              {!busy ? <p className="text-[12px] text-muted-foreground mt-1">Ask a research question to build your review table.</p> : null}
            </div>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="p-3 font-semibold w-[42%]">Source ({rows.length})</th>
                  <th className="p-3 font-semibold w-[38%]">Summary</th>
                  {columns.map((c) => (
                    <th key={c.id} className="p-3 font-semibold min-w-[160px]">
                      <div className="flex items-center gap-1 justify-between"><span className="truncate">{c.name}</span><button onClick={() => removeColumn(c.id)} className="text-muted-foreground hover:text-red-400 shrink-0"><X className="w-3.5 h-3.5" /></button></div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-border align-top hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-semibold text-foreground leading-snug mb-1">{p.title}</div>
                      <div className="text-[12px] text-muted-foreground">{p.authorStr}</div>
                      <div className="text-[12px] text-muted-foreground mt-0.5">{[p.venue, p.year, p.cited + ' citations'].filter(Boolean).join(' - ')}</div>
                      <div className="flex items-center gap-2 mt-1.5">
                        {p.doi ? <a href={p.url} target="_blank" rel="noreferrer" className="text-[11.5px] font-semibold text-blue-500 hover:text-blue-600 flex items-center gap-1"><ExternalLink className="w-3 h-3" /> DOI</a> : null}
                        {p.oa ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-500/15 text-green-500">OPEN ACCESS</span> : null}
                      </div>
                    </td>
                    <td className="p-3 text-foreground/90 leading-relaxed">
                      {p.summary ? p.summary : (busy ? <span className="text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> summarising...</span> : (p.abstract ? p.abstract.slice(0, 220) + '...' : 'No abstract.'))}
                    </td>
                    {columns.map((c) => (
                      <td key={c.id} className="p-3 text-foreground/90">
                        {p.cols[c.id] ? p.cols[c.id] : (colBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /> : '-')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
