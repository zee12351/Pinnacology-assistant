import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Download, FlaskConical, ExternalLink, Loader2, Plus, ArrowUpDown, Search, X, Sparkles, ArrowRight, ArrowUp, ArrowLeft, FileText, Table2, BookOpen, Copy, SlidersHorizontal, Bookmark, Clock, Library as LibraryIcon, Bell, Upload, FolderPlus, Trash2, PanelLeft, MessageSquare, ChevronDown, Check, ListChecks, Tag, Home, Share2, Settings, LogOut, ChevronsUpDown, FolderInput, Menu } from 'lucide-react';

// Literature Review workspace (Elicit-style)
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

async function callChatOnce(message: string, useRag: boolean, persona: string): Promise<{ text: string; error: string }> {
  try {
    const res = await fetch(API + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message, agent_type: 'review', use_rag: useRag, persona: persona }),
    });
    if (!res.ok) {
      let detail = '';
      try { detail = await res.text(); } catch {}
      return { text: '', error: 'Server error ' + res.status + (detail ? ': ' + detail.slice(0, 200) : '') };
    }
    const reader = res.body ? res.body.getReader() : null;
    const dec = new TextDecoder();
    let buffer = '';
    let full = '';
    let err = '';
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
            else if (j.error) err = j.error;
          } catch {
            // ignore
          }
        }
      }
    }
    return { text: full, error: full ? '' : err };
  } catch (e: any) {
    return { text: '', error: (e && e.message) ? e.message : 'Network error' };
  }
}

async function callChat(message: string, useRag: boolean = false, persona: string = 'LITERATURE REVIEW'): Promise<string> {
  let r = await callChatOnce(message, useRag, persona);
  // Retry once on empty/error — the backend (Render free tier) can cold-start
  // and drop the first request after idling.
  if (!r.text) {
    await new Promise((res) => setTimeout(res, 1500));
    const r2 = await callChatOnce(message, useRag, persona);
    if (r2.text) return r2.text;
    r = r2.error ? r2 : r;
  }
  if (r.text) return r.text;
  return r.error ? ('⚠️ ' + r.error) : '';
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
  const oa = !!(w.open_access && w.open_access.is_oa);
  const pdf = !!(w.open_access && w.open_access.oa_url) || !!(w.primary_location && w.primary_location.pdf_url);
  return {
    id: w.id || String(i),
    kind: 'paper',
    title: w.title || w.display_name || 'Untitled',
    authors: authors,
    authorStr: authorStr,
    year: w.publication_year || '',
    venue: venue,
    cited: w.cited_by_count || 0,
    doi: w.doi ? String(w.doi).replace('https://doi.org/', '') : '',
    url: w.doi || landing || w.id,
    oa: oa,
    fullText: pdf,
    ftLabel: pdf ? 'Full text' : (oa ? 'PDF link available' : 'Abstract'),
    abstract: abstractFromIndex(w.abstract_inverted_index),
    summary: '',
    cols: {},
    colQuotes: {},
    rel: w.relevance_score || 0,
    idx: i,
  };
}

function mkTrial(s: any, i: number): any {
  const p = s.protocolSection || {};
  const idm = p.identificationModule || {};
  const sm = p.statusModule || {};
  const sponsor = (p.sponsorCollaboratorsModule && p.sponsorCollaboratorsModule.leadSponsor && p.sponsorCollaboratorsModule.leadSponsor.name) || '';
  const status = sm.overallStatus || '';
  const start = (sm.startDateStruct && sm.startDateStruct.date) || '';
  const nct = idm.nctId || ('trial' + i);
  const yr = (String(start).match(/\d{4}/) || [''])[0];
  return {
    id: nct,
    kind: 'trial',
    title: idm.briefTitle || idm.officialTitle || 'Untitled trial',
    authors: sponsor ? [sponsor] : [],
    authorStr: sponsor || 'Sponsor n/a',
    year: yr,
    venue: 'ClinicalTrials.gov' + (status ? ' - ' + status : ''),
    cited: 0,
    doi: '',
    url: 'https://clinicaltrials.gov/study/' + nct,
    oa: true,
    fullText: true,
    ftLabel: 'Full record',
    abstract: (p.descriptionModule && p.descriptionModule.briefSummary) || '',
    summary: '',
    cols: {},
    colQuotes: {},
    rel: 100000 - i,
    idx: i,
  };
}

const EXTRACT_PRESETS = ['Population / sample', 'Intervention or exposure', 'Main outcome or effect', 'Sample size', 'Study design'];
const COLUMN_SUGGESTIONS = ['Intervention', 'Outcome measured', 'Intervention effects', 'Study design', 'Duration', 'Length of follow-up', 'Dose', 'Participant count', 'Participant age', 'Population sex', 'Population health conditions', 'Sample size', 'Population', 'Region', 'Main findings', 'Limitations', 'Funding source'];

async function extractAnswers(papersList: any[], cq: string): Promise<{ answers: string[]; quotes: string[] }> {
  try {
    const list = papersList.map((p: any, i: number) => '[' + i + '] ' + p.title + '. ABSTRACT: ' + (p.abstract || 'No abstract').slice(0, 800)).join('\n\n');
    const shape = '{"answers": ["one short answer per paper in order"], "quotes": ["one exact supporting sentence copied from that paper abstract, or empty string"]}';
    const prompt = 'For EACH of the ' + papersList.length + ' papers below, extract this in a short phrase (max ~15 words), or "Not reported" if the abstract does not say. Also copy the exact supporting sentence from the abstract as the quote (empty string if none). Instruction: "' + cq + '".\n\nReturn ONLY valid JSON in this shape: ' + shape + '\n\nPapers:\n' + list;
    const raw = await callChat(prompt);
    const parsed = extractJSON(raw);
    return { answers: parsed && Array.isArray(parsed.answers) ? parsed.answers : [], quotes: parsed && Array.isArray(parsed.quotes) ? parsed.quotes : [] };
  } catch {
    return { answers: [], quotes: [] };
  }
}

function normPaper(o: any): any {
  const authors = o.authors || [];
  const authorStr = authors.length ? (authors.length > 3 ? authors.slice(0, 2).join(', ') + ' et al.' : authors.join(', ')) : 'Unknown authors';
  return {
    id: o.id, kind: 'paper', title: o.title || 'Untitled', authors: authors, authorStr: authorStr,
    year: o.year || '', venue: o.venue || '', cited: o.cited || 0,
    doi: o.doi ? String(o.doi).replace('https://doi.org/', '') : '',
    url: o.url || (o.doi ? 'https://doi.org/' + o.doi : ''),
    oa: !!o.oa, fullText: !!o.fullText, ftLabel: o.fullText ? 'Full text' : (o.oa ? 'PDF link available' : 'Abstract'),
    abstract: o.abstract || '', summary: '', cols: {}, colQuotes: {},
    rel: o.rel != null ? o.rel : (100000 - (o.i || 0)), idx: o.i || 0, srcName: o.source || '',
  };
}

async function searchOpenAlex(q: string, n: number): Promise<any[]> {
  try {
    const url = 'https://api.openalex.org/works?search=' + encodeURIComponent(q) + '&per_page=' + n + '&sort=relevance_score:desc&filter=has_abstract:true&mailto=support@pinnovix.app';
    const r = await fetch(url); const j = await r.json();
    return (j.results || []).map(mkPaper).filter((p: any) => p.title);
  } catch { return []; }
}

async function searchSemanticScholar(q: string, n: number): Promise<any[]> {
  try {
    const fields = 'title,authors,year,venue,abstract,citationCount,externalIds,openAccessPdf';
    const url = 'https://api.semanticscholar.org/graph/v1/paper/search?query=' + encodeURIComponent(q) + '&limit=' + n + '&fields=' + fields;
    const r = await fetch(url); const j = await r.json();
    return ((j && j.data) || []).map((it: any, i: number) => {
      const authors = (it.authors || []).map((a: any) => a.name).filter(Boolean);
      const doi = (it.externalIds && it.externalIds.DOI) || '';
      const oaUrl = (it.openAccessPdf && it.openAccessPdf.url) || '';
      return normPaper({ id: it.paperId || ('ss' + i), title: it.title, authors: authors, year: it.year || '', venue: it.venue || '', cited: it.citationCount || 0, doi: doi, url: doi ? 'https://doi.org/' + doi : (oaUrl || ('https://www.semanticscholar.org/paper/' + (it.paperId || ''))), oa: !!oaUrl, fullText: !!oaUrl, abstract: it.abstract || '', i: i, source: 'Semantic Scholar' });
    }).filter((p: any) => p.title);
  } catch { return []; }
}

async function searchEuropePMC(q: string, n: number): Promise<any[]> {
  try {
    const url = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=' + encodeURIComponent(q) + '&format=json&pageSize=' + n + '&resultType=core';
    const r = await fetch(url); const j = await r.json();
    const list = (j && j.resultList && j.resultList.result) || [];
    return list.map((it: any, i: number) => {
      const authors = (it.authorString || '').split(',').map((x: string) => x.trim()).filter(Boolean);
      const doi = it.doi || '';
      const oa = it.isOpenAccess === 'Y' || it.inEPMC === 'Y' || it.inPMC === 'Y';
      const url2 = doi ? 'https://doi.org/' + doi : ('https://europepmc.org/article/' + (it.source || 'MED') + '/' + (it.id || ''));
      return normPaper({ id: (it.source || '') + (it.id || ('epmc' + i)), title: it.title, authors: authors, year: it.pubYear || '', venue: it.journalTitle || '', cited: it.citedByCount || 0, doi: doi, url: url2, oa: oa, fullText: oa, abstract: it.abstractText || '', i: i, source: 'Europe PMC' });
    }).filter((p: any) => p.title);
  } catch { return []; }
}

async function searchArxiv(q: string, n: number): Promise<any[]> {
  try {
    const url = 'https://export.arxiv.org/api/query?search_query=all:' + encodeURIComponent(q) + '&start=0&max_results=' + n;
    const r = await fetch(url); const xml = await r.text();
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const entries = Array.from(doc.getElementsByTagName('entry'));
    return entries.map((e: any, i: number) => {
      const g = (tag: string) => { const el = e.getElementsByTagName(tag)[0]; return el ? (el.textContent || '').trim() : ''; };
      const title = g('title').replace(/\s+/g, ' ');
      const abstract = g('summary').replace(/\s+/g, ' ');
      const year = (g('published').match(/\d{4}/) || [''])[0];
      const authors = Array.from(e.getElementsByTagName('author')).map((a: any) => { const nm = a.getElementsByTagName('name')[0]; return nm ? (nm.textContent || '').trim() : ''; }).filter(Boolean);
      const idUrl = g('id');
      const doiEl = e.getElementsByTagName('arxiv:doi')[0];
      const doi = doiEl ? (doiEl.textContent || '').trim() : '';
      return normPaper({ id: idUrl || ('arx' + i), title: title, authors: authors, year: year, venue: 'arXiv', cited: 0, doi: doi, url: idUrl, oa: true, fullText: true, abstract: abstract, i: i, source: 'arXiv' });
    }).filter((p: any) => p.title);
  } catch { return []; }
}

