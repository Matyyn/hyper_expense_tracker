# Hyper Expense

A fast, offline-first personal finance tracker for iOS, Android, and web. Log expenses and income, set budgets with automatic month-end rollover, track savings goals, manage money lent and borrowed, and review spending analytics — all with full light/dark theming and multi-currency support.

Built with **Expo (SDK 54)**, **React Native 0.81**, **React 19**, **Supabase**, and **TanStack Query v5**.

---

## Features

- **Expense & income logging** — quick-log templates (commute / food / custom), custom entries, payment-source tracking, and back-dated entries.
- **Budgets with month-end rollover** — set a monthly budget and period end date; on expiry, leftover is swept into total savings, recorded in a month-wise history, and you're prompted to start a new period.
- **Savings goals** — multiple named goals with targets, deadlines, and contributions; expired goals sweep their balance into total savings automatically.
- **Loans** — track money **lent** and **borrowed**, with partial payments, auto-settlement, due dates, and overdue flags. Loans are linked to expense/income entries so budgets and analytics stay accurate.
- **Self / Family spending** — tag every expense as personal or family (in the entry form, on Quick Log, and when editing), then compare the two.
- **Analytics** — weekly/monthly spend charts, per-category breakdowns, and category budget limits with alerts. An **Everything / Self / Family** switch re-slices the whole screen, with dedicated Self-vs-Family totals and a per-category split.
- **History** — browse any month, filter by Self / Family, edit or delete past entries.
- **Offline mode + auto-resync** — view everything and make changes with no connection; queued writes survive an app restart and replay in order when you reconnect. See [Offline architecture](#offline-architecture).
- **Theming** — Light / Dark / System, persisted per-device and synced to the account.
- **Multi-currency** — display amounts in your preferred currency.
- **Account** — email/password auth with OTP email verification, password reset, and account deletion.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| App framework | Expo SDK 54, Expo Router (file-based, typed routes) |
| UI | React Native 0.81, React 19, NativeWind (Tailwind), Reanimated |
| Server state | TanStack Query v5 (+ persist-client for offline) |
| Backend | Supabase (Postgres, Auth, Row Level Security, Edge Functions) |
| Local storage | AsyncStorage (query cache), Expo SecureStore (auth session, theme) |
| Connectivity | `@react-native-community/netinfo` → react-query `onlineManager` |

---

## Project structure

```
app/                     # Expo Router screens
  (auth)/                #   login, reset-password
  (tabs)/                #   index (dashboard), analytics, history, savings, settings
  _layout.tsx            #   providers, query persistence, routing
components/              # Providers (Auth, Theme, Currency, Notification) + UI
hooks/
  useExpenseSync.ts      # expenses / profile / templates queries + mutations
  useLoans.ts            # loans + loan payments
  useUserMetadata.ts     # auth user_metadata mirror (offline-capable)
lib/
  supabase.ts            # Supabase client (chunked SecureStore session storage)
  queryClient.ts         # shared QueryClient + persisted-key whitelist
  offlineMutations.ts    # central offline write registry (mutation defaults)
  online.ts              # NetInfo ↔ onlineManager bridge
  persist.ts             # AsyncStorage persister
  runWrite.ts            # offline-first await helper
  ids.ts                 # client-side UUIDs (expo-crypto)
  theme.ts, currency.ts  # palettes and currency definitions
supabase/
  schema.sql             # base schema
  migrations/            # incremental migrations (loans, RLS policies, OTP, …)
  functions/             # Edge Functions: send-otp, verify-otp, delete-account
```

---

## Getting started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- For device testing: the **Expo Go** app, or an Android/iOS simulator

### 1. Install

```bash
npm install
```

### 2. Configure environment

Create a `.env` file in the project root:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

These are read in `lib/supabase.ts`. (The `EXPO_PUBLIC_` prefix is required for Expo to expose them to the client.)

### 3. Set up the database

Apply the schema and migrations to your Supabase project — either via the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

…or by running `supabase/schema.sql` followed by the files in `supabase/migrations/` (in filename order) in the Supabase SQL editor.

Deploy the Edge Functions used for OTP verification and account deletion:

```bash
supabase functions deploy send-otp
supabase functions deploy verify-otp
supabase functions deploy delete-account
```

The OTP email function expects SMTP credentials configured as function secrets (see `supabase/functions/send-otp/index.ts`).

### 4. Run

```bash
npm start          # Expo dev server (then scan the QR with Expo Go)
npm run android    # open on Android emulator/device
npm run ios        # open on iOS simulator/device
npm run web        # run in the browser
```

> **Works in Expo Go.** The native dependencies (`async-storage`, `netinfo`, `expo-crypto`) are bundled into Expo Go, so no custom dev client is required. If you pull new native deps, run `npx expo start -c` to clear the Metro cache.

---

## Data model

| Table / view | Purpose |
| --- | --- |
| `profiles` | per-user budget, savings goal, total savings |
| `expenses` | all entries: spend, `Income`, `Lending`, `Loan Return`. `spend_for` scopes a row to `self` or `family` |
| `categories` | user categories (icon, color, order) |
| `quick_templates` | one-tap logging presets, grouped (commute/food/custom) |
| `loans` | money lent/borrowed, linked to an expense entry |
| `loan_payments` | partial/full repayments against a loan |
| `loans_with_totals` | view computing `paid` / `remaining` / `is_settled` / `is_overdue` |

Account settings that don't need a table (currency, username, category budgets, savings goals, budget period metadata) live in Supabase Auth `user_metadata`. All tables are protected by Row Level Security keyed on the authenticated user.

---

## Offline architecture

Offline support uses TanStack Query's offline model rather than a bespoke sync engine:

- The query cache **and** any writes made while offline (paused mutations) are persisted to AsyncStorage via `PersistQueryClientProvider`, so they survive an app restart.
- Writes are registered centrally in `lib/offlineMutations.ts` (`setMutationDefaults` keyed by `mutationKey`) so a paused mutation can be replayed after a restart — its function is looked up by key.
- Every insert uses a **client-generated UUID**, so the optimistic row and the eventual server row are the same row (no duplicates on resync), and loan → expense foreign-key links resolve deterministically offline.
- Connectivity changes (NetInfo → `onlineManager`) automatically resume queued writes **in order** on reconnect.
- A minimal status icon in the dashboard header shows offline / syncing state.

Strictly-online actions (password change, account deletion, the month-end rollover's server reconciliation) are guarded and never queued.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run android` | Build & open on Android |
| `npm run ios` | Build & open on iOS |
| `npm run web` | Run the web build |
| `npx tsc --noEmit` | Type-check the project |

---

## App identifiers

- Name / slug: **Hyper Expense** (`hyper-expense`)
- iOS bundle: `com.bazilsb.hyperexpense`
- Android package: `com.bazilsb.hyperexpense`
- URL scheme: `expensetracker`

---

## License

Private project — all rights reserved unless stated otherwise.
