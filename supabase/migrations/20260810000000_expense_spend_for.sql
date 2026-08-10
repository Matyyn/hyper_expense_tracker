-- Self / Family spend scope on expenses.
-- Every existing row is treated as a personal ("self") expense.

alter table public.expenses
  add column if not exists spend_for text not null default 'self';

alter table public.expenses
  drop constraint if exists expenses_spend_for_check;

alter table public.expenses
  add constraint expenses_spend_for_check check (spend_for in ('self', 'family'));

-- Analytics always slices by user first, then scope.
create index if not exists expenses_user_spend_for_idx
  on public.expenses (user_id, spend_for);
