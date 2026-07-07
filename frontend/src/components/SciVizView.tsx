'use client';
import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, FileText, Presentation, BarChart3, GitBranch, Network, Upload, Sparkles, Download, Copy, Loader2, ArrowRight, ArrowLeft, Home, Plus, Clock, ChevronLeft, ChevronRight, RefreshCw, FlaskConical, PanelLeft, X } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function callChat(message: string): Promise<string> {
  try {
    const res = await fetch(API + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message, agent_type: 'research', use_rag: false, persona: 'SCIVIZ' }),
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
          try { const j = JSON.parse(d); if (j.type === 'token') full += j.content; } catch {}
        }
      }
    }
    return full;
  } catch { return ''; }
}

function extractJSON(text: string): any {
  if (!text) return null;
  let t = text.trim();
  const FENCE = String.fromCharCode(96, 96, 96);
  const fs = t.indexOf(FENCE);
  if (fs !== -1) {
    const rest = t.slice(fs + 3);
    const fe = rest.indexOf(FENCE);
    if (fe !== -1) { t = rest.slice(0, fe).trim(); if (t.slice(0, 4).toLowerCase() === 'json') t = t.slice(4).trim(); }
  }
  const a = t.indexOf('{'); const b = t.lastIndexOf('}');
  if (a !== -1 && b !== -1 && b > a) t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch { return null; }
}

function stripFence(t: string): string {
  const F = String.fromCharCode(96, 96, 96);
  let x = (t || '').trim();
  const i = x.indexOf(F);
  if (i !== -1) { const rest = x.slice(i + 3); const j = rest.indexOf(F); if (j !== -1) { x = rest.slice(0, j).trim(); if (/^(mermaid|mmd)/i.test(x)) x = x.replace(/^(mermaid|mmd)\s*/i, ''); } }
  return x.trim();
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') return resolve();
    if (document.querySelector('script[data-s="' + src + '"]')) return resolve();
    const sc = document.createElement('script');
    sc.src = src; sc.setAttribute('data-s', src);
    sc.onload = () => resolve(); sc.onerror = () => reject(new Error('load'));
    document.body.appendChild(sc);
  });
}

const VIZ = [
  { id: 'graphical', label: 'Graphical Abstract', Icon: ImageIcon },
  { id: 'poster', label: 'Scientific Poster', Icon: FileText },
  { id: 'slides', label: 'Slide Deck', Icon: Presentation },
  { id: 'infographic', label: 'Infographic', Icon: BarChart3 },
  { id: 'mermaid', label: 'Flowchart', Icon: GitBranch },
  { id: 'mindmap', label: 'Mindmap', Icon: Network },
];

const IND = '#4f46e5';

