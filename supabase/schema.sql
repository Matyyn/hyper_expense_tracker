-- ============================================
-- Hyper Expense — Full Database Schema
-- ============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- Table: profiles
-- ============================================
create table public.profiles (
  id text not null primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  monthly_budget numeric default 20000.0 not null,
  savings_goal numeric default 5000.0 not null,
  total_savings numeric default 0.0 not null
);

-- Seed Test Profile
insert into public.profiles (id, monthly_budget, savings_goal, total_savings)
values ('test-pk-user-777', 20000.0, 5000.0, 0.0)
on conflict (id) do nothing;

-- ============================================
-- Table: categories
-- User-customizable expense categories
-- ============================================
create table public.categories (
  id uuid default uuid_generate_v4() primary key,
  user_id text not null,
  name text not null,
  icon text not null default '💸',
  color text not null default '#818cf8',
  sort_order integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Seed default categories for test user
insert into public.categories (user_id, name, icon, color, sort_order) values
  ('test-pk-user-777', 'Food', '🍽️', '#f43f5e', 0),
  ('test-pk-user-777', 'Commute', '🚗', '#f97316', 1),
  ('test-pk-user-777', 'Shopping', '🛍️', '#eab308', 2),
  ('test-pk-user-777', 'Bills', '📄', '#22c55e', 3),
  ('test-pk-user-777', 'Health', '💊', '#06b6d4', 4),
  ('test-pk-user-777', 'Entertainment', '🎬', '#8b5cf6', 5),
  ('test-pk-user-777', 'Misc', '💸', '#64748b', 6);

-- ============================================
-- Table: quick_templates
-- Pre-saved quick-log buttons (commute, meals)
-- ============================================
create table public.quick_templates (
  id uuid default uuid_generate_v4() primary key,
  user_id text not null,
  title text not null,
  amount numeric not null,
  category text not null,
  icon text not null default '💸',
  group_name text not null default 'custom',
  sort_order integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Seed default quick templates for test user
insert into public.quick_templates (user_id, title, amount, category, icon, group_name, sort_order) values
  ('test-pk-user-777', 'To Office', 150, 'Commute', '🏡', 'commute', 0),
  ('test-pk-user-777', 'To Home', 150, 'Commute', '🏢', 'commute', 1),
  ('test-pk-user-777', 'Breakfast', 250, 'Food', '🍳', 'food', 0),
  ('test-pk-user-777', 'Lunch', 450, 'Food', '🍛', 'food', 1),
  ('test-pk-user-777', 'Dinner', 750, 'Food', '🍗', 'food', 2);

-- ============================================
-- Table: expenses
-- ============================================
create table public.expenses (
  id uuid default uuid_generate_v4() primary key,
  user_id text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  amount numeric not null,
  description text not null,
  category text not null,
  is_weekend boolean not null default false
);

-- Enable Row Level Security
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.quick_templates enable row level security;
alter table public.expenses enable row level security;

-- ============================================
-- RLS Policies
-- ============================================

-- Profiles: Users can only see and edit their own profile
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid()::text = id);

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid()::text = id);

create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid()::text = id);

-- Categories: Visible to everyone, but normally you might scope to user_id. 
-- For now, allow everyone to see standard categories.
create policy "Anyone can view categories" on public.categories
  for select using (true);

-- Quick Templates: Visible and editable by the owner
create policy "Users can view own templates" on public.quick_templates
  for select using (auth.uid()::text = user_id);

create policy "Users can update own templates" on public.quick_templates
  for update using (auth.uid()::text = user_id);

create policy "Users can insert own templates" on public.quick_templates
  for insert with check (auth.uid()::text = user_id);

-- Expenses: Only visible and editable by the owner
create policy "Users can view own expenses" on public.expenses
  for select using (auth.uid()::text = user_id);

create policy "Users can insert own expenses" on public.expenses
  for insert with check (auth.uid()::text = user_id);

create policy "Users can delete own expenses" on public.expenses
  for delete using (auth.uid()::text = user_id);

create policy "Users can update own expenses" on public.expenses
  for update using (auth.uid()::text = user_id);

-- ============================================
-- RLS Policies (for future auth)
-- ============================================
create policy "profiles_select" on public.profiles for select using (auth.uid()::text = id);
create policy "profiles_update" on public.profiles for update using (auth.uid()::text = id);

create policy "categories_select" on public.categories for select using (auth.uid()::text = user_id);
create policy "categories_insert" on public.categories for insert with check (auth.uid()::text = user_id);
create policy "categories_update" on public.categories for update using (auth.uid()::text = user_id);
create policy "categories_delete" on public.categories for delete using (auth.uid()::text = user_id);

create policy "templates_select" on public.quick_templates for select using (auth.uid()::text = user_id);
create policy "templates_insert" on public.quick_templates for insert with check (auth.uid()::text = user_id);
create policy "templates_update" on public.quick_templates for update using (auth.uid()::text = user_id);
create policy "templates_delete" on public.quick_templates for delete using (auth.uid()::text = user_id);

create policy "expenses_select" on public.expenses for select using (auth.uid()::text = user_id);
create policy "expenses_insert" on public.expenses for insert with check (auth.uid()::text = user_id);
create policy "expenses_update" on public.expenses for update using (auth.uid()::text = user_id);
create policy "expenses_delete" on public.expenses for delete using (auth.uid()::text = user_id);

-- ============================================
-- Functions
-- ============================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, monthly_budget, savings_goal, total_savings)
  values (new.id::text, 20000.0, 5000.0, 0.0);
  
  -- Seed default categories
  insert into public.categories (user_id, name, icon, color, sort_order) values
    (new.id::text, 'Food', '🍽️', '#f43f5e', 0),
    (new.id::text, 'Commute', '🚗', '#f97316', 1),
    (new.id::text, 'Shopping', '🛍️', '#eab308', 2),
    (new.id::text, 'Bills', '📄', '#22c55e', 3),
    (new.id::text, 'Health', '💊', '#06b6d4', 4),
    (new.id::text, 'Entertainment', '🎬', '#8b5cf6', 5),
    (new.id::text, 'Misc', '💸', '#64748b', 6);

  -- Seed default quick templates
  insert into public.quick_templates (user_id, title, amount, category, icon, group_name, sort_order) values
    (new.id::text, 'To Office', 150, 'Commute', '🏡', 'commute', 0),
    (new.id::text, 'To Home', 150, 'Commute', '🏢', 'commute', 1),
    (new.id::text, 'Breakfast', 250, 'Food', '🍳', 'food', 0),
    (new.id::text, 'Lunch', 450, 'Food', '🍛', 'food', 1),
    (new.id::text, 'Dinner', 750, 'Food', '🍗', 'food', 2);

  return new;
end;
$$;
