// Pinnovix billing / credit client. Talks to the backend which owns the ledger.
import { authHeaders } from './supabaseClient';

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');

export type BillingStatus = {
  enabled?: boolean;
  exempt?: boolean;
  plan?: string;
  welcomeLeft?: number | null;
  credits?: number | null;
};

export type ConsumeResult = {
  ok: boolean;
  reason?: 'trial_over' | 'need_plan' | 'no_credits' | string;
  welcomeLeft?: number;
  credits?: number;
  unlimited?: boolean;
  unmetered?: boolean;
  soft?: boolean;
};

export async function billingStatus(): Promise<BillingStatus> {
  try {
    const r = await fetch(API + '/api/billing/status', { headers: { ...(await authHeaders()) } });
    if (!r.ok) return { exempt: true };
    return await r.json();
  } catch {
    return { exempt: true };
  }
}

// Ask the backend to consume for an action. Returns { ok }. On network failure we
// fail OPEN (ok:true, soft:true) so a backend hiccup never bricks the app.
export async function billingConsume(action: string): Promise<ConsumeResult> {
  try {
    const r = await fetch(API + '/api/billing/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ action }),
    });
    let out: ConsumeResult;
    if (!r.ok) out = { ok: true, soft: true };
    else out = await r.json();
    try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('pnx-billing-refresh')); } catch {}
    return out;
  } catch {
    return { ok: true, soft: true };
  }
}
