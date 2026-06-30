create table if not exists shift_corrections (
  id                  uuid        default gen_random_uuid() primary key,
  entry_id            text        not null,
  staff_id            text        not null,
  staff_name          text        not null,
  shift_date          text        not null,
  original_clock_in   text        not null,
  original_clock_out  text,
  original_break_mins int         not null default 0,
  new_clock_in        text        not null,
  new_clock_out       text,
  new_break_mins      int         not null default 0,
  reason              text        not null,
  edited_by           text        not null,
  edited_by_id        text        not null,
  edited_at           timestamptz default now()
);
alter table shift_corrections enable row level security;
create policy "anon insert" on shift_corrections for insert with check (true);
create policy "anon select" on shift_corrections for select using (true);