async function searchCrossref(q: string, n: number): Promise<any[]> {
  try {
    const url = 'https://api.crossref.org/works?query.bibliographic=' + encodeURIComponent(q) + '&rows=' + n + '&select=title,author,published,container-title,DOI,is-referenced-by-count,abstract&mailto=support@pinnovix.app';
    const r = await fetch(url); const j = await r.json();
    const items = (j && j.message && j.message.items) || [];
    return items.map((it: any, i: number) => {
      const authors = (it.author || []).map((a: any) => [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean);
      const doi = it.DOI || '';
      const year = (it.published && it.published['date-parts'] && it.published['date-parts'][0] && it.published['date-parts'][0][0]) || '';
      const abstractRaw = it.abstract ? String(it.abstract).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
      return normPaper({ id: doi || ('cr' + i), title: Array.isArray(it.title) ? it.title[0] : (it.title || ''), authors: authors, year: year, venue: Array.isArray(it['container-title']) ? it['container-title'][0] : (it['container-title'] || ''), cited: it['is-referenced-by-count'] || 0, doi: doi, url: doi ? 'https://doi.org/' + doi : '', oa: false, fullText: false, abstract: abstractRaw, i: i, source: 'Crossref' });
    }).filter((p: any) => p.title);
  } catch { return []; }
}

async function searchPapers(q: string, source: string, n: number): Promise<any[]> {
  n = n || 12;
  if (source === 'all') {
    const per = Math.max(5, Math.ceil(n / 2));
    const arrs = await Promise.all([
      searchOpenAlex(q, per), searchSemanticScholar(q, per), searchEuropePMC(q, per), searchArxiv(q, Math.min(per, 6)), searchCrossref(q, per),
    ]);
    const merged: any[] = []; const seen: any = {};
    ([] as any[]).concat.apply([], arrs).forEach((p: any) => {
      const key = (p.doi || p.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
      if (!key || seen[key]) return; seen[key] = 1; merged.push(p);
    });
    merged.sort((a, b) => (b.cited || 0) - (a.cited || 0));
    return merged.slice(0, n).map((p, i) => ({ ...p, idx: i, rel: 100000 - i }));
  }
  if (source === 'semanticscholar') return searchSemanticScholar(q, n);
  if (source === 'europepmc') return searchEuropePMC(q, n);
  if (source === 'arxiv') return searchArxiv(q, n);
  if (source === 'crossref') return searchCrossref(q, n);
  return searchOpenAlex(q, n);
}

function linkifyAgent(text: string, sources: any[]): string {
  let t = text || '';
  t = t.replace(/\[(\d+)\]/g, (m, n) => { const src = sources[parseInt(n, 10) - 1]; return src && src.url ? '[[' + n + ']](' + src.url + ')' : m; });
  t = t.replace(/\(([^()]*?(?:19|20)\d{2}[a-z]?)\)/g, (m, inner) => {
    const ym = String(inner).match(/(19|20)\d{2}/); if (!ym) return m;
    const yr = ym[0];
    const tok = String(inner).split(',')[0].replace(/\bet al\.?/i, '').replace(/&.*/, '').trim().split(/\s+/)[0].toLowerCase();
    if (!tok || tok.length < 2) return m;
    const src = sources.find((x: any) => String(x.year) === yr && (x.authorStr || '').toLowerCase().indexOf(tok) !== -1);
    return src && src.url ? '[' + m + '](' + src.url + ')' : m;
  });
  return t;
}

function cleanText(s: string): string {
  return (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function firstSentences(s: string, n: number): string {
  const clean = cleanText(s);
  if (!clean) return '';
  const m = clean.match(/[^.!?]+[.!?]+/g);
  const parts = m && m.length ? m : [clean];
  let out = parts.slice(0, n).join(' ').trim();
  if (out.length > 340) out = out.slice(0, 337).trim() + '...';
  return out;
}

// Elicit-style synthesis built directly from the retrieved paper abstracts.
// Used as a reliable fallback so the Research agent always returns a
// structured, citation-rich answer even when the model service is unavailable.
function synthesizeAgentAnswer(question: string, sources: any[]): string {
  const srcs = (sources || []).filter(Boolean);
  const q = cleanText(question);
  if (!srcs.length) return 'No sources were found for **' + q + '**. Try rephrasing the question or broadening your search terms.';
  const years = srcs.map((s) => parseInt(String(s.year), 10)).filter((y) => !isNaN(y));
  const minY = years.length ? Math.min.apply(null, years) : null;
  const maxY = years.length ? Math.max.apply(null, years) : null;
  const span = (minY && maxY) ? (minY === maxY ? String(minY) : minY + '–' + maxY) : '';
  const venues = Array.from(new Set(srcs.map((s) => cleanText(s.venue)).filter(Boolean))).slice(0, 3);

  let md = '### Summary\n\n';
  md += 'This synthesis draws on ' + srcs.length + ' source' + (srcs.length > 1 ? 's' : '') + (span ? ' published between ' + span : '') + ' to address **' + q + '**';
  md += venues.length ? ', with work appearing in venues such as ' + venues.join(', ') + '. ' : '. ';
  md += 'The most relevant finding from each study is summarised below, with numbered citations linking back to the original papers.\n\n';

  md += '### Key findings\n\n';
  srcs.slice(0, 8).forEach((s, i) => {
    const who = cleanText(s.authorStr) || 'Unknown authors';
    const yr = s.year ? ' (' + s.year + ')' : '';
    const finding = firstSentences(s.abstract, 2) || cleanText(s.title);
    md += '- **' + who + yr + ':** ' + finding + ' [' + (i + 1) + ']\n';
  });

  md += '\n### Bottom line\n\n';
  md += 'Across these ' + srcs.length + ' studies' + (span ? ' (' + span + ')' : '') + ', the evidence converges on the themes summarised above. ';
  md += 'Open the sources below for full detail, or add extraction columns to build a structured evidence table comparing them side by side.\n\n';

  md += '### References\n\n';
  srcs.forEach((s, i) => {
    const who = cleanText(s.authorStr) || 'Unknown authors';
    const title = cleanText(s.title) || 'Untitled';
    const venue = cleanText(s.venue);
    const yr = s.year || '';
    const url = s.url || '';
    const titleMd = url ? '[' + title + '](' + url + ')' : title;
    md += (i + 1) + '. ' + who + '. ' + titleMd + '. ' + [venue, yr].filter(Boolean).join(', ') + '\n';
  });
  return md;
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
  const agentSessionKeyRef = useRef('');
  const [input, setInput] = useState('');
  const [followups, setFollowups] = useState([] as string[]);
  const [filtOpen, setFiltOpen] = useState(false);
  const [minYear, setMinYear] = useState('');
  const [minCited, setMinCited] = useState('');
  const [oaOnly, setOaOnly] = useState(false);
  const [saved, setSaved] = useState(false);
  const [chatThread, setChatThread] = useState([] as any[]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  // Mode / tool dropdown
  const [mode, setMode] = useState('find'); // find | chat | report
  const [modeMenu, setModeMenu] = useState(false);
  const modeBtnRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [paperSource, setPaperSource] = useState('openalex');
  const [srcMenu, setSrcMenu] = useState(false);
  const srcBtnRef = useRef<HTMLButtonElement | null>(null);
  const [srcBtnPos, setSrcBtnPos] = useState({ top: 0, left: 0 });
  function toggleSrcMenu() {
    if (!srcMenu && srcBtnRef.current) { const r = srcBtnRef.current.getBoundingClientRect(); setSrcBtnPos({ top: r.bottom + 6, left: r.left }); }
    setSrcMenu((v) => !v);
  }
  function toggleModeMenu() {
    if (!modeMenu && modeBtnRef.current) {
      const r = modeBtnRef.current.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 6, left: r.left });
    }
    setModeMenu((v) => !v);
  }
  const [dlMenu, setDlMenu] = useState(false);
  const dlBtnRef = useRef<HTMLButtonElement | null>(null);
  const [dlPos, setDlPos] = useState({ top: 0, left: 0 });
  function toggleDlMenu() {
    if (!papers.length) return;
    if (!dlMenu && dlBtnRef.current) {
      const r = dlBtnRef.current.getBoundingClientRect();
      setDlPos({ top: r.bottom + 6, left: r.left });
    }
    setDlMenu((v) => !v);
  }

  // Chat with papers
  const [srcModal, setSrcModal] = useState(false);
  const [srcSel, setSrcSel] = useState({} as any);
  const [srcCol, setSrcCol] = useState('all');
  const [srcColDd, setSrcColDd] = useState(false);
  const [srcFilterDd, setSrcFilterDd] = useState(false);
  const [srcMethods, setSrcMethods] = useState([] as string[]);
  const [srcView, setSrcView] = useState('list');
  const [srcColPop, setSrcColPop] = useState(false);
  const [srcColApply, setSrcColApply] = useState('');
  const [srcTagPop, setSrcTagPop] = useState(false);
  const [srcTagInput, setSrcTagInput] = useState('');
  const [chatSources, setChatSources] = useState([] as any[]);
  const [chatStarted, setChatStarted] = useState(false);
  const [paperChat, setPaperChat] = useState([] as any[]);
  const [paperInput, setPaperInput] = useState('');
  const [paperBusy, setPaperBusy] = useState(false);

  // Report
  const [reportInput, setReportInput] = useState('');
  const [reportSource, setReportSource] = useState('Research papers');
  const [reportSrcMenu, setReportSrcMenu] = useState(false);
  const [report, setReport] = useState(null as any);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportPhase, setReportPhase] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [reportChat, setReportChat] = useState([] as any[]);
  const [reportChatInput, setReportChatInput] = useState('');

  // Systematic review
  const [sysStep, setSysStep] = useState(0);
  const [sysQ, setSysQ] = useState('');
  const [sysPapers, setSysPapers] = useState([] as any[]);
  const [sysCols, setSysCols] = useState([] as any[]);
  const [sysBusy, setSysBusy] = useState(false);

  // Research agent
  const [agentChat, setAgentChat] = useState([] as any[]);
  const [agentInput, setAgentInput] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);

  // Left-nav state
  const [navView, setNavView] = useState('search');
  const [navOpen, setNavOpen] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [recents, setRecents] = useState([] as any[]);
  const [collections, setCollections] = useState([] as any[]);
  const [libDocs, setLibDocs] = useState([] as any[]);
  const [activeCol, setActiveCol] = useState('all');
  const [libSel, setLibSel] = useState({} as any);
  const [colModal, setColModal] = useState(false);
  const [colName, setColName] = useState('');
  const [cellPop, setCellPop] = useState(null as any);
  function openCellPop(e: any, p: any, c: any) {
    try {
      const r = e.currentTarget.getBoundingClientRect();
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const q = (p.colQuotes && p.colQuotes[c.id]) || '';
      setCellPop({ x: Math.max(8, Math.min(r.left, vw - 380)), y: r.bottom + 6, title: p.title, url: p.url, quote: q, quote2: p.abstract || '', answer: p.cols[c.id], col: c.name });
    } catch {}
  }
  async function runExtractFromSelection() {
    const sel = libDocs.filter((d) => libSel[d.id || docName(d)]);
    setMode('extract');
    setNavView('search');
    setColumns([]); setSynthesis(''); setFollowups([]); setChatThread([]);
    if (!sel.length) { setQuestion(''); setPapers([]); return; }
    setQuestion('Selected library papers');
    setSearchTerms(['Selected library papers']);
    setBusy(true);
    setPhase('Loading selected papers...');
    setPapers([]);
    const built: any[] = [];
    for (let i = 0; i < sel.length; i++) {
      const d = sel[i];
      let paper: any = null;
      try {
        const qq = d.name || docName(d);
        const url = 'https://api.openalex.org/works?search=' + encodeURIComponent(qq) + '&per_page=1&filter=has_abstract:true&mailto=support@pinnovix.app';
        const r = await fetch(url);
        const j = await r.json();
        if (j.results && j.results[0]) paper = mkPaper(j.results[0], i);
      } catch {}
      if (!paper) paper = { id: d.id || ('p' + i), kind: 'paper', title: docName(d), authors: d.authorStr ? [d.authorStr] : [], authorStr: d.authorStr || 'Unknown authors', year: d.year || '', venue: '', cited: 0, doi: d.doi || '', url: d.url || (d.doi ? 'https://doi.org/' + d.doi : ''), oa: false, fullText: false, ftLabel: '', abstract: '', summary: '', cols: {}, colQuotes: {}, rel: 1000 - i, idx: i };
      built.push(paper);
      setPapers(built.slice());
    }
    setBusy(false);
    setPhase('');
  }
  const [recentSearch, setRecentSearch] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const modalFileRef = useRef<HTMLInputElement | null>(null);
  const [uploadModal, setUploadModal] = useState(false);
  const [lastUploadIds, setLastUploadIds] = useState([] as string[]);
  const [uploadCollection, setUploadCollection] = useState('none');
  const [libSearch, setLibSearch] = useState('');
  const [libView, setLibView] = useState('list');
  const [selRows, setSelRows] = useState({} as any);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareList, setShareList] = useState([] as any[]);
  const [shareLink, setShareLink] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [acctMenu, setAcctMenu] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveColModal, setSaveColModal] = useState(false);
  const [moveMenu, setMoveMenu] = useState(false);
  const moveBtnRef = useRef<HTMLButtonElement | null>(null);
  const [moveBtnPos, setMoveBtnPos] = useState({ top: 0, left: 0 });
  const [tagModal, setTagModal] = useState(false);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    try { const r = localStorage.getItem('pinnovix_lit_recents'); if (r) setRecents(JSON.parse(r)); } catch {}
    try { const c = localStorage.getItem('pinnovix_lit_collections'); if (c) setCollections(JSON.parse(c)); } catch {}
    try { const d = localStorage.getItem('pinnovix_library_docs'); if (d) setLibDocs(JSON.parse(d)); } catch {}
  }, []);

  useEffect(() => {
    let em = '';
    try { em = localStorage.getItem('pinnovix_email') || ''; } catch {}
    if (em) { setUserEmail(em); fetchShared(em); }
    try { const nm = localStorage.getItem('pinnovix_name'); if (nm) setUserName(nm); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchShared(email: string) {
    try {
      const r = await fetch(API + '/api/lit/shared?email=' + encodeURIComponent(email));
      const j = await r.json();
      const items = (j.shared || []).map((x: any) => ({ id: 'shr_' + x.id, question: (x.session && x.session.question) || 'Shared item', type: 'Shared by ' + (x.from_email || 'someone'), ts: x.ts, shared: true, payload: x.session }));
      if (items.length) setRecents((prev) => { const ids: any = {}; prev.forEach((p) => { ids[p.id] = 1; }); const add = items.filter((i: any) => !ids[i.id]); return add.concat(prev); });
    } catch {
      // ignore
    }
  }

  function persistAgentSession(key: string, arr: any[]) {
    if (!key) return;
    try { const raw = localStorage.getItem('pinnovix_lit_agent_sessions'); const map = raw ? JSON.parse(raw) : {}; map[key] = arr; localStorage.setItem('pinnovix_lit_agent_sessions', JSON.stringify(map)); } catch {}
  }
  function loadAgentSession(key: string): any[] | null {
    try { const raw = localStorage.getItem('pinnovix_lit_agent_sessions'); const map = raw ? JSON.parse(raw) : {}; return map[key] || null; } catch { return null; }
  }
  function pushRecent(q: string, type: string) {
    try {
      const raw = localStorage.getItem('pinnovix_lit_recents');
      const arr = raw ? JSON.parse(raw) : [];
      const filtered = arr.filter((x: any) => !(x.question === q && x.type === type));
      filtered.unshift({ id: Date.now(), question: q, type: type || 'Find papers', ts: Date.now() });
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
    setQuestion(''); setPapers([]); setSynthesis(''); setColumns([]); setSearchTerms([]); setInput(''); setFollowups([]); setChatThread([]); setChatInput(''); lastQRef.current = '';
    setChatStarted(false); setPaperChat([]); setChatSources([]); setSrcSel({});
    setReport(null); setReportInput(''); setDetailsOpen(false); setReportChat([]);
    setSysStep(0); setSysQ(''); setSysPapers([]); setSysCols([]);
    setAgentChat([]); setAgentInput('');
    setSelRows({}); setShareOpen(false); setShareList([]);
  }
  function startNew() {
    resetSearch();
    setMode('find');
    setNavView('search');
  }
  function openRecent(r: any) {
    setNavView('search');
    if (r && typeof r === 'object' && r.shared && r.payload) {
      const pl = r.payload;
      setMode('find'); lastQRef.current = pl.question || '';
      setQuestion(pl.question || ''); setPapers(pl.papers || []); setSynthesis(pl.synthesis || ''); setColumns(pl.columns || []); setSearchTerms([pl.question || '']); setFollowups([]); setBusy(false);
      return;
    }
    const q = typeof r === 'string' ? r : r.question;
    const ty = typeof r === 'string' ? '' : r.type;
    lastQRef.current = q;
    if (ty === 'Research report') { setMode('report'); runReport(q, reportSource); }
    else if (ty === 'Research agent') {
      setMode('agent');
      const saved = loadAgentSession(q);
      if (saved && saved.length) { setAgentChat(saved); agentSessionKeyRef.current = q; }
      else { setAgentChat([]); agentSessionKeyRef.current = q; setTimeout(() => agentSend(q), 60); }
    }
    else { setMode('find'); runReview(q); }
  }
  function selectMode(id: string) {
    setModeMenu(false);
    resetSearch();
    if (id === 'chat') setMode('chat');
    else if (id === 'report') setMode('report');
    else if (id === 'agent') setMode('agent');
    else if (id === 'extract') setMode('extract');
    else if (id === 'systematic') setMode('systematic');
    else setMode('find');
  }
  function newCollection() {
    setColName('');
    setColModal(true);
  }
  function createCollectionConfirm() {
    const name = colName.trim();
    if (!name) return;
    const next = [{ id: 'col' + Date.now(), name: name }].concat(collections);
    setCollections(next);
    try { localStorage.setItem('pinnovix_lit_collections', JSON.stringify(next)); } catch {}
    setColModal(false); setColName('');
  }
  function onUploadFiles(e: any) {
    const files = Array.from((e.target && e.target.files) || []) as any[];
    if (!files.length) return;
    const preCol = activeCol !== 'all' && activeCol !== 'trash' ? activeCol : '';
    const add = files.map((f, i) => ({ id: 'd' + Date.now() + '_' + i, name: f.name, size: f.size, ts: Date.now(), collection: preCol, creationMethod: 'upload' }));
    const next = add.concat(libDocs);
    setLibDocs(next);
    try { localStorage.setItem('pinnovix_library_docs', JSON.stringify(next)); } catch {}
    setLastUploadIds(add.map((a) => a.id));
    setUploadCollection(preCol || 'none');
    setUploadModal(true);
    if (e.target) e.target.value = '';
  }
  function moveUploadedToCollection(colId: string) {
    setUploadCollection(colId);
    setLibDocs((prev) => {
      const next = prev.map((d) => lastUploadIds.indexOf(d.id) !== -1 ? { ...d, collection: colId === 'none' ? '' : colId } : d);
      try { localStorage.setItem('pinnovix_library_docs', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function toggleSrc(id: string) {
    setSrcSel((prev: any) => ({ ...prev, [id]: !prev[id] }));
  }
  function confirmSources() {
    const sel = libDocs.filter((d) => srcSel[d.id || docName(d)]);
    setChatSources(sel);
    setSrcModal(false);
    setChatStarted(true);
    setPaperChat([]);
  }
  function docMethod(d: any): string {
    if (d.creationMethod) return d.creationMethod;
    if (d.source === 'zotero') return 'zotero';
    if (d.kind === 'paper' || d.doi || (d.url && !d.size)) return 'search';
    return 'upload';
  }
  function srcSelIds(): string[] {
    return Object.keys(srcSel).filter((k) => srcSel[k]);
  }
  function srcDeleteSelected() {
    const ids = srcSelIds();
    if (!ids.length) return;
    const next = libDocs.filter((d) => ids.indexOf(d.id || docName(d)) === -1);
    setLibDocs(next);
    try { localStorage.setItem('pinnovix_library_docs', JSON.stringify(next)); } catch {}
    setSrcSel({});
  }
  function srcApplyCollection() {
    const ids = srcSelIds();
    if (!ids.length || !srcColApply) { setSrcColPop(false); return; }
    const cid = srcColApply === 'none' ? '' : srcColApply;
    const next = libDocs.map((d) => ids.indexOf(d.id || docName(d)) !== -1 ? { ...d, collection: cid } : d);
    setLibDocs(next);
    try { localStorage.setItem('pinnovix_library_docs', JSON.stringify(next)); } catch {}
    setSrcColPop(false); setSrcColApply('');
  }
  function srcApplyTag(t: string) {
    const tag = (t || '').trim();
    const ids = srcSelIds();
    if (!tag || !ids.length) { setSrcTagPop(false); setSrcTagInput(''); return; }
    const next = libDocs.map((d) => ids.indexOf(d.id || docName(d)) !== -1 ? { ...d, tag: tag } : d);
    setLibDocs(next);
    try { localStorage.setItem('pinnovix_library_docs', JSON.stringify(next)); } catch {}
    setSrcTagPop(false); setSrcTagInput('');
  }
  async function paperChatSend(text: string) {
    const q = (text || '').trim();
    if (!q || paperBusy) return;
    setPaperInput('');
    if (!paperChat.length) pushRecent(q, 'Chat');
    setPaperChat((prev) => [...prev, { role: 'user', text: q }, { role: 'assistant', text: '', busy: true }]);
    setPaperBusy(true);
    const srcList = chatSources.map((d) => docName(d)).join(', ');
    const msg = (chatSources.length ? 'Base your answer on these sources from my library: ' + srcList + '.\n\n' : '') + q + '\n\nAnswer clearly in Markdown, with inline (Author, Year) citations where relevant.';
    const ans = await callChat(msg, true, 'DOCUMENT ANALYST');
    setPaperChat((prev) => { const m = [...prev]; m[m.length - 1] = { role: 'assistant', text: ans || 'No response. Try selecting sources or rephrasing.' }; return m; });
    setPaperBusy(false);
  }

  function copyReport() {
    const txt = (question ? question + '\n\n' : '') + (synthesis ? synthesis + '\n\n' : '') + view().map((p, i) => (i + 1) + '. ' + p.title + ' (' + p.authorStr + ', ' + p.year + '). ' + (p.doi ? 'https://doi.org/' + p.doi : '')).join('\n');
    try { navigator.clipboard.writeText(txt); } catch {}
  }
  function downloadReport() {
    const txt = (question ? 'Research question: ' + question + '\n\n' : '') + (synthesis ? 'Synthesis:\n' + synthesis + '\n\n' : '') + 'Papers:\n' + view().map((p, i) => (i + 1) + '. ' + p.title + ' - ' + p.authorStr + ' (' + p.year + '). ' + p.venue + '. ' + (p.doi ? 'https://doi.org/' + p.doi : '') + '\n   Summary: ' + (p.summary || '')).join('\n\n');
    doDownload(txt, (question || 'literature-review').slice(0, 40) + '.txt', 'text/plain');
  }
  function doDownload(text: string, name: string, mime: string) {
    const blob = new Blob([text], { type: mime });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(href);
  }
  function saveLibrary() {
    const chosen = view().filter((p) => selRows[p.id]);
    const picks = chosen.length ? chosen : view();
    if (!picks.length) return;
    setSaveColModal(true);
  }
  function saveToCollection(colId: string) {
    const chosen = view().filter((p) => selRows[p.id]);
    const picks = chosen.length ? chosen : view();
    if (!picks.length) { setSaveColModal(false); return; }
    const docs = picks.map((p, i) => ({ id: 'lib_' + Date.now() + '_' + i, name: p.title, kind: 'paper', authorStr: p.authorStr, year: p.year, url: p.url, doi: p.doi, ts: Date.now(), collection: colId || '', creationMethod: 'search' }));
    const next = docs.concat(libDocs);
    setLibDocs(next);
    try { localStorage.setItem('pinnovix_library_docs', JSON.stringify(next)); } catch {}
    setSaved(true); setTimeout(() => setSaved(false), 1500);
    setSelRows({}); setSaveColModal(false);
  }
  function deleteCollection(id: string) {
    const next = collections.filter((c) => c.id !== id);
    setCollections(next);
    try { localStorage.setItem('pinnovix_lit_collections', JSON.stringify(next)); } catch {}
    setLibDocs((prev) => { const nd = prev.map((d) => d.collection === id ? { ...d, collection: '' } : d); try { localStorage.setItem('pinnovix_library_docs', JSON.stringify(nd)); } catch {} return nd; });
    if (activeCol === id) setActiveCol('all');
  }
  function deleteSelectedDocs() {
    const ids = Object.keys(libSel).filter((k) => libSel[k]);
    if (!ids.length) return;
    const next = libDocs.filter((d) => ids.indexOf(d.id || docName(d)) === -1);
    setLibDocs(next);
    try { localStorage.setItem('pinnovix_library_docs', JSON.stringify(next)); } catch {}
    setLibSel({});
  }
  function toggleMoveMenu() {
    if (!Object.keys(libSel).filter((k) => libSel[k]).length) return;
    if (!moveMenu && moveBtnRef.current) { const r = moveBtnRef.current.getBoundingClientRect(); setMoveBtnPos({ top: r.bottom + 6, left: r.left }); }
    setMoveMenu((v) => !v);
  }
  function moveSelectedToCollection(colId: string) {
    const ids = Object.keys(libSel).filter((k) => libSel[k]);
    if (!ids.length) { setMoveMenu(false); return; }
    const next = libDocs.map((d) => ids.indexOf(d.id || docName(d)) !== -1 ? { ...d, collection: colId } : d);
    setLibDocs(next);
    try { localStorage.setItem('pinnovix_library_docs', JSON.stringify(next)); } catch {}
    setMoveMenu(false); setLibSel({});
  }
  function assignTag() {
    const t = tagInput.trim();
    if (!t) return;
    const ids = Object.keys(libSel).filter((k) => libSel[k]);
    if (ids.length) { const next = libDocs.map((d) => ids.indexOf(d.id || docName(d)) !== -1 ? { ...d, tag: t } : d); setLibDocs(next); try { localStorage.setItem('pinnovix_library_docs', JSON.stringify(next)); } catch {} }
    setTagModal(false); setTagInput(''); setLibSel({});
  }
  function logout() {
    try { localStorage.removeItem('pinnovix_email'); localStorage.removeItem('pinnovix_name'); } catch {}
    setUserEmail(''); setUserName(''); setAcctMenu(false);
  }
  function saveAccount() {
    try { localStorage.setItem('pinnovix_email', userEmail); localStorage.setItem('pinnovix_name', userName); } catch {}
  }
  function clearLocalData() {
    if (typeof window !== 'undefined' && !window.confirm('Clear all local library, collections, recents and prompts on this device?')) return;
    try { ['pinnovix_library_docs', 'pinnovix_lit_collections', 'pinnovix_lit_recents', 'pinnovix_lit_library'].forEach((k) => localStorage.removeItem(k)); } catch {}
    setLibDocs([]); setCollections([]); setRecents([]); setLibSel({});
    setSettingsOpen(false);
  }
  function buildSharePayload() {
    if (mode === 'agent' && agentChat.length) {
      const firstUser = agentChat.find((m: any) => m.role === 'user');
      const lastAns = [...agentChat].reverse().find((m: any) => m.role === 'assistant' && m.text);
      return { question: (firstUser && firstUser.text) || 'Research agent', title: (firstUser && firstUser.text) || 'Research agent', kind: 'find', synthesis: (lastAns && lastAns.text) || '', papers: (lastAns && lastAns.sources) || [], columns: [] };
    }
    if (report) return { question: report.question, title: report.title, kind: 'report', synthesis: report.abstract || '', papers: report.screened || [], columns: [] };
    return { question: question, kind: 'find', papers: view(), synthesis: synthesis, columns: columns };
  }
  async function shareAdd() {
    const to = shareEmail.trim();
    if (!to) return;
    let from = userEmail;
    if (!from) {
      from = (typeof window !== 'undefined' && window.prompt('Enter your email (to share as):')) || '';
      if (from) { setUserEmail(from); try { localStorage.setItem('pinnovix_email', from); } catch {} }
    }
    try {
      await fetch(API + '/api/lit/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to_email: to, from_email: from || 'someone', session: buildSharePayload() }) });
    } catch {
      // ignore
    }
    setShareList((prev) => [...prev, { email: to }]);
    setShareEmail('');
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
    setMode('find');
    setNavView('search');
    setQuestion(q);
    pushRecent(q, 'Find papers');
    setBusy(true);
    setPhase('Searching academic databases...');
    setPapers([]);
    setSynthesis('');
    setColumns([]);
    setSearchTerms([]);
    setFollowups([]);
    setChatThread([]);
    try {
      const items = await searchPapers(q, paperSource, 12);
      setPapers(items);
      setSearchTerms([q]);
      if (!items.length) {
        setBusy(false);
        setPhase('');
        return;
      }
      setPhase('Summarising papers and synthesising findings...');
      const list = items.map((p: any, i: number) => '[' + i + '] ' + p.title + '. ABSTRACT: ' + (p.abstract || 'No abstract').slice(0, 900)).join('\n\n');
      const jsonShape = '{"summaries": ["one short summary per paper in order"], "synthesis": "3-4 sentence overall synthesis", "followups": ["2-3 SHORT table-edit suggestions, max 6 words each, phrased as actions e.g. Add sample size, Separate by study design, Add safety outcomes"]}';
      const prompt = 'You are a systematic literature-review assistant. Research question: "' + q + '".\n\n'
        + 'Below are ' + items.length + ' papers. For EACH paper (in order), write a 1-2 sentence summary of what it found that is RELEVANT to the research question, with specific numbers/outcomes if present. Then write a 3-4 sentence overall synthesis across all papers (agreement, disagreement, bottom line). Finally, propose 2-3 SHORT next-step edits to improve THIS table (each max 6 words, phrased as an action like "Add sample size" or "Separate by study design").\n\n'
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

  async function runReport(q: string, source: string) {
    setMode('report');
    setNavView('search');
    setDetailsOpen(false);
    setReportChat([]);
    pushRecent(q, 'Research report');
    setReportBusy(true);
    setReportPhase('Gathering sources...');
    setReport({ question: q, source: source, title: '', abstract: '', body: '', sources: [], screened: [], done: {} });
    try {
      let sources: any[] = [];
      if (source === 'Clinical trials') {
        const url = 'https://clinicaltrials.gov/api/v2/studies?query.term=' + encodeURIComponent(q) + '&pageSize=30&format=json';
        const r = await fetch(url);
        const j = await r.json();
        sources = ((j && j.studies) || []).map(mkTrial).filter((x: any) => x.title);
      } else {
        const url = 'https://api.openalex.org/works?search=' + encodeURIComponent(q) + '&per_page=30&sort=relevance_score:desc&filter=has_abstract:true&mailto=support@pinnovix.app';
        const r = await fetch(url);
        const j = await r.json();
        sources = ((j && j.results) || []).map(mkPaper).filter((x: any) => x.title);
      }
      const screened = sources.slice(0, 10);
      setReport((prev: any) => ({ ...prev, sources: sources, screened: screened, done: { gather: true, screen: true } }));
      setReportPhase('Extracting data and writing report...');
      const srcTxt = screened.map((p, i) => '[' + (i + 1) + '] ' + p.title + ' (' + p.authorStr + ', ' + p.year + '). ' + (p.abstract || 'No abstract').slice(0, 600)).join('\n\n');
      const shape = '{"title": "short report title, max 8 words", "abstract": "2-3 paragraph abstract summarising the evidence with specific numbers", "body": "the full report in Markdown with ## section headings and inline (Author, Year) citations"}';
      const prompt = 'Write a structured research report that answers: "' + q + '". Use ONLY the ' + screened.length + ' sources below. Include specific findings, numbers and caveats. Return ONLY valid JSON, no fences, in this shape: ' + shape + '\n\nSources:\n' + srcTxt;
      const raw = await callChat(prompt);
      const parsed = extractJSON(raw);
      setReport((prev: any) => ({
        ...prev,
        title: (parsed && parsed.title) || q,
        abstract: (parsed && parsed.abstract) || (raw && raw.length < 800 ? raw : ''),
        body: (parsed && parsed.body) || (raw || ''),
        done: { gather: true, screen: true, extract: true, generate: true },
      }));
    } catch {
      setReport((prev: any) => ({ ...prev, title: q, abstract: 'Could not generate the report. Please try again.', body: '', done: { gather: true, screen: true, extract: true, generate: true } }));
    } finally {
      setReportBusy(false);
      setReportPhase('');
    }
  }

  async function runExtract(q: string) {
    setMode('extract');
    setNavView('search');
    setQuestion(q);
    pushRecent(q, 'Extract data');
    setBusy(true);
    setPhase('Searching academic databases...');
    setPapers([]); setSynthesis(''); setColumns([]); setSearchTerms([]); setFollowups([]); setChatThread([]);
    try {
      const items = await searchPapers(q, paperSource, 15);
      setPapers(items);
      setSearchTerms([q]);
      if (!items.length) { setBusy(false); setPhase(''); return; }
      const cols = EXTRACT_PRESETS.map((name, i) => ({ id: 'c' + Date.now() + '_' + i, name: name }));
      setColumns(cols);
      let filled = items.map((p: any) => ({ ...p, summary: p.abstract ? p.abstract.slice(0, 180) + '...' : '', cols: { ...p.cols } }));
      setPapers(filled);
      for (let k = 0; k < EXTRACT_PRESETS.length; k++) {
        setPhase('Extracting: ' + EXTRACT_PRESETS[k] + ' (' + (k + 1) + '/' + EXTRACT_PRESETS.length + ')...');
        const res = await extractAnswers(items, EXTRACT_PRESETS[k]);
        filled = filled.map((p: any, i: number) => ({ ...p, cols: { ...p.cols, [cols[k].id]: res.answers[i] || 'Not reported' }, colQuotes: { ...(p.colQuotes || {}), [cols[k].id]: res.quotes[i] || '' } }));
        setPapers(filled);
      }
    } catch {
      // ignore
    } finally {
      setBusy(false);
      setPhase('');
    }
  }

  async function runSysSearch(q: string) {
    setMode('systematic');
    setNavView('search');
    setSysQ(q);
    pushRecent(q, 'Systematic review');
    setSysBusy(true);
    setSysStep(1);
    setSysPapers([]); setSysCols([]);
    try {
      const items = (await searchPapers(q, paperSource, 20)).map((p: any) => ({ ...p, included: true }));
      setSysPapers(items);
    } catch {
      // ignore
    } finally {
      setSysBusy(false);
    }
  }
  function sysToggle(id: string) {
    setSysPapers((prev) => prev.map((p) => p.id === id ? { ...p, included: !p.included } : p));
  }
  async function runSysExtract() {
    const inc = sysPapers.filter((p) => p.included);
    if (!inc.length) return;
    setSysBusy(true);
    setSysStep(2);
    const cols = EXTRACT_PRESETS.map((name, i) => ({ id: 's' + Date.now() + '_' + i, name: name }));
    setSysCols(cols);
    let filled = inc.map((p: any) => ({ ...p, cols: { ...p.cols } }));
    try {
      for (let k = 0; k < EXTRACT_PRESETS.length; k++) {
        const res = await extractAnswers(inc, EXTRACT_PRESETS[k]);
        filled = filled.map((p: any, i: number) => ({ ...p, cols: { ...p.cols, [cols[k].id]: res.answers[i] || 'Not reported' }, colQuotes: { ...(p.colQuotes || {}), [cols[k].id]: res.quotes[i] || '' } }));
        setSysPapers((prev) => prev.map((p) => { const f = filled.find((x: any) => x.id === p.id); return f ? { ...f, included: true } : p; }));
      }
    } catch {
      // ignore
    } finally {
      setSysBusy(false);
    }
  }
  function downloadSys() {
    const inc = sysPapers.filter((p) => p.included);
    const esc = (v: any) => '"' + String(v === undefined || v === null ? '' : v).split('"').join('""') + '"';
    const head = ['Title', 'Authors', 'Year', 'DOI'].concat(sysCols.map((c) => c.name));
    const body = inc.map((p) => [p.title, p.authorStr, p.year, p.doi].concat(sysCols.map((c) => p.cols[c.id] || '')));
    const csv = [head].concat(body).map((row) => row.map(esc).join(',')).join('\n');
    doDownload(csv, (sysQ || 'systematic-review').slice(0, 40) + '.csv', 'text/csv');
  }

  async function agentSend(text: string) {
    const q = (text || '').trim();
    if (!q || agentBusy) return;
    setAgentInput('');
    if (!agentChat.length) { pushRecent(q, 'Research agent'); agentSessionKeyRef.current = q; }
    setAgentChat((prev) => [...prev, { role: 'user', text: q }, { role: 'assistant', text: '', busy: true, steps: ['Planning research approach...'], sources: [] }]);
    setAgentBusy(true);
    let sources: any[] = [];
    try {
      setAgentChat((prev) => { const m = [...prev]; m[m.length - 1] = { ...m[m.length - 1], steps: ['Planned research approach', 'Searching academic databases...'] }; return m; });
      sources = await searchPapers(q, paperSource, 8);
      setAgentChat((prev) => { const m = [...prev]; m[m.length - 1] = { ...m[m.length - 1], steps: ['Planned research approach', 'Found ' + sources.length + ' sources', 'Analysing and synthesising...'], sources: sources }; return m; });
      const list = sources.map((p, i) => '[' + (i + 1) + '] ' + p.title + ' (' + p.authorStr + ', ' + p.year + '). ' + (p.abstract || '').slice(0, 400)).join('\n\n');
      const ans = await callChat('Answer this research question using ONLY the numbered sources below. Support each claim with a bracketed citation like [1] or [2] that refers to the matching source number (you may combine like [1][3]). Do not invent sources. Give a structured Markdown answer with a short bottom-line synthesis. Question: "' + q + '"\n\nSources:\n' + list);
      const modelOk = !!(ans && ans.trim() && ans.indexOf('⚠') !== 0);
      const finalText = modelOk ? ans : synthesizeAgentAnswer(q, sources);
      setAgentChat((prev) => { const m = [...prev]; m[m.length - 1] = { role: 'assistant', busy: false, text: linkifyAgent(finalText, sources), steps: ['Planned research approach', 'Found ' + sources.length + ' sources', 'Synthesised findings'], sources: sources }; persistAgentSession(agentSessionKeyRef.current, m); return m; });
    } catch {
      setAgentChat((prev) => { const m = [...prev]; m[m.length - 1] = { role: 'assistant', busy: false, text: 'Could not complete the research. Please try again.', steps: [], sources: [] }; return m; });
    } finally {
      setAgentBusy(false);
    }
  }

  async function reportChatSend(text: string) {
    const q = (text || '').trim();
    if (!q || !report) return;
    setReportChatInput('');
    setReportChat((prev) => [...prev, { role: 'user', text: q }, { role: 'assistant', text: '', busy: true }]);
    const ctx = 'Report topic: ' + report.question + '\n\nReport abstract: ' + (report.abstract || '').slice(0, 800);
    const ans = await callChat(ctx + '\n\nQuestion about the report: ' + q + '\n\nAnswer in Markdown.', false, 'LITERATURE REVIEW');
    setReportChat((prev) => { const m = [...prev]; m[m.length - 1] = { role: 'assistant', text: ans || 'No response.' }; return m; });
  }
  function saveReportDoc() {
    if (!report) return;
    const s = report.screened || [];
    const txt = (report.title || report.question) + '\n\n' + (report.abstract || '') + '\n\n' + (report.body || '') + '\n\nSources:\n' + s.map((p: any, i: number) => (i + 1) + '. ' + p.title + ' (' + p.authorStr + ', ' + p.year + '). ' + (p.url || '')).join('\n');
    doDownload(txt, (report.title || 'research-report').slice(0, 40) + '.txt', 'text/plain');
  }

  function colLabel(s: string): string {
    let x = s.trim().replace(/^(please\s+)?(can you\s+)?(add a column for|add a column|add|separate the table by|separate by|group the table by|group by|break down by|include|show me|show)\s+/i, '');
    x = x.replace(/\s+column$/i, '').trim();
    x = x.charAt(0).toUpperCase() + x.slice(1);
    return (x || s).slice(0, 40);
  }

  async function runAddColumn(cq: string): Promise<string> {
    if (!cq || !papers.length) return '';
    setColBusy(true);
    const colId = 'c' + Date.now();
    const name = colLabel(cq);
    setColumns((prev) => [...prev, { id: colId, name: name }]);
    try {
      const res = await extractAnswers(papers, cq);
      setPapers((prev) => prev.map((p, i) => ({ ...p, cols: { ...p.cols, [colId]: res.answers[i] || 'Not reported' }, colQuotes: { ...(p.colQuotes || {}), [colId]: res.quotes[i] || '' } })));
    } catch {
      setPapers((prev) => prev.map((p) => ({ ...p, cols: { ...p.cols, [colId]: 'Not reported' } })));
    } finally {
      setColBusy(false);
    }
    return name;
  }

  function addColumn() {
    const cq = colInput.trim();
    if (!cq) return;
    setAddingCol(false);
    setColInput('');
    runAddColumn(cq);
  }

  async function refine(cmd: string) {
    const c = (cmd || '').trim();
    if (!c || chatBusy || !papers.length) return;
    setChatInput('');
    setChatThread((prev) => [...prev, { role: 'user', text: c }, { role: 'assistant', text: '', busy: true }]);
    setChatBusy(true);
    try {
      const name = await runAddColumn(c);
      setChatThread((prev) => { const m = [...prev]; m[m.length - 1] = { role: 'assistant', text: name ? ('Added a new column **' + name + '** and filled it across all ' + papers.length + ' papers. You can sort or download the updated table on the right.') : 'Updated your analysis.' }; return m; });
    } catch {
      setChatThread((prev) => { const m = [...prev]; m[m.length - 1] = { role: 'assistant', text: 'Sorry, I could not update the table. Please try rephrasing.' }; return m; });
    } finally {
      setChatBusy(false);
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
    doDownload(csv, (question || 'literature-review').slice(0, 40) + '.csv', 'text/csv');
  }

  function downloadExcel() {
    const esc = (v: any) => String(v === undefined || v === null ? '' : v).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');
    const head = ['Title', 'Authors', 'Year', 'Journal', 'Cited by', 'DOI', 'Summary'].concat(columns.map((c) => c.name));
    const bodyRows = view().map((p) => {
      const cells = [p.title, p.authors.join('; '), p.year, p.venue, p.cited, p.doi, p.summary].concat(columns.map((c) => p.cols[c.id] || ''));
      return '<tr>' + cells.map((c) => '<td>' + esc(c) + '</td>').join('') + '</tr>';
    }).join('');
    const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><tr>' + head.map((h) => '<th>' + esc(h) + '</th>').join('') + '</tr>' + bodyRows + '</table></body></html>';
    doDownload(html, (question || 'literature-review').slice(0, 40) + '.xls', 'application/vnd.ms-excel');
  }

  function downloadBib() {
    const clean = (v: any) => String(v === undefined || v === null ? '' : v).split('{').join('').split('}').join('');
    const txt = view().map((p, i) => {
      const last = (p.authors[0] || 'ref').split(' ').filter(Boolean).pop() || 'ref';
      const key = clean(last).replace(/[^A-Za-z]/g, '') + (p.year || '') + (i + 1);
      const auth = (p.authors && p.authors.length ? p.authors : ['Unknown']).map(clean).join(' and ');
      const type = p.kind === 'trial' ? '@misc' : '@article';
      let e = type + '{' + key + ',\n  title={' + clean(p.title) + '},\n  author={' + auth + '},\n';
      if (p.venue) e += '  journal={' + clean(p.venue) + '},\n';
      if (p.year) e += '  year={' + p.year + '},\n';
      if (p.doi) e += '  doi={' + p.doi + '},\n';
      if (p.url) e += '  url={' + p.url + '},\n';
      e += '}';
      return e;
    }).join('\n\n');
    doDownload(txt, (question || 'literature-review').slice(0, 40) + '.bib', 'application/x-bibtex');
  }

  function downloadRis() {
    const txt = view().map((p) => {
      const L = [p.kind === 'trial' ? 'TY  - DATA' : 'TY  - JOUR', 'TI  - ' + p.title];
      (p.authors && p.authors.length ? p.authors : ['Unknown']).forEach((a: any) => L.push('AU  - ' + a));
      if (p.venue) L.push('JO  - ' + p.venue);
      if (p.year) L.push('PY  - ' + p.year);
      if (p.doi) L.push('DO  - ' + p.doi);
      if (p.url) L.push('UR  - ' + p.url);
      if (p.summary) L.push('AB  - ' + p.summary);
      L.push('ER  - ');
      return L.join('\n');
    }).join('\n\n');
    doDownload(txt, (question || 'literature-review').slice(0, 40) + '.ris', 'application/x-research-info-systems');
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
    ...(onHome ? [{ id: 'home', label: 'Home', Icon: Home }] : []),
    { id: 'new', label: 'New', Icon: Plus },
    { id: 'recents', label: 'Recents', Icon: Clock },
    { id: 'library', label: 'Library', Icon: LibraryIcon },
    { id: 'alerts', label: 'Alerts', Icon: Bell },
  ];
  const modeList = [
    { id: 'find', label: 'Find papers', Icon: Search, group: 'TOOLS' },
    { id: 'chat', label: 'Chat with papers', Icon: MessageSquare, group: 'TOOLS' },
    { id: 'extract', label: 'Extract data', Icon: Table2, group: 'TOOLS' },
    { id: 'agent', label: 'Research agent', Icon: FlaskConical, group: 'WORKFLOWS' },
    { id: 'report', label: 'Report', Icon: FileText, group: 'WORKFLOWS' },
    { id: 'systematic', label: 'Systematic review', Icon: ListChecks, group: 'WORKFLOWS' },
  ];
  const modeLabel = mode === 'chat' ? 'Chat with papers' : mode === 'report' ? 'Report' : mode === 'extract' ? 'Extract data' : mode === 'systematic' ? 'Systematic review' : mode === 'agent' ? 'Research agent' : 'Find papers';
  const modeIcon = mode === 'chat' ? MessageSquare : mode === 'report' ? FileText : mode === 'extract' ? Table2 : mode === 'systematic' ? ListChecks : mode === 'agent' ? FlaskConical : Search;
  const filteredRecents = recents.filter((r) => !recentSearch || (r.question || '').toLowerCase().indexOf(recentSearch.toLowerCase()) !== -1);
  const shownDocs = libDocs.filter((d) => (activeCol === 'all' || activeCol === 'trash') ? activeCol !== 'trash' : d.collection === activeCol).filter((d) => !libSearch || docName(d).toLowerCase().indexOf(libSearch.toLowerCase()) !== -1);

  const SOURCES = [
    { id: 'openalex', label: 'OpenAlex' },
    { id: 'all', label: 'All sources' },
    { id: 'semanticscholar', label: 'Semantic Scholar' },
    { id: 'europepmc', label: 'Europe PMC' },
    { id: 'arxiv', label: 'arXiv' },
    { id: 'crossref', label: 'Crossref' },
  ];
  const sourceLabel = (SOURCES.find((x) => x.id === paperSource) || SOURCES[0]).label;
  const sourceDropdown = (
    <div className="relative inline-block">
      <button ref={srcBtnRef} onClick={toggleSrcMenu} className="inline-flex items-center gap-1.5 border border-border rounded-lg px-3 py-1.5 text-[12.5px] font-semibold hover:bg-muted"><BookOpen className="w-3.5 h-3.5" /> Source: <span className="text-primary">{sourceLabel}</span> <ChevronDown className="w-3.5 h-3.5" /></button>
      {srcMenu ? (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setSrcMenu(false)} />
          <div className="fixed z-[81] w-[210px] bg-card border border-border rounded-xl shadow-2xl p-1.5" style={{ top: srcBtnPos.top, left: srcBtnPos.left }}>
            {SOURCES.map((sc) => (
              <button key={sc.id} onClick={() => { setPaperSource(sc.id); setSrcMenu(false); }} className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13.5px] hover:bg-muted text-left">{sc.label} {paperSource === sc.id ? <Check className="w-3.5 h-3.5 text-primary" /> : null}</button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );

  const leftNav = (
    <aside className={'shrink-0 border-r border-border flex flex-col bg-card/40 h-full fixed md:static inset-y-0 left-0 z-[60] w-[224px] transition-transform duration-200 md:translate-x-0 ' + (mobileNav ? 'translate-x-0 ' : '-translate-x-full ') + (navOpen ? 'md:w-[224px]' : 'md:w-[56px]')}>
      <div className="flex items-center justify-between px-3 h-12 border-b border-border shrink-0">
        {(navOpen || mobileNav) ? (
          <div className="flex items-center gap-2 text-foreground min-w-0"><span className="w-5 h-5 bg-contain bg-no-repeat bg-center shrink-0" style={{ backgroundImage: 'url(/logo.png)' }} /> <div className="flex flex-col leading-tight min-w-0"><span className="font-bold text-[12.5px] truncate">Literature Review</span><span className="text-[9.5px] text-muted-foreground">by Pinnovix</span></div></div>
        ) : (
          <span className="w-5 h-5 bg-contain bg-no-repeat bg-center mx-auto" style={{ backgroundImage: 'url(/logo.png)' }} />
        )}
        <button onClick={() => setMobileNav(false)} title="Close menu" className="md:hidden text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        <button onClick={() => setNavOpen((v) => !v)} title="Toggle sidebar" className="hidden md:block text-muted-foreground hover:text-foreground"><PanelLeft className="w-4 h-4" /></button>
      </div>
      <nav className="p-2 flex flex-col gap-0.5 shrink-0">
        {navItems.map((it) => {
          const active = navView === it.id;
          return (
            <button key={it.id} onClick={() => { setMobileNav(false); if (it.id === 'home') { if (onHome) onHome(); } else if (it.id === 'new') startNew(); else setNavView(it.id); }} title={it.label}
              className={(active ? 'bg-muted text-foreground font-semibold ' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground ') + 'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors'}>
              <it.Icon className="w-4 h-4 shrink-0" /> {(navOpen || mobileNav) ? <span>{it.label}</span> : null}
            </button>
          );
        })}
      </nav>
      {(navOpen || mobileNav) ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 mt-1 min-h-0">
          <div className="text-[10.5px] font-bold text-muted-foreground uppercase tracking-wide px-2 mb-1">Recents</div>
          {recents.length === 0 ? (
            <div className="px-2 text-[12px] text-muted-foreground italic">No recent searches.</div>
          ) : recents.slice(0, 20).map((r) => (
            <button key={r.id} onClick={() => { setMobileNav(false); openRecent(r); }} className="w-full text-left flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-foreground/80 hover:bg-muted/60 hover:text-foreground truncate">
              {r.type === 'Research report' ? <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : r.type === 'Chat' ? <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              <span className="truncate">{r.question}</span>
            </button>
          ))}
        </div>
      ) : <div className="flex-1" />}
      {onHome ? (
        <div className="p-2 border-t border-border shrink-0">
          <button onClick={onHome} className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground hover:bg-muted/60 hover:text-foreground">
            <ArrowLeft className="w-4 h-4 shrink-0" /> {(navOpen || mobileNav) ? <span>Personas</span> : null}
          </button>
        </div>
      ) : null}
      <div className="p-2 border-t border-border shrink-0 relative">
        {acctMenu && (
          <>
            <div className="fixed inset-0 z-[40]" onClick={() => setAcctMenu(false)} />
            <div className="absolute z-[41] bottom-full left-2 right-2 mb-1 bg-card border border-border rounded-xl shadow-2xl p-1.5">
              <div className="px-3 py-2 border-b border-border mb-1">
                <div className="text-[13px] font-bold truncate">{userName || 'Guest user'}</div>
                <div className="text-[11.5px] text-muted-foreground truncate">{userEmail || 'not signed in'}</div>
              </div>
              <button onClick={() => { setSettingsOpen(true); setAcctMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13.5px] hover:bg-muted text-left"><Settings className="w-4 h-4 text-muted-foreground" /> Settings</button>
              <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13.5px] hover:bg-muted text-left text-red-500"><LogOut className="w-4 h-4" /> Log out</button>
            </div>
          </>
        )}
        <button onClick={() => setAcctMenu((v) => !v)} className="w-full flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/60">
          <span className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[12px] font-bold shrink-0">{(userName || userEmail || 'G').slice(0, 1).toUpperCase()}</span>
          {(navOpen || mobileNav) ? <span className="flex-1 text-left text-[12.5px] truncate">{userEmail || 'Guest'}</span> : null}
          {(navOpen || mobileNav) ? <ChevronsUpDown className="w-4 h-4 text-muted-foreground shrink-0" /> : null}
        </button>
      </div>
    </aside>
  );

  const modeDropdown = (
    <div className="relative inline-block">
      <button ref={modeBtnRef} onClick={toggleModeMenu} className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-3.5 py-2 text-[13.5px] font-semibold">
        {(() => { const I = modeIcon; return <I className="w-4 h-4" />; })()} {modeLabel} <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {modeMenu ? (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setModeMenu(false)} />
          <div className="fixed z-[81] w-[280px] bg-card border border-border rounded-xl shadow-2xl p-1.5" style={{ top: menuPos.top, left: menuPos.left }}>
            <div className="px-3 py-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Tools</div>
            {modeList.filter((m) => m.group === 'TOOLS').map((m) => (
              <button key={m.id} onClick={() => selectMode(m.id)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] hover:bg-muted text-left"><m.Icon className="w-4 h-4 text-muted-foreground" /> {m.label}</button>
            ))}
            <div className="px-3 py-1.5 mt-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Workflows</div>
            {modeList.filter((m) => m.group === 'WORKFLOWS').map((m) => (
              <button key={m.id} onClick={() => selectMode(m.id)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] hover:bg-muted text-left"><m.Icon className="w-4 h-4 text-muted-foreground" /> {m.label}</button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );

  // ---- SOURCE SELECT MODAL (snip 3) ----
  const sourceModal = srcModal ? (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-6" onClick={() => setSrcModal(false)}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <input ref={modalFileRef} type="file" multiple className="hidden" onChange={onUploadFiles} />
        <div className="p-5 border-b border-border">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[16px] font-bold">Select or upload sources to begin chat</div>
              <div className="text-[12.5px] text-muted-foreground mt-0.5">{libDocs.length ? 'You have ' + libDocs.length + ' source' + (libDocs.length > 1 ? 's' : '') + ' in your library. Select sources to start a new chat.' : 'No sources in your library.'} Papers you upload are stored in your library and are only visible to you.</div>
            </div>
            <button onClick={() => setSrcModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            {(() => {
              const colLabel = srcCol === 'all' ? 'All papers' : ((collections.find((c) => c.id === srcCol) || {}).name || 'Collection');
              const colCount = srcCol === 'all' ? libDocs.length : libDocs.filter((d) => d.collection === srcCol).length;
              return (
                <div className="relative">
                  <button onClick={() => { setSrcColDd((v) => !v); setSrcFilterDd(false); }} className="inline-flex items-center gap-2 border border-border rounded-lg px-3 py-1.5 text-[13px] hover:bg-muted">{colLabel} <span className="text-muted-foreground">{colCount}</span> <ChevronDown className="w-3.5 h-3.5" /></button>
                  {srcColDd ? (
                    <>
                      <div className="fixed inset-0 z-[62]" onClick={() => setSrcColDd(false)} />
                      <div className="absolute z-[63] top-full left-0 mt-1 w-[240px] bg-card border border-border rounded-xl shadow-2xl p-1.5 max-h-[300px] overflow-y-auto custom-scrollbar">
                        <button onClick={() => { setSrcCol('all'); setSrcColDd(false); }} className={(srcCol === 'all' ? 'bg-muted font-semibold ' : 'hover:bg-muted ') + 'w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-[13px]'}><span className="flex items-center gap-2"><LibraryIcon className="w-3.5 h-3.5 text-muted-foreground" /> All papers</span><span className="text-muted-foreground text-[12px]">{libDocs.length}</span></button>
                        {collections.length === 0 ? <div className="px-3 py-2 text-[12px] text-muted-foreground italic">No collections yet.</div> : collections.map((c) => (
                          <button key={c.id} onClick={() => { setSrcCol(c.id); setSrcColDd(false); }} className={(srcCol === c.id ? 'bg-muted font-semibold ' : 'hover:bg-muted ') + 'w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-[13px]'}><span className="flex items-center gap-2 truncate"><BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> <span className="truncate">{c.name}</span></span><span className="text-muted-foreground text-[12px] shrink-0">{libDocs.filter((d) => d.collection === c.id).length}</span></button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })()}
            <div className="flex-1" />
            <button onClick={() => modalFileRef.current && modalFileRef.current.click()} className="inline-flex items-center gap-1.5 border border-border rounded-lg px-3 py-1.5 text-[13px] font-semibold hover:bg-muted"><Plus className="w-3.5 h-3.5" /> Upload</button>
            <div className="relative">
              <button onClick={() => { setSrcFilterDd((v) => !v); setSrcColDd(false); }} className={((srcMethods.length ? 'border-primary text-primary ' : 'text-foreground ') + 'inline-flex items-center gap-1.5 border border-border rounded-lg px-3 py-1.5 text-[13px] font-semibold hover:bg-muted')}><SlidersHorizontal className="w-3.5 h-3.5" /> Filters{srcMethods.length ? ' (' + srcMethods.length + ')' : ''}</button>
              {srcFilterDd ? (
                <>
                  <div className="fixed inset-0 z-[62]" onClick={() => setSrcFilterDd(false)} />
                  <div className="absolute z-[63] top-full right-0 mt-1 w-[230px] bg-card border border-border rounded-xl shadow-2xl p-1.5">
                    <div className="px-3 py-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Creation method</div>
                    {[{ id: 'upload', label: 'Upload' }, { id: 'zotero', label: 'Zotero import' }, { id: 'search', label: 'Added from Pinnovix search' }].map((f) => (
                      <button key={f.id} onClick={() => setSrcMethods((prev) => prev.indexOf(f.id) !== -1 ? prev.filter((x) => x !== f.id) : prev.concat(f.id))} className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] hover:bg-muted">
                        <span className={'w-4 h-4 rounded border flex items-center justify-center shrink-0 ' + (srcMethods.indexOf(f.id) !== -1 ? 'bg-primary border-primary text-primary-foreground' : 'border-border')}>{srcMethods.indexOf(f.id) !== -1 ? <Check className="w-3 h-3" /> : null}</span>
                        {f.label}
                      </button>
                    ))}
                    {srcMethods.length ? <button onClick={() => setSrcMethods([])} className="w-full text-left px-3 py-2 rounded-lg text-[12.5px] text-muted-foreground hover:bg-muted mt-1 border-t border-border">Clear filters</button> : null}
                  </div>
                </>
              ) : null}
            </div>
            <div className="inline-flex border border-border rounded-lg overflow-hidden">
              <button onClick={() => setSrcView('list')} title="List view" className={(srcView === 'list' ? 'bg-muted text-foreground ' : 'text-muted-foreground ') + 'px-2 py-1.5 hover:bg-muted'}><ListChecks className="w-4 h-4" /></button>
              <button onClick={() => setSrcView('table')} title="Table view" className={(srcView === 'table' ? 'bg-muted text-foreground ' : 'text-muted-foreground ') + 'px-2 py-1.5 hover:bg-muted border-l border-border'}><Table2 className="w-4 h-4" /></button>
            </div>
            <div className="relative">
              <button onClick={() => { setSrcColPop((v) => !v); setSrcTagPop(false); }} disabled={!srcSelIds().length} className="inline-flex items-center gap-1.5 border border-border rounded-lg px-3 py-1.5 text-[13px] font-semibold hover:bg-muted disabled:opacity-40"><FolderPlus className="w-3.5 h-3.5" /> Collections</button>
              {srcColPop ? (
                <>
                  <div className="fixed inset-0 z-[62]" onClick={() => setSrcColPop(false)} />
                  <div className="absolute z-[63] top-full right-0 mt-1 w-[250px] bg-card border border-border rounded-xl shadow-2xl p-2">
                    <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b border-border"><span className="text-[13px] font-bold">Add to collection</span><button onClick={() => { setSrcColPop(false); newCollection(); }} className="text-[12px] font-semibold border border-border rounded-md px-2 py-1 hover:bg-muted">New</button></div>
                    <div className="max-h-[180px] overflow-y-auto custom-scrollbar">
                      {collections.length === 0 ? <div className="px-2 py-2 text-[12px] text-muted-foreground italic">No collections. Tap New to create one.</div> : collections.map((c) => (
                        <button key={c.id} onClick={() => setSrcColApply(c.id)} className={(srcColApply === c.id ? 'bg-muted font-semibold ' : 'hover:bg-muted ') + 'w-full text-left flex items-center gap-2 px-2 py-2 rounded-lg text-[13px]'}><span className={'w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ' + (srcColApply === c.id ? 'border-primary' : 'border-border')}>{srcColApply === c.id ? <span className="w-2 h-2 rounded-full bg-primary" /> : null}</span> {c.name}</button>
                      ))}
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2 mt-1 border-t border-border"><button onClick={() => { setSrcColPop(false); setSrcColApply(''); }} className="text-[12.5px] font-semibold border border-border rounded-md px-3 py-1.5 hover:bg-muted">Cancel</button><button onClick={srcApplyCollection} disabled={!srcColApply} className="text-[12.5px] font-semibold bg-primary text-primary-foreground rounded-md px-3 py-1.5 disabled:opacity-40">Apply</button></div>
                  </div>
                </>
              ) : null}
            </div>
            <div className="relative">
              <button onClick={() => { setSrcTagPop((v) => !v); setSrcColPop(false); }} disabled={!srcSelIds().length} title="Tag" className="w-8 h-8 border border-border rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40"><Tag className="w-3.5 h-3.5" /></button>
              {srcTagPop ? (
                <>
                  <div className="fixed inset-0 z-[62]" onClick={() => setSrcTagPop(false)} />
                  <div className="absolute z-[63] top-full right-0 mt-1 w-[260px] bg-card border border-border rounded-xl shadow-2xl p-2">
                    <div className="flex items-center gap-2">
                      <input autoFocus value={srcTagInput} onChange={(e) => setSrcTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') srcApplyTag(srcTagInput); }} placeholder="Find or create tags" className="flex-1 bg-muted/40 border border-border rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:border-primary" />
                      <button onClick={() => srcApplyTag(srcTagInput)} disabled={!srcTagInput.trim()} className="text-[12.5px] font-semibold border border-border rounded-md px-2.5 py-1.5 hover:bg-muted disabled:opacity-40">Add</button>
                    </div>
                    <div className="mt-2 max-h-[150px] overflow-y-auto custom-scrollbar">
                      {(() => {
                        const tags = Array.from(new Set(libDocs.map((d) => d.tag).filter(Boolean))) as string[];
                        const shown = tags.filter((t) => !srcTagInput || t.toLowerCase().indexOf(srcTagInput.toLowerCase()) !== -1);
                        if (!shown.length) return <div className="px-2 py-2 text-[12px] text-muted-foreground">No tags in your library</div>;
                        return shown.map((t) => (<button key={t} onClick={() => srcApplyTag(t)} className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] hover:bg-muted"><Tag className="w-3.5 h-3.5 text-muted-foreground" /> {t}</button>));
                      })()}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
            <button onClick={srcDeleteSelected} disabled={!srcSelIds().length} title="Delete selected" className="w-8 h-8 border border-border rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-muted disabled:opacity-40"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-auto custom-scrollbar p-2">
          {(() => {
            const srcDocs = libDocs
              .filter((d) => srcCol === 'all' ? true : d.collection === srcCol)
              .filter((d) => srcMethods.length === 0 ? true : srcMethods.indexOf(docMethod(d)) !== -1);
            const allChecked = srcDocs.length > 0 && srcDocs.every((d) => srcSel[d.id || docName(d)]);
            const toggleAll = () => { const v = !allChecked; setSrcSel(() => { const o: any = {}; if (v) srcDocs.forEach((d) => { o[d.id || docName(d)] = true; }); return o; }); };
            if (libDocs.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center text-center py-14">
                  <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4"><FileText className="w-8 h-8 text-muted-foreground" /></div>
                  <div className="font-semibold text-[15px]">Upload papers to start using your library.</div>
                  <div className="text-[13px] text-muted-foreground mt-1 max-w-sm">Your library is used to store papers and research for analysis and insights.</div>
                  <div className="flex items-center gap-3 mt-5">
                    <button onClick={() => modalFileRef.current && modalFileRef.current.click()} className="flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-[13.5px] font-semibold"><Upload className="w-4 h-4" /> Upload</button>
                    <button className="border border-border rounded-lg px-4 py-2 text-[13.5px] font-semibold">Connect Zotero</button>
                  </div>
                </div>
              );
            }
            if (srcDocs.length === 0) {
              return <div className="text-center text-[13px] text-muted-foreground py-14">No papers match this collection or filter.</div>;
            }
            if (srcView === 'table') {
              return (
                <table className="w-full text-[13px] min-w-[640px]">
                  <thead>
                    <tr className="text-left text-muted-foreground text-[12px] border-b border-border">
                      <th className="px-3 py-2.5 w-10"><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                      <th className="px-3 py-2.5 font-semibold">Title <span className="text-muted-foreground">({srcDocs.length} source{srcDocs.length > 1 ? 's' : ''})</span></th>
                      <th className="px-3 py-2.5 font-semibold w-[200px]">Authors</th>
                      <th className="px-3 py-2.5 font-semibold w-[150px]">Full text</th>
                      <th className="px-3 py-2.5 font-semibold w-[160px]">File</th>
                    </tr>
                  </thead>
                  <tbody>
                    {srcDocs.map((d) => {
                      const id = d.id || docName(d);
                      const hasFt = !!(d.url || d.fullText || d.creationMethod === 'upload' || d.size);
                      return (
                        <tr key={id} className={'border-b border-border last:border-0 hover:bg-muted/50 ' + (srcSel[id] ? 'bg-primary/5' : '')}>
                          <td className="px-3 py-2.5"><input type="checkbox" checked={!!srcSel[id]} onChange={() => toggleSrc(id)} /></td>
                          <td className="px-3 py-2.5"><div className="font-medium leading-snug">{docName(d)}</div>{d.tag ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary mt-1 inline-block">{d.tag}</span> : null}</td>
                          <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[200px]">{d.authorStr || '-'}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{hasFt ? 'Full text available' : '-'}</td>
                          <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[160px]">{d.creationMethod === 'upload' || d.size ? docName(d) : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            }
            return (
              <div>
                <div className="flex items-center gap-3 px-3 py-2 border-b border-border text-[12px] font-semibold text-muted-foreground">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                  <span className="flex-1">Paper</span>
                  <span>{srcDocs.length} source{srcDocs.length > 1 ? 's' : ''}</span>
                </div>
                {srcDocs.map((d) => {
                  const id = d.id || docName(d);
                  const isUpload = d.creationMethod === 'upload' || !!d.size;
                  const hasFt = !!(d.url || d.fullText || isUpload);
                  return (
                    <label key={id} className={'flex items-start gap-3 px-3 py-3 rounded-lg hover:bg-muted cursor-pointer border-b border-border last:border-0 ' + (srcSel[id] ? 'bg-primary/5' : '')}>
                      <input type="checkbox" className="mt-0.5" checked={!!srcSel[id]} onChange={() => toggleSrc(id)} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] font-semibold leading-snug">{docName(d)}{d.tag ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary ml-2">{d.tag}</span> : null}</div>
                        {isUpload && d.name ? <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground mt-1"><FileText className="w-3.5 h-3.5" /> {d.name}</div> : null}
                        {hasFt ? <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground mt-0.5"><FileText className="w-3.5 h-3.5" /> {d.url ? <a href={d.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">Full text</a> : 'Full text'}</div> : null}
                      </div>
                      <span className="text-[12px] text-muted-foreground shrink-0">{fmtTime(d.ts)}</span>
                    </label>
                  );
                })}
              </div>
            );
          })()}
        </div>
        <div className="p-4 border-t border-border flex items-center justify-between">
          <span className="text-[12.5px] text-muted-foreground">{Object.values(srcSel).filter(Boolean).length} selected</span>
          <button onClick={confirmSources} className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center" title="Begin chat"><ArrowRight className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  ) : null;

  // ---- RECENTS PAGE (snip 1) ----
  const recentsPage = (
    <div className="h-full overflow-y-auto custom-scrollbar p-8">
      <h1 className="text-2xl font-bold mb-5">Recents</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-7">
        {[
          { t: 'New search', d: 'Find papers, extract findings, and chat', Icon: Search, m: 'find' },
          { t: 'New research report', d: 'Ask a question to generate a report', Icon: FileText, m: 'report' },
          { t: 'New systematic review', d: 'Ask, search, screen, and extract', Icon: ListChecks, m: 'find' },
        ].map((c) => (
          <button key={c.t} onClick={() => { startNew(); setMode(c.m); }} className="text-left border border-border rounded-2xl bg-card hover:border-primary transition-colors p-5 flex items-start justify-between gap-3">
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
            <tr key={r.id} onClick={() => openRecent(r)} className="border-t border-border cursor-pointer hover:bg-muted/40">
              <td className="py-3 pr-4"><div className="flex items-center gap-2.5 font-semibold">{r.type === 'Research report' ? <FileText className="w-4 h-4 text-muted-foreground" /> : <Search className="w-4 h-4 text-muted-foreground" />} {r.question}</div></td>
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
      <div className="hidden md:block w-[220px] shrink-0 border-r border-border p-3 overflow-y-auto custom-scrollbar">
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
          <div key={c.id} className="group flex items-center gap-1">
            <button onClick={() => setActiveCol(c.id)} className={(activeCol === c.id ? 'bg-muted font-semibold ' : 'hover:bg-muted/60 ') + 'flex-1 min-w-0 text-left rounded-lg px-3 py-2 text-[13.5px] truncate flex items-center gap-2'}><BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> <span className="truncate">{c.name}</span></button>
            <button onClick={() => deleteCollection(c.id)} title="Delete collection" className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 shrink-0 p-1 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-6 py-4 border-b border-border text-[14px] text-muted-foreground">Library / <span className="text-foreground font-semibold">{activeCol === 'all' ? 'All' : activeCol === 'trash' ? 'Recently deleted' : (collections.find((c) => c.id === activeCol) || {}).name || 'Collection'}</span></div>
        <div className="px-6 py-2.5 border-b border-border flex items-center gap-2 flex-wrap">
          <button className="inline-flex items-center gap-1.5 border border-border rounded-lg px-3 py-1.5 text-[12.5px] font-semibold hover:bg-muted"><SlidersHorizontal className="w-3.5 h-3.5" /> Filters</button>
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button onClick={() => setLibView('list')} className={(libView === 'list' ? 'bg-muted ' : '') + 'px-2 py-1.5'}><ListChecks className="w-3.5 h-3.5" /></button>
            <button onClick={() => setLibView('grid')} className={(libView === 'grid' ? 'bg-muted ' : '') + 'px-2 py-1.5 border-l border-border'}><Table2 className="w-3.5 h-3.5" /></button>
          </div>
          <button onClick={newCollection} className="inline-flex items-center gap-1.5 border border-border rounded-lg px-3 py-1.5 text-[12.5px] font-semibold hover:bg-muted"><FolderPlus className="w-3.5 h-3.5" /> Collections</button>
          <button onClick={() => Object.values(libSel).filter(Boolean).length && setTagModal(true)} title="Tag selected" className="w-8 h-8 border border-border rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40" disabled={!Object.values(libSel).filter(Boolean).length}><Tag className="w-3.5 h-3.5" /></button>
          <button ref={moveBtnRef} onClick={toggleMoveMenu} title="Move to collection" className="w-8 h-8 border border-border rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40" disabled={!Object.values(libSel).filter(Boolean).length}><FolderInput className="w-3.5 h-3.5" /></button>
          <button onClick={deleteSelectedDocs} title="Delete selected" className="w-8 h-8 border border-border rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-muted disabled:opacity-40" disabled={!Object.values(libSel).filter(Boolean).length}><Trash2 className="w-3.5 h-3.5" /></button>
          <div className="relative ml-auto">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={libSearch} onChange={(e) => setLibSearch(e.target.value)} placeholder="Search" className="bg-muted/40 border border-border rounded-lg pl-8 pr-2 py-1.5 text-[13px] outline-none focus:border-primary w-[200px]" />
          </div>
        </div>
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
              <thead>
                <tr className="text-left text-muted-foreground text-[12px] border-b border-border">
                  <th className="px-4 py-3 w-10"><input type="checkbox" checked={shownDocs.length > 0 && shownDocs.every((d) => libSel[d.id || docName(d)])} onChange={(e) => { const v = e.target.checked; const o: any = {}; if (v) shownDocs.forEach((d) => { o[d.id || docName(d)] = true; }); setLibSel(o); }} /></th>
                  <th className="px-2 py-3 font-semibold">{Object.values(libSel).filter(Boolean).length ? Object.values(libSel).filter(Boolean).length + ' source selected' : 'Title'}</th>
                  <th className="px-6 py-3 font-semibold w-[240px]">Authors</th>
                  <th className="px-6 py-3 font-semibold w-[150px]">Added</th>
                </tr>
              </thead>
              <tbody>
                {shownDocs.map((d) => {
                  const id = d.id || docName(d);
                  return (
                  <tr key={id} className={'border-b border-border hover:bg-muted/40 ' + (libSel[id] ? 'bg-primary/5' : '')}>
                    <td className="px-4 py-3"><input type="checkbox" checked={!!libSel[id]} onChange={() => setLibSel((p: any) => ({ ...p, [id]: !p[id] }))} /></td>
                    <td className="px-2 py-3"><div className="flex items-center gap-2.5 font-medium"><FileText className="w-4 h-4 text-muted-foreground shrink-0" /> <span>{docName(d)}</span>{d.tag ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">{d.tag}</span> : null}</div></td>
                    <td className="px-6 py-3 text-muted-foreground truncate max-w-[240px]">{d.authorStr || '-'}</td>
                    <td className="px-6 py-3 text-muted-foreground">{fmtTime(d.ts || d.uploadedAt || d.date)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="w-[260px] shrink-0 border-l border-border p-4 hidden lg:block">
        <div className="text-[14px] font-semibold mb-3">New from selection</div>
        <button onClick={startNew} className="w-full flex items-center justify-between border border-border rounded-xl px-3 py-3 text-[13.5px] hover:border-primary transition-colors mb-2"><span>Start systematic review</span><Table2 className="w-4 h-4 text-muted-foreground" /></button>
        <button onClick={runExtractFromSelection} className="w-full flex items-center justify-between border border-border rounded-xl px-3 py-3 text-[13.5px] hover:border-primary transition-colors mb-4"><span>Extract data</span><Sparkles className="w-4 h-4 text-muted-foreground" /></button>
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

  // ---- START SCREEN (mode aware) ----
  const startScreen = (
    <div className="flex w-full h-full items-start justify-center overflow-y-auto custom-scrollbar">
      <div className="w-full max-w-3xl mt-[9vh] px-4">
        <div className="text-center mb-5">
          <h1 className="text-2xl font-bold">Literature Review</h1>
          <p className="text-muted-foreground text-sm mt-1">Pick a tool, ask a question, and get real papers, chats or reports.</p>
        </div>
        <div className="border border-border rounded-2xl bg-card shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2 bg-primary/5 border-b border-border">{modeDropdown}</div>
          {mode === 'chat' ? (
            <div className="p-8 text-center">
              <div className="text-[14px] text-muted-foreground leading-relaxed">Select sources from your library<br />or upload your own to begin a conversation</div>
              <button onClick={() => setSrcModal(true)} className="mt-4 inline-flex items-center gap-2 border border-border rounded-lg px-4 py-2 text-[13.5px] font-semibold hover:bg-muted"><LibraryIcon className="w-4 h-4" /> Select sources</button>
            </div>
          ) : mode === 'report' ? (
            <div>
              <textarea value={reportInput} onChange={(e) => setReportInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (reportInput.trim()) runReport(reportInput.trim(), reportSource); } }} rows={3} autoFocus placeholder="Ask a research question to generate a report..." className="w-full bg-transparent px-4 py-3 text-[15px] outline-none resize-none placeholder:text-muted-foreground" />
              <div className="px-4 pb-2">
                <div className="text-[12px] text-muted-foreground mb-1.5">Try a couple of free examples to see what this is all about</div>
                <div className="flex gap-2 flex-wrap">
                  {['GLP-1R mechanisms', 'Magnesium effects on sleep', 'Online vs. in-person CBT'].map((ex) => (
                    <button key={ex} onClick={() => setReportInput(ex)} className="border border-border rounded-lg px-3 py-1.5 text-[12.5px] bg-muted/40 hover:border-primary">{ex}</button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <div className="relative">
                  <button onClick={() => setReportSrcMenu((v) => !v)} className="inline-flex items-center gap-1.5 border border-border rounded-lg px-3 py-1.5 text-[13px] font-semibold hover:bg-muted">Source <span className="text-primary">{reportSource}</span> <ChevronDown className="w-3.5 h-3.5" /></button>
                  {reportSrcMenu ? (
                    <>
                      <div className="fixed inset-0 z-[40]" onClick={() => setReportSrcMenu(false)} />
                      <div className="absolute z-[41] bottom-[110%] left-0 w-[200px] bg-card border border-border rounded-xl shadow-2xl p-1.5">
                        {['Research papers', 'Clinical trials'].map((s) => (
                          <button key={s} onClick={() => { setReportSource(s); setReportSrcMenu(false); }} className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13.5px] hover:bg-muted text-left">{s} {reportSource === s ? <Check className="w-3.5 h-3.5 text-primary" /> : null}</button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
                <button onClick={() => reportInput.trim() && runReport(reportInput.trim(), reportSource)} disabled={!reportInput.trim()} className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40" title="Generate report"><ArrowRight className="w-4 h-4" /></button>
              </div>
            </div>
          ) : mode === 'extract' ? (
            <div>
              <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.trim()) runExtract(input.trim()); } }} rows={4} autoFocus placeholder="Enter a question to extract a data matrix across papers (population, intervention, outcome, sample size, design)..." className="w-full bg-transparent px-4 py-3 text-[15px] outline-none resize-none placeholder:text-muted-foreground" />
              <div className="flex justify-end px-4 py-3 border-t border-border">
                <button onClick={() => input.trim() && runExtract(input.trim())} disabled={!input.trim()} className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40" title="Extract"><ArrowRight className="w-4 h-4" /></button>
              </div>
            </div>
          ) : mode === 'systematic' ? (
            <div>
              <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.trim()) runSysSearch(input.trim()); } }} rows={4} autoFocus placeholder="Enter a research question. I will search, let you screen papers, then extract a matrix..." className="w-full bg-transparent px-4 py-3 text-[15px] outline-none resize-none placeholder:text-muted-foreground" />
              <div className="flex justify-end px-4 py-3 border-t border-border">
                <button onClick={() => input.trim() && runSysSearch(input.trim())} disabled={!input.trim()} className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40" title="Search"><ArrowRight className="w-4 h-4" /></button>
              </div>
            </div>
          ) : mode === 'agent' ? (
            <div>
              <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.trim()) agentSend(input.trim()); } }} rows={4} autoFocus placeholder="Ask the research agent anything. It will plan, search, and synthesise with citations..." className="w-full bg-transparent px-4 py-3 text-[15px] outline-none resize-none placeholder:text-muted-foreground" />
              <div className="flex justify-end px-4 py-3 border-t border-border">
                <button onClick={() => input.trim() && agentSend(input.trim())} disabled={!input.trim()} className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40" title="Run agent"><ArrowRight className="w-4 h-4" /></button>
              </div>
            </div>
          ) : (
            <div>
              <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitStart(); } }} rows={4} autoFocus placeholder="e.g. Does intermittent fasting improve weight loss in adults?" className="w-full bg-transparent px-4 py-3 text-[15px] outline-none resize-none placeholder:text-muted-foreground" />
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                {sourceDropdown}
                <button onClick={submitStart} disabled={!input.trim()} className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40" title="Search"><ArrowRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 justify-center mt-5">
          {[
            { l: 'Create table', m: 'find', I: Table2 },
            { l: 'Extract data', m: 'extract', I: Table2 },
            { l: 'Draft report', m: 'report', I: FileText },
            { l: 'Systematic review', m: 'systematic', I: ListChecks },
            { l: 'Research agent', m: 'agent', I: FlaskConical },
          ].map((a) => (
            <button key={a.l} onClick={() => { resetSearch(); setMode(a.m); }} className={(mode === a.m ? 'border-primary text-primary ' : 'border-border ') + 'inline-flex items-center gap-1.5 border rounded-full px-3.5 py-1.5 text-[13px] font-semibold hover:bg-muted'}><a.I className="w-3.5 h-3.5" /> {a.l}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          <div>
            <div className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Suggested</div>
            {['Does intermittent fasting improve weight loss in adults?', 'Effectiveness of CBT for anxiety disorders', 'Impact of remote work on employee productivity'].map((ex) => (
              <button key={ex} onClick={() => runReview(ex)} className="w-full text-left border border-border rounded-xl p-3 bg-card hover:border-primary transition-colors text-[13px] text-muted-foreground mb-2 flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-primary shrink-0" /> {ex}</button>
            ))}
          </div>
          <div>
            <div className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Resume</div>
            {recents.length === 0 ? (
              <div className="text-[12.5px] text-muted-foreground italic">No recent work yet.</div>
            ) : recents.slice(0, 3).map((r) => (
              <button key={r.id} onClick={() => openRecent(r)} className="w-full text-left border border-border rounded-xl p-3 bg-card hover:border-primary transition-colors mb-2">
                <div className="text-[13.5px] font-semibold truncate">{r.question}</div>
                <div className="text-[11.5px] text-muted-foreground mt-1 flex items-center gap-1.5">{r.type === 'Research report' ? <FileText className="w-3 h-3" /> : r.type === 'Research agent' ? <FlaskConical className="w-3 h-3" /> : <Search className="w-3 h-3" />} {r.type} - {fmtTime(r.ts)}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ---- CHAT WITH PAPERS VIEW ----
  const chatView = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border flex items-center gap-3 shrink-0">
        {modeDropdown}
        <span className="text-[12.5px] text-muted-foreground">{chatSources.length ? chatSources.length + ' source' + (chatSources.length > 1 ? 's' : '') : 'No sources'}</span>
        <button onClick={() => setSrcModal(true)} className="text-[12.5px] text-primary font-semibold ml-auto">Manage sources</button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-3 max-w-3xl w-full mx-auto">
        {paperChat.length === 0 ? (
          <div className="text-center text-muted-foreground text-[13.5px] mt-10">Ask a question about your selected sources to begin.</div>
        ) : paperChat.map((m, i) => (
          m.role === 'user' ? (
            <div key={i} className="self-end max-w-[85%] bg-primary text-primary-foreground rounded-2xl px-4 py-2.5 text-[13.5px]">{m.text}</div>
          ) : (
            <div key={i} className="self-start max-w-[90%] bg-muted/50 border border-border rounded-2xl px-4 py-2.5 text-[13.5px] prose prose-sm dark:prose-invert max-w-none">
              {m.busy ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking...</span> : <ReactMarkdown>{m.text}</ReactMarkdown>}
            </div>
          )
        ))}
      </div>
      <div className="shrink-0 border-t border-border p-3 max-w-3xl w-full mx-auto">
        <div className="border border-border rounded-2xl bg-card px-3 py-2.5">
          <textarea value={paperInput} onChange={(e) => setPaperInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); paperChatSend(paperInput); } }} rows={2} placeholder="Ask anything about your sources..." className="w-full bg-transparent text-[13.5px] outline-none resize-none placeholder:text-muted-foreground" />
          <div className="flex items-center justify-between mt-1">
            <button onClick={() => setSrcModal(true)} title="Sources" className="text-muted-foreground hover:text-foreground"><LibraryIcon className="w-4 h-4" /></button>
            <button onClick={() => paperChatSend(paperInput)} disabled={!paperInput.trim() || paperBusy} className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"><ArrowUp className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );

  // ---- REPORT DETAILS (snip 6) ----
  const reportSources = (report && report.sources) || [];
  const reportScreened = (report && report.screened) || [];
  const detailsView = (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-border">
          <div className="flex items-center gap-1 px-4 pt-3">
            <button onClick={() => setDetailsOpen(false)} className="text-[13px] px-3 py-2 rounded-t-lg text-muted-foreground hover:bg-muted flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" /> All papers ({reportSources.length})</button>
            <span className="text-[13px] px-3 py-2 rounded-t-lg bg-muted font-semibold flex items-center gap-1.5"><Search className="w-3.5 h-3.5" /> {(report && report.question ? report.question : '').slice(0, 22)}... ({reportScreened.length})</span>
          </div>
        </div>
        <div className="p-4 border-b border-border">
          <input value={report ? report.question : ''} readOnly className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-[13.5px] outline-none" />
          <div className="flex items-center gap-2 mt-2">
            <span className="inline-flex items-center gap-1.5 border border-border rounded-lg px-3 py-1.5 text-[12.5px]">Source <span className="text-primary font-semibold">{report ? report.source : ''}</span></span>
            <button className="inline-flex items-center gap-1.5 border border-border rounded-lg px-3 py-1.5 text-[12.5px]"><SlidersHorizontal className="w-3.5 h-3.5" /> Filters</button>
            <div className="flex-1" />
            <button onClick={() => report && runReport(report.question, report.source)} className="bg-primary/90 text-primary-foreground rounded-lg px-3 py-1.5 text-[12.5px] font-semibold">Update search</button>
            <button onClick={() => setDetailsOpen(false)} className="border border-border rounded-lg px-3 py-1.5 text-[12.5px] text-muted-foreground">Back to report</button>
          </div>
        </div>
        <div className="px-4 py-2 flex items-center justify-between border-b border-border">
          <span className="text-[13px] font-semibold">Search results ({reportSources.length})</span>
          <span className="inline-flex items-center gap-1.5 border border-border rounded-lg px-3 py-1.5 text-[12.5px]"><ArrowUpDown className="w-3.5 h-3.5" /> Sort: Most relevant</span>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {reportSources.map((p: any) => (
            <div key={p.id} className="px-5 py-4 border-b border-border hover:bg-muted/30">
              <div className="font-semibold text-[14px] leading-snug">{p.title}</div>
              <div className="text-[12.5px] text-muted-foreground mt-1">{p.authorStr}</div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[12px] text-muted-foreground">
                <BookOpen className="w-3.5 h-3.5" /> {[p.venue, p.year, p.cited ? p.cited + ' citations' : ''].filter(Boolean).join(', ')}
                {p.doi || p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-500 font-semibold"><ExternalLink className="w-3 h-3" /> {p.kind === 'trial' ? 'Record' : 'DOI'}</a> : null}
              </div>
              <div className="text-[12px] text-muted-foreground mt-1 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Search: {p.ftLabel}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="w-[300px] shrink-0 border-l border-border p-5 hidden lg:block">
        <div className="flex items-center justify-between mb-3"><span className="text-[15px] font-bold">Papers</span></div>
        <div className="text-[12px] font-bold text-muted-foreground uppercase mb-1">Research question</div>
        <div className="text-[13.5px]">{report ? report.question : ''}</div>
      </div>
    </div>
  );

  // ---- REPORT DOC VIEW (snip 5) ----
  const reportSteps = report ? [
    { k: 'gather', label: 'Gather sources', sub: reportSources.length + ' sources found', action: 'details' },
    { k: 'screen', label: 'Screen sources', sub: reportScreened.length + ' sources included', action: 'details' },
    { k: 'extract', label: 'Extract data', sub: (reportScreened.length * 6) + ' data points extracted', action: 'details' },
    { k: 'generate', label: 'Generate report', sub: '', action: 'save' },
  ] : [];
  const reportView = (
    <div className="flex flex-col md:flex-row h-full overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="px-6 py-3 border-b border-border shrink-0 flex items-center justify-between">{modeDropdown}<button onClick={() => setShareOpen(true)} className="text-[12.5px] font-semibold flex items-center gap-1 border border-border rounded-lg px-2.5 py-1 hover:bg-muted"><Share2 className="w-3.5 h-3.5" /> Share</button></div>
        <div className="flex-1 overflow-y-auto custom-scrollbar px-10 py-8 max-w-3xl mx-auto w-full">
          <div className="text-[12.5px] text-muted-foreground">{new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</div>
          <h1 className="text-2xl font-bold mt-2 mb-4 text-primary">{report && report.title ? report.title : (report ? report.question : '')}</h1>
          {report && report.abstract ? <p className="text-[15px] leading-relaxed mb-6">{report.abstract}</p> : null}
          {reportBusy ? (
            <div className="flex items-center gap-2 text-muted-foreground text-[13.5px] mt-4"><Loader2 className="w-4 h-4 animate-spin" /> {reportPhase}</div>
          ) : null}
          {report && report.body ? (
            <div className="prose prose-sm dark:prose-invert max-w-none text-[14.5px] leading-relaxed">
              <ReactMarkdown>{report.body}</ReactMarkdown>
            </div>
          ) : null}
          {reportScreened.length ? (
            <div className="mt-8 border-t border-border pt-4">
              <div className="text-[12px] font-bold text-muted-foreground uppercase mb-2">Sources</div>
              {reportScreened.map((p: any, i: number) => (
                <div key={p.id} className="text-[12.5px] text-muted-foreground py-1"><span className="text-foreground">[{i + 1}]</span> {p.title} - {p.authorStr} ({p.year}). {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="text-blue-500">link</a> : null}</div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="w-full md:w-[340px] shrink-0 border-t md:border-t-0 md:border-l border-border flex flex-col h-auto md:h-full max-h-[50vh] md:max-h-none">
        <div className="p-5 border-b border-border shrink-0">
          <div className="text-[15px] font-bold mb-3">Report</div>
          <div className="text-[12px] font-bold text-muted-foreground uppercase mb-2">Status</div>
          {reportSteps.map((st) => {
            const done = report && report.done && report.done[st.k];
            return (
              <div key={st.k} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-2.5">
                  {done ? <span className="w-5 h-5 rounded-full bg-green-500/15 text-green-500 flex items-center justify-center"><Check className="w-3 h-3" /></span> : (reportBusy ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : <span className="w-5 h-5 rounded-full border border-border" />)}
                  <div>
                    <div className="text-[13px] font-semibold">{st.label}</div>
                    {st.sub ? <div className="text-[11.5px] text-muted-foreground">{st.sub}</div> : null}
                  </div>
                </div>
                {done && st.action === 'details' ? (
                  <button onClick={() => setDetailsOpen(true)} className="text-[12px] text-primary font-semibold inline-flex items-center gap-1">Details <ArrowUpRightIcon /></button>
                ) : done && st.action === 'save' ? (
                  <button onClick={saveReportDoc} className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-[12px] font-semibold inline-flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> Save</button>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-2">
          <div className="text-[12px] font-bold text-muted-foreground uppercase">Chat</div>
          {reportChat.map((m, i) => (
            m.role === 'user' ? (
              <div key={i} className="self-end max-w-[90%] bg-primary text-primary-foreground rounded-2xl px-3.5 py-2 text-[13px]">{m.text}</div>
            ) : (
              <div key={i} className="self-start max-w-[92%] bg-muted/50 border border-border rounded-2xl px-3.5 py-2 text-[13px] prose prose-sm dark:prose-invert max-w-none">
                {m.busy ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking...</span> : <ReactMarkdown>{m.text}</ReactMarkdown>}
              </div>
            )
          ))}
        </div>
        <div className="shrink-0 border-t border-border p-3">
          <div className="border border-border rounded-2xl bg-card px-3 py-2 flex items-center gap-2">
            <input value={reportChatInput} onChange={(e) => setReportChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') reportChatSend(reportChatInput); }} placeholder="Ask anything about the results" className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground" />
            <button onClick={() => reportChatSend(reportChatInput)} disabled={!reportChatInput.trim()} className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"><ArrowUp className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>
    </div>
  );

  // ---- FIND RESULTS SPLIT VIEW ----
  const resultsView = (
    <div className="flex flex-col md:flex-row w-full h-full overflow-hidden">
      <div className="w-full md:w-[38%] md:min-w-[320px] flex flex-col border-b md:border-b-0 md:border-r border-border h-auto md:h-full max-h-[45vh] md:max-h-none shrink-0">
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar flex flex-col gap-4">
          <div className="flex items-center justify-between">
            {modeDropdown}
            <div className="flex items-center gap-2">
              {papers.length > 0 ? <button onClick={() => setShareOpen(true)} className="text-[12.5px] font-semibold flex items-center gap-1 border border-border rounded-lg px-2.5 py-1 hover:bg-muted"><Share2 className="w-3.5 h-3.5" /> Share</button> : null}
              <button onClick={startNew} className="text-[12.5px] text-primary font-semibold flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> New search</button>
            </div>
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
                <div key={i} className="flex items-center gap-2 text-[12.5px] text-foreground/80 py-0.5"><Search className="w-3.5 h-3.5 text-muted-foreground" /> {t} <span className="text-muted-foreground text-[11px]">- {sourceLabel}</span></div>
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
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/40 text-[12px] font-bold text-muted-foreground border-b border-border">Follow-ups</div>
              {followups.map((f, i) => (
                <button key={i} onClick={() => refine(f)} disabled={chatBusy} className="w-full text-left px-4 py-3 border-b border-border last:border-0 text-[13.5px] font-semibold hover:bg-muted/40 transition-colors disabled:opacity-50">{f}</button>
              ))}
            </div>
          ) : null}
          {chatThread.length > 0 ? (
            <div className="flex flex-col gap-2">
              {chatThread.map((m, i) => (
                m.role === 'user' ? (
                  <div key={i} className="self-end max-w-[90%] bg-primary text-primary-foreground rounded-2xl px-4 py-2.5 text-[13.5px]">{m.text}</div>
                ) : (
                  <div key={i} className="self-start max-w-[92%] bg-muted/50 border border-border rounded-2xl px-4 py-2.5 text-[13.5px] prose prose-sm dark:prose-invert max-w-none">
                    {m.busy ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Updating table...</span> : <ReactMarkdown>{m.text}</ReactMarkdown>}
                  </div>
                )
              ))}
            </div>
          ) : null}
          {!busy && !papers.length ? (
            <div className="text-muted-foreground text-[13px] mt-6">Ask a research question below and I will build a paper table with summaries.</div>
          ) : null}
        </div>
        {papers.length > 0 ? (
          <div className="shrink-0 border-t border-border p-3">
            <div className="border border-border rounded-2xl bg-card px-3 py-2.5">
              <textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); refine(chatInput); } }} rows={2} placeholder="Ask about anything you see, update your analysis, or explore a new direction" className="w-full bg-transparent text-[13.5px] outline-none resize-none placeholder:text-muted-foreground" />
              <div className="flex items-center justify-between mt-1">
                <button onClick={() => setAddingCol(true)} title="Add column" className="text-muted-foreground hover:text-foreground"><Plus className="w-4 h-4" /></button>
                <button onClick={() => refine(chatInput)} disabled={!chatInput.trim() || chatBusy} className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40" title="Send"><ArrowUp className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 bg-card flex flex-col md:h-full overflow-hidden">
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
          <div className="relative inline-block">
            <button ref={dlBtnRef} onClick={toggleDlMenu} disabled={!papers.length} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] font-semibold border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-40"><Download className="w-3.5 h-3.5" /> Download <ChevronDown className="w-3 h-3" /></button>
            {dlMenu ? (
              <>
                <div className="fixed inset-0 z-[80]" onClick={() => setDlMenu(false)} />
                <div className="fixed z-[81] w-[240px] bg-card border border-border rounded-xl shadow-2xl p-1.5" style={{ top: dlPos.top, left: dlPos.left }}>
                  {[
                    { id: 'csv', label: 'CSV', sub: 'Comma-separated', fn: downloadCSV },
                    { id: 'xls', label: 'Excel', sub: 'XLSX format', fn: downloadExcel },
                    { id: 'bib', label: 'BIB', sub: 'BibTeX format', fn: downloadBib },
                    { id: 'ris', label: 'RIS', sub: 'RIS format', fn: downloadRis },
                  ].map((o) => (
                    <button key={o.id} onClick={() => { setDlMenu(false); o.fn(); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted text-left"><FileText className="w-4 h-4 text-primary shrink-0" /><span className="text-[13.5px] font-semibold w-10">{o.label}</span> <span className="text-[12px] text-muted-foreground">{o.sub}</span></button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
          <button onClick={saveLibrary} disabled={!papers.length} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] font-semibold border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-40"><Bookmark className="w-3.5 h-3.5" /> {saved ? 'Saved' : (Object.values(selRows).filter(Boolean).length ? 'Save ' + Object.values(selRows).filter(Boolean).length + ' to library' : 'Save to library')}</button>
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
          <div className="p-4 border-b border-border bg-muted/30">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[13.5px] font-bold">Search or create a column</div>
                <div className="text-[12px] text-muted-foreground">Describe what kind of data you want to extract</div>
              </div>
              <button onClick={() => { setAddingCol(false); setColInput(''); }} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <input autoFocus value={colInput} onChange={(e) => setColInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addColumn(); }} placeholder="e.g. summary, counter-arguments" className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-[13px] outline-none focus:border-primary" />
              <button onClick={addColumn} disabled={!colInput.trim() || colBusy} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-[13px] font-bold disabled:opacity-40">{colBusy ? 'Extracting...' : 'Add'}</button>
            </div>
            {columns.length ? (
              <div className="mt-4">
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Current columns</div>
                {columns.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted text-[13px]"><span className="truncate">{c.name}</span><button onClick={() => removeColumn(c.id)} className="text-muted-foreground hover:text-red-400 shrink-0"><X className="w-3.5 h-3.5" /></button></div>
                ))}
              </div>
            ) : null}
            <div className="mt-4">
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Add columns</div>
              <div className="flex flex-col max-h-[240px] overflow-y-auto custom-scrollbar">
                {COLUMN_SUGGESTIONS.filter((sg) => !colInput || sg.toLowerCase().indexOf(colInput.toLowerCase()) !== -1).filter((sg) => !columns.some((c) => c.name.toLowerCase() === sg.toLowerCase())).map((sg) => (
                  <button key={sg} onClick={() => { setAddingCol(false); setColInput(''); runAddColumn(sg); }} disabled={colBusy} className="flex items-center gap-2 text-left px-2 py-2 rounded hover:bg-muted text-[13px] disabled:opacity-50"><Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> {sg}</button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border">
              <button onClick={() => { setAddingCol(false); setColInput(''); }} className="border border-border rounded-lg px-4 py-1.5 text-[13px] font-semibold hover:bg-muted">Cancel</button>
              <button onClick={() => { setAddingCol(false); setColInput(''); }} className="bg-primary text-primary-foreground rounded-lg px-4 py-1.5 text-[13px] font-semibold">Save</button>
            </div>
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
                  <th className="p-3 w-8"><input type="checkbox" checked={rows.length > 0 && rows.every((p) => selRows[p.id])} onChange={(e) => { const v = e.target.checked; setSelRows(() => { const o: any = {}; if (v) rows.forEach((p) => { o[p.id] = true; }); return o; }); }} /></th>
                  <th className="p-3 font-semibold w-[40%]">Source ({rows.length})</th>
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
                    <td className="p-3"><input type="checkbox" checked={!!selRows[p.id]} onChange={() => setSelRows((prev: any) => ({ ...prev, [p.id]: !prev[p.id] }))} /></td>
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
                        {p.cols[c.id] ? <button onClick={(e) => openCellPop(e, p, c)} className="text-left w-full hover:bg-muted/60 rounded px-1 -mx-1 py-0.5 transition-colors">{p.cols[c.id]}</button> : (colBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /> : '-')}
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

  const sysIncluded = sysPapers.filter((p) => p.included);
  const systematicView = (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-border flex items-center gap-4 shrink-0 flex-wrap">
        {modeDropdown}
        <div className="flex items-center gap-2 text-[12.5px]">
          {['Search', 'Screen', 'Extract'].map((st, i) => {
            const active = sysStep === i || (i === 1 && sysStep === 1) || (i === 2 && sysStep === 2);
            const done = sysStep > i;
            return (
              <div key={st} className="flex items-center gap-2">
                <span className={((done || active) ? 'bg-primary text-primary-foreground ' : 'bg-muted text-muted-foreground ') + 'w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold'}>{done ? <Check className="w-3 h-3" /> : (i + 1)}</span>
                <span className={(active ? 'text-foreground font-semibold ' : 'text-muted-foreground ') + 'text-[12.5px]'}>{st}</span>
                {i < 2 ? <span className="text-border">-</span> : null}
              </div>
            );
          })}
        </div>
        <button onClick={startNew} className="ml-auto text-[12.5px] text-primary font-semibold flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> New</button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 max-w-4xl w-full mx-auto">
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="min-w-0">
            <div className="text-[12px] text-muted-foreground uppercase font-bold tracking-wide">Systematic review</div>
            <div className="text-[17px] font-bold truncate">{sysQ}</div>
          </div>
          {sysStep === 1 ? (
            <button onClick={runSysExtract} disabled={!sysIncluded.length || sysBusy} className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-[13.5px] font-semibold disabled:opacity-40 shrink-0">Extract from {sysIncluded.length} included</button>
          ) : (
            <button onClick={downloadSys} className="border border-border rounded-lg px-4 py-2 text-[13.5px] font-semibold flex items-center gap-1.5 shrink-0"><Download className="w-3.5 h-3.5" /> Download</button>
          )}
        </div>
        {sysBusy ? <div className="flex items-center gap-2 text-muted-foreground text-[13px] mb-3"><Loader2 className="w-4 h-4 animate-spin" /> {sysStep === 2 ? 'Extracting data from included papers...' : 'Searching...'}</div> : null}
        {sysStep === 1 ? (
          <div>
            <div className="text-[12.5px] text-muted-foreground mb-3">Screen the {sysPapers.length} results below. Toggle each paper to include or exclude, then extract.</div>
            {sysPapers.map((p) => (
              <div key={p.id} className={'border border-border rounded-xl p-4 mb-3 ' + (p.included ? '' : 'opacity-50')}>
                <div className="flex items-start gap-3">
                  <button onClick={() => sysToggle(p.id)} className={(p.included ? 'bg-green-500/15 text-green-600 border-green-500/40 ' : 'bg-muted text-muted-foreground border-border ') + 'shrink-0 mt-0.5 border rounded-md px-2.5 py-1 text-[11.5px] font-semibold'}>{p.included ? 'Included' : 'Excluded'}</button>
                  <div className="min-w-0">
                    <div className="font-semibold text-[14px] leading-snug">{p.title}</div>
                    <div className="text-[12px] text-muted-foreground mt-0.5">{p.authorStr} - {[p.venue, p.year].filter(Boolean).join(', ')}</div>
                    <div className="text-[12.5px] text-foreground/80 mt-1.5">{p.abstract ? p.abstract.slice(0, 240) + '...' : 'No abstract.'}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
              <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="p-2 w-[34%]">Source ({sysIncluded.length})</th>{sysCols.map((c) => <th key={c.id} className="p-2 min-w-[140px]">{c.name}</th>)}</tr></thead>
              <tbody>
                {sysIncluded.map((p) => (
                  <tr key={p.id} className="border-b border-border align-top hover:bg-muted/30">
                    <td className="p-2"><div className="font-semibold leading-snug">{p.title}</div><div className="text-[11.5px] text-muted-foreground mt-0.5">{p.authorStr} ({p.year})</div></td>
                    {sysCols.map((c) => <td key={c.id} className="p-2 text-foreground/90">{p.cols[c.id] ? p.cols[c.id] : (sysBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /> : '-')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  function downloadAgentText(m: any) {
    const srcs = (m.sources || []).map((s: any, i: number) => (i + 1) + '. ' + s.title + ' - ' + s.authorStr + ' (' + s.year + '). ' + (s.url || '')).join('\n');
    const txt = (m.text || '') + (srcs ? '\n\nReferences:\n' + srcs : '');
    doDownload(txt, 'research-agent-answer.txt', 'text/plain');
  }
  const agentView = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border flex items-center gap-3 shrink-0">
        {modeDropdown}
        <span className="text-[12.5px] text-muted-foreground">Research agent</span>
        <div className="ml-auto flex items-center gap-2">
          {agentChat.length ? <button onClick={() => setShareOpen(true)} className="text-[12.5px] font-semibold flex items-center gap-1 border border-border rounded-lg px-2.5 py-1 hover:bg-muted"><Share2 className="w-3.5 h-3.5" /> Share</button> : null}
          <button onClick={startNew} className="text-[12.5px] text-primary font-semibold flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> New</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-4 max-w-3xl w-full mx-auto">
        {agentChat.map((m, i) => (
          m.role === 'user' ? (
            <div key={i} className="self-end max-w-[85%] bg-primary text-primary-foreground rounded-2xl px-4 py-2.5 text-[13.5px]">{m.text}</div>
          ) : (
            <div key={i} className="self-start w-full flex flex-col gap-2">
              {m.steps && m.steps.length ? (
                <div className="bg-muted/40 border border-border rounded-xl p-3 text-[12.5px]">
                  {m.steps.map((st: any, si: number) => (
                    <div key={si} className="flex items-center gap-2 py-0.5">{(m.busy && si === m.steps.length - 1) ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : <Check className="w-3.5 h-3.5 text-green-500" />} {st}</div>
                  ))}
                </div>
              ) : null}
              {m.text ? (
                <div className="bg-muted/50 border border-border rounded-2xl px-4 py-2.5 text-[13.5px] prose prose-sm dark:prose-invert max-w-none"><ReactMarkdown components={{ a: (props: any) => {
                  const label = typeof props.children === 'string' ? props.children : (Array.isArray(props.children) ? props.children.join('') : '');
                  const cite = /^\s*\[(\d+)\]\s*$/.exec(label);
                  const src = cite && m.sources ? m.sources[parseInt(cite[1], 10) - 1] : null;
                  if (src) {
                    return (
                      <span className="relative group inline-block align-baseline">
                        <a href={props.href} target="_blank" rel="noreferrer" className="text-primary font-semibold no-underline hover:underline">{props.children}</a>
                        <span className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-100 absolute z-[90] bottom-full left-0 mb-1.5 w-72 max-w-[calc(100vw-2rem)] bg-card border border-border rounded-lg shadow-2xl p-3 text-left normal-case">
                          <span className="block text-[12.5px] font-semibold leading-snug text-foreground no-underline">{src.title}</span>
                          <span className="block text-[11.5px] text-muted-foreground mt-1">{[src.authorStr, src.venue, src.year].filter(Boolean).join(' · ')}</span>
                          {src.url ? <span className="block text-[11px] text-primary mt-1 truncate">{src.url}</span> : null}
                        </span>
                      </span>
                    );
                  }
                  return <a {...props} target="_blank" rel="noreferrer" className="text-primary font-semibold no-underline hover:underline" />;
                } }}>{m.text}</ReactMarkdown></div>
              ) : null}
              {m.text && !m.busy ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] border border-border rounded-lg px-3 py-1.5 flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" /> {(m.sources || []).length} cited sources</span>
                  <button onClick={() => { try { navigator.clipboard.writeText(m.text || ''); } catch {} }} title="Copy answer" className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted"><Copy className="w-3.5 h-3.5" /></button>
                  <button onClick={() => downloadAgentText(m)} title="Download answer + references" className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted"><Download className="w-3.5 h-3.5" /></button>
                </div>
              ) : null}
              {m.sources && m.sources.length ? (
                <div className="flex flex-col gap-1.5">
                  <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Sources</div>
                  {m.sources.map((sr: any, si: number) => (
                    <a key={si} href={sr.url} target="_blank" rel="noreferrer" className="border border-border rounded-lg px-3 py-2 hover:border-primary transition-colors"><div className="text-[12.5px] font-semibold leading-snug">{sr.title}</div><div className="text-[11.5px] text-muted-foreground truncate">{[sr.authorStr, sr.venue, sr.year].filter(Boolean).join(' - ')}</div></a>
                  ))}
                </div>
              ) : null}
            </div>
          )
        ))}
      </div>
      <div className="shrink-0 border-t border-border p-3 max-w-3xl w-full mx-auto">
        <div className="border border-border rounded-2xl bg-card px-3 py-2.5">
          <textarea value={agentInput} onChange={(e) => setAgentInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); agentSend(agentInput); } }} rows={2} placeholder="Ask a follow-up research question..." className="w-full bg-transparent text-[13.5px] outline-none resize-none placeholder:text-muted-foreground" />
          <div className="flex items-center justify-end mt-1">
            <button onClick={() => agentSend(agentInput)} disabled={!agentInput.trim() || agentBusy} className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"><ArrowUp className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );

  let searchArea: any;
  if (mode === 'chat') searchArea = chatStarted ? chatView : startScreen;
  else if (mode === 'report') searchArea = report ? (detailsOpen ? detailsView : reportView) : startScreen;
  else if (mode === 'systematic') searchArea = sysPapers.length ? systematicView : startScreen;
  else if (mode === 'agent') searchArea = agentChat.length ? agentView : startScreen;
  else searchArea = (!question && !busy && papers.length === 0) ? startScreen : resultsView;

  const main = navView === 'recents' ? recentsPage
    : navView === 'library' ? libraryPage
    : navView === 'alerts' ? alertsPage
    : searchArea;

  const shareTitle = report ? (report.title || report.question) : (question || 'this session');
  const createColEl = colModal ? (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-6" onClick={() => setColModal(false)}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="text-[16px] font-bold mb-1">New collection</div>
        <div className="text-[12.5px] text-muted-foreground mb-4">Give your collection a name.</div>
        <input autoFocus value={colName} onChange={(e) => setColName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') createCollectionConfirm(); }} placeholder="e.g. Quantum computing" className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-primary" />
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => setColModal(false)} className="border border-border rounded-lg px-4 py-2 text-[13.5px] font-semibold hover:bg-muted">Cancel</button>
          <button onClick={createCollectionConfirm} disabled={!colName.trim()} className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-[13.5px] font-semibold disabled:opacity-40">Create</button>
        </div>
      </div>
    </div>
  ) : null;
  const uploadModalEl = uploadModal ? (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-6" onClick={() => setUploadModal(false)}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[17px] font-bold">Upload details</div>
            <div className="text-[13px] text-muted-foreground mt-0.5">Please review the uploaded and processed papers</div>
          </div>
          <button onClick={() => setUploadModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex items-center gap-3 mt-5">
          <span className="text-[13px] font-semibold shrink-0">Add to collection <span className="text-muted-foreground font-normal">(optional)</span></span>
          <select value={uploadCollection} onChange={(e) => moveUploadedToCollection(e.target.value)} className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-primary">
            <option value="none">None</option>
            {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="mt-5 bg-muted/40 border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-[14px] font-bold"><span className="w-5 h-5 rounded-full bg-green-500/15 text-green-500 flex items-center justify-center"><Check className="w-3 h-3" /></span> Successfully uploaded</div>
          <div className="text-[12.5px] text-muted-foreground mt-0.5 ml-7">{lastUploadIds.length} paper{lastUploadIds.length > 1 ? 's' : ''} successfully uploaded.</div>
          <div className="mt-3 ml-7 flex flex-col gap-1">
            {libDocs.filter((d) => lastUploadIds.indexOf(d.id) !== -1).map((d) => (<div key={d.id} className="text-[13px]">{docName(d)}</div>))}
          </div>
        </div>
        <div className="flex justify-end mt-5">
          <button onClick={() => setUploadModal(false)} className="border border-border rounded-lg px-4 py-2 text-[13.5px] font-semibold hover:bg-muted">Close</button>
        </div>
      </div>
    </div>
  ) : null;
  const shareModalEl = shareOpen ? (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-6" onClick={() => setShareOpen(false)}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div className="text-[17px] font-bold truncate pr-4">Share &ldquo;{shareTitle}&rdquo;</div>
          <button onClick={() => setShareOpen(false)} className="text-muted-foreground hover:text-foreground shrink-0"><X className="w-5 h-5" /></button>
        </div>
        <div className="text-[13px] text-muted-foreground mt-1">Invite users to view this session</div>
        <div className="flex items-center gap-2 mt-4">
          <input value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') shareAdd(); }} placeholder="Enter an email address" className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-primary" />
          <button onClick={shareAdd} disabled={!shareEmail.trim()} className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-[13.5px] font-semibold disabled:opacity-40">Add</button>
        </div>
        <div className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide mt-5 mb-2">Who has access</div>
        <div className="flex items-center justify-between py-1.5">
          <div className="text-[13.5px] font-semibold">{userEmail || 'You'} <span className="text-muted-foreground font-normal">(You)</span></div>
          <span className="text-[12.5px] text-muted-foreground">Owner</span>
        </div>
        {shareList.map((sh, i) => (
          <div key={i} className="flex items-center justify-between py-1.5">
            <div className="text-[13.5px]">{sh.email}</div>
            <span className="text-[12.5px] text-green-600">Invited</span>
          </div>
        ))}
        <div className="flex items-center justify-between py-2 border-t border-border mt-2">
          <div className="flex items-center gap-2 text-[13.5px]"><Copy className="w-4 h-4 text-muted-foreground" /> Anyone with the link can view</div>
          <button onClick={() => setShareLink((v) => !v)} className={(shareLink ? 'bg-primary ' : 'bg-muted ') + 'w-10 h-5 rounded-full relative transition-colors shrink-0'}><span className={'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ' + (shareLink ? 'left-[22px]' : 'left-0.5')} /></button>
        </div>
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={() => { try { navigator.clipboard.writeText(typeof window !== 'undefined' ? window.location.href : ''); } catch {} }} className="border border-border rounded-lg px-4 py-2 text-[13.5px] font-semibold flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" /> Copy link</button>
          <button onClick={() => setShareOpen(false)} className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-[13.5px] font-semibold">Done</button>
        </div>
      </div>
    </div>
  ) : null;
  const cellPopEl = cellPop ? (
    <>
      <div className="fixed inset-0 z-[75]" onClick={() => setCellPop(null)} />
      <div className="fixed z-[76] w-[360px] max-h-[320px] overflow-y-auto custom-scrollbar bg-card border border-border rounded-xl shadow-2xl p-3" style={{ top: cellPop.y, left: cellPop.x }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Relevant quotes</span>
          <div className="flex items-center gap-2">
            {cellPop.url ? <a href={cellPop.url} target="_blank" rel="noreferrer" className="text-[12px] font-semibold border border-border rounded-lg px-2 py-1 flex items-center gap-1 hover:bg-muted">Open paper <ExternalLink className="w-3 h-3" /></a> : null}
            <button onClick={() => setCellPop(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="text-[12px] font-semibold text-primary mb-1">{cellPop.col}: {cellPop.answer}</div>
        <div className="text-[13px] leading-relaxed text-foreground/90">{cellPop.quote ? '"' + cellPop.quote + '"' : (cellPop.quote2 ? cellPop.quote2.slice(0, 400) + '...' : 'No supporting quote available for this paper.')}</div>
      </div>
    </>
  ) : null;

  const saveColEl = saveColModal ? (
    <div className="fixed inset-0 z-[72] bg-black/50 flex items-center justify-center p-6" onClick={() => setSaveColModal(false)}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="text-[16px] font-bold mb-1">Save to library</div>
        <div className="text-[12.5px] text-muted-foreground mb-4">Choose a collection to add the selected paper(s) to.</div>
        <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto custom-scrollbar">
          <button onClick={() => saveToCollection('')} className="w-full text-left px-3 py-2.5 rounded-lg text-[13.5px] hover:bg-muted border border-border flex items-center gap-2"><LibraryIcon className="w-4 h-4 text-muted-foreground" /> All (no collection)</button>
          {collections.map((c) => (
            <button key={c.id} onClick={() => saveToCollection(c.id)} className="w-full text-left px-3 py-2.5 rounded-lg text-[13.5px] hover:bg-muted border border-border flex items-center gap-2"><BookOpen className="w-4 h-4 text-muted-foreground" /> {c.name}</button>
          ))}
        </div>
        <button onClick={() => { setSaveColModal(false); newCollection(); }} className="mt-3 w-full flex items-center justify-center gap-2 text-[13px] font-semibold text-primary border border-dashed border-border rounded-lg px-3 py-2 hover:bg-muted"><FolderPlus className="w-4 h-4" /> New collection</button>
        <div className="flex justify-end mt-4"><button onClick={() => setSaveColModal(false)} className="border border-border rounded-lg px-4 py-2 text-[13.5px] font-semibold hover:bg-muted">Cancel</button></div>
      </div>
    </div>
  ) : null;
  const tagModalEl = tagModal ? (
    <div className="fixed inset-0 z-[72] bg-black/50 flex items-center justify-center p-6" onClick={() => setTagModal(false)}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="text-[16px] font-bold mb-1">Tag selected papers</div>
        <div className="text-[12.5px] text-muted-foreground mb-4">Add a label to the selected paper(s).</div>
        <input autoFocus value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') assignTag(); }} placeholder="e.g. to-read, key paper" className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-primary" />
        <div className="flex justify-end gap-2 mt-5"><button onClick={() => setTagModal(false)} className="border border-border rounded-lg px-4 py-2 text-[13.5px] font-semibold hover:bg-muted">Cancel</button><button onClick={assignTag} disabled={!tagInput.trim()} className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-[13.5px] font-semibold disabled:opacity-40">Apply</button></div>
      </div>
    </div>
  ) : null;
  const moveMenuEl = moveMenu ? (
    <>
      <div className="fixed inset-0 z-[80]" onClick={() => setMoveMenu(false)} />
      <div className="fixed z-[81] w-[220px] bg-card border border-border rounded-xl shadow-2xl p-1.5" style={{ top: moveBtnPos.top, left: moveBtnPos.left }}>
        <div className="px-3 py-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Move to collection</div>
        <button onClick={() => moveSelectedToCollection('')} className="w-full text-left px-3 py-2 rounded-lg text-[13.5px] hover:bg-muted">No collection</button>
        {collections.map((c) => (<button key={c.id} onClick={() => moveSelectedToCollection(c.id)} className="w-full text-left px-3 py-2 rounded-lg text-[13.5px] hover:bg-muted flex items-center gap-2"><BookOpen className="w-3.5 h-3.5 text-muted-foreground" /> {c.name}</button>))}
        {collections.length === 0 ? <div className="px-3 py-2 text-[12px] text-muted-foreground italic">No collections yet. Create one first.</div> : null}
      </div>
    </>
  ) : null;
  const settingsEl = settingsOpen ? (
    <div className="fixed inset-0 z-[72] bg-black/50 flex items-start justify-center p-6 overflow-y-auto" onClick={() => setSettingsOpen(false)}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="text-[17px] font-bold">Settings</div>
          <button onClick={() => setSettingsOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 flex flex-col gap-6">
          <div>
            <div className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide mb-3">Personal details</div>
            <label className="block text-[12.5px] font-semibold mb-1">Email</label>
            <input value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="you@example.com" className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-primary mb-3" />
            <label className="block text-[12.5px] font-semibold mb-1">Display name</label>
            <input value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Your name" className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-primary" />
            <button onClick={saveAccount} className="mt-3 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-[13px] font-semibold">Save</button>
          </div>
          <div className="border-t border-border pt-5">
            <div className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide mb-3">Preferences</div>
            <label className="block text-[12.5px] font-semibold mb-1">Default paper source</label>
            <select value={paperSource} onChange={(e) => setPaperSource(e.target.value)} className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-primary">
              {SOURCES.map((sc) => (<option key={sc.id} value={sc.id}>{sc.label}</option>))}
            </select>
          </div>
          <div className="border-t border-border pt-5">
            <div className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Usage & plan</div>
            <div className="text-[13.5px]">Current plan: <span className="font-semibold">Free</span></div>
            <div className="text-[12.5px] text-muted-foreground mt-0.5">Unlimited searches across OpenAlex, Semantic Scholar, Europe PMC, arXiv and Crossref.</div>
          </div>
          <div className="border-t border-border pt-5">
            <div className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide mb-3">Integrations</div>
            <div className="flex items-center justify-between mb-2"><span className="text-[13.5px]">Zotero</span><button className="border border-border rounded-lg px-3 py-1.5 text-[12.5px] font-semibold hover:bg-muted">Connect</button></div>
            <div className="flex items-center justify-between"><span className="text-[13.5px]">Browser extension</span><span className="text-[12px] text-muted-foreground">Coming soon</span></div>
          </div>
          <div className="border-t border-border pt-5">
            <div className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Advanced</div>
            <div className="flex items-center justify-between gap-3"><div><div className="text-[13.5px] font-semibold">Clear local data</div><div className="text-[12px] text-muted-foreground">Removes your saved library, collections, recents and prompts on this device.</div></div><button onClick={clearLocalData} className="border border-red-300 text-red-500 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold hover:bg-red-500/10 shrink-0">Clear</button></div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="flex w-full h-full bg-background text-foreground overflow-hidden relative">
      {mobileNav ? <div className="md:hidden fixed inset-0 bg-black/50 z-[55]" onClick={() => setMobileNav(false)} /> : null}
      {leftNav}
      <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
        <div className="md:hidden flex items-center gap-2.5 px-3 h-12 border-b border-border shrink-0 bg-card">
          <button onClick={() => setMobileNav(true)} className="text-muted-foreground hover:text-foreground p-1 -ml-1"><Menu className="w-5 h-5" /></button>
          <span className="w-5 h-5 bg-contain bg-no-repeat bg-center shrink-0" style={{ backgroundImage: 'url(/logo.png)' }} />
          <span className="font-bold text-[13px]">Literature Review</span>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">{main}</div>
      </div>
      {sourceModal}
      {uploadModalEl}
      {shareModalEl}
      {createColEl}
      {cellPopEl}
      {saveColEl}
      {tagModalEl}
      {moveMenuEl}
      {settingsEl}
    </div>
  );
}

function ArrowUpRightIcon() {
  return <ExternalLink className="w-3 h-3" />;
}
