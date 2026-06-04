import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthProvider';
import { newId } from '../lib/ids';
import { runWrite } from '../lib/runWrite';

export interface Loan {
  id: string;
  user_id: string;
  type: 'lent' | 'borrowed';
  person: string;
  principal: number;
  source: string | null;
  description: string | null;
  due_date: string | null;
  created_at: string;
  settled_at: string | null;
  expense_id: string | null;
  paid: number;
  remaining: number;
  is_settled: boolean;
  is_overdue: boolean;
}

export interface AddLoanInput {
  type: 'lent' | 'borrowed';
  person: string;
  principal: number;
  paid?: number;
  description?: string | null;
  due_date?: string | null;
  source?: string | null;
}

export interface LoanPayment {
  id: string;
  loan_id: string;
  amount: number;
  paid_at: string;
  note: string | null;
}

export interface UpdateLoanPatch {
  type?: 'lent' | 'borrowed';
  person?: string;
  principal?: number;
  description?: string | null;
  due_date?: string | null;
  source?: string | null;
  settled_at?: string | null;
}

function isWeekendNow() {
  const d = new Date();
  return d.getDay() === 0 || d.getDay() === 6;
}

// Loan writes are multi-step (expense + loan + optional payment) and were the
// hardest part of going offline: the old code did `.insert().select().single()`
// to read SERVER-generated ids and `.select()` to read current state — neither
// works offline. Now every id is minted client-side (so FK links are
// deterministic) and current state is read from the react-query cache, so the
// whole flow runs offline. The actual DB work + optimistic cache updates live in
// lib/offlineMutations.ts (keyed by mutationKey); these wrappers only shape the
// variables, computing the auto-settle decision + timestamps up front so a write
// replayed hours later on reconnect records the original moment, not "now".
export function useLoans(userId: string | undefined) {
  const queryClient = useQueryClient();

  const loansQuery = useQuery<Loan[]>({
    queryKey: ['loans', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('loans_with_totals')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((row: any) => ({
        ...row,
        principal: Number(row.principal),
        paid: Number(row.paid),
        remaining: Number(row.remaining),
      })) as Loan[];
    },
    enabled: !!userId,
  });

  // Shared scope serializes ALL loan writes for this user so that, on reconnect,
  // a loan insert always completes before a later payment/settle that FK-references
  // it (otherwise the dependent insert could race ahead and violate the FK).
  const scope = { id: `loans-${userId ?? 'anon'}` };
  const addLoanMutation = useMutation<unknown, unknown, any>({ mutationKey: ['addLoan'], scope });
  const updateLoanMutation = useMutation<unknown, unknown, any>({ mutationKey: ['updateLoan'], scope });
  const deleteLoanMutation = useMutation<unknown, unknown, any>({ mutationKey: ['deleteLoan'], scope });
  const addPaymentMutation = useMutation<unknown, unknown, any>({ mutationKey: ['addPayment'], scope });
  const settleLoanMutation = useMutation<unknown, unknown, any>({ mutationKey: ['settleLoan'], scope });

  // loans_raw holds expense_id + type (the loans_with_totals view omits expense_id).
  const getRaw = () => (queryClient.getQueryData(['loans_raw', userId]) as any[]) || [];

  const addLoan = (input: AddLoanInput) => {
    const created_at = new Date().toISOString();
    const paid = input.paid && input.paid > 0 ? input.paid : 0;
    return runWrite(addLoanMutation, {
      userId,
      loanId: newId(),
      expenseId: newId(),
      payExpenseId: paid > 0 && input.type === 'borrowed' ? newId() : null,
      paymentId: paid > 0 ? newId() : null,
      type: input.type,
      person: input.person,
      principal: input.principal,
      source: input.source ?? null,
      description: input.description ?? null,
      due_date: input.due_date ?? null,
      created_at,
      paid,
      settled_at: paid > 0 && paid >= input.principal ? created_at : null,
      is_weekend: isWeekendNow(),
    });
  };

  const updateLoan = (id: string, patch: UpdateLoanPatch) => {
    const current = getRaw().find((l) => l.id === id);
    const expensePatch: Record<string, any> = {};
    if (patch.principal !== undefined) expensePatch.amount = patch.principal;
    if (patch.source !== undefined) expensePatch.source = patch.source;
    if (patch.person !== undefined) {
      const t = patch.type ?? current?.type;
      expensePatch.description =
        t === 'lent' ? `Lent to ${patch.person}` : `Borrowed from ${patch.person}`;
    }
    return runWrite(updateLoanMutation, {
      userId,
      id,
      patch,
      expenseId: current?.expense_id ?? null,
      expensePatch,
    });
  };

  const deleteLoan = (id: string) => {
    const current = getRaw().find((l) => l.id === id);
    return runWrite(deleteLoanMutation, { userId, id, expenseId: current?.expense_id ?? null });
  };

  const addPayment = (loanId: string, amount: number, note?: string) => {
    const loan = loansQuery.data?.find((l) => l.id === loanId);
    if (!loan) return Promise.reject(new Error('Loan not found'));
    const created_at = new Date().toISOString();
    const willSettle = !loan.settled_at && loan.paid + amount >= loan.principal;
    return runWrite(addPaymentMutation, {
      userId,
      loanId,
      paymentId: newId(),
      amount,
      note: note ?? null,
      // Lent repayment → no expense row; borrowed repayment → Lending expense.
      expenseId: loan.type === 'borrowed' ? newId() : null,
      person: loan.person,
      source: loan.source ?? null,
      settled_at: willSettle ? created_at : null,
      created_at,
      is_weekend: isWeekendNow(),
    });
  };

  const settleLoan = (id: string) => {
    const loan = loansQuery.data?.find((l) => l.id === id);
    if (!loan) return Promise.reject(new Error('Loan not found'));
    const created_at = new Date().toISOString();
    const remaining = loan.remaining;
    return runWrite(
      settleLoanMutation,
      {
        userId,
        id,
        remaining,
        expenseId: remaining > 0 && loan.type === 'borrowed' ? newId() : null,
        paymentId: remaining > 0 ? newId() : null,
        person: loan.person,
        source: loan.source ?? null,
        settled_at: created_at,
        created_at,
        is_weekend: isWeekendNow(),
      },
      loan // optimistic result — handler reads loan.type/person/principal
    );
  };

  return {
    loans: loansQuery.data ?? [],
    isLoading: loansQuery.isLoading,
    addLoan,
    updateLoan,
    deleteLoan,
    addPayment,
    settleLoan,
  };
}