export function SciVizView({ onHome }: any) {
  const [inputMode, setInputMode] = useState('paste');
  const [inputText, setInputText] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [data, setData] = useState<any>(null);
  const [vizType, setVizType] = useState('graphical');
  const [slideIdx, setSlideIdx] = useState(0);
  const [mermaidSvg, setMermaidSvg] = useState('');
  const [mindmapSvg, setMindmapSvg] = useState('');
  const [srcText, setSrcText] = useState('');
  const [recents, setRecents] = useState<any[]>([]);
  const [navOpen, setNavOpen] = useState(true);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try { const r = localStorage.getItem('pinnovix_sciviz_recents'); if (r) setRecents(JSON.parse(r)); } catch {}
  }, []);

  function pushRecent(title: string, text: string, d: any) {
    try {
      const raw = localStorage.getItem('pinnovix_sciviz_recents');
      const arr = raw ? JSON.parse(raw) : [];
      const entry = { id: Date.now(), title: (title || 'Untitled').slice(0, 60), text: text, data: d, ts: Date.now() };
      const next = [entry].concat(arr).slice(0, 30);
      localStorage.setItem('pinnovix_sciviz_recents', JSON.stringify(next));
      setRecents(next);
    } catch {}
  }

  function resetAll() {
    setData(null); setInputText(''); setFileName(''); setSrcText(''); setMermaidSvg(''); setMindmapSvg(''); setVizType('graphical'); setSlideIdx(0);
  }

  async function onPickFile(e: any) {
    const f = e.target && e.target.files && e.target.files[0];
    if (!f) return;
    setFileName(f.name);
    setBusy(true); setPhase('Reading PDF...');
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await fetch(API + '/api/parse-document', { method: 'POST', body: fd });
      const j = await r.json();
      setInputText((j && j.text) ? j.text.slice(0, 8000) : '');
    } catch { setInputText(''); }
    finally { setBusy(false); setPhase(''); if (e.target) e.target.value = ''; }
  }

  async function generate() {
    const text = inputText.trim();
    if (!text) return;
    setBusy(true); setPhase('Analysing your research...');
    setData(null); setMermaidSvg(''); setMindmapSvg(''); setSlideIdx(0);
    setSrcText(text);
    try {
      const shape = '{"title": "paper title", "authors": "author list or empty", "background": "1-2 sentence background/problem", "methods": "1-2 sentence methods", "results": ["3-5 short key findings"], "conclusion": "1-2 sentence conclusion", "keywords": ["4-6 keywords"], "stats": [{"label": "short label", "value": "a number or percent"}]}';
      const prompt = 'Extract the key content of the research text below into JSON for building visuals. Keep each field concise and presentation-ready. Include 2-4 stats only if real numbers appear in the text (else empty array). Return ONLY valid JSON in this shape: ' + shape + '\n\nResearch text:\n' + text.slice(0, 6000);
      const raw = await callChat(prompt);
      const parsed = extractJSON(raw) || {};
      const d = {
        title: parsed.title || 'Untitled research',
        authors: parsed.authors || '',
        background: parsed.background || '',
        methods: parsed.methods || '',
        results: Array.isArray(parsed.results) ? parsed.results.slice(0, 6) : [],
        conclusion: parsed.conclusion || '',
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 8) : [],
        stats: Array.isArray(parsed.stats) ? parsed.stats.slice(0, 4) : [],
      };
      setData(d);
      pushRecent(d.title, text, d);
    } catch {
      setData({ title: 'Could not analyse', authors: '', background: '', methods: '', results: [], conclusion: '', keywords: [], stats: [] });
    } finally { setBusy(false); setPhase(''); }
  }

  function openRecent(r: any) {
    setSrcText(r.text || '');
    setInputText(r.text || '');
    setData(r.data || null);
    setVizType('graphical'); setSlideIdx(0); setMermaidSvg(''); setMindmapSvg('');
  }

  async function ensureMermaid(kind: string) {
    const have = kind === 'mindmap' ? mindmapSvg : mermaidSvg;
    if (have || !srcText) return;
    setBusy(true); setPhase(kind === 'mindmap' ? 'Building mindmap...' : 'Building flowchart...');
    try {
      const ask = kind === 'mindmap'
        ? 'Create a Mermaid mindmap that summarises this research (root = topic; branches for Background, Methods, Key results, Conclusion, each with 1-3 leaf nodes). Return ONLY valid mermaid code starting with "mindmap", no code fences, no commentary.'
        : 'Create a Mermaid "flowchart TD" that visualises this research pipeline (Background/Problem -> Methods/Approach -> Key Results -> Conclusion). Use short node labels. Return ONLY valid mermaid code starting with "flowchart TD", no code fences, no commentary.';
      const raw = await callChat(ask + '\n\nResearch text:\n' + srcText.slice(0, 4000));
      let code = stripFence(raw);
      if (!code) { setBusy(false); setPhase(''); return; }
      if (kind === 'mindmap' && !/^mindmap/i.test(code)) code = 'mindmap\n' + code;
      if (kind === 'mermaid' && !/^flowchart|^graph/i.test(code)) code = 'flowchart TD\n' + code;
      await loadScript('https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js');
      const mm = (window as any).mermaid;
      mm.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
      const { svg } = await mm.render('svmmd_' + Date.now(), code);
      if (kind === 'mindmap') setMindmapSvg(svg); else setMermaidSvg(svg);
    } catch {
      const msg = '<div style="color:#ef4444;padding:24px">Could not render the diagram. Try regenerating.</div>';
      if (kind === 'mindmap') setMindmapSvg(msg); else setMermaidSvg(msg);
    } finally { setBusy(false); setPhase(''); }
  }

  useEffect(() => {
    if (!data) return;
    if (vizType === 'mermaid') ensureMermaid('mermaid');
    if (vizType === 'mindmap') ensureMermaid('mindmap');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vizType, data]);

  async function downloadPng() {
    if (!canvasRef.current) return;
    setBusy(true); setPhase('Exporting image...');
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
      const canvas = await (window as any).html2canvas(canvasRef.current, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = ((data && data.title) || 'sciviz').slice(0, 40).replace(/[^a-z0-9]+/gi, '-') + '-' + vizType + '.png';
      a.click();
    } catch {} finally { setBusy(false); setPhase(''); }
  }

  function copyMermaid() {
    const svg = vizType === 'mindmap' ? mindmapSvg : mermaidSvg;
    try { navigator.clipboard.writeText(svg); } catch {}
  }

  // ---------- Visual templates ----------
  const slides = data ? [
    { h: data.title, sub: data.authors, body: '' , kind: 'title' },
    { h: 'Background', sub: '', body: data.background, kind: 'text' },
    { h: 'Methods', sub: '', body: data.methods, kind: 'text' },
    { h: 'Key Results', sub: '', body: '', kind: 'list' },
    { h: 'Conclusion', sub: '', body: data.conclusion, kind: 'text' },
  ] : [];

  const graphical = data ? (
    <div style={{ width: 900, background: '#ffffff', color: '#111827', borderRadius: 16, padding: 32, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ borderLeft: '6px solid ' + IND, paddingLeft: 14, marginBottom: 6 }}>
        <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2 }}>{data.title}</div>
        {data.authors ? <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{data.authors}</div> : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, marginTop: 24 }}>
        {[{ t: 'Background', v: data.background }, { t: 'Methods', v: data.methods }, { t: 'Results', v: (data.results[0] || data.conclusion || '') }].map((c, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, background: i === 2 ? IND : '#eef2ff', color: i === 2 ? '#fff' : '#1e1b4b', borderRadius: 12, padding: 16, minHeight: 150 }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.8 }}>{c.t}</div>
              <div style={{ fontSize: 14, marginTop: 8, lineHeight: 1.45 }}>{c.v || '—'}</div>
            </div>
            {i < 2 ? <div style={{ color: IND, fontSize: 26, fontWeight: 800 }}>→</div> : null}
          </div>
        ))}
      </div>
      {data.stats && data.stats.length ? (
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          {data.stats.map((st: any, i: number) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', background: '#f9fafb', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: IND }}>{st.value}</div>
              <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>{st.label}</div>
            </div>
          ))}
        </div>
      ) : null}
      <div style={{ marginTop: 20, background: '#111827', color: '#fff', borderRadius: 12, padding: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: '#a5b4fc' }}>Bottom line&nbsp;&nbsp;</span>
        <span style={{ fontSize: 14 }}>{data.conclusion || (data.results[0] || '')}</span>
      </div>
    </div>
  ) : null;

  const poster = data ? (
    <div style={{ width: 720, background: '#ffffff', color: '#111827', borderRadius: 12, overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif', boxShadow: '0 1px 0 #e5e7eb' }}>
      <div style={{ background: IND, color: '#fff', padding: '26px 28px' }}>
        <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.15 }}>{data.title}</div>
        {data.authors ? <div style={{ fontSize: 13.5, opacity: 0.9, marginTop: 8 }}>{data.authors}</div> : null}
      </div>
      <div style={{ padding: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
        {[{ t: 'Introduction', v: data.background }, { t: 'Methods', v: data.methods }].map((c, i) => (
          <div key={i}>
            <div style={{ fontSize: 14, fontWeight: 800, color: IND, borderBottom: '2px solid #e5e7eb', paddingBottom: 6, marginBottom: 8 }}>{c.t}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, color: '#374151' }}>{c.v || '—'}</div>
          </div>
        ))}
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: IND, borderBottom: '2px solid #e5e7eb', paddingBottom: 6, marginBottom: 8 }}>Results</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {(data.results.length ? data.results : ['—']).map((r: string, i: number) => (
              <li key={i} style={{ fontSize: 13.5, lineHeight: 1.55, color: '#374151', marginBottom: 4 }}>{r}</li>
            ))}
          </ul>
          {data.stats && data.stats.length ? (
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              {data.stats.map((st: any, i: number) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', background: '#eef2ff', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: IND }}>{st.value}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{st.label}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: IND, borderBottom: '2px solid #e5e7eb', paddingBottom: 6, marginBottom: 8 }}>Conclusion</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: '#374151' }}>{data.conclusion || '—'}</div>
        </div>
      </div>
      {data.keywords && data.keywords.length ? (
        <div style={{ padding: '0 28px 24px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {data.keywords.map((k: string, i: number) => (
            <span key={i} style={{ fontSize: 11.5, background: '#f3f4f6', color: '#374151', borderRadius: 999, padding: '4px 10px' }}>{k}</span>
          ))}
        </div>
      ) : null}
    </div>
  ) : null;

  const infographic = data ? (
    <div style={{ width: 560, background: '#ffffff', color: '#111827', borderRadius: 12, padding: 28, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>{data.title}</div>
        {data.authors ? <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{data.authors}</div> : null}
      </div>
      {data.stats && data.stats.length ? (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {data.stats.map((st: any, i: number) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', background: IND, color: '#fff', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{st.value}</div>
              <div style={{ fontSize: 10.5, opacity: 0.9 }}>{st.label}</div>
            </div>
          ))}
        </div>
      ) : null}
      {[{ t: 'Background', v: data.background }, { t: 'Methods', v: data.methods }, { t: 'Conclusion', v: data.conclusion }].map((c, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 30, height: 30, borderRadius: 999, background: '#eef2ff', color: IND, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{i + 1}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: IND }}>{c.t}</div>
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{c.v || '—'}</div>
          </div>
        </div>
      ))}
      {data.results && data.results.length ? (
        <div style={{ marginTop: 8, background: '#f9fafb', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: IND, marginBottom: 6 }}>Key findings</div>
          {data.results.map((r: string, i: number) => (
            <div key={i} style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, display: 'flex', gap: 8 }}><span style={{ color: IND }}>●</span> {r}</div>
          ))}
        </div>
      ) : null}
    </div>
  ) : null;

  const slideCard = data ? (() => {
    const sl = slides[slideIdx] || slides[0];
    return (
      <div style={{ width: 800, height: 450, background: sl.kind === 'title' ? IND : '#ffffff', color: sl.kind === 'title' ? '#fff' : '#111827', borderRadius: 14, padding: 44, fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', flexDirection: 'column', justifyContent: sl.kind === 'title' ? 'center' : 'flex-start', boxShadow: '0 1px 0 #e5e7eb' }}>
        {sl.kind === 'title' ? (
          <>
            <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.15 }}>{sl.h}</div>
            {sl.sub ? <div style={{ fontSize: 16, opacity: 0.9, marginTop: 16 }}>{sl.sub}</div> : null}
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 800, color: IND, textTransform: 'uppercase', letterSpacing: 0.5 }}>{sl.h}</div>
            <div style={{ width: 60, height: 4, background: IND, borderRadius: 999, margin: '12px 0 20px' }} />
            {sl.kind === 'list' ? (
              <ul style={{ margin: 0, paddingLeft: 22 }}>
                {(data.results.length ? data.results : ['—']).map((r: string, i: number) => (
                  <li key={i} style={{ fontSize: 19, lineHeight: 1.5, marginBottom: 10, color: '#374151' }}>{r}</li>
                ))}
              </ul>
            ) : (
              <div style={{ fontSize: 20, lineHeight: 1.55, color: '#374151' }}>{sl.body || '—'}</div>
            )}
          </>
        )}
      </div>
    );
  })() : null;

  const renderViz = () => {
    if (vizType === 'graphical') return graphical;
    if (vizType === 'poster') return poster;
    if (vizType === 'infographic') return infographic;
    if (vizType === 'slides') return slideCard;
    if (vizType === 'mermaid') return <div style={{ background: '#fff', borderRadius: 12, padding: 24, minWidth: 400 }} dangerouslySetInnerHTML={{ __html: mermaidSvg || '' }} />;
    if (vizType === 'mindmap') return <div style={{ background: '#fff', borderRadius: 12, padding: 24, minWidth: 400 }} dangerouslySetInnerHTML={{ __html: mindmapSvg || '' }} />;
    return null;
  };

  const leftNav = (
    <aside className={(navOpen ? 'w-[224px]' : 'w-[56px]') + ' shrink-0 border-r border-border flex flex-col bg-card/40 h-full'}>
      <div className="flex items-center justify-between px-3 h-12 border-b border-border shrink-0">
        {navOpen ? <div className="flex items-center gap-2 text-foreground min-w-0"><FlaskConical className="w-4 h-4 text-primary shrink-0" /> <div className="flex flex-col leading-tight min-w-0"><span className="font-bold text-[13px]">SciViz</span><span className="text-[9.5px] text-muted-foreground">by Pinnovix</span></div></div> : <FlaskConical className="w-4 h-4 text-primary mx-auto" />}
        <button onClick={() => setNavOpen((v) => !v)} className="text-muted-foreground hover:text-foreground"><PanelLeft className="w-4 h-4" /></button>
      </div>
      <nav className="p-2 flex flex-col gap-0.5 shrink-0">
        {onHome ? <button onClick={onHome} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"><Home className="w-4 h-4 shrink-0" /> {navOpen ? <span>Home</span> : null}</button> : null}
        <button onClick={resetAll} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"><Plus className="w-4 h-4 shrink-0" /> {navOpen ? <span>New visual</span> : null}</button>
      </nav>
      {navOpen ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 mt-1 min-h-0">
          <div className="text-[10.5px] font-bold text-muted-foreground uppercase tracking-wide px-2 mb-1">Recents</div>
          {recents.length === 0 ? <div className="px-2 text-[12px] text-muted-foreground italic">No visuals yet.</div> : recents.slice(0, 20).map((r) => (
            <button key={r.id} onClick={() => openRecent(r)} className="w-full text-left flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-foreground/80 hover:bg-muted/60 hover:text-foreground truncate"><Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> <span className="truncate">{r.title}</span></button>
          ))}
        </div>
      ) : <div className="flex-1" />}
      {onHome ? <div className="p-2 border-t border-border shrink-0"><button onClick={onHome} className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"><ArrowLeft className="w-4 h-4 shrink-0" /> {navOpen ? <span>Personas</span> : null}</button></div> : null}
    </aside>
  );

  const startScreen = (
    <div className="flex w-full h-full items-start justify-center overflow-y-auto custom-scrollbar">
      <div className="w-full max-w-2xl mt-[8vh] px-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">Your research, worth a thousand words</h1>
          <p className="text-muted-foreground text-sm mt-1">Drop in a PDF or paste an abstract, and watch it become a poster, slide deck, infographic, graphical abstract, flowchart or mindmap in seconds.</p>
        </div>
        <div className="border border-border rounded-2xl bg-card shadow-sm overflow-hidden">
          <div className="flex border-b border-border">
            <button onClick={() => setInputMode('paste')} className={(inputMode === 'paste' ? 'text-primary border-b-2 border-primary ' : 'text-muted-foreground ') + 'flex-1 py-3 text-[13.5px] font-semibold'}>Paste abstract</button>
            <button onClick={() => setInputMode('pdf')} className={(inputMode === 'pdf' ? 'text-primary border-b-2 border-primary ' : 'text-muted-foreground ') + 'flex-1 py-3 text-[13.5px] font-semibold'}>Upload PDF</button>
          </div>
          {inputMode === 'paste' ? (
            <div>
              <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} rows={6} autoFocus placeholder="Paste your abstract or research summary here..." className="w-full bg-transparent px-4 py-3 text-[14px] outline-none resize-none placeholder:text-muted-foreground" />
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-[12px] text-muted-foreground">{inputText.trim() ? inputText.trim().split(/\s+/).length : 0} words</span>
                <button onClick={generate} disabled={!inputText.trim() || busy} className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-[13.5px] font-semibold disabled:opacity-40">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate</button>
              </div>
            </div>
          ) : (
            <div className="p-6">
              <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={onPickFile} />
              <button onClick={() => fileRef.current && fileRef.current.click()} className="w-full border-2 border-dashed border-border rounded-xl py-10 flex flex-col items-center gap-2 hover:border-primary transition-colors">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <span className="text-[13.5px] font-semibold">{fileName || 'Click to upload a PDF'}</span>
                <span className="text-[12px] text-muted-foreground">PDF, DOCX, TXT or MD</span>
              </button>
              {inputText ? <div className="text-[12px] text-muted-foreground mt-3">{inputText.trim().split(/\s+/).length} words extracted.</div> : null}
              <div className="flex justify-end mt-4">
                <button onClick={generate} disabled={!inputText.trim() || busy} className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-[13.5px] font-semibold disabled:opacity-40">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate</button>
              </div>
            </div>
          )}
        </div>
        {busy ? <div className="flex items-center justify-center gap-2 text-muted-foreground text-[13px] mt-4"><Loader2 className="w-4 h-4 animate-spin" /> {phase}</div> : null}
        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mt-6 mb-2 text-center">Choose what to see first</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {VIZ.map((v) => (
            <button key={v.id} onClick={() => setVizType(v.id)} className={(vizType === v.id ? 'border-primary text-primary ' : 'border-border text-muted-foreground hover:border-primary ') + 'flex items-center gap-2 border rounded-xl px-3 py-2.5 text-[12.5px] transition-colors'}><v.Icon className="w-4 h-4 text-primary" /> {v.label}</button>
          ))}
        </div>
      </div>
    </div>
  );

  const workspace = data ? (
    <div className="flex w-full h-full overflow-hidden">
      <div className="w-[300px] shrink-0 border-r border-border flex flex-col h-full">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="font-semibold text-[14px] truncate pr-2">{data.title}</div>
          <button onClick={resetAll} className="text-[12.5px] text-primary font-semibold flex items-center gap-1 shrink-0"><Plus className="w-3.5 h-3.5" /> New</button>
        </div>
        <div className="p-3 flex flex-col gap-1 overflow-y-auto custom-scrollbar">
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide px-2 mb-1">Visual type</div>
          {VIZ.map((v) => (
            <button key={v.id} onClick={() => setVizType(v.id)} className={(vizType === v.id ? 'bg-muted text-foreground font-semibold ' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground ') + 'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition-colors'}><v.Icon className="w-4 h-4 shrink-0" /> {v.label}</button>
          ))}
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide px-2 mb-1 mt-4">Extracted</div>
          {data.keywords && data.keywords.length ? (
            <div className="flex flex-wrap gap-1.5 px-2">
              {data.keywords.map((k: string, i: number) => <span key={i} className="text-[11px] bg-muted rounded-full px-2 py-0.5">{k}</span>)}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-muted/30">
        <div className="p-3 border-b border-border flex items-center gap-2 shrink-0 bg-card">
          <span className="text-[13px] font-semibold">{(VIZ.find((v) => v.id === vizType) || {}).label}</span>
          {vizType === 'slides' && data ? (
            <div className="flex items-center gap-1 ml-2">
              <button onClick={() => setSlideIdx((i) => Math.max(0, i - 1))} className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-[12px] text-muted-foreground">{slideIdx + 1} / {slides.length}</span>
              <button onClick={() => setSlideIdx((i) => Math.min(slides.length - 1, i + 1))} className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted"><ChevronRight className="w-4 h-4" /></button>
            </div>
          ) : null}
          <div className="flex-1" />
          {(vizType === 'mermaid' || vizType === 'mindmap') ? (
            <>
              <button onClick={() => { if (vizType === 'mindmap') setMindmapSvg(''); else setMermaidSvg(''); setTimeout(() => ensureMermaid(vizType), 30); }} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] font-semibold border border-border rounded-lg hover:bg-muted"><RefreshCw className="w-3.5 h-3.5" /> Regenerate</button>
              <button onClick={copyMermaid} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] font-semibold border border-border rounded-lg hover:bg-muted"><Copy className="w-3.5 h-3.5" /> Copy SVG</button>
            </>
          ) : null}
          <button onClick={downloadPng} disabled={busy} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] font-semibold bg-primary text-primary-foreground rounded-lg disabled:opacity-40"><Download className="w-3.5 h-3.5" /> Download PNG</button>
        </div>
        <div className="flex-1 overflow-auto custom-scrollbar p-8 flex items-start justify-center">
          {busy && (vizType === 'mermaid' || vizType === 'mindmap') && !(vizType === 'mermaid' ? mermaidSvg : mindmapSvg) ? (
            <div className="flex items-center gap-2 text-muted-foreground text-[13px] mt-10"><Loader2 className="w-4 h-4 animate-spin" /> {phase}</div>
          ) : (
            <div ref={canvasRef} className="inline-block">{renderViz()}</div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="flex w-full h-full bg-background text-foreground overflow-hidden">
      {leftNav}
      <div className="flex-1 min-w-0 h-full overflow-hidden">{data ? workspace : startScreen}</div>
    </div>
  );
}
