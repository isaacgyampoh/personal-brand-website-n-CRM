-- Services, availability and appointments.
-- Double-booking protection is enforced by an exclusion constraint: active
-- appointments whose blocked ranges overlap must belong to the same slot group
-- (same group-session slot). One-to-one appointments use their own id as slot
-- group, so any overlap is rejected by the database. Group slot capacity is
-- enforced by a trigger that serialises on the service row.

create table services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 150),
  category text not null default 'coaching',
  summary text not null default '' check (length(summary) <= 500),
  description jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  image_media_id uuid references media_assets(id) on delete set null,
  price_minor bigint not null default 0 check (price_minor >= 0),
  currency char(3) not null default 'GHS',
  price_display text not null default '' check (length(price_display) <= 80),
  duration_minutes int not null check (duration_minutes between 10 and 600),
  buffer_before_minutes int not null default 0 check (buffer_before_minutes between 0 and 240),
  buffer_after_minutes int not null default 15 check (buffer_after_minutes between 0 and 240),
  slot_interval_minutes int not null default 30 check (slot_interval_minutes between 5 and 240),
  min_notice_minutes int not null default 720 check (min_notice_minutes >= 0),
  max_advance_days int not null default 60 check (max_advance_days between 1 and 365),
  capacity int not null default 1 check (capacity between 1 and 500),
  booking_mode text not null default 'instant' check (booking_mode in ('instant','enquiry','none')),
  location_type text not null default 'online' check (location_type in ('online','in_person','phone')),
  location_details text not null default '',
  meeting_provider text not null default 'manual' check (meeting_provider in ('manual','zoom','google_meet')),
  default_meeting_url text check (default_meeting_url is null or default_meeting_url ~ '^https://'),
  cancel_cutoff_hours int not null default 24 check (cancel_cutoff_hours >= 0),
  reschedule_cutoff_hours int not null default 24 check (reschedule_cutoff_hours >= 0),
  max_reschedules int not null default 2 check (max_reschedules >= 0),
  refund_on_cancel boolean not null default true,
  cancellation_policy text not null default '',
  is_active boolean not null default true,
  featured boolean not null default false,
  sort_order int not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger services_updated before update on services
  for each row execute function set_updated_at();

-- Weekly working hours in business-local time. service_id null = applies to all.
create table availability_rules (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references services(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index availability_rules_service_idx on availability_rules (service_id);

create table availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references services(id) on delete cascade,
  kind text not null check (kind in ('blocked','holiday','extra_hours')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index availability_exceptions_range_idx on availability_exceptions using gist (tstzrange(starts_at, ends_at));

create table appointments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  service_id uuid not null references services(id),
  contact_id uuid not null references contacts(id),
  user_id uuid references users(id) on delete set null,
  order_id uuid references orders(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  block_range tstzrange not null,
  slot_group text not null,
  status text not null check (status in ('pending_payment','confirmed','cancelled','completed','no_show','expired')),
  hold_expires_at timestamptz,
  customer_timezone text not null default 'Africa/Accra',
  customer_notes text not null default '' check (length(customer_notes) <= 2000),
  internal_notes text not null default '',
  meeting_url text check (meeting_url is null or meeting_url ~ '^https://'),
  meeting_details text not null default '',
  calendar_event_id text,
  reschedule_count int not null default 0,
  cancelled_at timestamptz,
  cancelled_by text check (cancelled_by in ('customer','admin','system')),
  cancel_reason text,
  manage_token_hash text unique,
  reminder_24h_sent_at timestamptz,
  reminder_1h_sent_at timestamptz,
  follow_up_sent_at timestamptz,
  created_by_admin uuid references users(id) on delete set null,
  attribution jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (block_range @> tstzrange(starts_at, ends_at)),
  check (status <> 'pending_payment' or hold_expires_at is not null),
  constraint appointments_no_overlap exclude using gist (
    block_range with &&,
    slot_group with <>
  ) where (status in ('pending_payment','confirmed'))
);
create index appointments_starts_idx on appointments (starts_at) where status in ('pending_payment','confirmed');
create index appointments_contact_idx on appointments (contact_id, starts_at desc);
create index appointments_user_idx on appointments (user_id, starts_at desc);
create index appointments_order_idx on appointments (order_id);
create trigger appointments_updated before update on appointments
  for each row execute function set_updated_at();

create or replace function enforce_appointment_capacity() returns trigger
language plpgsql as $$
declare cap int; used int;
begin
  if new.status not in ('pending_payment','confirmed') then return new; end if;
  select capacity into cap from services where id = new.service_id for update;
  if cap <= 1 then return new; end if; -- exclusion constraint covers 1:1
  select count(*) into used from appointments
   where service_id = new.service_id and slot_group = new.slot_group and id <> new.id
     and (status = 'confirmed' or (status = 'pending_payment' and hold_expires_at > now()));
  if used + 1 > cap then
    raise exception 'SLOT_FULL' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger appointments_capacity before insert or update of status, slot_group on appointments
  for each row execute function enforce_appointment_capacity();
