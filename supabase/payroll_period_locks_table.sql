create table if not exists payroll_period_locks (
  id           uuid        default gen_random_uuid() primary key,
  run_id       text        not null unique,
  period_start text        not null,
  period_end   text        not null,
  locked_by    text        not null,
  locked_at    timestamptz default now(),
  is_locked    boolean     not null default true,
  unlocked_by  text,
  unlocked_at  timestamptz
);
alter table payroll_period_locks enable row level security;
create policy "anon insert"  on payroll_period_locks for insert with check (true);
create policy "anon select"  on payroll_period_locks for select using (true);
create policy "anon update"  on payroll_period_locks for update using (true);
