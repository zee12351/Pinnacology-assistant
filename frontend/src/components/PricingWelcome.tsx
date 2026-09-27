'use client';
import { useEffect, useState } from 'react';
import { Sparkles, Check, X, Zap, Crown, GraduationCap } from 'lucide-react';
import { billingStatus, BillingStatus } from '@/lib/billing';

// App-wide welcome + pricing popup. Shows once per user after login for free-plan
// users, highlighting their remaining free runs, plus a persistent free-run tracker.
const SEEN_KEY = 'pnx_pricing_welcome_v1';

const PLANS = [
  { id: 'student', name: 'Student', price: '₹299', per: '/mo', Icon: GraduationCap, tag: '', feats: ['All 3 workspaces', '80 credits / month', 'Verified-student price'] },
  { id: 'standard', name: 'Standard', price: '₹999', per: '/mo', Icon: Zap, tag: 'Popular', feats: ['All 3 workspaces', '220 credits / month', 'All export formats'] },
  { id: 'pro', name: 'Pro', price: '₹1,599', per: '/mo', Icon: Crown, tag: '', feats: ['Everything in Standard', '650 credits / month', 'Priority + faster model'] },
];

export function PricingWelcome() {
  const [open, setOpen] = useState(false);
  const [bill, setBill] = useState<BillingStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    billingStatus().then((b) => {
      if (cancelled) return;
      setBill(b);
      const seen = typeof window !== 'undefined' && localStorage.getItem(SEEN_KEY);
      // Only greet real free-plan users (never the exempt owner/testers).
      if (!seen && b && !b.exempt && (!b.plan || b.plan === 'free')) setOpen(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const close = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch {} setOpen(false); };
  if (!open || !bill) return null;
  const runs = bill.welcomeLeft ?? 3;

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6" onClick={close}>
      <div className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
        {/* Header / free-runs banner */}
        <div className="relative p-6 sm:p-8 rounded-t-3xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.16), rgba(56,189,248,0.10))' }}>
          <button onClick={close} className="absolute top-4 right-4 w-8 h-8 rounded-lg border border-border bg-card/60 flex items-center justify-center hover:bg-muted"><X className="w-4 h-4" /></button>
          <div className="inline-flex items-center gap-1.5 text-[12px] font-bold text-primary bg-primary/12 rounded-full px-3 py-1"><Sparkles className="w-3.5 h-3.5" /> Welcome to Pinnovix</div>
          <h2 className="text-[26px] sm:text-[30px] font-bold mt-3 leading-tight">You've got <span className="text-primary">{runs} free run{runs === 1 ? '' : 's'}</span> to explore</h2>
          <p className="text-[14px] text-muted-foreground mt-1.5 max-w-xl">Try the light tools — paper search, the AI Assistant, chat and drafting — on the house. The heavy research engines (Deep search, Literature Intelligence, Systematic Review, extraction, OCR) run on a plan or credits.</p>
          <div className="flex items-center gap-2 mt-4">
            {[0, 1, 2].map((i) => (
              <span key={i} className={'h-2.5 flex-1 max-w-[70px] rounded-full ' + (i < runs ? 'bg-primary' : 'bg-muted')} />
            ))}
            <span className="text-[12px] font-semibold text-muted-foreground ml-1">{runs} / 3 left</span>
          </div>
        </div>

        {/* Plans */}
        <div className="p-6 sm:p-8">
          <div className="text-[13px] font-bold text-muted-foreground uppercase tracking-wide mb-3">Unlock everything with a plan</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PLANS.map((p) => (
              <div key={p.id} className={'relative border rounded-2xl p-4 flex flex-col ' + (p.tag ? 'border-primary ring-1 ring-primary/30' : 'border-border')}>
                {p.tag ? <span className="absolute -top-2.5 left-4 text-[10.5px] font-bold text-primary-foreground bg-primary rounded-full px-2 py-0.5">{p.tag}</span> : null}
                <div className="flex items-center gap-2"><p.Icon className="w-4 h-4 text-primary" /><span className="text-[15px] font-bold">{p.name}</span></div>
                <div className="mt-1.5"><span className="text-[24px] font-bold">{p.price}</span><span className="text-[12px] text-muted-foreground">{p.per}</span></div>
                <div className="mt-3 flex flex-col gap-1.5">
                  {p.feats.map((f) => (<div key={f} className="flex items-start gap-1.5 text-[12.5px] text-foreground/85"><Check className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" /> {f}</div>))}
                </div>
              </div>
            ))}
          </div>
          <div className="text-[11.5px] text-muted-foreground mt-3 text-center">Also available: single-workspace plans from ₹349/mo and credit top-ups from ₹149.</div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mt-5">
            <button onClick={close} className="w-full sm:w-auto bg-primary text-primary-foreground rounded-xl px-6 py-2.5 text-[14px] font-semibold">Start with my {runs} free run{runs === 1 ? '' : 's'}</button>
            <a href="mailto:support@pinnovix.in?subject=Pinnovix%20plan%20upgrade" onClick={close} className="w-full sm:w-auto text-center border border-border rounded-xl px-6 py-2.5 text-[14px] font-semibold hover:bg-muted no-underline text-foreground">Contact to upgrade</a>
          </div>
        </div>
      </div>
    </div>
  );
}

// Compact, persistent free-run / credits tracker pill for headers.
export function CreditPill({ className = '' }: { className?: string }) {
  const [bill, setBill] = useState<BillingStatus | null>(null);
  useEffect(() => {
    billingStatus().then(setBill).catch(() => {});
    const on = () => billingStatus().then(setBill).catch(() => {});
    if (typeof window !== 'undefined') window.addEventListener('pnx-billing-refresh', on);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('pnx-billing-refresh', on); };
  }, []);
  if (!bill || bill.exempt) return null;
  const paid = bill.plan && bill.plan !== 'free';
  const runs = bill.welcomeLeft ?? 0;
  return (
    <span className={'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ' + (paid ? 'border-primary/40 bg-primary/10 text-primary' : (runs > 0 ? 'border-border text-muted-foreground' : 'border-red-400/40 bg-red-500/10 text-red-400')) + ' ' + className}>
      <Sparkles className="w-3.5 h-3.5" />
      {paid ? ((bill.credits ?? 0) + ' credits') : (runs + ' / 3 free runs')}
    </span>
  );
}
