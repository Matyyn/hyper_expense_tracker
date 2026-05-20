-- Link each loan payment to its corresponding ledger row in expenses.
-- Lent payments → Income row (money returned to you).
-- Borrowed payments → Lending row (money going out to repay).
-- ON DELETE SET NULL so deleting the expense doesn't orphan the payment.
ALTER TABLE public.loan_payments
  ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;
