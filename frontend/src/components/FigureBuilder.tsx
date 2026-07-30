import { useEffect, useRef, useState } from 'react';
import { Type, Square, Circle, MoveRight, Trash2, Copy, Sparkles, Download, Search, Layers, Loader2, Undo2, Image as ImageIcon } from 'lucide-react';
import { authHeaders } from '@/lib/supabaseClient';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function fbCallChat(message: string): Promise<string> {
  try {
    const res = await fetch(API + '/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ message, agent_type: 'review', use_rag: false, persona: 'SCIVIZ' }),
    });
    const reader = res.body ? res.body.getReader() : null;
    const dec = new TextDecoder(); let buffer = '', full = '';
    while (reader) {
      const chunk = await reader.read(); if (chunk.done) break;
      buffer += dec.decode(chunk.value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      for (const line of lines) { if (line.indexOf('data: ') === 0) { const d = line.slice(6); if (d === '[DONE]') continue; try { const j = JSON.parse(d); if (j.type === 'token') full += j.content; } catch {} } }
    }
    return full;
  } catch { return ''; }
}
function fbExtractJSON(text: string): any {
  if (!text) return null;
  let t = String(text).trim();
  const f = t.indexOf('{'); const a = t.indexOf('[');
  const start = (a !== -1 && (f === -1 || a < f)) ? a : f;
  if (start === -1) return null;
  const open = t[start]; const close = open === '{' ? '}' : ']';
  let depth = 0, end = -1;
  for (let i = start; i < t.length; i++) { if (t[i] === open) depth++; else if (t[i] === close) { depth--; if (depth === 0) { end = i; break; } } }
  if (end === -1) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch { return null; }
}

// Scientific "icon library" built from unicode/emoji glyphs — reliable everywhere, exports cleanly.
const ICON_LIB: { cat: string; items: { c: string; n: string }[] }[] = [
  { cat: 'Biology', items: [
    { c: '🧬', n: 'dna' }, { c: '🦠', n: 'microbe virus' }, { c: '🧫', n: 'petri dish culture' }, { c: '🧪', n: 'test tube' }, { c: '⚗️', n: 'alembic flask' }, { c: '🔬', n: 'microscope' },
    { c: '🧠', n: 'brain neuron' }, { c: '🫀', n: 'heart cardiac' }, { c: '🫁', n: 'lungs' }, { c: '🦴', n: 'bone' }, { c: '🩸', n: 'blood drop' }, { c: '🦷', n: 'tooth' },
    { c: '🐁', n: 'mouse model' }, { c: '🐀', n: 'rat' }, { c: '🐇', n: 'rabbit' }, { c: '🐟', n: 'fish zebrafish' }, { c: '🪰', n: 'fly drosophila' }, { c: '🌱', n: 'plant seedling' }, { c: '🍃', n: 'leaf' }, { c: '🍄', n: 'fungus mushroom' },
  ] },
  { cat: 'Medical', items: [
    { c: '💊', n: 'pill drug' }, { c: '💉', n: 'syringe injection vaccine' }, { c: '🩹', n: 'bandage' }, { c: '🩺', n: 'stethoscope' }, { c: '🏥', n: 'hospital' }, { c: '🧑‍⚕️', n: 'doctor clinician' }, { c: '🧑‍🔬', n: 'scientist researcher' },
    { c: '👤', n: 'person patient' }, { c: '👥', n: 'group population cohort' }, { c: '🧑', n: 'human' }, { c: '🦾', n: 'prosthetic' }, { c: '🩻', n: 'x-ray' },
  ] },
  { cat: 'Chemistry', items: [
    { c: '⚗️', n: 'reaction' }, { c: '🧪', n: 'tube' }, { c: '💧', n: 'water drop solution' }, { c: '🔥', n: 'heat flame' }, { c: '❄️', n: 'cold freeze' }, { c: '🧊', n: 'ice' }, { c: '⚡', n: 'energy' }, { c: '🧲', n: 'magnet' }, { c: '☢️', n: 'radiation' }, { c: '🧴', n: 'reagent bottle' }, { c: '🌡️', n: 'temperature' },
  ] },
  { cat: 'Flow', items: [
    { c: '➡️', n: 'arrow right' }, { c: '⬅️', n: 'arrow left' }, { c: '⬆️', n: 'arrow up' }, { c: '⬇️', n: 'arrow down' }, { c: '🔁', n: 'cycle loop' }, { c: '⏱️', n: 'time timer' }, { c: '✅', n: 'check yes' }, { c: '❌', n: 'no cross' }, { c: '⚠️', n: 'warning' }, { c: '⭐', n: 'star key' }, { c: '📊', n: 'bar chart' }, { c: '📈', n: 'line chart up' }, { c: '📉', n: 'chart down' }, { c: '🔗', n: 'link' }, { c: '🎯', n: 'target' },
  ] },
];

