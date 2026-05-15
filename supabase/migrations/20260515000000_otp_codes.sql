create table if not exists otp_codes (
  id uuid default gen_random_uuid() primary key,
  email text not null,
  otp text not null,
  expires_at timestamptz not null,
  used boolean default false,
  created_at timestamptz default now()
);

create index if not exists otp_codes_email_idx on otp_codes (email);
