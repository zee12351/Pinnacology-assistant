import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { Plus, MessageSquare, Clock, CheckCircle, ChevronRight, ChevronUp, Upload, X, Search, Check, Star, Users, ListChecks, Play, SlidersHorizontal, ChevronsRight, ChevronsLeft, Type, Home, Settings2, Download, ThumbsUp, ThumbsDown, Info, ChevronDown, GraduationCap, FlaskConical, Feather, CheckCircle2, ChevronLeft, RotateCcw, Loader2, Sparkles, Trash2, Moon, Sun, Pencil } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import Link from '@tiptap/extension-link';
import mermaid from 'mermaid';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { Mark, Extension, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import axios from 'axios';
import { UploadModal } from './UploadModal';

// Initialize Mermaid
mermaid.initialize({ startOnLoad: false, theme: 'dark' });

const citeAttr = (name: string) => ({
  default: null as string | null,
  parseHTML: (el: HTMLElement) => el.getAttribute('data-' + name),
  renderHTML: (attrs: Record<string, any>) => (attrs[name] ? { ['data-' + name]: attrs[name] } : {}),
});
const CitationMark = Mark.create({
  name: 'citation',
  addOptions() { return { HTMLAttributes: { class: 'text-[#464eb8] cursor-pointer hover:underline', 'data-citation': 'true' } } },
  addAttributes() {
    return {
      doi: citeAttr('doi'),
      title: citeAttr('title'),
      authors: citeAttr('authors'),
      year: citeAttr('year'),
      container: citeAttr('container'),
      citedBy: citeAttr('citedby'),
      refs: citeAttr('refs'),
    };
  },
  parseHTML() { return [{ tag: 'span[data-citation]' }] },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0] },
});

// ---- Citation / bibliography helpers ----
function citeAuthorList(authors: any): { family: string; given?: string }[] {
  try { return typeof authors === 'string' ? JSON.parse(authors) : (authors || []); } catch { return []; }
}
function citeInitials(given?: string) {
  return (given || '').split(/\s+/).filter(Boolean).map(g => g[0].toUpperCase() + '.').join(' ');
}
function inTextCitation(authors: any, year?: string) {
  const a = citeAuthorList(authors);
  const y = year || 'n.d.';
  if (!a.length) return `(Author, ${y})`;
  if (a.length === 1) return `(${a[0].family}, ${y})`;
  if (a.length === 2) return `(${a[0].family} & ${a[1].family}, ${y})`;
  return `(${a[0].family} et al., ${y})`;
}
function formatReference(meta: any, style: string, index: number) {
  const authors = citeAuthorList(meta.authors);
  const year = meta.year || 'n.d.';
  const title = meta.title || meta.intext || 'Untitled';
  const journal = meta.container || '';
  const doi = meta.doi ? `https://doi.org/${meta.doi}` : '';
  const apaAuthors = () => {
    if (!authors.length) return '';
    const f = (a: any) => `${a.family || ''}, ${citeInitials(a.given)}`.trim().replace(/,\s*$/, '');
    if (authors.length === 1) return f(authors[0]);
    if (authors.length <= 20) return authors.slice(0, -1).map(f).join(', ') + ', & ' + f(authors[authors.length - 1]);
    return authors.slice(0, 19).map(f).join(', ') + ', … ' + f(authors[authors.length - 1]);
  };
  const mlaAuthors = () => {
    if (!authors.length) return '';
    const first = `${authors[0].family}, ${authors[0].given || ''}`.trim();
    if (authors.length === 1) return first;
    if (authors.length === 2) return `${first}, and ${(authors[1].given || '')} ${authors[1].family}`.trim();
    return `${first}, et al`;
  };
  const ieeeAuthors = () => authors.map((a: any) => `${citeInitials(a.given)} ${a.family}`.trim()).join(', ');
  switch (style) {
    case 'MLA':
      return `${mlaAuthors()}. "${title}." ${journal ? journal + ', ' : ''}${year}. ${doi}`.trim();
    case 'IEEE':
      return `[${index}] ${ieeeAuthors()}, "${title}," ${journal ? journal + ', ' : ''}${year}. ${doi}`.trim();
    case 'Vancouver':
      return `${index}. ${authors.map((a: any) => `${a.family} ${citeInitials(a.given).replace(/\./g, '')}`).join(', ')}. ${title}. ${journal || ''}. ${year}.`.trim();
    case 'Chicago':
      return `${apaAuthors()}. "${title}." ${journal ? journal + ' ' : ''}(${year}). ${doi}`.trim();
    case 'Harvard':
      return `${apaAuthors()} ${year}, '${title}', ${journal || ''}. ${doi}`.trim();
    case 'APA':
    default:
      return `${apaAuthors()} (${year}). ${title}. ${journal ? journal + '.' : ''} ${doi}`.trim();
  }
}

// ---- CSL (Citation Style Language) engine helpers: ~2,600 styles via citeproc + jsDelivr ----
const CSL_LOCALE_URL = 'https://cdn.jsdelivr.net/gh/citation-style-language/locales@master/locales-en-US.xml';
const cslStyleUrl = (id: string) => `https://cdn.jsdelivr.net/gh/citation-style-language/styles@master/${id}.csl`;
const cslDependentUrl = (id: string) => `https://cdn.jsdelivr.net/gh/citation-style-language/styles@master/dependent/${id}.csl`;

const CURATED_STYLES: { id: string; label: string }[] = [
  { id: 'apa', label: 'APA (7th ed.)' },
  { id: 'apa-6th-edition', label: 'APA (6th ed.)' },
  { id: 'modern-language-association', label: 'MLA (9th ed.)' },
  { id: 'chicago-author-date', label: 'Chicago (author-date, 17th)' },
  { id: 'chicago-note-bibliography', label: 'Chicago (notes & bibliography, 17th)' },
  { id: 'ieee', label: 'IEEE' },
  { id: 'harvard-cite-them-right', label: 'Harvard (Cite Them Right)' },
  { id: 'vancouver', label: 'Vancouver' },
  { id: 'american-medical-association', label: 'AMA (11th ed.)' },
  { id: 'american-chemical-society', label: 'ACS (American Chemical Society)' },
  { id: 'american-political-science-association', label: 'APSA' },
  { id: 'american-sociological-association', label: 'ASA' },
  { id: 'nature', label: 'Nature' },
  { id: 'science', label: 'Science' },
  { id: 'cell', label: 'Cell' },
  { id: 'the-lancet', label: 'The Lancet' },
  { id: 'bmj', label: 'BMJ' },
  { id: 'elsevier-harvard', label: 'Elsevier (Harvard)' },
  { id: 'springer-basic-author-date', label: 'Springer (author-date)' },
  { id: 'taylor-and-francis-harvard-x', label: 'Taylor & Francis (Harvard)' },
];

const prettifyStyleId = (id: string) => {
  const base = id.split('/').pop() || id;
  return base.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const cslTypeOf = (t?: string) => {
  const x = (t || '').toLowerCase();
  if (x.includes('chapter')) return 'chapter';
  if (x.includes('book')) return 'book';
  if (x.includes('conference') || x.includes('proceedings')) return 'paper-conference';
  if (x.includes('thesis') || x.includes('dissertation')) return 'thesis';
  if (x.includes('report')) return 'report';
  if (x.includes('dataset')) return 'dataset';
  return 'article-journal';
};

const toCslJson = (c: any, idx: number) => {
  const authors = citeAuthorList(c.authors).map((a: any) => ({ family: a.family || '', given: a.given || '' })).filter((a: any) => a.family || a.given);
  const yr = parseInt(String(c.year || ''), 10);
  return {
    id: c.doi || ('cit-' + idx),
    type: cslTypeOf(c.type),
    title: c.title || c.intext || '',
    author: authors.length ? authors : undefined,
    issued: yr ? { 'date-parts': [[yr]] } : undefined,
    'container-title': c.container || undefined,
    DOI: c.doi || undefined,
  } as any;
};

const stripHtml = (h: string) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// Remove AI-inserted page markers like "_Page 1_", "**Page 2**" or a lone "Page 3" line.
const stripPageMarkers = (md: string) => (md || '')
  .replace(/^\s*[_*]{0,2}\s*Page\s*\d+\s*[_*]{0,2}\s*$/gim, '')
  .replace(/[_*]{1,2}\s*Page\s*\d+\s*[_*]{1,2}/gi, '')
  .replace(/\n{3,}/g, '\n\n');

// AI ghost-text autocomplete: shows a grey suggestion at the cursor, Tab accepts it.
const autocompleteKey = new PluginKey('aiAutocomplete');
const AiAutocomplete = Extension.create({
  name: 'aiAutocomplete',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: autocompleteKey,
        state: {
          init: () => ({ text: '' }),
          apply: (tr, value) => {
            const meta = tr.getMeta(autocompleteKey);
            if (meta !== undefined) return { text: meta };
            if (tr.docChanged) return { text: '' };
            return value;
          },
        },
        props: {
          decorations: (state) => {
            const st = autocompleteKey.getState(state);
            if (!st || !st.text) return DecorationSet.empty;
            const pos = state.selection.head;
            const widget = Decoration.widget(pos, () => {
              const span = document.createElement('span');
              span.className = 'ai-ghost-text';
              span.textContent = st.text;
              return span;
            }, { side: 1, ignoreSelection: true });
            return DecorationSet.create(state.doc, [widget]);
          },
        },
      }),
    ];
  },
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const st = autocompleteKey.getState(this.editor.state);
        if (st && st.text) {
          this.editor.chain().focus().insertContent(st.text).run();
          return true;
        }
        return false;
      },
      Escape: () => {
        const st = autocompleteKey.getState(this.editor.state);
        if (st && st.text) {
          this.editor.view.dispatch(this.editor.state.tr.setMeta(autocompleteKey, ''));
          return true;
        }
        return false;
      },
    };
  },
});

