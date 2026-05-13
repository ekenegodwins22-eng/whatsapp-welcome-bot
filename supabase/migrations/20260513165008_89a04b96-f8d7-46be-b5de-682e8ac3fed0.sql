
-- Roles
create type public.app_role as enum ('admin', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  )
$$;

create policy "users view own roles" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

-- Auto-assign 'user' role on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_roles (user_id, role) values (new.id, 'user')
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- bot_config: one row per user
create table public.bot_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  away_mode boolean not null default false,
  welcome_message text not null default 'Hi! Thanks for messaging. I''m currently away — I''ll get back to you as soon as I can. In the meantime, our AI assistant can help.',
  system_prompt text not null default 'You are a friendly WhatsApp assistant replying on behalf of the account owner who is currently away. Keep replies short, helpful, and warm. Do not make commitments on the owner''s behalf. If the question requires the owner personally, say they will follow up when back.',
  timezone text not null default 'UTC',
  business_hours_start smallint not null default 9,
  business_hours_end smallint not null default 17,
  ai_model text not null default 'google/gemini-2.5-flash',
  updated_at timestamptz not null default now()
);

alter table public.bot_config enable row level security;

create policy "own config select" on public.bot_config for select to authenticated using (auth.uid() = user_id);
create policy "own config insert" on public.bot_config for insert to authenticated with check (auth.uid() = user_id);
create policy "own config update" on public.bot_config for update to authenticated using (auth.uid() = user_id);

-- contacts
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone text not null,
  display_name text,
  first_seen_at timestamptz not null default now(),
  welcomed_at timestamptz,
  unique (user_id, phone)
);

alter table public.contacts enable row level security;
create policy "own contacts select" on public.contacts for select to authenticated using (auth.uid() = user_id);

-- messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone text not null,
  direction text not null check (direction in ('in','out')),
  body text not null,
  replied_by_ai boolean not null default false,
  created_at timestamptz not null default now()
);

create index messages_user_created_idx on public.messages (user_id, created_at desc);
alter table public.messages enable row level security;
create policy "own messages select" on public.messages for select to authenticated using (auth.uid() = user_id);

-- bot_session
create table public.bot_session (
  user_id uuid primary key references auth.users(id) on delete cascade,
  auth_state jsonb,
  status text not null default 'disconnected',
  pairing_code text,
  phone_number text,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.bot_session enable row level security;
create policy "own session select" on public.bot_session for select to authenticated using (auth.uid() = user_id);
create policy "own session update" on public.bot_session for update to authenticated using (auth.uid() = user_id);
create policy "own session insert" on public.bot_session for insert to authenticated with check (auth.uid() = user_id);