export function useLoanPayments(loanId: string | undefined | null) {
  const { user } = useAuth();
  const userId = user?.id;

  const query = useQuery<LoanPayment[]>({
    queryKey: ['loan_payments', loanId],
    queryFn: async () => {
      if (!loanId) return [];
      const { data, error } = await supabase
        .from('loan_payments')
        .select('*')
        .eq('loan_id', loanId)
        .order('paid_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((p: any) => ({ ...p, amount: Number(p.amount) })) as LoanPayment[];
    },
    enabled: !!loanId,
  });

  const deletePaymentMutation = useMutation<unknown, unknown, any>({
    mutationKey: ['deletePayment'],
    scope: { id: `loans-${userId ?? 'anon'}` },
  });

  // Deleting a payment reduces paid; we always clear the loan's settled_at so a
  // manually-settled loan reopens (the view would otherwise still report settled
  // via the settled_at branch even though paid < principal).
  const deletePayment = (paymentId: string) => {
    const payment = (query.data || []).find((p) => p.id === paymentId) as any;
    return runWrite(deletePaymentMutation, {
      userId,
      paymentId,
      loanId,
      expenseId: payment?.expense_id ?? null,
      reopen: true,
    });
  };

  return {
    payments: query.data ?? [],
    isLoading: query.isLoading,
    deletePayment,
  };
}
