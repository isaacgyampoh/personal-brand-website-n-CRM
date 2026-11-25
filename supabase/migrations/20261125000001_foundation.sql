-- Foundation: extensions, helpers, identity, settings, audit, jobs, media.
-- Portable PostgreSQL (>= 15). Runs on Supabase and on self-hosted Postgres.

create extension if not exists citext;
create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- Supabase API roles. They exist on Supabase; created here (NOLOGIN) on plain
-- Postgres so RLS/grant statements are portable.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function forbid_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'IMMUTABLE_RECORD: % rows cannot be %', tg_table_name, lower(tg_op)
    using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------------------
-- Settings (validated in application by per-key Zod schemas)
-- ---------------------------------------------------------------------------
create table settings (
  key text primary key check (key ~ '^[a-z_]{2,48}$'),
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create trigger settings_updated before update on settings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Identity. users.id equals the Supabase Auth user id when AUTH_PROVIDER=supabase.
-- No FK to auth.users, so the schema stays portable.
-- ---------------------------------------------------------------------------
create table users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  full_name text not null default '' check (length(full_name) <= 200),
  phone text check (phone is null or length(phone) <= 32),
  role text not null default 'customer'
    check (role in ('owner','admin','content_manager','booking_manager','finance_manager','customer')),
  status text not null default 'active' check (status in ('active','suspended','deleted')),
  password_hash text,
  email_verified_at timestamptz,
  mfa_secret_encrypted text,
  mfa_enabled_at timestamptz,
  failed_login_count int not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  timezone text not null default 'Africa/Accra',
  notification_prefs jsonb not null default '{"email": true, "sms": false, "marketing": false}'::jsonb,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger users_updated before update on users
  for each row execute function set_updated_at();
create index users_role_idx on users (role) where role <> 'customer';

create table role_permissions (
  role text not null check (role in ('owner','admin','content_manager','booking_manager','finance_manager','customer')),
  permission text not null check (permission ~ '^[a-z_]+:[a-z_]+$'),
  primary key (role, permission)
);

-- Local auth sessions (AUTH_PROVIDER=local). Only token hashes are stored.
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  mfa_verified boolean not null default false,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index sessions_user_idx on sessions (user_id);
create index sessions_expiry_idx on sessions (expires_at);

create table auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  email citext not null,
  purpose text not null check (purpose in ('verify_email','reset_password','magic_link','claim_purchase')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index auth_tokens_email_idx on auth_tokens (email, purpose);

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_label text,
  action text not null,
  entity_type text not null,
  entity_id text,
  data jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id);
create index audit_logs_created_idx on audit_logs (created_at desc);
create trigger audit_logs_immutable before update or delete on audit_logs
  for each row execute function forbid_mutation();

-- ---------------------------------------------------------------------------
-- Rate limiting (fixed window, portable across instances)
-- ---------------------------------------------------------------------------
create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);
create index rate_limits_window_idx on rate_limits (window_start);

-- ---------------------------------------------------------------------------
-- Durable job queue
-- ---------------------------------------------------------------------------
create table jobs (
  id bigint generated always as identity primary key,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','running','completed','failed','dead','cancelled')),
  run_at timestamptz not null default now(),
  attempts int not null default 0 check (attempts >= 0),
  max_attempts int not null default 5 check (max_attempts between 1 and 50),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index jobs_ready_idx on jobs (run_at) where status = 'pending';
create index jobs_running_idx on jobs (locked_at) where status = 'running';
create index jobs_status_idx on jobs (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Outbound notifications log (email/SMS). "accepted" = provider accepted;
-- "delivered" is only set from a provider delivery receipt.
-- ---------------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email','sms')),
  recipient text not null,
  template_key text not null,
  subject text,
  status text not null default 'queued'
    check (status in ('queued','sending','accepted','delivered','failed','bounced','suppressed','skipped')),
  provider text,
  provider_message_id text,
  error text,
  related_type text,
  related_id text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz
);
create index notifications_created_idx on notifications (created_at desc);
create index notifications_related_idx on notifications (related_type, related_id);

create table email_templates (
  key text primary key,
  subject text not null check (length(subject) <= 300),
  body text not null check (length(body) <= 50000),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id) on delete set null
);
create trigger email_templates_updated before update on email_templates
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Media library. Binary files live in object storage (R2), never in Postgres.
-- ---------------------------------------------------------------------------
create table media_assets (
  id uuid primary key default gen_random_uuid(),
  storage_key text not null unique,
  visibility text not null check (visibility in ('public','private')),
  filename text not null check (length(filename) <= 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  width int,
  height int,
  sha256 text not null,
  alt_text text not null default '' check (length(alt_text) <= 500),
  category text not null default 'general',
  variants jsonb not null default '[]'::jsonb,
  uploaded_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index media_assets_sha_unique on media_assets (sha256, visibility) where deleted_at is null;
create index media_assets_created_idx on media_assets (created_at desc) where deleted_at is null;
create index media_assets_search_idx on media_assets using gin (to_tsvector('simple', filename || ' ' || alt_text));

-- External integration credentials (encrypted at application level).
create table integrations (
  provider text primary key check (provider in ('google_calendar','zoom')),
  status text not null default 'disconnected' check (status in ('connected','disconnected','error')),
  credentials_encrypted text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create trigger integrations_updated before update on integrations
  for each row execute function set_updated_at();
