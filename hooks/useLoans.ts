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
    queryClient.invalidateQueries({ queryKey: ['loans_raw', userId] });
    queryClient.invalidateQueries({ queryKey: ['loan_payments_all', userId] });
    queryClient.invalidateQueries({ queryKey: ['expenses', userId] });
    queryClient.invalidateQueries({ queryKey: ['expenses-history'] });
  };

  function isWeekendDate(d: Date) {
    return d.getDay() === 0 || d.getDay() === 6;
  }

  async function createLinkedExpense(opts: {
    amount: number;
    description: string;
    category: string;
    source: string | null;
  }) {
    const now = new Date();
    const { data, error } = await supabase
      .from('expenses')
      .insert([{
        user_id: userId,
        amount: opts.amount,
        description: opts.description,
        category: opts.category,
        source: opts.source,
        is_weekend: isWeekendDate(now),
      }])
      .select()
      .single();
    if (error) throw error;
    return data.id as string;
  }

  // Lent loans   → Lending expense (deducts budget, money left wallet).
  // Borrowed loans → Income expense (adds to source budget, money received).
  // Lent repaid   → NO expense row. Repayment just cancels the original lend; tracked in loans table only.
  // Borrowed repaid → Lending expense (deducts budget, money leaving to repay).
  const addLoanMutation = useMutation({
    mutationFn: async (input: AddLoanInput) => {
      if (!userId) throw new Error('Not signed in');

      const expenseId = await createLinkedExpense({
        amount: input.principal,
        description: input.type === 'lent'
          ? `Lent to ${input.person}`
          : `Borrowed from ${input.person}`,
        category: input.type === 'lent' ? 'Lending' : 'Income',
        source: input.source ?? null,
      });

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
        await supabase.from('expenses').delete().eq('id', expenseId);
        throw error;
      }

      // Initial paid amount: lent repayment → no expense; borrowed repayment → Lending expense.
      if (input.paid && input.paid > 0) {
        let payExpenseId: string | null = null;
        if (input.type === 'borrowed') {
          payExpenseId = await createLinkedExpense({
            amount: input.paid,
            description: `Repayment to ${input.person}`,
            category: 'Lending',
            source: input.source ?? null,
          });
        }
        const { error: payErr } = await supabase.from('loan_payments').insert([{
          loan_id: loan.id,
          amount: input.paid,
          note: 'Initial paid amount',
          expense_id: payExpenseId,
        }]);
        if (payErr) {
          if (payExpenseId) await supabase.from('expenses').delete().eq('id', payExpenseId);
          throw payErr;
        }
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
      const loan = loansQuery.data?.find(l => l.id === loanId);
      if (!loan) throw new Error('Loan not found');

      // Lent repayment → no expense row (repayment just cancels the original lend).
      // Borrowed repayment → Lending expense (money leaving wallet to repay debt).
      let expenseId: string | null = null;
      if (loan.type === 'borrowed') {
        expenseId = await createLinkedExpense({
          amount,
          description: `Repayment to ${loan.person}`,
          category: 'Lending',
          source: loan.source ?? null,
        });
      }

      const { error } = await supabase.from('loan_payments').insert([{
        loan_id: loanId,
        amount,
        note: note ?? null,
        expense_id: expenseId,
      }]);
      if (error) {
        if (expenseId) await supabase.from('expenses').delete().eq('id', expenseId);
        throw error;
      }
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
        let expenseId: string | null = null;
        if (loan.type === 'borrowed') {
          expenseId = await createLinkedExpense({
            amount: loan.remaining,
            description: `Repayment to ${loan.person}`,
            category: 'Lending',
            source: loan.source ?? null,
          });
        }
        const { error: payErr } = await supabase.from('loan_payments').insert([{
          loan_id: id,
          amount: loan.remaining,
          note: 'Settled',
          expense_id: expenseId,
        }]);
        if (payErr) {
          if (expenseId) await supabase.from('expenses').delete().eq('id', expenseId);
          throw payErr;
        }
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
        .select('loan_id, expense_id')
        .eq('id', paymentId)
        .single();
      if (getErr) throw getErr;
      const { error } = await supabase.from('loan_payments').delete().eq('id', paymentId);
      if (error) throw error;
      if (payment?.expense_id) {
        await supabase.from('expenses').delete().eq('id', payment.expense_id);
      }
      if (payment?.loan_id) {
        await supabase.from('loans').update({ settled_at: null }).eq('id', payment.loan_id);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['loan_payments', loanId] });
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });

  return {
    payments: query.data ?? [],
    isLoading: query.isLoading,
    deletePayment: deletePaymentMutation.mutateAsync,
  };
}
