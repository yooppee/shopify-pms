-- Create expenses table
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  date date not null,
  item text not null,
  amount_rmb numeric default 0,
  amount_usd numeric default 0,
  person text,
  type text not null -- 'procurement' | 'logistics' | 'operating'
);

-- Enable RLS
alter table expenses enable row level security;

-- Create policies (simplified for now, strictly speaking we should check auth)
-- But for this project based on other files, we might be using service role or fully open for dev?
-- Let's enable read/write for now for authenticated users or public if previously established.
-- Checking add_variant_title.sql, it doesn't set policies. 
-- Checking listings/route.ts, it uses createServiceRoleClient().
-- So the backend will bypass RLS. 
-- We just need the table.

-- Add index for type and date for filtering
create index if not exists expenses_type_idx on expenses(type);
create index if not exists expenses_date_idx on expenses(date);
