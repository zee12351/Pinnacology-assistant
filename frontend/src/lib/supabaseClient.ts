import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Null when env vars are not configured yet, so the app still builds/runs.
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

export const authConfigured = !!(url && anonKey);

// Returns the Authorization header for backend API calls (empty when logged out
// or auth isn't configured). Spread into fetch headers: { ...(await authHeaders()) }.
export async function authHeaders(): Promise<Record<string, string>> {
  try {
    if (!supabase) return {};
    const { data } = await supabase.auth.getSession();
    const token = data && data.session && data.session.access_token;
    return token ? { Authorization: 'Bearer ' + token } : {};
  } catch {
    return {};
  }
}

// Global fetch interceptor: attach the Supabase access token to EVERY request to
// our backend API, so all endpoints get authenticated without editing each call
// site. Runs once, client-side only. If the caller already set Authorization we
// leave it. Requests to third-party APIs (OpenAlex, Crossref…) are untouched.
if (typeof window !== 'undefined' && supabase && !(window as any).__pnxFetchPatched) {
  (window as any).__pnxFetchPatched = true;
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');
  const orig = window.fetch.bind(window);
  window.fetch = async (input: any, init?: any) => {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url && url.indexOf(apiBase) === 0) {
        const { data } = await supabase!.auth.getSession();
        const token = data && data.session && data.session.access_token;
        if (token) {
          const h = new Headers((init && init.headers) || (typeof input !== 'string' && input && input.headers) || undefined);
          if (!h.has('Authorization')) h.set('Authorization', 'Bearer ' + token);
          init = { ...(init || {}), headers: h };
        }
      }
    } catch { /* fall through to the original fetch */ }
    return orig(input, init);
  };
}
