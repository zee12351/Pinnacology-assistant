'use client';
import { useState } from 'react';
import { supabase, authConfigured } from '@/lib/supabaseClient';
import { X, Loader2, Mail, Lock, User } from 'lucide-react';

export function AuthModal({ open, onClose, onAuthed }: any) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  if (!open) return null;

  function finishAuth(user: any) {
    try {
      const em = (user && user.email) || email.trim();
      const nm = (user && user.user_metadata && user.user_metadata.name) || name.trim() || (em ? em.split('@')[0] : '');
      if (em) localStorage.setItem('pinnovix_email', em);
      if (nm) localStorage.setItem('pinnovix_name', nm);
    } catch {}
    if (onAuthed) onAuthed(user);
    onClose();
  }

  async function submit() {
    setError(''); setInfo('');
    if (!supabase) { setError('Sign-in is not configured yet. Add your Supabase keys in Vercel.'); return; }
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    if (mode === 'signup' && password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() } } });
        if (error) setError(error.message);
        else if (data.session) finishAuth(data.user);
        else { setInfo('Account created. Check your email to confirm, then sign in.'); setMode('signin'); }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) setError(error.message);
        else finishAuth(data.user);
      }
    } catch (e: any) {
      setError((e && e.message) || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    if (!supabase) { setError('Sign-in is not configured yet.'); return; }
    try {
      await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined } });
    } catch (e: any) {
      setError((e && e.message) || 'Google sign-in failed.');
    }
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 bg-contain bg-no-repeat bg-center shrink-0" style={{ backgroundImage: 'url(/logo.png)' }} />
            <div className="text-[18px] font-bold">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="text-[13px] text-muted-foreground mb-4">{mode === 'signup' ? 'Sign up to save your work across devices.' : 'Sign in to your Pinnovix account.'}</div>

        {mode === 'signup' ? (
          <label className="block mb-2">
            <span className="text-[12.5px] font-semibold">Name</span>
            <div className="relative mt-1"><User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full bg-muted/40 border border-border rounded-lg pl-9 pr-3 py-2 text-[13.5px] outline-none focus:border-primary" /></div>
          </label>
        ) : null}
        <label className="block mb-2">
          <span className="text-[12.5px] font-semibold">Email</span>
          <div className="relative mt-1"><Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" className="w-full bg-muted/40 border border-border rounded-lg pl-9 pr-3 py-2 text-[13.5px] outline-none focus:border-primary" /></div>
        </label>
        <label className="block mb-3">
          <span className="text-[12.5px] font-semibold">Password</span>
          <div className="relative mt-1"><Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} type="password" placeholder="At least 6 characters" className="w-full bg-muted/40 border border-border rounded-lg pl-9 pr-3 py-2 text-[13.5px] outline-none focus:border-primary" /></div>
        </label>

        {error ? <div className="text-[12.5px] text-red-500 mb-2">{error}</div> : null}
        {info ? <div className="text-[12.5px] text-green-600 mb-2">{info}</div> : null}

        <button onClick={submit} disabled={busy} className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {mode === 'signup' ? 'Sign up' : 'Sign in'}</button>
        <button onClick={google} className="w-full mt-2 border border-border rounded-lg py-2.5 text-[13.5px] font-semibold hover:bg-muted flex items-center justify-center gap-2">Continue with Google</button>

        <div className="text-center text-[12.5px] text-muted-foreground mt-4">
          {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
          <button onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); setInfo(''); }} className="text-primary font-semibold">{mode === 'signup' ? 'Sign in' : 'Sign up'}</button>
        </div>
        {!authConfigured ? <div className="text-[11.5px] text-amber-600 mt-3 text-center">Auth is not configured yet — add your Supabase keys in Vercel.</div> : null}
      </div>
    </div>
  );
}
