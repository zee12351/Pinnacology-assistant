'use client';
import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, FileText, Presentation, BarChart3, GitBranch, Network, Upload, Sparkles, Download, Copy, Loader2, ArrowRight, ArrowLeft, Home, Plus, Clock, ChevronLeft, ChevronRight, RefreshCw, PanelLeft, X, ChevronDown, Menu } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function callChat(message: string): Promise<string> {
  try {
    const res = await fetch(API + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message, agent_type: 'review', use_rag: false, persona: 'SCIVIZ' }),
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

const ACCENT_DEFAULT = '#2563eb';
const ACCENT_SWATCHES = ['#2563eb', '#0ea5e9', '#4f46e5', '#0d9488', '#16a34a', '#db2777', '#ea580c', '#dc2626', '#7c3aed', '#0f172a'];

// Design themes: each varies the surface background, text colour and font pairing.
// The accent colour stays independently selectable so users can mix and match.
const THEMES = [
  { id: 'classic', name: 'Classic', bg: '#ffffff', fg: '#111827', sub: '#6b7280', font: "Inter, system-ui, sans-serif" },
  { id: 'journal', name: 'Journal', bg: '#fffdf7', fg: '#1c1917', sub: '#78716c', font: "Georgia, 'Times New Roman', serif" },
  { id: 'mint', name: 'Mint', bg: '#f2fbf9', fg: '#0f3d38', sub: '#5b807a', font: "'Segoe UI', system-ui, sans-serif" },
  { id: 'lavender', name: 'Lavender', bg: '#f7f5ff', fg: '#241a45', sub: '#6b6394', font: "Verdana, system-ui, sans-serif" },
  { id: 'slate', name: 'Slate', bg: '#f4f6f8', fg: '#1e293b', sub: '#64748b', font: "'Trebuchet MS', system-ui, sans-serif" },
  { id: 'warm', name: 'Warm', bg: '#fff8f3', fg: '#3a2317', sub: '#8a6b57', font: "'Palatino Linotype', Georgia, serif" },
];

export function SciVizView({ onHome }: any) {
  const [inputMode, setInputMode] = useState('paste');
  const [inputText, setInputText] = useState('');
  const [fileName, setFileName] = useState('');
  const [figures, setFigures] = useState([] as any[]);
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
  const [mobileNav, setMobileNav] = useState(false);
  const [accent, setAccent] = useState(ACCENT_DEFAULT);
  const [themeId, setThemeId] = useState('classic');
  const [brandLogo, setBrandLogo] = useState('');
  const [brandSaved, setBrandSaved] = useState(false);
  const brandFileRef = useRef<HTMLInputElement>(null);
  const TH = THEMES.find((t) => t.id === themeId) || THEMES[0];
  // Load a saved brand kit (logo + palette + theme) once.
  useEffect(() => {
    try { const raw = localStorage.getItem('pinnovix_sciviz_brand'); if (raw) { const b = JSON.parse(raw); if (b.logo) setBrandLogo(b.logo); if (b.accent) setAccent(b.accent); if (b.theme) setThemeId(b.theme); } } catch {}
  }, []);
  const saveBrandKit = () => {
    try { localStorage.setItem('pinnovix_sciviz_brand', JSON.stringify({ logo: brandLogo, accent: accent, theme: themeId })); } catch {}
    setBrandSaved(true); setTimeout(() => setBrandSaved(false), 1500);
  };
  const onPickLogo = (e: any) => {
    const f = e.target && e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setBrandLogo(String(reader.result || ''));
    reader.readAsDataURL(f);
    if (e.target) e.target.value = '';
  };
  // Shrink font size as text grows so long titles/abstracts never overflow the canvas.
  const fitFont = (text: any, base: number, min: number, charsAtBase: number) => {
    const len = String(text || '').length;
    if (len <= charsAtBase) return base;
    return Math.max(min, Math.round(base * Math.sqrt(charsAtBase / len)));
  };
  const [editOpen, setEditOpen] = useState(false);
  const [dlMenu, setDlMenu] = useState(false);
  const dlBtnRef = useRef<HTMLButtonElement | null>(null);
  const [dlPos, setDlPos] = useState({ top: 0, left: 0 });
  const fileRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  function updateData(field: string, value: any) { setData((prev: any) => ({ ...(prev || {}), [field]: value })); }
  function updateResult(i: number, value: string) { setData((prev: any) => ({ ...prev, results: (prev.results || []).map((r: string, j: number) => j === i ? value : r) })); }
  function addResult() { setData((prev: any) => ({ ...prev, results: (prev.results || []).concat(['New finding']) })); }
  function removeResult(i: number) { setData((prev: any) => ({ ...prev, results: (prev.results || []).filter((_: any, j: number) => j !== i) })); }

  function fname(ext: string) { return (((data && data.title) || 'sciviz').slice(0, 40).replace(/[^a-z0-9]+/gi, '-') || 'sciviz') + '-' + vizType + '.' + ext; }
  function doDownloadText(text: string, name: string, mime: string) {
    const blob = new Blob([text], { type: mime });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(href);
  }

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
    setData(null); setInputText(''); setFileName(''); setSrcText(''); setMermaidSvg(''); setMindmapSvg(''); setVizType('graphical'); setSlideIdx(0); setFigures([]);
  }

  async function onPickFile(e: any) {
    const f = e.target && e.target.files && e.target.files[0];
    if (!f) return;
    setFileName(f.name);
    setFigures([]);
    setBusy(true); setPhase('Reading PDF...');
    // Extract embedded figures in the background (best-effort, PDF only).
    if (/\.pdf$/i.test(f.name)) {
      const fdF = new FormData(); fdF.append('file', f);
      fetch(API + '/api/extract-figures', { method: 'POST', body: fdF })
        .then((r) => r.json()).then((j) => setFigures((j && j.figures) || [])).catch(() => {});
    }
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
      const shape = '{"title": "a concise, specific title for this document", "authors": "authors or source if stated, else empty string", "background": "1-2 sentences on the context, problem or purpose", "methods": "1-2 sentences on the approach, process or methodology", "results": ["3-6 specific key points, findings or steps, each with concrete detail or numbers where present"], "conclusion": "1-2 sentence bottom-line takeaway", "keywords": ["4-8 key terms from the text"], "stats": [{"label": "short label", "value": "a number or percent that appears in the text"}]}';
      const prompt = 'You are turning a document into presentation visuals. Read the DOCUMENT below and extract its key content into JSON. Rules: use ONLY information found in the text and do not invent anything; keep the exact numbers, names and specifics; make each field concrete and presentation-ready (not generic). If the document is NOT a research paper (e.g. a report, playbook, guide or notes), adapt sensibly: background = purpose/context, methods = process/approach, results = the main points or steps, conclusion = the key takeaway. Only include "stats" when real numbers appear in the text; otherwise return an empty array. Return ONLY valid JSON, no markdown fences, in exactly this shape:\n' + shape + '\n\nDOCUMENT:\n' + text.slice(0, 7000);
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

  function mmClean(s: string): string {
    return String(s || '').replace(/["\n\r]/g, ' ').replace(/[()\[\]{};|<>#]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function buildMermaid(kind: string): string {
    const d = data || {};
    if (kind === 'mindmap') {
      let out = 'mindmap\n  root((' + (mmClean(d.title).slice(0, 32) || 'Research') + '))\n';
      if (d.background) out += '    Background\n      ' + mmClean(d.background).slice(0, 40) + '\n';
      if (d.methods) out += '    Methods\n      ' + mmClean(d.methods).slice(0, 40) + '\n';
      out += '    Results\n';
      (d.results || []).slice(0, 4).forEach((r: string) => { const t = mmClean(r).slice(0, 40); if (t) out += '      ' + t + '\n'; });
      if (d.conclusion) out += '    Conclusion\n      ' + mmClean(d.conclusion).slice(0, 40) + '\n';
      return out;
    }
    const bg = mmClean(d.background).slice(0, 46) || 'Background';
    const me = mmClean(d.methods).slice(0, 46) || 'Methods';
    const re = mmClean((d.results && d.results[0]) || '').slice(0, 46) || 'Key results';
    const co = mmClean(d.conclusion).slice(0, 46) || 'Conclusion';
    return 'flowchart TD\n  BG["Background: ' + bg + '"]\n  ME["Methods: ' + me + '"]\n  RE["Key result: ' + re + '"]\n  CO["Conclusion: ' + co + '"]\n  BG --> ME --> RE --> CO\n';
  }
  async function ensureMermaid(kind: string) {
    if (!data) return;
    setBusy(true); setPhase(kind === 'mindmap' ? 'Building mindmap...' : 'Building flowchart...');
    try {
      const code = buildMermaid(kind);
      await loadScript('https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js');
      const mm = (window as any).mermaid;
      mm.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
      const { svg } = await mm.render('svmmd_' + kind + '_' + Date.now(), code);
      if (kind === 'mindmap') setMindmapSvg(svg); else setMermaidSvg(svg);
    } catch {
      const msg = '<div style="color:#ef4444;padding:24px;font-size:13px">Could not render the diagram. Try a different visual type.</div>';
      if (kind === 'mindmap') setMindmapSvg(msg); else setMermaidSvg(msg);
    } finally { setBusy(false); setPhase(''); }
  }

  useEffect(() => {
    if (!data) return;
    if (vizType === 'mermaid' && !mermaidSvg) ensureMermaid('mermaid');
    if (vizType === 'mindmap' && !mindmapSvg) ensureMermaid('mindmap');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vizType, data]);

  function toggleDlMenu() {
    if (!dlMenu && dlBtnRef.current) { const r = dlBtnRef.current.getBoundingClientRect(); setDlPos({ top: r.bottom + 6, left: Math.max(8, r.right - 210) }); }
    setDlMenu((v) => !v);
  }
  async function shot(): Promise<any> {
    await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
    return (window as any).html2canvas(canvasRef.current, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
  }
  async function downloadPng() {
    if (!canvasRef.current) return;
    setDlMenu(false); setBusy(true); setPhase('Exporting PNG...');
    try { const canvas = await shot(); const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = fname('png'); a.click(); }
    catch {} finally { setBusy(false); setPhase(''); }
  }
  async function downloadPdf() {
    if (!canvasRef.current) return;
    setDlMenu(false); setBusy(true); setPhase('Exporting PDF...');
    try {
      const canvas = await shot();
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      const jsPDF = (window as any).jspdf.jsPDF;
      const w = canvas.width / 2, h = canvas.height / 2;
      const pdf = new jsPDF({ orientation: w >= h ? 'landscape' : 'portrait', unit: 'pt', format: [w, h] });
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h);
      pdf.save(fname('pdf'));
    } catch {} finally { setBusy(false); setPhase(''); }
  }
  function downloadSvg() {
    setDlMenu(false);
    const svg = vizType === 'mindmap' ? mindmapSvg : mermaidSvg;
    if (!svg) return;
    doDownloadText(svg, fname('svg'), 'image/svg+xml');
  }
  async function copyImage() {
    if (!canvasRef.current) return;
    setDlMenu(false); setBusy(true); setPhase('Copying image...');
    try {
      const canvas = await shot();
      await new Promise<void>((resolve) => canvas.toBlob(async (blob: any) => {
        try { await (navigator as any).clipboard.write([new (window as any).ClipboardItem({ 'image/png': blob })]); setPhase('Copied to clipboard!'); setTimeout(() => setPhase(''), 1200); } catch { setPhase('Copy not supported here'); setTimeout(() => setPhase(''), 1500); }
        resolve();
      }, 'image/png'));
    } catch {} finally { setBusy(false); }
  }
  async function downloadPptx() {
    if (!data) return;
    setDlMenu(false); setBusy(true); setPhase('Building PowerPoint...');
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js');
      const PptxGenJS = (window as any).PptxGenJS;
      const pptx = new PptxGenJS();
      const ac = accent.replace('#', '');
      let s = pptx.addSlide(); s.background = { color: ac };
      s.addText(data.title || 'Research', { x: 0.5, y: 2.1, w: 9, h: 1.6, fontSize: 32, bold: true, color: 'FFFFFF' });
      if (data.authors) s.addText(data.authors, { x: 0.5, y: 3.6, w: 9, h: 0.6, fontSize: 16, color: 'FFFFFF' });
      const secs: any[] = [['Background', data.background], ['Methods', data.methods]];
      secs.forEach((sec) => { if (!sec[1]) return; const sl = pptx.addSlide(); sl.addText(sec[0], { x: 0.5, y: 0.4, w: 9, h: 0.7, fontSize: 26, bold: true, color: ac }); sl.addText(String(sec[1]), { x: 0.5, y: 1.4, w: 9, h: 4, fontSize: 18, color: '333333' }); });
      if ((data.results || []).length) { const sl = pptx.addSlide(); sl.addText('Key Results', { x: 0.5, y: 0.4, w: 9, h: 0.7, fontSize: 26, bold: true, color: ac }); sl.addText((data.results || []).map((r: string) => ({ text: r, options: { bullet: true, breakLine: true } })), { x: 0.5, y: 1.4, w: 9, h: 4.5, fontSize: 18, color: '333333' }); }
      if (data.conclusion) { const sl = pptx.addSlide(); sl.addText('Conclusion', { x: 0.5, y: 0.4, w: 9, h: 0.7, fontSize: 26, bold: true, color: ac }); sl.addText(data.conclusion, { x: 0.5, y: 1.4, w: 9, h: 4, fontSize: 18, color: '333333' }); }
      await pptx.writeFile({ fileName: fname('pptx') });
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
    <div style={{ width: 820, maxWidth: '100%', background: TH.bg, color: TH.fg, borderRadius: 16, padding: 32, fontFamily: TH.font }}>
      {brandLogo ? <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}><img src={brandLogo} alt="" style={{ height: 34, objectFit: 'contain' }} /></div> : null}
      <div style={{ borderLeft: '6px solid ' + accent, paddingLeft: 14, marginBottom: 6 }}>
        <div style={{ fontSize: fitFont(data.title, 24, 15, 55), fontWeight: 800, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{data.title}</div>
        {data.authors ? <div style={{ fontSize: 13, color: TH.sub, marginTop: 4 }}>{data.authors}</div> : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, marginTop: 24 }}>
        {[{ t: 'Background', v: data.background }, { t: 'Methods', v: data.methods }, { t: 'Results', v: (data.results[0] || data.conclusion || '') }].map((c, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, background: i === 2 ? accent : '#eef2ff', color: i === 2 ? '#fff' : '#1e1b4b', borderRadius: 12, padding: 16, minHeight: 150 }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.8 }}>{c.t}</div>
              <div style={{ fontSize: 14, marginTop: 8, lineHeight: 1.45 }}>{c.v || '—'}</div>
            </div>
            {i < 2 ? <div style={{ color: accent, fontSize: 26, fontWeight: 800 }}>→</div> : null}
          </div>
        ))}
      </div>
      {data.stats && data.stats.length ? (
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          {data.stats.map((st: any, i: number) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', background: '#f9fafb', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: accent }}>{st.value}</div>
              <div style={{ fontSize: 11.5, color: TH.sub, marginTop: 2 }}>{st.label}</div>
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
    <div style={{ width: 720, background: TH.bg, color: TH.fg, borderRadius: 12, overflow: 'hidden', fontFamily: TH.font, boxShadow: '0 1px 0 #e5e7eb' }}>
      <div style={{ background: accent, color: '#fff', padding: '26px 28px' }}>
        {brandLogo ? <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}><img src={brandLogo} alt="" style={{ height: 30, objectFit: 'contain' }} /></div> : null}
        <div style={{ fontSize: fitFont(data.title, 26, 16, 55), fontWeight: 800, lineHeight: 1.15, overflowWrap: 'anywhere' }}>{data.title}</div>
        {data.authors ? <div style={{ fontSize: 13.5, opacity: 0.9, marginTop: 8 }}>{data.authors}</div> : null}
      </div>
      <div style={{ padding: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
        {[{ t: 'Introduction', v: data.background }, { t: 'Methods', v: data.methods }].map((c, i) => (
          <div key={i}>
            <div style={{ fontSize: 14, fontWeight: 800, color: accent, borderBottom: '2px solid #e5e7eb', paddingBottom: 6, marginBottom: 8 }}>{c.t}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, color: '#374151' }}>{c.v || '—'}</div>
          </div>
        ))}
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: accent, borderBottom: '2px solid #e5e7eb', paddingBottom: 6, marginBottom: 8 }}>Results</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {(data.results.length ? data.results : ['—']).map((r: string, i: number) => (
              <li key={i} style={{ fontSize: 13.5, lineHeight: 1.55, color: '#374151', marginBottom: 4 }}>{r}</li>
            ))}
          </ul>
          {data.stats && data.stats.length ? (
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              {data.stats.map((st: any, i: number) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', background: '#eef2ff', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: accent }}>{st.value}</div>
                  <div style={{ fontSize: 11, color: TH.sub }}>{st.label}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: accent, borderBottom: '2px solid #e5e7eb', paddingBottom: 6, marginBottom: 8 }}>Conclusion</div>
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
    <div style={{ width: 560, background: TH.bg, color: TH.fg, borderRadius: 12, padding: 28, fontFamily: TH.font }}>
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: fitFont(data.title, 22, 14, 50), fontWeight: 800, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{data.title}</div>
        {data.authors ? <div style={{ fontSize: 12, color: TH.sub, marginTop: 4 }}>{data.authors}</div> : null}
      </div>
      {data.stats && data.stats.length ? (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {data.stats.map((st: any, i: number) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', background: accent, color: '#fff', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{st.value}</div>
              <div style={{ fontSize: 10.5, opacity: 0.9 }}>{st.label}</div>
            </div>
          ))}
        </div>
      ) : null}
      {[{ t: 'Background', v: data.background }, { t: 'Methods', v: data.methods }, { t: 'Conclusion', v: data.conclusion }].map((c, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 30, height: 30, borderRadius: 999, background: '#eef2ff', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{i + 1}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: accent }}>{c.t}</div>
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{c.v || '—'}</div>
          </div>
        </div>
      ))}
      {data.results && data.results.length ? (
        <div style={{ marginTop: 8, background: '#f9fafb', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: accent, marginBottom: 6 }}>Key findings</div>
          {data.results.map((r: string, i: number) => (
            <div key={i} style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, display: 'flex', gap: 8 }}><span style={{ color: accent }}>●</span> {r}</div>
          ))}
        </div>
      ) : null}
    </div>
  ) : null;

  const slideCard = data ? (() => {
    const sl = slides[slideIdx] || slides[0];
    return (
      <div style={{ width: 800, height: 450, overflow: 'hidden', background: sl.kind === 'title' ? accent : TH.bg, color: sl.kind === 'title' ? '#fff' : TH.fg, borderRadius: 14, padding: 44, fontFamily: TH.font, display: 'flex', flexDirection: 'column', justifyContent: sl.kind === 'title' ? 'center' : 'flex-start', boxShadow: '0 1px 0 #e5e7eb' }}>
        {sl.kind === 'title' ? (
          <>
            <div style={{ fontSize: fitFont(sl.h, 34, 20, 45), fontWeight: 800, lineHeight: 1.15, overflowWrap: 'anywhere' }}>{sl.h}</div>
            {sl.sub ? <div style={{ fontSize: fitFont(sl.sub, 16, 12, 90), opacity: 0.9, marginTop: 16, overflowWrap: 'anywhere' }}>{sl.sub}</div> : null}
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>{sl.h}</div>
            <div style={{ width: 60, height: 4, background: accent, borderRadius: 999, margin: '12px 0 20px' }} />
            {sl.kind === 'list' ? (
              <ul style={{ margin: 0, paddingLeft: 22 }}>
                {(data.results.length ? data.results : ['—']).map((r: string, i: number) => (
                  <li key={i} style={{ fontSize: fitFont((data.results || []).join(' '), 19, 12, 220), lineHeight: 1.45, marginBottom: 8, color: TH.fg, overflowWrap: 'anywhere' }}>{r}</li>
                ))}
              </ul>
            ) : (
              <div style={{ fontSize: fitFont(sl.body, 20, 13, 240), lineHeight: 1.5, color: TH.fg, overflowWrap: 'anywhere' }}>{sl.body || '—'}</div>
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
    <aside className={'shrink-0 border-r border-border flex flex-col bg-card/40 h-full fixed md:static inset-y-0 left-0 z-[60] w-[224px] transition-transform duration-200 md:translate-x-0 ' + (mobileNav ? 'translate-x-0 ' : '-translate-x-full ') + (navOpen ? 'md:w-[224px]' : 'md:w-[56px]')}>
      <div className="flex items-center justify-between px-3 h-12 border-b border-border shrink-0">
        {(navOpen || mobileNav) ? <div className="flex items-center gap-2 text-foreground min-w-0"><span className="w-5 h-5 bg-contain bg-no-repeat bg-center shrink-0" style={{ backgroundImage: 'url(/logo.png)' }} /> <div className="flex flex-col leading-tight min-w-0"><span className="font-bold text-[13px]">SciViz</span><span className="text-[9.5px] text-muted-foreground">by Pinnovix</span></div></div> : <span className="w-5 h-5 bg-contain bg-no-repeat bg-center mx-auto" style={{ backgroundImage: 'url(/logo.png)' }} />}
        <button onClick={() => setMobileNav(false)} className="md:hidden text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        <button onClick={() => setNavOpen((v) => !v)} className="hidden md:block text-muted-foreground hover:text-foreground"><PanelLeft className="w-4 h-4" /></button>
      </div>
      <nav className="p-2 flex flex-col gap-0.5 shrink-0">
        {onHome ? <button onClick={() => { setMobileNav(false); onHome(); }} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"><Home className="w-4 h-4 shrink-0" /> {(navOpen || mobileNav) ? <span>Home</span> : null}</button> : null}
        <button onClick={() => { setMobileNav(false); resetAll(); }} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"><Plus className="w-4 h-4 shrink-0" /> {(navOpen || mobileNav) ? <span>New visual</span> : null}</button>
      </nav>
      {(navOpen || mobileNav) ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 mt-1 min-h-0">
          <div className="text-[10.5px] font-bold text-muted-foreground uppercase tracking-wide px-2 mb-1">Recents</div>
          {recents.length === 0 ? <div className="px-2 text-[12px] text-muted-foreground italic">No visuals yet.</div> : recents.slice(0, 20).map((r) => (
            <button key={r.id} onClick={() => { setMobileNav(false); openRecent(r); }} className="w-full text-left flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-foreground/80 hover:bg-muted/60 hover:text-foreground truncate"><Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> <span className="truncate">{r.title}</span></button>
          ))}
        </div>
      ) : <div className="flex-1" />}
      {onHome ? <div className="p-2 border-t border-border shrink-0"><button onClick={() => { setMobileNav(false); onHome(); }} className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"><ArrowLeft className="w-4 h-4 shrink-0" /> {(navOpen || mobileNav) ? <span>Personas</span> : null}</button></div> : null}
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
    <div className="flex flex-col md:flex-row w-full h-full overflow-hidden">
      <div className="w-full md:w-[300px] shrink-0 border-b md:border-b-0 md:border-r border-border flex flex-col h-auto md:h-full max-h-[42vh] md:max-h-none">
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
            <div className="flex flex-wrap gap-1.5 px-2 mb-2">
              {data.keywords.map((k: string, i: number) => <span key={i} className="text-[11px] bg-muted rounded-full px-2 py-0.5">{k}</span>)}
            </div>
          ) : null}
          {figures.length ? (
            <>
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide px-2 mb-1 mt-3">Figures from PDF ({figures.length})</div>
              <div className="grid grid-cols-2 gap-1.5 px-2 mb-2">
                {figures.map((fig: any, i: number) => (
                  <a key={i} href={fig.dataUrl} download={(fig.name || ('figure-' + (i + 1))).replace(/[^A-Za-z0-9._-]/g, '') + '.png'} title={'Page ' + fig.page + ' — click to download'} className="block border border-border rounded-md overflow-hidden hover:border-primary transition-colors bg-muted/40">
                    <img src={fig.dataUrl} alt={'Figure ' + (i + 1)} className="w-full h-16 object-contain" />
                    <div className="text-[9.5px] text-muted-foreground px-1 py-0.5 truncate">p{fig.page} · download</div>
                  </a>
                ))}
              </div>
            </>
          ) : null}
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide px-2 mb-1 mt-3 flex items-center justify-between">
            <span>Edit &amp; recolour</span>
            <button onClick={() => setEditOpen((v) => !v)} className="text-primary font-semibold text-[11px]">{editOpen ? 'Done' : 'Edit'}</button>
          </div>
          {editOpen ? (
            <div className="flex flex-col gap-2 px-2 pb-2">
              <div className="text-[10.5px] font-bold text-muted-foreground uppercase tracking-wide">Theme &amp; font</div>
              <div className="flex flex-wrap gap-1.5">
                {THEMES.map((t) => (
                  <button key={t.id} onClick={() => setThemeId(t.id)} title={t.name} className={'px-2 py-1 rounded-md border text-[11px] font-semibold ' + (themeId === t.id ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:border-primary')} style={{ fontFamily: t.font, background: t.bg, color: themeId === t.id ? undefined : t.fg }}>{t.name}</button>
                ))}
              </div>
              <div className="text-[10.5px] font-bold text-muted-foreground uppercase tracking-wide mt-1">Accent colour</div>
              <div className="flex flex-wrap gap-1.5">
                {ACCENT_SWATCHES.map((c) => <button key={c} onClick={() => setAccent(c)} title={c} className={'w-6 h-6 rounded-full border-2 ' + (accent === c ? 'border-foreground' : 'border-transparent')} style={{ background: c }} />)}
              </div>
              <div className="text-[10.5px] font-bold text-muted-foreground uppercase tracking-wide mt-1">Brand kit</div>
              <input ref={brandFileRef} type="file" accept="image/*" className="hidden" onChange={onPickLogo} />
              <div className="flex items-center gap-2">
                {brandLogo ? <img src={brandLogo} alt="logo" className="w-8 h-8 object-contain rounded border border-border bg-white" /> : <span className="w-8 h-8 rounded border border-dashed border-border flex items-center justify-center text-[9px] text-muted-foreground">Logo</span>}
                <button onClick={() => brandFileRef.current && brandFileRef.current.click()} className="text-[11.5px] font-semibold border border-border rounded-md px-2 py-1 hover:bg-muted">{brandLogo ? 'Change' : 'Upload logo'}</button>
                {brandLogo ? <button onClick={() => setBrandLogo('')} className="text-[11.5px] text-muted-foreground hover:text-red-500">Remove</button> : null}
              </div>
              <button onClick={saveBrandKit} className="text-[11.5px] font-semibold bg-primary text-primary-foreground rounded-md px-2.5 py-1.5 self-start">{brandSaved ? 'Saved ✓' : 'Save brand kit'}</button>
              <div className="text-[10px] text-muted-foreground -mt-1">Saves your logo, accent and theme to reuse on every visual.</div>
              <input value={data.title || ''} onChange={(e) => updateData('title', e.target.value)} placeholder="Title" className="w-full bg-muted/40 border border-border rounded-md px-2 py-1.5 text-[12.5px] outline-none focus:border-primary" />
              <input value={data.authors || ''} onChange={(e) => updateData('authors', e.target.value)} placeholder="Authors" className="w-full bg-muted/40 border border-border rounded-md px-2 py-1.5 text-[12.5px] outline-none focus:border-primary" />
              <textarea value={data.background || ''} onChange={(e) => updateData('background', e.target.value)} placeholder="Background" rows={2} className="w-full bg-muted/40 border border-border rounded-md px-2 py-1.5 text-[12.5px] outline-none focus:border-primary resize-none" />
              <textarea value={data.methods || ''} onChange={(e) => updateData('methods', e.target.value)} placeholder="Methods" rows={2} className="w-full bg-muted/40 border border-border rounded-md px-2 py-1.5 text-[12.5px] outline-none focus:border-primary resize-none" />
              <textarea value={data.conclusion || ''} onChange={(e) => updateData('conclusion', e.target.value)} placeholder="Conclusion" rows={2} className="w-full bg-muted/40 border border-border rounded-md px-2 py-1.5 text-[12.5px] outline-none focus:border-primary resize-none" />
              <div className="text-[11px] font-bold text-muted-foreground uppercase">Key findings</div>
              {(data.results || []).map((r: string, i: number) => (
                <div key={i} className="flex items-center gap-1">
                  <input value={r} onChange={(e) => updateResult(i, e.target.value)} className="flex-1 bg-muted/40 border border-border rounded-md px-2 py-1.5 text-[12.5px] outline-none focus:border-primary" />
                  <button onClick={() => removeResult(i)} className="text-muted-foreground hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <button onClick={addResult} className="text-primary text-[12px] font-semibold text-left flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add finding</button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col md:h-full overflow-hidden bg-muted/30">
        <div className="p-3 border-b border-border flex items-center gap-2 flex-wrap shrink-0 bg-card">
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
          <button ref={dlBtnRef} onClick={toggleDlMenu} disabled={busy} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] font-semibold bg-primary text-primary-foreground rounded-lg disabled:opacity-40"><Download className="w-3.5 h-3.5" /> Export <ChevronDown className="w-3 h-3" /></button>
        </div>
        <div className="flex-1 overflow-auto custom-scrollbar p-4 md:p-8 flex items-start justify-start md:justify-center">
          {busy && (vizType === 'mermaid' || vizType === 'mindmap') && !(vizType === 'mermaid' ? mermaidSvg : mindmapSvg) ? (
            <div className="flex items-center gap-2 text-muted-foreground text-[13px] mt-10"><Loader2 className="w-4 h-4 animate-spin" /> {phase}</div>
          ) : (
            <div ref={canvasRef} className="inline-block">{renderViz()}</div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  const dlMenuEl = dlMenu ? (
    <>
      <div className="fixed inset-0 z-[80]" onClick={() => setDlMenu(false)} />
      <div className="fixed z-[81] w-[210px] bg-card border border-border rounded-xl shadow-2xl p-1.5" style={{ top: dlPos.top, left: dlPos.left }}>
        <button onClick={downloadPng} className="w-full text-left px-3 py-2 rounded-lg text-[13.5px] hover:bg-muted flex items-center gap-2"><ImageIcon className="w-4 h-4 text-muted-foreground" /> PNG image</button>
        <button onClick={downloadPdf} className="w-full text-left px-3 py-2 rounded-lg text-[13.5px] hover:bg-muted flex items-center gap-2"><FileText className="w-4 h-4 text-muted-foreground" /> PDF document</button>
        {(vizType === 'mermaid' || vizType === 'mindmap') ? <button onClick={downloadSvg} className="w-full text-left px-3 py-2 rounded-lg text-[13.5px] hover:bg-muted flex items-center gap-2"><GitBranch className="w-4 h-4 text-muted-foreground" /> SVG (vector)</button> : null}
        {vizType === 'slides' ? <button onClick={downloadPptx} className="w-full text-left px-3 py-2 rounded-lg text-[13.5px] hover:bg-muted flex items-center gap-2"><Presentation className="w-4 h-4 text-muted-foreground" /> PowerPoint (.pptx)</button> : null}
        <button onClick={copyImage} className="w-full text-left px-3 py-2 rounded-lg text-[13.5px] hover:bg-muted flex items-center gap-2"><Copy className="w-4 h-4 text-muted-foreground" /> Copy image</button>
      </div>
    </>
  ) : null;

  return (
    <div className="flex w-full h-full bg-background text-foreground overflow-hidden relative">
      {mobileNav ? <div className="md:hidden fixed inset-0 bg-black/50 z-[55]" onClick={() => setMobileNav(false)} /> : null}
      {leftNav}
      <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
        <div className="md:hidden flex items-center gap-2.5 px-3 h-12 border-b border-border shrink-0 bg-card">
          <button onClick={() => setMobileNav(true)} className="text-muted-foreground hover:text-foreground p-1 -ml-1"><Menu className="w-5 h-5" /></button>
          <span className="w-5 h-5 bg-contain bg-no-repeat bg-center shrink-0" style={{ backgroundImage: 'url(/logo.png)' }} />
          <span className="font-bold text-[13px]">SciViz</span>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">{data ? workspace : startScreen}</div>
      </div>
      {dlMenuEl}
    </div>
  );
}
