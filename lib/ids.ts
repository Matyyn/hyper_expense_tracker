import * as Crypto from 'expo-crypto';

// Client-generated v4 UUID. Used so offline inserts have stable, real ids that
// match the optimistic cache row AND the eventual server row (no duplicates on
// reconcile), and so loan FK links (expense_id, loan_id) are deterministic
// without a server round-trip. Tables default id to uuid_generate_v4(), which a
// supplied value safely overrides. Synchronous + offline-safe on Hermes.
export function newId(): string {
  return Crypto.randomUUID();
}
