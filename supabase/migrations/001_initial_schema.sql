-- Mamãe Me Ajuda — initial schema
-- Supabase auth.users handles parent authentication automatically.
-- We store extended profile and children data here.

-- Enable UUID extension (already available in Supabase)
create extension if not exists "uuid-ossp";

-- ─── children ────────────────────────────────────────────────────────────────
-- Each child is linked to a parent (auth.users.id).
create table if not exists public.children (
  id         uuid primary key default uuid_generate_v4(),
  parent_id  uuid not null references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 100),
  grade      text not null check (char_length(grade) between 1 and 50),
  subjects   text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.children(parent_id);

-- ─── conversations ────────────────────────────────────────────────────────────
create table if not exists public.conversations (
  id         uuid primary key default uuid_generate_v4(),
  child_id   uuid not null references public.children(id) on delete cascade,
  parent_id  uuid not null references auth.users(id) on delete cascade,
  title      text not null default 'Nova conversa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.conversations(child_id);
create index on public.conversations(parent_id);

-- ─── messages ────────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'model')),
  content         text not null,
  has_image       boolean not null default false,
  created_at      timestamptz not null default now()
);

create index on public.messages(conversation_id);

-- ─── updated_at trigger ───────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger children_updated_at
  before update on public.children
  for each row execute function public.set_updated_at();

create trigger conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table public.children      enable row level security;
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

-- children: parent can only see/modify their own children
create policy "children_select_own" on public.children
  for select using (auth.uid() = parent_id);

create policy "children_insert_own" on public.children
  for insert with check (auth.uid() = parent_id);

create policy "children_update_own" on public.children
  for update using (auth.uid() = parent_id);

create policy "children_delete_own" on public.children
  for delete using (auth.uid() = parent_id);

-- conversations: parent can only see their own
create policy "conversations_select_own" on public.conversations
  for select using (auth.uid() = parent_id);

create policy "conversations_insert_own" on public.conversations
  for insert with check (auth.uid() = parent_id);

create policy "conversations_update_own" on public.conversations
  for update using (auth.uid() = parent_id);

create policy "conversations_delete_own" on public.conversations
  for delete using (auth.uid() = parent_id);

-- messages: accessible if the parent owns the conversation
create policy "messages_select_own" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.parent_id = auth.uid()
    )
  );

create policy "messages_insert_own" on public.messages
  for insert with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.parent_id = auth.uid()
    )
  );

create policy "messages_delete_own" on public.messages
  for delete using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.parent_id = auth.uid()
    )
  );