export function AcademicWritingView({ documentContent, setDocumentContent, loading, handleToolAction, aiResponse, handleFileUpload, uploadingDoc, handleGoHome, handleGenerateDocument }: any) {
  
  // State for chat history
  const [chatHistory, setChatHistory] = useState<any[]>([
    { id: 1, title: 'New Project', date: 'Today', content: '', isEditing: false }
  ]);
  const [activeChatId, setActiveChatId] = useState(1);
  const [selectedChats, setSelectedChats] = useState<number[]>([]);
  const [chatSearch, setChatSearch] = useState('');
  const [editingChatId, setEditingChatId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [promptExpanded, setPromptExpanded] = useState(true);
  const [promptInput, setPromptInput] = useState('');
  
  // Editor State
  const [isEditing, setIsEditing] = useState(false);
  const [editInput, setEditInput] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTab, setUploadTab] = useState('Upload PDFs');
  const [activeReviewTab, setActiveReviewTab] = useState<string | null>(null);
  const [citationPopup, setCitationPopup] = useState({ visible: false, x: 0, y: 0, text: '' });
  const [citationMeta, setCitationMeta] = useState<{ loading: boolean; items: any[] }>({ loading: false, items: [] });
  const [citeExpanded, setCiteExpanded] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [autocompleteOn, setAutocompleteOn] = useState(true);
  const autocompleteOnRef = useRef(true);
  useEffect(() => { autocompleteOnRef.current = autocompleteOn; }, [autocompleteOn]);
  const acTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collectCitationsRef = useRef<((ed: any) => void) | null>(null);
  const detectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showCiteSearch, setShowCiteSearch] = useState(false);
  const [citeQuery, setCiteQuery] = useState('');
  const [citeResults, setCiteResults] = useState<any[]>([]);
  const [citeSearching, setCiteSearching] = useState(false);
  const [citations, setCitations] = useState<any[]>([]);
  const [citationStyleId, setCitationStyleId] = useState('apa');
  const [selectedStyleId, setSelectedStyleId] = useState('apa');
  const [cslBib, setCslBib] = useState<string[] | null>(null);
  const [cslBibLoading, setCslBibLoading] = useState(false);
  const [styleIndex, setStyleIndex] = useState<{ id: string; label: string }[]>([]);
  const [styleIndexLoading, setStyleIndexLoading] = useState(false);
  const cslLocaleRef = useRef<string>('');
  const cslStyleCacheRef = useRef<Record<string, string>>({});
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const citeCacheRef = useRef<Record<string, any>>({});
  const oaCacheRef = useRef<Record<string, boolean | null>>({});
  const lastCiteRef = useRef<string>('');
  const hideCiteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewData, setReviewData] = useState<any>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [importedFileName, setImportedFileName] = useState('');
  const [localUploadingDoc, setLocalUploadingDoc] = useState(false);

  const [zoteroId, setZoteroId] = useState('');
  const [zoteroKey, setZoteroKey] = useState('');
  const [mendeleyToken, setMendeleyToken] = useState('');
  const [fetchId, setFetchId] = useState('');
  const [isFetchingLibrary, setIsFetchingLibrary] = useState(false);

  const handleZoteroSync = async () => {
    setIsFetchingLibrary(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/library/zotero`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: zoteroId, api_key: zoteroKey })
      });
      if(res.ok) alert("Zotero library synced successfully!");
      else alert("Failed to sync Zotero.");
    } catch (e) {
      alert("Error connecting to backend.");
    } finally {
      setIsFetchingLibrary(false);
    }
  };

  const handleMendeleySync = async () => {
    setIsFetchingLibrary(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/library/mendeley`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: mendeleyToken })
      });
      if(res.ok) alert("Mendeley library synced successfully!");
      else alert("Failed to sync Mendeley.");
    } catch (e) {
      alert("Error connecting to backend.");
    } finally {
      setIsFetchingLibrary(false);
    }
  };

  const handleFetchId = async () => {
    if(!fetchId) return;
    setIsFetchingLibrary(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/library/fetch-id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paper_id: fetchId })
      });
      if(res.ok) alert("Document fetched and added to library!");
      else alert("Failed to fetch document. Invalid ID.");
    } catch (e) {
      alert("Error connecting to backend.");
    } finally {
      setIsFetchingLibrary(false);
      setFetchId('');
    }
  };

  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.getAttribute('data-citation') === 'true' || target.closest('[data-citation="true"]')) {
      const el = target.getAttribute('data-citation') === 'true' ? target : target.closest('[data-citation="true"]') as HTMLElement;
      const rect = el.getBoundingClientRect();
      // Calculate position relative to the scrollable container or absolute window
      setCitationPopup({
        visible: true,
        x: rect.left,
        y: rect.bottom,
        text: el.innerText
      });
    } else {
      setCitationPopup(prev => prev.visible ? { ...prev, visible: false } : prev);
    }
  };

  const cancelHideCitation = () => {
    if (hideCiteTimerRef.current) { clearTimeout(hideCiteTimerRef.current); hideCiteTimerRef.current = null; }
  };

  const scheduleHideCitation = () => {
    cancelHideCitation();
    hideCiteTimerRef.current = setTimeout(() => {
      setCitationPopup(prev => prev.visible ? { ...prev, visible: false } : prev);
    }, 220);
  };

  const fetchOA = async (doi?: string | null): Promise<boolean | null> => {
    if (!doi) return null;
    if (oaCacheRef.current[doi] !== undefined) return oaCacheRef.current[doi];
    try {
      const r = await fetch(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=info@pinnovix.app`);
      if (!r.ok) { oaCacheRef.current[doi] = null; return null; }
      const j = await r.json();
      const isOA = !!j.is_oa;
      oaCacheRef.current[doi] = isOA;
      return isOA;
    } catch { oaCacheRef.current[doi] = null; return null; }
  };

  const buildMeta = (it: any) => {
    const authorsList = (it.author || []).map((a: any) => ({ family: a.family || a.name || '', given: a.given || '' }));
    const authors = authorsList.map((a: any) => [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean).slice(0, 8).join(', ');
    const year = String(it.published?.['date-parts']?.[0]?.[0] || '');
    let abstract = it.abstract ? String(it.abstract).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
    let truncated = false;
    if (abstract.length > 320) { abstract = abstract.slice(0, 320).trim(); truncated = true; }
    return {
      doi: it.DOI || '',
      title: Array.isArray(it.title) ? it.title[0] : (it.title || ''),
      authors,
      authorsList,
      year,
      container: Array.isArray(it['container-title']) ? it['container-title'][0] : (it['container-title'] || ''),
      citedBy: typeof it['is-referenced-by-count'] === 'number' ? it['is-referenced-by-count'] : null,
      abstract,
      truncated,
      url: it.URL || (it.DOI ? `https://doi.org/${it.DOI}` : ''),
      type: (it.type || 'article').replace(/-/g, ' '),
      isOA: null as boolean | null,
    };
  };

  const parseCitationSegment = (seg: string) => {
    const yearM = seg.match(/\b(19|20)\d{2}[a-z]?\b/);
    const year = yearM ? yearM[0].replace(/[a-z]$/, '') : '';
    // author phrase = text before the year / first comma; strip brackets, "et al", initials
    let author = seg.replace(/[()\[\]]/g, ' ');
    author = author.split(/\b(?:19|20)\d{2}/)[0];
    author = author.split(/[,;&]/)[0];
    author = author.replace(/\bet al\.?/i, '').replace(/[^A-Za-z\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
    // keep the last token as a likely surname if multi-word org names get long
    const surname = author.split(' ').filter(Boolean).slice(-1)[0] || author;
    return { author: author || surname, surname, year };
  };

  const lookupOne = async (segment: string, doi?: string | null, context?: string) => {
    const sel = 'title,author,published,container-title,is-referenced-by-count,abstract,URL,type,DOI';
    try {
      if (doi) {
        const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}?select=${sel}`);
        const j = await r.json();
        const it = j?.message || null;
        if (!it) return { none: true, raw: segment };
        const meta: any = buildMeta(it);
        meta.isOA = await fetchOA(meta.doi);
        return meta;
      }
      const { author, surname, year } = parseCitationSegment(segment);
      const ctx = (context || '').replace(/\([^()]*\)/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280);
      // acronym authors (IDF, WHO, ADA, NICE) are organisations — don't constrain by author name
      const isAcronym = /^[A-Z]{2,6}$/.test((surname || '').trim());
      const bib = [ctx, author].filter(Boolean).join(' ').trim() || segment;
      const ctxWords = new Set(ctx.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 4));
      const fetchItems = async (u: string) => {
        try { const r = await fetch(u); const j = await r.json(); return (j?.message?.items || []) as any[]; } catch { return []; }
      };
      // pass 1: bibliographic (context + author), optionally constrained by a person author
      let url = `https://api.crossref.org/works?rows=8&select=${sel}&query.bibliographic=${encodeURIComponent(bib)}`;
      if (author && !isAcronym) url += `&query.author=${encodeURIComponent(author)}`;
      let items = await fetchItems(url);
      // pass 2: broaden (drop author constraint), using context or the raw segment
      if (!items.length) {
        items = await fetchItems(`https://api.crossref.org/works?rows=8&select=${sel}&query.bibliographic=${encodeURIComponent(ctx || segment)}`);
      }
      if (!items.length) return { none: true, raw: segment };
      const score = (it: any) => {
        let sc = 0;
        const fams = (it.author || []).map((a: any) => (a.family || a.name || '').toLowerCase());
        if (surname && !isAcronym && fams.some((f: string) => f.includes(surname.toLowerCase()) || surname.toLowerCase().includes(f))) sc += 5;
        const y = String(it.published?.['date-parts']?.[0]?.[0] || '');
        if (year && y === year) sc += 4;
        else if (year && Math.abs(parseInt(y || '0', 10) - parseInt(year, 10)) <= 1) sc += 1.5;
        // topical overlap between candidate title and the surrounding sentence
        const titleWords = String(Array.isArray(it.title) ? it.title[0] : (it.title || '')).toLowerCase().split(/[^a-z]+/);
        const overlap = titleWords.filter(w => w.length > 4 && ctxWords.has(w)).length;
        sc += Math.min(overlap, 4);
        sc += Math.min((it['is-referenced-by-count'] || 0) / 500, 2);
        return sc;
      };
      const best = items.slice().sort((a, b) => score(b) - score(a))[0];
      const meta: any = buildMeta(best);
      meta.weak = score(best) < 3; // low-confidence guess
      meta.isOA = await fetchOA(meta.doi);
      return meta;
    } catch {
      return { none: true, raw: segment };
    }
  };

  // Fetch one card per reference inside the citation (split on ";"). opts: { refs?, singleDoi? }
  const fetchCitationCards = async (rawText: string, opts?: { refs?: any[]; singleDoi?: string | null; context?: string }) => {
    setCiteExpanded(false);
    if (opts?.refs && opts.refs.length) {
      setCitationMeta({ loading: false, items: opts.refs.map((r: any) => ({ ...r, authors: Array.isArray(r.authors) ? r.authors.map((a: any) => [a.given, a.family].filter(Boolean).join(' ')).join(', ') : r.authors, authorsList: Array.isArray(r.authors) ? r.authors : undefined })) });
      return;
    }
    const cacheKey = (opts?.singleDoi ? 'doi:' + opts.singleDoi : 'cards:' + rawText + '|' + (opts?.context || '').slice(0, 60)).trim();
    if (citeCacheRef.current[cacheKey] !== undefined) {
      setCitationMeta({ loading: false, items: citeCacheRef.current[cacheKey] });
      return;
    }
    setCitationMeta({ loading: true, items: [] });
    try {
      let items: any[];
      if (opts?.singleDoi) {
        items = [await lookupOne(rawText, opts.singleDoi)];
      } else {
        const inner = rawText.replace(/^\s*\(/, '').replace(/\)\s*$/, '').trim();
        const segments = inner.split(';').map(x => x.trim()).filter(Boolean).slice(0, 4);
        const list = segments.length ? segments : [rawText];
        items = await Promise.all(list.map(seg => lookupOne(seg, null, opts?.context)));
      }
      citeCacheRef.current[cacheKey] = items;
      setCitationMeta({ loading: false, items });
    } catch {
      setCitationMeta({ loading: false, items: [] });
    }
  };

  const handleCitationHover = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target || !target.getAttribute) return;
    const el = (target.getAttribute('data-citation') === 'true'
      ? target
      : target.closest('[data-citation="true"]')) as HTMLElement | null;
    if (!el) return;
    cancelHideCitation();
    const rect = el.getBoundingClientRect();
    const text = el.innerText;
    setCitationPopup(prev =>
      prev.visible && prev.text === text
        ? prev
        : { visible: true, x: rect.left, y: rect.bottom, text }
    );
    if (lastCiteRef.current !== text) {
      lastCiteRef.current = text;
      const refsAttr = el.getAttribute('data-refs');
      const storedDoi = el.getAttribute('data-doi');
      if (refsAttr) {
        try { fetchCitationCards(text, { refs: JSON.parse(refsAttr) }); }
        catch { fetchCitationCards(text); }
      } else if (storedDoi) {
        fetchCitationCards(text, { singleDoi: storedDoi });
      } else {
        const block = (el.closest('p, li, h1, h2, h3, h4, blockquote') as HTMLElement | null);
        const context = block ? block.innerText : text;
        fetchCitationCards(text, { context });
      }
    }
  };

  const handleCitationHoverOut = (e: React.MouseEvent) => {
    const related = e.relatedTarget as HTMLElement | null;
    if (related && related.closest && related.closest('[data-citation="true"]')) return;
    scheduleHideCitation();
  };

  const handleInsertEquation = (inline = false) => {
    if (!editor) return;
    const latex = window.prompt(
      inline
        ? 'Enter inline math in LaTeX (e.g. x^2 + y^2 = r^2):'
        : 'Enter an equation in LaTeX (e.g. E = mc^2  or  \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}):'
    );
    if (!latex || !latex.trim()) return;
    const dpi = inline ? 110 : 150;
    const expr = `\\dpi{${dpi}}\\bg{white} ${latex.trim()}`;
    const src = `https://latex.codecogs.com/png.image?${encodeURIComponent(expr)}`;
    editor.chain().focus().setImage({ src, alt: latex.trim() }).run();
  };

  const handleInsertChart = () => {
    if (!editor) return;
    const typeRaw = (window.prompt('Chart type — bar, line, pie, or doughnut:', 'bar') || '').trim().toLowerCase();
    if (!typeRaw) return;
    const type = ['bar', 'line', 'pie', 'doughnut'].includes(typeRaw) ? typeRaw : 'bar';
    const labelsRaw = window.prompt('Labels separated by commas (e.g. 2021, 2022, 2023):');
    if (!labelsRaw || !labelsRaw.trim()) return;
    const valuesRaw = window.prompt('Values separated by commas (e.g. 10, 25, 40):');
    if (!valuesRaw || !valuesRaw.trim()) return;
    const labels = labelsRaw.split(',').map(l => l.trim()).filter(Boolean);
    const data = valuesRaw.split(',').map(v => parseFloat(v.trim())).filter(n => !isNaN(n));
    if (!data.length) { alert('No valid numeric values provided.'); return; }
    const palette = ['#5b5fff', '#10b981', '#f59e0b', '#ef4444', '#6d93e8', '#a855f7', '#14b8a6', '#ec4899'];
    const isCircular = type === 'pie' || type === 'doughnut';
    const config = {
      type,
      data: {
        labels,
        datasets: [{
          label: 'Data',
          data,
          backgroundColor: isCircular ? palette : '#5b5fff',
          borderColor: '#5b5fff',
          fill: type !== 'line',
        }],
      },
      options: { plugins: { legend: { display: isCircular } } },
    };
    const src = `https://quickchart.io/chart?w=520&h=320&bkg=white&c=${encodeURIComponent(JSON.stringify(config))}`;
    editor.chain().focus().setImage({ src, alt: `${type} chart` }).run();
  };

  const handleImageFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) { if (e.target) e.target.value = ''; return; }
    if (!file.type.startsWith('image/')) { alert('Please select an image file.'); if (e.target) e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      editor.chain().focus().setImage({ src, alt: file.name }).run();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCiteSearch = async (qOverride?: string) => {
    const q = (qOverride !== undefined ? qOverride : citeQuery).trim();
    if (!q) return;
    setCiteSearching(true);
    setCiteResults([]);
    try {
      const res = await fetch(
        `https://api.crossref.org/works?rows=6&select=title,author,published,container-title,is-referenced-by-count,DOI,type&query.bibliographic=${encodeURIComponent(q)}`
      );
      const json = await res.json();
      const items = (json?.message?.items || []).map((it: any) => ({
        doi: it.DOI || '',
        title: Array.isArray(it.title) ? it.title[0] : (it.title || 'Untitled'),
        authors: (it.author || []).map((a: any) => ({ family: a.family || a.name || '', given: a.given || '' })),
        year: String(it.published?.['date-parts']?.[0]?.[0] || ''),
        container: Array.isArray(it['container-title']) ? it['container-title'][0] : (it['container-title'] || ''),
        citedBy: typeof it['is-referenced-by-count'] === 'number' ? it['is-referenced-by-count'] : null,
        type: (it.type || 'article').replace(/-/g, ' '),
      }));
      setCiteResults(items);
    } catch {
      setCiteResults([]);
    } finally {
      setCiteSearching(false);
    }
  };

  const handleCiteInsert = (item: any) => {
    if (!editor) return;
    const intext = inTextCitation(item.authors, item.year);
    const attrs = {
      doi: item.doi || null,
      title: item.title || null,
      authors: item.authors && item.authors.length ? JSON.stringify(item.authors) : null,
      year: item.year || null,
      container: item.container || null,
      citedBy: item.citedBy != null ? String(item.citedBy) : null,
    };
    editor.chain().focus().insertContent([
      { type: 'text', text: intext, marks: [{ type: 'citation', attrs }] },
      { type: 'text', text: ' ' },
    ]).run();
    setShowCiteSearch(false);
    setCiteQuery('');
    setCiteResults([]);
  };

  // Collect unique citations from the document (for the live bibliography)
  const collectCitations = (ed: any) => {
    const found: any[] = [];
    const seen = new Set<string>();
    ed.state.doc.descendants((node: any) => {
      if (node.isText && node.marks) {
        node.marks.forEach((m: any) => {
          if (m.type.name === 'citation') {
            const a = m.attrs || {};
            let refsArr: any[] | null = null;
            if (a.refs) { try { refsArr = JSON.parse(a.refs); } catch { refsArr = null; } }
            if (refsArr && refsArr.length) {
              refsArr.forEach((r: any) => {
                const key = r.doi || (r.title || '').trim();
                if (key && !seen.has(key)) {
                  seen.add(key);
                  found.push({ ...r, authors: Array.isArray(r.authors) ? JSON.stringify(r.authors) : r.authors, intext: node.text });
                }
              });
            } else {
              const key = a.doi || (node.text || '').trim();
              if (key && !seen.has(key)) {
                seen.add(key);
                found.push({ ...a, intext: node.text });
              }
            }
          }
        });
      }
      return true;
    });
    setCitations(found);
  };
  collectCitationsRef.current = collectCitations;

  // Auto-detect plain-text citations like "(Author, 2020)" and wrap them as citation marks,
  // so they become hoverable and feed the bibliography (works on AI-generated docs).
  const detectCitations = () => {
    if (!editor || !editor.schema?.marks?.citation) return;
    const citationType = editor.schema.marks.citation;
    const { doc } = editor.state;
    const re = /\([^()]*\b(?:19|20)\d{2}[a-z]?\b[^()]*\)/g;
    const ranges: { from: number; to: number }[] = [];
    doc.descendants((node: any, pos: number) => {
      if (!node.isText || !node.text) return;
      if (citationType.isInSet(node.marks)) return; // already a citation
      const text: string = node.text;
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        if (m[0].length > 120) continue; // guard against runaway matches
        ranges.push({ from: pos + m.index, to: pos + m.index + m[0].length });
      }
    });
    if (!ranges.length) return;
    let tr = editor.state.tr;
    ranges.forEach(r => { tr = tr.addMark(r.from, r.to, citationType.create()); });
    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);
  };
  const detectCitationsRef = useRef(detectCitations);
  detectCitationsRef.current = detectCitations;
  const scheduleDetect = () => {
    if (detectTimerRef.current) clearTimeout(detectTimerRef.current);
    detectTimerRef.current = setTimeout(() => detectCitationsRef.current?.(), 500);
  };

  // Attach matched metadata (incl. DOI) to the hovered citation so cards + bibliography stay accurate.
  const acceptCitationMeta = (intext: string, items: any[]) => {
    if (!editor || !editor.schema?.marks?.citation) return;
    const meaningful = (items || []).filter((i: any) => i && !i.none);
    if (!meaningful.length) { setCitationPopup(prev => ({ ...prev, visible: false })); return; }
    const refs = meaningful.map((m: any) => ({
      doi: m.doi || '',
      title: m.title || '',
      authors: m.authorsList || [],
      year: m.year || '',
      container: m.container || '',
      citedBy: m.citedBy != null ? m.citedBy : null,
    }));
    const citationType = editor.schema.marks.citation;
    let target: any = null;
    editor.state.doc.descendants((node: any, pos: number) => {
      if (target) return false;
      if (node.isText && node.text && citationType.isInSet(node.marks) && node.text.trim() === intext.trim()) {
        target = { from: pos, to: pos + node.nodeSize };
      }
      return true;
    });
    if (!target) { setCitationPopup(prev => ({ ...prev, visible: false })); return; }
    const first = refs[0];
    const attrs = {
      doi: first.doi || null,
      title: first.title || null,
      authors: first.authors && first.authors.length ? JSON.stringify(first.authors) : null,
      year: first.year || null,
      container: first.container || null,
      citedBy: first.citedBy != null ? String(first.citedBy) : null,
      refs: JSON.stringify(refs),
    };
    const tr = editor.state.tr.addMark(target.from, target.to, citationType.create(attrs));
    editor.view.dispatch(tr);
    collectCitations(editor);
    setCitationPopup(prev => ({ ...prev, visible: false }));
    lastCiteRef.current = '';
  };

  // ---- Proactive AI citation suggestions ----
  const findClaimInsertPos = (claim: string): number | null => {
    if (!editor) return null;
    const target = (claim || '').trim();
    if (!target) return null;
    let result: number | null = null;
    editor.state.doc.descendants((node: any, pos: number) => {
      if (result != null) return false;
      if (node.type.isBlock && node.textContent) {
        const txt: string = node.textContent;
        let idx = txt.indexOf(target);
        let len = target.length;
        if (idx === -1) {
          const probe = target.slice(0, 50);
          idx = txt.indexOf(probe);
          if (idx !== -1) {
            const e = txt.indexOf('.', idx + probe.length);
            len = (e === -1 ? txt.length : e + 1) - idx;
          }
        }
        if (idx !== -1) {
          let endOffset = idx + len;
          if (txt[endOffset - 1] === '.') endOffset -= 1;
          result = pos + 1 + endOffset;
        }
      }
      return true;
    });
    return result;
  };

  const handleSuggestCitations = async () => {
    if (!editor) return;
    const text = editor.getText();
    if (text.trim().length < 40) { alert('Write a bit more first, then I can suggest citations.'); return; }
    setShowSuggestModal(true);
    setSuggestLoading(true);
    setSuggestions([]);
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${API}/api/suggest-citations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      const claims: any[] = data.claims || [];
      if (!claims.length) { setSuggestLoading(false); return; }
      const withPapers = await Promise.all(
        claims.map(async (c: any) => ({ claim: c.claim, query: c.query || c.claim, paper: await lookupOne(c.query || c.claim), status: 'pending' }))
      );
      setSuggestions(withPapers);
    } catch { /* ignore */ }
    finally { setSuggestLoading(false); }
  };

  const acceptSuggestion = (sug: any) => {
    if (!editor || !sug?.paper || sug.paper.none) return;
    const p = sug.paper;
    const intext = inTextCitation(p.authorsList || [], p.year);
    const attrs = {
      doi: p.doi || null,
      title: p.title || null,
      authors: p.authorsList && p.authorsList.length ? JSON.stringify(p.authorsList) : null,
      year: p.year || null,
      container: p.container || null,
      citedBy: p.citedBy != null ? String(p.citedBy) : null,
    };
    const content = [{ type: 'text', text: ' ' + intext, marks: [{ type: 'citation', attrs }] }];
    const pos = findClaimInsertPos(sug.claim);
    if (pos != null) editor.chain().focus().insertContentAt(pos, content as any).run();
    else editor.chain().focus('end').insertContent(content as any).run();
    setSuggestions(prev => prev.map(x => (x === sug ? { ...x, status: 'accepted' } : x)));
    setTimeout(() => editor && collectCitations(editor), 100);
  };

  const refineCitation = (intext: string) => {
    const q = intext.replace(/^\s*\(/, '').replace(/\)\s*$/, '').trim();
    setCitationPopup(prev => ({ ...prev, visible: false }));
    setCiteQuery(q);
    setShowCiteSearch(true);
    setTimeout(() => handleCiteSearch(q), 50);
  };

  // ---- CSL engine: fetch styles/locale on demand, format bibliography across ~2,600 styles ----
  const ensureCslStyle = async (id: string, depth = 0): Promise<string> => {
    if (cslStyleCacheRef.current[id]) return cslStyleCacheRef.current[id];
    let res = await fetch(cslStyleUrl(id));
    if (!res.ok) res = await fetch(cslDependentUrl(id));
    if (!res.ok) throw new Error('CSL style not found: ' + id);
    let xml = await res.text();
    // dependent styles point to an independent parent that carries the actual formatting
    const m = xml.match(/rel="independent-parent"[^>]*href="([^"]+)"/) || xml.match(/href="([^"]+)"[^>]*rel="independent-parent"/);
    if (m && depth < 3) {
      const parentId = m[1].split('/').pop() || '';
      if (parentId) xml = await ensureCslStyle(parentId, depth + 1);
    }
    cslStyleCacheRef.current[id] = xml;
    return xml;
  };

  const formatBibliographyCSL = async (cites: any[], styleId: string): Promise<string[]> => {
    const modAny: any = await import('citeproc');
    const CSL = modAny.default || modAny;
    if (!cslLocaleRef.current) {
      const r = await fetch(CSL_LOCALE_URL);
      cslLocaleRef.current = await r.text();
    }
    const styleXml = await ensureCslStyle(styleId);
    const itemsMap: Record<string, any> = {};
    cites.forEach((c, i) => { const j = toCslJson(c, i); itemsMap[j.id] = j; });
    const sys = {
      retrieveLocale: () => cslLocaleRef.current,
      retrieveItem: (id: string) => itemsMap[id],
    };
    const engine = new CSL.Engine(sys, styleXml, 'en-US');
    engine.updateItems(Object.keys(itemsMap));
    const bib = engine.makeBibliography();
    if (!bib || !bib[1]) throw new Error('no bibliography');
    return bib[1].map((x: any) => String(x));
  };

  const loadStyleIndex = async () => {
    if (styleIndex.length || styleIndexLoading) return;
    setStyleIndexLoading(true);
    try {
      const r = await fetch('https://data.jsdelivr.com/v1/packages/gh/citation-style-language/styles@master?structure=flat');
      const j = await r.json();
      const files: any[] = j?.files || [];
      const ids = files
        .map((f: any) => String(f.name || ''))
        .filter((n: string) => n.endsWith('.csl'))
        .map((n: string) => n.replace(/^\//, '').replace(/\.csl$/, ''));
      const curatedIds = new Set(CURATED_STYLES.map(c => c.id));
      const rest = ids.filter(id => !curatedIds.has(id) && !curatedIds.has(id.split('/').pop() || '')).map(id => ({ id, label: prettifyStyleId(id) }));
      setStyleIndex([...CURATED_STYLES, ...rest]);
    } catch {
      setStyleIndex([...CURATED_STYLES]);
    } finally {
      setStyleIndexLoading(false);
    }
  };

  const insertBibliography = () => {
    if (!editor || !citations.length) return;
    const items = (cslBib && cslBib.length)
      ? cslBib.map(stripHtml)
      : citations.map((c, i) => formatReference(c, citationStyle, i + 1));
    const html = '<h2>References</h2>' + items.map(t => `<p>${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('');
    editor.chain().focus('end').insertContent(html).run();
  };

  const handleEditRequest = async () => {
    if (!editInput.trim()) return;
    const instruction = editInput;
    setEditInput('');
    
    // Add a loading indicator locally
    const originalContent = editor?.getHTML() || '';
    if (editor) {
      editor.commands.setContent(originalContent + '<p><em>AI is writing...</em></p>', { emitUpdate: false });
    }

    const prompt = `Context of the current document:
${editor?.getText() || documentContent}

Instruction: ${instruction}

MANDATORY: Generate ONLY the new text to be appended or inserted based on the instruction. Do not rewrite the existing context. Do not include pleasantries. Output cleanly formatted Markdown.`;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: prompt, 
          agent_type: "review",
          use_rag: false,
          persona: "DOCUMENT ANALYST"
        })
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let newContent = '';

      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'token') {
                newContent += data.content;
                if (editor) {
                  // Import marked dynamically or use it if available
                  // Wait, marked is imported at the top of the file!
                  const htmlFragment = marked.parse(newContent);
                  editor.commands.setContent(originalContent + htmlFragment, { emitUpdate: false });
                }
              }
            } catch (e) {}
          }
        }
      }
    } catch(e) {
      console.error("Failed to stream edit", e);
      if (editor) editor.commands.setContent(originalContent, { emitUpdate: false });
    }
  };

  // ---- Feature #1: Inline AI edits on the selected text ----
  const [inlineAiBusy, setInlineAiBusy] = useState(false);
  // citationStyle reuses the existing state declared below
  const [chatPdfOpen, setChatPdfOpen] = useState(false);
  const [chatPdfQ, setChatPdfQ] = useState('');
  const [chatPdfA, setChatPdfA] = useState('');
  const [chatPdfBusy, setChatPdfBusy] = useState(false);
  const handleInlineAi = async (action: string) => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) { alert('Select some text in the document first, then choose an action.'); return; }
    const selected = editor.state.doc.textBetween(from, to, ' ');
    const verbs: Record<string, string> = {
      improve: 'Improve the grammar, clarity, flow and academic tone of the following text',
      paraphrase: 'Paraphrase the following text while fully preserving its meaning',
      expand: 'Expand the following text with more depth, detail and supporting explanation',
      shorten: 'Rewrite the following text to be more concise without losing key information',
      simplify: 'Simplify the following text so it is clearer and easier to read',
    };
    const prompt = `${verbs[action] || verbs.improve}. Return ONLY the rewritten text as plain prose - no preamble, no surrounding quotes, no markdown headings:\n\n"${selected}"`;
    setInlineAiBusy(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, agent_type: 'review', use_rag: false, persona: 'DOCUMENT ANALYST' })
      });
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let result = '';
      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'token') result += data.content;
              else if (data.error) throw new Error(data.error);
            } catch (e) {}
          }
        }
      }
      const clean = (result || '').trim().replace(/^"|"$/g, '');
      if (clean) editor.chain().focus().insertContentAt({ from, to }, clean).run();
      else alert('No suggestion was returned. The service may be busy - please try again.');
    } catch (e) {
      console.error('Inline AI edit failed', e);
      alert('AI edit failed. Please try again in a moment.');
    } finally {
      setInlineAiBusy(false);
    }
  };

  // ---- Feature #5: Outline builder ----
  const handleGenerateOutline = async () => {
    if (!editor) return;
    const topic = (promptInput && promptInput.trim()) || editor.getText().trim().slice(0, 500);
    if (!topic) { alert('Add a topic in the prompt box (or write something) so I know what to outline.'); return; }
    setInlineAiBusy(true);
    const prompt = `Create a clear, hierarchical outline for an academic document on this topic: "${topic}". Use Markdown headings (##, ###) and nested bullet points for sub-sections. Return ONLY the outline, with no preamble.`;
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, agent_type: 'review', use_rag: false, persona: 'ACADEMIC WRITING' })
      });
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = ''; let result = '';
      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') continue;
            try { const data = JSON.parse(dataStr); if (data.type === 'token') result += data.content; } catch (e) {}
          }
        }
      }
      const clean = (result || '').trim();
      if (clean) editor.chain().focus().insertContent(marked.parse(clean) as string).run();
      else alert('No outline was returned. Please try again.');
    } catch (e) { console.error('Outline failed', e); alert('Outline generation failed. Please try again.'); }
    finally { setInlineAiBusy(false); }
  };

  // ---- Feature #4: Citation style switcher ----
  const handleApplyCitationStyle = async () => {
    if (!editor) return;
    const html = editor.getHTML();
    if (!editor.getText().trim()) { alert('Write or generate some content first.'); return; }
    setInlineAiBusy(true);
    const prompt = `Reformat ALL in-text citations and any reference/bibliography list in the following document into strict ${citationStyle} style. Do not change the wording, meaning or structure of the text itself - only the citation formatting. Return the FULL document as clean Markdown.\n\n${html}`;
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, agent_type: 'review', use_rag: false, persona: 'DOCUMENT ANALYST' })
      });
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = ''; let result = '';
      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') continue;
            try { const data = JSON.parse(dataStr); if (data.type === 'token') result += data.content; } catch (e) {}
          }
        }
      }
      const clean = (result || '').trim();
      if (clean) editor.commands.setContent(marked.parse(clean) as string, { emitUpdate: true });
      else alert('No reformatted document was returned. Please try again.');
    } catch (e) { console.error('Citation reformat failed', e); alert('Citation reformat failed. Please try again.'); }
    finally { setInlineAiBusy(false); }
  };

  // ---- Feature #3: Chat with your library (RAG over uploaded papers) ----
  const handleAskLibrary = async () => {
    if (!chatPdfQ.trim()) return;
    setChatPdfBusy(true); setChatPdfA('');
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: chatPdfQ, agent_type: 'research', use_rag: true, persona: 'DOCUMENT ANALYST' })
      });
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = ''; let result = '';
      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'token') { result += data.content; setChatPdfA(result); }
              else if (data.error) { setChatPdfA('\u26a0\ufe0f ' + data.error); }
            } catch (e) {}
          }
        }
      }
      if (!result.trim()) setChatPdfA('No answer was returned. Make sure you have uploaded documents to your library, then try again.');
    } catch (e) { setChatPdfA('\u26a0\ufe0f Could not reach the service. Please try again.'); }
    finally { setChatPdfBusy(false); }
  };

  const handleDocumentImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLocalUploadingDoc(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      // Parse the document text
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/parse-document`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const text = response.data.text;
      
      // Also upload it to the library so the AI can reference it
      axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).catch(e => console.error("Library upload failed", e));
      
      // Store in editor state but don't jump to editor yet
      setDocumentContent(text);
      if (editor) {
        editor.commands.setContent(marked.parse(text), { emitUpdate: false });
      }
      
      setImportedFileName(file.name);
    } catch (error: any) {
      console.error(error);
      const detail = error.response?.data?.detail || error.message || 'Unknown error';
      alert(`Failed to import document: ${detail}`);
    } finally {
      setLocalUploadingDoc(false);
      e.target.value = '';
    }
  };

  const fetchReview = async (prompt: string, fallback: any) => {
    setIsReviewing(true);
    setReviewData(null);
    setExpandedSection(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: prompt, 
          agent_type: "review",
          use_rag: false,
          persona: "ACADEMIC WRITING"
        })
      });
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullJson = '';
      let buffer = '';
      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
               const dataStr = line.slice(6);
               if (dataStr === '[DONE]') continue;
               try {
                 const data = JSON.parse(dataStr);
                 if (data.type === 'token') fullJson += data.content;
               } catch(e) {}
            }
          }
        }
      }
      // Robust parse: strip code fences, extract JSON, and always keep the raw text.
      let txt = (fullJson || '').trim();
      const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence) txt = fence[1].trim();
      const jsonMatch = txt.match(/\{[\s\S]*\}/);
      let parsed: any = null;
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch(parseErr) {
          console.warn("Failed to parse JSON from LLM:", parseErr, fullJson);
        }
      }
      if (parsed && typeof parsed === 'object') {
        setReviewData({ ...fallback, ...parsed, raw: fullJson });
      } else {
        console.warn("No JSON found in LLM response:", fullJson);
        setReviewData({ ...fallback, raw: fullJson });
      }
    } catch (e) {
      console.warn("Network or stream error in fetchReview:", e);
      setReviewData(fallback);
    } finally {
      setIsReviewing(false);
    }
  };

  const handleDocumentAnalysis = () => {
    setActiveReviewTab('analysis');
    fetchReview(`Analyze the following academic document. Return ONLY a valid JSON object (no markdown, no code fences). Exact format:
{
  "overview": "Brief overall assessment of the document's quality and arguments.",
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "recommendations": ["actionable recommendation 1", "recommendation 2"]
}
Document: "${editor?.getText() || documentContent}"`, {
      overview: "Could not generate an overview. Please try again.",
      strengths: [],
      weaknesses: [],
      recommendations: []
    });
  };

  const handleClaimConfidence = () => {
    setActiveReviewTab('claim');
    fetchReview(`Review the following text for claims. Return ONLY a valid JSON object. Do not use markdown formatting. Format must be exactly:
{
  "type": "claim",
  "summary": "Brief summary of the claims found.",
  "misrepresented": ["Claim 1", "Claim 2"],
  "contradicted": ["Claim 1"],
  "unsupported": ["Claim 1"],
  "weaklySupported": ["Sentence 1 lacking citation"],
  "overstated": ["Claim 1"],
  "unverifiable": ["Claim 1"]
}
Text to review: "${editor?.getText() || documentContent}"`, {
      type: 'claim',
      summary: "Review completed, but no specific claims could be extracted.",
      misrepresented: [],
      contradicted: [],
      unsupported: [],
      weaklySupported: [],
      overstated: [],
      unverifiable: []
    });
  };

  const handlePeerReview = () => {
    setActiveReviewTab('peer');
    fetchReview(`Review the following text. Return ONLY a valid JSON object. Do not use markdown formatting. Format must be exactly:
{
  "type": "peer",
  "overall": "Brief 2-3 sentence overall assessment.",
  "strengths": ["Strength 1", "Strength 2"],
  "weaknesses": ["Weakness 1", "Weakness 2"]
}
Text to review: "${editor?.getText() || documentContent}"`, {
      type: 'peer',
      overall: "Review completed, but couldn't parse the exact strengths and weaknesses.",
      strengths: [],
      weaknesses: []
    });
  };

  const handleToneOfVoice = () => {
    setActiveReviewTab('tone');
    fetchReview(`Review the following text for tone. Return ONLY a valid JSON object. Do not use markdown formatting. Format must be exactly:
{
  "type": "tone",
  "suggestions": ["Suggestion 1", "Suggestion 2"]
}
Text to review: "${editor?.getText() || documentContent}"`, {
      type: 'tone',
      suggestions: []
    });
  };

  const handleProofread = () => {
    setActiveReviewTab('proofread');
    fetchReview(`Proofread the following text for grammar. Return ONLY a valid JSON object. Do not use markdown formatting. Format must be exactly:
{
  "type": "proofread",
  "issues": ["Issue 1 found", "Issue 2 found"]
}
Text to review: "${editor?.getText() || documentContent}"`, {
      type: 'proofread',
      issues: []
    });
  };

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('academic_projects_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0) {
          setChatHistory(parsed);
          setActiveChatId(Date.now());
          if (parsed[0].content) {
            setDocumentContent('');
          }
          setIsEditing(false);
        }
      } catch (e) {
        console.error("Failed to load academic history", e);
      }
    }
  }, []);

  // Save to local storage when content changes
  useEffect(() => {
    setChatHistory(prev => {
      const updated = prev.map(chat => 
        chat.id === activeChatId ? { ...chat, content: documentContent, isEditing } : chat
      );
      // Only save if it's different to avoid infinite loops, but since we are mapping, let's just save.
      // Wait, we can't save on every render if we don't need to, but this is triggered by deps.
      localStorage.setItem('academic_projects_history', JSON.stringify(updated));
      return updated;
    });
  }, [documentContent, activeChatId, isEditing]);

  // ---- Chat history management (ChatGPT-style) ----
  const saveChats = (list: any[]) => {
    setChatHistory(list);
    try { localStorage.setItem('academic_projects_history', JSON.stringify(list)); } catch {}
  };
  const moveChat = (id: number, dir: 'up' | 'down') => {
    const idx = chatHistory.findIndex((c: any) => c.id === id);
    if (idx === -1) return;
    const j = dir === 'up' ? idx - 1 : idx + 1;
    if (j < 0 || j >= chatHistory.length) return;
    const list = [...chatHistory];
    [list[idx], list[j]] = [list[j], list[idx]];
    saveChats(list);
  };
  const togglePinChat = (id: number) => {
    const chat = chatHistory.find((c: any) => c.id === id);
    if (!chat) return;
    const nowPinned = !chat.pinned;
    let list = chatHistory.map((c: any) => (c.id === id ? { ...c, pinned: nowPinned } : c));
    if (nowPinned) {
      const item = list.find((c: any) => c.id === id);
      list = [item, ...list.filter((c: any) => c.id !== id)];
    }
    saveChats(list);
  };
  const renameChat = (id: number, title: string) => {
    const t = (title || '').trim() || 'Untitled';
    saveChats(chatHistory.map((c: any) => (c.id === id ? { ...c, title: t } : c)));
  };
  const deleteChat = (id: number) => {
    const updated = chatHistory.filter((c: any) => c.id !== id);
    saveChats(updated);
    if (activeChatId === id) {
      if (updated.length > 0) {
        setActiveChatId(updated[0].id);
        setDocumentContent(updated[0].content || '');
        if (editor) editor.commands.setContent(updated[0].content || '<p class="text-gray-400">Start writing or type / for commands</p>', { emitUpdate: false });
      } else {
        handleGoHome();
      }
    }
  };

  const [editorClickPos, setEditorClickPos] = useState({ x: 0, y: 0, text: '', visible: false });

  // Tiptap Editor Initialization
  const editor = useEditor({
    extensions: [
      StarterKit, 
      CitationMark, 
      Underline,
      Superscript,
      Subscript,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-blue-600 underline' } }),
      Image.configure({ inline: true, HTMLAttributes: { class: 'rounded-lg my-4 max-w-full shadow-md object-contain max-h-[400px] mx-auto' } }),
      AiAutocomplete,
    ],
    content: documentContent || '<h2 class="text-3xl font-bold mb-4">Quantum Computing with Artificial Intelligence</h2><p class="mb-4">The convergence of artificial intelligence and quantum computing represents a paradigm shift in computational science. Quantum machine learning algorithms can solve problems that lie beyond the reach of classical computers <span data-citation="true">(Pineda et al., 2025)</span>.</p>',
    onUpdate: ({ editor }) => {
      setDocumentContent(editor.getHTML());
      collectCitationsRef.current?.(editor);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[500px] text-[15px] leading-relaxed',
      },
      handleClick: (view, pos, event) => {
        const target = event.target as HTMLElement;
        if (target.getAttribute('data-citation') === 'true' || target.closest('[data-citation="true"]')) {
          const el = target.getAttribute('data-citation') === 'true' ? target : target.closest('[data-citation="true"]') as HTMLElement;
          const rect = el.getBoundingClientRect();
          setEditorClickPos({
            visible: true,
            x: rect.left,
            y: rect.bottom,
            text: el.innerText
          });
          return true; // prevent default
        }
        setEditorClickPos(prev => prev.visible ? { ...prev, visible: false } : prev);
        return false;
      }
    },
  });

  useEffect(() => {
    if (editorClickPos.visible) {
      setCitationPopup(editorClickPos);
    } else {
      setCitationPopup(prev => prev.visible ? { ...prev, visible: false } : prev);
    }
  }, [editorClickPos]);

  // AI autocomplete: debounce after typing, fetch a short continuation, show as ghost text
  useEffect(() => {
    if (!editor) return;
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const clearGhost = () => {
      const st = autocompleteKey.getState(editor.state);
      if (st && st.text) editor.view.dispatch(editor.state.tr.setMeta(autocompleteKey, ''));
    };
    const doFetch = async () => {
      if (!autocompleteOnRef.current || !editor.isFocused) return;
      const { state } = editor;
      if (!state.selection.empty) return;
      const head = state.selection.head;
      const before = state.doc.textBetween(Math.max(0, head - 1500), head, '\n', '\n');
      if (before.trim().length < 12) return;
      const after = state.doc.textBetween(head, Math.min(state.doc.content.size, head + 1), '\n', '\n');
      if (after && after.trim().length > 0) return; // only at end of a line/block
      try {
        const res = await fetch(`${API}/api/autocomplete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: before }),
        });
        if (!res.ok) return;
        const data = await res.json();
        let sug = (data.completion || '').trim();
        if (!sug) return;
        if (before.length && !/\s$/.test(before) && !/^[\s.,;:!?)]/.test(sug)) sug = ' ' + sug;
        if (editor.state.selection.head !== head || !editor.isFocused) return; // cursor moved
        editor.view.dispatch(editor.state.tr.setMeta(autocompleteKey, sug));
      } catch { /* ignore */ }
    };
    const schedule = () => {
      if (acTimerRef.current) clearTimeout(acTimerRef.current);
      if (!autocompleteOnRef.current) return;
      acTimerRef.current = setTimeout(() => { void doFetch(); }, 650);
    };
    editor.on('update', schedule);
    editor.on('selectionUpdate', clearGhost);
    return () => {
      editor.off('update', schedule);
      editor.off('selectionUpdate', clearGhost);
      if (acTimerRef.current) clearTimeout(acTimerRef.current);
    };
  }, [editor]);

  // Sync external changes (like live streaming) to the editor
  useEffect(() => {
    if (editor && documentContent) {
      try {
        let htmlContent = documentContent;
        if (documentContent === 'Thinking...') {
          htmlContent = '<p class="text-gray-400 italic">Thinking...</p>';
        } else {
          htmlContent = marked.parse(stripPageMarkers(documentContent), { breaks: true, gfm: true }) as string;
        }
        if (editor.getHTML() !== htmlContent) {
          editor.commands.setContent(htmlContent, { emitUpdate: false });
          scheduleDetect();
          setTimeout(() => collectCitationsRef.current?.(editor), 550);
        }
      } catch (e) {
        console.error("Markdown parse error", e);
      }
    }
  }, [documentContent, editor]);

  // Detect citations once the editor is ready (covers content present at mount)
  useEffect(() => {
    if (!editor) return;
    const t = setTimeout(() => { detectCitationsRef.current?.(); collectCitationsRef.current?.(editor); }, 700);
    const onUp = () => scheduleDetect();
    editor.on('update', onUp);
    return () => { editor.off('update', onUp); clearTimeout(t); if (detectTimerRef.current) clearTimeout(detectTimerRef.current); };
  }, [editor]);

  // Recompute the CSL-formatted bibliography whenever citations or the chosen style change
  useEffect(() => {
    let cancelled = false;
    if (!citations.length || !citationStyleId) { setCslBib(null); return; }
    setCslBibLoading(true);
    formatBibliographyCSL(citations, citationStyleId)
      .then(entries => { if (!cancelled) { setCslBib(entries); setCslBibLoading(false); } })
      .catch(() => { if (!cancelled) { setCslBib(null); setCslBibLoading(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citations, citationStyleId]);

  // Render Mermaid graphs dynamically
  useEffect(() => {
    if (!editor || isEditing) return;
    const renderMermaid = async () => {
      try {
        // Tiptap places code blocks in pre > code. Find all language-mermaid elements
        const codeBlocks = document.querySelectorAll('.ProseMirror pre code.language-mermaid');
        for (let i = 0; i < codeBlocks.length; i++) {
          const block = codeBlocks[i];
          const pre = block.parentElement;
          if (pre && block.textContent && !pre.hasAttribute('data-mermaid-processed')) {
            const id = `mermaid-${Date.now()}-${i}`;
            pre.setAttribute('data-mermaid-processed', 'true');
            const { svg } = await mermaid.render(id, block.textContent);
            // Replace the pre element with a beautiful div containing the SVG
            const div = document.createElement('div');
            div.className = 'my-6 p-4 bg-[#1e1e1e] border border-[#333] rounded-xl flex justify-center shadow-lg';
            div.innerHTML = svg;
            pre.parentNode?.replaceChild(div, pre);
          }
        }
      } catch (e) {
        console.error("Mermaid rendering failed", e);
      }
    };
    
    // Slight delay to ensure DOM is updated by Tiptap
    const timeout = setTimeout(renderMermaid, 500);
    return () => clearTimeout(timeout);
  }, [documentContent, isEditing, editor?.getHTML()]);

  const [citationExpanded, setCitationExpanded] = useState(false);
  
  // Settings states
  const [publishYear, setPublishYear] = useState('All');
  const [customPublishYear, setCustomPublishYear] = useState('');
  const [impactFactor, setImpactFactor] = useState('All');
  const [externalSources, setExternalSources] = useState(true);
  const [pageNumbers, setPageNumbers] = useState(true);
  const [citationStyle, setCitationStyle] = useState('APA (7th ed.)');
  const [librarySources, setLibrarySources] = useState(true);
  const [limitCollection, setLimitCollection] = useState('All Sources');
  const [citedBy, setCitedBy] = useState('All');
  const [showClaimConfidenceSettings, setShowClaimConfidenceSettings] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  
  // Headings states
  const [headingsExpanded, setHeadingsExpanded] = useState(false);
  const [headingsOption, setHeadingsOption] = useState('Standard headings (IMRaD)');
  
  // Download state
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);

  const handleDownload = async (format: 'docx' | 'txt' | 'html' | 'pdf') => {
    setDownloadMenuOpen(false);
    
    if (format === 'pdf') {
      window.print();
      return;
    }
    
    if (format === 'docx') {
      try {
        const turndownService = new TurndownService();
        const markdown = turndownService.turndown(editor?.getHTML() || '');
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/export-docx`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown_text: markdown })
        });
        
        if (!response.ok) throw new Error('Failed to generate DOCX');
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${projectName || 'Research_Paper'}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Download failed", error);
        alert("Failed to download DOCX.");
      }
      return;
    }

    let contentToDownload = '';
    let mimeType = '';
    let extension = '';

    if (format === 'txt') {
      contentToDownload = editor?.getText() || '';
      mimeType = 'text/plain';
      extension = 'txt';
    } else if (format === 'html') {
      contentToDownload = editor?.getHTML() || '';
      mimeType = 'text/html';
      extension = 'html';
    }

    const blob = new Blob([contentToDownload], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName || 'Research_Paper'}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePromptNext = () => {
    setPromptExpanded(false);
    setCitationExpanded(true);
  };

  const handleCitationNext = () => {
    setCitationExpanded(false);
    setHeadingsExpanded(true);
  };

  // Citation Modal states
  const [showCitationModal, setShowCitationModal] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState('Accident Analysis and Prevention');
  const [selectedLocale, setSelectedLocale] = useState('Default (Style\'s locale)');
  const [previewMode, setPreviewMode] = useState<'Bibliography' | 'In-text'>('Bibliography');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Settings & User Dropup States
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [themeMounted, setThemeMounted] = useState(false);
  useEffect(() => { setThemeMounted(true); }, []);
  const currentTheme = theme === 'system' ? resolvedTheme : theme;

  const activeChat = chatHistory.find(c => c.id === activeChatId);
  const projectName = activeChat ? activeChat.title : '';

  const handleProjectNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setChatHistory(prev => prev.map(chat => 
      chat.id === activeChatId ? { ...chat, title: newName } : chat
    ));
  };

  const onStartWriting = () => {
    setIsEditing(true);

    const hasPrompt = !!(promptInput && promptInput.trim());
    const hasImported = !!(importedFileName && documentContent && documentContent.trim());

    // Only generate a new document with AI when the user actually typed a prompt.
    if (hasPrompt) {
      const prompt = `Topic/Prompt: ${promptInput}
Project Name: ${projectName || 'Untitled'}
Publish Year Constraints: ${publishYear === 'Custom' ? customPublishYear || 'Not specified' : publishYear}
Impact Factor: ${impactFactor}
Citation Style: ${citationStyle}
Include External Web Sources: ${externalSources ? 'Yes' : 'No'}
Headings Preference: ${headingsOption}
Do NOT insert any page markers, page breaks or "_Page N_" text anywhere in the document.
MANDATORY: You MUST include realistic scholarly inline citations at the end of every claim or paragraph using the requested citation style!`;
      if (handleGenerateDocument) handleGenerateDocument(prompt);
    } else if (hasImported) {
      // An uploaded document is present: open it for editing as-is (no AI generation).
      if (editor) editor.commands.setContent(marked.parse(stripPageMarkers(documentContent), { breaks: true, gfm: true }) as string, { emitUpdate: false });
    } else {
      // Nothing provided: start a blank document for manual writing.
      setDocumentContent('');
      if (editor) editor.commands.setContent('<p></p>', { emitUpdate: false });
    }
  };

  return (
    <div className="flex w-full h-full bg-[#111111] text-gray-200 font-sans overflow-hidden">
      
      {/* 1. LEFT SECTION */}
      <div className="w-[260px] bg-[#2d2d2d] border-r border-[#3d3d3d] flex flex-col shrink-0 h-full">
        <div className="p-4 flex flex-col gap-4 h-full">
          
          <div className="flex flex-col gap-2">
            {/* Home Button */}
            <button 
              onClick={handleGoHome}
              className="flex items-center gap-2 w-full hover:bg-[#3d3d3d] text-gray-300 hover:text-white px-4 py-3 rounded-lg text-[14px] font-semibold transition-colors"
            >
              <Home className="w-4 h-4" />
              Home
            </button>

            {/* New Chat Button */}
            <button 
              onClick={() => {
                const newId = chatHistory.length > 0 ? Math.max(...chatHistory.map((c: any) => c.id)) + 1 : 1;
                const newChat = { id: newId, title: 'New Project', date: 'Today', content: '', isEditing: false };
                setChatHistory([newChat, ...chatHistory]);
                setActiveChatId(newId);
                setIsEditing(false);
                setDocumentContent('');
                setPromptInput('');
                setPromptExpanded(true);
                setCitationExpanded(false);
                setHeadingsExpanded(false);
                if (editor) {
                  editor.commands.setContent('<p class="text-gray-400">Start writing or type / for commands</p>', { emitUpdate: false });
                }
                setPromptInput('');
              }}
              className="flex items-center gap-2 w-full bg-[#3d3d3d] hover:bg-[#4d4d4d] text-gray-200 px-4 py-3 rounded-lg text-[14px] font-semibold transition-colors border border-[#444] hover:border-[#555]"
            >
              <Plus className="w-4 h-4" />
              New chat
            </button>

            {/* Clear Chat Button */}
            <button 
              onClick={() => {
                if (selectedChats.length > 0) {
                  const updatedHistory = chatHistory.filter((c: any) => !selectedChats.includes(c.id));
                  saveChats(updatedHistory);
                  setSelectedChats([]);
                  if (activeChatId && selectedChats.includes(activeChatId)) {
                    if (updatedHistory.length > 0) {
                      setActiveChatId(updatedHistory[0].id);
                      setDocumentContent(updatedHistory[0].content || '');
                    } else {
                      handleGoHome();
                    }
                  }
                } else {
                  if (confirm("Are you sure you want to clear all chats?")) {
                    saveChats([]);
                    setSelectedChats([]);
                    handleGoHome();
                  }
                }
              }}
              className="flex items-center gap-2 w-full hover:bg-[#3d3d3d] text-gray-400 hover:text-red-400 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              {selectedChats.length > 0 ? `Delete ${selectedChats.length} selected` : 'Clear all chats'}
            </button>
          </div>

          {/* Chat History Section */}
          <div className="flex flex-col gap-2 mt-4 flex-1 overflow-y-auto custom-scrollbar">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 mb-2">Chat History</h3>

            {/* Search */}
            <div className="relative px-1 mb-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
                placeholder="Search chats"
                className="w-full bg-[#222] border border-[#3d3d3d] rounded-lg pl-8 pr-2 py-1.5 text-[12px] text-gray-200 placeholder:text-gray-500 outline-none focus:border-[#5b5fff] transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              {(() => {
                const ordered = [...chatHistory].sort((a: any, b: any) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
                const filtered = ordered.filter((c: any) => (c.title || 'Untitled').toLowerCase().includes(chatSearch.toLowerCase()));
                if (filtered.length === 0) {
                  return <p className="text-[12px] text-gray-500 px-2 py-3 text-center">{chatSearch ? 'No matching chats.' : 'No chats yet.'}</p>;
                }
                const reorderable = !chatSearch;
                return filtered.map((chat: any) => (
                <div
                  key={chat.id}
                  onClick={() => {
                    if (editingChatId === chat.id) return;
                    setActiveChatId(chat.id);
                    setDocumentContent(chat.content || '');
                    setIsEditing(chat.isEditing || false);
                    if (editor) {
                      editor.commands.setContent(chat.content || '<p class="text-gray-400">Start writing or type / for commands</p>', { emitUpdate: false });
                    }
                  }}
                  className={`flex items-center justify-between gap-2 w-full text-left px-2 py-2.5 rounded-lg transition-colors group cursor-pointer ${activeChatId === chat.id ? 'bg-[#3d3d3d]' : 'hover:bg-[#3d3d3d]'}`}
                >
                  <div className="flex items-center gap-2 overflow-hidden flex-1">
                    <input
                      type="checkbox"
                      checked={selectedChats.includes(chat.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        if (e.target.checked) {
                          setSelectedChats([...selectedChats, chat.id]);
                        } else {
                          setSelectedChats(selectedChats.filter(id => id !== chat.id));
                        }
                      }}
                      className="w-3.5 h-3.5 shrink-0 rounded border-gray-500 bg-transparent accent-[#5b5fff] cursor-pointer"
                    />
                    {chat.pinned
                      ? <Star className="w-4 h-4 shrink-0 text-amber-400 fill-amber-400" />
                      : <MessageSquare className={`w-4 h-4 shrink-0 ${activeChatId === chat.id ? 'text-gray-200' : 'text-gray-400 group-hover:text-gray-300'}`} />}
                    <div className="flex flex-col overflow-hidden flex-1">
                      {editingChatId === chat.id ? (
                        <input
                          autoFocus
                          value={editingTitle}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onBlur={() => { renameChat(chat.id, editingTitle); setEditingChatId(null); }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { renameChat(chat.id, editingTitle); setEditingChatId(null); }
                            if (e.key === 'Escape') setEditingChatId(null);
                          }}
                          className="bg-[#1a1a1a] border border-[#5b5fff] rounded px-1.5 py-0.5 text-sm text-white outline-none w-full"
                        />
                      ) : (
                        <span
                          onDoubleClick={(e) => { e.stopPropagation(); setEditingChatId(chat.id); setEditingTitle(chat.title || ''); }}
                          title="Double-click to rename"
                          className={`text-sm truncate ${activeChatId === chat.id ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}
                        >{chat.title || 'Untitled'}</span>
                      )}
                      <span className="text-[10px] text-gray-400">{chat.date}</span>
                    </div>
                  </div>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-all shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); togglePinChat(chat.id); }} className={`p-1 hover:bg-black/10 dark:hover:bg-[#555] rounded ${chat.pinned ? 'text-amber-500 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400 hover:text-amber-500'}`} title={chat.pinned ? 'Unpin' : 'Pin to top'}>
                      <Star className={`w-3.5 h-3.5 ${chat.pinned ? 'fill-current' : ''}`} />
                    </button>
                    {reorderable && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); moveChat(chat.id, 'up'); }} className="p-1 hover:bg-black/10 dark:hover:bg-[#555] rounded text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white" title="Move up">
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); moveChat(chat.id, 'down'); }} className="p-1 hover:bg-black/10 dark:hover:bg-[#555] rounded text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white" title="Move down">
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setEditingChatId(chat.id); setEditingTitle(chat.title || ''); }} className="p-1 hover:bg-black/10 dark:hover:bg-[#555] rounded text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white" title="Rename">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }} className="p-1 hover:bg-black/10 dark:hover:bg-[#555] rounded text-gray-600 dark:text-gray-400 hover:text-red-500" title="Delete chat">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                ));
              })()}
            </div>
          </div>

          {/* User Profile Section */}
          <div className="pt-4 mt-auto mb-[60px] relative">
            
            {/* Dropup Menu */}
            {userMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-full bg-[#111] border border-[#222] rounded-xl shadow-[0_0_20px_rgba(0,0,0,0.5)] overflow-hidden z-50 py-1">
                <div className="flex flex-col">

                  <div className="px-4 py-2.5 flex items-center justify-between">
                    <span className="text-[13px] font-bold text-[#7fa3ff]">Preferences</span>
                    <Settings2 className="w-4 h-4 text-gray-500" />
                  </div>

                  <div className="h-[1px] bg-[#222] my-1"></div>

                  <div className="px-4 py-3">
                    <div className="text-[12px] font-medium text-gray-400 mb-2">Theme</div>
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); setTheme('dark'); }}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] font-bold border transition-colors ${themeMounted && currentTheme === 'dark' ? 'bg-[#5b5fff] border-[#5b5fff] text-white' : 'border-[#333] text-gray-300 hover:bg-[#1a1a1a]'}`}
                      >
                        <Moon className="w-4 h-4" /> Dark
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setTheme('light'); }}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] font-bold border transition-colors ${themeMounted && currentTheme === 'light' ? 'bg-[#5b5fff] border-[#5b5fff] text-white' : 'border-[#333] text-gray-300 hover:bg-[#1a1a1a]'}`}
                      >
                        <Sun className="w-4 h-4" /> Light
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            )}

            <div 
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center justify-between w-full bg-[#464eb8] hover:bg-[#5259c9] px-4 py-3.5 rounded-xl transition-colors cursor-pointer shadow-sm group"
            >
              <span className="text-[15px] font-bold text-white font-serif tracking-wide ml-1">Zeeshan</span>
              <ChevronUp className={`w-4 h-4 text-white/80 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>

        </div>
      </div>

      {/* 2. MIDDLE SECTION */}
      <div className="flex-1 bg-[#161616] flex flex-col border-r border-[#2a2a2a] relative">
        
        {/* Top Toolbar */}
        <div className="flex flex-col border-b border-[#2a2a2a] bg-[#161616]">
          {/* Header Row */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#2a2a2a]">
            <div className="text-[14px] text-gray-400 font-medium truncate w-32">{projectName || 'Untitled'}</div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors text-[13px] font-bold">
                <Users className="w-4 h-4" /> Share
              </button>
              <button className="bg-[#5b5fff] hover:bg-[#6b6fff] text-white px-3 py-1.5 rounded flex items-center gap-2 text-[13px] font-bold transition-colors">
                <Star className="w-3.5 h-3.5" /> See Pricing
              </button>
              <button onClick={() => setShowClaimConfidenceSettings(true)} className="text-gray-400 hover:text-white transition-colors">
                <SlidersHorizontal className="w-4 h-4" />
              </button>
              {!isRightPanelOpen && (
                <div className="border-l border-[#333] pl-3 ml-1 flex items-center">
                  <button onClick={() => setIsRightPanelOpen(true)} className="flex items-center gap-1.5 text-white font-bold hover:text-gray-300 transition-colors text-[14px]">
                    <ChevronsLeft className="w-4 h-4" /> Review
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Format Toolbar Row */}
          <div className="flex items-center px-4 py-2 gap-4 text-gray-400 text-[13px]">
             <div className="flex items-center gap-3 border-r border-[#333] pr-4">
                <button onClick={() => editor?.chain().focus().undo().run()} className="hover:text-white transition-colors" title="Undo">↩</button>
                <button onClick={() => editor?.chain().focus().redo().run()} className="hover:text-white transition-colors" title="Redo">↪</button>
                <button onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`flex items-center gap-1 hover:text-white transition-colors ${editor?.isActive('heading', { level: 2 }) ? 'text-white' : ''}`} title="Heading"><Type className="w-3 h-3" /> Text</button>
             </div>
             <div className="flex items-center gap-3 border-r border-[#333] pr-4">
                <button onClick={() => editor?.chain().focus().toggleBold().run()} className={`font-serif hover:text-white transition-colors ${editor?.isActive('bold') ? 'text-white' : ''}`} title="Bold"><b>B</b></button>
                <button onClick={() => editor?.chain().focus().toggleItalic().run()} className={`font-serif hover:text-white transition-colors ${editor?.isActive('italic') ? 'text-white' : ''}`} title="Italic"><i>I</i></button>
                <button onClick={() => editor?.chain().focus().toggleUnderline().run()} className={`font-serif hover:text-white transition-colors ${editor?.isActive('underline') ? 'text-white' : ''}`} title="Underline"><u>U</u></button>
                <button onClick={() => editor?.chain().focus().toggleStrike().run()} className={`font-serif hover:text-white transition-colors ${editor?.isActive('strike') ? 'text-white' : ''}`} title="Strikethrough"><s>S</s></button>
                <button onClick={() => editor?.chain().focus().toggleCode().run()} className={`hover:text-white transition-colors ${editor?.isActive('code') ? 'text-white' : ''}`} title="Inline code">{'<>'}</button>
                <button onClick={() => editor?.chain().focus().toggleSuperscript().run()} className={`hover:text-white transition-colors ${editor?.isActive('superscript') ? 'text-white' : ''}`} title="Superscript">x²</button>
                <button onClick={() => editor?.chain().focus().toggleSubscript().run()} className={`hover:text-white transition-colors ${editor?.isActive('subscript') ? 'text-white' : ''}`} title="Subscript">x₂</button>
             </div>
             <div className="flex items-center gap-3 border-r border-[#333] pr-4">
                <button onClick={() => { const url = window.prompt('Enter URL (leave blank to remove link)'); if (url) { editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run(); } else { editor?.chain().focus().unsetLink().run(); } }} className={`hover:text-white transition-colors ${editor?.isActive('link') ? 'text-white' : ''}`} title="Add / remove link">🔗</button>
                <button onClick={() => editor?.chain().focus().unsetAllMarks().run()} className="hover:text-white transition-colors" title="Clear formatting">🖊️</button>
             </div>
             <div className="flex items-center gap-3 border-r border-[#333] pr-4 relative">
                <button onClick={() => setDownloadMenuOpen(!downloadMenuOpen)} className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer text-[#6d93e8] font-bold">
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                {downloadMenuOpen && (
                  <div className="absolute top-full left-0 mt-2 w-40 bg-[#1a1a1a] border border-[#333] rounded-lg shadow-lg overflow-hidden z-50 flex flex-col">
                    <button onClick={() => handleDownload('docx')} className="w-full text-left px-4 py-2 hover:bg-[#222] transition-colors text-white font-medium text-[13px] border-b border-[#333]">Word (.docx)</button>
                    <button onClick={() => handleDownload('pdf')} className="w-full text-left px-4 py-2 hover:bg-[#222] transition-colors text-white font-medium text-[13px] border-b border-[#333]">PDF (.pdf)</button>
                    <button onClick={() => handleDownload('txt')} className="w-full text-left px-4 py-2 hover:bg-[#222] transition-colors text-white font-medium text-[13px] border-b border-[#333]">Plain Text (.txt)</button>
                    <button onClick={() => handleDownload('html')} className="w-full text-left px-4 py-2 hover:bg-[#222] transition-colors text-white font-medium text-[13px]">HTML (.html)</button>
                  </div>
                )}
             </div>
             <div className="flex items-center gap-3 border-r border-[#333] pr-4">
                <button onClick={() => { setShowCiteSearch(true); }} className="hover:text-white transition-colors" title="Search & insert a citation">@ Cite</button>
             </div>
             <div className="flex items-center gap-3 border-r border-[#333] pr-4">
                <button onClick={() => imageInputRef.current?.click()} className="hover:text-white transition-colors" title="Insert image from your computer">🖼️</button>
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFileSelected} />
                <button onClick={handleInsertChart} className="hover:text-white transition-colors" title="Insert chart (bar / line / pie / doughnut)">📊</button>
                <button onClick={() => handleInsertEquation(true)} className="hover:text-white transition-colors" title="Insert inline math (LaTeX)">[x]</button>
                <button onClick={() => handleInsertEquation(false)} className="hover:text-white transition-colors" title="Insert equation (LaTeX)">∑</button>
             </div>
             <button
                onClick={() => {
                  const next = !autocompleteOn;
                  setAutocompleteOn(next);
                  if (!next && editor) {
                    const st = autocompleteKey.getState(editor.state);
                    if (st && st.text) editor.view.dispatch(editor.state.tr.setMeta(autocompleteKey, ''));
                  }
                }}
                className="flex items-center gap-2 ml-auto"
                title={autocompleteOn ? 'AI autocomplete on (type, pause, then press Tab to accept)' : 'AI autocomplete off'}
             >
                <Check className={`w-3 h-3 ${autocompleteOn ? 'text-[#5b5fff]' : 'text-gray-600'}`} />
                <span className="text-gray-300 font-bold">Autocomplete</span>
                <div className={`w-8 h-4 rounded-full relative transition-colors ${autocompleteOn ? 'bg-[#5b5fff]' : 'bg-[#444]'}`}>
                   <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all ${autocompleteOn ? 'right-0.5' : 'left-0.5'}`}></div>
                </div>
             </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
          {!isEditing ? (
            <div className="w-full max-w-3xl mx-auto mt-10 px-10 flex flex-col gap-4 pb-20">
              
              {/* Section 1: Project Name */}
              <input 
                type="text" 
                value={projectName}
                onChange={handleProjectNameChange}
                placeholder="Untitled" 
                className="w-full text-3xl font-bold bg-transparent border-none outline-none text-gray-100 placeholder:text-gray-400 mb-6 font-sans"
              />

              {/* Section 2: Fill Document Prompt */}
              <div className={`rounded-xl border border-[#2a2a2a] overflow-hidden transition-all duration-300 bg-[#161616]`}>
                {promptExpanded ? (
                  <>
                    <div className="px-4 py-3 flex items-center justify-between cursor-pointer" onClick={() => setPromptExpanded(false)}>
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full border-2 border-[#333]" />
                        <span className="text-[14px] font-bold text-gray-200">Fill document prompt</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-500 rotate-90" />
                    </div>
                    
                    <div className="px-4 pb-4 flex flex-col">
                      <textarea 
                        value={promptInput}
                        onChange={(e) => setPromptInput(e.target.value)}
                        placeholder="E.g., A research paper on the effects of climate change on marine biodiversity"
                        className="w-full h-[88px] bg-transparent border border-[#333] rounded-lg outline-none resize-none text-[14px] text-gray-300 placeholder:text-gray-500 p-3 focus:border-[#444]"
                      />
                      
                      <div className="mt-3 text-[13px] text-gray-200 font-bold">
                        Weak prompt: <span className="text-gray-400 font-normal">Add more context for higher quality generations</span>
                      </div>
                      
                      <div className="flex items-center justify-center gap-4 my-4 relative">
                        <div className="absolute left-0 right-0 h-[1px] bg-[#2a2a2a]"></div>
                        <span className="text-[12px] text-gray-400 bg-[#161616] px-3 relative z-10">or also</span>
                      </div>
                      
                      <label className="rounded-lg bg-[#222] border border-[#2a2a2a] hover:bg-[#2a2a2a] transition-colors cursor-pointer flex items-center justify-between p-3 relative">
                        <input type="file" accept=".docx,.pdf,.md,.txt" onChange={handleDocumentImport} disabled={uploadingDoc || localUploadingDoc} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded bg-[#2b579a] flex items-center justify-center text-white font-bold text-[11px]">W</div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[13px] font-bold text-gray-200">{uploadingDoc || localUploadingDoc ? 'Uploading...' : 'Import from Word (.docx)'}</span>
                            <span className="text-[12px] text-gray-400">Import your work and improve it with AI</span>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                      </label>

                      {importedFileName && (
                        <div className="mt-3 p-3 rounded-lg bg-[#1a1a1a] border border-[#333] flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-[#10b981]" />
                            <span className="text-[13px] text-gray-200">{importedFileName}</span>
                          </div>
                          <button onClick={() => { setImportedFileName(''); setDocumentContent(''); }} className="text-gray-500 hover:text-red-400">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-4">
                        <button onClick={handlePromptNext} className="text-[14px] text-gray-300 font-bold hover:text-white transition-colors">Skip</button>
                        <button onClick={handlePromptNext} className="bg-[#464eb8] hover:bg-[#5259c9] text-white px-5 py-2 rounded-lg text-[13px] font-bold transition-colors shadow-sm">Next</button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div onClick={() => setPromptExpanded(true)} className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[#1a1a1a] transition-colors">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-4 h-4 text-[#10b981]" />
                      <span className="text-[14px] font-bold text-gray-200">Fill document prompt</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </div>
                )}
              </div>

              {/* Section 3: Citation Settings */}
              <div className={`rounded-xl border border-[#2a2a2a] overflow-hidden transition-all duration-300 bg-[#161616]`}>
                {citationExpanded ? (
                  <>
                    <div className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[#1a1a1a] transition-colors" onClick={() => setCitationExpanded(false)}>
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full border-2 border-[#333]" />
                        <span className="text-[14px] font-bold text-gray-200">Citation settings</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-500 rotate-90" />
                    </div>
                    <div className="p-4 flex flex-col gap-6 border-t border-[#2a2a2a]">
                      
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] font-bold text-white">Publish year</span>
                        <div className="flex gap-1 items-center">
                          <button onClick={() => setPublishYear('All')} className={`px-3 py-1.5 rounded-md text-[13px] font-bold transition-colors ${publishYear === 'All' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>All</button>
                          <button onClick={() => setPublishYear('Last 5 years')} className={`px-3 py-1.5 rounded-md text-[13px] font-bold transition-colors ${publishYear === 'Last 5 years' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>Last 5 years</button>
                          <button onClick={() => setPublishYear('Custom')} className={`px-3 py-1.5 rounded-md text-[13px] font-bold transition-colors ${publishYear === 'Custom' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>Custom</button>
                          {publishYear === 'Custom' && (
                            <input 
                              type="text" 
                              value={customPublishYear}
                              onChange={(e) => setCustomPublishYear(e.target.value)}
                              placeholder="e.g. 2010-2020" 
                              className="ml-2 px-3 py-1.5 bg-[#1a1a1a] text-white rounded-md border border-[#333] outline-none text-[13px] w-28 placeholder:text-gray-500 transition-colors focus:border-[#464eb8]" 
                            />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[14px] font-bold text-white">Impact Factor</span>
                        <div className="flex gap-1">
                          <button onClick={() => setImpactFactor('All')} className={`px-3 py-1.5 rounded-md text-[13px] font-bold transition-colors ${impactFactor === 'All' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>All</button>
                          <button onClick={() => setImpactFactor('0.25+')} className={`px-3 py-1.5 rounded-md text-[13px] font-bold transition-colors ${impactFactor === '0.25+' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>0.25+</button>
                          <button onClick={() => setImpactFactor('3+')} className={`px-3 py-1.5 rounded-md text-[13px] font-bold transition-colors ${impactFactor === '3+' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>3+</button>
                          <button onClick={() => setImpactFactor('10+')} className={`px-3 py-1.5 rounded-md text-[13px] font-bold transition-colors ${impactFactor === '10+' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>10+</button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <span className="text-[14px] font-bold text-white">Consider external sources</span>
                          <span className="text-[13px] text-gray-500">Jenni will consider sources from the web</span>
                        </div>
                        <div onClick={() => setExternalSources(!externalSources)} className={`w-[42px] h-[24px] rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${externalSources ? 'bg-[#5b5fff]' : 'bg-[#3d3d3d]'}`}>
                          <div className={`w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform ${externalSources ? 'translate-x-[20px]' : 'translate-x-0'}`} />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <span className="text-[14px] font-bold text-white">Consider library sources</span>
                          <span className="text-[13px] text-gray-500">Upload PDFs to chat with, cite from or provide context to AI</span>
                        </div>
                        <button onClick={() => setShowUploadModal(true)} className="px-3 py-1.5 border border-[#444] rounded-lg text-[13px] font-bold text-gray-200 flex items-center gap-2 hover:bg-[#2d2d2d] transition-colors cursor-pointer bg-transparent">
                          <Upload className="w-3.5 h-3.5" /> Add sources
                        </button>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <span className="text-[14px] font-bold text-white">Limit to a collection</span>
                          <span className="text-[13px] text-gray-500">Jenni will focus on sources from this collection</span>
                        </div>
                        <div className="px-4 py-2.5 border border-[#444] rounded-lg text-[14px] font-bold text-gray-400 flex items-center justify-between gap-4 w-[240px] bg-[#1a1a1a] cursor-pointer">
                          <span>All Sources</span>
                          <ChevronRight className="w-4 h-4 rotate-90 text-gray-500" />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[14px] font-bold text-white">Citation Style</span>
                        <div onClick={() => { setShowCitationModal(true); loadStyleIndex(); }} className="px-4 py-2.5 border border-[#444] rounded-lg text-[14px] font-bold text-gray-200 flex items-center justify-between gap-4 w-[300px] bg-[#1a1a1a] cursor-pointer hover:bg-[#222] transition-colors">
                          <span className="truncate">{citationStyle}</span>
                          <ChevronRight className="w-4 h-4 rotate-90 text-gray-500 shrink-0" />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[14px] font-bold text-white">Show page number in citations</span>
                        <div onClick={() => setPageNumbers(!pageNumbers)} className={`w-[42px] h-[24px] rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${pageNumbers ? 'bg-[#5b5fff]' : 'bg-[#3d3d3d]'}`}>
                          <div className={`w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform ${pageNumbers ? 'translate-x-[20px]' : 'translate-x-0'}`} />
                        </div>
                      </div>

                      <div className="flex justify-end mt-4">
                         <button onClick={handleCitationNext} className="bg-[#464eb8] hover:bg-[#5259c9] text-white px-6 py-2.5 rounded-lg text-[15px] font-bold transition-colors shadow-sm">Next</button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div onClick={() => setCitationExpanded(true)} className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[#1a1a1a] transition-colors">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-4 h-4 text-[#10b981]" />
                      <span className="text-[14px] font-bold text-gray-200">Citation settings</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </div>
                )}
              </div>

              {/* Section 4: Generate Headings */}
              <div className={`rounded-xl border border-[#2a2a2a] overflow-hidden transition-all duration-300 bg-[#161616]`}>
                {headingsExpanded ? (
                  <>
                    <div className="px-4 py-3 flex items-center justify-between cursor-pointer" onClick={() => setHeadingsExpanded(false)}>
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full border-2 border-[#333]" />
                        <span className="text-[14px] font-bold text-gray-200">Generate Headings</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-500 rotate-90" />
                    </div>
                    
                    <div className="p-4 flex flex-col gap-3 border-t border-[#2a2a2a]">
                      <span className="text-[14px] font-bold text-gray-200 mb-2">Generate outline</span>
                      
                      {/* Option 1 */}
                      <div 
                        onClick={() => setHeadingsOption('Standard headings (IMRaD)')}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors flex items-start gap-4 ${headingsOption === 'Standard headings (IMRaD)' ? 'bg-[#1b1c3a] border-[#5b5fff]' : 'bg-[#1a1a1a] border-[#2a2a2a] hover:bg-[#222]'}`}
                      >
                        <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center ${headingsOption === 'Standard headings (IMRaD)' ? 'border-[#5b5fff]' : 'border-[#444]'}`}>
                          {headingsOption === 'Standard headings (IMRaD)' && <div className="w-2 h-2 bg-[#5b5fff] rounded-full" />}
                        </div>
                        <div className="w-8 h-10 bg-white rounded flex flex-col gap-1.5 items-center justify-center px-1">
                           <div className="w-full h-0.5 bg-gray-300"></div>
                           <div className="w-full h-0.5 bg-gray-300"></div>
                           <div className="w-full h-0.5 bg-gray-300"></div>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[14px] font-bold text-white">Standard headings (IMRaD)</span>
                          <span className="text-[13px] text-gray-400">Add standard headings (Introduction, Methods, Results etc.)</span>
                        </div>
                      </div>

                      {/* Option 2 */}
                      <div 
                        onClick={() => setHeadingsOption('Smart headings')}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors flex items-start gap-4 ${headingsOption === 'Smart headings' ? 'bg-[#1b1c3a] border-[#5b5fff]' : 'bg-[#1a1a1a] border-[#2a2a2a] hover:bg-[#222]'}`}
                      >
                        <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center ${headingsOption === 'Smart headings' ? 'border-[#5b5fff]' : 'border-[#444]'}`}>
                          {headingsOption === 'Smart headings' && <div className="w-2 h-2 bg-[#5b5fff] rounded-full" />}
                        </div>
                        <div className="w-8 h-10 bg-white rounded flex flex-col gap-1.5 items-center justify-center px-1 relative">
                           <Star className="w-3 h-3 text-[#5b5fff] absolute -top-2 -right-2 fill-[#5b5fff]" />
                           <div className="w-full h-0.5 bg-gray-300"></div>
                           <div className="w-full h-0.5 bg-gray-300"></div>
                           <div className="w-full h-0.5 bg-gray-300"></div>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[14px] font-bold text-white">Smart headings</span>
                          <span className="text-[13px] text-gray-400">AI will generate headings based on your document prompt</span>
                        </div>
                      </div>

                      {/* Option 3 */}
                      <div 
                        onClick={() => setHeadingsOption('No headings')}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors flex items-start gap-4 ${headingsOption === 'No headings' ? 'bg-[#1b1c3a] border-[#5b5fff]' : 'bg-[#1a1a1a] border-[#2a2a2a] hover:bg-[#222]'}`}
                      >
                        <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center ${headingsOption === 'No headings' ? 'border-[#5b5fff]' : 'border-[#444]'}`}>
                          {headingsOption === 'No headings' && <div className="w-2 h-2 bg-[#5b5fff] rounded-full" />}
                        </div>
                        <div className="w-8 h-10 bg-white rounded flex flex-col gap-1.5 items-center justify-center px-1">
                           <div className="w-full h-0.5 bg-gray-300"></div>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[14px] font-bold text-white">No headings</span>
                          <span className="text-[13px] text-gray-400">Start with a blank document</span>
                        </div>
                      </div>

                      <div className="flex justify-end mt-4">
                         <button onClick={onStartWriting} className="bg-[#5b5fff] hover:bg-[#6b6fff] text-white px-6 py-2.5 rounded-lg text-[15px] font-bold transition-colors shadow-sm">Start Writing</button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div onClick={() => setHeadingsExpanded(true)} className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[#1a1a1a] transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full border-2 border-[#333]" />
                      <span className="text-[14px] font-bold text-gray-200">Generate Headings</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </div>
                )}
              </div>
              <div className="flex justify-center mt-2">
                <button onClick={onStartWriting} className="text-[14px] font-bold text-gray-400 hover:text-white transition-colors">Skip and start writing</button>
              </div>

              {/* Section 4: Explore Grid */}
              <div className="mt-4 flex flex-col gap-3">
                <h3 className="text-[14px] font-bold text-gray-300">Explore</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-[#222] p-4 flex flex-col gap-2 hover:bg-[#2a2a2a] transition-colors cursor-pointer border border-[#2a2a2a]">
                     <MessageSquare className="w-5 h-5 text-gray-300" />
                     <h4 className="text-[14px] font-bold text-gray-200">Chat with AI</h4>
                     <p className="text-[12px] text-gray-500 leading-relaxed">Discover papers, brainstorm ideas or write a draft</p>
                  </div>
                  <button type="button" onClick={() => setShowUploadModal(true)} className="text-left rounded-xl bg-[#222] p-4 flex flex-col gap-2 hover:bg-[#2a2a2a] transition-colors cursor-pointer border border-[#2a2a2a] relative">
                     <Upload className="w-5 h-5 text-gray-300" />
                     <h4 className="text-[14px] font-bold text-gray-200">Upload Sources</h4>
                     <p className="text-[12px] text-gray-500 leading-relaxed">Upload PDFs, or import from Zotero, Mendeley or by DOI/PMID/arXiv</p>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full min-h-full p-10 bg-white text-black pb-32 relative print-area" onClick={handleEditorClick} onMouseOver={handleCitationHover} onMouseOut={handleCitationHoverOut}>
              <input 
                type="text" 
                value={projectName}
                onChange={handleProjectNameChange}
                placeholder="Untitled Document" 
                className="w-full max-w-4xl mx-auto block text-4xl font-bold bg-transparent border-none outline-none text-black placeholder:text-gray-300 mb-8 font-sans"
              />
              <div className="max-w-4xl mx-auto">
                <div className="flex flex-wrap items-center gap-2 mb-4 not-prose">
                  {[['improve','Improve'],['paraphrase','Paraphrase'],['expand','Expand'],['shorten','Shorten'],['simplify','Simplify']].map(([action,label]) => (
                    <button key={action} onClick={() => handleInlineAi(action)} disabled={inlineAiBusy} className="px-3 py-1.5 text-[12px] font-semibold rounded-full border border-gray-300 bg-gray-50 text-gray-700 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50 transition-colors">{inlineAiBusy ? '...' : label}</button>
                  ))}
                  <button onClick={handleGenerateOutline} disabled={inlineAiBusy} className="px-3 py-1.5 text-[12px] font-semibold rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors">Generate outline</button>
                  <button onClick={() => { setShowCitationModal(true); loadStyleIndex(); }} title="Choose from 2,600+ citation styles" className="px-3 py-1.5 text-[12px] font-semibold rounded-full border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 flex items-center gap-1.5 transition-colors">
                    <span className="max-w-[140px] truncate">{citationStyle}</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={handleApplyCitationStyle} disabled={inlineAiBusy} className="px-3 py-1.5 text-[12px] font-semibold rounded-full border border-gray-300 bg-gray-50 text-gray-700 hover:bg-indigo-50 disabled:opacity-50 transition-colors">Apply citation style</button>
                  <button onClick={() => setChatPdfOpen(true)} className="px-3 py-1.5 text-[12px] font-semibold rounded-full border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">Ask your library</button>
                  <button onClick={() => { detectCitations(); setTimeout(() => editor && collectCitations(editor), 100); }} className="px-3 py-1.5 text-[12px] font-semibold rounded-full border border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors" title="Find plain-text citations and make them hoverable + add to references">Detect citations</button>
                  <button onClick={handleSuggestCitations} disabled={suggestLoading} className="px-3 py-1.5 text-[12px] font-semibold rounded-full border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors" title="AI finds claims that need a citation and suggests real papers">{suggestLoading ? 'Finding…' : '✨ Suggest citations'}</button>
                  <span className="text-[11px] text-gray-400">Select text, then pick an action</span>
                </div>
                <EditorContent editor={editor} />

                {citations.length > 0 && (
                  <div className="mt-10 pt-6 border-t-2 border-gray-200 not-prose">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-2xl font-bold text-black flex items-center gap-2">References <span className="text-gray-400 text-base font-normal">({citations.length} · {citationStyle})</span>{cslBibLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}</h2>
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setShowCitationModal(true); loadStyleIndex(); }} title="Choose from 2,600+ styles" className="px-3 py-1.5 text-[12px] font-semibold rounded-full border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors">Change style</button>
                        <button onClick={insertBibliography} title="Insert this list into the document" className="px-3 py-1.5 text-[12px] font-semibold rounded-full border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors">Insert into document</button>
                        <button onClick={() => { const txt = (cslBib && cslBib.length) ? cslBib.map(stripHtml).join('\n') : citations.map((c, i) => formatReference(c, citationStyle, i + 1)).join('\n'); navigator.clipboard?.writeText(txt); }} className="px-3 py-1.5 text-[12px] font-semibold rounded-full border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors">Copy all</button>
                      </div>
                    </div>
                    {cslBib && cslBib.length ? (
                      <div className="csl-bib flex flex-col gap-2 text-[14px] text-gray-800 leading-relaxed">
                        {cslBib.map((entry, i) => (
                          <div key={i} dangerouslySetInnerHTML={{ __html: entry }} />
                        ))}
                      </div>
                    ) : (
                      <ol className="flex flex-col gap-2 list-none pl-0">
                        {citations.map((c, i) => (
                          <li key={(c.doi || c.intext || '') + i} className="text-[14px] text-gray-800 leading-relaxed">
                            {formatReference(c, citationStyle, i + 1)}
                            {c.doi && (
                              <a href={`https://doi.org/${c.doi}`} target="_blank" rel="noreferrer" className="ml-1 text-indigo-600 hover:underline">↗</a>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </div>
              
              {/* Citation Popup (hover) - one card per reference */}
              {citationPopup.visible && (
                <div 
                  className="fixed z-[60] bg-[#252525] border border-[#333] rounded-xl shadow-2xl w-[440px] flex flex-col overflow-hidden"
                  style={{
                    top: Math.min(citationPopup.y + 8, (typeof window !== 'undefined' ? window.innerHeight : 800) - 420),
                    left: Math.max(12, Math.min(citationPopup.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 460)),
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseEnter={cancelHideCitation}
                  onMouseLeave={scheduleHideCitation}
                >
                  <div className="max-h-[52vh] overflow-y-auto custom-scrollbar divide-y divide-[#333]">
                    {citationMeta.loading ? (
                      <div className="flex items-center gap-2 text-gray-400 text-[13px] p-4">
                        <Loader2 className="w-4 h-4 animate-spin" /> Looking up citation…
                      </div>
                    ) : citationMeta.items.length === 0 ? (
                      <div className="p-4">
                        <h3 className="text-[15px] font-bold text-white leading-snug">{citationPopup.text}</h3>
                        <p className="text-[13px] text-gray-500 mt-1">No additional metadata found. Use “Refine” to search and attach the correct source.</p>
                      </div>
                    ) : (
                      citationMeta.items.map((it: any, idx: number) => (
                        it && it.none ? (
                          <div key={idx} className="p-4">
                            <h3 className="text-[14px] font-bold text-white leading-snug">{it.raw}</h3>
                            <p className="text-[12px] text-gray-500 mt-1">This looks like a report or non-indexed source. Use <span className="text-gray-300 font-semibold">Refine</span> to attach the exact reference.</p>
                          </div>
                        ) : (
                          <div key={idx} className="p-4 flex flex-col gap-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-gray-400 text-[11px] font-bold tracking-wide uppercase">{it.type || 'Article'}</span>
                              <div className="flex items-center gap-1.5">
                                {it.weak && <span className="bg-amber-500/20 text-amber-300 rounded px-2 py-0.5 text-[10px] font-bold">BEST GUESS</span>}
                                {it.citedBy != null && <span className="bg-[#333] rounded px-2 py-0.5 text-gray-300 text-[10px] font-bold">CITED BY {it.citedBy}</span>}
                                {it.isOA === true && <span className="bg-[#10b981]/20 text-[#34d399] rounded px-2 py-0.5 text-[10px] font-bold">OPEN ACCESS</span>}
                              </div>
                            </div>
                            <h3 className="text-[14px] font-bold text-white leading-snug">{it.title || citationPopup.text}</h3>
                            {it.authors && <p className="text-[12px] text-gray-400">{it.authors}</p>}
                            {it.container && (
                              <p className="text-[12px] text-[#10b981]">{it.container}{it.year && <span className="text-gray-500"> • {it.year}</span>}</p>
                            )}
                            {it.abstract && (
                              <div className="mt-1 bg-[#333]/50 rounded-lg p-2.5 text-[12px] text-gray-300 leading-relaxed border-l-2 border-[#5b5fff]">
                                {citeExpanded || !it.truncated
                                  ? it.abstract
                                  : <>{it.abstract}… <button onClick={() => setCiteExpanded(true)} className="text-white font-bold hover:underline">See more</button></>}
                              </div>
                            )}
                            {it.url && (
                              <a href={it.url} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-[12px] font-bold text-[#7fa3ff] hover:text-white w-fit">
                                <ChevronUp className="w-3.5 h-3.5 rotate-45" /> Open source
                              </a>
                            )}
                          </div>
                        )
                      ))
                    )}
                  </div>
                  <div className="px-4 py-3 bg-[#1e1e1e] border-t border-[#333] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => acceptCitationMeta(citationPopup.text, citationMeta.items)}
                        disabled={citationMeta.loading || !citationMeta.items.some((i: any) => i && !i.none)}
                        className="bg-[#5b5fff] hover:bg-[#6b6fff] disabled:opacity-40 text-white px-4 py-1.5 rounded-lg text-[13px] font-bold flex items-center gap-1.5 transition-colors">
                        Accept <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => refineCitation(citationPopup.text)}
                        className="border border-[#444] hover:bg-[#2a2a2a] text-white px-3 py-1.5 rounded-lg text-[13px] font-bold flex items-center gap-1.5 transition-colors">
                        <Sparkles className="w-3.5 h-3.5" /> Refine suggestion
                      </button>
                    </div>
                    <div className="flex items-center gap-2 text-gray-400">
                      <button onClick={() => acceptCitationMeta(citationPopup.text, citationMeta.items)} title="Looks right" className="hover:text-white"><ThumbsUp className="w-4 h-4" /></button>
                      <button onClick={() => setCitationPopup(prev => ({ ...prev, visible: false }))} title="Dismiss" className="hover:text-white"><ThumbsDown className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Floating Edit Bar */}
        {isEditing && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-[#1e1e1e] border border-[#333] rounded-2xl shadow-2xl p-2 flex items-center gap-3 z-50">
             <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center shadow-lg text-white font-bold text-xs shrink-0 ml-1">
               Ai
             </div>
             <input 
               type="text" 
               value={editInput}
               onChange={(e) => setEditInput(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && handleEditRequest()}
               disabled={loading}
               placeholder="Ask AI to write, edit, or summarize..." 
               className="flex-1 bg-transparent border-none outline-none text-gray-200 text-[14px] placeholder:text-gray-500 py-2"
             />
             <button 
               onClick={handleEditRequest}
               disabled={loading || !editInput.trim()}
               className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center transition-colors shrink-0 mr-1"
             >
               <ChevronRight className="w-4 h-4 text-white" />
             </button>
          </div>
        )}
      </div>


      {/* 3. RIGHT SECTION: Review Panel */}
      {isRightPanelOpen && (
        <div className="w-[340px] bg-[#1a1a1a] border-l border-[#2a2a2a] flex flex-col shrink-0 h-full transition-all duration-300">
        
        {/* Header */}
        <div className="px-5 py-5 flex items-center gap-3 border-b border-[#2a2a2a]">
          {activeReviewTab ? (
             <button onClick={() => setActiveReviewTab(null)} className="text-gray-400 hover:text-white transition-colors">
               <ChevronLeft className="w-5 h-5" />
             </button>
          ) : (
             <button onClick={() => setIsRightPanelOpen(false)} className="text-gray-400 hover:text-white transition-colors">
               <ChevronsRight className="w-5 h-5" />
             </button>
          )}
          <span className="font-bold text-white text-[15px]">
            {activeReviewTab === 'claim' ? 'Claim confidence' :
             activeReviewTab === 'analysis' ? 'Document Analysis' : 
             activeReviewTab === 'tone' ? 'Tone of Voice' : 
             activeReviewTab === 'proofread' ? 'Proofread' : 'Review'}
          </span>
          {activeReviewTab && (
             <div className="ml-auto flex items-center gap-2">
               {activeReviewTab === 'claim' && <button onClick={() => setShowClaimConfidenceSettings(true)} className="text-gray-400 hover:text-white"><SlidersHorizontal className="w-4 h-4" /></button>}
               <button onClick={() => {
                 setActiveReviewTab(null);
               }} className="w-6 h-6 border border-[#333] rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#2a2a2a]">
                 <RotateCcw className="w-3.5 h-3.5" />
               </button>
             </div>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">
           {!activeReviewTab && (
              <>
                 {/* Card 1: Claim confidence */}
                 <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-5 flex flex-col gap-3">
                   <div className="w-8 h-8 rounded-full bg-[#1b1c3a] flex items-center justify-center mb-1">
                     <Star className="w-4 h-4 text-[#7d84ff]" />
                   </div>
                   <h3 className="text-[15px] font-bold text-white">Claim confidence</h3>
                   <p className="text-[13px] text-gray-400 leading-relaxed">
                     Checks your writing, finds missing or weak citations, and adds references to help you avoid academic plagiarism
                   </p>
                   <div className="flex items-center gap-3 mt-2">
                     <button onClick={handleClaimConfidence} disabled={loading} className="flex items-center gap-2 border border-[#333] rounded-lg px-3 py-1.5 hover:bg-[#2a2a2a] transition-colors disabled:opacity-50">
                        <Play className="w-3.5 h-3.5 text-gray-300" />
                        <span className="text-[13px] font-bold text-white">Run review</span>
                     </button>
                     <button onClick={() => setShowClaimConfidenceSettings(true)} className="text-gray-400 hover:text-white transition-colors">
                       <SlidersHorizontal className="w-4 h-4" />
                     </button>
                   </div>
                 </div>

                 {/* Card 2: Document Analysis */}
                 <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-5 flex flex-col gap-3">
                   <div className="w-8 h-8 rounded-full bg-[#1b1c3a] flex items-center justify-center mb-1">
                     <Users className="w-4 h-4 text-[#7d84ff]" />
                   </div>
                   <h3 className="text-[15px] font-bold text-white">Document Analysis</h3>
                   <p className="text-[13px] text-gray-400 leading-relaxed">
                     Get comprehensive analysis and actionable recommendations to improve your document's quality.
                   </p>
                   <div className="flex items-center gap-3 mt-2">
                     <button onClick={handleDocumentAnalysis} disabled={loading} className="flex items-center gap-2 border border-[#333] rounded-lg px-3 py-1.5 hover:bg-[#2a2a2a] transition-colors disabled:opacity-50">
                        <Play className="w-3.5 h-3.5 text-gray-300" />
                        <span className="text-[13px] font-bold text-white">Run review</span>
                     </button>
                   </div>
                 </div>

                 {/* Card 3: Tone of Voice */}
                 <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-5 flex flex-col gap-3">
                   <div className="w-8 h-8 rounded-full bg-[#1b1c3a] flex items-center justify-center mb-1">
                     <MessageSquare className="w-4 h-4 text-[#7d84ff]" />
                   </div>
                   <h3 className="text-[15px] font-bold text-white">Tone of Voice</h3>
                   <p className="text-[13px] text-gray-400 leading-relaxed">
                     Match your document's tone to a preset style or a paper from your library.
                   </p>
                   <div className="flex items-center gap-3 mt-2">
                     <button onClick={handleToneOfVoice} disabled={loading} className="flex items-center gap-2 border border-[#333] rounded-lg px-3 py-1.5 hover:bg-[#2a2a2a] transition-colors disabled:opacity-50">
                        <Play className="w-3.5 h-3.5 text-gray-300" />
                        <span className="text-[13px] font-bold text-white">Run review</span>
                     </button>
                     <button onClick={() => setActiveReviewTab('tone')} className="text-gray-400 hover:text-white transition-colors">
                       <SlidersHorizontal className="w-4 h-4" />
                     </button>
                   </div>
                 </div>

                 {/* Card 4: Proofread */}
                 <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-5 flex flex-col gap-3">
                   <div className="w-8 h-8 rounded-full bg-[#1b1c3a] flex items-center justify-center mb-1">
                     <ListChecks className="w-4 h-4 text-[#7d84ff]" />
                   </div>
                   <h3 className="text-[15px] font-bold text-white">Proofread</h3>
                   <p className="text-[13px] text-gray-400 leading-relaxed">
                     Identify grammar, punctuation, word choice, and other writing issues in your document.
                   </p>
                   <div className="flex items-center gap-3 mt-2">
                     <button onClick={handleProofread} disabled={loading} className="flex items-center gap-2 border border-[#333] rounded-lg px-3 py-1.5 hover:bg-[#2a2a2a] transition-colors disabled:opacity-50">
                        <Play className="w-3.5 h-3.5 text-gray-300" />
                        <span className="text-[13px] font-bold text-white">Run review</span>
                     </button>
                   </div>
                 </div>
              </>
           )}

           {activeReviewTab === 'claim' && (
              <div className="flex flex-col gap-4">
                {isReviewing ? (
                   <div className="flex items-center gap-2 text-gray-400 mb-4">
                     <Loader2 className="w-4 h-4 animate-spin" />
                     <span className="text-[14px]">Thinking for 5 seconds</span>
                   </div>
                ) : reviewData?.type === 'claim' ? (
                   <>
                     <div className="flex items-center justify-between mb-2">
                       <h3 className="text-[18px] font-bold text-white">Results</h3>
                       <div className="flex gap-2 text-gray-400">
                         <ThumbsUp className="w-4 h-4 cursor-pointer hover:text-white" />
                         <ThumbsDown className="w-4 h-4 cursor-pointer hover:text-white" />
                       </div>
                     </div>
                     <p className="text-[14px] text-gray-200 mb-4 leading-relaxed">
                       {reviewData.summary}
                     </p>
                     <button className="w-full py-2.5 bg-[#5b5fff] hover:bg-[#6b6fff] rounded-lg text-white font-bold flex items-center justify-center gap-2 mb-6">
                       <Play className="w-4 h-4" /> Review Changes
                     </button>
                     
                     <div className="text-[13px] font-bold text-gray-500 mb-2">Detailed breakdown</div>
                     
                     <div className="flex flex-col gap-2">
                       <div className="flex items-center justify-between bg-[#292a4a] border border-[#3b3c6a] rounded-lg px-4 py-3 cursor-pointer">
                         <span className="text-[14px] font-bold text-[#7d84ff]">All suggestions</span>
                         <span className="text-[14px] font-bold text-[#7d84ff]">
                           {['misrepresented', 'contradicted', 'unsupported', 'weaklySupported', 'overstated', 'unverifiable'].reduce((acc, key) => acc + (reviewData?.[key]?.length || 0), 0)}
                         </span>
                       </div>
                       {[
                         {label: 'Misrepresented', key: 'misrepresented'},
                         {label: 'Contradicted', key: 'contradicted'},
                         {label: 'Unsupported', key: 'unsupported'},
                         {label: 'Weakly supported', key: 'weaklySupported'},
                         {label: 'Overstated', key: 'overstated'},
                         {label: 'Unverifiable', key: 'unverifiable'},
                       ].map(item => {
                         const items = reviewData?.[item.key] || [];
                         const hasItems = items.length > 0;
                         return (
                         <div key={item.label} className="flex flex-col">
                           <div 
                             onClick={() => hasItems && setExpandedSection(expandedSection === item.label ? null : item.label)} 
                             className={`flex items-center justify-between bg-[#151515] border border-[#2a2a2a] rounded-lg px-4 py-3 ${hasItems ? 'cursor-pointer hover:bg-[#1a1a1a]' : ''}`}
                           >
                             <div className="flex items-center gap-2">
                               <span className="text-[14px] font-bold text-white">{item.label}</span>
                               <Info className="w-3.5 h-3.5 text-gray-500" />
                             </div>
                             {!hasItems ? (
                               <div className="w-4 h-4 rounded-full border border-[#10b981] flex items-center justify-center">
                                 <Check className="w-2.5 h-2.5 text-[#10b981]" />
                               </div>
                             ) : (
                               <span className="text-[14px] font-bold text-white">{items.length}</span>
                             )}
                           </div>
                           {hasItems && expandedSection === item.label && (
                             <div className="bg-[#1a1a1a] border border-[#2a2a2a] border-t-0 rounded-b-lg px-4 py-3 -mt-1 text-[13px] text-gray-300">
                               {items.map((text: string, idx: number) => (
                                 <div key={idx} className="flex gap-2">
                                   <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 shrink-0" />
                                   <p>{text}</p>
                                 </div>
                               ))}
                             </div>
                           )}
                         </div>
                       )})}
                     </div>
                   </>
                ) : null}
              </div>
           )}

           {activeReviewTab === 'analysis' && (
              <div className="flex flex-col gap-4">
                 <p className="text-[15px] text-white font-bold leading-relaxed">
                   Run a comprehensive AI analysis of this document to identify weaknesses, assess claims, and get recommendations for improvement.
                 </p>
                 <div className="bg-[#151515] border border-[#2a2a2a] rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#222] flex items-center justify-center">
                        <Star className="w-4 h-4 text-gray-300" />
                      </div>
                      <span className="text-[14px] font-bold text-gray-200">Detailed Analysis & Recommendations</span>
                    </div>
                 </div>

                 {isReviewing ? (
                   <div className="flex flex-col items-center justify-center py-10 gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-[#5b5fff]" />
                      <span className="text-sm font-bold text-gray-400">Analyzing document...</span>
                   </div>
                 ) : reviewData ? (
                   <>
                      {['Analysis Overview', 'Recommendations', 'Weaknesses', 'Strengths'].map((item) => (
                        <div key={item} className="bg-[#151515] border border-[#2a2a2a] rounded-xl overflow-hidden mb-2">
                          <div 
                            className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[#1a1a1a] transition-colors"
                            onClick={() => setExpandedSection(expandedSection === item ? null : item)}
                          >
                            <span className="text-[14px] font-bold text-gray-300">{item}</span>
                            <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedSection === item ? 'rotate-180' : ''}`} />
                          </div>
                          {expandedSection === item && (
                            <div className="py-2 px-1 text-[13px] text-gray-400 flex flex-col gap-2">
                              {(item === 'Weaknesses' ? reviewData.weaknesses : item === 'Strengths' ? reviewData.strengths : item === 'Recommendations' ? reviewData.recommendations : [reviewData.overview]).map((str: string, i: number) => (
                                <div key={i} className="flex items-start gap-2">
                                  <div className="w-1 h-1 bg-gray-500 rounded-full mt-1.5 shrink-0" />
                                  <span>{str}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                   </>
                ) : (
                   <button onClick={() => {
                     const prompt = `Here is a research paper/document:
${editor?.getText() || documentContent}

MANDATORY: Return a JSON data object analyzing this document. Do not output anything else.
Required JSON structure:
{
  "overview": "A brief overall assessment of the document's quality and arguments.",
  "weaknesses": ["list of structural, logical, or evidentiary weaknesses"],
  "strengths": ["list of positive aspects and strong points"],
  "recommendations": ["list of actionable recommendations to improve the document"]
}`;
                     fetchReview(prompt, { overview: "Could not generate overview.", weaknesses: ["Insufficient data"], strengths: ["Clear topic"], recommendations: ["Add more evidence"] });
                   }} className="w-full py-2.5 bg-[#5b5fff] hover:bg-[#6b6fff] rounded-lg text-white font-bold flex items-center justify-center gap-2 mb-6">
                      <Play className="w-4 h-4" /> Run Document Analysis
                   </button>
                )}
              </div>
           )}

           {activeReviewTab === 'tone' && (
              <div className="flex flex-col gap-4">
                 <p className="text-[15px] text-white font-bold leading-relaxed mb-4">
                   Choose a style preset or select a paper from your library to match your writing's tone.
                 </p>
                 
                 <div className="text-[11px] font-bold text-gray-500 tracking-wider mb-2">STYLE PRESETS</div>
                 <div className="flex flex-col gap-2 mb-6">
                    <div className="bg-[#2a2a2a] border border-[#444] rounded-xl p-4 flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-[#333] flex items-center justify-center">
                          <GraduationCap className="w-5 h-5 text-gray-300" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[15px] font-bold text-white">Formal Academic</span>
                          <span className="text-[13px] text-gray-400">Past tense, hedged claims, impersonal voice...</span>
                        </div>
                      </div>
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    </div>
                    <div className="bg-[#151515] border border-[#2a2a2a] rounded-xl p-4 flex items-center justify-between cursor-pointer hover:border-[#444]">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-[#222] flex items-center justify-center">
                          <FlaskConical className="w-5 h-5 text-gray-300" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[15px] font-bold text-white">Concise Scientific</span>
                          <span className="text-[13px] text-gray-400">Active voice, short sentences, minimal hedging, S...</span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-[#151515] border border-[#2a2a2a] rounded-xl p-4 flex items-center justify-between cursor-pointer hover:border-[#444]">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-[#222] flex items-center justify-center">
                          <Feather className="w-5 h-5 text-gray-300" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[15px] font-bold text-white">Clear & Natural</span>
                          <span className="text-[13px] text-gray-400">Plain vocabulary, active voice, conversational, ac...</span>
                        </div>
                      </div>
                    </div>
                 </div>

                 <div className="text-[11px] font-bold text-gray-500 tracking-wider mb-2">MATCH A PAPER</div>
                 <div className="border border-dashed border-[#333] rounded-xl p-6 flex flex-col items-center justify-center text-center bg-[#151515] hover:bg-[#1a1a1a] cursor-pointer transition-colors mb-6">
                    <Upload className="w-6 h-6 text-gray-500 mb-3" />
                    <h3 className="text-[15px] font-bold text-white mb-1">No PDFs in your library</h3>
                    <p className="text-[13px] text-gray-400">Upload a PDF to your library to use as a tone reference.</p>
                 </div>

                 <button onClick={handleToneOfVoice} disabled={isReviewing} className="w-full py-2.5 bg-[#151515] border border-[#333] hover:bg-[#2a2a2a] rounded-lg text-gray-300 font-bold flex items-center justify-center transition-colors disabled:opacity-50 mt-2">
                   <div className="flex items-center gap-2">
                     <Play className="w-4 h-4 text-gray-400" /> Run review
                   </div>
                   <span className="bg-[#292a4a] text-[#7d84ff] text-[10px] px-1.5 py-0.5 rounded uppercase font-black ml-3 tracking-wider">Upgrade</span>
                 </button>

                 {isReviewing && (
                   <div className="flex flex-col gap-2 mt-4 text-gray-400">
                     <Loader2 className="w-4 h-4 animate-spin mb-2" />
                     <span className="text-[14px]">Analyzing tone...</span>
                   </div>
                 )}
                 {reviewData?.type === 'tone' && (
                   <div className="mt-4 flex flex-col gap-2">
                     <h3 className="text-[15px] font-bold text-white">Suggestions:</h3>
                     <ul className="list-disc pl-5 text-[13px] text-gray-300 flex flex-col gap-2">
                       {reviewData.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}
                     </ul>
                     <button className="mt-4 w-full py-2 bg-[#5b5fff] hover:bg-[#6b6fff] rounded-lg text-white font-bold flex items-center justify-center gap-2 transition-colors">
                       Review Changes
                     </button>
                   </div>
                 )}
              </div>
           )}

           {activeReviewTab === 'proofread' && (
              <div className="flex flex-col gap-4">
                {isReviewing ? (
                   <div className="flex items-center gap-2 text-gray-400 mb-4">
                     <Loader2 className="w-4 h-4 animate-spin" />
                     <span className="text-[14px]">Identifying grammar issues...</span>
                   </div>
                ) : reviewData?.type === 'proofread' ? (
                   <>
                     <div className="flex items-center justify-between mb-2">
                       <h3 className="text-[18px] font-bold text-white">Results</h3>
                     </div>
                     <ul className="list-disc pl-5 text-[14px] text-gray-200 mb-4 leading-relaxed flex flex-col gap-2">
                       {reviewData.issues.map((i: string, idx: number) => <li key={idx}>{i}</li>)}
                     </ul>
                     <button className="w-full py-2.5 bg-[#5b5fff] hover:bg-[#6b6fff] rounded-lg text-white font-bold flex items-center justify-center gap-2 mb-6">
                       <Play className="w-4 h-4" /> Review Changes
                     </button>
                   </>
                ) : (
                   <>
                     <p className="text-[14px] text-gray-200 mb-4 leading-relaxed">
                       Identify grammar, punctuation, word choice, and other writing issues in your document.
                     </p>
                     <button onClick={handleProofread} className="w-full py-2.5 bg-[#5b5fff] hover:bg-[#6b6fff] rounded-lg text-white font-bold flex items-center justify-center gap-2 mb-6">
                       <Play className="w-4 h-4" /> Run Proofread
                     </button>
                   </>
                )}
              </div>
           )}

        </div>
      </div>
      )}

      {/* Citation Style Modal */}
      {showCitationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[850px] bg-[#151515] rounded-xl border border-[#333] shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 border-b border-[#2a2a2a] flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">Citation Style</h2>
              <button onClick={() => setShowCitationModal(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Body */}
            <div className="p-6 flex flex-col gap-6">
              <p className="text-[15px] text-gray-400 leading-relaxed">
                Pick a format and a locale. The locale changes page abbreviations, author joins, and "et al." conventions to match your reader's expectations.
              </p>
              
              {/* Search */}
              <div className="relative">
                <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search 2600+ styles" 
                  className="w-full bg-[#111111] border border-[#2a2a2a] rounded-lg pl-12 pr-4 py-3 text-[15px] text-gray-200 focus:outline-none focus:border-[#444] transition-colors" 
                />
              </div>

              {/* 2 Columns */}
              <div className="flex gap-6 h-[280px]">
                {/* Left Col: Styles */}
                <div className="flex-1 flex flex-col min-w-0">
                  <h3 className="text-[11px] font-bold text-gray-500 mb-3 tracking-wider uppercase">ALL STYLES</h3>
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col gap-1">
                    {(styleIndex.length ? styleIndex : CURATED_STYLES)
                      .filter(st => st.label.toLowerCase().includes(searchQuery.toLowerCase()) || st.id.toLowerCase().includes(searchQuery.toLowerCase()))
                      .slice(0, 200)
                      .map((st) => (
                      <div 
                        key={st.id}
                        onClick={() => { setSelectedStyle(st.label); setSelectedStyleId(st.id); }}
                        className={`px-4 py-3 rounded-lg text-[15px] cursor-pointer transition-colors ${selectedStyleId === st.id ? 'bg-[#2a2a2a] text-white font-bold' : 'text-gray-300 hover:bg-[#222]'}`}
                      >
                        {st.label}
                      </div>
                    ))}
                    {styleIndexLoading && <div className="px-4 py-3 text-gray-500 text-[14px] flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading 2,600+ styles…</div>}
                  </div>
                </div>

                <div className="w-[1px] bg-[#2a2a2a] my-2" />

                {/* Right Col: Locales */}
                <div className="w-[320px] flex flex-col shrink-0">
                  <h3 className="text-[11px] font-bold text-gray-500 mb-3 tracking-wider uppercase">LOCALIZED FOR</h3>
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col gap-1">
                    {[
                      { name: "Default (Style's locale)", code: 'es-ES' },
                      { name: 'Afrikaans (South Africa)', code: 'af-ZA' },
                      { name: 'American English', code: 'en-US' },
                      { name: 'Arabic', code: 'ar' },
                      { name: 'Armenian (Armenia)', code: 'hy-AM' },
                      { name: 'Austrian German', code: 'de-AT' },
                      { name: 'bal (Pakistan)', code: 'bal-PK' },
                      { name: 'Basque', code: 'eu' }
                    ].map((locale) => (
                      <div 
                        key={locale.name}
                        onClick={() => setSelectedLocale(locale.name)}
                        className={`px-3 py-2.5 rounded-lg text-[15px] cursor-pointer flex items-center justify-between transition-colors ${selectedLocale === locale.name ? 'bg-[#2a2a2a] text-white' : 'text-gray-300 hover:bg-[#222]'}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-bold w-6 text-center ${selectedLocale === locale.name ? 'text-white' : 'text-gray-500'}`}>{locale.code.split('-')[0].toUpperCase()}</span>
                          <span className={selectedLocale === locale.name ? 'font-bold' : ''}>{locale.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-[#333] text-[#888] text-[11px]">{locale.code}</span>
                          {selectedLocale === locale.name && <Check className="w-4 h-4 text-white" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="flex flex-col gap-3 mt-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-[11px] font-bold text-gray-500 tracking-wider uppercase">PREVIEW</h3>
                  <div className="flex bg-[#111111] rounded-full p-1 border border-[#2a2a2a]">
                    <button 
                      onClick={() => setPreviewMode('Bibliography')}
                      className={`px-4 py-1.5 rounded-full text-[13px] font-bold transition-colors ${previewMode === 'Bibliography' ? 'bg-[#333] text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                      Bibliography
                    </button>
                    <button 
                      onClick={() => setPreviewMode('In-text')}
                      className={`px-4 py-1.5 rounded-full text-[13px] font-bold transition-colors ${previewMode === 'In-text' ? 'bg-[#333] text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                      In-text
                    </button>
                  </div>
                </div>
                <div className="bg-[#222] border border-[#2a2a2a] rounded-xl p-5 text-[15px] text-gray-200 leading-relaxed min-h-[100px]">
                  {previewMode === 'Bibliography' ? 
                    <span>JOHNSON, Emily R., CHEN, Wei, PATEL, Ananya. The impact of artificial intelligence on modern research methodologies. En <i className="text-gray-300">Journal of Computational Science</i> [en línea]. 2024, vol. 42, n° 3, pp. 112-128. DOI: 10.1234/jcs.2024.0042</span>
                    :
                    <span>(Johnson et al., 2024)</span>
                  }
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div className="px-6 py-4 border-t border-[#2a2a2a] flex justify-between items-center bg-[#111111]">
              <div className="text-[14px] text-gray-400">
                Selected style: <strong className="text-white">{selectedStyle}</strong>, localised for <strong className="text-white">{selectedLocale}</strong>
              </div>
              <button 
                onClick={() => { 
                  setCitationStyle(selectedStyle); 
                  setCitationStyleId(selectedStyleId); 
                  setShowCitationModal(false); 
                }} 
                className="bg-[#5b5fff] hover:bg-[#6b6fff] text-white px-8 py-2.5 rounded-lg text-[15px] font-bold transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {chatPdfOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setChatPdfOpen(false)}>
          <div className="w-[600px] max-w-[90vw] bg-[#151515] rounded-xl border border-[#333] shadow-2xl flex flex-col overflow-hidden text-white font-sans" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 flex justify-between items-center border-b border-[#2a2a2a]">
              <h2 className="text-lg font-bold">Ask your library</h2>
              <button onClick={() => setChatPdfOpen(false)} className="text-gray-400 hover:text-white transition-colors">X</button>
            </div>
            <div className="p-6 flex flex-col gap-3">
              <p className="text-[13px] text-gray-400">Ask a question about the papers you have uploaded or imported. Answers are grounded in your library.</p>
              <textarea value={chatPdfQ} onChange={(e) => setChatPdfQ(e.target.value)} placeholder="e.g. What methods do the uploaded papers use?" rows={3} className="w-full bg-[#111] border border-[#444] rounded-lg p-3 text-[14px] text-white outline-none focus:border-blue-500 resize-none" />
              <button onClick={handleAskLibrary} disabled={chatPdfBusy || !chatPdfQ.trim()} className="self-start bg-[#5b5fff] hover:bg-[#6b6fff] disabled:opacity-50 text-white px-5 py-2 rounded-lg font-bold text-[14px] transition-colors">{chatPdfBusy ? 'Thinking...' : 'Ask'}</button>
              {chatPdfA && <div className="mt-2 max-h-[320px] overflow-y-auto bg-[#1a1a1a] border border-[#333] rounded-lg p-4 text-[14px] text-gray-200 whitespace-pre-wrap">{chatPdfA}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Citation search modal */}
      {showCiteSearch && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 backdrop-blur-sm pt-24" onClick={() => setShowCiteSearch(false)}>
          <div className="w-[640px] max-w-[92vw] bg-[#161616] border border-[#333] rounded-2xl shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#2a2a2a] flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Add citation</h2>
              <button onClick={() => setShowCiteSearch(false)} className="text-gray-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  value={citeQuery}
                  onChange={(e) => setCiteQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCiteSearch()}
                  placeholder="Search by title, author, keywords or paste a DOI…"
                  className="flex-1 bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2.5 text-white text-[14px] outline-none focus:border-[#5b5fff] transition-colors"
                />
                <button onClick={() => handleCiteSearch()} disabled={citeSearching || !citeQuery.trim()} className="bg-[#5b5fff] hover:bg-[#6b6fff] disabled:opacity-50 text-white px-4 py-2.5 rounded-lg font-bold text-[14px] flex items-center gap-2 transition-colors">
                  {citeSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Search
                </button>
              </div>
              <p className="text-[12px] text-gray-500">Powered by CrossRef. Inserts an in-text citation and stores the DOI so the reference list and hover cards stay accurate.</p>
              <div className="flex flex-col gap-2 max-h-[46vh] overflow-y-auto custom-scrollbar">
                {citeResults.map((r, i) => (
                  <button key={(r.doi || r.title) + i} onClick={() => handleCiteInsert(r)} className="text-left bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] hover:border-[#5b5fff] rounded-lg p-3 transition-colors group">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-[14px] font-bold text-white leading-snug">{r.title}</h3>
                      {r.citedBy != null && <span className="shrink-0 bg-[#333] rounded px-2 py-0.5 text-gray-300 text-[10px] font-bold">CITED BY {r.citedBy}</span>}
                    </div>
                    {r.authors?.length > 0 && (
                      <p className="text-[12px] text-gray-400 mt-1">{r.authors.slice(0, 5).map((a: any) => [a.given, a.family].filter(Boolean).join(' ')).join(', ')}{r.authors.length > 5 ? ', et al.' : ''}</p>
                    )}
                    <p className="text-[12px] text-[#10b981] mt-0.5">{r.container}{r.year ? ` • ${r.year}` : ''}</p>
                    <span className="inline-block mt-2 text-[12px] font-bold text-[#7fa3ff] opacity-0 group-hover:opacity-100 transition-opacity">Click to insert →</span>
                  </button>
                ))}
                {!citeSearching && citeResults.length === 0 && citeQuery.trim() && (
                  <p className="text-[13px] text-gray-500 text-center py-6">No results yet — press Search.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI citation suggestions modal */}
      {showSuggestModal && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 backdrop-blur-sm pt-16" onClick={() => setShowSuggestModal(false)}>
          <div className="w-[680px] max-w-[92vw] bg-[#161616] border border-[#333] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#2a2a2a] flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2"><Sparkles className="w-4 h-4 text-amber-400" /> Suggested citations</h2>
                <p className="text-[12px] text-gray-500 mt-0.5">Claims that may need a source, with a matching paper. Accept to insert it.</p>
              </div>
              <button onClick={() => setShowSuggestModal(false)} className="text-gray-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 flex flex-col gap-3 overflow-y-auto custom-scrollbar">
              {suggestLoading ? (
                <div className="flex items-center gap-2 text-gray-400 text-[14px] py-6 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Scanning your document for uncited claims…</div>
              ) : suggestions.length === 0 ? (
                <div className="text-gray-500 text-[14px] py-6 text-center">No uncited claims found. Your document looks well-supported, or there isn't enough text yet.</div>
              ) : (
                suggestions.map((sug, idx) => (
                  <div key={idx} className={`rounded-xl border p-3 flex flex-col gap-2 ${sug.status === 'accepted' ? 'border-[#10b981]/40 bg-[#10b981]/5' : 'border-[#2a2a2a] bg-[#1a1a1a]'}`}>
                    <p className="text-[13px] text-gray-300 italic leading-snug">“{sug.claim.length > 180 ? sug.claim.slice(0, 180) + '…' : sug.claim}”</p>
                    {sug.paper && !sug.paper.none ? (
                      <div className="bg-[#222] rounded-lg p-3 border border-[#2a2a2a]">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-[13px] font-bold text-white leading-snug">{sug.paper.title}</h3>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {sug.paper.citedBy != null && <span className="bg-[#333] rounded px-2 py-0.5 text-gray-300 text-[10px] font-bold">CITED BY {sug.paper.citedBy}</span>}
                            {sug.paper.isOA === true && <span className="bg-[#10b981]/20 text-[#34d399] rounded px-2 py-0.5 text-[10px] font-bold">OA</span>}
                          </div>
                        </div>
                        {sug.paper.authors && <p className="text-[12px] text-gray-400 mt-1">{sug.paper.authors}</p>}
                        {sug.paper.container && <p className="text-[12px] text-[#10b981]">{sug.paper.container}{sug.paper.year ? ` • ${sug.paper.year}` : ''}</p>}
                      </div>
                    ) : (
                      <p className="text-[12px] text-gray-500">No strong match found — try Refine to search manually.</p>
                    )}
                    <div className="flex items-center gap-2">
                      {sug.status === 'accepted' ? (
                        <span className="text-[13px] font-bold text-[#34d399] flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Inserted</span>
                      ) : (
                        <>
                          <button onClick={() => acceptSuggestion(sug)} disabled={!sug.paper || sug.paper.none} className="bg-[#5b5fff] hover:bg-[#6b6fff] disabled:opacity-40 text-white px-4 py-1.5 rounded-lg text-[13px] font-bold flex items-center gap-1.5 transition-colors">Accept <ChevronRight className="w-3.5 h-3.5" /></button>
                          <button onClick={() => { setShowSuggestModal(false); refineCitation(sug.query); }} className="border border-[#444] hover:bg-[#2a2a2a] text-white px-3 py-1.5 rounded-lg text-[13px] font-bold flex items-center gap-1.5 transition-colors"><Sparkles className="w-3.5 h-3.5" /> Refine</button>
                          <button onClick={() => setSuggestions(prev => prev.filter(x => x !== sug))} className="text-gray-400 hover:text-white px-2 py-1.5 text-[13px]">Skip</button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <UploadModal 
        showUploadModal={showUploadModal} 
        setShowUploadModal={setShowUploadModal} 
        handleFileUpload={handleFileUpload} 
        uploadingDoc={uploadingDoc} 
      />

      {/* Claim Confidence Settings Modal */}
      {showClaimConfidenceSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[600px] bg-[#161616] border border-[#333] rounded-2xl shadow-2xl overflow-hidden flex flex-col relative animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-5 border-b border-[#2a2a2a] flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Claim confidence settings</h2>
              <button onClick={() => setShowClaimConfidenceSettings(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div className="bg-[#1b1c3a] border border-[#3b3c6a] rounded-lg px-4 py-3 flex items-start gap-3">
                <Info className="w-5 h-5 text-[#6d93e8] mt-0.5 shrink-0" />
                <span className="text-[14px] text-[#6d93e8]">Changes here will also affect your document citation settings</span>
              </div>
              
              <div className="flex flex-col gap-5">
                <span className="text-[12px] font-bold text-gray-500 tracking-wider">SOURCES</span>
                
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-[15px] font-bold text-white">Consider external sources</span>
                    <span className="text-[13px] text-gray-400">Jenni will consider sources from the web</span>
                  </div>
                  <div onClick={() => setExternalSources(!externalSources)} className={`w-11 h-6 rounded-full flex items-center px-1 cursor-pointer transition-colors ${externalSources ? 'bg-[#5b5fff]' : 'bg-[#3d3d3d]'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${externalSources ? 'translate-x-[20px]' : 'translate-x-0'}`} />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-[15px] font-bold text-white">Consider library sources</span>
                    <span className="text-[13px] text-gray-400">Jenni will consider sources from your library</span>
                  </div>
                  <div onClick={() => setLibrarySources(!librarySources)} className={`w-11 h-6 rounded-full flex items-center px-1 cursor-pointer transition-colors ${librarySources ? 'bg-[#5b5fff]' : 'bg-[#3d3d3d]'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${librarySources ? 'translate-x-[20px]' : 'translate-x-0'}`} />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-[15px] font-bold text-white">Limit to a collection</span>
                    <span className="text-[13px] text-gray-400">Jenni will focus on sources from this collection</span>
                  </div>
                  <div className="px-4 py-2.5 border border-[#333] rounded-lg text-[14px] font-bold text-gray-400 flex items-center justify-between gap-4 w-[240px] bg-[#1a1a1a] cursor-pointer hover:border-[#444]">
                    <span>{limitCollection}</span>
                    <ChevronRight className="w-4 h-4 rotate-90 text-gray-500" />
                  </div>
                </div>
              </div>

              <div className="h-[1px] bg-[#2a2a2a] w-full my-1"></div>
              
              <div className="flex flex-col gap-5">
                <span className="text-[12px] font-bold text-gray-500 tracking-wider">CITATION FILTERS</span>
                
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-bold text-white">Publish year</span>
                  <div className="flex gap-1 items-center">
                    <button onClick={() => setPublishYear('All')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${publishYear === 'All' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>All</button>
                    <button onClick={() => setPublishYear('Last 5 years')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${publishYear === 'Last 5 years' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>Last 5 years</button>
                    <button onClick={() => setPublishYear('Custom')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${publishYear === 'Custom' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>Custom</button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-bold text-white">Impact Factor</span>
                  <div className="flex gap-1 items-center">
                    <button onClick={() => setImpactFactor('All')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${impactFactor === 'All' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>All</button>
                    <button onClick={() => setImpactFactor('0.25+')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${impactFactor === '0.25+' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>0.25+</button>
                    <button onClick={() => setImpactFactor('3+')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${impactFactor === '3+' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>3+</button>
                    <button onClick={() => setImpactFactor('10+')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${impactFactor === '10+' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>10+</button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-bold text-white">Cited by</span>
                  <div className="flex gap-1 items-center">
                    <button onClick={() => setCitedBy('All')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${citedBy === 'All' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>All</button>
                    <button onClick={() => setCitedBy('5+')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${citedBy === '5+' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>5+</button>
                    <button onClick={() => setCitedBy('20+')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${citedBy === '20+' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>20+</button>
                    <button onClick={() => setCitedBy('50+')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors ${citedBy === '50+' ? 'bg-[#293b6e] text-[#6d93e8]' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#333]'}`}>50+</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[#2a2a2a] flex items-center justify-end gap-3">
              <button onClick={() => setShowClaimConfidenceSettings(false)} className="px-5 py-2.5 rounded-lg border border-[#444] text-white hover:bg-[#222] transition-colors font-bold text-[14px]">Cancel</button>
              <button onClick={() => { setShowClaimConfidenceSettings(false); handleClaimConfidence(); }} className="bg-[#5b5fff] hover:bg-[#6b6fff] text-white px-5 py-2.5 rounded-lg font-bold text-[14px] transition-colors shadow-sm">Run review</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
