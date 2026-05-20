-- ============================================
-- Loans 2.0 — first-class tables, decoupled from expenses
-- ============================================

create table public.loans (
  id uuid default uuid_generate_v4() primary key,
  user_id text not null,
  type text not null check (type in ('lent', 'borrowed')),
  person text not null,
  principal numeric not null check (principal > 0),
  source text,
  description text,
  due_date timestamptz,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  settled_at timestamptz
);

create index loans_user_id_idx on public.loans (user_id);
create index loans_user_active_idx on public.loans (user_id) where settled_at is null;

create table public.loan_payments (
  id uuid default uuid_generate_v4() primary key,
  loan_id uuid not null references public.loans (id) on delete cascade,
  amount numeric not null check (amount > 0),
  paid_at timestamptz default timezone('utc'::text, now()) not null,
  note text
);

create index loan_payments_loan_id_idx on public.loan_payments (loan_id);

-- View with computed paid / remaining / settled / overdue.
-- security_invoker = true makes the view respect the underlying tables' RLS
-- so it can't be used to bypass row ownership.
create or replace view public.loans_with_totals
  with (security_invoker = true) as
select
  l.id,
  l.user_id,
  l.type,
  l.person,
  l.principal,
  l.source,
  l.description,
  l.due_date,
  l.created_at,
  l.settled_at,
  coalesce(sum(p.amount), 0) as paid,
  l.principal - coalesce(sum(p.amount), 0) as remaining,
  (l.settled_at is not null or coalesce(sum(p.amount), 0) >= l.principal) as is_settled,
  (l.due_date is not null
    and l.due_date < now()
    and l.settled_at is null
    and coalesce(sum(p.amount), 0) < l.principal) as is_overdue
from public.loans l
left join public.loan_payments p on p.loan_id = l.id
group by l.id;

-- ============================================
-- Row Level Security
-- ============================================
alter table public.loans enable row level security;
alter table public.loan_payments enable row level security;

create policy "loans_select" on public.loans
  for select using (auth.uid()::text = user_id);
create policy "loans_insert" on public.loans
  for insert with check (auth.uid()::text = user_id);
create policy "loans_update" on public.loans
  for update using (auth.uid()::text = user_id);
create policy "loans_delete" on public.loans
  for delete using (auth.uid()::text = user_id);

create policy "loan_payments_select" on public.loan_payments
  for select using (
    auth.uid()::text = (select user_id from public.loans where id = loan_payments.loan_id)
  );
create policy "loan_payments_insert" on public.loan_payments
  for insert with check (
    auth.uid()::text = (select user_id from public.loans where id = loan_payments.loan_id)
  );
create policy "loan_payments_update" on public.loan_payments
  for update using (
    auth.uid()::text = (select user_id from public.loans where id = loan_payments.loan_id)
  );
create policy "loan_payments_delete" on public.loan_payments
  for delete using (
    auth.uid()::text = (select user_id from public.loans where id = loan_payments.loan_id)
  );