type El = { id: string; type: 'icon' | 'text' | 'rect' | 'ellipse' | 'arrow'; x: number; y: number; w: number; h: number; x2?: number; y2?: number; char?: string; text?: string; color: string; size: number; fill?: string };

const CANVAS_W = 960, CANVAS_H = 600;
const PALETTE = ['#0f172a', '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#16a34a', '#0891b2', '#64748b', '#ffffff'];

export function FigureBuilder({ accent = '#2563eb', seedText = '' }: { accent?: string; seedText?: string }) {
  const [els, setEls] = useState<El[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [cat, setCat] = useState('Biology');
  const [iconSearch, setIconSearch] = useState('');
  const [aiText, setAiText] = useState(seedText ? seedText.slice(0, 400) : '');
  const [aiBusy, setAiBusy] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; mode: 'move' | 'end' } | null>(null);
  const uid = () => Math.random().toString(36).slice(2, 9);

  // Convert a client point to SVG canvas coordinates.
  const toSvg = (clientX: number, clientY: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return { x: clientX, y: clientY };
    return { x: ((clientX - r.left) / r.width) * CANVAS_W, y: ((clientY - r.top) / r.height) * CANVAS_H };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!drag.current) return;
      const p = toSvg(e.clientX, e.clientY);
      setEls((prev) => prev.map((el) => {
        if (el.id !== drag.current!.id) return el;
        if (drag.current!.mode === 'end') return { ...el, x2: p.x, y2: p.y };
        const nx = p.x - drag.current!.dx, ny = p.y - drag.current!.dy;
        if (el.type === 'arrow') { const ox = nx - el.x, oy = ny - el.y; return { ...el, x: nx, y: ny, x2: (el.x2 || 0) + ox, y2: (el.y2 || 0) + oy }; }
        return { ...el, x: nx, y: ny };
      }));
    };
    const onUp = () => { drag.current = null; };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, []);

  const startDrag = (e: any, el: El, mode: 'move' | 'end' = 'move') => {
    e.stopPropagation(); setSel(el.id);
    const p = toSvg(e.clientX, e.clientY);
    drag.current = { id: el.id, dx: p.x - el.x, dy: p.y - el.y, mode };
  };

  const addIcon = (char: string) => { setEls((p) => [...p, { id: uid(), type: 'icon', x: 430 + Math.random() * 80, y: 250 + Math.random() * 80, w: 56, h: 56, char, color: '#0f172a', size: 52 }]); };
  const addText = () => { const id = uid(); setEls((p) => [...p, { id, type: 'text', x: 400, y: 300, w: 160, h: 30, text: 'Double-click to edit', color: '#0f172a', size: 20 }]); setSel(id); };
  const addShape = (type: 'rect' | 'ellipse') => { const id = uid(); setEls((p) => [...p, { id, type, x: 400, y: 260, w: 180, h: 110, color: accent, size: 2, fill: 'rgba(37,99,235,0.08)' }]); setSel(id); };
  const addArrow = () => { const id = uid(); setEls((p) => [...p, { id, type: 'arrow', x: 380, y: 320, x2: 560, y2: 320, w: 0, h: 0, color: '#334155', size: 3 }]); setSel(id); };
  const delSel = () => { if (sel) { setEls((p) => p.filter((e) => e.id !== sel)); setSel(null); } };
  const dupSel = () => { const e = els.find((x) => x.id === sel); if (e) { const n = { ...e, id: uid(), x: e.x + 24, y: e.y + 24, x2: (e.x2 || 0) + 24, y2: (e.y2 || 0) + 24 }; setEls((p) => [...p, n]); setSel(n.id); } };
  const patch = (u: Partial<El>) => { if (sel) setEls((p) => p.map((e) => e.id === sel ? { ...e, ...u } : e)); };
  const editText = (el: El) => { const t = window.prompt('Edit label:', el.text || ''); if (t != null) setEls((p) => p.map((e) => e.id === el.id ? { ...e, text: t } : e)); };
  const selEl = els.find((e) => e.id === sel);

  // Templates
  const applyTemplate = (kind: string) => {
    const mk = (o: Partial<El>): El => ({ id: uid(), type: 'rect', x: 0, y: 0, w: 0, h: 0, color: '#0f172a', size: 2, ...o } as El);
    if (kind === 'pathway') {
      const y = 290; const xs = [140, 400, 660]; const labels = ['Stimulus', 'Signal', 'Response']; const icons = ['⚡', '🧬', '🫀'];
      const out: El[] = [];
      xs.forEach((x, i) => { out.push(mk({ type: 'icon', x, y: y - 40, w: 56, h: 56, char: icons[i], size: 52 })); out.push(mk({ type: 'text', x: x - 20, y: y + 40, w: 120, h: 24, text: labels[i], size: 18 })); if (i < xs.length - 1) out.push(mk({ type: 'arrow', x: x + 60, y, x2: xs[i + 1] - 6, y2: y, color: '#334155', size: 3 })); });
      setEls(out);
    } else if (kind === 'workflow') {
      const steps = ['👥', '💉', '🔬', '📊']; const labels = ['Cohort', 'Treatment', 'Assay', 'Analysis']; const out: El[] = [];
      steps.forEach((c, i) => { const x = 120 + i * 210; out.push(mk({ type: 'rect', x: x - 20, y: 250, w: 150, h: 120, color: accent, fill: 'rgba(37,99,235,0.06)' })); out.push(mk({ type: 'icon', x: x + 25, y: 262, w: 50, h: 50, char: c, size: 46 })); out.push(mk({ type: 'text', x: x - 8, y: 345, w: 140, h: 22, text: labels[i], size: 16 })); if (i < 3) out.push(mk({ type: 'arrow', x: x + 130, y: 310, x2: x + 190, y2: 310, color: '#334155', size: 3 })); });
      setEls(out);
    } else if (kind === 'compare') {
      const out: El[] = [];
      out.push(mk({ type: 'rect', x: 120, y: 200, w: 300, h: 240, color: '#16a34a', fill: 'rgba(22,163,74,0.06)' }));
      out.push(mk({ type: 'rect', x: 540, y: 200, w: 300, h: 240, color: '#dc2626', fill: 'rgba(220,38,38,0.06)' }));
      out.push(mk({ type: 'text', x: 200, y: 215, w: 160, h: 26, text: 'Group A', size: 20, color: '#16a34a' }));
      out.push(mk({ type: 'text', x: 620, y: 215, w: 160, h: 26, text: 'Group B', size: 20, color: '#dc2626' }));
      out.push(mk({ type: 'icon', x: 240, y: 280, w: 56, h: 56, char: '🧑', size: 52 }));
      out.push(mk({ type: 'icon', x: 660, y: 280, w: 56, h: 56, char: '🧑', size: 52 }));
      setEls(out);
    }
    setSel(null);
  };

  // AI: describe a process -> nodes + edges -> auto-place.
  const aiGenerate = async () => {
    const q = aiText.trim(); if (!q || aiBusy) return;
    setAiBusy(true);
    try {
      const prompt = 'You are a scientific figure planner. From the description below, produce a simple left-to-right figure. Return ONLY JSON: {"nodes":[{"label":"short 1-3 word label","icon":"ONE emoji best representing it"}],"edges":[[fromIndex,toIndex]]}. Use 3-6 nodes. Pick emojis from science/medicine (🧬🦠🧫🔬💊💉🫀🧠👥🐁📊⚡🌱).\n\nDescription: ' + q;
      const raw = await fbCallChat(prompt);
      const j = fbExtractJSON(raw);
      const nodes = j && Array.isArray(j.nodes) ? j.nodes.slice(0, 6) : null;
      if (!nodes || !nodes.length) { setAiBusy(false); return; }
      const edges = j && Array.isArray(j.edges) ? j.edges : nodes.map((_: any, i: number) => [i, i + 1]).slice(0, nodes.length - 1);
      const out: El[] = [];
      const n = nodes.length; const gap = Math.min(230, (CANVAS_W - 160) / n); const startX = (CANVAS_W - gap * (n - 1)) / 2; const y = 280;
      const cx: number[] = [];
      nodes.forEach((nd: any, i: number) => {
        const x = startX + i * gap; cx.push(x);
        out.push({ id: uid(), type: 'icon', x: x - 26, y: y - 30, w: 56, h: 56, char: (nd.icon || '⭐').slice(0, 2), color: '#0f172a', size: 50 });
        out.push({ id: uid(), type: 'text', x: x - 60, y: y + 42, w: 120, h: 22, text: String(nd.label || '').slice(0, 24), color: '#0f172a', size: 16 });
      });
      edges.forEach((e: any) => { const a = e[0], b = e[1]; if (cx[a] != null && cx[b] != null && a !== b) out.push({ id: uid(), type: 'arrow', x: cx[a] + 32, y, x2: cx[b] - 32, y2: y, w: 0, h: 0, color: '#334155', size: 3 }); });
      setEls(out); setSel(null);
    } catch {}
    setAiBusy(false);
  };

  // Serialize current canvas to a standalone SVG string.
  const toSvgString = () => {
    const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let body = '';
    els.forEach((el) => {
      if (el.type === 'rect') body += `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" rx="10" fill="${el.fill || 'none'}" stroke="${el.color}" stroke-width="${el.size}"/>`;
      else if (el.type === 'ellipse') body += `<ellipse cx="${el.x + el.w / 2}" cy="${el.y + el.h / 2}" rx="${el.w / 2}" ry="${el.h / 2}" fill="${el.fill || 'none'}" stroke="${el.color}" stroke-width="${el.size}"/>`;
      else if (el.type === 'arrow') body += `<line x1="${el.x}" y1="${el.y}" x2="${el.x2}" y2="${el.y2}" stroke="${el.color}" stroke-width="${el.size}" marker-end="url(#fbarrow)"/>`;
      else if (el.type === 'icon') body += `<text x="${el.x}" y="${el.y + el.size}" font-size="${el.size}" font-family="'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif">${esc(el.char || '')}</text>`;
      else if (el.type === 'text') body += `<text x="${el.x}" y="${el.y + el.size}" font-size="${el.size}" font-weight="600" fill="${el.color}" font-family="Inter,Arial,sans-serif" text-anchor="middle">${esc(el.text || '')}</text>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}"><defs><marker id="fbarrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#334155"/></marker></defs><rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#ffffff"/>${body}</svg>`;
  };
  const download = (blob: Blob, name: string) => { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u); };
  const exportSvg = () => download(new Blob([toSvgString()], { type: 'image/svg+xml' }), 'figure.svg');
  const exportPng = () => {
    const svg = toSvgString(); const img = new Image(); const scale = 2;
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = CANVAS_W * scale; c.height = CANVAS_H * scale;
      const ctx = c.getContext('2d'); if (!ctx) return; ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
      c.toBlob((b) => { if (b) download(b, 'figure.png'); }, 'image/png');
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  };

  const iconItems = (() => {
    const q = iconSearch.trim().toLowerCase();
    if (q) { const all = ICON_LIB.flatMap((g) => g.items); return all.filter((it) => it.n.includes(q) || it.c === q); }
    return (ICON_LIB.find((g) => g.cat === cat) || ICON_LIB[0]).items;
  })();

  return (
    <div className="flex w-full gap-3" style={{ minHeight: 620 }}>
      {/* Icon library */}
      <div className="w-[220px] shrink-0 border border-border rounded-xl bg-card flex flex-col overflow-hidden">
        <div className="px-3 py-2.5 border-b border-border flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground uppercase tracking-wide"><Layers className="w-3.5 h-3.5" /> Icons</div>
        <div className="p-2 border-b border-border">
          <div className="relative"><Search className="w-3.5 h-3.5 absolute left-2 top-2 text-muted-foreground" /><input value={iconSearch} onChange={(e) => setIconSearch(e.target.value)} placeholder="Search icons" className="w-full bg-muted/40 border border-border rounded-lg pl-7 pr-2 py-1.5 text-[12.5px] outline-none focus:border-primary" /></div>
        </div>
        {!iconSearch ? (
          <div className="flex flex-wrap gap-1 px-2 py-1.5 border-b border-border">
            {ICON_LIB.map((g) => <button key={g.cat} onClick={() => setCat(g.cat)} className={'text-[11px] font-semibold px-2 py-1 rounded-md ' + (cat === g.cat ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted')}>{g.cat}</button>)}
          </div>
        ) : null}
        <div className="flex-1 overflow-y-auto p-2 grid grid-cols-4 gap-1 content-start">
          {iconItems.map((it, i) => <button key={i} onClick={() => addIcon(it.c)} title={it.n} className="aspect-square rounded-lg hover:bg-muted flex items-center justify-center text-[22px]">{it.c}</button>)}
        </div>
      </div>

      {/* Canvas + toolbars */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {/* AI text-to-figure */}
        <div className="border border-border rounded-xl bg-card p-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <input value={aiText} onChange={(e) => setAiText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') aiGenerate(); }} placeholder="Describe a process, e.g. 'virus infects cell, replicates, triggers immune response'" className="flex-1 bg-transparent text-[13px] outline-none" />
          <button onClick={aiGenerate} disabled={aiBusy || !aiText.trim()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-semibold bg-primary text-primary-foreground rounded-lg disabled:opacity-40">{aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Generate</button>
        </div>

        {/* Toolbar */}
        <div className="border border-border rounded-xl bg-card p-1.5 flex items-center gap-1 flex-wrap">
          <button onClick={addText} title="Text" className="p-2 rounded-lg hover:bg-muted"><Type className="w-4 h-4" /></button>
          <button onClick={() => addShape('rect')} title="Rectangle" className="p-2 rounded-lg hover:bg-muted"><Square className="w-4 h-4" /></button>
          <button onClick={() => addShape('ellipse')} title="Ellipse" className="p-2 rounded-lg hover:bg-muted"><Circle className="w-4 h-4" /></button>
          <button onClick={addArrow} title="Arrow" className="p-2 rounded-lg hover:bg-muted"><MoveRight className="w-4 h-4" /></button>
          <div className="w-px h-5 bg-border mx-1" />
          <button onClick={dupSel} disabled={!sel} title="Duplicate" className="p-2 rounded-lg hover:bg-muted disabled:opacity-30"><Copy className="w-4 h-4" /></button>
          <button onClick={delSel} disabled={!sel} title="Delete" className="p-2 rounded-lg hover:bg-muted disabled:opacity-30 text-red-500"><Trash2 className="w-4 h-4" /></button>
          <button onClick={() => { setEls([]); setSel(null); }} disabled={!els.length} title="Clear" className="p-2 rounded-lg hover:bg-muted disabled:opacity-30"><Undo2 className="w-4 h-4" /></button>
          {/* Selected element controls */}
          {selEl ? (
            <>
              <div className="w-px h-5 bg-border mx-1" />
              {selEl.type !== 'arrow' ? <button onClick={() => patch({ size: Math.max(8, selEl.size - (selEl.type === 'icon' || selEl.type === 'text' ? 4 : 1)) })} className="px-2 py-1 rounded-lg hover:bg-muted text-[13px] font-bold">A-</button> : null}
              {selEl.type !== 'arrow' ? <button onClick={() => patch({ size: selEl.size + (selEl.type === 'icon' || selEl.type === 'text' ? 4 : 1) })} className="px-2 py-1 rounded-lg hover:bg-muted text-[13px] font-bold">A+</button> : null}
              <div className="flex items-center gap-0.5 ml-1">
                {PALETTE.map((c) => <button key={c} onClick={() => patch(selEl.type === 'rect' || selEl.type === 'ellipse' ? { color: c, fill: c === '#ffffff' ? 'none' : c + '14' } : { color: c })} className="w-4 h-4 rounded-full border border-border" style={{ background: c }} />)}
              </div>
            </>
          ) : null}
          <div className="flex-1" />
          <div className="relative group">
            <button className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] font-semibold border border-border rounded-lg hover:bg-muted"><ImageIcon className="w-3.5 h-3.5" /> Templates</button>
            <div className="absolute right-0 top-full mt-1 w-[160px] bg-card border border-border rounded-xl shadow-2xl p-1 z-20 hidden group-hover:block">
              {[['pathway', 'Pathway'], ['workflow', 'Experiment workflow'], ['compare', 'Comparison']].map(([k, l]) => <button key={k} onClick={() => applyTemplate(k)} className="w-full text-left px-3 py-2 rounded-lg text-[13px] hover:bg-muted">{l}</button>)}
            </div>
          </div>
          <button onClick={exportPng} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] font-semibold bg-primary text-primary-foreground rounded-lg"><Download className="w-3.5 h-3.5" /> PNG</button>
          <button onClick={exportSvg} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] font-semibold border border-border rounded-lg hover:bg-muted">SVG</button>
        </div>

        {/* Canvas */}
        <div className="border border-border rounded-xl overflow-hidden bg-[#f8fafc]" style={{ height: 560 }}>
          <svg ref={svgRef} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} className="w-full h-full" style={{ touchAction: 'none' }} onPointerDown={() => setSel(null)}>
            <defs>
              <marker id="fbarrow_v" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#334155" /></marker>
              <pattern id="fbgrid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#e2e8f0" strokeWidth="1" /></pattern>
            </defs>
            <rect width={CANVAS_W} height={CANVAS_H} fill="url(#fbgrid)" />
            {els.map((el) => {
              const isSel = el.id === sel;
              if (el.type === 'rect') return <g key={el.id}><rect x={el.x} y={el.y} width={el.w} height={el.h} rx={10} fill={el.fill || 'none'} stroke={el.color} strokeWidth={el.size} onPointerDown={(e) => startDrag(e, el)} style={{ cursor: 'move' }} />{isSel ? <rect x={el.x - 2} y={el.y - 2} width={el.w + 4} height={el.h + 4} rx={12} fill="none" stroke={accent} strokeDasharray="4 3" strokeWidth={1.5} /> : null}{isSel ? <circle cx={el.x + el.w} cy={el.y + el.h} r={6} fill={accent} onPointerDown={(e) => { e.stopPropagation(); const p0 = toSvg(e.clientX, e.clientY); const sw = el.w, sh = el.h; const mv = (ev: PointerEvent) => { const p = toSvg(ev.clientX, ev.clientY); patch({ w: Math.max(30, sw + (p.x - p0.x)), h: Math.max(24, sh + (p.y - p0.y)) }); }; const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); }} style={{ cursor: 'nwse-resize' }} /> : null}</g>;
              if (el.type === 'ellipse') return <g key={el.id}><ellipse cx={el.x + el.w / 2} cy={el.y + el.h / 2} rx={el.w / 2} ry={el.h / 2} fill={el.fill || 'none'} stroke={el.color} strokeWidth={el.size} onPointerDown={(e) => startDrag(e, el)} style={{ cursor: 'move' }} />{isSel ? <rect x={el.x - 2} y={el.y - 2} width={el.w + 4} height={el.h + 4} fill="none" stroke={accent} strokeDasharray="4 3" strokeWidth={1.5} /> : null}</g>;
              if (el.type === 'arrow') return <g key={el.id}><line x1={el.x} y1={el.y} x2={el.x2} y2={el.y2} stroke={el.color} strokeWidth={el.size} markerEnd="url(#fbarrow_v)" onPointerDown={(e) => startDrag(e, el)} style={{ cursor: 'move' }} />{isSel ? <circle cx={el.x2} cy={el.y2} r={6} fill={accent} onPointerDown={(e) => startDrag(e, el, 'end')} style={{ cursor: 'crosshair' }} /> : null}</g>;
              if (el.type === 'icon') return <g key={el.id}><text x={el.x} y={el.y + el.size} fontSize={el.size} onPointerDown={(e) => startDrag(e, el)} style={{ cursor: 'move', userSelect: 'none' }}>{el.char}</text>{isSel ? <rect x={el.x - 4} y={el.y - 4} width={el.size + 8} height={el.size + 10} fill="none" stroke={accent} strokeDasharray="4 3" strokeWidth={1.5} rx={6} /> : null}</g>;
              // text
              return <g key={el.id}><text x={el.x} y={el.y + el.size} fontSize={el.size} fontWeight={600} fill={el.color} textAnchor="middle" onPointerDown={(e) => startDrag(e, el)} onDoubleClick={() => editText(el)} style={{ cursor: 'move', userSelect: 'none' }}>{el.text}</text>{isSel ? <rect x={el.x - 84} y={el.y - 4} width={168} height={el.size + 10} fill="none" stroke={accent} strokeDasharray="4 3" strokeWidth={1.5} rx={6} /> : null}</g>;
            })}
            {!els.length ? <text x={CANVAS_W / 2} y={CANVAS_H / 2} fontSize={16} fill="#94a3b8" textAnchor="middle">Click an icon, add shapes/text, or describe a process above to auto-build a figure</text> : null}
          </svg>
        </div>
      </div>
    </div>
  );
}
