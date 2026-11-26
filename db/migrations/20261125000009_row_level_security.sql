-- Least-privilege hardening for a dedicated application database.
--
-- The application connects with ONE dedicated role that owns this database's
-- objects. Browsers never connect to PostgreSQL; every read and write goes
-- through server code that performs authorisation checks.
--
-- Row Level Security is enabled on every table as defence in depth: no
-- policies exist, so any other (non-owner) role that is ever granted access
-- sees nothing unless a policy is added deliberately.

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on public.%I from public', t.tablename);
  end loop;
end $$;

revoke create on schema public from public;
revoke all on all sequences in schema public from public;
alter default privileges in schema public revoke all on tables from public;
alter default privileges in schema public revoke all on sequences from public;
