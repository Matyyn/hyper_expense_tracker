export type CurrencyCode = 'PKR' | 'USD' | 'EUR' | 'GBP' | 'INR' | 'AED' | 'SAR' | 'BDT';

export interface CurrencyDef {
  code: CurrencyCode;
  symbol: string;
  name: string;
  locale: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyDef> = {
  PKR: { code: 'PKR', symbol: 'Rs.', name: 'Pakistani Rupee', locale: 'en-PK' },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US' },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', locale: 'en-IE' },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', locale: 'en-GB' },
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee', locale: 'en-IN' },
  AED: { code: 'AED', symbol: 'AED', name: 'UAE Dirham', locale: 'en-AE' },
  SAR: { code: 'SAR', symbol: 'SAR', name: 'Saudi Riyal', locale: 'en-SA' },
  BDT: { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka', locale: 'en-BD' },
};

export const CURRENCY_LIST: CurrencyDef[] = Object.values(CURRENCIES);

export function getCurrency(code: string | undefined | null): CurrencyDef {
  if (!code) return CURRENCIES.PKR;
  return CURRENCIES[code as CurrencyCode] || CURRENCIES.PKR;
}

export function formatMoney(amount: number, code: CurrencyCode | string = 'PKR'): string {
  const c = getCurrency(code);
  return `${c.symbol} ${Math.round(amount).toLocaleString(c.locale)}`;
}
