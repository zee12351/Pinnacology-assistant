-- Pinnovix — Supabase schema (run in Supabase → SQL Editor).
-- Moves per-user data out of the browser's localStorage into Postgres so it
-- persists across devices and survives cache clears. Row-Level Security ensures
-- every row is private to its owner (auth.uid()).

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";

-- ---------- profiles (1 row per auth user) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  name        text,
  plan        text not null default 'free',           -- free | student | pro
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- projects / documents (Persona 1 papers, Persona 2 searches, Persona 3 visuals) ----------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  persona     text not null,                          -- ACADEMIC WRITING | LITERATURE REVIEW | SCIVIZ
  title       text not null default '',
  kind        text,                                   -- e.g. 'find', 'deep', 'paper'
  content     jsonb not null default '{}'::jsonb,     -- document html, sections, settings, etc.
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists projects_user_idx on public.projects (user_id, updated_at desc);

-- ---------- chats (AI-chat / research-agent threads) ----------
create table if not exists public.chats (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete cascade,
  persona     text,
  title       text default '',
  messages    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists chats_user_idx on public.chats (user_id, updated_at desc);

-- ---------- library_items (saved papers) ----------
create table if not exists public.library_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default '',
  authors     text,
  year        text,
  venue       text,
  doi         text,
  url         text,
  collection  text default '',
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists library_user_idx on public.library_items (user_id, created_at desc);

-- ---------- citations (saved / detected references) ----------
create table if not exists public.citations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete cascade,
  title       text,
  authors     text,
  year        text,
  container   text,
  doi         text,
  url         text,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists citations_user_idx on public.citations (user_id, created_at desc);

-- ---------- usage (per-user LLM token accounting for quotas / billing) ----------
create table if not exists public.usage (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  day           date not null default (now() at time zone 'utc')::date,
  endpoint      text,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists usage_user_day_idx on public.usage (user_id, day);

-- ---------- Row-Level Security: each user only sees their own rows ----------
alter table public.profiles      enable row level security;
alter table public.projects      enable row level security;
alter table public.chats         enable row level security;
alter table public.library_items enable row level security;
alter table public.citations     enable row level security;
alter table public.usage         enable row level security;

-- Reusable "owner only" policies.
do $$
declare t text;
begin
  for t in select unnest(array['projects','chats','library_items','citations','usage']) loop
    execute format('drop policy if exists "own_select" on public.%I;', t);
    execute format('drop policy if exists "own_modify" on public.%I;', t);
    execute format($p$create policy "own_select" on public.%I for select using (auth.uid() = user_id);$p$, t);
    execute format($p$create policy "own_modify" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id);$p$, t);
  end loop;
end $$;

drop policy if exists "profiles_self" on public.profiles;
create policy "profiles_self" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
