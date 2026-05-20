import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['loans', userId] });
    // Lent loans create a Lending expense row; expense queries need refresh.
    queryClient.invalidateQueries({ queryKey: ['expenses', userId] });
  };

  // Lent loans create a linked expense row so the loan deducts from the
  // monthly budget and appears in the analytics source breakdown. Borrowed
  // loans don't (otherwise borrowed money would inflate this month's income
  // even though it isn't truly earned).
  const addLoanMutation = useMutation({
    mutationFn: async (input: AddLoanInput) => {
      if (!userId) throw new Error('Not signed in');

      let expenseId: string | null = null;
      if (input.type === 'lent') {
        const now = new Date();
        const isWeekend = now.getDay() === 0 || now.getDay() === 6;
        const { data: expense, error: expErr } = await supabase
          .from('expenses')
          .insert([{
            user_id: userId,
            amount: input.principal,
            description: `Lent to ${input.person}`,
            category: 'Lending',
            source: input.source ?? null,
            is_weekend: isWeekend,
          }])
          .select()
          .single();
        if (expErr) throw expErr;
        expenseId = expense.id;
      }

      const { data: loan, error } = await supabase
        .from('loans')
        .insert([{
          user_id: userId,
          type: input.type,
          person: input.person,
          principal: input.principal,
          source: input.source ?? null,
          description: input.description ?? null,
          due_date: input.due_date ?? null,
          expense_id: expenseId,
        }])
        .select()
        .single();
      if (error) {
        // Roll back the orphaned ledger row so we don't leave a Lending
        // entry without a loan record pointing at it.
        if (expenseId) {
          await supabase.from('expenses').delete().eq('id', expenseId);
        }
        throw error;
      }

      if (input.paid && input.paid > 0) {
        const { error: payErr } = await supabase.from('loan_payments').insert([{
          loan_id: loan.id,
          amount: input.paid,
          note: 'Initial paid amount',
        }]);
        if (payErr) throw payErr;
      }
      return loan;
    },
    onSettled: invalidate,
  });

  const updateLoanMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateLoanPatch }) => {
      const { data: current, error: getErr } = await supabase
        .from('loans')
        .select('expense_id, type, person')
        .eq('id', id)
        .single();
      if (getErr) throw getErr;

      const { error } = await supabase.from('loans').update(patch).eq('id', id);
      if (error) throw error;

      if (current?.expense_id) {
        const expensePatch: Record<string, any> = {};
        if (patch.principal !== undefined) expensePatch.amount = patch.principal;
        if (patch.source !== undefined) expensePatch.source = patch.source;
        if (patch.person !== undefined) {
          const t = patch.type ?? current.type;
          expensePatch.description = t === 'lent' ? `Lent to ${patch.person}` : `Borrowed from ${patch.person}`;
        }
        if (Object.keys(expensePatch).length > 0) {
          await supabase.from('expenses').update(expensePatch).eq('id', current.expense_id);
        }
      }
    },
    onSettled: invalidate,
  });

  const deleteLoanMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: current } = await supabase
        .from('loans')
        .select('expense_id')
        .eq('id', id)
        .single();
      const { error } = await supabase.from('loans').delete().eq('id', id);
      if (error) throw error;
      if (current?.expense_id) {
        await supabase.from('expenses').delete().eq('id', current.expense_id);
      }
    },
    onSettled: invalidate,
  });

  const addPaymentMutation = useMutation({
    mutationFn: async ({ loanId, amount, note }: { loanId: string; amount: number; note?: string }) => {
      const { error } = await supabase.from('loan_payments').insert([{
        loan_id: loanId,
        amount,
        note: note ?? null,
      }]);
      if (error) throw error;
    },
    onSettled: invalidate,
  });

  // Insert a payment for the remaining balance (if any) and stamp settled_at.
  // Done as two writes; if the second fails, we have an extra payment row
  // that the user can see in payment history — not silently corrupted.
  const settleLoanMutation = useMutation({
    mutationFn: async (id: string) => {
      const loan = loansQuery.data?.find(l => l.id === id);
      if (!loan) throw new Error('Loan not found');
      if (loan.remaining > 0) {
        const { error: payErr } = await supabase.from('loan_payments').insert([{
          loan_id: id,
          amount: loan.remaining,
          note: 'Settled',
        }]);
        if (payErr) throw payErr;
      }
      const { error } = await supabase
        .from('loans')
        .update({ settled_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      return loan;
    },
    onSettled: invalidate,
  });

  return {
    loans: loansQuery.data ?? [],
    isLoading: loansQuery.isLoading,
    addLoan: addLoanMutation.mutateAsync,
    updateLoan: (id: string, patch: UpdateLoanPatch) => updateLoanMutation.mutateAsync({ id, patch }),
    deleteLoan: deleteLoanMutation.mutateAsync,
    addPayment: (loanId: string, amount: number, note?: string) =>
      addPaymentMutation.mutateAsync({ loanId, amount, note }),
    settleLoan: settleLoanMutation.mutateAsync,
  };
}

export function useLoanPayments(loanId: string | undefined | null) {
  const queryClient = useQueryClient();

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

  // Deleting a payment reduces paid. If the loan was previously stamped
  // settled_at (via the Settle button), clear it so the loan reopens —
  // otherwise the view would still report is_settled = true via the
  // settled_at branch even though paid < principal.
  const deletePaymentMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const { data: payment, error: getErr } = await supabase
        .from('loan_payments')
        .select('loan_id')
        .eq('id', paymentId)
        .single();
      if (getErr) throw getErr;
      const { error } = await supabase.from('loan_payments').delete().eq('id', paymentId);
      if (error) throw error;
      if (payment?.loan_id) {
        await supabase.from('loans').update({ settled_at: null }).eq('id', payment.loan_id);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['loan_payments', loanId] });
      queryClient.invalidateQueries({ queryKey: ['loans'] });
    },
  });

  return {
    payments: query.data ?? [],
    isLoading: query.isLoading,
    deletePayment: deletePaymentMutation.mutateAsync,
  };
}
