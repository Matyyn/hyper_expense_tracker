import React, { createContext, useContext, useMemo } from 'react';
import { useUserMetadata } from '../hooks/useUserMetadata';
import { CurrencyCode, CurrencyDef, formatMoney as fmt, getCurrency } from '../lib/currency';

interface CurrencyContextValue {
  code: CurrencyCode;
  currency: CurrencyDef;
  format: (amount: number) => string;
  symbol: string;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  code: 'PKR',
  currency: getCurrency('PKR'),
  format: (n) => fmt(n, 'PKR'),
  symbol: 'Rs.',
});

export const useCurrency = () => useContext(CurrencyContext);

export const CurrencyProvider = ({ children }: { children: React.ReactNode }) => {
  const metadata = useUserMetadata();

  const value = useMemo<CurrencyContextValue>(() => {
    const rawCode = (metadata?.currency as string) || 'PKR';
    const currency = getCurrency(rawCode);
    return {
      code: currency.code,
      currency,
      symbol: currency.symbol,
      format: (n: number) => fmt(n, currency.code),
    };
  }, [metadata?.currency]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
};
