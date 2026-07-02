import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Download, FlaskConical, ExternalLink, Loader2, Plus, ArrowUpDown, Search, X, Sparkles, ArrowRight, ArrowLeft, FileText, Table2, BookOpen, Copy, SlidersHorizontal, Bookmark, Clock, Library as LibraryIcon, Bell, Upload, FolderPlus, Trash2, PanelLeft } from 'lucide-react';

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

function fmtTime(ts: any): string {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function docName(d: any): string {
  return (d && (d.name || d.title || d.filename || d.fileName)) || 'Untitled document';
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
    fullText: !!(w.open_access && w.open_access.oa_url) || !!(w.primary_location && w.primary_location.pdf_url),
    abstract: abstractFromIndex(w.abstract_inverted_index),
    summary: '',
    cols: {},
    rel: w.relevance_score || 0,
    idx: i,
  };
}

export function LiteratureReviewView({ messages, onHome }: any) {
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
  const [input, setInput] = useState('');
  const [followups, setFollowups] = useState([] as string[]);
  const [filtOpen, setFiltOpen] = useState(false);
  const [minYear, setMinYear] = useState('');
  const [minCited, setMinCited] = useState('');
  const [oaOnly, setOaOnly] = useState(false);
  const [saved, setSaved] = useState(false);

  // Left-nav state
  const [navView, setNavView] = useState('search');
  const [navOpen, setNavOpen] = useState(true);
  const [recents, setRecents] = useState([] as any[]);
  const [collections, setCollections] = useState([] as any[]);
  const [libDocs, setLibDocs] = useState([] as any[]);
  const [activeCol, setActiveCol] = useState('all');
  const [recentSearch, setRecentSearch] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try { const r = localStorage.getItem('pinnovix_lit_recents'); if (r) setRecents(JSON.parse(r)); } catch {}
    try { const c = localStorage.getItem('pinnovix_lit_collections'); if (c) setCollections(JSON.parse(c)); } catch {}
    try { const d = localStorage.getItem('pinnovix_library_docs'); if (d) setLibDocs(JSON.parse(d)); } catch {}
  }, []);

  function pushRecent(q: string) {
    try {
      const raw = localStorage.getItem('pinnovix_lit_recents');
      const arr = raw ? JSON.parse(raw) : [];
      const filtered = arr.filter((x: any) => x.question !== q);
      filtered.unshift({ id: Date.now(), question: q, type: 'Find papers', ts: Date.now() });
      const next = filtered.slice(0, 30);
      localStorage.setItem('pinnovix_lit_recents', JSON.stringify(next));
      setRecents(next);
    } catch {}
  }

  function submitStart() {
    const q = input.trim();
    if (!q) return;
    lastQRef.current = q;
    runReview(q);
  }
  function resetSearch() {
    setQuestion(''); setPapers([]); setSynthesis(''); setColumns([]); setSearchTerms([]); setInput(''); setFollowups([]); lastQRef.current = '';
  }
  function startNew() {
    resetSearch();
    setNavView('search');
  }
  function openRecent(q: string) {
    setNavView('search');
    lastQRef.current = q;
    runReview(q);
  }
  function newCollection() {
    if (typeof window === 'undefined') return;
    const name = window.prompt('New collection name');
    if (!name || !name.trim()) return;
    const next = [{ id: 'col' + Date.now(), name: name.trim() }].concat(collections);
    setCollections(next);
    try { localStorage.setItem('pinnovix_lit_collections', JSON.stringify(next)); } catch {}
  }
  function onUploadFiles(e: any) {
    const files = Array.from((e.target && e.target.files) || []) as any[];
    if (!files.length) return;
    const add = files.map((f, i) => ({ id: 'd' + Date.now() + '_' + i, name: f.name, size: f.size, ts: Date.now(), collection: activeCol !== 'all' && activeCol !== 'trash' ? activeCol : '' }));
    const next = add.concat(libDocs);
    setLibDocs(next);
    try { localStorage.setItem('pinnovix_library_docs', JSON.stringify(next)); } catch {}
    if (e.target) e.target.value = '';
  }

  function copyReport() {
    const txt = (question ? question + '\n\n' : '') + (synthesis ? synthesis + '\n\n' : '') + view().map((p, i) => (i + 1) + '. ' + p.title + ' (' + p.authorStr + ', ' + p.year + '). ' + (p.doi ? 'https://doi.org/' + p.doi : '')).join('\n');
    try { navigator.clipboard.writeText(txt); } catch {}
  }
  function downloadReport() {
    const txt = (question ? 'Research question: ' + question + '\n\n' : '') + (synthesis ? 'Synthesis:\n' + synthesis + '\n\n' : '') + 'Papers:\n' + view().map((p, i) => (i + 1) + '. ' + p.title + ' - ' + p.authorStr + ' (' + p.year + '). ' + p.venue + '. ' + (p.doi ? 'https://doi.org/' + p.doi : '') + '\n   Summary: ' + (p.summary || '')).join('\n\n');
    const blob = new Blob([txt], { type: 'text/plain' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = href; a.download = (question || 'literature-review').slice(0, 40) + '.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(href);
  }
  function saveLibrary() {
    try {
      const raw = localStorage.getItem('pinnovix_lit_library');
      const lib = raw ? JSON.parse(raw) : [];
      lib.unshift({ id: Date.now(), question: question, papers: view(), synthesis: synthesis, ts: Date.now() });
      localStorage.setItem('pinnovix_lit_library', JSON.stringify(lib.slice(0, 50)));
      setSaved(true); setTimeout(() => setSaved(false), 1500);
    } catch {}
  }

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
    setNavView('search');
    setQuestion(q);
    pushRecent(q);
    setBusy(true);
    setPhase('Searching academic databases...');
    setPapers([]);
    setSynthesis('');
    setColumns([]);
    setSearchTerms([]);
    setFollowups([]);
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
      const jsonShape = '{"summaries": ["one short summary per paper in order"], "synthesis": "3-4 sentence overall synthesis", "followups": ["2-3 short follow-up questions to explore next"]}';
      const prompt = 'You are a systematic literature-review assistant. Research question: "' + q + '".\n\n'
        + 'Below are ' + items.length + ' papers. For EACH paper (in order), write a 1-2 sentence summary of what it found that is RELEVANT to the research question, with specific numbers/outcomes if present. Then write a 3-4 sentence overall synthesis across all papers (agreement, disagreement, bottom line).\n\n'
        + 'Return ONLY valid JSON, no markdown fences, in exactly this shape: ' + jsonShape + '\n\nPapers:\n' + list;
      const rawText = await callChat(prompt);
      const parsed = extractJSON(rawText);
      if (parsed && Array.isArray(parsed.summaries)) {
        setPapers((prev) => prev.map((p, i) => ({ ...p, summary: parsed.summaries[i] || (p.abstract || '').slice(0, 220) })));
        setSynthesis(parsed.synthesis || '');
        setFollowups(Array.isArray(parsed.followups) ? parsed.followups.slice(0, 3) : []);
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
    if (minYear) list = list.filter((p) => (p.year || 0) >= parseInt(minYear, 10));
    if (minCited) list = list.filter((p) => (p.cited || 0) >= parseInt(minCited, 10));
    if (oaOnly) list = list.filter((p) => p.oa);
    list = list.slice().sort((a, b) => {
      if (sortKey === 'year') return (b.year || 0) - (a.year || 0);
      if (sortKey === 'cited') return (b.cited || 0) - (a.cited || 0);
      return (b.rel - a.rel) || (a.idx - b.idx);
    });
    return list;
  }

  const rows = view();
  const navItems = [
    { id: 'new', label: 'New', Icon: Plus },
    { id: 'recents', label: 'Recents', Icon: Clock },
    { id: 'library', label: 'Library', Icon: LibraryIcon },
    { id: 'alerts', label: 'Alerts', Icon: Bell },
  ];
  const filteredRecents = recents.filter((r) => !recentSearch || (r.question || '').toLowerCase().indexOf(recentSearch.toLowerCase()) !== -1);
  const shownDocs = libDocs.filter((d) => activeCol === 'all' || activeCol === 'trash' ? activeCol !== 'trash' : d.collection === activeCol);

  const leftNav = (
    <aside className={(navOpen ? 'w-[224px]' : 'w-[56px]') + ' shrink-0 border-r border-border flex flex-col bg-card/40 h-full'}>
      <div className="flex items-center justify-between px-3 h-12 border-b border-border shrink-0">
        {navOpen ? (
          <div className="flex items-center gap-2 font-bold text-[14px] text-foreground"><FlaskConical className="w-4 h-4 text-primary" /> Literature</div>
        ) : (
          <FlaskConical className="w-4 h-4 text-primary mx-auto" />
        )}
        <button onClick={() => setNavOpen((v) => !v)} title="Toggle sidebar" className="text-muted-foreground hover:text-foreground"><PanelLeft className="w-4 h-4" /></button>
      </div>
      <nav className="p-2 flex flex-col gap-0.5 shrink-0">
        {navItems.map((it) => {
          const active = navView === it.id;
          return (
            <button key={it.id} onClick={() => { if (it.id === 'new') startNew(); else setNavView(it.id); }} title={it.label}
              className={(active ? 'bg-muted text-foreground font-semibold ' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground ') + 'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors'}>
              <it.Icon className="w-4 h-4 shrink-0" /> {navOpen ? <span>{it.label}</span> : null}
            </button>
          );
        })}
      </nav>
      {navOpen ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 mt-1 min-h-0">
          <div className="text-[10.5px] font-bold text-muted-foreground uppercase tracking-wide px-2 mb-1">Recents</div>
          {recents.length === 0 ? (
            <div className="px-2 text-[12px] text-muted-foreground italic">No recent searches.</div>
          ) : recents.slice(0, 20).map((r) => (
            <button key={r.id} onClick={() => openRecent(r.question)} className="w-full text-left flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-foreground/80 hover:bg-muted/60 hover:text-foreground truncate">
              <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> <span className="truncate">{r.question}</span>
            </button>
          ))}
        </div>
      ) : <div className="flex-1" />}
      {onHome ? (
        <div className="p-2 border-t border-border shrink-0">
          <button onClick={onHome} className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground hover:bg-muted/60 hover:text-foreground">
            <ArrowLeft className="w-4 h-4 shrink-0" /> {navOpen ? <span>Personas</span> : null}
          </button>
        </div>
      ) : null}
    </aside>
  );

  // ---- RECENTS PAGE (snip 1) ----
  const recentsPage = (
    <div className="h-full overflow-y-auto custom-scrollbar p-8">
      <h1 className="text-2xl font-bold mb-5">Recents</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-7">
        {[
          { t: 'New search', d: 'Find papers, extract findings, and chat', Icon: Search },
          { t: 'New research report', d: 'Ask a question to generate a report', Icon: FileText },
          { t: 'New systematic review', d: 'Ask, search, screen, and extract', Icon: Table2 },
        ].map((c) => (
          <button key={c.t} onClick={startNew} className="text-left border border-border rounded-2xl bg-card hover:border-primary transition-colors p-5 flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-[14.5px]">{c.t}</div>
              <div className="text-[12.5px] text-muted-foreground mt-0.5">{c.d}</div>
            </div>
            <span className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground shrink-0"><c.Icon className="w-4 h-4" /></span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between border-b border-border mb-1">
        <div className="flex items-center gap-1 text-[13px]">
          <span className="px-3 py-2 rounded-lg bg-muted font-semibold">All</span>
          <span className="px-3 py-2 text-muted-foreground">Created by you</span>
          <span className="px-3 py-2 text-muted-foreground">Trash</span>
        </div>
        <div className="relative mb-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={recentSearch} onChange={(e) => setRecentSearch(e.target.value)} placeholder="Search" className="bg-muted/40 border border-border rounded-lg pl-8 pr-2 py-1.5 text-[13px] outline-none focus:border-primary w-[220px]" />
        </div>
      </div>
      <table className="w-full text-[13.5px]">
        <thead>
          <tr className="text-left text-muted-foreground text-[12px]">
            <th className="py-2 font-semibold">Name</th>
            <th className="py-2 font-semibold w-[160px]">Type</th>
            <th className="py-2 font-semibold w-[160px]">Last modified</th>
          </tr>
        </thead>
        <tbody>
          {filteredRecents.length === 0 ? (
            <tr><td colSpan={3} className="py-8 text-center text-muted-foreground text-[13px]">No recent items yet. Start a new search.</td></tr>
          ) : filteredRecents.map((r) => (
            <tr key={r.id} onClick={() => openRecent(r.question)} className="border-t border-border cursor-pointer hover:bg-muted/40">
              <td className="py-3 pr-4"><div className="flex items-center gap-2.5 font-semibold"><Search className="w-4 h-4 text-muted-foreground" /> {r.question}</div></td>
              <td className="py-3 text-muted-foreground">{r.type || 'Find papers'}</td>
              <td className="py-3 text-muted-foreground">{fmtTime(r.ts)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // ---- LIBRARY PAGE (snip 2) ----
  const libraryPage = (
    <div className="h-full flex overflow-hidden">
      <input ref={fileRef} type="file" multiple className="hidden" onChange={onUploadFiles} />
      <div className="w-[220px] shrink-0 border-r border-border p-3 overflow-y-auto custom-scrollbar">
        <div className="text-[12px] font-bold text-muted-foreground mb-1">Library</div>
        <button onClick={() => setActiveCol('all')} className={(activeCol === 'all' ? 'bg-muted font-semibold ' : 'hover:bg-muted/60 ') + 'w-full text-left rounded-lg px-3 py-2 text-[13.5px]'}>All</button>
        <button onClick={() => setActiveCol('trash')} className={(activeCol === 'trash' ? 'bg-muted font-semibold ' : 'hover:bg-muted/60 ') + 'w-full text-left rounded-lg px-3 py-2 text-[13.5px]'}>Recently deleted</button>
        <div className="flex items-center justify-between mt-4 mb-1 px-1">
          <span className="text-[12px] font-bold text-muted-foreground">Collections</span>
          <button onClick={newCollection} title="New collection" className="text-muted-foreground hover:text-foreground"><FolderPlus className="w-4 h-4" /></button>
        </div>
        {collections.length === 0 ? (
          <div className="px-1 text-[12px] text-muted-foreground italic">No collections yet.</div>
        ) : collections.map((c) => (
          <button key={c.id} onClick={() => setActiveCol(c.id)} className={(activeCol === c.id ? 'bg-muted font-semibold ' : 'hover:bg-muted/60 ') + 'w-full text-left rounded-lg px-3 py-2 text-[13.5px] truncate flex items-center gap-2'}><BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> {c.name}</button>
        ))}
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-6 py-4 border-b border-border text-[14px] text-muted-foreground">Library / <span className="text-foreground font-semibold">{activeCol === 'all' ? 'All' : activeCol === 'trash' ? 'Recently deleted' : (collections.find((c) => c.id === activeCol) || {}).name || 'Collection'}</span></div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {shownDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4"><FileText className="w-8 h-8 text-muted-foreground" /></div>
              <div className="font-semibold text-[15px]">Upload papers to start using your library.</div>
              <div className="text-[13px] text-muted-foreground mt-1 max-w-sm">Your library stores papers and documents for analysis and insights.</div>
              <button onClick={() => fileRef.current && fileRef.current.click()} className="mt-5 flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-[13.5px] font-semibold"><Upload className="w-4 h-4" /> Upload</button>
            </div>
          ) : (
            <table className="w-full text-[13.5px]">
              <thead><tr className="text-left text-muted-foreground text-[12px]"><th className="px-6 py-3 font-semibold">Name</th><th className="px-6 py-3 font-semibold w-[180px]">Added</th></tr></thead>
              <tbody>
                {shownDocs.map((d) => (
                  <tr key={d.id || docName(d)} className="border-t border-border hover:bg-muted/40">
                    <td className="px-6 py-3"><div className="flex items-center gap-2.5 font-medium"><FileText className="w-4 h-4 text-muted-foreground shrink-0" /> {docName(d)}</div></td>
                    <td className="px-6 py-3 text-muted-foreground">{fmtTime(d.ts || d.uploadedAt || d.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="w-[260px] shrink-0 border-l border-border p-4 hidden lg:block">
        <div className="text-[14px] font-semibold mb-3">New from selection</div>
        <button onClick={startNew} className="w-full flex items-center justify-between border border-border rounded-xl px-3 py-3 text-[13.5px] hover:border-primary transition-colors mb-2"><span>Start systematic review</span><Table2 className="w-4 h-4 text-muted-foreground" /></button>
        <button onClick={() => fileRef.current && fileRef.current.click()} className="w-full flex items-center justify-between border border-border rounded-xl px-3 py-3 text-[13.5px] hover:border-primary transition-colors mb-4"><span>Extract data</span><Sparkles className="w-4 h-4 text-muted-foreground" /></button>
        <button onClick={() => fileRef.current && fileRef.current.click()} className="w-full flex items-center gap-2 justify-center bg-primary text-primary-foreground rounded-lg px-3 py-2 text-[13.5px] font-semibold"><Upload className="w-4 h-4" /> Upload</button>
      </div>
    </div>
  );

  // ---- ALERTS PAGE ----
  const alertsPage = (
    <div className="h-full flex flex-col items-center justify-center text-center px-8">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4"><Bell className="w-8 h-8 text-muted-foreground" /></div>
      <div className="font-semibold text-[15px]">No alerts yet.</div>
      <div className="text-[13px] text-muted-foreground mt-1 max-w-sm">Alerts about new papers matching your searches will appear here.</div>
    </div>
  );

  // ---- SEARCH START SCREEN ----
  const startScreen = (
    <div className="flex w-full h-full items-start justify-center overflow-y-auto custom-scrollbar">
      <div className="w-full max-w-3xl mt-[9vh] px-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">Literature Review</h1>
          <p className="text-muted-foreground text-sm mt-1">Ask a research question and get a table of real papers with AI summaries and a synthesis.</p>
        </div>
        <div className="border border-border rounded-2xl bg-card shadow-sm overflow-hidden">
          <div className="px-4 pt-4">
            <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-[13px] font-semibold rounded-lg px-3 py-1.5"><Search className="w-4 h-4" /> Find papers</span>
          </div>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitStart(); } }} rows={4} autoFocus placeholder="e.g. Does intermittent fasting improve weight loss in adults?" className="w-full bg-transparent px-4 py-3 text-[15px] outline-none resize-none placeholder:text-muted-foreground" />
          <div className="flex justify-end px-4 py-3 border-t border-border">
            <button onClick={submitStart} disabled={!input.trim()} className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40" title="Search"><ArrowRight className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          {['Does intermittent fasting improve weight loss in adults?', 'Effectiveness of CBT for anxiety disorders', 'Impact of remote work on employee productivity'].map((ex) => (
            <button key={ex} onClick={() => setInput(ex)} className="text-left border border-border rounded-xl p-3 bg-card hover:border-primary transition-colors text-[13px] text-muted-foreground">{ex}</button>
          ))}
        </div>
      </div>
    </div>
  );

  // ---- SEARCH RESULTS SPLIT VIEW ----
  const resultsView = (
    <div className="flex w-full h-full overflow-hidden">
      <div className="w-[38%] min-w-[320px] flex flex-col border-r border-border h-full">
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar flex flex-col gap-4">
          <div className="flex items-center justify-end">
            <button onClick={startNew} className="text-[12.5px] text-primary font-semibold flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> New search</button>
          </div>
          {papers.length > 0 ? (
            <div className="border border-border rounded-xl bg-card p-3 flex items-center gap-2"><Table2 className="w-4 h-4 text-primary shrink-0" /> <span className="font-semibold text-[14px] truncate">{question}</span></div>
          ) : null}
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
          {papers.length > 0 ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12.5px] border border-border rounded-lg px-3 py-1.5 flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" /> {papers.length} cited sources</span>
              <button onClick={copyReport} title="Copy" className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted"><Copy className="w-3.5 h-3.5" /></button>
              <button onClick={downloadReport} title="Download report" className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted"><Download className="w-3.5 h-3.5" /></button>
            </div>
          ) : null}
          {followups.length > 0 ? (
            <div className="border-t border-border pt-3">
              <div className="text-[12px] font-bold text-muted-foreground mb-1">Follow-ups</div>
              {followups.map((f, i) => (
                <button key={i} onClick={() => { setInput(f); lastQRef.current = f; runReview(f); }} className="w-full text-left py-2 border-b border-border last:border-0 text-[13.5px] hover:text-primary transition-colors">{f}</button>
              ))}
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
          <button onClick={() => setFiltOpen((v) => !v)} disabled={!papers.length} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] font-semibold border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-40"><SlidersHorizontal className="w-3.5 h-3.5" /> Filters</button>
          <button onClick={() => setAddingCol(true)} disabled={!papers.length} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] font-semibold border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-40"><Plus className="w-3.5 h-3.5" /> Add column</button>
          <button onClick={downloadCSV} disabled={!papers.length} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] font-semibold border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-40"><Download className="w-3.5 h-3.5" /> Download</button>
          <button onClick={saveLibrary} disabled={!papers.length} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] font-semibold border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-40"><Bookmark className="w-3.5 h-3.5" /> {saved ? 'Saved' : 'Save to library'}</button>
        </div>

        {filtOpen ? (
          <div className="p-3 border-b border-border flex items-center gap-4 flex-wrap bg-muted/30 text-[13px]">
            <label className="flex items-center gap-1.5">From year <input value={minYear} onChange={(e) => setMinYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} placeholder="2018" className="w-20 bg-background border border-border rounded-md px-2 py-1 outline-none focus:border-primary" /></label>
            <label className="flex items-center gap-1.5">Min citations <input value={minCited} onChange={(e) => setMinCited(e.target.value.replace(/[^0-9]/g, ''))} placeholder="50" className="w-20 bg-background border border-border rounded-md px-2 py-1 outline-none focus:border-primary" /></label>
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={oaOnly} onChange={(e) => setOaOnly(e.target.checked)} /> Open access only</label>
            <button onClick={() => { setMinYear(''); setMinCited(''); setOaOnly(false); }} className="text-muted-foreground hover:text-foreground">Reset</button>
            <button onClick={() => setFiltOpen(false)} className="ml-auto text-primary font-semibold">Done</button>
          </div>
        ) : null}

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
                        {p.fullText ? <span className="text-[11px] text-emerald-600 flex items-center gap-1"><FileText className="w-3 h-3" /> Full text available</span> : <span className="text-[11px] text-muted-foreground flex items-center gap-1"><FileText className="w-3 h-3" /> Abstract only</span>}
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

  const searchArea = (!question && !busy && papers.length === 0) ? startScreen : resultsView;
  const main = navView === 'recents' ? recentsPage
    : navView === 'library' ? libraryPage
    : navView === 'alerts' ? alertsPage
    : searchArea;

  return (
    <div className="flex w-full h-full bg-background text-foreground overflow-hidden">
      {leftNav}
      <div className="flex-1 min-w-0 h-full overflow-hidden">{main}</div>
    </div>
  );
}
