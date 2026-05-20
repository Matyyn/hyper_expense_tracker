-- Borrowed loans should never have a linked creation expense.
-- Earlier code wrongly created a 'Loan Return' expense for borrowed loans.
-- This migration deletes those orphaned rows and nulls the reference.

-- Delete the wrongly-created expense rows for borrowed loans
delete from public.expenses
where id in (
  select expense_id
  from public.loans
  where type = 'borrowed'
    and expense_id is not null
);

-- Clear the stale expense_id references
update public.loans
set expense_id = null
where type = 'borrowed'
  and expense_id is not null;
