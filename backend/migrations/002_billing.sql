-- Pinnovix billing / credits (run in Supabase SQL editor)
-- One row per user. Only the service role (backend) may modify credits/welcome_used,
-- so enforcement can't be bypassed from the client. Users may READ their own row.

create table if not exists public.billing (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  email        text,
  plan         text not null default 'free',      -- free | student | duo | standard | pro | team | unlimited
  welcome_used int  not null default 0,           -- lifetime free light-service runs used (cap = 3)
  credits      int  not null default 0,           -- remaining credits (monthly allowance + top-ups)
  cycle_start  timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table public.billing enable row level security;

-- Users can read ONLY their own billing row.
drop policy if exists billing_own_select on public.billing;
create policy billing_own_select on public.billing
  for select using (auth.uid() = user_id);

-- No insert/update/delete policy for normal users → only the service role can change
-- credits and welcome_used. This is what makes the meter tamper-proof.

-- Auto-create a billing row when a new auth user signs up.
create or replace function public.handle_new_user_billing()
returns trigger language plpgsql security definer as $$
begin
  insert into public.billing (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_billing on auth.users;
create trigger on_auth_user_created_billing
  after insert on auth.users
  for each row execute function public.handle_new_user_billing();
