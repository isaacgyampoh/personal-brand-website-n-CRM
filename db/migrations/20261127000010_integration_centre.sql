-- Integration Centre, administrator MFA / recent authentication, Hubtel,
-- meeting automation and media enhancements.

-- ---------------------------------------------------------------------------
-- Integration configuration (credentials encrypted with an external master key)
-- ---------------------------------------------------------------------------
create table integration_configs (
  provider text primary key
    check (provider in ('paystack','hubtel','google','zoom','smtp','r2','mnotify','ai')),
  enabled boolean not null default false,
  mode text not null default 'test' check (mode in ('test','live')),
  -- Non-secret settings, e.g. {"currency":"GHS","test.publicKey":"pk_test_…"}
  settings jsonb not null default '{}'::jsonb,
  -- AES-256-GCM ciphertext of a JSON object of secret fields; never sent to browsers.
  secrets_encrypted text,
  key_version int,
  -- Masked hints for display, e.g. {"test.secretKey":"sk_test_••••1a2b"}
  secret_hints jsonb not null default '{}'::jsonb,
  -- Hash of the configuration that last passed a connection test. A status of
  -- "connected" is only shown when this matches the current configuration.
  verified_hash text,
  last_tested_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id) on delete set null
);
create trigger integration_configs_updated before update on integration_configs
  for each row execute function set_updated_at();
alter table integration_configs enable row level security;
revoke all on integration_configs from public;

-- The earlier OAuth-token table is superseded by integration_configs.
drop table if exists integrations;

-- ---------------------------------------------------------------------------
-- Authentication: MFA and recent-authentication for sensitive changes
-- ---------------------------------------------------------------------------
alter table users add column mfa_recovery_codes jsonb not null default '[]'::jsonb;
-- Last accepted TOTP time-step: a code can never be replayed.
alter table users add column mfa_last_step bigint;
alter table sessions add column mfa_pending boolean not null default false;
alter table sessions add column reauthenticated_at timestamptz;
alter table sessions add column last_seen_at timestamptz;

-- ---------------------------------------------------------------------------
-- Payments: Hubtel as an alternative provider
-- ---------------------------------------------------------------------------
alter table payments drop constraint payments_provider_check;
alter table payments add constraint payments_provider_check check (provider in ('paystack','hubtel','manual'));
alter table payments add column provider_mode text check (provider_mode in ('test','live'));

-- ---------------------------------------------------------------------------
-- Meetings: provider-created meetings for appointments and events
-- ---------------------------------------------------------------------------
alter table appointments add column meeting_provider text check (meeting_provider in ('manual','zoom','google_meet','in_person'));
alter table appointments add column meeting_external_id text;
alter table event_access add column meeting_external_id text;
alter table event_access add column calendar_event_id text;
alter table event_access drop constraint event_access_meeting_provider_check;
alter table event_access add constraint event_access_meeting_provider_check check (meeting_provider in ('manual','zoom','google_meet','none'));

-- Busy periods from the connected Google Calendar (refreshed by the worker).
create table external_busy (
  id bigint generated always as identity primary key,
  source text not null default 'google',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index external_busy_range_idx on external_busy using gist (tstzrange(starts_at, ends_at));
alter table external_busy enable row level security;
revoke all on external_busy from public;

-- ---------------------------------------------------------------------------
-- Media: focal point for responsive cropping
-- ---------------------------------------------------------------------------
alter table media_assets add column focal_x numeric(5,4) not null default 0.5 check (focal_x between 0 and 1);
alter table media_assets add column focal_y numeric(5,4) not null default 0.5 check (focal_y between 0 and 1);
alter table media_assets add column derived_from uuid references media_assets(id) on delete set null;
