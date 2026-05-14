-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Table: profiles
create table public.profiles (
  id text not null primary key, -- Text ID to handle both Auth UUIDs and Bypass Test ID
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  monthly_budget numeric default 45000.0 not null,
  total_savings numeric default 0.0 not null
);

-- Seed a Test Profile for Bypass Mode
insert into public.profiles (id, monthly_budget, total_savings)
values ('test-pk-user-777', 20000.0, 5000.0)
on conflict (id) do nothing;

-- Table: templates
create table public.templates (
  id uuid default uuid_generate_v4() primary key,
  user_id text not null, -- Changed to text for bypass/auth compatibility
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  title text not null,
  amount numeric not null,
  icon text
);

-- Table: expenses
create table public.expenses (
  id uuid default uuid_generate_v4() primary key,
  user_id text not null, -- Changed to text for bypass/auth compatibility
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  amount numeric not null,
  description text not null,
  category text not null,
  is_weekend boolean not null default false
);

--- Row Level Security (RLS) ---
-- (Disabled for Bypass Testing Mode)
-- alter table public.profiles enable row level security;
-- alter table public.templates enable row level security;
-- alter table public.expenses enable row level security;

-- Profiles Policies
create policy "Users can view their own profile"
  on public.profiles for select
  using ( auth.uid()::text = id ); -- Cast auth.uid() to text for comparison

create policy "Users can update their own profile"
  on public.profiles for update
  using ( auth.uid()::text = id );

-- Templates Policies
create policy "Users can view their own templates"
  on public.templates for select
  using ( auth.uid()::text = user_id );

create policy "Users can insert their own templates"
  on public.templates for insert
  with check ( auth.uid()::text = user_id );

-- Expenses Policies
create policy "Users can view their own expenses"
  on public.expenses for select
  using ( auth.uid()::text = user_id );

create policy "Users can insert their own expenses"
  on public.expenses for insert
  with check ( auth.uid()::text = user_id );

create policy "Users can update their own expenses"
  on public.expenses for update
  using ( auth.uid()::text = user_id );

create policy "Users can delete their own expenses"
  on public.expenses for delete
  using ( auth.uid()::text = user_id );

--- Functions ---
-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, monthly_budget, total_savings)
  values (new.id::text, 45000.0, 0.0); -- Cast new.id to text
  return new;
end;
$$;

-- Trigger to create profile after signup
-- drop trigger if exists on_auth_user_created on auth.users;
-- create trigger on_auth_user_created
--   after insert on auth.users
--   for each row execute procedure public.handle_new_user();
