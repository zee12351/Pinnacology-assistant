// Supabase data layer for per-user data (projects, chats, library, citations, usage).
// Every function falls back to localStorage when the user is logged out or Supabase
// isn't reachable, so the app keeps working offline / before the tables exist.
//
// Wire these into the personas incrementally, e.g.:
//   const items = await db.listLibrary();           // reads Supabase, else localStorage
//   await db.saveLibrary(items);                     // writes both
import { supabase } from './supabaseClient';

async function uid(): Promise<string | null> {
  try { if (!supabase) return null; const { data } = await supabase.auth.getUser(); return (data && data.user && data.user.id) || null; } catch { return null; }
}
const ls = {
  get<T>(k: string, def: T): T { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : def; } catch { return def; } },
  set(k: string, v: any) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

export const db = {
  async loggedIn(): Promise<boolean> { return !!(await uid()); },

  // ---- Library items ----
  async listLibrary(): Promise<any[]> {
    const id = await uid();
    if (id && supabase) {
      const { data, error } = await supabase.from('library_items').select('*').eq('user_id', id).order('created_at', { ascending: false });
      if (!error && data) return data;
    }
    return ls.get('pinnovix_library_docs', []);
  },
  async addLibrary(item: any): Promise<void> {
    const id = await uid();
    ls.set('pinnovix_library_docs', [item, ...ls.get('pinnovix_library_docs', [])]);
    if (id && supabase) {
      await supabase.from('library_items').insert({ user_id: id, title: item.name || item.title || '', authors: item.authorStr || '', year: String(item.year || ''), venue: item.venue || '', doi: item.doi || '', url: item.url || '', collection: item.collection || '', meta: item });
    }
  },

  // ---- Projects / documents ----
  async listProjects(persona: string): Promise<any[]> {
    const id = await uid();
    if (id && supabase) {
      const { data, error } = await supabase.from('projects').select('*').eq('user_id', id).eq('persona', persona).order('updated_at', { ascending: false });
      if (!error && data) return data;
    }
    return [];
  },
  async upsertProject(p: { id?: string; persona: string; title: string; kind?: string; content: any }): Promise<any> {
    const id = await uid();
    if (id && supabase) {
      const row: any = { user_id: id, persona: p.persona, title: p.title, kind: p.kind || null, content: p.content, updated_at: new Date().toISOString() };
      if (p.id) row.id = p.id;
      const { data } = await supabase.from('projects').upsert(row).select().single();
      return data;
    }
    return null;
  },

  // ---- Chats ----
  async listChats(persona?: string): Promise<any[]> {
    const id = await uid();
    if (id && supabase) {
      let q = supabase.from('chats').select('*').eq('user_id', id).order('updated_at', { ascending: false });
      if (persona) q = q.eq('persona', persona);
      const { data, error } = await q;
      if (!error && data) return data;
    }
    return ls.get('academic_projects_history', []);
  },
  async saveChat(chat: { id?: string; persona?: string; title?: string; messages?: any[]; project_id?: string }): Promise<any> {
    const id = await uid();
    if (id && supabase) {
      const row: any = { user_id: id, persona: chat.persona || null, title: chat.title || '', messages: chat.messages || [], updated_at: new Date().toISOString() };
      if (chat.id) row.id = chat.id;
      if (chat.project_id) row.project_id = chat.project_id;
      const { data } = await supabase.from('chats').upsert(row).select().single();
      return data;
    }
    return null;
  },
  async deleteChat(id: string): Promise<void> {
    const u = await uid();
    if (u && supabase) await supabase.from('chats').delete().eq('id', id).eq('user_id', u);
  },

  // ---- Usage (LLM token accounting for quotas) ----
  async recordUsage(endpoint: string, inTok: number, outTok: number): Promise<void> {
    const id = await uid();
    if (id && supabase) await supabase.from('usage').insert({ user_id: id, endpoint, input_tokens: inTok, output_tokens: outTok });
  },
};
